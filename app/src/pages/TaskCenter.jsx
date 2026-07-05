import React, { useState, useEffect, useMemo } from 'react';
import {
  ListTodo, Pause, X,
  ChevronDown, ChevronRight, Clock, Loader,
  CheckCircle2, XCircle, RotateCcw, Play,
} from 'lucide-react';
import { useTaskStore } from '../stores/useTaskStore';
import { useUIStore } from '../stores/useUIStore';

const btnIconStyle = {
  border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer',
  padding: 'var(--sp-1)', borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center', justifyContent: 'center',
};

function formatTimeAgo(ts) {
  if (!ts) return '';
  const diff = Date.now() - ts;
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
  return `${Math.floor(diff / 86400000)}天前`;
}

export default function TaskCenter() {
  const tasks = useTaskStore((s) => s.tasks);
  const loadTasks = useTaskStore((s) => s.loadTasks);
  const cancelTask = useTaskStore((s) => s.cancelTask);
  const retryTask = useTaskStore((s) => s.retryTask);
  const pauseTask = useTaskStore((s) => s.pauseTask);
  const resumeTask = useTaskStore((s) => s.resumeTask);
  const removeTask = useTaskStore((s) => s.removeTask);
  const clearCompleted = useTaskStore((s) => s.clearCompleted);
  const addToast = useUIStore((s) => s.addToast);

  const [expandedSections, setExpandedSections] = useState({
    running: true, queued: true, completed: true, failed: true, paused: true,
  });

  useEffect(() => { loadTasks() }, []);

  const toggleSection = (key) => setExpandedSections((p) => ({ ...p, [key]: !p[key] }));

  const grouped = useMemo(() => {
    const g = { running: [], queued: [], completed: [], failed: [], paused: [] };
    for (const t of tasks) {
      if (t.status === 'running') g.running.push(t);
      else if (t.status === 'queued') g.queued.push(t);
      else if (t.status === 'completed') g.completed.push(t);
      else if (t.status === 'failed' || t.status === 'cancelled') g.failed.push(t);
      else if (t.status === 'paused') g.paused.push(t);
    }
    return g;
  }, [tasks]);

  const stats = useMemo(() => ({
    running: grouped.running.length, queued: grouped.queued.length,
    completed: grouped.completed.length, failed: grouped.failed.length,
  }), [grouped]);

  const handleCancel = async (id) => { try { await cancelTask(id); addToast('任务已取消', { type: 'info' }); } catch { addToast('取消失败', { type: 'error' }); } };
  const handleRetry = async (id) => { try { await retryTask(id); addToast('任务已重新排队', { type: 'success' }); } catch { addToast('重试失败', { type: 'error' }); } };
  const handlePause = async (id) => { try { await pauseTask(id); addToast('任务已暂停', { type: 'info' }); } catch { addToast('暂停失败', { type: 'error' }); } };
  const handleResume = async (id) => { try { await resumeTask(id); addToast('任务已恢复', { type: 'success' }); } catch { addToast('恢复失败', { type: 'error' }); } };
  const handleRemove = async (id) => { try { await removeTask(id); } catch { addToast('移除失败', { type: 'error' }); } };
  const handleClearCompleted = async () => { try { await clearCompleted(); addToast('已清空完成的任务', { type: 'success' }); } catch { addToast('清空失败', { type: 'error' }); } };

  const renderSectionHeader = (title, count, sectionKey, icon, color) => (
    <button onClick={() => toggleSection(sectionKey)}
      style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', width: '100%', border: 'none', background: 'transparent', cursor: 'pointer', padding: 'var(--sp-3) var(--sp-4)', color: 'var(--text-primary)', fontSize: 'var(--fs-md)', fontWeight: 'var(--fw-semibold)', borderRadius: 'var(--radius-md)', transition: 'background var(--transition-fast)' }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-elevated)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
      {expandedSections[sectionKey] ? <ChevronDown size={16} style={{ color: 'var(--text-tertiary)' }} /> : <ChevronRight size={16} style={{ color: 'var(--text-tertiary)' }} />}
      <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-1)' }}>{icon}{title}</span>
      <span style={{ fontSize: 'var(--fs-xs)', padding: '1px 8px', borderRadius: 'var(--radius-full)', background: color, color: '#fff', fontWeight: 'var(--fw-semibold)', marginLeft: '4px', lineHeight: '18px' }}>{count}</span>
    </button>
  );

  return (
    <div style={{ padding: '32px', display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '900px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <ListTodo size={24} style={{ color: 'var(--accent-primary)' }} />
        <h1 style={{ fontSize: 'var(--fs-3xl)', fontWeight: 'var(--fw-bold)', letterSpacing: 'var(--ls-tight)', margin: 0 }}>任务中心</h1>
      </div>
      <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--fs-md)', margin: 0 }}>查看和管理所有后台任务的进度与结果。</p>

      {/* Stats bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', padding: 'var(--sp-3) var(--sp-4)', background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-subtle)', fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', flexWrap: 'wrap' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-1)' }}><Loader size={14} style={{ color: 'var(--accent-primary)' }} />进行中 <strong style={{ color: 'var(--text-primary)' }}>{stats.running}</strong></span>
        <span style={{ color: 'var(--border-default)' }}>·</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-1)' }}><Clock size={14} style={{ color: 'var(--accent-warning)' }} />排队中 <strong style={{ color: 'var(--text-primary)' }}>{stats.queued}</strong></span>
        <span style={{ color: 'var(--border-default)' }}>·</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-1)' }}><CheckCircle2 size={14} style={{ color: 'var(--accent-success)' }} />已完成 <strong style={{ color: 'var(--text-primary)' }}>{stats.completed}</strong></span>
        <span style={{ color: 'var(--border-default)' }}>·</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-1)' }}><XCircle size={14} style={{ color: 'var(--accent-danger)' }} />失败 <strong style={{ color: 'var(--text-primary)' }}>{stats.failed}</strong></span>
        {stats.completed > 0 && (
          <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }} onClick={handleClearCompleted}><Loader size={12} /> 清空已完成</button>
        )}
      </div>

      {/* In Progress */}
      <div>
        {renderSectionHeader('进行中', grouped.running.length, 'running', <Loader size={16} style={{ color: 'var(--accent-primary)' }} />, 'var(--accent-primary)')}
        {expandedSections.running && grouped.running.length === 0 && <p style={{ padding: 'var(--sp-3) var(--sp-4)', color: 'var(--text-muted)', fontSize: 'var(--fs-sm)' }}>暂无进行中的任务</p>}
        {expandedSections.running && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)', marginTop: 'var(--sp-2)' }}>
            {grouped.running.map((task) => (
              <div key={task.id} className="card" style={{ padding: 'var(--sp-4)', background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)' }}>
                <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-primary)', margin: '0 0 var(--sp-2) 0', lineHeight: 1.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.prompt}</p>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--sp-2)' }}>
                  <span className="badge badge-default" style={{ fontSize: 'var(--fs-xs)', padding: '0 6px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-elevated)', color: 'var(--text-tertiary)' }}>{task.model}</span>
                  <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}><Clock size={12} />{formatTimeAgo(task.updatedAt)}</span>
                </div>
                <div className="progress-bar" style={{ width: '100%', height: '4px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-full)', overflow: 'hidden', marginBottom: 'var(--sp-2)' }}>
                  <div className="progress-bar-fill" style={{ width: `${task.progress || 0}%`, height: '100%', background: 'var(--accent-primary)', borderRadius: 'var(--radius-full)', transition: 'width 0.5s ease' }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>{task.progress || 0}%</span>
                  <div style={{ display: 'flex', gap: 'var(--sp-1)' }}>
                    <button style={btnIconStyle} title="暂停" onClick={() => handlePause(task.id)}><Pause size={14} /></button>
                    <button style={{ ...btnIconStyle, color: 'var(--accent-danger)' }} title="取消" onClick={() => handleCancel(task.id)}><X size={14} /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Queued */}
      <div>
        {renderSectionHeader('排队中', grouped.queued.length, 'queued', <Clock size={16} style={{ color: 'var(--accent-warning)' }} />, 'var(--accent-warning)')}
        {expandedSections.queued && grouped.queued.length === 0 && <p style={{ padding: 'var(--sp-3) var(--sp-4)', color: 'var(--text-muted)', fontSize: 'var(--fs-sm)' }}>暂无排队中的任务</p>}
        {expandedSections.queued && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)', marginTop: 'var(--sp-2)' }}>
            {grouped.queued.map((task, idx) => (
              <div key={task.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', padding: 'var(--sp-3) var(--sp-4)', background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-subtle)' }}>
                <span style={{ fontSize: 'var(--fs-xs)', fontWeight: 'var(--fw-bold)', color: 'var(--text-muted)', minWidth: '20px', textAlign: 'center' }}>#{idx + 1}</span>
                <p style={{ flex: 1, fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.prompt}</p>
                <span className="badge badge-default" style={{ fontSize: 'var(--fs-xs)', padding: '0 6px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-elevated)', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{task.model}</span>
                <button style={{ ...btnIconStyle, color: 'var(--accent-danger)' }} title="移除" onClick={() => handleCancel(task.id)}><X size={12} /></button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Paused */}
      {grouped.paused.length > 0 && (
        <div>
          {renderSectionHeader('已暂停', grouped.paused.length, 'paused', <Pause size={16} style={{ color: 'var(--text-muted)' }} />, 'var(--text-muted)')}
          {expandedSections.paused && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)', marginTop: 'var(--sp-2)' }}>
              {grouped.paused.map((task) => (
                <div key={task.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', padding: 'var(--sp-3) var(--sp-4)', background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-subtle)' }}>
                  <p style={{ flex: 1, fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.prompt}</p>
                  <span className="badge badge-default" style={{ fontSize: 'var(--fs-xs)', padding: '0 6px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>{task.model}</span>
                  <button style={btnIconStyle} title="恢复" onClick={() => handleResume(task.id)}><Play size={12} /></button>
                  <button style={{ ...btnIconStyle, color: 'var(--accent-danger)' }} title="移除" onClick={() => handleRemove(task.id)}><X size={12} /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Completed */}
      <div>
        {renderSectionHeader('已完成', grouped.completed.length, 'completed', <CheckCircle2 size={16} style={{ color: 'var(--accent-success)' }} />, 'var(--accent-success)')}
        {expandedSections.completed && grouped.completed.length === 0 && <p style={{ padding: 'var(--sp-3) var(--sp-4)', color: 'var(--text-muted)', fontSize: 'var(--fs-sm)' }}>暂无已完成的任务</p>}
        {expandedSections.completed && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)', marginTop: 'var(--sp-2)' }}>
            {grouped.completed.map((task) => (
              <div key={task.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', padding: 'var(--sp-3) var(--sp-4)', background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-subtle)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-primary)', margin: '0 0 4px 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.prompt}</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>
                    <span className="badge badge-default" style={{ padding: '0 4px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>{task.model}</span>
                    {task.result?.images && <span>{task.result.images.length} 张</span>}
                    <span>·</span>
                    <span>{formatTimeAgo(task.updatedAt || task.createdAt)}</span>
                  </div>
                </div>
                <button className="btn btn-ghost btn-sm" style={{ border: 'none', background: 'transparent', color: 'var(--accent-primary)', cursor: 'pointer', padding: 'var(--sp-1) var(--sp-2)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--fs-xs)', fontWeight: 'var(--fw-medium)', whiteSpace: 'nowrap' }}
                  onClick={() => { window.location.hash = '#/gallery'; }}>查看</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Failed */}
      <div>
        {renderSectionHeader('失败', grouped.failed.length, 'failed', <XCircle size={16} style={{ color: 'var(--accent-danger)' }} />, 'var(--accent-danger)')}
        {expandedSections.failed && grouped.failed.length === 0 && <p style={{ padding: 'var(--sp-3) var(--sp-4)', color: 'var(--text-muted)', fontSize: 'var(--fs-sm)' }}>暂无失败的任务</p>}
        {expandedSections.failed && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)', marginTop: 'var(--sp-2)' }}>
            {grouped.failed.map((task) => (
              <div key={task.id} style={{ padding: 'var(--sp-4)', background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--accent-danger)', borderLeft: '3px solid var(--accent-danger)' }}>
                <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-primary)', margin: '0 0 var(--sp-2) 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.prompt}</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', marginBottom: 'var(--sp-2)' }}>
                  <span className="badge badge-default" style={{ fontSize: 'var(--fs-xs)', padding: '0 4px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>{task.model}</span>
                  <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--accent-danger)' }}>{task.error || '未知错误'}</span>
                </div>
                <div style={{ display: 'flex', gap: 'var(--sp-1)', justifyContent: 'flex-end' }}>
                  <button style={{ border: 'none', background: 'transparent', color: 'var(--accent-primary)', cursor: 'pointer', padding: 'var(--sp-1) var(--sp-2)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--fs-xs)', fontWeight: 'var(--fw-medium)', display: 'flex', alignItems: 'center', gap: 'var(--sp-1)' }} title="重试" onClick={() => handleRetry(task.id)}>
                    <RotateCcw size={12} />重试
                  </button>
                  <button style={{ ...btnIconStyle, color: 'var(--accent-danger)' }} title="移除" onClick={() => handleRemove(task.id)}><X size={14} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
