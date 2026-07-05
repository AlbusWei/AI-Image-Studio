/**
 * useUIStore – global UI state
 *
 * Manages: sidebar collapse, lightbox, task panel, toast notifications,
 * and theme.
 */

import { create } from 'zustand';
import { produce } from 'immer';
import { v4 as uuidv4 } from 'uuid';

export const useUIStore = create((set, get) => ({
  // ── State ──────────────────────────────────────────────────────────────
  sidebarCollapsed: false,
  lightboxOpen: false,
  lightboxImageId: null,
  taskPanelOpen: false,
  toasts: [], // { id, type, message, duration }
  theme: 'dark', // 'dark' | 'light'

  // Mask editor state
  maskEditorOpen: false,
  maskEditorImage: null, // { url, id, ... } source image for masking
  maskEditorOnConfirm: null, // callback when mask is confirmed

  // Shortcut overlay state
  shortcutOverlayOpen: false,

  // ── Actions ────────────────────────────────────────────────────────────

  /** Toggle sidebar collapsed state. */
  toggleSidebar() {
    set(
      produce((state) => {
        state.sidebarCollapsed = !state.sidebarCollapsed;
      })
    );
  },

  /** Set sidebar collapsed state explicitly. */
  setSidebarCollapsed(collapsed) {
    set({ sidebarCollapsed: collapsed });
  },

  /** Open the lightbox on a specific image. */
  openLightbox(imageId) {
    set({ lightboxOpen: true, lightboxImageId: imageId });
  },

  /** Close the lightbox. */
  closeLightbox() {
    set({ lightboxOpen: false, lightboxImageId: null });
  },

  /** Toggle the task panel. */
  toggleTaskPanel() {
    set(
      produce((state) => {
        state.taskPanelOpen = !state.taskPanelOpen;
      })
    );
  },

  /** Open the task panel. */
  openTaskPanel() {
    set({ taskPanelOpen: true });
  },

  /** Close the task panel. */
  closeTaskPanel() {
    set({ taskPanelOpen: false });
  },

  /**
   * Add a toast notification.
   * @param {string} message - display text
   * @param {Object} [opts] - { type: 'success'|'error'|'info'|'warning', duration: ms }
   * @returns {string} toast id (for manual removal)
   */
  addToast(message, opts = {}) {
    const id = uuidv4();
    const toast = {
      id,
      type: opts.type || 'info',
      message,
      duration: opts.duration ?? 4000,
    };

    set(
      produce((state) => {
        state.toasts.push(toast);
      })
    );

    // Auto-remove after duration
    if (toast.duration > 0) {
      setTimeout(() => {
        get().removeToast(id);
      }, toast.duration);
    }

    return id;
  },

  /** Remove a toast by id. */
  removeToast(toastId) {
    set(
      produce((state) => {
        state.toasts = state.toasts.filter((t) => t.id !== toastId);
      })
    );
  },

  /** Clear all toasts. */
  clearToasts() {
    set({ toasts: [] });
  },

  /** Set the theme. */
  setTheme(theme) {
    set({ theme });
    // Apply to DOM
    document.documentElement.setAttribute('data-theme', theme);
  },

  /** Toggle between dark and light themes. */
  toggleTheme() {
    const current = get().theme;
    const next = current === 'dark' ? 'light' : 'dark';
    get().setTheme(next);
  },

  // ── Mask Editor ──────────────────────────────────────────────────────────

  /** Open the mask editor with a source image. */
  openMaskEditor(image, onConfirm) {
    set({ maskEditorOpen: true, maskEditorImage: image || null, maskEditorOnConfirm: onConfirm || null });
  },

  /** Close the mask editor. */
  closeMaskEditor() {
    set({ maskEditorOpen: false, maskEditorImage: null, maskEditorOnConfirm: null });
  },

  // ── Shortcut Overlay ─────────────────────────────────────────────────────

  /** Set shortcut overlay open state. */
  setShortcutOverlayOpen(open) {
    set({ shortcutOverlayOpen: open });
  },

  /** Toggle shortcut overlay. */
  toggleShortcutOverlay() {
    set(produce((state) => {
      state.shortcutOverlayOpen = !state.shortcutOverlayOpen;
    }));
  },
}));
