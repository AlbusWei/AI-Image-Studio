import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Paintbrush, Eraser, Undo2, Redo2, Upload,
  X, Info, ToggleLeft, ToggleRight, RotateCcw, FlipHorizontal
} from 'lucide-react';

/**
 * MaskEditor - Canvas-based mask painting for GPT-image-2 inpainting.
 *
 * Dual-canvas architecture:
 *   - bgCanvas: static background image (only redrawn on zoom/pan)
 *   - maskCanvas: transparent overlay where user paints semi-red mask
 *
 * Export: mask canvas is converted to black/white PNG (white = masked area).
 */

const MAX_HISTORY = 20;
const MASK_COLOR = 'rgba(220, 38, 38, 0.4)';

function MaskEditor({ isOpen, onClose, sourceImage, onConfirm }) {
  // ── State ──────────────────────────────────────────────────────────────
  const [activeTool, setActiveTool] = useState('brush');
  const [brushSize, setBrushSize] = useState(30);
  const [compareMode, setCompareMode] = useState(false);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [maskPercent, setMaskPercent] = useState(0);

  // Refs
  const containerRef = useRef(null);
  const bgCanvasRef = useRef(null);
  const maskCanvasRef = useRef(null);
  const isDrawingRef = useRef(false);
  const lastPosRef = useRef(null);
  const historyRef = useRef([]);
  const imageRef = useRef(null);
  const zoomRef = useRef(1);
  const panRef = useRef({ x: 0, y: 0 });
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0 });
  const spaceDownRef = useRef(false);

  // ── Canvas Initialization ─────────────────────────────────────────────
  const initCanvas = useCallback(() => {
    const bgCanvas = bgCanvasRef.current;
    const maskCanvas = maskCanvasRef.current;
    const container = containerRef.current;
    if (!bgCanvas || !maskCanvas || !container) return;

    // Determine image dimensions
    const img = imageRef.current;
    let imgW = 1024, imgH = 1024;
    if (img && img.naturalWidth > 0) {
      imgW = img.naturalWidth;
      imgH = img.naturalHeight;
    }

    // Set canvas resolution to image size
    bgCanvas.width = imgW;
    bgCanvas.height = imgH;
    maskCanvas.width = imgW;
    maskCanvas.height = imgH;

    // Draw background image
    const bgCtx = bgCanvas.getContext('2d');
    bgCtx.clearRect(0, 0, imgW, imgH);
    if (img && img.naturalWidth > 0) {
      bgCtx.drawImage(img, 0, 0, imgW, imgH);
    } else {
      // Fallback gradient if no image
      const grad = bgCtx.createLinearGradient(0, 0, imgW, imgH);
      grad.addColorStop(0, '#2d3436');
      grad.addColorStop(0.5, '#636e72');
      grad.addColorStop(1, '#b2bec3');
      bgCtx.fillStyle = grad;
      bgCtx.fillRect(0, 0, imgW, imgH);
    }

    // Clear mask
    const maskCtx = maskCanvas.getContext('2d', { willReadFrequently: true });
    maskCtx.clearRect(0, 0, imgW, imgH);

    // Reset history
    historyRef.current = [];
    setHistoryIndex(-1);
    setMaskPercent(0);
    updateTransform();
  }, []);

  // ── Transform (zoom/pan) ──────────────────────────────────────────────
  const updateTransform = useCallback(() => {
    const bgCanvas = bgCanvasRef.current;
    const maskCanvas = maskCanvasRef.current;
    if (!bgCanvas || !maskCanvas) return;

    const zoom = zoomRef.current;
    const pan = panRef.current;
    const transform = `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`;
    bgCanvas.style.transform = transform;
    maskCanvas.style.transform = transform;
  }, []);

  // ── Save to history ────────────────────────────────────────────────────
  const saveHistory = useCallback(() => {
    const maskCanvas = maskCanvasRef.current;
    if (!maskCanvas) return;
    const data = maskCanvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, maskCanvas.width, maskCanvas.height);

    // Truncate forward history
    historyRef.current = historyRef.current.slice(0, historyIndex + 1);
    historyRef.current.push(data);
    if (historyRef.current.length > MAX_HISTORY) {
      historyRef.current.shift();
    } else {
      setHistoryIndex(historyRef.current.length - 1);
    }
  }, [historyIndex]);

  // ── Undo / Redo ───────────────────────────────────────────────────────
  const undo = useCallback(() => {
    if (historyIndex <= 0) return;
    const newIndex = historyIndex - 1;
    setHistoryIndex(newIndex);
    const maskCanvas = maskCanvasRef.current;
    if (!maskCanvas) return;
    const ctx = maskCanvas.getContext('2d', { willReadFrequently: true });
    ctx.putImageData(historyRef.current[newIndex], 0, 0);
    updateMaskPercent();
  }, [historyIndex]);

  const redo = useCallback(() => {
    if (historyIndex >= historyRef.current.length - 1) return;
    const newIndex = historyIndex + 1;
    setHistoryIndex(newIndex);
    const maskCanvas = maskCanvasRef.current;
    if (!maskCanvas) return;
    const ctx = maskCanvas.getContext('2d', { willReadFrequently: true });
    ctx.putImageData(historyRef.current[newIndex], 0, 0);
    updateMaskPercent();
  }, [historyIndex]);

  // ── Mask percent calculation ───────────────────────────────────────────
  const updateMaskPercent = useCallback(() => {
    const maskCanvas = maskCanvasRef.current;
    if (!maskCanvas) return;
    const data = maskCanvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, maskCanvas.width, maskCanvas.height).data;
    let painted = 0;
    const total = maskCanvas.width * maskCanvas.height;
    // Sample every 16th pixel for performance
    for (let i = 3; i < data.length; i += 64) {
      if (data[i] > 0) painted++;
    }
    const sampledTotal = Math.floor(total / 16);
    setMaskPercent(Math.round((painted / sampledTotal) * 100));
  }, []);

  // ── Drawing logic ─────────────────────────────────────────────────────
  const getCanvasPos = useCallback((e) => {
    const maskCanvas = maskCanvasRef.current;
    if (!maskCanvas) return { x: 0, y: 0 };
    const rect = maskCanvas.getBoundingClientRect();
    const scaleX = maskCanvas.width / rect.width;
    const scaleY = maskCanvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }, []);

  const paintAt = useCallback((pos, tool) => {
    const maskCanvas = maskCanvasRef.current;
    if (!maskCanvas) return;
    const ctx = maskCanvas.getContext('2d', { willReadFrequently: true });
    const radius = brushSize / 2;

    if (tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    } else {
      ctx.fillStyle = MASK_COLOR;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [brushSize]);

  const paintLine = useCallback((from, to, tool) => {
    const maskCanvas = maskCanvasRef.current;
    if (!maskCanvas) return;
    const ctx = maskCanvas.getContext('2d', { willReadFrequently: true });
    const radius = brushSize / 2;

    if (tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
    } else {
      ctx.fillStyle = MASK_COLOR;
    }

    ctx.lineWidth = brushSize;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (tool === 'eraser') {
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
    } else {
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
    }
  }, [brushSize]);

  const handlePointerDown = useCallback((e) => {
    if (e.button === 1 || (e.button === 0 && spaceDownRef.current)) {
      isPanningRef.current = true;
      panStartRef.current = { x: e.clientX - panRef.current.x, y: e.clientY - panRef.current.y };
      e.preventDefault();
      return;
    }
    if (e.button !== 0) return;
    isDrawingRef.current = true;
    const pos = getCanvasPos(e);
    lastPosRef.current = pos;
    paintAt(pos, activeTool);
  }, [activeTool, getCanvasPos, paintAt]);

  const handlePointerMove = useCallback((e) => {
    if (isPanningRef.current) {
      panRef.current = { x: e.clientX - panStartRef.current.x, y: e.clientY - panStartRef.current.y };
      updateTransform();
      return;
    }
    if (!isDrawingRef.current) return;
    const pos = getCanvasPos(e);
    paintLine(lastPosRef.current, pos, activeTool);
    lastPosRef.current = pos;
  }, [activeTool, getCanvasPos, paintLine, updateTransform]);

  const handlePointerUp = useCallback(() => {
    if (isPanningRef.current) {
      isPanningRef.current = false;
      return;
    }
    if (isDrawingRef.current) {
      isDrawingRef.current = false;
      lastPosRef.current = null;
      saveHistory();
      updateMaskPercent();
    }
  }, [saveHistory, updateMaskPercent]);

  // ── Wheel zoom ────────────────────────────────────────────────────────
  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    zoomRef.current = Math.max(0.25, Math.min(4, zoomRef.current + delta));
    updateTransform();
  }, [updateTransform]);

  // ── Clear mask ────────────────────────────────────────────────────────
  const clearMask = useCallback(() => {
    const maskCanvas = maskCanvasRef.current;
    if (!maskCanvas) return;
    const ctx = maskCanvas.getContext('2d', { willReadFrequently: true });
    ctx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
    saveHistory();
    setMaskPercent(0);
  }, [saveHistory]);

  // ── Fill all ──────────────────────────────────────────────────────────
  const fillAll = useCallback(() => {
    const maskCanvas = maskCanvasRef.current;
    if (!maskCanvas) return;
    const ctx = maskCanvas.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = MASK_COLOR;
    ctx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);
    saveHistory();
    setMaskPercent(100);
  }, [saveHistory]);

  // ── Invert mask ──────────────────────────────────────────────────────
  const invertMask = useCallback(() => {
    const maskCanvas = maskCanvasRef.current;
    if (!maskCanvas) return;
    const ctx = maskCanvas.getContext('2d', { willReadFrequently: true });
    const w = maskCanvas.width;
    const h = maskCanvas.height;
    const imgData = ctx.getImageData(0, 0, w, h);
    const data = imgData.data;

    // Create inverted mask: where alpha=0 -> fill with mask color, where alpha>0 -> clear
    const newCanvas = document.createElement('canvas');
    newCanvas.width = w;
    newCanvas.height = h;
    const newCtx = newCanvas.getContext('2d');

    // Fill everything with mask color
    newCtx.fillStyle = MASK_COLOR;
    newCtx.fillRect(0, 0, w, h);

    // Use destination-out to erase where original mask existed
    newCtx.globalCompositeOperation = 'destination-out';
    newCtx.putImageData(imgData, 0, 0);

    // Copy back
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(newCanvas, 0, 0);
    saveHistory();
    updateMaskPercent();
  }, [saveHistory, updateMaskPercent]);

  // ── Export mask as black/white PNG Blob ────────────────────────────────
  const exportMask = useCallback(() => {
    const maskCanvas = maskCanvasRef.current;
    if (!maskCanvas) return null;
    const w = maskCanvas.width;
    const h = maskCanvas.height;

    // Create export canvas
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = w;
    exportCanvas.height = h;
    const ectx = exportCanvas.getContext('2d');

    // Get mask alpha data
    const maskData = maskCanvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h);
    const exportData = ectx.createImageData(w, h);

    // White where mask painted (alpha > 0), black elsewhere
    for (let i = 0; i < maskData.data.length; i += 4) {
      const hasMask = maskData.data[i + 3] > 0;
      exportData.data[i] = hasMask ? 255 : 0;       // R
      exportData.data[i + 1] = hasMask ? 255 : 0;   // G
      exportData.data[i + 2] = hasMask ? 255 : 0;   // B
      exportData.data[i + 3] = 255;                   // A (fully opaque)
    }

    ectx.putImageData(exportData, 0, 0);
    return exportCanvas;
  }, []);

  const handleConfirm = useCallback(async () => {
    const exportCanvas = exportMask();
    if (!exportCanvas) return;

    // Convert to base64 for API
    const dataUrl = exportCanvas.toDataURL('image/png');
    const base64 = dataUrl.split(',')[1];

    if (onConfirm) {
      onConfirm({ maskBase64: base64, maskCanvas: exportCanvas });
    }
    onClose?.();
  }, [exportMask, onConfirm, onClose]);

  // ── Upload external mask ──────────────────────────────────────────────
  const handleUploadMask = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const img = new Image();
    img.onload = () => {
      const maskCanvas = maskCanvasRef.current;
      if (!maskCanvas) return;
      const ctx = maskCanvas.getContext('2d', { willReadFrequently: true });
      ctx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
      // Draw uploaded mask as red overlay
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = maskCanvas.width;
      tempCanvas.height = maskCanvas.height;
      const tempCtx = tempCanvas.getContext('2d');
      tempCtx.drawImage(img, 0, 0, maskCanvas.width, maskCanvas.height);
      const data = tempCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height);
      // Convert white areas to red mask
      ctx.fillStyle = MASK_COLOR;
      for (let y = 0; y < maskCanvas.height; y++) {
        for (let x = 0; x < maskCanvas.width; x++) {
          const idx = (y * maskCanvas.width + x) * 4;
          const brightness = (data.data[idx] + data.data[idx + 1] + data.data[idx + 2]) / 3;
          if (brightness > 128) {
            ctx.fillRect(x, y, 1, 1);
          }
        }
      }
      saveHistory();
      updateMaskPercent();
    };
    img.src = URL.createObjectURL(file);
    e.target.value = '';
  }, [saveHistory, updateMaskPercent]);

  // ── Keyboard shortcuts ────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.code === 'Space') {
        e.preventDefault();
        spaceDownRef.current = true;
        setCompareMode(true);
      }
      if (e.ctrlKey && e.shiftKey && e.key === 'Z') {
        e.preventDefault();
        redo();
      } else if (e.ctrlKey && e.key === 'z') {
        e.preventDefault();
        undo();
      }
    };

    const handleKeyUp = (e) => {
      if (e.code === 'Space') {
        spaceDownRef.current = false;
        setCompareMode(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isOpen, undo, redo]);

  // ── Initialize on open ────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;

    // Load source image
    if (sourceImage?.url) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        imageRef.current = img;
        initCanvas();
        // Save initial empty state
        saveHistory();
      };
      img.onerror = () => {
        imageRef.current = null;
        initCanvas();
        saveHistory();
      };
      // Route external URLs through proxy to bypass CORS
      const imgSrc = sourceImage.url;
      if (imgSrc.startsWith('http://') || imgSrc.startsWith('https://')) {
        img.src = `/api/proxy-image?url=${encodeURIComponent(imgSrc)}`;
      } else {
        img.src = imgSrc;
      }
    } else {
      imageRef.current = null;
      initCanvas();
      saveHistory();
    }
  }, [isOpen, sourceImage, initCanvas, saveHistory]);

  // Wheel event must be non-passive for preventDefault
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e) => handleWheel(e);
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, [handleWheel]);

  if (!isOpen) return null;

  // ── Tool button style helper ──────────────────────────────────────────
  const toolBtnStyle = (isActive) => ({
    border: 'none',
    background: isActive ? 'var(--accent-primary)' : 'var(--bg-elevated)',
    color: isActive ? '#fff' : 'var(--text-secondary)',
    cursor: 'pointer',
    padding: 'var(--sp-2)',
    borderRadius: 'var(--radius-md)',
    transition: 'var(--transition-fast)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  });

  const subtleBtnStyle = {
    border: 'none',
    background: 'var(--bg-elevated)',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    padding: 'var(--sp-1) var(--sp-3)',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--fs-sm)',
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.75)',
        zIndex: 'var(--z-modal)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Top toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--sp-2)',
          padding: 'var(--sp-3) var(--sp-4)',
          background: 'var(--bg-panel)',
          borderBottom: '1px solid var(--border-subtle)',
          flexWrap: 'wrap',
        }}
      >
        {/* Brush tool */}
        <button className="btn btn-icon btn-sm" onClick={() => setActiveTool('brush')} style={toolBtnStyle(activeTool === 'brush')} title="画笔 (B)">
          <Paintbrush size={16} />
        </button>

        {/* Eraser tool */}
        <button className="btn btn-icon btn-sm" onClick={() => setActiveTool('eraser')} style={toolBtnStyle(activeTool === 'eraser')} title="橡皮擦 (E)">
          <Eraser size={16} />
        </button>

        {/* Brush size slider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
          <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
            笔刷大小
          </span>
          <input
            type="range"
            min={5}
            max={100}
            value={brushSize}
            onChange={(e) => setBrushSize(Number(e.target.value))}
            style={{ width: '120px', accentColor: 'var(--accent-primary)' }}
          />
          <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', minWidth: '28px', textAlign: 'center' }}>
            {brushSize}
          </span>
        </div>

        {/* Divider */}
        <div style={{ width: '1px', height: '24px', background: 'var(--border-subtle)', margin: '0 var(--sp-1)' }} />

        {/* Select all */}
        <button className="btn btn-subtle btn-sm" onClick={fillAll} style={subtleBtnStyle}>
          全选
        </button>

        {/* Clear */}
        <button className="btn btn-subtle btn-sm" onClick={clearMask} style={subtleBtnStyle}>
          清除
        </button>

        {/* Invert */}
        <button className="btn btn-subtle btn-sm" onClick={invertMask} style={{ ...subtleBtnStyle, display: 'flex', alignItems: 'center', gap: 'var(--sp-1)' }}>
          <FlipHorizontal size={14} />
          反转
        </button>

        {/* Divider */}
        <div style={{ width: '1px', height: '24px', background: 'var(--border-subtle)', margin: '0 var(--sp-1)' }} />

        {/* Undo */}
        <button
          className="btn btn-ghost btn-icon btn-sm"
          onClick={undo}
          disabled={historyIndex <= 0}
          style={{ ...toolBtnStyle(false), opacity: historyIndex <= 0 ? 0.4 : 1 }}
          title="撤销 (Ctrl+Z)"
        >
          <Undo2 size={16} />
        </button>

        {/* Redo */}
        <button
          className="btn btn-ghost btn-icon btn-sm"
          onClick={redo}
          disabled={historyIndex >= historyRef.current.length - 1}
          style={{ ...toolBtnStyle(false), opacity: historyIndex >= historyRef.current.length - 1 ? 0.4 : 1 }}
          title="重做 (Ctrl+Shift+Z)"
        >
          <Redo2 size={16} />
        </button>

        {/* Divider */}
        <div style={{ width: '1px', height: '24px', background: 'var(--border-subtle)', margin: '0 var(--sp-1)' }} />

        {/* Upload mask */}
        <label style={{ ...subtleBtnStyle, display: 'flex', alignItems: 'center', gap: 'var(--sp-1)', cursor: 'pointer' }}>
          <Upload size={14} />
          上传外部 Mask
          <input
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={handleUploadMask}
          />
        </label>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Compare toggle */}
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => setCompareMode(!compareMode)}
          style={{
            border: 'none',
            background: compareMode ? 'var(--accent-primary)' : 'var(--bg-elevated)',
            color: compareMode ? '#fff' : 'var(--text-secondary)',
            cursor: 'pointer',
            padding: 'var(--sp-1) var(--sp-3)',
            borderRadius: 'var(--radius-md)',
            fontSize: 'var(--fs-sm)',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--sp-1)',
          }}
          title="按住空格键预览原图"
        >
          {compareMode ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
          对比
        </button>

        {/* Close button */}
        <button
          className="btn btn-ghost btn-icon"
          onClick={onClose}
          style={{ border: 'none', background: 'transparent', color: 'var(--text-tertiary)', cursor: 'pointer', padding: 'var(--sp-2)', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center' }}
          aria-label="关闭"
        >
          <X size={18} />
        </button>
      </div>

      {/* Main content */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Canvas area */}
        <div
          ref={containerRef}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--bg-base)',
            position: 'relative',
            overflow: 'hidden',
            cursor: spaceDownRef.current ? 'grab' : (activeTool === 'eraser' ? 'cell' : 'crosshair'),
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        >
          {/* Canvas wrapper - sized to image */}
          <div
            style={{
              position: 'relative',
              maxWidth: '80%',
              maxHeight: '80%',
              boxShadow: 'var(--shadow-lg)',
              borderRadius: 'var(--radius-lg)',
              overflow: 'hidden',
            }}
          >
            {/* Background canvas */}
            <canvas
              ref={bgCanvasRef}
              style={{
                display: 'block',
                maxWidth: '100%',
                maxHeight: '70vh',
                objectFit: 'contain',
                transformOrigin: 'center center',
              }}
            />
            {/* Mask canvas overlay */}
            <canvas
              ref={maskCanvasRef}
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                opacity: compareMode ? 0 : 1,
                transition: 'opacity 0.15s ease',
                pointerEvents: 'none',
                transformOrigin: 'center center',
              }}
            />
          </div>

          {/* Brush cursor indicator */}
          <div
            style={{
              position: 'fixed',
              width: `${brushSize}px`,
              height: `${brushSize}px`,
              borderRadius: '50%',
              border: '2px solid rgba(255,255,255,0.6)',
              pointerEvents: 'none',
              display: 'none', // hidden; could be enabled with mouse tracking
              transform: 'translate(-50%, -50%)',
            }}
          />
        </div>

        {/* Right side info panel */}
        <div
          style={{
            width: '240px',
            minWidth: '240px',
            background: 'var(--bg-panel)',
            borderLeft: '1px solid var(--border-subtle)',
            padding: 'var(--sp-5)',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--sp-4)',
          }}
        >
          <h3 style={{ fontSize: 'var(--fs-base)', fontWeight: 'var(--fw-semibold)', color: 'var(--text-primary)', margin: 0 }}>
            遮罩编辑器
          </h3>

          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', padding: 'var(--sp-2) var(--sp-3)', background: 'var(--accent-primary)', color: '#fff', borderRadius: 'var(--radius-md)', fontSize: 'var(--fs-xs)', fontWeight: 'var(--fw-medium)' }}>
            <Info size={14} />
            仅 GPT-image-2 支持局部重绘
          </div>

          <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.6 }}>
            涂抹需要重新生成的区域。按住空格键预览原图。
          </p>

          {/* Legend */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
              <div style={{ width: '16px', height: '16px', borderRadius: 'var(--radius-sm)', background: 'rgba(220, 38, 38, 0.45)', border: '1px solid var(--border-subtle)' }} />
              <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)' }}>透明区域 = 重新生成</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
              <div style={{ width: '16px', height: '16px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }} />
              <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)' }}>不透明区域 = 保持不变</span>
            </div>
          </div>

          <div style={{ height: '1px', background: 'var(--border-subtle)' }} />

          {/* Shortcuts info */}
          <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', lineHeight: 1.8 }}>
            <div><kbd style={{ background: 'var(--bg-elevated)', padding: '1px 4px', borderRadius: '2px' }}>B</kbd> 画笔</div>
            <div><kbd style={{ background: 'var(--bg-elevated)', padding: '1px 4px', borderRadius: '2px' }}>E</kbd> 橡皮擦</div>
            <div><kbd style={{ background: 'var(--bg-elevated)', padding: '1px 4px', borderRadius: '2px' }}>[</kbd> / <kbd style={{ background: 'var(--bg-elevated)', padding: '1px 4px', borderRadius: '2px' }}>]</kbd> 笔刷大小</div>
            <div><kbd style={{ background: 'var(--bg-elevated)', padding: '1px 4px', borderRadius: '2px' }}>Ctrl+Z</kbd> 撤销</div>
            <div><kbd style={{ background: 'var(--bg-elevated)', padding: '1px 4px', borderRadius: '2px' }}>Ctrl+Shift+Z</kbd> 重做</div>
            <div><kbd style={{ background: 'var(--bg-elevated)', padding: '1px 4px', borderRadius: '2px' }}>Space</kbd> 对比原图</div>
            <div><kbd style={{ background: 'var(--bg-elevated)', padding: '1px 4px', borderRadius: '2px' }}>滚轮</kbd> 缩放</div>
          </div>
        </div>
      </div>

      {/* Bottom action bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: 'var(--sp-3) var(--sp-4)',
          background: 'var(--bg-panel)',
          borderTop: '1px solid var(--border-subtle)',
        }}
      >
        <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-muted)' }}>
          已选择约 {maskPercent}% 区域
        </span>

        <div style={{ display: 'flex', gap: 'var(--sp-3)' }}>
          <button
            className="btn btn-ghost"
            onClick={onClose}
            style={{ border: '1px solid var(--border-default)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', padding: 'var(--sp-2) var(--sp-4)', borderRadius: 'var(--radius-md)', fontSize: 'var(--fs-sm)', fontWeight: 'var(--fw-medium)', transition: 'var(--transition-fast)' }}
          >
            取消
          </button>
          <button
            className="btn btn-primary"
            onClick={handleConfirm}
            disabled={maskPercent === 0}
            style={{ border: 'none', background: maskPercent === 0 ? 'var(--bg-elevated)' : 'var(--accent-primary)', color: maskPercent === 0 ? 'var(--text-muted)' : '#fff', cursor: maskPercent === 0 ? 'not-allowed' : 'pointer', padding: 'var(--sp-2) var(--sp-4)', borderRadius: 'var(--radius-md)', fontSize: 'var(--fs-sm)', fontWeight: 'var(--fw-semibold)', transition: 'var(--transition-fast)' }}
          >
            确认 Mask
          </button>
        </div>
      </div>
    </div>
  );
}

export default MaskEditor;
