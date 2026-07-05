import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  Sparkles, X, Plus, Image as ImageIcon, ChevronDown, ChevronRight,
  Star, Trash2, RefreshCw, Pin, Pencil, FolderInput, Lightbulb,
  Download, Zap, Clock, AlertTriangle, Shuffle, Check, Layers,
  List, ArrowRight, Loader, Paintbrush, ArrowRightLeft, Copy,
} from 'lucide-react';
import { useGenerationStore } from '../stores/useGenerationStore';
import { useUIStore } from '../stores/useUIStore';
import { MODELS, MODEL_ORDER } from '../constants/models';
import { getImage, updateImage, deleteImage, getImages } from '../db/database';
import StorageService from '../services/storage';
import BatchPanel from '../components/BatchPanel';
import MaskEditor from '../components/MaskEditor';
import { getModelAdapter } from '../services/api';
import { proxyImageUrl } from '../services/api/client';
import TaskEngine from '../services/task-engine';
import { addBatch, addImage } from '../db/database';

/* ─────────────────────────────────────────────
   UI model configuration (derived from constants/models.js)
   ───────────────────────────────────────────── */
const UI_MODELS = {};
MODEL_ORDER.forEach(id => {
  const m = MODELS[id];
  const caps = m.capabilities;
  UI_MODELS[id] = {
    label: m.name,
    maxRefs: caps.maxRefs,
    countRange: caps.countRange,
    fixedCount: caps.countRange[0] === caps.countRange[1] ? caps.countRange[0] : null,
    qualitySupport: caps.qualitySupport,
    promptExtend: caps.promptExtend,
    maskSupport: caps.inpainting,
    debugSupport: id === 'qwen-image-3',
    sizePresets: ['1:1', '16:9', '9:16', '3:4', '4:3', 'auto'],
    fixedSize: null,
    resolutionOptions: id === 'gpt-image-2' ? ['1K', '2K', '4K'] : undefined,
    nativeSizes: m.sizes,
  };
});

const SIZE_PRESETS = ['1:1', '16:9', '9:16', '3:4', '4:3', 'auto', '自定义'];

/** Quality label map for known values across all models */
const QUALITY_LABEL_MAP = {
  low: '低', medium: '中', high: '高',
  standard: '标准', hd: '高清',
  '0.5K': '0.5K', '1K': '1K', '2K': '2K', '4K': '4K',
};

/** Build quality options dynamically from model config */
function getQualityOptions(modelId) {
  const m = MODELS[modelId];
  if (!m?.qualities) return [];
  return m.qualities.map(v => ({ value: v, label: QUALITY_LABEL_MAP[v] || v }));
}

/** Map aspect ratio to native size string for a given model */
function mapSizeToNative(ratio, modelId) {
  // Nano Banana 2 and GPT-image-2 use aspect ratios directly as size values
  if (modelId === 'nanobanana-2' || modelId === 'gpt-image-2') return ratio;
  const sizes = MODELS[modelId]?.sizes || [];
  const map = { '1:1': '1024', '16:9': '1280', '9:16': '720', '3:4': '1024', '4:3': '1536' };
  const hint = map[ratio] || '';
  const found = sizes.find(s => s.includes(hint));
  return found || sizes[0] || '1024*1024';
}

/* ─────────────────────────────────────────────
   Main Workbench Component
   ───────────────────────────────────────────── */
