import React, { useState, useEffect, useMemo } from 'react';
import {
  X, ChevronDown, ChevronRight, Pause, Square,
  ArrowUp, ArrowDown, RotateCcw, Eye, ExternalLink, Play
} from 'lucide-react';
import { useTaskStore } from '../stores/useTaskStore';
import { useUIStore } from '../stores/useUIStore';

function TaskPanel({ isOpen, onClose }) {
  const tasks = useTaskStore(s => s.tasks);
  const loadTasks = useTaskStore(s => s.loadTasks);
  const cancelTask = useTaskStore(s => s.cancelTask);
  const retryTask = useTaskStore(s => s.retryTask);
  const pauseTask = useTaskStore(s => s.pauseTask);
  const resumeTask = useTaskStore(s => s.resumeTask);
  const removeTask = useTaskStore(s => s.removeTask);
  const addToast = useUIStore(s => s.addToast);

  const [expandedSections, setExpandedSections] = useState({
    inProgress: true,
    queued: true,
    completed: true,
    failed: true,
  });

  useEffect(() => {
    if (isOpen) loadTasks();
  }, [isOpen, loadTasks]);

  const grouped = useMemo(() => {
    const running = tasks.filter(t => t.status === 'running');
    const queued = tasks.filter(t => t.status === 'queued');
    const completed = tasks.filter(t => t.status === 'completed');
    const failed = tasks.filter(t => t.status === 'failed');
    const paused = tasks.filter(t => t.status === 'paused');
    return { inProgress: [...running, ...paused], queued, completed, failed };
  }, [tasks]);

  if (!isOpen) return null;

  const toggleSection = (key) => {
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const renderSectionHeader = (title, count, sectionKey) => (
    <button
      onClick={() => toggleSection(sectionKey)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--sp-2)',
        width: '100%',
        border: 'none',
        background: 'transparent',
        cursor: 'pointer',
        padding: 'var(--sp-2) 0',
        color: 'var(--text-secondary)',
        fontSize: 'var(--fs-sm)',
        fontWeight: 'var(--fw-semibold)',
      }}
    >
      {expandedSections[sectionKey] ? (
        <ChevronDown size={14} />
      ) : (
        <ChevronRight size={14} />
      )}
      {title}
      <span
        className="badge badge-default"
        style={{
          fontSize: 'var(--fs-xs)',
          padding: '0 6px',
          borderRadius: 'var(--radius-full)',
          background: 'var(--bg-elevated)',
          color: 'var(--text-muted)',
          fontWeight: 'var(--fw-medium)',
          marginLeft: 'auto',
        }}
      >
        {count}
      </span>
    </button>
  );

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: '360px',
        background: 'var(--bg-panel)',
        borderLeft: '1px solid var(--border-subtle)',
        zIndex: 'var(--z-panel)',
        display: 'flex',
        flexDirection: 'column',
        transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
        transition: 'var(--transition-smooth)',
        boxShadow: 'var(--shadow-xl)',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: 'var(--sp-4) var(--sp-4)',
          borderBottom: '1px solid var(--border-subtle)',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
          <h3
            style={{
              fontSize: 'var(--fs-base)',
              fontWeight: 'var(--fw-semibold)',
              color: 'var(--text-primary)',
              margin: 0,
            }}
          >
            任务
          </h3>
          <span
            className="badge badge-accent"
            style={{
              fontSize: 'var(--fs-xs)',
              padding: '0 6px',
              borderRadius: 'var(--radius-full)',
              background: 'var(--accent-primary)',
              color: '#fff',
              fontWeight: 'var(--fw-medium)',
              lineHeight: '20px',
            }}
          >
            {tasks.length}
          </span>
        </div>
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

      {/* Content */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: 'var(--sp-3) var(--sp-4)',
        }}
      >
        {/* In Progress section */}
        <div style={{ marginBottom: 'var(--sp-4)' }}>
          {renderSectionHeader('进行中', grouped.inProgress.length, 'inProgress')}
          {expandedSections.inProgress && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)', marginTop: 'var(--sp-2)' }}>
              {grouped.inProgress.length === 0 ? (
                <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', padding: 'var(--sp-2)' }}>暂无进行中的任务</div>
              ) : grouped.inProgress.map((task) => (
                <div
                  key={task.id}
                  className="card"
                  style={{
                    padding: 'var(--sp-3)',
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-md)',
                  }}
                >
                  <p
                    style={{
                      fontSize: 'var(--fs-sm)',
                      color: 'var(--text-primary)',
                      margin: '0 0 var(--sp-2) 0',
                      lineHeight: 1.5,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {task.prompt}
                  </p>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: 'var(--sp-2)',
                    }}
                  >
                    <span
                      className="badge badge-default"
                      style={{
                        fontSize: 'var(--fs-xs)',
                        padding: '0 6px',
                        borderRadius: 'var(--radius-sm)',
                        background: 'var(--bg-elevated)',
                        color: 'var(--text-tertiary)',
                      }}
                    >
                      {task.model}
                    </span>
                    <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>
                      {task.status === 'paused' ? '已暂停' : `${task.progress || 0}%`}
                    </span>
                  </div>
                  {/* Progress bar */}
                  <div
                    style={{
                      width: '100%',
                      height: '4px',
                      background: 'var(--bg-elevated)',
                      borderRadius: 'var(--radius-full)',
                      overflow: 'hidden',
                      marginBottom: 'var(--sp-2)',
                    }}
                  >
                    <div
                      style={{
                        width: `${task.progress || 0}%`,
                        height: '100%',
                        background: task.status === 'paused' ? 'var(--accent-warning)' : 'var(--accent-primary)',
                        borderRadius: 'var(--radius-full)',
                        transition: 'width 0.5s ease',
                      }}
                    />
                  </div>
                  {/* Action buttons */}
                  <div style={{ display: 'flex', gap: 'var(--sp-1)', justifyContent: 'flex-end' }}>
                    {task.status === 'paused' ? (
                      <button
                        className="btn btn-ghost btn-icon btn-sm"
                        style={{ border: 'none', background: 'transparent', color: 'var(--accent-primary)', cursor: 'pointer', padding: 'var(--sp-1)', borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center' }}
                        title="继续"
                        onClick={() => resumeTask(task.id)}
                      >
                        <Play size={14} />
                      </button>
                    ) : (
                      <button
                        className="btn btn-ghost btn-icon btn-sm"
                        style={{ border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', padding: 'var(--sp-1)', borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center' }}
                        title="暂停"
                        onClick={() => pauseTask(task.id)}
                      >
                        <Pause size={14} />
                      </button>
                    )}
                    <button
                      className="btn btn-ghost btn-icon btn-sm"
                      style={{ border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', padding: 'var(--sp-1)', borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center' }}
                      title="取消"
                      onClick={() => cancelTask(task.id)}
                    >
                      <Square size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Queued section */}
        <div style={{ marginBottom: 'var(--sp-4)' }}>
          {renderSectionHeader('排队中', grouped.queued.length, 'queued')}
          {expandedSections.queued && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-1)', marginTop: 'var(--sp-2)' }}>
              {grouped.queued.length === 0 ? (
                <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', padding: 'var(--sp-2)' }}>暂无排队任务</div>
              ) : grouped.queued.map((task) => (
                <div
                  key={task.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--sp-2)',
                    padding: 'var(--sp-2) var(--sp-3)',
                    background: 'var(--bg-card)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  <p
                    style={{
                      flex: 1,
                      fontSize: 'var(--fs-xs)',
                      color: 'var(--text-secondary)',
                      margin: 0,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {task.prompt}
                  </p>
                  <span
                    className="badge badge-default"
                    style={{
                      fontSize: 'var(--fs-xs)',
                      padding: '0 4px',
                      borderRadius: 'var(--radius-sm)',
                      background: 'var(--bg-elevated)',
                      color: 'var(--text-muted)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {task.model}
                  </span>
                  <div style={{ display: 'flex', gap: '2px' }}>
                    <button
                      className="btn btn-ghost btn-icon btn-sm"
                      style={{ border: 'none', background: 'transparent', color: 'var(--accent-danger)', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center' }}
                      title="移除"
                      onClick={() => cancelTask(task.id)}
                    >
                      <X size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Completed section */}
        <div style={{ marginBottom: 'var(--sp-4)' }}>
          {renderSectionHeader('已完成', grouped.completed.length, 'completed')}
          {expandedSections.completed && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)', marginTop: 'var(--sp-2)' }}>
              {grouped.completed.length === 0 ? (
                <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', padding: 'var(--sp-2)' }}>暂无已完成任务</div>
              ) : grouped.completed.map((task) => (
                <div
                  key={task.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--sp-2)',
                    padding: 'var(--sp-2) var(--sp-3)',
                    background: 'var(--bg-card)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p
                      style={{
                        fontSize: 'var(--fs-xs)',
                        color: 'var(--text-primary)',
                        margin: '0 0 2px 0',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {task.prompt}
                    </p>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--sp-2)',
                        fontSize: 'var(--fs-xs)',
                        color: 'var(--text-muted)',
                      }}
                    >
                      <span>{task.model}</span>
                      {task.updatedAt && (
                        <>
                          <span>·</span>
                          <span>{new Date(task.updatedAt).toLocaleTimeString()}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <button
                    className="btn btn-ghost btn-icon btn-sm"
                    style={{ border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', padding: 'var(--sp-1)', borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center' }}
                    title="移除"
                    onClick={() => removeTask(task.id)}
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Failed section */}
        <div style={{ marginBottom: 'var(--sp-4)' }}>
          {renderSectionHeader('失败', grouped.failed.length, 'failed')}
          {expandedSections.failed && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)', marginTop: 'var(--sp-2)' }}>
              {grouped.failed.length === 0 ? (
                <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', padding: 'var(--sp-2)' }}>暂无失败任务</div>
              ) : grouped.failed.map((task) => (
                <div
                  key={task.id}
                  style={{
                    padding: 'var(--sp-3)',
                    background: 'var(--bg-card)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--accent-danger)',
                    borderLeft: '3px solid var(--accent-danger)',
                  }}
                >
                  <p
                    style={{
                      fontSize: 'var(--fs-xs)',
                      color: 'var(--text-primary)',
                      margin: '0 0 4px 0',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {task.prompt}
                  </p>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--sp-2)',
                        fontSize: 'var(--fs-xs)',
                      }}
                    >
                      <span className="badge badge-default" style={{
                        padding: '0 4px',
                        borderRadius: 'var(--radius-sm)',
                        background: 'var(--bg-elevated)',
                        color: 'var(--text-muted)',
                      }}>
                        {task.model}
                      </span>
                      <span style={{ color: 'var(--accent-danger)' }}>{task.error || '未知错误'}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 'var(--sp-1)', alignItems: 'center' }}>
                      <button
                        className="btn btn-ghost btn-sm"
                        style={{
                          border: 'none',
                          background: 'transparent',
                          color: 'var(--accent-primary)',
                          cursor: 'pointer',
                          padding: 'var(--sp-1) var(--sp-2)',
                          borderRadius: 'var(--radius-sm)',
                          fontSize: 'var(--fs-xs)',
                          fontWeight: 'var(--fw-medium)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 'var(--sp-1)',
                        }}
                        onClick={() => { retryTask(task.id); addToast('已重新提交任务', { type: 'info' }); }}
                      >
                        <RotateCcw size={12} />
                        重试
                      </button>
                      <button
                        className="btn btn-ghost btn-icon btn-sm"
                        style={{
                          border: 'none',
                          background: 'transparent',
                          color: 'var(--accent-danger)',
                          cursor: 'pointer',
                          padding: 'var(--sp-1)',
                          borderRadius: 'var(--radius-sm)',
                          display: 'flex',
                          alignItems: 'center',
                        }}
                        title="移除"
                        onClick={() => removeTask(task.id)}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Bottom link */}
      <div
        style={{
          padding: 'var(--sp-3) var(--sp-4)',
          borderTop: '1px solid var(--border-subtle)',
          flexShrink: 0,
          textAlign: 'center',
        }}
      >
        <a
          href="#/task-center"
          style={{
            fontSize: 'var(--fs-sm)',
            color: 'var(--accent-primary)',
            textDecoration: 'none',
            fontWeight: 'var(--fw-medium)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 'var(--sp-1)',
          }}
        >
          查看全部任务
          <ExternalLink size={14} />
        </a>
      </div>
    </div>
  );
}

export default TaskPanel;
