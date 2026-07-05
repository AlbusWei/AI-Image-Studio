import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  Search, Brain, ImageIcon, Grid3x3, List, Upload,
  ChevronDown, ChevronRight, Star, Trash2, RefreshCw,
  FolderInput, Download, X, Check, ImageOff, Info,
  Monitor, Calendar, Pin, Edit, Paintbrush, FolderOpen, Loader
} from 'lucide-react'
import { useGalleryStore } from '../stores/useGalleryStore'
import { useUIStore } from '../stores/useUIStore'
import { useGenerationStore } from '../stores/useGenerationStore'
import { proxyImageUrl } from '../services/api/client'
import * as db from '../db/database'

const SEARCH_TYPES = [
  { key: 'keyword', icon: Search, label: '关键词' },
  { key: 'semantic', icon: Brain, label: '语义' },
  { key: 'image', icon: ImageIcon, label: '以图搜图' },
]

const FILTER_CONFIG = [
  { key: 'model', label: '模型', options: [{ value: 'all', label: '全部' }, { value: 'qwen-image-3', label: 'Qwen Image 3' }, { value: 'gpt-image-2', label: 'GPT-image-2' }, { value: 'nanobanana-2', label: 'Nano Banana 2' }] },
  { key: 'date', label: '日期', options: [{ value: 'all', label: '全部' }, { value: 'today', label: '今天' }, { value: '7d', label: '最近7天' }, { value: '30d', label: '最近30天' }] },
  { key: 'ratio', label: '比例', options: [{ value: 'all', label: '全部' }, { value: 'landscape', label: '横版' }, { value: 'portrait', label: '竖版' }, { value: 'square', label: '方形' }] },
  { key: 'fav', label: '收藏', options: [{ value: 'all', label: '全部' }, { value: 'only', label: '仅收藏' }] },
]

function getImageDisplayUrl(img) {
  // blob URLs are local memory URLs, use them first (fastest)
  if (img.blobUrl) return img.blobUrl
  // thumbnail blob URL
  if (img.thumbnailUrl && img.thumbnailUrl.startsWith('blob:')) return img.thumbnailUrl
  // For remote URLs (http/https), wrap with CORS proxy
  const raw = img.thumbnailUrl || img.url || ''
  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    return proxyImageUrl(raw)
  }
  return raw
}
function getAspectLabel(img) {
  if (!img.width || !img.height) return null
  const r = img.width / img.height
  if (r > 1.1) return 'landscape'; if (r < 0.9) return 'portrait'; return 'square'
}

function groupImagesByTime(images) {
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const startOfYesterday = startOfToday - 86400000
  const startOfWeek = startOfToday - now.getDay() * 86400000
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime()
  const groups = { today: [], yesterday: [], week: [], month: [], earlier: [] }
  for (const img of images) {
    const t = img.createdAt || 0
    if (t >= startOfToday) groups.today.push(img)
    else if (t >= startOfYesterday) groups.yesterday.push(img)
    else if (t >= startOfWeek) groups.week.push(img)
    else if (t >= startOfMonth) groups.month.push(img)
    else groups.earlier.push(img)
  }
  const labels = { today: '今天', yesterday: '昨天', week: '本周', month: '本月', earlier: '更早' }
  return Object.entries(groups).filter(([, imgs]) => imgs.length > 0).map(([key, imgs]) => ({ id: key, label: labels[key], images: imgs }))
}

