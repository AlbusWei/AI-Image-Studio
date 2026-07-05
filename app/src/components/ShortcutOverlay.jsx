import React from 'react';
import { X } from 'lucide-react';
import { SHORTCUT_GROUPS } from '../hooks/useShortcuts';

/**
 * ShortcutOverlay – Fullscreen shortcut reference overlay.
 * Triggered by pressing '?' globally.
 */
function ShortcutOverlay({ isOpen, onClose }) {
  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.75)',
        zIndex: 'var(--z-modal)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backdropFilter: 'blur(4px)',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--bg-panel)',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-dialog)',
          width: 640,
          maxHeight: '80vh',
          overflow: 'auto',
          padding: 'var(--sp-6)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--sp-5)' }}>
          <h2 style={{ fontSize: 'var(--fs-lg)', fontWeight: 'var(--fw-semibold)', color: 'var(--text-primary)', margin: 0 }}>
            快捷键速查
          </h2>
          <button
            className="btn btn-ghost btn-icon"
            onClick={onClose}
            style={{
              border: 'none',
              background: 'transparent',
              color: 'var(--text-tertiary)',
              cursor: 'pointer',
              padding: 'var(--sp-2)',
              borderRadius: 'var(--radius-md)',
              display: 'flex',
              alignItems: 'center',
            }}
            aria-label="关闭"
          >
            <X size={18} />
          </button>
        </div>

        {/* Hint */}
        <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', margin: '0 0 var(--sp-4)' }}>
          按 <kbd style={kbdStyle}>Esc</kbd> 或点击外部关闭
        </p>

        {/* Groups */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-5)' }}>
          {SHORTCUT_GROUPS.map((group) => (
            <div key={group.title}>
              <h3
                style={{
                  fontSize: 'var(--fs-sm)',
                  fontWeight: 'var(--fw-semibold)',
                  color: 'var(--accent-primary)',
                  textTransform: 'uppercase',
                  letterSpacing: 'var(--ls-wide)',
                  marginBottom: 'var(--sp-3)',
                  paddingBottom: 'var(--sp-2)',
                  borderBottom: '1px solid var(--border-subtle)',
                }}
              >
                {group.title}
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
                {group.shortcuts.map((shortcut, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: 'var(--sp-1) 0',
                    }}
                  >
                    <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)' }}>
                      {shortcut.description}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                      {shortcut.keys.map((key, ki) => (
                        <React.Fragment key={ki}>
                          {ki > 0 && (
                            <span style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-xs)', margin: '0 1px' }}>+</span>
                          )}
                          <kbd style={kbdStyle}>{key}</kbd>
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const kbdStyle = {
  display: 'inline-block',
  padding: '2px 6px',
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-sm)',
  fontSize: 'var(--fs-xs)',
  fontFamily: 'var(--font-mono)',
  color: 'var(--text-primary)',
  fontWeight: 'var(--fw-medium)',
  minWidth: '20px',
  textAlign: 'center',
  lineHeight: '1.6',
};

export default ShortcutOverlay;
