import { useState, useEffect, useCallback, useRef } from 'react';
import StorageService from '../services/storage';
import { proxyImageUrl } from '../services/api/client';
import { updateImage } from '../db/database';

/**
 * useLazyLoadUrl — 懒加载图片原图并管理 blob URL 生命周期
 *
 * Fallback 优先级：
 * 1. 本地原图 blob（Electron: readImage IPC / 浏览器: StorageService）
 * 2. OSS URL（用户自有 bucket 的长期 URL）
 * 3. 远程 sourceUrl（24h 临时 URL，via proxy）
 * 4. 不在此 hook 处理（由调用方的 fallback 函数兜底）
 *
 * - isOpen 变为 false 时自动释放所有 blob URL
 * - revokeUrl(id) 可手动释放单张图片的 blob URL（如淘汰时）
 *
 * @param {boolean} isOpen - 是否需要懒加载（如 Lightbox 打开状态）
 * @param {string|number|null} imageId - 当前图片 ID
 * @param {string|null} ossUrl - OSS 长期存储 URL
 * @param {string|null} sourceUrl - 远程临时 URL（24h 有效）
 * @returns {{ urls: Record<string, string>, revokeUrl: (id: string|number) => void }}
 */
export function useLazyLoadUrl(isOpen, imageId, ossUrl = null, sourceUrl = null) {
  const [urls, setUrls] = useState({});
  const urlsRef = useRef({});

  // 懒加载原图
  useEffect(() => {
    if (!isOpen || !imageId) return;
    if (urlsRef.current[imageId]) return; // 已加载

    let cancelled = false;

    (async () => {
      let blob = null;
      let localFound = false; // 标记本地是否已有原图

      // Step 1: 尝试从本地 originals/ 读取
      if (window.electronAPI?.fs) {
        const result = await window.electronAPI.fs.readImage(imageId);
        if (result?.buffer && !cancelled) {
          // 直接使用 result.buffer，不做多余的 Uint8Array 包装
          blob = new Blob([result.buffer], { type: result.mimeType || 'image/png' });
          localFound = true;
        }
        // Electron 环境 readImage 返回 null 表示原图不存在，继续尝试远程
      } else if (!cancelled) {
        // 仅浏览器环境走 StorageService
        blob = await StorageService.getImage(imageId);
        if (blob) localFound = true;
      }

      // Step 2: 本地没有 → 尝试从 OSS URL 下载
      if (!blob && !cancelled && ossUrl) {
        try {
          const resp = await fetch(proxyImageUrl(ossUrl));
          if (resp.ok) blob = await resp.blob();
        } catch (e) {
          console.warn('[useLazyLoadUrl] OSS fetch failed:', e);
        }
      }

      // Step 3: OSS 没有 → 尝试从 sourceUrl 下载（24h 内有效）
      if (!blob && !cancelled && sourceUrl) {
        try {
          const resp = await fetch(proxyImageUrl(sourceUrl));
          if (resp.ok) blob = await resp.blob();
        } catch (e) {
          console.warn('[useLazyLoadUrl] sourceUrl fetch failed:', e);
        }
      }

      if (blob && !cancelled) {
        const url = URL.createObjectURL(blob);
        urlsRef.current = { ...urlsRef.current, [imageId]: url };
        setUrls(prev => ({ ...prev, [imageId]: url }));

        // ── 远程下载成功后的持久化（best-effort，不阻塞显示） ──
        if (!localFound) {
          // 1. 保存到本地 originals/ 目录（Electron 环境）
          if (window.electronAPI?.fs?.saveImage) {
            blob.arrayBuffer().then(buf => {
              window.electronAPI.fs.saveImage(imageId, new Uint8Array(buf), blob.type || 'image/png')
                .then(() => console.log('[useLazyLoadUrl] Saved remote image to local originals:', imageId))
                .catch(e => console.warn('[useLazyLoadUrl] Failed to save to local:', e));
            }).catch(() => {});
          }

          // 2. 上传到 OSS（best-effort，非阻塞）
          (async () => {
            try {
              const ossKey = `images/${imageId}/${Date.now()}.png`;
              const ossUrlResult = await StorageService.uploadToOSS(blob, ossKey);
              if (ossUrlResult) {
                await updateImage(imageId, { ossUrl: ossUrlResult, ossKey });
                console.log('[useLazyLoadUrl] OSS upload success:', ossUrlResult);
              }
            } catch (e) {
              console.warn('[useLazyLoadUrl] OSS upload skipped:', e?.message);
            }
          })();
        }
      }
    })();

    return () => { cancelled = true; };
  }, [isOpen, imageId, ossUrl, sourceUrl]);

  // 手动释放单张 blob URL（供 handleDiscard 等场景使用）
  const revokeUrl = useCallback((id) => {
    if (urlsRef.current[id]) {
      URL.revokeObjectURL(urlsRef.current[id]);
      const next = { ...urlsRef.current };
      delete next[id];
      urlsRef.current = next;
      setUrls(prev => {
        const copy = { ...prev };
        delete copy[id];
        return copy;
      });
    }
  }, []);

  // isOpen 变为 false 时释放所有 blob URL
  useEffect(() => {
    if (!isOpen && Object.keys(urlsRef.current).length > 0) {
      Object.values(urlsRef.current).forEach(url => URL.revokeObjectURL(url));
      urlsRef.current = {};
      setUrls({});
    }
  }, [isOpen]);

  return { urls, revokeUrl };
}
