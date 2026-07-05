/**
 * Notification service – Browser Notification API wrapper
 *
 * Usage:
 *   import { requestPermission, notifyTaskComplete, notifyTaskFailed } from './notification';
 *   // At startup:
 *   requestPermission();
 *   // On task events:
 *   notifyTaskComplete(task);
 *   notifyTaskFailed(task);
 */

let _permissionGranted = false;

/**
 * Request notification permission from the user.
 * Call once at app startup.
 */
export async function requestPermission() {
  if (!('Notification' in window)) {
    console.warn('[Notification] Browser does not support Notification API');
    return false;
  }

  if (Notification.permission === 'granted') {
    _permissionGranted = true;
    return true;
  }

  if (Notification.permission === 'denied') {
    console.warn('[Notification] Permission previously denied');
    return false;
  }

  try {
    const result = await Notification.requestPermission();
    _permissionGranted = result === 'granted';
    return _permissionGranted;
  } catch (err) {
    console.error('[Notification] Permission request failed:', err);
    return false;
  }
}

/**
 * Send a browser notification.
 * @param {Object} opts - { title, body, icon, tag, image }
 */
function sendNotification({ title, body, icon, tag, image }) {
  if (!_permissionGranted || Notification.permission !== 'granted') return;

  try {
    const notification = new Notification(title, {
      body: body || '',
      icon: icon || '/favicon.ico',
      tag: tag || 'ai-image-studio',
      image: image || undefined,
      silent: false,
    });

    // Auto-close after 5 seconds
    setTimeout(() => notification.close(), 5000);

    // Click to focus the app window
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
  } catch (err) {
    console.error('[Notification] Failed to send:', err);
  }
}

/**
 * Notify that a task has completed successfully.
 * @param {Object} task - { type, model, prompt, result }
 */
export function notifyTaskComplete(task) {
  const model = task?.model || '未知模型';
  const promptPreview = (task?.prompt || '').slice(0, 60);
  const imageCount = task?.result?.images?.length || 0;

  sendNotification({
    title: '✓ 生成完成',
    body: `${model} · ${imageCount}张图片已生成\n${promptPreview}${promptPreview.length >= 60 ? '...' : ''}`,
    tag: `task-complete-${task?.taskId || Date.now()}`,
  });
}

/**
 * Notify that a task has failed.
 * @param {Object} task - { type, model, prompt, error }
 */
export function notifyTaskFailed(task) {
  const model = task?.model || '未知模型';
  const errorMsg = task?.error?.message || '未知错误';

  sendNotification({
    title: '✗ 生成失败',
    body: `${model} · ${errorMsg}`,
    tag: `task-failed-${task?.taskId || Date.now()}`,
  });
}

/**
 * Generic info notification.
 * @param {string} title
 * @param {string} body
 */
export function notifyInfo(title, body) {
  sendNotification({ title, body, tag: `info-${Date.now()}` });
}
