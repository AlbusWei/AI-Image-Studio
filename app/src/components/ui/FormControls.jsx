import React from 'react'

export function Input({ className = '', label, error, ...props }) {
  return (
    <div className="flex flex-col gap-1">
      {label && <label style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', fontWeight: 'var(--fw-medium)' }}>{label}</label>}
      <input className={`input ${className}`.trim()} {...props} />
      {error && <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--accent-danger)' }}>{error}</span>}
    </div>
  )
}

export function Textarea({ className = '', label, ...props }) {
  return (
    <div className="flex flex-col gap-1">
      {label && <label style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', fontWeight: 'var(--fw-medium)' }}>{label}</label>}
      <textarea className={`textarea ${className}`.trim()} {...props} />
    </div>
  )
}

export function Select({ className = '', label, children, ...props }) {
  return (
    <div className="flex flex-col gap-1">
      {label && <label style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', fontWeight: 'var(--fw-medium)' }}>{label}</label>}
      <select className={`select ${className}`.trim()} {...props}>
        {children}
      </select>
    </div>
  )
}

export function Switch({ checked = false, onChange, label, ...props }) {
  return (
    <div className="flex items-center gap-2">
      <button
        role="switch"
        aria-checked={checked}
        className={`toggle ${checked ? 'active' : ''}`}
        onClick={() => onChange && onChange(!checked)}
        {...props}
      />
      {label && <span style={{ fontSize: 'var(--fs-base)', color: 'var(--text-secondary)' }}>{label}</span>}
    </div>
  )
}

export function Checkbox({ checked = false, onChange, label, ...props }) {
  return (
    <div className="flex items-center gap-2" style={{ cursor: 'pointer' }} onClick={() => onChange && onChange(!checked)}>
      <div className={`checkbox ${checked ? 'checked' : ''}`}>
        {checked && (
          <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
            <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
      </div>
      {label && <span style={{ fontSize: 'var(--fs-base)', color: 'var(--text-secondary)' }}>{label}</span>}
    </div>
  )
}
