/**
 * TaskEngine – background task scheduler (singleton)
 *
 * Features:
 * - Max concurrent tasks (configurable, default 3)
 * - FIFO queue
 * - Exponential backoff retry (max 3 retries)
 * - Status state machine: queued -> running -> completed/failed/cancelled/paused
 * - Event emitter for status changes
 * - Progress tracking for async APIs (polling)
 * - Auto-persist task state to IndexedDB
 */

import { v4 as uuidv4 } from 'uuid';
import * as db from '../db/database';
import { notifyTaskComplete, notifyTaskFailed } from './notification';

// Status transitions:
//   queued   -> running | cancelled | paused
//   running  -> completed | failed | cancelled
//   paused   -> queued | cancelled
//   failed   -> queued (retry)

const VALID_TRANSITIONS = {
  queued: ['running', 'cancelled', 'paused'],
  running: ['completed', 'failed', 'cancelled'],
  paused: ['queued', 'cancelled'],
  failed: ['queued'], // retry
  completed: [],
  cancelled: ['queued'], // re-queue
};

class TaskEngineClass {
  constructor() {
    this._maxConcurrent = 3;
    this._queue = []; // { taskId, config, resolve, reject }
    this._active = new Map(); // taskId -> { config, controller, resolve, reject }
    this._listeners = new Map(); // event -> Set<callback>
    this._running = false;
  }

  // ── Public API ──────────────────────────────────────────────────────────

  /** Configure the max number of concurrent tasks. */
  setMaxConcurrent(n) {
    this._maxConcurrent = Math.max(1, n);
    this._processQueue();
  }

  /**
   * Submit a new task for execution.
   * @param {Object} config - { type, model, prompt, params, execute: async (ctx) => result }
   *   `execute` is an async function that performs the actual work.
   *   `ctx` provides { signal, onProgress(percent), taskId }.
   * @returns {string} taskId
   */
  async submit(config) {
    const taskId = uuidv4();

    // Persist to DB
    await db.addTask({
      id: taskId,
      type: config.type || 'generation',
      status: 'queued',
      model: config.model,
      prompt: config.prompt,
      params: config.params,
      progress: 0,
      error: null,
      result: null,
      retryCount: 0,
      createdAt: Date.now(),
    });

    // Add to queue
    return new Promise((resolve, reject) => {
      this._queue.push({ taskId, config, resolve, reject });
      this._emit('task:queued', { taskId });
      this._processQueue();
    });
  }

  /**
   * Submit with a DB-generated task id (for integration with stores).
   */
  async submitWithId(dbTaskId, config) {
    return new Promise((resolve, reject) => {
      this._queue.push({ taskId: dbTaskId, config, resolve, reject });
      this._emit('task:queued', { taskId: dbTaskId });
      this._processQueue();
    });
  }

  /** Cancel a task. */
  async cancel(taskId) {
    // If it's in the active set, abort it
    const active = this._active.get(taskId);
    if (active) {
      active.controller.abort();
      this._active.delete(taskId);
      await this._updateStatus(taskId, 'cancelled');
      this._emit('task:cancelled', { taskId });
      active.reject(new Error('Task cancelled'));
      this._processQueue();
      return;
    }

    // If it's in the queue, remove it
    const idx = this._queue.findIndex((item) => item.taskId === taskId);
    if (idx >= 0) {
      const [removed] = this._queue.splice(idx, 1);
      await this._updateStatus(taskId, 'cancelled');
      this._emit('task:cancelled', { taskId });
      removed.reject(new Error('Task cancelled'));
    }
  }

  /** Retry a failed task. */
  async retry(taskId) {
    const task = await db.getTask(taskId);
    if (!task) throw new Error(`Task ${taskId} not found`);
    if (task.status !== 'failed' && task.status !== 'cancelled') {
      throw new Error(`Cannot retry task in status: ${task.status}`);
    }

    await db.updateTask(taskId, {
      status: 'queued',
      error: null,
      progress: 0,
      retryCount: (task.retryCount || 0) + 1,
    });

    // Re-submit to queue
    return new Promise((resolve, reject) => {
      const config = {
        type: task.type,
        model: task.model,
        prompt: task.prompt,
        params: task.params,
        execute: task._executeFn, // stored reference (if available)
      };
      this._queue.push({ taskId, config, resolve, reject });
      this._emit('task:queued', { taskId });
      this._processQueue();
    });
  }

