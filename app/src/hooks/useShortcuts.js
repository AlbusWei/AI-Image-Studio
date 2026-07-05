/**
 * useShortcuts – centralized keyboard shortcut system
 *
 * Uses react-hotkeys-hook v5 with scope-based enable/disable.
 * 5 layers (priority order):
 *   1. mask-editor (highest, when MaskEditor is open)
 *   2. lightbox    (when Lightbox is open)
 *   3. workbench   (on Workbench page)
 *   4. gallery     (on Gallery page)
 *   5. global      (always enabled)
 */

import { useHotkeys, useHotkeysContext } from 'react-hotkeys-hook';
import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useUIStore } from '../stores/useUIStore';
import { useGenerationStore } from '../stores/useGenerationStore';

/**
 * Call this inside App.jsx to wire up all global + context-aware shortcuts.
 */
export function useGlobalShortcuts() {
  const navigate = useNavigate();
  const location = useLocation();
  const { toggleScope } = useHotkeysContext();

  const lightboxOpen = useUIStore(s => s.lightboxOpen);
  const closeLightbox = useUIStore(s => s.closeLightbox);
  const openLightbox = useUIStore(s => s.openLightbox);
  const maskEditorOpen = useUIStore(s => s.maskEditorOpen);
  const shortcutOverlayOpen = useUIStore(s => s.shortcutOverlayOpen);
  const setShortcutOverlayOpen = useUIStore(s => s.setShortcutOverlayOpen);
  const generate = useGenerationStore(s => s.generate);
  const expandPrompt = useGenerationStore(s => s.expandPrompt);
  const setModel = useGenerationStore(s => s.setModel);
  const isGenerating = useGenerationStore(s => s.isGenerating);
  const addToast = useUIStore(s => s.addToast);

  // Manage scope activation based on UI state
  const isOnWorkbench = location.pathname === '/';
  const isOnGallery = location.pathname === '/gallery';

  // Sync scopes with UI state
  useHotkeys('*', () => {}, {
    enabled: true,
    scopes: [],
  });

  // ── Global shortcuts ──────────────────────────────────────────────────

  // ? - toggle shortcut overlay
  useHotkeys('shift+/', (e) => {
    e.preventDefault();
    setShortcutOverlayOpen(!shortcutOverlayOpen);
  }, { scopes: ['global'], preventDefault: true });

  useHotkeys('escape', () => {
    if (shortcutOverlayOpen) {
      setShortcutOverlayOpen(false);
    } else if (lightboxOpen) {
      closeLightbox();
    }
  }, { scopes: ['global'] });

  // G then W - go to Workbench
  useHotkeys('g>w', () => navigate('/'), { scopes: ['global'], preventDefault: true });
  // G then G - go to Gallery
  useHotkeys('g>g', () => navigate('/gallery'), { scopes: ['global'], preventDefault: true });
  // G then K - go to Knowledge Base
  useHotkeys('g>k', () => navigate('/knowledge-base'), { scopes: ['global'], preventDefault: true });
  // G then T - go to Task Center
  useHotkeys('g>t', () => navigate('/task-center'), { scopes: ['global'], preventDefault: true });

  // ── Workbench shortcuts ───────────────────────────────────────────────

  // Enter or Cmd/Ctrl+Enter - generate
  useHotkeys('mod+enter', async (e) => {
    e.preventDefault();
    if (!isGenerating) {
      try { await generate(); } catch {}
    }
  }, { scopes: ['workbench'], preventDefault: true });

  // E - expand prompt
  useHotkeys('e', async () => {
    try { await expandPrompt(); } catch {}
  }, { scopes: ['workbench'] });

  // 1/2/3 - switch models
  useHotkeys('1', () => setModel('qwen-image-3'), { scopes: ['workbench'] });
  useHotkeys('2', () => setModel('gpt-image-2'), { scopes: ['workbench'] });
  useHotkeys('3', () => setModel('nanobanana-2'), { scopes: ['workbench'] });

  // ── Lightbox shortcuts ────────────────────────────────────────────────
  // Note: arrow keys, F, D, C are handled inside Lightbox component already
  // We add them here for completeness, but Lightbox has its own keydown handler

  // ── Mask editor shortcuts ─────────────────────────────────────────────
  // These are handled inside MaskEditor component via direct keydown listeners
  // for better control (B, E, [, ], Ctrl+Z, Ctrl+Shift+Z, Space)

  // Return scope management helpers for App.jsx to use
  return {
    toggleScope,
    isOnWorkbench,
    isOnGallery,
    lightboxOpen,
    maskEditorOpen,
  };
}

/**
 * Hook to activate/deactivate scopes based on current UI context.
 * Call this in App.jsx after useGlobalShortcuts.
 */
export function useShortcutScopes(context) {
  const { toggleScope, isOnWorkbench, isOnGallery, lightboxOpen, maskEditorOpen } = context;

  // Scope management must happen inside useEffect to comply with React rules.
  // Global scope is always active (managed by HotkeysProvider initialScopes).
  useEffect(() => {
    // Workbench scope
    toggleScope('workbench', isOnWorkbench && !lightboxOpen && !maskEditorOpen);

    // Gallery scope
    toggleScope('gallery', isOnGallery && !lightboxOpen);

    // Lightbox scope
    toggleScope('lightbox', lightboxOpen && !maskEditorOpen);

    // Mask editor scope (highest priority)
    toggleScope('mask-editor', !!maskEditorOpen);
  }, [toggleScope, isOnWorkbench, isOnGallery, lightboxOpen, maskEditorOpen]);
}

/**
 * All shortcut definitions for the overlay display.
 */
export const SHORTCUT_GROUPS = [
  {
    title: '全局',
    shortcuts: [
      { keys: ['?'], description: '快捷键速查' },
      { keys: ['G', 'W'], description: '工作台' },
      { keys: ['G', 'G'], description: '图库' },
      { keys: ['G', 'K'], description: '知识库' },
      { keys: ['G', 'T'], description: '任务中心' },
      { keys: ['Esc'], description: '关闭浮层/Lightbox' },
    ],
  },
  {
    title: '工作台',
    shortcuts: [
      { keys: ['⌘', '↵'], description: '生成图片' },
      { keys: ['E'], description: '扩写提示词' },
      { keys: ['1'], description: 'Qwen Image 3' },
      { keys: ['2'], description: 'GPT Image 2' },
      { keys: ['3'], description: 'Nano Banana 2' },
    ],
  },
  {
    title: 'Lightbox',
    shortcuts: [
      { keys: ['←'], description: '上一张' },
      { keys: ['→'], description: '下一张' },
      { keys: ['F'], description: '收藏/取消收藏' },
      { keys: ['D'], description: '下载' },
      { keys: ['C'], description: '复制 Prompt' },
      { keys: ['Esc'], description: '关闭' },
    ],
  },
  {
    title: 'Mask 编辑器',
    shortcuts: [
      { keys: ['B'], description: '画笔工具' },
      { keys: ['E'], description: '橡皮擦工具' },
      { keys: ['['], description: '减小笔刷' },
      { keys: [']'], description: '增大笔刷' },
      { keys: ['Ctrl', 'Z'], description: '撤销' },
      { keys: ['Ctrl', 'Shift', 'Z'], description: '重做' },
      { keys: ['Space'], description: '预览原图' },
    ],
  },
];
