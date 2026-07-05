/**
 * useSettingsStore – app settings & model configuration
 *
 * Manages: model configs, storage config, expansion config, general
 * settings, setup-wizard completion flag. Persists to IndexedDB.
 */

import { create } from 'zustand';
import { produce } from 'immer';
import { MODELS } from '../constants/models';
import * as db from '../db/database';

/** Build default model configs from constants. */
function buildDefaultModelConfigs() {
  const configs = {};
  for (const [id, model] of Object.entries(MODELS)) {
    configs[id] = {
      enabled: true,
      defaultParams: { ...model.defaultParams },
    };
  }
  return configs;
}

const DEFAULT_STORAGE_CONFIG = {
  zone: 'hot', // 'hot' = IndexedDB, 'cold' = OSS
  autoCleanupDays: 30,
  thumbnailMaxDimension: 200,
  ossBucket: import.meta.env.VITE_OSS_BUCKET || '',
  ossRegion: import.meta.env.VITE_OSS_REGION || '',
};

const DEFAULT_EXPANSION_CONFIG = {
  enabled: true,
  model: import.meta.env.VITE_EXPANSION_LLM_MODEL || 'qwen-max',
  maxVariations: 4,
  temperature: 0.7,
};

const DEFAULT_GENERAL_CONFIG = {
  theme: 'dark',
  language: 'zh-CN',
  autoSave: true,
  maxConcurrentTasks: 3,
};

export const useSettingsStore = create((set, get) => ({
  // ── State ──────────────────────────────────────────────────────────────
  modelConfigs: buildDefaultModelConfigs(),
  storageConfig: { ...DEFAULT_STORAGE_CONFIG },
  expansionConfig: { ...DEFAULT_EXPANSION_CONFIG },
  generalConfig: { ...DEFAULT_GENERAL_CONFIG },
  isSetupComplete: false,
  isLoaded: false,

  // ── Actions ────────────────────────────────────────────────────────────

  /** Update a specific model's configuration. */
  updateModelConfig(modelId, changes) {
    set(
      produce((state) => {
        if (!state.modelConfigs[modelId]) {
          state.modelConfigs[modelId] = { enabled: true, defaultParams: {} };
        }
        Object.assign(state.modelConfigs[modelId], changes);
      })
    );
    get().saveSettings();
  },

  /** Update storage configuration. */
  updateStorageConfig(changes) {
    set(
      produce((state) => {
        Object.assign(state.storageConfig, changes);
      })
    );
    get().saveSettings();
  },

  /** Update LLM expansion configuration. */
  updateExpansionConfig(changes) {
    set(
      produce((state) => {
        Object.assign(state.expansionConfig, changes);
      })
    );
    get().saveSettings();
  },

  /** Update general app configuration. */
  updateGeneralConfig(changes) {
    set(
      produce((state) => {
        Object.assign(state.generalConfig, changes);
      })
    );
    get().saveSettings();
  },

  /** Mark setup wizard as complete. */
  async completeSetup() {
    set({ isSetupComplete: true });
    await db.setSetting('isSetupComplete', true);
    await get().saveSettings();
  },

  /** Load all settings from IndexedDB. */
  async loadSettings() {
    try {
      const saved = await db.getAllSettings();

      set(
        produce((state) => {
          if (saved.modelConfigs) {
            Object.assign(state.modelConfigs, saved.modelConfigs);
          }
          if (saved.storageConfig) {
            Object.assign(state.storageConfig, saved.storageConfig);
          }
          if (saved.expansionConfig) {
            Object.assign(state.expansionConfig, saved.expansionConfig);
          }
          if (saved.generalConfig) {
            Object.assign(state.generalConfig, saved.generalConfig);
          }
          state.isSetupComplete = saved.isSetupComplete || false;
          state.isLoaded = true;
        })
      );
    } catch (err) {
      console.error('[SettingsStore] loadSettings error:', err);
      set({ isLoaded: true });
    }
  },

  /** Persist current settings to IndexedDB. */
  async saveSettings() {
    try {
      const { modelConfigs, storageConfig, expansionConfig, generalConfig, isSetupComplete } = get();
      await db.setSetting('modelConfigs', modelConfigs);
      await db.setSetting('storageConfig', storageConfig);
      await db.setSetting('expansionConfig', expansionConfig);
      await db.setSetting('generalConfig', generalConfig);
      await db.setSetting('isSetupComplete', isSetupComplete);
    } catch (err) {
      console.error('[SettingsStore] saveSettings error:', err);
    }
  },

  /** Reset all settings to defaults. */
  resetToDefaults() {
    set({
      modelConfigs: buildDefaultModelConfigs(),
      storageConfig: { ...DEFAULT_STORAGE_CONFIG },
      expansionConfig: { ...DEFAULT_EXPANSION_CONFIG },
      generalConfig: { ...DEFAULT_GENERAL_CONFIG },
    });
    get().saveSettings();
  },
}));