  /** Pause a queued or running task. */
  async pause(taskId) {
    const active = this._active.get(taskId);
    if (active) {
      active.controller.abort();
      this._active.delete(taskId);
      await this._updateStatus(taskId, 'paused');
      this._emit('task:paused', { taskId });
      this._processQueue();
      return;
    }

    const idx = this._queue.findIndex((item) => item.taskId === taskId);
    if (idx >= 0) {
      await this._updateStatus(taskId, 'paused');
      this._emit('task:paused', { taskId });
    }
  }

  /** Resume a paused task (re-queue it). */
  async resume(taskId) {
    const task = await db.getTask(taskId);
    if (!task || task.status !== 'paused') return;

    await db.updateTask(taskId, { status: 'queued' });
    this._emit('task:queued', { taskId });

    // Note: the execute function is lost on pause; caller should
    // re-submit with a new config if needed.
    this._processQueue();
  }

  /** Get aggregated stats. */
  getStats() {
    return {
      active: this._active.size,
      queued: this._queue.length,
      maxConcurrent: this._maxConcurrent,
    };
  }

  // ── Event emitter ──────────────────────────────────────────────────────

  on(event, callback) {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, new Set());
    }
    this._listeners.get(event).add(callback);
    return () => this._listeners.get(event)?.delete(callback);
  }

  off(event, callback) {
    this._listeners.get(event)?.delete(callback);
  }

  _emit(event, data) {
    this._listeners.get(event)?.forEach((cb) => {
      try {
        cb(data);
      } catch (err) {
        console.error(`[TaskEngine] Listener error for ${event}:`, err);
      }
    });
  }

  // ── Internal ───────────────────────────────────────────────────────────

  _processQueue() {
    while (this._active.size < this._maxConcurrent && this._queue.length > 0) {
      const item = this._queue.shift();
      this._runTask(item);
    }
  }

  async _runTask({ taskId, config, resolve, reject }) {
    const controller = new AbortController();
    this._active.set(taskId, { config, controller, resolve, reject });

    await this._updateStatus(taskId, 'running');
    this._emit('task:started', { taskId });

    try {
      const ctx = {
        signal: controller.signal,
        taskId,
        onProgress: async (percent) => {
          await db.updateTask(taskId, { progress: percent });
          this._emit('task:progress', { taskId, progress: percent });
        },
      };

      let result;
      if (typeof config.execute === 'function') {
        result = await config.execute(ctx);
      } else {
        // If no execute function provided, just mark as completed
        result = null;
      }

      if (!controller.signal.aborted) {
        await db.updateTask(taskId, {
          status: 'completed',
          progress: 100,
          result,
          updatedAt: Date.now(),
        });
        this._emit('task:completed', { taskId, result });
        // Browser notification
        notifyTaskComplete({ taskId, model: config.model, prompt: config.prompt, result });
        resolve(result);
      }
    } catch (err) {
      if (controller.signal.aborted) {
        // Already handled by cancel/pause
        return;
      }

      const task = await db.getTask(taskId);
      const retryCount = (task?.retryCount || 0) + 1;
      const maxRetries = 3;

      if (retryCount <= maxRetries && this._isRetryableError(err)) {
        // Exponential backoff then retry
        const backoff = 1000 * Math.pow(2, retryCount - 1);
        await new Promise((r) => setTimeout(r, backoff));

        await db.updateTask(taskId, {
          status: 'queued',
          retryCount,
          error: err.message,
          updatedAt: Date.now(),
        });
        this._emit('task:retry', { taskId, retryCount });
        this._queue.push({ taskId, config, resolve, reject });
      } else {
        await db.updateTask(taskId, {
          status: 'failed',
          error: err.message,
          updatedAt: Date.now(),
        });
        this._emit('task:failed', { taskId, error: err });
        // Browser notification
        notifyTaskFailed({ taskId, model: config.model, prompt: config.prompt, error: err });
        reject(err);
      }
    } finally {
      this._active.delete(taskId);
      this._processQueue();
    }
  }

  _isRetryableError(err) {
    // Retry on 5xx, network errors, timeouts
    const status = err?.status || err?.response?.status;
    if (status && status >= 500) return true;
    if (!status && err?.message?.includes('Network')) return true;
    return false;
  }

  async _updateStatus(taskId, status) {
    try {
      await db.updateTask(taskId, { status, updatedAt: Date.now() });
    } catch (err) {
      console.error(`[TaskEngine] Failed to update task ${taskId} status:`, err);
    }
  }
}

// ── Singleton export ──────────────────────────────────────────────────────
export const TaskEngine = new TaskEngineClass();
export default TaskEngine;
