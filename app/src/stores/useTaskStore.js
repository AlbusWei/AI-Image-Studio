/**
 * useTaskStore – background task management
 *
 * Manages: task list, active count, and actions (add, update, retry,
 * cancel, pause, stats).
 *
 * Bridges TaskEngine events into Zustand state for live UI updates.
 */

import { create } from 'zustand';
import * as db from '../db/database';
import TaskEngine from '../services/task-engine';

export const useTaskStore = create((set, get) => ({
  // ── State ──────────────────────────────────────────────────────────────
  tasks: [],
  activeTaskCount: 0,
  _bridgeInitialized: false,

  // ── Actions ────────────────────────────────────────────────────────────

  /** Load all tasks from DB. */
  async loadTasks() {
    try {
      const tasks = await db.getTasks();
      const activeCount = tasks.filter(
        (t) => t.status === 'running' || t.status === 'queued'
      ).length;
      set({ tasks, activeTaskCount: activeCount });
    } catch (err) {
      console.error('[TaskStore] loadTasks error:', err);
    }
  },

  /**
   * Initialize the event bridge between TaskEngine and this store.
   * Call once at app startup.
   */
  initBridge() {
    if (get()._bridgeInitialized) return;

    const refresh = () => get().loadTasks();

    // Listen to all TaskEngine events and refresh task list
    const events = [
      'task:queued', 'task:started', 'task:progress',
      'task:completed', 'task:failed', 'task:cancelled',
      'task:paused', 'task:retry',
    ];

    const unsubscribers = events.map((evt) =>
      TaskEngine.on(evt, async (data) => {
        console.log(`[TaskStore] Engine event: ${evt}`, data);
        await refresh();
      })
    );

    set({ _bridgeInitialized: true });

    // Return cleanup function
    return () => {
      unsubscribers.forEach((unsub) => unsub());
    };
  },

  /** Add a new task record. */
  async addTask(taskConfig) {
    try {
      const id = await db.addTask({
        type: taskConfig.type || 'generation',
        status: 'queued',
        model: taskConfig.model,
        prompt: taskConfig.prompt,
        params: taskConfig.params,
        error: null,
        progress: 0,
        result: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      await get().loadTasks();
      return id;
    } catch (err) {
      console.error('[TaskStore] addTask error:', err);
      throw err;
    }
  },

  /** Update an existing task's fields. */
  async updateTask(taskId, changes) {
    try {
      await db.updateTask(taskId, { ...changes, updatedAt: Date.now() });
      await get().loadTasks();
    } catch (err) {
      console.error('[TaskStore] updateTask error:', err);
    }
  },

  /** Remove a task. */
  async removeTask(taskId) {
    try {
      await db.deleteTask(taskId);
      await get().loadTasks();
    } catch (err) {
      console.error('[TaskStore] removeTask error:', err);
    }
  },

  /** Retry a failed task via TaskEngine. */
  async retryTask(taskId) {
    try {
      await TaskEngine.retry(taskId);
      await get().loadTasks();
    } catch (err) {
      console.error('[TaskStore] retryTask error:', err);
      // Fallback to manual retry
      await get().updateTask(taskId, {
        status: 'queued',
        error: null,
        progress: 0,
        retryCount: 0,
      });
    }
  },

  /** Cancel a task via TaskEngine. */
  async cancelTask(taskId) {
    try {
      await TaskEngine.cancel(taskId);
      await get().loadTasks();
    } catch (err) {
      console.error('[TaskStore] cancelTask error:', err);
      await get().updateTask(taskId, { status: 'cancelled' });
    }
  },

  /** Pause a running or queued task via TaskEngine. */
  async pauseTask(taskId) {
    try {
      await TaskEngine.pause(taskId);
      await get().loadTasks();
    } catch (err) {
      console.error('[TaskStore] pauseTask error:', err);
      await get().updateTask(taskId, { status: 'paused' });
    }
  },

  /** Resume a paused task via TaskEngine. */
  async resumeTask(taskId) {
    try {
      await TaskEngine.resume(taskId);
      await get().loadTasks();
    } catch (err) {
      console.error('[TaskStore] resumeTask error:', err);
      await get().updateTask(taskId, { status: 'queued' });
    }
  },

  /** Get aggregated task stats. */
  async getTaskStats() {
    return await db.getTaskStats();
  },

  /** Clear all completed tasks. */
  async clearCompleted() {
    const tasks = get().tasks.filter((t) => t.status === 'completed');
    for (const t of tasks) {
      await db.deleteTask(t.id);
    }
    await get().loadTasks();
  },
}));
