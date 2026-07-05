/**
 * useGalleryStore – Gallery & folder management
 *
 * Manages: image list, folders, view mode, search, filters, selection.
 */

import { create } from 'zustand';
import { produce } from 'immer';
import * as db from '../db/database';

export const useGalleryStore = create((set, get) => ({
  // ── State ──────────────────────────────────────────────────────────────
  images: [],
  folders: [],
  currentFolder: null, // null = root / "all images"
  viewMode: 'grid', // 'grid' | 'list'
  searchQuery: '',
  searchType: 'keyword', // 'keyword' | 'semantic' | 'visual'
  filters: {
    model: null,
    favorite: false,
    dateRange: null,
  },
  selectedImages: [],
  isLoading: false,

  // ── Actions ────────────────────────────────────────────────────────────

  /** Load images from IndexedDB (with optional filters). */
  async loadImages() {
    set({ isLoading: true });
    try {
      const { currentFolder, filters, searchQuery, searchType } = get();

      let images;
      if (searchQuery.trim() && searchType === 'keyword') {
        images = await db.searchImages(searchQuery);
        if (currentFolder !== null) {
          images = images.filter((img) => img.folderId === currentFolder);
        }
      } else {
        images = await db.getImages({
          folderId: currentFolder ?? undefined,
          model: filters.model || undefined,
          favorite: filters.favorite || undefined,
        });
      }

      // Apply client-side date range filter if set
      if (filters.dateRange) {
        const [start, end] = filters.dateRange;
        images = images.filter(
          (img) => img.createdAt >= start && img.createdAt <= end
        );
      }

      set({ images, isLoading: false });
    } catch (err) {
      console.error('[GalleryStore] loadImages error:', err);
      set({ isLoading: false });
    }
  },

  /** Load folders tree from DB. */
  async loadFolders() {
    try {
      const folders = await db.getFolders();
      set({ folders });
    } catch (err) {
      console.error('[GalleryStore] loadFolders error:', err);
    }
  },

  /** Search images. */
  async search(query, type = 'keyword') {
    set({ searchQuery: query, searchType: type });
    await get().loadImages();
  },

  /** Update filters and reload. */
  filter(newFilters) {
    set(
      produce((state) => {
        Object.assign(state.filters, newFilters);
      })
    );
    get().loadImages();
  },

  /** Toggle favorite on an image. */
  async toggleFavorite(imageId) {
    const newVal = await db.toggleImageFavorite(imageId);
    set(
      produce((state) => {
        const img = state.images.find((i) => i.id === imageId);
        if (img) img.favorite = newVal;
      })
    );
  },

  /** Move selected (or provided) images to a folder. */
  async moveImages(imageIds, folderId) {
    const ids = imageIds || get().selectedImages;
    if (ids.length === 0) return;
    await db.moveImages(ids, folderId);
    set({ selectedImages: [] });
    await get().loadImages();
  },

  /** Delete selected (or provided) images. */
  async deleteImages(imageIds) {
    const ids = imageIds || get().selectedImages;
    if (ids.length === 0) return;
    await db.deleteImages(ids);
    set(
      produce((state) => {
        state.images = state.images.filter((i) => !ids.includes(i.id));
        state.selectedImages = state.selectedImages.filter(
          (id) => !ids.includes(id)
        );
      })
    );
  },

  /** Create a new folder. */
  async createFolder(name, parentId = null) {
    const id = await db.addFolder({ name, parentId, createdAt: Date.now() });
    await get().loadFolders();
    return id;
  },

  /** Rename a folder. */
  async renameFolder(folderId, newName) {
    await db.updateFolder(folderId, { name: newName });
    await get().loadFolders();
  },

  /** Delete a folder and move its images to root. */
  async deleteFolder(folderId) {
    await db.deleteFolder(folderId);
    if (get().currentFolder === folderId) {
      set({ currentFolder: null });
    }
    await get().loadFolders();
    await get().loadImages();
  },

  /** Navigate to a folder. */
  setCurrentFolder(folderId) {
    set({ currentFolder: folderId, selectedImages: [] });
    get().loadImages();
  },

  /** Set view mode (grid / list). */
  setViewMode(mode) {
    set({ viewMode: mode });
  },

  /** Select / deselect an image. */
  selectImage(imageId) {
    set(
      produce((state) => {
        const idx = state.selectedImages.indexOf(imageId);
        if (idx >= 0) {
          state.selectedImages.splice(idx, 1);
        } else {
          state.selectedImages.push(imageId);
        }
      })
    );
  },

  /** Clear selection. */
  clearSelection() {
    set({ selectedImages: [] });
  },

  /** Execute a batch action on selected images. */
  async batchAction(action, payload = {}) {
    const { selectedImages } = get();
    if (selectedImages.length === 0) return;

    switch (action) {
      case 'favorite':
        for (const id of selectedImages) {
          await db.toggleImageFavorite(id);
        }
        break;
      case 'move':
        await db.moveImages(selectedImages, payload.folderId);
        break;
      case 'delete':
        await db.deleteImages(selectedImages);
        break;
      default:
        console.warn('[GalleryStore] Unknown batch action:', action);
        return;
    }

    set({ selectedImages: [] });
    await get().loadImages();
  },
}));