export default function Gallery() {
  const images = useGalleryStore((s) => s.images)
  const folders = useGalleryStore((s) => s.folders)
  const viewMode = useGalleryStore((s) => s.viewMode)
  const selectedImages = useGalleryStore((s) => s.selectedImages)
  const isLoading = useGalleryStore((s) => s.isLoading)
  const loadImages = useGalleryStore((s) => s.loadImages)
  const loadFolders = useGalleryStore((s) => s.loadFolders)
  const setViewMode = useGalleryStore((s) => s.setViewMode)
  const toggleFavorite = useGalleryStore((s) => s.toggleFavorite)
  const selectImage = useGalleryStore((s) => s.selectImage)
  const clearSelection = useGalleryStore((s) => s.clearSelection)
  const deleteImages = useGalleryStore((s) => s.deleteImages)
  const moveImages = useGalleryStore((s) => s.moveImages)
  const batchAction = useGalleryStore((s) => s.batchAction)
  const openLightbox = useUIStore((s) => s.openLightbox)
  const addToast = useUIStore((s) => s.addToast)
  const openMaskEditor = useUIStore((s) => s.openMaskEditor)
  const setPrompt = useGenerationStore((s) => s.setPrompt)
  const setModel = useGenerationStore((s) => s.setModel)
  const setParam = useGenerationStore((s) => s.setParam)
  const addReferenceImage = useGenerationStore((s) => s.addReferenceImage)
  const generate = useGenerationStore((s) => s.generate)
  const navigate = useNavigate()

  const [searchQuery, setSearchQuery] = useState('')
  const [searchType, setSearchType] = useState('keyword')
  const [activeFilter, setActiveFilter] = useState(null)
  const [filterValues, setFilterValues] = useState({ model: 'all', date: 'all', ratio: 'all', fav: 'all' })
  const [collapsedGroups, setCollapsedGroups] = useState([])
  const [selectedImage, setSelectedImage] = useState(null)
  const [hoveredImg, setHoveredImg] = useState(null)
  const [contextMenu, setContextMenu] = useState({ visible: false, x: 0, y: 0, image: null })
  const [displayCount, setDisplayCount] = useState(50)
  const [showFolderPicker, setShowFolderPicker] = useState(false)

  const fileInputRef = useRef(null)
  const importInputRef = useRef(null)
  const filterRef = useRef(null)
  const scrollRef = useRef(null)
  const location = useLocation()
  const params = new URLSearchParams(location.search)
  const viewFilter = params.get('filter')
  const folderParam = params.get('folder')

  useEffect(() => { loadImages(); loadFolders() }, [])
  useEffect(() => { if (folderParam) useGalleryStore.getState().setCurrentFolder(Number(folderParam)) }, [folderParam])
  useEffect(() => {
    const handler = (e) => { if (filterRef.current && !filterRef.current.contains(e.target)) setActiveFilter(null) }
    document.addEventListener('mousedown', handler); return () => document.removeEventListener('mousedown', handler)
  }, [])
  useEffect(() => {
    if (!contextMenu.visible) return
    const handler = () => setContextMenu((p) => ({ ...p, visible: false }))
    document.addEventListener('click', handler); return () => document.removeEventListener('click', handler)
  }, [contextMenu.visible])
  useEffect(() => {
    const timer = setTimeout(() => { useGalleryStore.getState().search(searchQuery, searchType) }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery, searchType])
  useEffect(() => {
    const f = {}
    if (filterValues.model !== 'all') f.model = filterValues.model
    if (filterValues.fav === 'only') f.favorite = true
    if (filterValues.date !== 'all') {
      const now = Date.now(); const ranges = { today: 86400000, '7d': 604800000, '30d': 2592000000 }
      if (ranges[filterValues.date]) f.dateRange = [now - ranges[filterValues.date], now]
    }
    useGalleryStore.getState().filter(f)
  }, [filterValues])
  useEffect(() => {
    if (viewFilter === 'favorites') useGalleryStore.getState().filter({ favorite: true })
    if (viewFilter === 'recent') { const now = Date.now(); useGalleryStore.getState().filter({ dateRange: [now - 604800000, now] }) }
  }, [viewFilter])

  const clientFiltered = useMemo(() => {
    let result = images
    if (filterValues.ratio !== 'all') result = result.filter((img) => getAspectLabel(img) === filterValues.ratio)
    return result
  }, [images, filterValues.ratio])
  const groups = useMemo(() => groupImagesByTime(clientFiltered.slice(0, displayCount)), [clientFiltered, displayCount])

  const handleScroll = useCallback((e) => {
    if (displayCount >= clientFiltered.length) return
    if (e.target.scrollHeight - e.target.scrollTop - e.target.clientHeight < 300) setDisplayCount((p) => p + 50)
  }, [displayCount, clientFiltered.length])

  const toggleGroup = (id) => setCollapsedGroups((p) => p.includes(id) ? p.filter((g) => g !== id) : [...p, id])
  const handleDelete = async (imgId) => { try { await deleteImages([imgId]); addToast('图片已删除', { type: 'success' }) } catch { addToast('删除失败', { type: 'error' }) } }
  const handleBatchDelete = async () => { try { await deleteImages(selectedImages); clearSelection(); addToast(`已删除 ${selectedImages.length} 张图片`, { type: 'success' }) } catch { addToast('批量删除失败', { type: 'error' }) } }
  const handleBatchFavorite = async () => { try { await batchAction('favorite'); addToast('批量收藏完成', { type: 'success' }) } catch { addToast('批量收藏失败', { type: 'error' }) } }
  const handleBatchMove = async (folderId) => { try { await moveImages(selectedImages, folderId); clearSelection(); addToast('已移动到文件夹', { type: 'success' }); setShowFolderPicker(false) } catch { addToast('移动失败', { type: 'error' }) } }
  const handleDownload = async (img) => { try { const url = getImageDisplayUrl(img); if (!url) return; const a = document.createElement('a'); a.href = url; a.download = `image_${img.id}.png`; a.click() } catch { addToast('下载失败', { type: 'error' }) } }

  // ── Import handler ──
  const handleImport = useCallback(async (e) => {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    e.target.value = ''
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp']
    const validFiles = files.filter(f => allowedTypes.includes(f.type))
    if (!validFiles.length) {
      addToast('请选择 JPG/PNG/WebP 格式的图片', { type: 'error' })
      return
    }
    const currentFolder = useGalleryStore.getState().currentFolder
    let imported = 0
    for (const file of validFiles) {
      try {
        // Read file as blob
        const blob = file
        // Generate thumbnail via Canvas resize
        const thumbUrl = await new Promise((resolve, reject) => {
          const img = new Image()
          const url = URL.createObjectURL(blob)
          img.onload = () => {
            try {
              const maxDim = 300
              const scale = Math.min(maxDim / img.width, maxDim / img.height, 1)
              const w = Math.round(img.width * scale)
              const h = Math.round(img.height * scale)
              const canvas = document.createElement('canvas')
              canvas.width = w
              canvas.height = h
              const ctx = canvas.getContext('2d')
              ctx.drawImage(img, 0, 0, w, h)
              canvas.toBlob((thumbBlob) => {
                URL.revokeObjectURL(url)
                if (thumbBlob) resolve(URL.createObjectURL(thumbBlob))
                else resolve(url)
              }, 'image/jpeg', 0.8)
            } catch (err) {
              URL.revokeObjectURL(url)
              resolve(url)
            }
          }
          img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('图片加载失败')) }
          img.src = url
        })
        const fullUrl = URL.createObjectURL(blob)
        // Get image dimensions
        const dims = await new Promise((resolve) => {
          const im = new Image()
          const u = URL.createObjectURL(blob)
          im.onload = () => { URL.revokeObjectURL(u); resolve({ width: im.width, height: im.height }) }
          im.onerror = () => { URL.revokeObjectURL(u); resolve({ width: 0, height: 0 }) }
          im.src = u
        })
        await db.addImage({
          batchId: null,
          folderId: currentFolder,
          model: 'imported',
          prompt: file.name.replace(/\.[^.]+$/, ''),
          url: fullUrl,
          thumbnailUrl: thumbUrl,
          params: {},
          favorite: false,
          storageZone: 'hot',
          status: 'completed',
          width: dims.width,
          height: dims.height,
          createdAt: Date.now(),
        })
        imported++
      } catch (err) {
        console.error('[Gallery] Import file error:', err)
      }
    }
    if (imported > 0) {
      addToast(`成功导入 ${imported} 张图片`, { type: 'success' })
      await loadImages()
    }
    if (imported < validFiles.length) {
      addToast(`${validFiles.length - imported} 张图片导入失败`, { type: 'error' })
    }
  }, [addToast, loadImages])

  // ── Batch export handler ──
  const handleBatchExport = useCallback(async () => {
    if (!selectedImages.length) return
    addToast(`正在导出 ${selectedImages.length} 张图片...`, { type: 'info' })
    let exported = 0
    for (const imgId of selectedImages) {
      try {
        const img = images.find(i => i.id === imgId)
        if (!img) continue
        const url = getImageDisplayUrl(img)
        if (!url) continue
        const a = document.createElement('a')
        a.href = url
        a.download = `image_${img.id}.png`
        a.click()
        exported++
        // Throttle downloads to avoid browser blocking
        if (exported < selectedImages.length) {
          await new Promise(r => setTimeout(r, 200))
        }
      } catch (err) {
        console.error('[Gallery] Export error:', err)
      }
    }
    addToast(`已导出 ${exported} 张图片`, { type: 'success' })
  }, [selectedImages, images, addToast])
  const openImageDetail = (img) => { setSelectedImage(img) }
  const closeImageDetail = () => setSelectedImage(null)

  // Context menu: 用相同参数再来一批
  const handleCtxRegenerateSame = useCallback((img) => {
    try {
      if (img.model) setModel(img.model)
      if (img.prompt) setPrompt(img.prompt)
      if (img.params) {
        Object.entries(img.params).forEach(([k, v]) => setParam(k, v))
      }
      navigate('/')
      setTimeout(() => { generate().catch(err => addToast('生成失败: ' + err.message, { type: 'error' })) }, 100)
      addToast('已加载参数，正在生成...', { type: 'info' })
    } catch (err) {
      addToast('操作失败: ' + err.message, { type: 'error' })
    }
  }, [setModel, setPrompt, setParam, generate, navigate, addToast])

  // Context menu: 以此图为参考图
  const handleCtxUseAsReference = useCallback((img) => {
    try {
      const imgUrl = getImageDisplayUrl(img) || img.url
      if (!imgUrl) {
        addToast('无法获取图片 URL', { type: 'error' })
        return
      }
      addReferenceImage({ blob: null, name: `ref-${img.id}`, url: imgUrl })
      navigate('/')
      addToast('已添加为参考图，请在工作区继续', { type: 'success' })
    } catch (err) {
      addToast('操作失败: ' + err.message, { type: 'error' })
    }
  }, [addReferenceImage, navigate, addToast])

  // Context menu: 微调 prompt 再生成
  const handleCtxEditPrompt = useCallback((img) => {
    try {
      if (img.prompt) setPrompt(img.prompt)
      if (img.model) setModel(img.model)
      if (img.params) {
        Object.entries(img.params).forEach(([k, v]) => setParam(k, v))
      }
      navigate('/')
      addToast('已加载提示词，请在工作区修改后生成', { type: 'info' })
    } catch (err) {
      addToast('操作失败: ' + err.message, { type: 'error' })
    }
  }, [setPrompt, setModel, setParam, navigate, addToast])

  // Context menu: 局部重绘
  const handleCtxInpaint = useCallback((img) => {
    try {
      const imgUrl = getImageDisplayUrl(img) || img.url
      if (!imgUrl) {
        addToast('无法获取图片 URL', { type: 'error' })
        return
      }
      openMaskEditor(imgUrl, null)
    } catch (err) {
      addToast('打开局部重绘失败: ' + err.message, { type: 'error' })
    }
  }, [openMaskEditor, addToast])

  // Context menu: 移动到文件夹 (single image)
  const [ctxMoveImageId, setCtxMoveImageId] = useState(null)
  const handleCtxMoveStart = useCallback((img) => {
    setCtxMoveImageId(img.id)
    setShowFolderPicker(true)
  }, [])
  const handleCtxMoveToFolder = useCallback(async (folderId) => {
    if (!ctxMoveImageId) return
    try {
      await db.updateImage(ctxMoveImageId, { folderId })
      addToast('已移动到文件夹', { type: 'success' })
      await loadImages()
    } catch (err) {
      addToast('移动失败: ' + err.message, { type: 'error' })
    } finally {
      setCtxMoveImageId(null)
      setShowFolderPicker(false)
    }
  }, [ctxMoveImageId, addToast, loadImages])

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: 'var(--bg-base)' }}>
      {selectedImages.length > 0 && (
        <div className="flex items-center gap-3 px-4 py-2" style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border-default)' }}>
          <Check size={14} style={{ color: 'var(--accent-primary)' }} />
          <span className="text-sm font-medium">已选 {selectedImages.length} 张</span>
          <div className="flex items-center gap-2 ml-auto">
            <button className="btn btn-ghost btn-sm" onClick={() => setShowFolderPicker(true)}><FolderInput size={14} /> 移动</button>
            <button className="btn btn-ghost btn-sm" onClick={handleBatchFavorite}><Star size={14} /> 收藏</button>
            <button className="btn btn-ghost btn-sm" onClick={handleBatchExport}><Download size={14} /> 导出</button>
            <button className="btn btn-danger btn-sm" onClick={handleBatchDelete}><Trash2 size={14} /> 淘汰</button>
          </div>
        </div>
      )}
      <div className="flex items-center gap-4 px-6 py-3 flex-shrink-0" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        <h1 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>画廊</h1>
        <div className="flex flex-col" style={{ maxWidth: 480, margin: '0 auto', flex: 1 }}>
          <div className="flex items-center gap-1" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-base)', padding: '0 4px 0 8px' }}>
            {SEARCH_TYPES.map(({ key, icon: Icon }) => (
              <button key={key} className="btn-icon" style={{ color: searchType === key ? 'var(--accent-primary)' : 'var(--text-muted)', opacity: searchType === key ? 1 : 0.5 }} onClick={() => setSearchType(key)} title={key}><Icon size={15} /></button>
            ))}
            {searchType === 'image' ? (
              <div className="flex items-center justify-center gap-2 flex-1" style={{ border: '1px dashed var(--border-default)', borderRadius: 'var(--radius-sm)', padding: '4px 8px', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 'var(--fs-sm)', minHeight: 32 }} onClick={() => fileInputRef.current?.click()}>
                <Upload size={14} /><span>以图搜图（即将推出）</span>
                <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={() => {}} />
              </div>
            ) : (
              <input className="input" style={{ border: 'none', background: 'transparent', boxShadow: 'none', flex: 1 }} placeholder={searchType === 'semantic' ? '语义搜索（即将推出）...' : '搜索提示词、标注...'} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} disabled={searchType === 'semantic'} />
            )}
          </div>
          {searchType !== 'keyword' && (
            <div className="flex items-center gap-1" style={{ marginTop: 4, paddingLeft: 4 }}>
              <Info size={11} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
              <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>{searchType === 'semantic' ? '语义搜索' : '以图搜图'}即将推出，当前仅支持关键词搜索</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button className="btn-icon" style={{ color: viewMode === 'grid' ? 'var(--text-primary)' : 'var(--text-muted)' }} onClick={() => setViewMode('grid')}><Grid3x3 size={16} /></button>
          <button className="btn-icon" style={{ color: viewMode === 'list' ? 'var(--text-primary)' : 'var(--text-muted)' }} onClick={() => setViewMode('list')}><List size={16} /></button>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => importInputRef.current?.click()}><Upload size={14} /> 导入</button>
        <input type="file" ref={importInputRef} style={{ display: 'none' }} accept="image/jpeg,image/png,image/webp" multiple onChange={handleImport} />
      </div>
      <div ref={filterRef} className="flex items-center gap-2 px-6 py-2 flex-wrap flex-shrink-0" style={{ borderBottom: '1px solid var(--border-subtle)', position: 'relative' }}>
        {FILTER_CONFIG.map((fc) => {
          const isOpen = activeFilter === fc.key; const currentOpt = fc.options.find((o) => o.value === filterValues[fc.key])
          return (
            <div key={fc.key} style={{ position: 'relative' }}>
              <span className="badge badge-default" style={{ background: isOpen ? 'rgba(108,92,231,0.18)' : 'rgba(108,92,231,0.10)', color: 'var(--text-secondary)', padding: '3px 10px', fontSize: 'var(--fs-sm)', cursor: 'pointer', userSelect: 'none' }} onClick={() => setActiveFilter(isOpen ? null : fc.key)}>
                {fc.label}: {currentOpt?.label || '全部'}<ChevronDown size={12} style={{ display: 'inline', marginLeft: 4, verticalAlign: -1 }} />
              </span>
              {isOpen && (
                <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4, minWidth: 140, background: 'var(--bg-panel)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-lg)', zIndex: 50, overflow: 'hidden' }}>
                  {fc.options.map((opt) => (
                    <div key={opt.value} style={{ padding: '6px 12px', fontSize: 'var(--fs-sm)', color: filterValues[fc.key] === opt.value ? 'var(--accent-primary)' : 'var(--text-secondary)', background: filterValues[fc.key] === opt.value ? 'rgba(108,92,231,0.08)' : 'transparent', cursor: 'pointer' }} onClick={() => { setFilterValues((p) => ({ ...p, [fc.key]: opt.value })); setActiveFilter(null) }}
                      onMouseEnter={(e) => { if (filterValues[fc.key] !== opt.value) e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }} onMouseLeave={(e) => { if (filterValues[fc.key] !== opt.value) e.currentTarget.style.background = 'transparent' }}>
                      {filterValues[fc.key] === opt.value && <Check size={12} style={{ display: 'inline', marginRight: 6, verticalAlign: -1 }} />}{opt.label}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
        <div className="ml-auto flex items-center gap-2">{isLoading && <Loader size={14} style={{ color: 'var(--text-muted)', animation: 'spin 1s linear infinite' }} />}<span className="text-xs" style={{ color: 'var(--text-muted)' }}>共 {clientFiltered.length} 张</span></div>
      </div>
      <div className="flex-1 overflow-y-auto px-6 py-4" ref={scrollRef} onScroll={handleScroll}>
        {groups.length === 0 && !isLoading && (
          <div className="flex flex-col items-center justify-center py-20" style={{ color: 'var(--text-muted)' }}>
            <ImageOff size={56} strokeWidth={1} style={{ marginBottom: 'var(--sp-4)', opacity: 0.4 }} />
            <p className="text-lg font-medium" style={{ color: 'var(--text-tertiary)' }}>暂无生成记录</p>
            <p className="text-sm mt-2" style={{ color: 'var(--text-muted)' }}>去工作区 <a href="#/" style={{ color: 'var(--accent-primary)', textDecoration: 'none' }}>生成你的第一张图片</a></p>
          </div>
        )}
        {groups.map((group) => {
          const isCollapsed = collapsedGroups.includes(group.id)
          return (
            <div key={group.id} style={{ marginBottom: 'var(--sp-6)' }}>
              <div className="flex items-center gap-3 cursor-pointer py-2 group no-select" onClick={() => toggleGroup(group.id)}>
                <button className="btn-icon" style={{ color: 'var(--text-tertiary)' }}>{isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}</button>
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{group.label}</span>
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{group.images.length}张</span>
                </div>
              </div>
              {!isCollapsed && (
                <div style={{ paddingLeft: 40 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: viewMode === 'grid' ? 'repeat(auto-fill, minmax(180px, 1fr))' : '1fr', gap: 'var(--sp-3)' }}>
                    {group.images.map((img) => {
                      const isSelected = selectedImages.includes(img.id); const isFav = img.favorite; const imgUrl = getImageDisplayUrl(img)
                      return (
                        <div key={img.id} className="relative" style={{ borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                          {viewMode === 'grid' ? (
                            <div className="ph-img" style={{ aspectRatio: '1', background: imgUrl ? `url(${imgUrl}) center/cover no-repeat` : 'var(--bg-elevated)', border: isSelected ? '2px solid var(--accent-primary)' : '1px solid var(--border-subtle)', cursor: 'pointer', minHeight: 120 }}
                              onClick={(e) => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); selectImage(img.id) } else { openImageDetail(img) } }}
                              onContextMenu={(e) => { e.preventDefault(); setContextMenu({ visible: true, x: e.clientX, y: e.clientY, image: img }) }}
                              onMouseEnter={() => setHoveredImg(img.id)} onMouseLeave={() => setHoveredImg(null)}>
                              {!imgUrl && <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}><ImageOff size={24} style={{ color: 'var(--text-muted)', opacity: 0.3 }} /></div>}
                              <div className="checkbox" style={{ position: 'absolute', top: 8, left: 8, opacity: isSelected ? 1 : 0, transition: 'opacity var(--transition-fast)', ...(isSelected ? { background: 'var(--accent-primary)', borderColor: 'var(--accent-primary)' } : {}) }} onClick={(e) => { e.stopPropagation(); selectImage(img.id) }}>{isSelected && <Check size={10} color="#fff" />}</div>
                              <div style={{ position: 'absolute', top: 8, right: 8, color: isFav ? 'var(--accent-warning)' : 'rgba(255,255,255,0.5)', cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); toggleFavorite(img.id) }}><Star size={14} fill={isFav ? 'currentColor' : 'none'} /></div>
                            </div>
                          ) : (
                            <div className="flex items-center gap-3 p-2" style={{ background: isSelected ? 'rgba(108,92,231,0.08)' : 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', cursor: 'pointer' }}
                              onClick={(e) => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); selectImage(img.id) } else { openImageDetail(img) } }}
                              onContextMenu={(e) => { e.preventDefault(); setContextMenu({ visible: true, x: e.clientX, y: e.clientY, image: img }) }}>
                              {imgUrl ? <img src={imgUrl} alt="" style={{ width: 48, height: 48, borderRadius: 'var(--radius-sm)', objectFit: 'cover', flexShrink: 0 }} /> : <div style={{ width: 48, height: 48, borderRadius: 'var(--radius-sm)', background: 'var(--bg-elevated)', flexShrink: 0 }} />}
                              <p className="text-sm flex-1 truncate" style={{ color: 'var(--text-secondary)' }}>{img.prompt}</p>
                              <div style={{ color: isFav ? 'var(--accent-warning)' : 'var(--text-muted)', cursor: 'pointer', flexShrink: 0 }} onClick={(e) => { e.stopPropagation(); toggleFavorite(img.id) }}><Star size={14} fill={isFav ? 'currentColor' : 'none'} /></div>
                            </div>
                          )}
                          {viewMode === 'grid' && (
                            <div className="absolute inset-0 flex items-center justify-center gap-2" style={{ background: 'rgba(0,0,0,0.55)', opacity: hoveredImg === img.id ? 1 : 0, transition: 'opacity var(--transition-fast)', borderRadius: 'var(--radius-md)', pointerEvents: hoveredImg === img.id ? 'auto' : 'none' }}>
                              <button className="btn-icon" style={{ color: '#fff' }} onClick={(e) => { e.stopPropagation(); toggleFavorite(img.id) }}><Star size={15} fill={isFav ? 'currentColor' : 'none'} /></button>
                              <button className="btn-icon" style={{ color: '#fff' }} onClick={(e) => { e.stopPropagation(); openLightbox(img.id) }}><Monitor size={15} /></button>
                              <button className="btn-icon" style={{ color: '#fff' }} onClick={(e) => { e.stopPropagation(); handleDelete(img.id) }}><Trash2 size={15} /></button>
                              <button className="btn-icon" style={{ color: '#fff' }} onClick={(e) => { e.stopPropagation(); handleDownload(img) }}><Download size={15} /></button>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )
        })}
        {isLoading && <div className="flex items-center justify-center py-8"><Loader size={20} style={{ color: 'var(--text-muted)', animation: 'spin 1s linear infinite' }} /><span className="text-sm ml-2" style={{ color: 'var(--text-muted)' }}>加载中...</span></div>}
        {displayCount < clientFiltered.length && !isLoading && <div className="flex items-center justify-center py-4"><button className="btn btn-subtle btn-sm" onClick={() => setDisplayCount((p) => p + 50)}>加载更多</button></div>}
      </div>
      {selectedImage && (
        <div style={{ position: 'fixed', top: 0, right: 0, width: 320, height: '100vh', background: 'var(--bg-panel)', borderLeft: '1px solid var(--border-default)', boxShadow: 'var(--shadow-lg)', zIndex: 1000, display: 'flex', flexDirection: 'column', overflow: 'hidden', animation: 'slideInRight 200ms ease-out' }}>
          <div className="flex items-center justify-between px-4 py-3 flex-shrink-0" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>图片详情</span>
            <button className="btn-icon" onClick={closeImageDetail}><X size={16} /></button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
            {getImageDisplayUrl(selectedImage) ? <img src={getImageDisplayUrl(selectedImage)} alt="" style={{ height: 240, objectFit: 'cover', borderRadius: 'var(--radius-base)', cursor: 'pointer' }} onClick={() => openLightbox(selectedImage.id)} /> : <div style={{ height: 240, borderRadius: 'var(--radius-base)', background: 'var(--bg-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ImageOff size={40} style={{ color: 'var(--text-muted)', opacity: 0.3 }} /></div>}
            <div><h3 className="text-xs font-semibold mb-2" style={{ color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 'var(--ls-wide)' }}>提示词</h3><p className="text-sm" style={{ color: 'var(--text-secondary)', lineHeight: 'var(--lh-relaxed)' }}>{selectedImage.prompt}</p></div>
            <div className="flex items-center gap-2"><span className="badge badge-accent">{selectedImage.model}</span><span className="text-xs" style={{ color: 'var(--text-muted)' }}><Calendar size={10} style={{ display: 'inline', verticalAlign: -1, marginRight: 2 }} />{selectedImage.createdAt ? new Date(selectedImage.createdAt).toLocaleDateString('zh-CN') : ''}</span></div>
            <div>
              <h3 className="text-xs font-semibold mb-2" style={{ color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 'var(--ls-wide)' }}><Monitor size={12} style={{ display: 'inline', verticalAlign: -1, marginRight: 4 }} />参数</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-2)', padding: 'var(--sp-3)', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                {[{ label: '尺寸', value: selectedImage.width && selectedImage.height ? `${selectedImage.width}x${selectedImage.height}` : (selectedImage.params?.size || '-') }, { label: '质量', value: selectedImage.params?.quality || '-' }, { label: 'Seed', value: selectedImage.params?.seed ?? '-' }, { label: '数量', value: selectedImage.params?.n ?? 1 }].map((p) => (
                  <div key={p.label}><span className="text-xs" style={{ color: 'var(--text-muted)' }}>{p.label}</span><p className="text-xs font-medium" style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{String(p.value)}</p></div>
                ))}
              </div>
            </div>
            <div>
              <h3 className="text-xs font-semibold mb-2" style={{ color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 'var(--ls-wide)' }}>操作</h3>
              <div className="flex items-center gap-2 flex-wrap">
                <button className="btn btn-ghost btn-sm" onClick={() => handleDownload(selectedImage)}><Download size={14} /> 下载</button>
                <button className="btn btn-ghost btn-sm" onClick={() => toggleFavorite(selectedImage.id)}><Star size={14} /> 收藏</button>
                <button className="btn btn-ghost btn-sm" onClick={() => openLightbox(selectedImage.id)}><Monitor size={14} /> 全屏</button>
                <button className="btn btn-danger btn-sm" onClick={() => { handleDelete(selectedImage.id); closeImageDetail() }}><Trash2 size={14} /> 删除</button>
              </div>
            </div>
          </div>
        </div>
      )}
      {showFolderPicker && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowFolderPicker(false)}>
          <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-lg)', padding: '20px', width: 320, maxHeight: 400, overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <p className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>选择目标文件夹</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <div style={{ padding: '8px 12px', borderRadius: 'var(--radius-md)', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 'var(--fs-sm)' }} onClick={() => ctxMoveImageId ? handleCtxMoveToFolder(null) : handleBatchMove(null)} onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }} onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}><FolderOpen size={14} style={{ display: 'inline', marginRight: 8, verticalAlign: -2 }} />未分类</div>
              {folders.map((f) => (<div key={f.id} style={{ padding: '8px 12px', borderRadius: 'var(--radius-md)', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 'var(--fs-sm)' }} onClick={() => ctxMoveImageId ? handleCtxMoveToFolder(f.id) : handleBatchMove(f.id)} onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }} onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}><FolderOpen size={14} style={{ display: 'inline', marginRight: 8, verticalAlign: -2 }} />{f.name}</div>))}
            </div>
          </div>
        </div>
      )}
      {contextMenu.visible && contextMenu.image && (
        <div style={{ position: 'fixed', top: contextMenu.y, left: contextMenu.x, width: 200, background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-lg)', zIndex: 9999, padding: '4px 0', overflow: 'hidden' }} onClick={(e) => e.stopPropagation()}>
          {[{ icon: RefreshCw, label: '用相同参数再来一批', action: () => handleCtxRegenerateSame(contextMenu.image) }, { icon: Pin, label: '以此图为参考图', action: () => handleCtxUseAsReference(contextMenu.image) }, { icon: Edit, label: '微调 prompt 再生成', action: () => handleCtxEditPrompt(contextMenu.image) }, { icon: Paintbrush, label: '局部重绘', action: () => handleCtxInpaint(contextMenu.image) }].map(({ icon: Icon, label, action }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', padding: '6px 12px', fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', cursor: 'pointer' }} onClick={() => { action(); setContextMenu((p) => ({ ...p, visible: false })) }} onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }} onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}><Icon size={14} /><span>{label}</span></div>
          ))}
          <div style={{ height: 1, background: 'var(--border-subtle)', margin: '4px 0' }} />
          {[{ icon: FolderOpen, label: '移动到文件夹', action: () => handleCtxMoveStart(contextMenu.image) }, { icon: Star, label: contextMenu.image.favorite ? '取消收藏' : '收藏', action: () => toggleFavorite(contextMenu.image.id) }, { icon: Trash2, label: '淘汰', action: () => handleDelete(contextMenu.image.id) }, { icon: Download, label: '导出', action: () => handleDownload(contextMenu.image) }].map(({ icon: Icon, label, action }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', padding: '6px 12px', fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', cursor: 'pointer' }} onClick={() => { action(); setContextMenu((p) => ({ ...p, visible: false })) }} onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }} onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}><Icon size={14} /><span>{label}</span></div>
          ))}
        </div>
      )}
      <style>{`@keyframes slideInRight { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } } @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
