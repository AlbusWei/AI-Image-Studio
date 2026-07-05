import React, { useState, useEffect, useCallback } from 'react'
import {
  Search, Grid3x3, List, Edit3, Trash2, X, Save, Check,
  BookOpen, Tag, Calendar, Cpu, Plus, ImagePlus, FileText, Sparkles, Loader
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { addCasePackage, getCasePackages, deleteCasePackage } from '../db/database'
import { getLLMAdapter } from '../services/api'
import { useGenerationStore } from '../stores/useGenerationStore'
import { useUIStore } from '../stores/useUIStore'
import db from '../db/database'

/* ── component ── */
export default function KnowledgeBase() {
  const navigate = useNavigate()
  const addToast = useUIStore(s => s.addToast)

  const [viewMode, setViewMode] = useState('grid')
  const [cases, setCases] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCase, setSelectedCase] = useState(null)
  const [filterModel, setFilterModel] = useState('all')
  const [showDetailPanel, setShowDetailPanel] = useState(false)
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [annotationDraft, setAnnotationDraft] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isAnnotating, setIsAnnotating] = useState(false)

  /* Editable prompt states */
  const [editingOriginalPrompt, setEditingOriginalPrompt] = useState(false)
  const [editedOriginalPrompt, setEditedOriginalPrompt] = useState('')
  const [editingExpandedPrompt, setEditingExpandedPrompt] = useState(false)
  const [editedExpandedPrompt, setEditedExpandedPrompt] = useState('')

  /* Date filter */
  const [filterDate, setFilterDate] = useState('all')

  /* ── Load from DB ── */
  useEffect(() => {
    (async () => {
      setIsLoading(true)
      try {
        const pkgs = await getCasePackages()
        setCases(pkgs.map(p => ({
          id: p.id,
          imageId: p.imageId,
          imageUrl: p.imageUrl || '',
          prompt: p.prompt || '',
          model: p.model || '',
          date: p.createdAt ? new Date(p.createdAt).toISOString().slice(0, 10) : '',
          tags: p.tags || [],
          color: p.color || 'linear-gradient(135deg, #667eea, #764ba2)',
          fullPrompt: p.fullPrompt || p.prompt || '',
          expandedPrompt: p.expandedPrompt || '',
          annotation: p.annotation || '',
          params: p.params || {},
        })))
      } catch (err) {
        console.error('[KnowledgeBase] load error:', err)
      } finally {
        setIsLoading(false)
      }
    })()
  }, [])

  /* helpers */
  const openDetail = (c) => {
    setSelectedCase(c)
    setAnnotationDraft(c.annotation)
    setShowDetailPanel(true)
    setEditingOriginalPrompt(false)
    setEditedOriginalPrompt(c.fullPrompt)
    setEditingExpandedPrompt(false)
    setEditedExpandedPrompt(c.expandedPrompt || '')
  }

  const closeDetail = () => {
    setShowDetailPanel(false)
    setTimeout(() => setSelectedCase(null), 300)
  }

  /* Update case in local state and optionally DB */
  const updateCase = useCallback(async (id, changes) => {
    setCases(prev => prev.map(c => c.id === id ? { ...c, ...changes } : c))
    setSelectedCase(prev => prev && prev.id === id ? { ...prev, ...changes } : prev)
    try {
      await db.casePackages.update(id, changes)
    } catch (err) {
      console.error('[KnowledgeBase] update error:', err)
    }
  }, [])

  /* Delete case */
  const handleDelete = useCallback(async (id) => {
    if (!window.confirm('确认从知识库移除此案例？')) return
    try {
      await deleteCasePackage(id)
      setCases(prev => prev.filter(c => c.id !== id))
      if (selectedCase?.id === id) closeDetail()
      addToast('已从知识库移除', { type: 'success' })
    } catch (err) {
      addToast('移除失败', { type: 'error' })
    }
  }, [selectedCase, addToast])

  /* Save annotation */
  const handleSaveAnnotation = useCallback(async () => {
    if (!selectedCase) return
    await updateCase(selectedCase.id, { annotation: annotationDraft })
    addToast('标注已保存', { type: 'success' })
  }, [selectedCase, annotationDraft, updateCase, addToast])

  /* LLM AI annotation */
  const handleAIAnnotation = useCallback(async () => {
    if (!selectedCase) return
    setIsAnnotating(true)
    try {
      const llm = getLLMAdapter()
      const result = await llm.chat([
        {
          role: 'system',
          content: '你是一个专业的AI图像分析助手。请根据提供的提示词和参数，生成结构化的案例标注。格式：\n场景描述：...\n画面特征：...\n风格关键词：...\n可复用技巧：...'
        },
        {
          role: 'user',
          content: `请为以下图像生成案例标注：\n提示词：${selectedCase.fullPrompt}\n扩写提示词：${selectedCase.expandedPrompt || '无'}\n模型：${selectedCase.model}\n参数：${JSON.stringify(selectedCase.params)}`
        }
      ])
      setAnnotationDraft(result)
      addToast('AI标注生成完成', { type: 'success' })
    } catch (err) {
      addToast(`AI标注失败: ${err.message}`, { type: 'error' })
    } finally {
      setIsAnnotating(false)
    }
  }, [selectedCase, addToast])

  /* Use this case - navigate to workbench with params */
  const handleUseCase = useCallback((c) => {
    const store = useGenerationStore.getState()
    if (c.model) {
      const modelMap = { 'GPT-image-2': 'gpt-image-2', 'Qwen Image 3': 'qwen-image-3', 'Nano Banana 2': 'nanobanana-2' }
      const modelId = modelMap[c.model] || c.model
      store.setModel(modelId)
    }
    if (c.prompt) store.setPrompt(c.fullPrompt || c.prompt)
    if (c.params) {
      Object.entries(c.params).forEach(([k, v]) => {
        if (k !== 'model') store.setParam(k, v)
      })
    }
    navigate('/')
    addToast('已填充案例参数到工作台', { type: 'success' })
  }, [navigate, addToast])

  /* Add new case package */
  const handleAddCase = useCallback(async (newCase) => {
    try {
      const pkg = {
        imageId: newCase.imageId || null,
        imageUrl: newCase.imageUrl || '',
        prompt: newCase.prompt || '',
        model: newCase.model || '',
        tags: newCase.tags || [],
        color: newCase.color || 'linear-gradient(135deg, #667eea, #764ba2)',
        fullPrompt: newCase.fullPrompt || newCase.prompt || '',
        expandedPrompt: newCase.expandedPrompt || '',
        annotation: newCase.annotation || '',
        params: newCase.params || {},
        createdAt: Date.now(),
      }
      const id = await addCasePackage(pkg)
      setCases(prev => [{ ...pkg, id, date: new Date().toISOString().slice(0, 10) }, ...prev])
      addToast('已添加到知识库', { type: 'success' })
    } catch (err) {
      addToast('添加失败', { type: 'error' })
    }
  }, [addToast])

  /* LLM annotation in add dialog */
  const [addAnnotationDraft, setAddAnnotationDraft] = useState('')
  const [addPrompt, setAddPrompt] = useState('')
  const [isAddAnnotating, setIsAddAnnotating] = useState(false)

  const handleAddAIAnnotation = useCallback(async () => {
    if (!addPrompt.trim()) return
    setIsAddAnnotating(true)
    try {
      const llm = getLLMAdapter()
      const result = await llm.chat([
        {
          role: 'system',
          content: '你是一个专业的AI图像分析助手。请根据提示词生成结构化案例标注。格式：\n场景描述：...\n画面特征：...\n风格关键词：...\n可复用技巧：...'
        },
        { role: 'user', content: `请为以下提示词生成案例标注：${addPrompt}` }
      ])
      setAddAnnotationDraft(result)
    } catch (err) {
      addToast(`AI标注失败: ${err.message}`, { type: 'error' })
    } finally {
      setIsAddAnnotating(false)
    }
  }, [addPrompt, addToast])

  const filteredCases = cases.filter((c) => {
    if (filterModel !== 'all' && c.model !== filterModel) return false
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      const inPrompt = (c.prompt || '').toLowerCase().includes(q)
      const inAnnotation = (c.annotation || '').toLowerCase().includes(q)
      const inTags = (c.tags || []).some(t => t.toLowerCase().includes(q))
      if (!inPrompt && !inAnnotation && !inTags) return false
    }
    if (filterDate === '7d') {
      const daysAgo = (Date.now() - new Date(c.date).getTime()) / (1000 * 60 * 60 * 24)
      if (daysAgo > 7) return false
    } else if (filterDate === '30d') {
      const daysAgo = (Date.now() - new Date(c.date).getTime()) / (1000 * 60 * 60 * 24)
      if (daysAgo > 30) return false
    }
    return true
  })

  /* ── render ── */
  return (
    <div className="flex h-full overflow-hidden" style={{ background: 'var(--bg-base)' }}>
      {/* Main content */}
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Top bar */}
        <div className="flex items-center gap-4 px-6 py-3 flex-shrink-0" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>知识库</h1>
            <span className="badge badge-accent">{cases.length} 案例包</span>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <div className="flex items-center gap-1">
              <button className="btn-icon" style={{ color: viewMode === 'grid' ? 'var(--text-primary)' : 'var(--text-muted)' }} onClick={() => setViewMode('grid')}>
                <Grid3x3 size={16} />
              </button>
              <button className="btn-icon" style={{ color: viewMode === 'list' ? 'var(--text-primary)' : 'var(--text-muted)' }} onClick={() => setViewMode('list')}>
                <List size={16} />
              </button>
            </div>

            <div className="flex items-center gap-1" style={{ position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: 10, color: 'var(--text-muted)', pointerEvents: 'none' }} />
              <input className="input" style={{ paddingLeft: 32, width: 200 }} placeholder="搜索案例..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            </div>

            <select className="select" value={filterModel} onChange={(e) => setFilterModel(e.target.value)}>
              <option value="all">全部模型</option>
              <option value="GPT-image-2">GPT-image-2</option>
              <option value="Qwen Image 3">Qwen Image 3</option>
              <option value="Nano Banana 2">Nano Banana 2</option>
            </select>

            <select className="select" value={filterDate} onChange={(e) => setFilterDate(e.target.value)}>
              <option value="all">全部时间</option>
              <option value="7d">最近7天</option>
              <option value="30d">最近30天</option>
            </select>

            <button className="btn btn-primary btn-sm" onClick={() => { setShowAddDialog(true); setAddPrompt(''); setAddAnnotationDraft(''); }}>
              <Plus size={14} /> 加入知识库
            </button>
          </div>
        </div>

        {/* Info text */}
        <div className="px-6 py-2 flex-shrink-0" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            <BookOpen size={12} style={{ display: 'inline', verticalAlign: -1, marginRight: 4 }} />
            知识库案例用于提示词扩写的 RAG 检索，案例越多质量越高
          </p>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60%', color: 'var(--text-muted)' }}>
              <Loader size={24} style={{ animation: 'spin 1s linear infinite', marginRight: 8 }} />
              加载中...
            </div>
          ) : filteredCases.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60%', color: 'var(--text-muted)', gap: 'var(--sp-3)' }}>
              <BookOpen size={48} style={{ opacity: 0.3 }} />
              <span style={{ fontSize: 'var(--fs-sm)' }}>
                {cases.length === 0 ? '知识库为空，点击"加入知识库"添加案例' : '没有匹配的案例'}
              </span>
            </div>
          ) : viewMode === 'grid' ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 'var(--sp-4)' }}>
              {filteredCases.map((c) => (
                <div key={c.id} className="card relative" style={{ cursor: 'pointer', padding: 0, overflow: 'hidden' }} onClick={() => openDetail(c)}>
                  {/* Thumbnail */}
                  <div style={{ height: 160, background: c.imageUrl ? `url(${c.imageUrl}) center/cover` : c.color, borderRadius: 'var(--radius-base) var(--radius-base) 0 0' }} />

                  <div style={{ padding: 'var(--sp-3) var(--sp-4) var(--sp-4)' }}>
                    <p className="text-sm" style={{ color: 'var(--text-secondary)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', marginBottom: 'var(--sp-2)', lineHeight: 'var(--lh-relaxed)' }}>
                      {c.prompt}
                    </p>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="badge badge-accent">{c.model}</span>
                      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        <Calendar size={10} style={{ display: 'inline', verticalAlign: -1, marginRight: 2 }} />
                        {c.date}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 flex-wrap">
                      {(c.tags || []).map((t) => (
                        <span key={t} className="badge badge-default" style={{ fontSize: 'var(--fs-xs)' }}>
                          <Tag size={9} /> {t}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Hover actions */}
                  <div className="absolute flex items-center gap-1" style={{ top: 8, right: 8, opacity: 0, transition: 'opacity var(--transition-fast)' }}
                    onMouseEnter={(e) => { e.currentTarget.style.opacity = '1' }}
                    onMouseLeave={(e) => { e.currentTarget.style.opacity = '0' }}>
                    <button className="btn-icon" style={{ background: 'rgba(0,0,0,0.6)', color: '#fff' }} onClick={(e) => { e.stopPropagation(); openDetail(c) }}>
                      <Edit3 size={14} />
                    </button>
                    <button className="btn-icon" style={{ background: 'rgba(0,0,0,0.6)', color: '#fff' }} onClick={(e) => { e.stopPropagation(); handleDelete(c.id) }}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {filteredCases.map((c) => (
                <div key={c.id} className="flex items-center gap-3 p-3"
                  style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', cursor: 'pointer', transition: 'background var(--transition-fast)' }}
                  onClick={() => openDetail(c)}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-card-hover)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--bg-card)' }}>
                  <div style={{ width: 56, height: 56, borderRadius: 'var(--radius-sm)', background: c.imageUrl ? `url(${c.imageUrl}) center/cover` : c.color, flexShrink: 0 }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate" style={{ color: 'var(--text-secondary)' }}>{c.prompt}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="badge badge-accent" style={{ fontSize: 'var(--fs-xs)' }}>{c.model}</span>
                      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{c.date}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button className="btn-icon" style={{ color: 'var(--text-muted)' }} onClick={(e) => { e.stopPropagation(); openDetail(c) }}>
                      <Edit3 size={14} />
                    </button>
                    <button className="btn-icon" style={{ color: 'var(--text-muted)' }} onClick={(e) => { e.stopPropagation(); handleDelete(c.id) }}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Detail side panel */}
      {showDetailPanel && selectedCase && (
        <div style={{ width: 420, flexShrink: 0, background: 'var(--bg-panel)', borderLeft: '1px solid var(--border-default)', display: 'flex', flexDirection: 'column', overflow: 'hidden', animation: 'slideInRight 200ms ease-out' }}>
          <div className="flex items-center justify-between px-4 py-3 flex-shrink-0" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>案例详情</span>
            <button className="btn-icon" onClick={closeDetail}><X size={16} /></button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
            {/* Image preview */}
            <div style={{ height: 240, borderRadius: 'var(--radius-base)', background: selectedCase.imageUrl ? `url(${selectedCase.imageUrl}) center/cover` : selectedCase.color }} />

            {/* Original prompt */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-semibold" style={{ color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 'var(--ls-wide)' }}>
                  <FileText size={12} style={{ display: 'inline', verticalAlign: -1, marginRight: 4 }} />
                  原始提示词
                </h3>
                {!editingOriginalPrompt && (
                  <button className="btn-icon" style={{ color: 'var(--text-muted)' }} onClick={() => { setEditedOriginalPrompt(selectedCase.fullPrompt); setEditingOriginalPrompt(true) }}>
                    <Edit3 size={13} />
                  </button>
                )}
              </div>
              {editingOriginalPrompt ? (
                <div>
                  <textarea className="textarea" rows={4} value={editedOriginalPrompt} onChange={(e) => setEditedOriginalPrompt(e.target.value)} style={{ fontSize: 'var(--fs-sm)', lineHeight: 'var(--lh-relaxed)', marginBottom: 'var(--sp-2)' }} />
                  <div className="flex items-center gap-2">
                    <button className="btn btn-primary btn-sm" onClick={() => { updateCase(selectedCase.id, { fullPrompt: editedOriginalPrompt }); setEditingOriginalPrompt(false) }}>
                      <Save size={12} /> 保存
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => { setEditingOriginalPrompt(false); setEditedOriginalPrompt(selectedCase.fullPrompt) }}>
                      取消
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-sm" style={{ color: 'var(--text-secondary)', lineHeight: 'var(--lh-relaxed)' }}>
                  {selectedCase.fullPrompt}
                </p>
              )}
            </div>

            {/* Expanded prompt */}
            {selectedCase.expandedPrompt && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-semibold" style={{ color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 'var(--ls-wide)' }}>
                    <Sparkles size={12} style={{ display: 'inline', verticalAlign: -1, marginRight: 4 }} />
                    扩写提示词
                  </h3>
                  {!editingExpandedPrompt && (
                    <button className="btn-icon" style={{ color: 'var(--text-muted)' }} onClick={() => { setEditedExpandedPrompt(selectedCase.expandedPrompt); setEditingExpandedPrompt(true) }}>
                      <Edit3 size={13} />
                    </button>
                  )}
                </div>
                {editingExpandedPrompt ? (
                  <div>
                    <textarea className="textarea" rows={4} value={editedExpandedPrompt} onChange={(e) => setEditedExpandedPrompt(e.target.value)} style={{ fontSize: 'var(--fs-sm)', lineHeight: 'var(--lh-relaxed)', marginBottom: 'var(--sp-2)' }} />
                    <div className="flex items-center gap-2">
                      <button className="btn btn-primary btn-sm" onClick={() => { updateCase(selectedCase.id, { expandedPrompt: editedExpandedPrompt }); setEditingExpandedPrompt(false) }}>
                        <Save size={12} /> 保存
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={() => { setEditingExpandedPrompt(false); setEditedExpandedPrompt(selectedCase.expandedPrompt) }}>
                        取消
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm" style={{ color: 'var(--text-secondary)', lineHeight: 'var(--lh-relaxed)' }}>
                    {selectedCase.expandedPrompt}
                  </p>
                )}
              </div>
            )}

            {/* Model & params */}
            <div>
              <h3 className="text-xs font-semibold mb-2" style={{ color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 'var(--ls-wide)' }}>
                <Cpu size={12} style={{ display: 'inline', verticalAlign: -1, marginRight: 4 }} />
                模型与参数
              </h3>
              <div className="flex flex-col gap-2 p-3" style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                {selectedCase.params && Object.entries(selectedCase.params).map(([key, val]) => (
                  <div key={key} className="flex items-center justify-between">
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{key}</span>
                    <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                      {String(val)}
                    </span>
                  </div>
                ))}
                {(!selectedCase.params || Object.keys(selectedCase.params).length === 0) && (
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>无参数信息</span>
                )}
              </div>
            </div>

            {/* User annotation */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-semibold" style={{ color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 'var(--ls-wide)' }}>
                  <Edit3 size={12} style={{ display: 'inline', verticalAlign: -1, marginRight: 4 }} />
                  用户标注
                </h3>
                <button
                  className="btn btn-subtle btn-sm"
                  onClick={handleAIAnnotation}
                  disabled={isAnnotating}
                  style={{ fontSize: 'var(--fs-xs)', display: 'flex', alignItems: 'center', gap: '4px' }}
                >
                  {isAnnotating ? <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Sparkles size={12} />}
                  AI标注
                </button>
              </div>
              <textarea className="textarea" rows={6} value={annotationDraft} onChange={(e) => setAnnotationDraft(e.target.value)} style={{ fontSize: 'var(--fs-sm)', lineHeight: 'var(--lh-relaxed)' }} />
            </div>
          </div>

          {/* Panel footer */}
          <div className="flex items-center gap-2 px-4 py-3 flex-shrink-0" style={{ borderTop: '1px solid var(--border-subtle)' }}>
            <button className="btn btn-primary btn-sm flex-1" onClick={handleSaveAnnotation}>
              <Save size={14} /> 保存标注
            </button>
            <button className="btn btn-subtle btn-sm" onClick={() => handleUseCase(selectedCase)}>
              <ImagePlus size={14} /> 使用此案例
            </button>
            <button className="btn btn-danger btn-sm" onClick={() => handleDelete(selectedCase.id)}>
              <Trash2 size={14} /> 移除
            </button>
          </div>
        </div>
      )}

      {/* Add to KB dialog */}
      {showAddDialog && (
        <div className="fixed inset-0 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)', zIndex: 'var(--z-modal)' }} onClick={() => setShowAddDialog(false)}>
          <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-dialog)', width: 520, maxHeight: '80vh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <span className="text-md font-semibold" style={{ color: 'var(--text-primary)' }}>加入知识库</span>
              <button className="btn-icon" onClick={() => setShowAddDialog(false)}><X size={16} /></button>
            </div>

            <div className="p-5 flex flex-col gap-4">
              {/* Prompt input */}
              <div>
                <span className="text-xs font-semibold" style={{ color: 'var(--text-muted)', display: 'block', marginBottom: 'var(--sp-2)' }}>提示词</span>
                <textarea className="textarea" rows={3} value={addPrompt} onChange={(e) => setAddPrompt(e.target.value)} placeholder="输入案例提示词..." style={{ fontSize: 'var(--fs-sm)' }} />
              </div>

              {/* Model select */}
              <div>
                <span className="text-xs font-semibold" style={{ color: 'var(--text-muted)', display: 'block', marginBottom: 'var(--sp-2)' }}>模型</span>
                <select className="select" id="add-case-model" style={{ width: '100%' }}>
                  <option value="GPT-image-2">GPT-image-2</option>
                  <option value="Qwen Image 3">Qwen Image 3</option>
                  <option value="Nano Banana 2">Nano Banana 2</option>
                </select>
              </div>

              <div className="divider" />

              {/* AI annotation */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-semibold" style={{ color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 'var(--ls-wide)' }}>
                    <Sparkles size={12} style={{ display: 'inline', verticalAlign: -1, marginRight: 4 }} />
                    AI 生成标注（可编辑）
                  </h4>
                  <button className="btn btn-subtle btn-sm" onClick={handleAddAIAnnotation} disabled={isAddAnnotating || !addPrompt.trim()} style={{ fontSize: 'var(--fs-xs)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    {isAddAnnotating ? <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Sparkles size={12} />}
                    生成
                  </button>
                </div>
                <textarea className="textarea" rows={5} value={addAnnotationDraft} onChange={(e) => setAddAnnotationDraft(e.target.value)} placeholder="AI 标注将在此显示..." style={{ fontSize: 'var(--fs-sm)' }} />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-3" style={{ borderTop: '1px solid var(--border-subtle)' }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowAddDialog(false)}>取消</button>
              <button className="btn btn-primary btn-sm" onClick={() => {
                const modelEl = document.getElementById('add-case-model')
                handleAddCase({
                  prompt: addPrompt,
                  model: modelEl?.value || 'GPT-image-2',
                  fullPrompt: addPrompt,
                  annotation: addAnnotationDraft,
                  tags: [],
                  params: { model: modelEl?.value || 'GPT-image-2' },
                })
                setShowAddDialog(false)
              }}>
                <Check size={14} /> 确认入库
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Slide-in animation */}
      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </div>
  )
}
