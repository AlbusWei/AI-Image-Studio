import React, { useState, useEffect } from 'react';
import {
  X, Minus, Plus, FileText, Play, Loader
} from 'lucide-react';
import { useGenerationStore } from '../stores/useGenerationStore';
import { useUIStore } from '../stores/useUIStore';

function BatchPanel({ isOpen, onClose, initialMode = 'batch' }) {
  const [activeMode, setActiveMode] = useState(initialMode);
  const [batchCount, setBatchCount] = useState(5);
  const [promptVariables] = useState({
    name: '{风格}',
    values: ['胶片风', '水彩风', '赛博朋克'],
  });
  const [selectedSizes, setSelectedSizes] = useState(['1:1', '16:9', '9:16']);
  const [queuePrompts, setQueuePrompts] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const generate = useGenerationStore(s => s.generate);
  const prompt = useGenerationStore(s => s.prompt);
  const setPrompt = useGenerationStore(s => s.setPrompt);
  const setParam = useGenerationStore(s => s.setParam);
  const addToast = useUIStore(s => s.addToast);

  useEffect(() => {
    if (initialMode) setActiveMode(initialMode);
  }, [initialMode]);

  if (!isOpen) return null;

  const tabs = [
    { key: 'batch', label: '多批次' },
    { key: 'variants', label: '多变体' },
    { key: 'queue', label: 'Prompt 队列' },
  ];

  const totalImages = batchCount * 4;
  const variantCount = promptVariables.values.length * selectedSizes.length;
  const variantTotalImages = variantCount * 4;
  const queueLines = queuePrompts.split('\n').filter((l) => l.trim());

  const toggleSize = (size) => {
    setSelectedSizes((prev) =>
      prev.includes(size) ? prev.filter((s) => s !== size) : [...prev, size]
    );
  };

  const handleBatchSubmit = async () => {
    if (!prompt.trim()) { addToast('请先输入提示词', { type: 'warning' }); return; }
    setIsSubmitting(true);
    try {
      for (let i = 0; i < batchCount; i++) {
        await generate();
      }
      addToast(`批量生成完成: ${batchCount} 批`, { type: 'success' });
      onClose?.();
    } catch (err) {
      addToast(`批量生成出错: ${err.message}`, { type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVariantSubmit = async () => {
    if (!prompt.trim()) { addToast('请先输入提示词', { type: 'warning' }); return; }
    setIsSubmitting(true);
    try {
      for (const style of promptVariables.values) {
        for (const size of selectedSizes) {
          const variantPrompt = prompt.replace('{风格}', style);
          setPrompt(variantPrompt);
          setParam('size', size);
          await generate();
        }
      }
      addToast(`多变体生成完成: ${variantCount} 组合`, { type: 'success' });
      onClose?.();
    } catch (err) {
      addToast(`多变体生成出错: ${err.message}`, { type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleQueueSubmit = async () => {
    const lines = queuePrompts.split('\n').filter(l => l.trim());
    if (lines.length === 0) { addToast('请输入至少一个提示词', { type: 'warning' }); return; }
    setIsSubmitting(true);
    try {
      for (const line of lines) {
        setPrompt(line.trim());
        await generate();
      }
      addToast(`队列生成完成: ${lines.length} 个提示词`, { type: 'success' });
      onClose?.();
    } catch (err) {
      addToast(`队列生成出错: ${err.message}`, { type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="card"
      style={{
        position: 'fixed',
        top: 'var(--sp-4)',
        right: 'var(--sp-4)',
        width: '100%',
        maxWidth: '480px',
        maxHeight: 'calc(100vh - var(--sp-4) * 2)',
        background: 'var(--bg-panel)',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-xl)',
        zIndex: 'var(--z-modal)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: 'var(--sp-4) var(--sp-5)',
          borderBottom: '1px solid var(--border-subtle)',
        }}
      >
        <h3
          style={{
            fontSize: 'var(--fs-base)',
            fontWeight: 'var(--fw-semibold)',
            color: 'var(--text-primary)',
            margin: 0,
          }}
        >
          批量生成
        </h3>
        <button
          className="btn btn-ghost btn-icon btn-sm"
          onClick={onClose}
          style={{
            border: 'none',
            background: 'transparent',
            color: 'var(--text-tertiary)',
            cursor: 'pointer',
            padding: 'var(--sp-1)',
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            alignItems: 'center',
          }}
          aria-label="关闭"
        >
          <X size={18} />
        </button>
      </div>

      {/* Tabs */}
      <div
        style={{
          display: 'flex',
          borderBottom: '1px solid var(--border-subtle)',
          padding: '0 var(--sp-5)',
        }}
      >
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveMode(tab.key)}
            style={{
              flex: 1,
              border: 'none',
              background: 'transparent',
              color: activeMode === tab.key ? 'var(--accent-primary)' : 'var(--text-tertiary)',
              cursor: 'pointer',
              padding: 'var(--sp-3) var(--sp-2)',
              fontSize: 'var(--fs-sm)',
              fontWeight: activeMode === tab.key ? 'var(--fw-semibold)' : 'var(--fw-normal)',
              borderBottom: activeMode === tab.key ? '2px solid var(--accent-primary)' : '2px solid transparent',
              transition: 'var(--transition-fast)',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: 'var(--sp-5)',
        }}
      >
        {/* Tab 1: 多批次 */}
        {activeMode === 'batch' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
            <p
              style={{
                fontSize: 'var(--fs-sm)',
                color: 'var(--text-secondary)',
                margin: 0,
                lineHeight: 1.6,
              }}
            >
              同一 prompt + 参数，重复生成多批以扩大候选池
            </p>

            {/* Number input with stepper */}
            <div>
              <label
                style={{
                  fontSize: 'var(--fs-sm)',
                  fontWeight: 'var(--fw-medium)',
                  color: 'var(--text-secondary)',
                  display: 'block',
                  marginBottom: 'var(--sp-2)',
                }}
              >
                重复次数
              </label>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--sp-2)',
                }}
              >
                <button
                  className="btn btn-subtle btn-icon"
                  onClick={() => setBatchCount((c) => Math.max(1, c - 1))}
                  style={{
                    border: '1px solid var(--border-default)',
                    background: 'var(--bg-elevated)',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                    padding: 'var(--sp-2)',
                    borderRadius: 'var(--radius-md)',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  <Minus size={14} />
                </button>
                <input
                  className="input"
                  type="number"
                  min={1}
                  max={50}
                  value={batchCount}
                  onChange={(e) => setBatchCount(Math.max(1, Math.min(50, Number(e.target.value))))}
                  style={{
                    width: '80px',
                    textAlign: 'center',
                    background: 'var(--bg-input)',
                    border: '1px solid var(--border-default)',
                    borderRadius: 'var(--radius-md)',
                    color: 'var(--text-primary)',
                    fontSize: 'var(--fs-base)',
                    fontWeight: 'var(--fw-semibold)',
                    padding: 'var(--sp-2) var(--sp-3)',
                    fontFamily: 'inherit',
                  }}
                />
                <button
                  className="btn btn-subtle btn-icon"
                  onClick={() => setBatchCount((c) => Math.min(50, c + 1))}
                  style={{
                    border: '1px solid var(--border-default)',
                    background: 'var(--bg-elevated)',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                    padding: 'var(--sp-2)',
                    borderRadius: 'var(--radius-md)',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>

            {/* Preview */}
            <div
              style={{
                padding: 'var(--sp-3)',
                background: 'var(--bg-card)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <p
                style={{
                  fontSize: 'var(--fs-sm)',
                  color: 'var(--text-secondary)',
                  margin: 0,
                  lineHeight: 1.6,
                }}
              >
                将创建 <strong style={{ color: 'var(--text-primary)' }}>{batchCount}</strong> 个独立任务，每批{' '}
                <strong style={{ color: 'var(--text-primary)' }}>4</strong> 张，共{' '}
                <strong style={{ color: 'var(--accent-primary)' }}>{totalImages}</strong> 张
              </p>
            </div>

            {/* Start button */}
            <button
              className="btn btn-primary"
              style={{
                border: 'none',
                background: 'var(--accent-primary)',
                color: '#fff',
                cursor: 'pointer',
                padding: 'var(--sp-3) var(--sp-4)',
                borderRadius: 'var(--radius-md)',
                fontSize: 'var(--fs-sm)',
                fontWeight: 'var(--fw-semibold)',
                transition: 'var(--transition-fast)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 'var(--sp-2)',
                width: '100%',
                opacity: isSubmitting ? 0.7 : 1,
              }}
              onClick={handleBatchSubmit}
              disabled={isSubmitting}
            >
              {isSubmitting ? <Loader size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Play size={16} />}
              {isSubmitting ? '生成中...' : '开始批量生成'}
            </button>
          </div>
        )}

        {/* Tab 2: 多变体 */}
        {activeMode === 'variants' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
            <p
              style={{
                fontSize: 'var(--fs-sm)',
                color: 'var(--text-secondary)',
                margin: 0,
                lineHeight: 1.6,
              }}
            >
              定义变量，系统自动排列组合生成
            </p>

            {/* Prompt variables */}
            <div>
              <label
                style={{
                  fontSize: 'var(--fs-sm)',
                  fontWeight: 'var(--fw-medium)',
                  color: 'var(--text-secondary)',
                  display: 'block',
                  marginBottom: 'var(--sp-2)',
                }}
              >
                Prompt 变量
              </label>
              <div
                style={{
                  padding: 'var(--sp-3)',
                  background: 'var(--bg-card)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                {/* Variable name */}
                <input
                  className="input"
                  value={promptVariables.name}
                  readOnly
                  style={{
                    width: '100%',
                    background: 'var(--bg-input)',
                    border: '1px solid var(--border-default)',
                    borderRadius: 'var(--radius-md)',
                    color: 'var(--accent-primary)',
                    fontSize: 'var(--fs-sm)',
                    fontWeight: 'var(--fw-medium)',
                    padding: 'var(--sp-1) var(--sp-2)',
                    marginBottom: 'var(--sp-2)',
                    fontFamily: 'inherit',
                    boxSizing: 'border-box',
                  }}
                />
                {/* Value pills */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-1)' }}>
                  {promptVariables.values.map((val) => (
                    <span
                      key={val}
                      className="badge badge-default"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 'var(--sp-1)',
                        padding: '2px var(--sp-2)',
                        background: 'var(--bg-elevated)',
                        border: '1px solid var(--border-default)',
                        borderRadius: 'var(--radius-full)',
                        fontSize: 'var(--fs-xs)',
                        color: 'var(--text-primary)',
                      }}
                    >
                      {val}
                      <X
                        size={12}
                        style={{ cursor: 'pointer', color: 'var(--text-muted)' }}
                      />
                    </span>
                  ))}
                  <input
                    className="input"
                    placeholder="添加值"
                    style={{
                      width: '80px',
                      background: 'transparent',
                      border: '1px dashed var(--border-default)',
                      borderRadius: 'var(--radius-full)',
                      color: 'var(--text-primary)',
                      fontSize: 'var(--fs-xs)',
                      padding: '2px var(--sp-2)',
                      fontFamily: 'inherit',
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Parameter variables */}
            <div>
              <label
                style={{
                  fontSize: 'var(--fs-sm)',
                  fontWeight: 'var(--fw-medium)',
                  color: 'var(--text-secondary)',
                  display: 'block',
                  marginBottom: 'var(--sp-2)',
                }}
              >
                参数变量
              </label>
              <div
                style={{
                  padding: 'var(--sp-3)',
                  background: 'var(--bg-card)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--sp-2)',
                    marginBottom: 'var(--sp-3)',
                  }}
                >
                  <select
                    className="select"
                    defaultValue="尺寸"
                    style={{
                      background: 'var(--bg-input)',
                      border: '1px solid var(--border-default)',
                      borderRadius: 'var(--radius-md)',
                      color: 'var(--text-primary)',
                      fontSize: 'var(--fs-sm)',
                      padding: 'var(--sp-1) var(--sp-2)',
                      fontFamily: 'inherit',
                    }}
                  >
                    <option value="尺寸">尺寸</option>
                    <option value="质量">质量</option>
                    <option value="模型">模型</option>
                  </select>
                </div>
                {/* Size checkboxes */}
                <div style={{ display: 'flex', gap: 'var(--sp-3)' }}>
                  {['1:1', '16:9', '9:16'].map((size) => (
                    <label
                      key={size}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--sp-1)',
                        cursor: 'pointer',
                        fontSize: 'var(--fs-sm)',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedSizes.includes(size)}
                        onChange={() => toggleSize(size)}
                        style={{ accentColor: 'var(--accent-primary)' }}
                      />
                      {size}
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {/* Calculation */}
            <div
              style={{
                padding: 'var(--sp-3)',
                background: 'var(--bg-card)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <p
                style={{
                  fontSize: 'var(--fs-sm)',
                  color: 'var(--text-secondary)',
                  margin: 0,
                  lineHeight: 1.6,
                }}
              >
                排列组合:{' '}
                <strong style={{ color: 'var(--text-primary)' }}>{promptVariables.values.length}</strong> 风格 ×{' '}
                <strong style={{ color: 'var(--text-primary)' }}>{selectedSizes.length}</strong> 尺寸 ={' '}
                <strong style={{ color: 'var(--accent-primary)' }}>{variantCount}</strong> 组合 × 4 张/批 ={' '}
                <strong style={{ color: 'var(--accent-primary)' }}>{variantTotalImages}</strong> 张
              </p>
            </div>

            {/* Start button */}
            <button
              className="btn btn-primary"
              style={{
                border: 'none',
                background: 'var(--accent-primary)',
                color: '#fff',
                cursor: 'pointer',
                padding: 'var(--sp-3) var(--sp-4)',
                borderRadius: 'var(--radius-md)',
                fontSize: 'var(--fs-sm)',
                fontWeight: 'var(--fw-semibold)',
                transition: 'var(--transition-fast)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 'var(--sp-2)',
                width: '100%',
                opacity: isSubmitting ? 0.7 : 1,
              }}
              onClick={handleVariantSubmit}
              disabled={isSubmitting}
            >
              {isSubmitting ? <Loader size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Play size={16} />}
              {isSubmitting ? '生成中...' : '开始批量生成'}
            </button>
          </div>
        )}

        {/* Tab 3: Prompt 队列 */}
        {activeMode === 'queue' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
            <p
              style={{
                fontSize: 'var(--fs-sm)',
                color: 'var(--text-secondary)',
                margin: 0,
                lineHeight: 1.6,
              }}
            >
              多个不同 prompt 排队依次生成
            </p>

            {/* Prompt textarea */}
            <div>
              <textarea
                className="textarea"
                value={queuePrompts}
                onChange={(e) => setQueuePrompts(e.target.value)}
                rows={8}
                placeholder="每行一个 prompt..."
                style={{
                  width: '100%',
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--text-primary)',
                  fontSize: 'var(--fs-sm)',
                  padding: 'var(--sp-3)',
                  resize: 'vertical',
                  fontFamily: 'inherit',
                  lineHeight: 1.7,
                  transition: 'var(--transition-fast)',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            {/* Import button */}
            <button
              className="btn btn-subtle"
              style={{
                border: '1px solid var(--border-default)',
                background: 'var(--bg-elevated)',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                padding: 'var(--sp-2) var(--sp-3)',
                borderRadius: 'var(--radius-md)',
                fontSize: 'var(--fs-sm)',
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--sp-2)',
                transition: 'var(--transition-fast)',
                width: 'fit-content',
              }}
            >
              <FileText size={14} />
              从文件导入
            </button>

            {/* Queue overview */}
            <div
              style={{
                padding: 'var(--sp-3)',
                background: 'var(--bg-card)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <p
                style={{
                  fontSize: 'var(--fs-sm)',
                  color: 'var(--text-secondary)',
                  margin: 0,
                  lineHeight: 1.6,
                }}
              >
                <strong style={{ color: 'var(--text-primary)' }}>{queueLines.length}</strong> 个 prompt 排队，预计{' '}
                <strong style={{ color: 'var(--accent-primary)' }}>~{queueLines.length} 分钟</strong>完成
              </p>
            </div>

            {/* Start button */}
            <button
              className="btn btn-primary"
              style={{
                border: 'none', background: 'var(--accent-primary)', color: '#fff', cursor: 'pointer',
                padding: 'var(--sp-3) var(--sp-4)', borderRadius: 'var(--radius-md)',
                fontSize: 'var(--fs-sm)', fontWeight: 'var(--fw-semibold)',
                transition: 'var(--transition-fast)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                gap: 'var(--sp-2)', width: '100%',
                opacity: isSubmitting ? 0.7 : 1,
              }}
              onClick={handleQueueSubmit}
              disabled={isSubmitting}
            >
              {isSubmitting ? <Loader size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Play size={16} />}
              {isSubmitting ? '生成中...' : '开始队列生成'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default BatchPanel;