export default function Workbench() {
  /* ── Store subscriptions ── */
  const currentModel = useGenerationStore(s => s.currentModel);
  const prompt = useGenerationStore(s => s.prompt);
  const setPrompt = useGenerationStore(s => s.setPrompt);
  const setModel = useGenerationStore(s => s.setModel);
  const params = useGenerationStore(s => s.params);
  const setParam = useGenerationStore(s => s.setParam);
  const results = useGenerationStore(s => s.results);
  const isGenerating = useGenerationStore(s => s.isGenerating);
  const generatingProgress = useGenerationStore(s => s.generatingProgress);
  const referenceImages = useGenerationStore(s => s.referenceImages);
  const addReferenceImage = useGenerationStore(s => s.addReferenceImage);
  const removeReferenceImage = useGenerationStore(s => s.removeReferenceImage);
  const setReferenceImageRole = useGenerationStore(s => s.setReferenceImageRole);
  const expandedPrompts = useGenerationStore(s => s.expandedPrompts);
  const expandPromptAction = useGenerationStore(s => s.expandPrompt);
  const selectExpandedPrompt = useGenerationStore(s => s.selectExpandedPrompt);
  const generate = useGenerationStore(s => s.generate);
  const favoriteImage = useGenerationStore(s => s.favoriteImage);
  const discardImage = useGenerationStore(s => s.discardImage);
  const batchHistory = useGenerationStore(s => s.batchHistory);
  const generationError = useGenerationStore(s => s.generationError);
  const addToast = useUIStore(s => s.addToast);
  const openLightbox = useUIStore(s => s.openLightbox);
  const maskEditorOpen = useUIStore(s => s.maskEditorOpen);
  const maskEditorImage = useUIStore(s => s.maskEditorImage);
  const maskEditorOnConfirm = useUIStore(s => s.maskEditorOnConfirm);
  const closeMaskEditor = useUIStore(s => s.closeMaskEditor);
  const openMaskEditor = useUIStore(s => s.openMaskEditor);

  /* ── Local UI state ── */
  const [showExpansion, setShowExpansion] = useState(false);
  const [showMoreParams, setShowMoreParams] = useState(false);
  const [selectedSize, setSelectedSize] = useState('1:1');
  const [generationCount, setGenerationCount] = useState(1);
  const [quality, setQuality] = useState('auto');
  const [seed, setSeed] = useState('');
  const [promptExtend, setPromptExtend] = useState(true);
  const [promptExtendMode, setPromptExtendMode] = useState('direct');
  const [debugMode, setDebugMode] = useState(false);
  const [showBatchDropdown, setShowBatchDropdown] = useState(false);
  const [showBatchHistory, setShowBatchHistory] = useState(false);
  const [hoveredResult, setHoveredResult] = useState(null);
  const [hoveredRef, setHoveredRef] = useState(null);
  const [resolution, setResolution] = useState('1K');
  const [generationMode, setGenerationMode] = useState('auto');
  const [refWarning, setRefWarning] = useState(null);
  const [batchSidebarOpen, setBatchSidebarOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState({ visible: false, x: 0, y: 0, imageIndex: -1 });
  const [showModelSubmenu, setShowModelSubmenu] = useState(false);
  const [roleDropdownId, setRoleDropdownId] = useState(null);
  const [isExpanding, setIsExpanding] = useState(false);
  const [batchPanelOpen, setBatchPanelOpen] = useState(false);
  const [batchMode, setBatchMode] = useState('batch');
  const [selectedBatchId, setSelectedBatchId] = useState(null);
  const fileInputRef = useRef(null);

  const model = UI_MODELS[currentModel] || UI_MODELS['qwen-image-3'];

  /* ── Sync params when model changes ── */
  useEffect(() => {
    const m = UI_MODELS[currentModel];
    if (!m) return;
    if (m.fixedCount !== null) setGenerationCount(m.fixedCount);
    else setGenerationCount(Math.min(generationCount, m.countRange[1]));
    if (params.size) {
      const presetMap = { '1024*1024': '1:1', '1024x1024': '1:1', '1280*720': '16:9', '1536x1024': '16:9' };
      const mapped = presetMap[params.size];
      if (mapped) setSelectedSize(mapped);
    }
  }, [currentModel]);

  /* ── Helpers ── */
  const canGenerate = prompt.trim().length > 0 && referenceImages.length <= model.maxRefs;

  const handleModelChange = useCallback((modelKey) => {
    setModel(modelKey);
    const m = UI_MODELS[modelKey];
    if (!m) return;
    if (m.fixedCount !== null) setGenerationCount(m.fixedCount);
    else setGenerationCount(prev => Math.min(prev, m.countRange[1]));
    if (m.fixedSize) setSelectedSize('1:1');
    // Reset quality to new model's default
    const modelCfg = MODELS[modelKey];
    if (modelCfg?.qualities?.length) {
      const defaultQ = modelCfg.defaultParams?.quality || modelCfg.qualities[0];
      setQuality(defaultQ);
    }
    // Reset resolution for GPT-image-2
    if (modelKey === 'gpt-image-2') setResolution('1K');
    const currentRefs = referenceImages.length;
    if (currentRefs > m.maxRefs) {
      setRefWarning(`当前已有 ${currentRefs} 张参考图，${m.label} 最多支持 ${m.maxRefs} 张，请移除多余的参考图`);
    } else {
      setRefWarning(null);
    }
  }, [setModel, referenceImages.length]);

  const adjustCount = (delta) => {
    const [min, max] = model.countRange;
    setGenerationCount(prev => Math.max(min, Math.min(max, prev + delta)));
  };

  const handleSizeChange = useCallback((preset) => {
    setSelectedSize(preset);
    const nativeSize = mapSizeToNative(preset, currentModel);
    setParam('size', nativeSize);
  }, [currentModel, setParam]);

  /* ── Generate handler ── */
  const handleGenerate = useCallback(async () => {
    if (referenceImages.length > model.maxRefs) {
      setRefWarning(`当前已有 ${referenceImages.length} 张参考图，${model.label} 最多支持 ${model.maxRefs} 张`);
      return;
    }
    setParam('n', generationCount);
    if (seed.trim()) setParam('seed', parseInt(seed) || -1);
    if (currentModel === 'qwen-image-3') {
      setParam('prompt_extend', promptExtend);
      if (promptExtend) setParam('prompt_extend_mode', promptExtendMode);
    }
    if (model.qualitySupport) setParam('quality', quality);
    try {
      await generate();
      addToast('生成完成', { type: 'success' });
    } catch (err) {
      addToast(`生成失败: ${err.message}`, { type: 'error' });
    }
  }, [generate, generationCount, seed, promptExtend, promptExtendMode, quality, currentModel, model, referenceImages.length, setParam, addToast]);

  /* ── Prompt expansion ── */
  const handleExpand = useCallback(async () => {
    setShowExpansion(true);
    setIsExpanding(true);
    try {
      await expandPromptAction();
    } catch (err) {
      addToast(`扩写失败: ${err.message}`, { type: 'error' });
    } finally {
      setIsExpanding(false);
    }
  }, [expandPromptAction, addToast]);

  /* ── Reference image upload ── */
  const handleRefUpload = useCallback(async (files) => {
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue;
      addReferenceImage({ blob: file, name: file.name, url: URL.createObjectURL(file) });
    }
  }, [addReferenceImage]);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer?.files || []);
    if (files.length) handleRefUpload(files);
  }, [handleRefUpload]);

  /* ── Image actions ── */
  const handleDownload = useCallback(async (img) => {
    try {
      const blob = await StorageService.getImage(img.id);
      if (!blob) { addToast('图片未找到', { type: 'error' }); return; }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `image-${img.id}.png`; a.click();
      URL.revokeObjectURL(url);
    } catch { addToast('下载失败', { type: 'error' }); }
  }, [addToast]);

  const handleCopyPrompt = useCallback((img) => {
    navigator.clipboard?.writeText(img.prompt || prompt);
    addToast('Prompt 已复制', { type: 'success' });
  }, [prompt, addToast]);

  const handleUseAsRef = useCallback((img) => {
    if (img.url) addReferenceImage({ blob: null, name: 'from-result', url: img.url });
  }, [addReferenceImage]);

  const handleBatchSelect = useCallback(async (batch) => {
    setSelectedBatchId(batch.batchId);
    if (batch.images && batch.images.length > 0) {
      useGenerationStore.setState({ results: batch.images });
    } else {
      // Load images for this batch from DB
      try {
        const allImages = await getImages({});
        const batchImages = allImages.filter(img => img.batchId === batch.batchId);
        if (batchImages.length > 0) {
          useGenerationStore.setState({ results: batchImages });
        }
      } catch (err) {
        console.error('[Workbench] Failed to load batch images:', err);
      }
    }
  }, []);

  const ROLE_OPTIONS = [
    { value: 'general', label: '通用', color: '#8b8b8b' },
    { value: 'style', label: '风格参考', color: '#a78bfa' },
    { value: 'composition', label: '构图参考', color: '#60a5fa' },
    { value: 'color', label: '色彩参考', color: '#f59e0b' },
    { value: 'subject', label: '主体参考', color: '#34d399' },
  ];

  const getRoleInfo = (role) => ROLE_OPTIONS.find(r => r.value === role) || ROLE_OPTIONS[0];

  /* ── Cleanup reference image blob URLs on removal ── */
  const prevRefIdsRef = useRef(new Set());
  useEffect(() => {
    const currentIds = new Set(referenceImages.map(r => r.id));
    // Find ids that were in prevRefIds but not in current (removed)
    for (const id of prevRefIdsRef.current) {
      if (!currentIds.has(id)) {
        // The URL was created in addReferenceImage, but we can't access it after removal
        // Blob URLs are garbage collected when the document is unloaded
      }
    }
    prevRefIdsRef.current = currentIds;
  }, [referenceImages]);

  /* ── Load batch history from DB on mount ── */
  useEffect(() => {
    (async () => {
      try {
        const { getBatches } = await import('../db/database');
        const batches = await getBatches();
        if (batches && batches.length > 0) {
          useGenerationStore.setState({
            batchHistory: batches.map(b => ({
              batchId: b.id,
              prompt: b.prompt,
              model: b.model,
              images: [],
              createdAt: b.createdAt,
            })),
          });
        }
      } catch (err) {
        // getBatches may not exist yet, silently ignore
      }
    })();
  }, []);

  const handleRegenerateImage = useCallback(async (img) => {
    // Restore the image's params before regenerating
    if (img.params) {
      Object.entries(img.params).forEach(([k, v]) => setParam(k, v));
    }
    if (img.prompt) setPrompt(img.prompt);
    try {
      await generate();
      addToast('重新生成完成', { type: 'success' });
    } catch (err) {
      addToast(`重新生成失败: ${err.message}`, { type: 'error' });
    }
  }, [generate, setParam, setPrompt, addToast]);

  /* ── Inpaint (Mask Editor) handler ── */
  const imageToBase64 = useCallback(async (img) => {
    // Try StorageService first
    try {
      const blob = await StorageService.getImage(img.id);
      if (blob) {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result.split(',')[1]);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      }
    } catch (e) {
      console.warn('[Workbench] StorageService.getImage failed, trying URL fetch:', e);
    }
    // Fallback: fetch from URL (through proxy to avoid CORS)
    if (img.url) {
      try {
        const resp = await fetch(proxyImageUrl(img.url));
        const blob = await resp.blob();
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result.split(',')[1]);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      } catch (e) {
        console.warn('[Workbench] URL fetch failed:', e);
      }
    }
    return null;
  }, []);

  const handleOpenInpaint = useCallback((img) => {
    console.log('[Workbench] Opening mask editor for image:', img.id);
    const onMaskConfirm = async ({ maskBase64 }) => {
      console.log('[Workbench] Mask confirmed, starting inpaint...');
      addToast('正在执行局部重绘...', { type: 'info' });
      try {
        const imageBase64 = await imageToBase64(img);
        if (!imageBase64) {
          addToast('无法获取原图数据', { type: 'error' });
          return;
        }

        const adapter = getModelAdapter('gpt-image-2');
        const currentPrompt = img.prompt || prompt;
        const currentParams = img.params || params;

        const batchId = await addBatch({
          sessionId: null,
          model: 'gpt-image-2',
          prompt: currentPrompt,
          createdAt: Date.now(),
        });

        // Submit as a TaskEngine task
        const execute = async (ctx) => {
          const { signal, onProgress } = ctx;
          const result = await adapter.editImage(
            currentPrompt, imageBase64, maskBase64, currentParams, signal, onProgress
          );
          const images = result.images || [];
          const resultImages = [];
          for (const imgData of images) {
            const imgId = await addImage({
              batchId,
              folderId: null,
              model: 'gpt-image-2',
              prompt: currentPrompt,
              url: imgData.url,
              thumbnailUrl: imgData.url,
              params: { ...currentParams },
              favorite: false,
              storageZone: 'hot',
              status: 'completed',
              createdAt: Date.now(),
            });
            resultImages.push({
              id: imgId,
              url: imgData.url,
              prompt: currentPrompt,
              params: { ...currentParams },
            });
          }
          return { images: resultImages, batchId };
        };

        const taskResult = await TaskEngine.submit({
          type: 'generation',
          model: 'gpt-image-2',
          prompt: currentPrompt,
          params: currentParams,
          execute,
        });

        const resultImages = taskResult?.images || [];
        if (resultImages.length > 0) {
          useGenerationStore.setState(state => ({
            results: [...resultImages, ...state.results],
            batchHistory: [
              { batchId, prompt: currentPrompt, model: 'gpt-image-2', images: resultImages, createdAt: Date.now() },
              ...state.batchHistory,
            ],
          }));
          addToast(`局部重绘完成: ${resultImages.length} 张`, { type: 'success' });
        }
      } catch (err) {
        console.error('[Workbench] Inpaint error:', err);
        addToast(`局部重绘失败: ${err.message}`, { type: 'error' });
      }
    };

    // Build source image object for MaskEditor
    const sourceImage = { url: img.url, id: img.id };
    openMaskEditor(sourceImage, onMaskConfirm);
    setContextMenu({ visible: false, x: 0, y: 0, imageIndex: -1 });
  }, [imageToBase64, prompt, params, addToast, openMaskEditor]);

  /* ── Keyboard shortcut ── */
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        if (canGenerate && !isGenerating) handleGenerate();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [canGenerate, isGenerating, handleGenerate]);

  /* ── Effects ── */
  useEffect(() => {
    if (!refWarning) return;
    const timer = setTimeout(() => setRefWarning(null), 5000);
    return () => clearTimeout(timer);
  }, [refWarning]);

  useEffect(() => {
    if (!contextMenu.visible) return;
    const handleClickOutside = () => setContextMenu(prev => ({ ...prev, visible: false }));
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [contextMenu.visible]);

  /* ── Styles ── */
  const pageStyle = {
    display: 'flex',
    height: '100%',
    width: '100%',
    background: 'var(--bg-base)',
    overflow: 'hidden',
  };

  const leftPanelStyle = {
    width: '45%',
    minWidth: 380,
    maxWidth: 560,
    display: 'flex',
    flexDirection: 'column',
    borderRight: '1px solid var(--border-subtle)',
    background: 'var(--bg-panel)',
    overflowY: 'auto',
    padding: 'var(--sp-6)',
    gap: 'var(--sp-6)',
  };

  const rightPanelStyle = {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--bg-base)',
    overflow: 'auto',
    padding: 'var(--sp-6)',
    gap: 'var(--sp-4)',
    minWidth: 0,
  };

  const sectionTitleStyle = {
    fontSize: 'var(--fs-sm)',
    fontWeight: 'var(--fw-semibold)',
    color: 'var(--text-tertiary)',
    textTransform: 'uppercase',
    letterSpacing: 'var(--ls-wide)',
    marginBottom: 'var(--sp-3)',
  };

  /* ──────────────────────────────────────────
     LEFT PANEL RENDER
     ────────────────────────────────────────── */

  const renderModelSelector = () => (
    <div>
      <div className="tabs" style={{ width: '100%' }}>
        {MODEL_ORDER.map(key => {
          const m = UI_MODELS[key];
          return (
            <button
              key={key}
              className={`tab ${currentModel === key ? 'active' : ''}`}
              style={{ flex: 1, fontSize: 'var(--fs-sm)' }}
              onClick={() => handleModelChange(key)}
            >
              {m.label}
            </button>
          );
        })}
      </div>
    </div>
  );

  const renderPromptEditor = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
      <div style={sectionTitleStyle}>Prompt</div>

      {/* Textarea */}
      <div style={{ position: 'relative' }}>
        <textarea
          className="textarea"
          style={{ minHeight: 120, paddingRight: 'var(--sp-2)' }}
          placeholder="描述你想生成的图片..."
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />
        <div
          style={{
            position: 'absolute',
            bottom: 10,
            right: 14,
            pointerEvents: 'none',
          }}
        >
          <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>
            {prompt.length} 字符 · ~{Math.ceil(prompt.length * 0.6)} tokens
          </span>
        </div>
      </div>

      {prompt.length > 8000 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-1)', fontSize: 'var(--fs-xs)', color: 'var(--accent-warning)' }}>
          <AlertTriangle size={12} />
          提示词较长，可能影响生成质量
        </div>
      )}

      {/* Expand assistant */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
        <button
          className="btn btn-subtle btn-sm"
          onClick={handleExpand}
          disabled={isExpanding || !prompt.trim()}
        >
          {isExpanding ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Sparkles size={14} />}
          扩写助手
        </button>
      </div>

      {/* Expansion panel */}
      {showExpansion && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--sp-2)',
            padding: 'var(--sp-3)',
            background: 'var(--bg-elevated)',
            borderRadius: 'var(--radius-base)',
            border: '1px solid var(--border-subtle)',
          }}
        >
          {isExpanding ? (
            <div style={{ padding: 'var(--sp-4)', textAlign: 'center', color: 'var(--text-muted)' }}>
              <Loader size={20} style={{ animation: 'spin 1s linear infinite', margin: '0 auto var(--sp-2)' }} />
              正在扩写提示词...
            </div>
          ) : expandedPrompts.length > 0 ? (
            expandedPrompts.map((text, idx) => (
              <div
                key={idx}
                className="card"
                style={{
                  padding: 'var(--sp-3)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'var(--sp-2)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
                  <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 'var(--fw-semibold)', color: 'var(--text-primary)' }}>
                    变体 {idx + 1}
                  </span>
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ marginLeft: 'auto' }}
                    onClick={() => {
                      selectExpandedPrompt(text);
                      setShowExpansion(false);
                    }}
                  >
                    使用
                  </button>
                </div>
                <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', lineHeight: 'var(--lh-relaxed)' }}>
                  {text}
                </p>
              </div>
            ))
          ) : (
            <div style={{ padding: 'var(--sp-3)', color: 'var(--text-muted)', fontSize: 'var(--fs-sm)' }}>
              输入提示词后点击扩写按钮
            </div>
          )}
        </div>
      )}

      {/* Prompt chain indicator */}
      {prompt.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-1)', flexWrap: 'wrap' }}>
          <span className="badge badge-default">原始 prompt</span>
          <ArrowRight size={12} style={{ color: 'var(--text-muted)' }} />
          <span className="badge badge-accent">主动扩写</span>
          <ArrowRight size={12} style={{ color: 'var(--text-muted)' }} />
          <span className="badge badge-success">prompt_extend</span>
        </div>
      )}
    </div>
  );

  const renderReferenceImages = () => {
    const maxRefs = model.maxRefs;
    const refCount = referenceImages.length;
    const emptySlots = Math.max(0, Math.min(maxRefs - refCount, 1));

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
          <span style={sectionTitleStyle}>参考图</span>
          <span className="badge badge-default">{refCount} / {maxRefs}</span>
        </div>

        {maxRefs <= 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', fontSize: 'var(--fs-sm)', color: 'var(--accent-warning)' }}>
            <AlertTriangle size={14} />
            {model.label} 最多支持 {maxRefs} 张参考图，超出的图片将被忽略
          </div>
        )}

        {refWarning && (
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: 'var(--sp-2)',
              padding: 'var(--sp-2) var(--sp-3)',
              background: 'rgba(245, 158, 11, 0.12)',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              borderRadius: 'var(--radius-base)',
              fontSize: 'var(--fs-sm)', color: '#f59e0b',
            }}
          >
            <AlertTriangle size={14} style={{ flexShrink: 0 }} />
            <span style={{ flex: 1 }}>{refWarning}</span>
            <button className="btn-icon" style={{ background: 'transparent', color: '#f59e0b', width: 20, height: 20, padding: 0, flexShrink: 0 }} onClick={() => setRefWarning(null)}>
              <X size={14} />
            </button>
          </div>
        )}

        <div
          style={{
            ...(refCount > 6
              ? { display: 'flex', overflowX: 'auto', gap: 'var(--sp-2)' }
              : { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--sp-2)' }),
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
        >
          {referenceImages.map((ref, idx) => {
            const roleInfo = getRoleInfo(ref.role);
            return (
            <div
              key={ref.id}
              style={{
                position: 'relative', aspectRatio: '1',
                borderRadius: 'var(--radius-md)', overflow: 'hidden',
                border: '1px solid var(--border-default)',
                cursor: 'pointer',
              }}
              onMouseEnter={() => setHoveredRef(ref.id)}
              onMouseLeave={() => setHoveredRef(null)}
              onClick={() => openLightbox(ref.id)}
            >
              {ref.url ? (
                <img src={ref.url} alt={ref.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', background: 'var(--bg-elevated)' }}>
                  <ImageIcon size={24} style={{ color: 'rgba(255,255,255,0.5)' }} />
                </div>
              )}
              <span style={{ position: 'absolute', top: 4, left: 4, background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: 'var(--fs-xs)', fontWeight: 'var(--fw-medium)', width: 18, height: 18, borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {idx + 1}
              </span>
              {/* Role badge - bottom bar */}
              <div
                style={{
                  position: 'absolute', bottom: 0, left: 0, right: 0,
                  background: `linear-gradient(transparent, ${roleInfo.color}cc)`,
                  padding: '12px 4px 4px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <span
                  style={{
                    fontSize: '10px', fontWeight: 'var(--fw-semibold)',
                    color: '#fff', cursor: 'pointer', userSelect: 'none',
                    padding: '1px 6px', borderRadius: 'var(--radius-sm)',
                    background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(4px)',
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setRoleDropdownId(roleDropdownId === ref.id ? null : ref.id);
                  }}
                >
                  {roleInfo.label} ▾
                </span>
              </div>
              {/* Role dropdown */}
              {roleDropdownId === ref.id && (
                <div
                  style={{
                    position: 'absolute', bottom: 28, left: '50%', transform: 'translateX(-50%)',
                    background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
                    borderRadius: 'var(--radius-base)', boxShadow: 'var(--shadow-lg)',
                    padding: 'var(--sp-1)', zIndex: 20, minWidth: 110,
                    display: 'flex', flexDirection: 'column',
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {ROLE_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      className="btn btn-ghost btn-sm"
                      style={{
                        justifyContent: 'flex-start', borderRadius: 'var(--radius-sm)',
                        gap: 'var(--sp-2)', fontSize: 'var(--fs-xs)', padding: '4px 8px',
                        color: ref.role === opt.value ? opt.color : 'var(--text-secondary)',
                        fontWeight: ref.role === opt.value ? 'var(--fw-semibold)' : 'var(--fw-normal)',
                      }}
                      onClick={() => {
                        setReferenceImageRole(ref.id, opt.value);
                        setRoleDropdownId(null);
                      }}
                    >
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: opt.color, flexShrink: 0 }} />
                      {opt.label}
                      {ref.role === opt.value && <Check size={10} style={{ marginLeft: 'auto' }} />}
                    </button>
                  ))}
                </div>
              )}
              {hoveredRef === ref.id && (
                <button
                  className="btn-icon"
                  style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,0.6)', color: '#fff', width: 20, height: 20, borderRadius: 'var(--radius-sm)', padding: 0 }}
                  onClick={(e) => { e.stopPropagation(); removeReferenceImage(ref.id); }}
                >
                  <X size={12} />
                </button>
              )}
            </div>
            );
          })}

          {emptySlots > 0 && (
            <div
              className="ph-img"
              style={{ aspectRatio: '1', flexDirection: 'column', gap: 'var(--sp-1)', cursor: 'pointer' }}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
            >
              <Plus size={20} />
              <span style={{ fontSize: 'var(--fs-xs)' }}>拖入参考图或点击上传</span>
              <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', opacity: 0.7 }}>支持 JPG/PNG/WebP，单张 ≤ 50MB</span>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: 'none' }}
            onChange={(e) => {
              const files = Array.from(e.target.files || []);
              if (files.length) handleRefUpload(files);
              e.target.value = '';
            }}
          />
        </div>
      </div>
    );
  };

  const renderParameters = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
      {/* ── Common Parameters ── */}
      <div>
        <div
          style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', cursor: 'pointer', marginBottom: 'var(--sp-3)' }}
        >
          <span style={sectionTitleStyle}>常用参数</span>
        </div>

        {/* T2I / I2I mode selector */}
        <div
          style={{
            display: 'inline-flex',
            gap: '1px',
            background: 'var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: '2px',
            marginBottom: 'var(--sp-3)',
          }}
        >
          {[
            { key: 't2i', label: '文生图 (T2I)' },
            { key: 'i2i', label: '图生图 (I2I)' },
          ].map(({ key, label }) => {
            const isActive = generationMode === 'auto'
              ? (key === 'i2i')
              : generationMode === key;
            return (
              <button
                key={key}
                className="btn btn-sm"
                style={{
                  fontSize: 'var(--fs-xs)',
                  padding: 'var(--sp-1) var(--sp-3)',
                  borderRadius: 'var(--radius-sm)',
                  background: isActive ? 'var(--bg-elevated)' : 'transparent',
                  color: isActive ? 'var(--text-primary)' : 'var(--text-tertiary)',
                  fontWeight: isActive ? 'var(--fw-semibold)' : 'var(--fw-medium)',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'var(--transition-fast)',
                }}
                onClick={() => setGenerationMode(key)}
              >
                {label}
              </button>
            );
          })}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
          {/* Image size / aspect ratio */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
            <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', fontWeight: 'var(--fw-medium)' }}>
              图片尺寸/比例
            </span>

            {model.fixedSize ? (
              <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-muted)' }}>
                固定 {model.fixedSize}
              </span>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-1)' }}>
                {SIZE_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    className={`btn btn-sm ${selectedSize === preset ? 'btn-primary' : 'btn-ghost'}`}
                    style={{ minWidth: 48 }}
                    onClick={() => handleSizeChange(preset)}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            )}

            {selectedSize === '自定义' && !model.fixedSize && (
              <div style={{ display: 'flex', gap: 'var(--sp-2)', marginTop: 'var(--sp-1)' }}>
                <input className="input" style={{ width: 80 }} placeholder="宽" type="number" onChange={(e) => setParam('size', `${e.target.value}x${params.size?.split('x')[1] || '1024'}`)} />
                <span style={{ color: 'var(--text-muted)', alignSelf: 'center' }}>x</span>
                <input className="input" style={{ width: 80 }} placeholder="高" type="number" onChange={(e) => setParam('size', `${params.size?.split('x')[0] || '1024'}x${e.target.value}`)} />
              </div>
            )}
          </div>

          {/* Generation count */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
            <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', fontWeight: 'var(--fw-medium)' }}>
              生成数量
            </span>
            {model.fixedCount !== null ? (
              <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-muted)' }}>
                固定 {model.fixedCount} 张
              </span>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
                <button
                  className="btn btn-ghost btn-sm btn-icon"
                  onClick={() => adjustCount(-1)}
                  disabled={generationCount <= model.countRange[0]}
                >
                  -
                </button>
                <span style={{ fontSize: 'var(--fs-md)', fontWeight: 'var(--fw-semibold)', minWidth: 24, textAlign: 'center' }}>
                  {generationCount}
                </span>
                <button
                  className="btn btn-ghost btn-sm btn-icon"
                  onClick={() => adjustCount(1)}
                  disabled={generationCount >= model.countRange[1]}
                >
                  +
                </button>
                <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>
                  ({model.countRange[0]}-{model.countRange[1]})
                </span>
              </div>
            )}
          </div>

          {/* Quality (dynamic per model) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
            <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', fontWeight: 'var(--fw-medium)' }}>
              质量
            </span>
            <div
              className={!model.qualitySupport ? 'disabled-param' : ''}
              style={{ display: 'flex', gap: 'var(--sp-1)' }}
              {...(!model.qualitySupport ? { 'data-tooltip': '当前模型不支持此功能' } : {})}
            >
              {getQualityOptions(currentModel).map((q) => (
                <button
                  key={q.value}
                  className={`btn btn-sm ${(params.quality || quality) === q.value ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => { if (model.qualitySupport) { setQuality(q.value); setParam('quality', q.value); } }}
                  style={!model.qualitySupport ? { opacity: 0.35, pointerEvents: 'none' } : {}}
                >
                  {q.label}
                </button>
              ))}
              {model.qualitySupport && getQualityOptions(currentModel).length === 0 && (
                <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>当前模型无质量选项</span>
              )}
            </div>
          </div>

          {/* Resolution (GPT-image-2 only) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
            <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', fontWeight: 'var(--fw-medium)' }}>
              分辨率
            </span>
            <div
              className={!model.resolutionOptions ? 'disabled-param' : ''}
              style={{ display: 'flex', gap: 'var(--sp-1)' }}
              {...(!model.resolutionOptions ? { 'data-tooltip': '当前模型不支持此功能' } : {})}
            >
              {(model.resolutionOptions || ['1K', '2K', '4K']).map((r) => (
                <button
                  key={r}
                  className={`btn btn-sm ${(params.resolution || resolution) === r ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => model.resolutionOptions && setParam('resolution', r)}
                  style={!model.resolutionOptions ? { opacity: 0.35, pointerEvents: 'none' } : {}}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          {/* prompt_extend (only Qwen) */}
          {currentModel === 'qwen-image-3' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)' }}>
                <button
                  className={`checkbox ${promptExtend ? 'checked' : ''}`}
                  onClick={() => { setPromptExtend(!promptExtend); setParam('prompt_extend', !promptExtend); }}
                >
                  {promptExtend && <Check size={10} style={{ color: '#fff' }} />}
                </button>
                <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)' }}>
                  prompt_extend (自动扩写提示词)
                </span>
              </div>
              {promptExtend && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', paddingLeft: 'var(--sp-6)' }}>
                  <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-tertiary)' }}>扩写模式:</span>
                  <div
                    style={{
                      display: 'inline-flex',
                      gap: '1px',
                      background: 'var(--border-subtle)',
                      borderRadius: 'var(--radius-md)',
                      padding: '2px',
                    }}
                  >
                    {[
                      { value: 'direct', label: '直接扩写' },
                      { value: 'agent', label: '智能扩写' },
                    ].map(({ value, label }) => (
                      <button
                        key={value}
                        className="btn btn-sm"
                        style={{
                          fontSize: 'var(--fs-xs)',
                          padding: 'var(--sp-1) var(--sp-3)',
                          borderRadius: 'var(--radius-sm)',
                          background: promptExtendMode === value ? 'var(--bg-elevated)' : 'transparent',
                          color: promptExtendMode === value ? 'var(--text-primary)' : 'var(--text-tertiary)',
                          fontWeight: promptExtendMode === value ? 'var(--fw-semibold)' : 'var(--fw-medium)',
                          border: 'none',
                          cursor: 'pointer',
                          transition: 'var(--transition-fast)',
                        }}
                        onClick={() => { setPromptExtendMode(value); setParam('prompt_extend_mode', value); }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── More Parameters (collapsible) ── */}
      <div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--sp-2)',
            cursor: 'pointer',
            marginBottom: showMoreParams ? 'var(--sp-3)' : 0,
          }}
          onClick={() => setShowMoreParams(!showMoreParams)}
        >
          {showMoreParams ? (
            <ChevronDown size={14} style={{ color: 'var(--text-tertiary)' }} />
          ) : (
            <ChevronRight size={14} style={{ color: 'var(--text-tertiary)' }} />
          )}
          <span style={sectionTitleStyle}>更多参数</span>
        </div>

        {showMoreParams && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)', paddingLeft: 'var(--sp-2)' }}>
            {/* Seed */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
              <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', fontWeight: 'var(--fw-medium)' }}>
                Seed
              </span>
              <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
                <input
                  className="input"
                  style={{ width: 120 }}
                  type="number"
                  placeholder="随机"
                  value={seed}
                  onChange={(e) => setSeed(e.target.value)}
                />
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => { const v = String(Math.floor(Math.random() * 999999999)); setSeed(v); setParam('seed', parseInt(v)); }}
                >
                  <Shuffle size={14} />
                  随机
                </button>
              </div>
            </div>

            {/* Mask / Inpaint */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
              <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', fontWeight: 'var(--fw-medium)' }}>
                局部重绘 (Mask)
              </span>
              <div
                className={!model.maskSupport ? '' : ''}
                style={{ position: 'relative' }}
              >
                <button
                  className="btn btn-ghost btn-sm"
                  disabled={!model.maskSupport || !results.length}
                  style={!model.maskSupport ? { opacity: 0.35, pointerEvents: 'none' } : {}}
                  data-tooltip={!model.maskSupport ? '当前模型不支持此功能' : (!results.length ? '请先生成图片' : undefined)}
                  onClick={() => {
                    if (results.length > 0) {
                      handleOpenInpaint(results[0]);
                    }
                  }}
                >
                  <Layers size={14} />
                  打开 Mask 编辑器
                </button>
                {!model.maskSupport && (
                  <span
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: '100%',
                      marginTop: 2,
                      fontSize: 'var(--fs-xs)',
                      color: 'var(--text-muted)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    当前模型不支持此功能
                  </span>
                )}
              </div>
            </div>

            {/* Callback URL */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
              <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', fontWeight: 'var(--fw-medium)' }}>
                回调地址
              </span>
              <input
                className="input"
                placeholder="https://your-server.com/callback (可选)"
                type="url"
              />
            </div>

            {/* Debug mode (Qwen only) */}
            {currentModel === 'qwen-image-3' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)' }}>
                <button
                  className={`checkbox ${debugMode ? 'checked' : ''}`}
                  onClick={() => { setDebugMode(!debugMode); setParam('debug', !debugMode); }}
                >
                  {debugMode && <Check size={10} style={{ color: '#fff' }} />}
                </button>
                <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)' }}>
                  debug 模式
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );

  const renderActionButtons = () => (
    <div style={{ display: 'flex', gap: 'var(--sp-3)', marginTop: 'auto', paddingTop: 'var(--sp-4)' }}>
      <button
        className="btn btn-primary btn-lg"
        style={{ flex: 1, position: 'relative' }}
        disabled={!canGenerate || isGenerating}
        onClick={handleGenerate}
      >
        {isGenerating ? (
          <>
            <Loader size={16} style={{ animation: 'spin 1s linear infinite' }} />
            生成中... {generatingProgress > 0 ? `${generatingProgress}%` : ''}
          </>
        ) : (
          <>
            <Zap size={16} />
            生成
            <kbd style={{ marginLeft: 'var(--sp-2)', fontSize: 'var(--fs-xs)' }}>⌘↵</kbd>
          </>
        )}
      </button>

      <div style={{ position: 'relative' }}>
        <button
          className="btn btn-ghost btn-lg"
          onClick={() => setShowBatchDropdown(!showBatchDropdown)}
          disabled={!canGenerate}
        >
          <List size={16} />
          批量生成
          <ChevronDown size={14} />
        </button>

        {showBatchDropdown && (
          <div
            style={{
              position: 'absolute',
              bottom: 'calc(100% + 4px)',
              right: 0,
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-base)',
              boxShadow: 'var(--shadow-md)',
              padding: 'var(--sp-1)',
              minWidth: 160,
              zIndex: 10,
            }}
          >
            {[
              { key: 'batch', label: '多批次' },
              { key: 'variants', label: '多变体' },
              { key: 'queue', label: 'Prompt 队列' },
            ].map(({ key, label }) => (
              <button
                key={key}
                className="btn btn-ghost btn-sm"
                style={{ width: '100%', justifyContent: 'flex-start', borderRadius: 'var(--radius-sm)' }}
                onClick={() => {
                  setShowBatchDropdown(false);
                  setBatchMode(key);
                  setBatchPanelOpen(true);
                }}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  /* ──────────────────────────────────────────
     RIGHT PANEL RENDER
     ────────────────────────────────────────── */

  const renderResultBoard = () => {
    const gradients = [
      'linear-gradient(135deg, #667eea, #764ba2)',
      'linear-gradient(135deg, #f093fb, #f5576c)',
      'linear-gradient(135deg, #4facfe, #00f2fe)',
      'linear-gradient(135deg, #43e97b, #38f9d7)',
    ];
    const displayResults = results.length > 0 ? results : [];
    const cols = displayResults.length <= 2 ? 2 : displayResults.length <= 4 ? 2 : displayResults.length <= 6 ? 3 : 4;

    return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden', gap: 0 }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)', overflow: 'auto', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)' }}>
          <h2 style={{ fontSize: 'var(--fs-lg)', fontWeight: 'var(--fw-semibold)', color: 'var(--text-primary)', margin: 0 }}>
            生成结果
          </h2>
          {generationError && (
            <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--accent-danger)' }}>{generationError}</span>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 'var(--sp-3)', flex: 1 }}>
        {isGenerating ? (
          Array.from({ length: generationCount || 1 }).map((_, i) => (
            <div key={`skel-${i}`} className="skeleton" style={{ aspectRatio: '1', borderRadius: 'var(--radius-md)' }} />
          ))
        ) : displayResults.length === 0 ? (
          <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 'var(--sp-8)', color: 'var(--text-muted)' }}>
            <ImageIcon size={48} style={{ opacity: 0.3, marginBottom: 'var(--sp-3)' }} />
            <span style={{ fontSize: 'var(--fs-sm)' }}>输入提示词并点击生成</span>
          </div>
        ) : (
        displayResults.map((img, i) => (
          <div
            key={img.id || i}
            style={{
              position: 'relative', borderRadius: 'var(--radius-lg)', overflow: 'hidden',
              border: '1px solid var(--border-default)',
              background: img.url ? 'var(--bg-card)' : gradients[i % gradients.length],
              minHeight: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
            }}
            onClick={() => openLightbox(img.id)}
            onMouseEnter={() => setHoveredResult(img.id)}
            onMouseLeave={() => setHoveredResult(null)}
            onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setContextMenu({ visible: true, x: e.clientX, y: e.clientY, imageIndex: i }); }}
          >
            {img.url ? (
              <img src={img.url} alt={img.prompt} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <ImageIcon size={32} style={{ color: 'rgba(255,255,255,0.2)' }} />
            )}

            {img.favorite && (
              <span className="badge badge-accent" style={{ position: 'absolute', top: 8, left: 8, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}>
                <Star size={10} fill="currentColor" /> 收藏
              </span>
            )}

            {hoveredResult === img.id && (
              <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)', display: 'flex', flexWrap: 'wrap', alignContent: 'flex-end', justifyContent: 'center', gap: 'var(--sp-1)', padding: 'var(--sp-3)' }}>
                <button className="btn-icon" style={{ background: 'rgba(255,255,255,0.12)', color: '#fff' }} title="收藏" onClick={(e) => { e.stopPropagation(); favoriteImage(img.id); }}>
                  <Star size={14} fill={img.favorite ? 'currentColor' : 'none'} />
                </button>
                <button className="btn-icon" style={{ background: 'rgba(255,255,255,0.12)', color: '#fff' }} title="淘汰" onClick={(e) => { e.stopPropagation(); discardImage(img.id); }}>
                  <Trash2 size={14} />
                </button>
                <button className="btn-icon" style={{ background: 'rgba(255,255,255,0.12)', color: '#fff' }} title="重新生成" onClick={(e) => { e.stopPropagation(); handleRegenerateImage(img); }}>
                  <RefreshCw size={14} />
                </button>
                <button className="btn-icon" style={{ background: 'rgba(255,255,255,0.12)', color: '#fff' }} title="用作参考图" onClick={(e) => { e.stopPropagation(); handleUseAsRef(img); }}>
                  <Pin size={14} />
                </button>
                <button className="btn-icon" style={{ background: 'rgba(255,255,255,0.12)', color: '#fff' }} title="复制 Prompt" onClick={(e) => { e.stopPropagation(); handleCopyPrompt(img); }}>
                  <Copy size={14} />
                </button>
                <button className="btn-icon" style={{ background: 'rgba(255,255,255,0.12)', color: '#fff' }} title="下载" onClick={(e) => { e.stopPropagation(); handleDownload(img); }}>
                  <Download size={14} />
                </button>
              </div>
            )}
          </div>
        )))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--sp-2)', padding: 'var(--sp-3) var(--sp-4)', background: 'var(--bg-panel)', borderRadius: 'var(--radius-base)', border: '1px solid var(--border-subtle)', fontSize: 'var(--fs-sm)', color: 'var(--text-tertiary)', flexWrap: 'wrap' }}>
        <span style={{ color: 'var(--accent-primary)', fontWeight: 'var(--fw-medium)' }}>{model.label}</span>
        <span style={{ color: 'var(--border-strong)' }}>·</span>
        <span>{selectedSize}</span>
        <span style={{ color: 'var(--border-strong)' }}>·</span>
        <span>{displayResults.length}张</span>
      </div>
      </div>

      {/* Batch History Sidebar */}
      <div style={{ position: 'relative', width: batchSidebarOpen ? 240 : 48, flexShrink: 0, transition: 'width 0.2s ease', borderLeft: '1px solid var(--border-subtle)', background: 'var(--bg-panel)', display: 'flex', flexDirection: 'row', overflow: 'hidden' }}>
        <div style={{ width: 48, minWidth: 48, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 'var(--sp-3)', cursor: 'pointer', gap: 'var(--sp-1)' }} onClick={() => setBatchSidebarOpen(!batchSidebarOpen)}>
          <Clock size={16} style={{ color: 'var(--text-tertiary)' }} />
          <span style={{ writingMode: 'vertical-rl', fontSize: 'var(--fs-xs)', color: 'var(--text-tertiary)', letterSpacing: 'var(--ls-wide)' }}>历史</span>
        </div>

        {batchSidebarOpen && (
          <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--sp-3)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
            <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 'var(--fw-semibold)', color: 'var(--text-primary)', marginBottom: 'var(--sp-1)' }}>
              批次历史
            </div>
            {batchHistory.length === 0 ? (
              <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', padding: 'var(--sp-2)' }}>暂无历史记录</div>
            ) : (
              batchHistory.map((batch, idx) => (
                <div
                  key={batch.batchId || idx}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', padding: 'var(--sp-2)',
                    borderRadius: 'var(--radius-base)', cursor: 'pointer',
                    background: selectedBatchId === batch.batchId ? 'rgba(255,255,255,0.06)' : 'transparent',
                    border: selectedBatchId === batch.batchId ? '1px solid var(--border-default)' : '1px solid transparent',
                    transition: 'var(--transition-fast)',
                  }}
                  onClick={() => handleBatchSelect(batch)}
                >
                  <div style={{ width: 32, height: 32, borderRadius: 'var(--radius-sm)', background: gradients[idx % gradients.length], flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {batch.prompt}
                    </div>
                    <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', marginTop: 2 }}>
                      {MODELS[batch.model]?.name || batch.model} · {batch.images?.length || 0}张
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
    );
  };

  /* ──────────────────────────────────────────
     MAIN RENDER
     ────────────────────────────────────────── */

  return (
    <div style={pageStyle}>
      {/* LEFT PANEL */}
      <div style={leftPanelStyle}>
        {renderModelSelector()}
        {renderPromptEditor()}
        {renderReferenceImages()}
        {renderParameters()}
        {renderActionButtons()}
      </div>

      {/* RIGHT PANEL */}
      <div style={rightPanelStyle}>
        {renderResultBoard()}
      </div>

      <BatchPanel
        isOpen={batchPanelOpen}
        onClose={() => setBatchPanelOpen(false)}
        initialMode={batchMode}
      />

      <MaskEditor
        isOpen={maskEditorOpen}
        onClose={closeMaskEditor}
        sourceImage={maskEditorImage}
        onConfirm={maskEditorOnConfirm}
      />

      {/* Right-click Context Menu */}
      {contextMenu.visible && (
        <div
          style={{
            position: 'fixed',
            left: contextMenu.x,
            top: contextMenu.y,
            zIndex: 1000,
            minWidth: 220,
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-base)',
            boxShadow: 'var(--shadow-lg)',
            padding: 'var(--sp-1)',
            display: 'flex',
            flexDirection: 'column',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {[
            { icon: <RefreshCw size={14} />, label: '用相同参数再来一批', action: () => { handleGenerate(); setContextMenu({ visible: false, x: 0, y: 0, imageIndex: -1 }); } },
            { icon: <Pin size={14} />, label: '以此图为参考图', action: () => { const img = results[contextMenu.imageIndex]; if (img) handleUseAsRef(img); setContextMenu({ visible: false, x: 0, y: 0, imageIndex: -1 }); } },
            { icon: <Pencil size={14} />, label: '复制 Prompt', action: () => { const img = results[contextMenu.imageIndex]; if (img) handleCopyPrompt(img); setContextMenu({ visible: false, x: 0, y: 0, imageIndex: -1 }); } },
          ].map((item, idx) => (
            <button
              key={idx}
              className="btn btn-ghost btn-sm"
              style={{
                justifyContent: 'flex-start',
                borderRadius: 'var(--radius-sm)',
                gap: 'var(--sp-2)',
                color: 'var(--text-primary)',
              }}
              onClick={item.action}
            >
              {item.icon}
              {item.label}
            </button>
          ))}

          {/* Inpaint */}
          <button
              className="btn btn-ghost btn-sm"
              style={{
                justifyContent: 'flex-start',
                borderRadius: 'var(--radius-sm)',
                gap: 'var(--sp-2)',
                color: 'var(--text-primary)',
              }}
              onClick={() => {
                const img = results[contextMenu.imageIndex];
                if (img) handleOpenInpaint(img);
              }}
            >
              <Paintbrush size={14} />
              局部重绘
            </button>

          {/* Divider */}
          <div style={{ height: 1, background: 'var(--border-subtle)', margin: 'var(--sp-1) 0' }} />

          {/* Model switch submenu */}
          <div
            style={{ position: 'relative' }}
            onMouseEnter={() => setShowModelSubmenu(true)}
            onMouseLeave={() => setShowModelSubmenu(false)}
          >
            <button
              className="btn btn-ghost btn-sm"
              style={{
                justifyContent: 'flex-start',
                borderRadius: 'var(--radius-sm)',
                gap: 'var(--sp-2)',
                color: 'var(--text-primary)',
                width: '100%',
              }}
            >
              <ArrowRightLeft size={14} />
              换模型生成
              <ChevronRight size={12} style={{ marginLeft: 'auto' }} />
            </button>

            {showModelSubmenu && (
              <div
                style={{
                  position: 'absolute',
                  left: '100%',
                  top: 0,
                  minWidth: 160,
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-base)',
                  boxShadow: 'var(--shadow-lg)',
                  padding: 'var(--sp-1)',
                  marginLeft: 2,
                }}
              >
                {MODEL_ORDER.map(key => {
                  const m = UI_MODELS[key];
                  return (
                  <button
                    key={key}
                    className="btn btn-ghost btn-sm"
                    style={{
                      justifyContent: 'flex-start',
                      borderRadius: 'var(--radius-sm)',
                      width: '100%',
                      color: 'var(--text-primary)',
                    }}
                    onClick={() => {
                      handleModelChange(key);
                      setContextMenu({ visible: false, x: 0, y: 0, imageIndex: -1 });
                      setShowModelSubmenu(false);
                    }}
                  >
                    {m.label}
                  </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
