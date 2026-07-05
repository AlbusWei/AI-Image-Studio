import React, { useState, useEffect, useCallback } from 'react';
import {
  X, ChevronLeft, ChevronRight, Star, Trash2, RefreshCw,
  Pin, Pencil, FolderOpen, Lightbulb, Download,
  ZoomIn, ZoomOut, Maximize2, Copy, Check
} from 'lucide-react';
import { useGenerationStore } from '../stores/useGenerationStore';
import { useUIStore } from '../stores/useUIStore';
import { useGalleryStore } from '../stores/useGalleryStore';
import { updateImage, addCasePackage } from '../db/database';
import StorageService from '../services/storage';

function Lightbox({ isOpen, onClose, images = [], currentIndex = 0 }) {
  const [currentImageIndex, setCurrentImageIndex] = useState(currentIndex);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [note, setNote] = useState('');
  const [copied, setCopied] = useState(false);
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  const favoriteImage = useGenerationStore(s => s.favoriteImage);
  const discardImage = useGenerationStore(s => s.discardImage);
  const regenerate = useGenerationStore(s => s.regenerate);
  const addReferenceImage = useGenerationStore(s => s.addReferenceImage);
  const addToast = useUIStore(s => s.addToast);
  const openMaskEditor = useUIStore(s => s.openMaskEditor);
  const folders = useGalleryStore(s => s.folders);

  const currentImage = images[currentImageIndex] || images[0] || {};

  useEffect(() => { setCurrentImageIndex(Math.max(0, currentIndex)); }, [currentIndex]);

  // Load note from DB when image changes
  useEffect(() => {
    if (currentImage?.id) {
      import('../db/database').then(db =>
        db.getImage(currentImage.id).then(img => {
          setNote(img?.note || '');
        })
      );
    }
  }, [currentImage?.id]);

  const handlePrev = useCallback(() => {
    setCurrentImageIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1));
  }, [images.length]);

  const handleNext = useCallback(() => {
    setCurrentImageIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0));
  }, [images.length]);

  const handleCopy = useCallback(() => {
    if (currentImage?.prompt) {
      navigator.clipboard?.writeText(currentImage.prompt);
      setCopied(true);
      addToast('Prompt 已复制', { type: 'success' });
      setTimeout(() => setCopied(false), 2000);
    }
  }, [currentImage, addToast]);

  const handleDownload = useCallback(async () => {
    try {
      const blob = await StorageService.getImage(currentImage.id);
      if (!blob) { addToast('图片未找到', { type: 'error' }); return; }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `image-${currentImage.id}.png`; a.click();
      URL.revokeObjectURL(url);
      addToast('下载已开始', { type: 'success' });
    } catch { addToast('下载失败', { type: 'error' }); }
  }, [currentImage, addToast]);

  const handleFavorite = useCallback(() => {
    if (currentImage?.id) favoriteImage(currentImage.id);
  }, [currentImage, favoriteImage]);

  const handleDiscard = useCallback(() => {
    if (currentImage?.id) {
      discardImage(currentImage.id);
      addToast('已淘汰', { type: 'info' });
    }
  }, [currentImage, discardImage, addToast]);

  const handleRegenerate = useCallback(() => {
    regenerate();
    onClose?.();
  }, [regenerate, onClose]);

  const handleUseAsRef = useCallback(() => {
    if (currentImage?.url) {
      addReferenceImage({ blob: null, name: 'from-lightbox', url: currentImage.url });
      addToast('已添加为参考图', { type: 'success' });
    }
  }, [currentImage, addReferenceImage, addToast]);

  const handleNoteSave = useCallback(async (value) => {
    setNote(value);
    if (currentImage?.id) {
      try { await updateImage(currentImage.id, { note: value }); } catch (err) { console.error(err); }
    }
  }, [currentImage]);

  // 局部重绘: open mask editor with current image
  const handleInpaint = useCallback(async () => {
    try {
      const imageUrl = currentImage?.url || currentImage?.blobUrl;
      if (!imageUrl) {
        addToast('无法获取图片', { type: 'error' });
        return;
      }
      // If image is in cold zone, try to get from OSS first
      if (currentImage?.storageZone === 'cold' && currentImage?.ossUrl) {
        openMaskEditor(currentImage.ossUrl, null);
      } else {
        openMaskEditor(imageUrl, null);
      }
      onClose?.();
    } catch (err) {
      console.error('[Lightbox] handleInpaint error:', err);
      addToast('打开局部重绘失败: ' + err.message, { type: 'error' });
    }
  }, [currentImage, openMaskEditor, onClose, addToast]);

  // 移动到: show folder picker
  const handleMoveToStart = useCallback(() => {
    setShowFolderPicker(true);
  }, []);

  const handleMoveToFolder = useCallback(async (folderId) => {
    try {
      if (currentImage?.id) {
        await updateImage(currentImage.id, { folderId });
        addToast('已移动到文件夹', { type: 'success' });
      }
    } catch (err) {
      console.error('[Lightbox] handleMoveToFolder error:', err);
      addToast('移动失败: ' + err.message, { type: 'error' });
    } finally {
      setShowFolderPicker(false);
    }
  }, [currentImage, addToast]);

  // 加入知识库: create a case package from current image
  const handleAddToKnowledgeBase = useCallback(async () => {
    try {
      // Fallback chain: id -> imageId -> generate from url/index
      const imageId = currentImage?.id ?? currentImage?.imageId ?? (currentImage?.url ? `url-${currentImage.url.slice(-16)}` : null);
      if (!imageId) {
        addToast('图片信息不完整，无法加入知识库', { type: 'error' });
        return;
      }
      await addCasePackage({
        imageId,
        originalPrompt: currentImage.prompt || '',
        model: currentImage.model || '',
        params: currentImage.params || {},
        annotation: note || '',
        tags: currentImage.tags || [],
        imageUrl: currentImage.url || currentImage.blobUrl || '',
        createdAt: Date.now(),
      });
      addToast('已加入知识库', { type: 'success' });
    } catch (err) {
      console.error('[Lightbox] handleAddToKnowledgeBase error:', err);
      addToast('加入知识库失败: ' + (err.message || '未知错误'), { type: 'error' });
    }
  }, [currentImage, note, addToast]);

  const handleKeyDown = useCallback(
    (e) => {
      if (!isOpen) return;
      if (e.key === 'Escape') onClose?.();
      if (e.key === 'ArrowLeft') handlePrev();
      if (e.key === 'ArrowRight') handleNext();
    },
    [isOpen, onClose, handlePrev, handleNext]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  if (!isOpen) return null;

  const zoomPercent = Math.round(zoomLevel * 100);

  return (
    <div
      className="lightbox-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.85)',
        zIndex: 'var(--z-lightbox)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Top bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: 'var(--sp-3) var(--sp-4)',
          position: 'relative',
          zIndex: 2,
        }}
      >
        <span
          style={{
            color: 'rgba(255,255,255,0.5)',
            fontSize: 'var(--fs-sm)',
          }}
        >
          {currentImageIndex + 1} / {images.length}
        </span>
        <span
          style={{
            color: 'rgba(255,255,255,0.35)',
            fontSize: 'var(--fs-xs)',
          }}
        >
          Esc 关闭 · ← → 切换
        </span>
        <button
          className="btn btn-ghost btn-icon"
          onClick={onClose}
          style={{
            color: 'rgba(255,255,255,0.7)',
            background: 'rgba(255,255,255,0.08)',
            borderRadius: 'var(--radius-md)',
            border: 'none',
            cursor: 'pointer',
            padding: 'var(--sp-2)',
          }}
          aria-label="关闭"
        >
          <X size={20} />
        </button>
      </div>

      {/* Main content */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Image area */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
          }}
        >
          {/* Left arrow */}
          <button
            className="btn btn-ghost btn-icon"
            onClick={handlePrev}
            style={{
              position: 'absolute',
              left: 'var(--sp-4)',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'rgba(255,255,255,0.7)',
              background: 'rgba(255,255,255,0.1)',
              borderRadius: 'var(--radius-full)',
              border: 'none',
              cursor: 'pointer',
              padding: 'var(--sp-3)',
              zIndex: 3,
              transition: 'var(--transition-fast)',
            }}
            aria-label="上一张"
          >
            <ChevronLeft size={24} />
          </button>

          {/* Image display */}
          <div
            style={{
              width: '60%',
              maxWidth: '640px',
              aspectRatio: '1',
              borderRadius: 'var(--radius-lg)',
              overflow: 'hidden',
              transform: `scale(${zoomLevel})`,
              transition: 'var(--transition-smooth)',
              boxShadow: 'var(--shadow-xl)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'var(--bg-card)',
            }}
          >
            {currentImage?.url ? (
              <img
                src={currentImage.url}
                alt={currentImage.prompt || 'Generated image'}
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              />
            ) : (
              <div className="ph-img" style={{ width: '100%', height: '100%' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-sm)' }}>暂无图片</span>
              </div>
            )}
          </div>

          {/* Right arrow */}
          <button
            className="btn btn-ghost btn-icon"
            onClick={handleNext}
            style={{
              position: 'absolute',
              right: '340px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'rgba(255,255,255,0.7)',
              background: 'rgba(255,255,255,0.1)',
              borderRadius: 'var(--radius-full)',
              border: 'none',
              cursor: 'pointer',
              padding: 'var(--sp-3)',
              zIndex: 3,
              transition: 'var(--transition-fast)',
            }}
            aria-label="下一张"
          >
            <ChevronRight size={24} />
          </button>
        </div>

        {/* Right side panel */}
        <div
          style={{
            width: '320px',
            minWidth: '320px',
            background: 'var(--bg-panel)',
            borderLeft: '1px solid var(--border-subtle)',
            overflowY: 'auto',
            padding: 'var(--sp-5)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--sp-5)',
          }}
        >
          {/* Prompt section */}
          <div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 'var(--sp-2)',
              }}
            >
              <span
                style={{
                  fontSize: 'var(--fs-sm)',
                  fontWeight: 'var(--fw-semibold)',
                  color: 'var(--text-secondary)',
                }}
              >
                提示词
              </span>
              <button
                className="btn btn-ghost btn-sm btn-icon"
                onClick={handleCopy}
                style={{
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  color: 'var(--text-tertiary)',
                  padding: 'var(--sp-1)',
                  borderRadius: 'var(--radius-sm)',
                  transition: 'var(--transition-fast)',
                }}
                aria-label="复制提示词"
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
              </button>
            </div>
            <p
              style={{
                fontSize: 'var(--fs-sm)',
                color: 'var(--text-primary)',
                lineHeight: 1.6,
                margin: 0,
                wordBreak: 'break-word',
              }}
            >
              {currentImage?.prompt}
            </p>
          </div>

          {/* Model section */}
          <div>
            <span
              style={{
                fontSize: 'var(--fs-sm)',
                fontWeight: 'var(--fw-semibold)',
                color: 'var(--text-secondary)',
                display: 'block',
                marginBottom: 'var(--sp-2)',
              }}
            >
              模型
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
              <span
                style={{
                  fontSize: 'var(--fs-sm)',
                  color: 'var(--text-primary)',
                }}
              >
                {currentImage?.model}
              </span>
              <span
                className="badge badge-accent"
                style={{
                  fontSize: 'var(--fs-xs)',
                  padding: '1px 6px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--accent-primary)',
                  color: '#fff',
                  fontWeight: 'var(--fw-medium)',
                }}
              >
                {currentImage?.model?.includes('GPT') ? 'GPT' : 'Other'}
              </span>
            </div>
          </div>

          {/* Params section */}
          <div>
            <span
              style={{
                fontSize: 'var(--fs-sm)',
                fontWeight: 'var(--fw-semibold)',
                color: 'var(--text-secondary)',
                display: 'block',
                marginBottom: 'var(--sp-2)',
              }}
            >
              参数
            </span>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'auto 1fr',
                gap: 'var(--sp-2) var(--sp-3)',
                fontSize: 'var(--fs-sm)',
              }}
            >
              {[
                ['尺寸', currentImage?.params?.size || currentImage?.size || '-'],
                ['质量', currentImage?.params?.quality || currentImage?.quality || '-'],
                ['种子', (currentImage?.params?.seed ?? currentImage?.seed)?.toLocaleString?.() || '-'],
                ['模型', currentImage?.model || '-'],
              ].map(([label, value]) => (
                <React.Fragment key={label}>
                  <span style={{ color: 'var(--text-tertiary)' }}>{label}</span>
                  <span style={{ color: 'var(--text-primary)' }}>{value}</span>
                </React.Fragment>
              ))}
            </div>
          </div>

          {/* Note section */}
          <div>
            <span
              style={{
                fontSize: 'var(--fs-sm)',
                fontWeight: 'var(--fw-semibold)',
                color: 'var(--text-secondary)',
                display: 'block',
                marginBottom: 'var(--sp-2)',
              }}
            >
              用户备注
            </span>
            <textarea
              className="textarea"
              value={note}
              onChange={(e) => handleNoteSave(e.target.value)}
              placeholder="添加备注..."
              rows={3}
              style={{
                width: '100%',
                background: 'var(--bg-input)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--text-primary)',
                fontSize: 'var(--fs-sm)',
                padding: 'var(--sp-2) var(--sp-3)',
                resize: 'vertical',
                fontFamily: 'inherit',
                transition: 'var(--transition-fast)',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Action buttons */}
          <div>
            <span
              style={{
                fontSize: 'var(--fs-sm)',
                fontWeight: 'var(--fw-semibold)',
                color: 'var(--text-secondary)',
                display: 'block',
                marginBottom: 'var(--sp-3)',
              }}
            >
              操作
            </span>
            <div
              style={{
                display: 'flex',
                gap: 'var(--sp-2)',
                flexWrap: 'wrap',
              }}
            >
              {[
                { icon: Star, label: '收藏', action: handleFavorite },
                { icon: Trash2, label: '淘汰', action: handleDiscard },
                { icon: RefreshCw, label: '重新生成', action: handleRegenerate },
                { icon: Pin, label: '设为参考', action: handleUseAsRef },
                { icon: Pencil, label: '局部重绘', action: handleInpaint },
                { icon: FolderOpen, label: '移动到', action: handleMoveToStart },
                { icon: Lightbulb, label: '加入知识库', action: handleAddToKnowledgeBase },
                { icon: Download, label: '下载', action: handleDownload },
              ].map(({ icon: Icon, label, action }) => (
                <button
                  key={label}
                  className="btn btn-subtle btn-icon btn-sm"
                  title={label}
                  style={{
                    border: 'none',
                    background: 'var(--bg-elevated)',
                    cursor: 'pointer',
                    color: 'var(--text-secondary)',
                    padding: 'var(--sp-2)',
                    borderRadius: 'var(--radius-md)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'var(--transition-fast)',
                  }}
                  onClick={action}
                >
                  <Icon size={16} />
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Folder picker modal for "移动到" */}
      {showFolderPicker && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onClick={() => setShowFolderPicker(false)}
        >
          <div
            style={{
              background: 'var(--bg-panel)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-lg)',
              padding: '20px',
              width: 320,
              maxHeight: 400,
              overflowY: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <p style={{ fontSize: 'var(--fs-sm)', fontWeight: 'var(--fw-semibold)', color: 'var(--text-primary)', marginBottom: 'var(--sp-3)' }}>选择目标文件夹</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <div
                style={{ padding: '8px 12px', borderRadius: 'var(--radius-md)', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 'var(--fs-sm)' }}
                onClick={() => handleMoveToFolder(null)}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                <FolderOpen size={14} style={{ display: 'inline', marginRight: 8, verticalAlign: -2 }} />未分类
              </div>
              {folders.map((f) => (
                <div
                  key={f.id}
                  style={{ padding: '8px 12px', borderRadius: 'var(--radius-md)', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 'var(--fs-sm)' }}
                  onClick={() => handleMoveToFolder(f.id)}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <FolderOpen size={14} style={{ display: 'inline', marginRight: 8, verticalAlign: -2 }} />{f.name}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Bottom zoom controls */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: 'var(--sp-2)',
          padding: 'var(--sp-3)',
          position: 'relative',
          zIndex: 2,
        }}
      >
        <button
          className="btn btn-ghost btn-icon btn-sm"
          onClick={() => setZoomLevel((z) => Math.min(z + 0.25, 3))}
          style={{
            color: 'rgba(255,255,255,0.7)',
            background: 'rgba(255,255,255,0.1)',
            border: 'none',
            cursor: 'pointer',
            padding: 'var(--sp-2)',
            borderRadius: 'var(--radius-md)',
          }}
          aria-label="放大"
        >
          <ZoomIn size={16} />
        </button>
        <button
          className="btn btn-ghost btn-icon btn-sm"
          onClick={() => setZoomLevel((z) => Math.max(z - 0.25, 0.25))}
          style={{
            color: 'rgba(255,255,255,0.7)',
            background: 'rgba(255,255,255,0.1)',
            border: 'none',
            cursor: 'pointer',
            padding: 'var(--sp-2)',
            borderRadius: 'var(--radius-md)',
          }}
          aria-label="缩小"
        >
          <ZoomOut size={16} />
        </button>
        <button
          className="btn btn-ghost btn-icon btn-sm"
          onClick={() => setZoomLevel(0.8)}
          title="适应窗口"
          style={{
            color: 'rgba(255,255,255,0.7)',
            background: 'rgba(255,255,255,0.1)',
            border: 'none',
            cursor: 'pointer',
            padding: 'var(--sp-2)',
            borderRadius: 'var(--radius-md)',
          }}
          aria-label="适应窗口"
        >
          <Maximize2 size={16} />
        </button>
        <span
          style={{
            color: 'rgba(255,255,255,0.6)',
            fontSize: 'var(--fs-xs)',
            minWidth: '40px',
            textAlign: 'center',
            fontWeight: 'var(--fw-medium)',
          }}
        >
          {zoomPercent}%
        </span>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => setZoomLevel(1)}
          title="原始大小"
          style={{
            color: 'rgba(255,255,255,0.7)',
            background: 'rgba(255,255,255,0.1)',
            border: 'none',
            cursor: 'pointer',
            padding: 'var(--sp-1) var(--sp-2)',
            borderRadius: 'var(--radius-md)',
            fontSize: 'var(--fs-xs)',
            fontWeight: 'var(--fw-medium)',
          }}
        >
          1:1
        </button>
      </div>
    </div>
  );
}

export default Lightbox;
