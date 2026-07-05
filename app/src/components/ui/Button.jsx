import React from 'react'

const variants = {
  primary: 'btn-primary',
  ghost: 'btn-ghost',
  subtle: 'btn-subtle',
  danger: 'btn-danger',
}

const sizes = {
  sm: 'btn-sm',
  md: '',
  lg: 'btn-lg',
}

export function Button({
  variant = 'ghost',
  size = 'md',
  className = '',
  disabled = false,
  children,
  ...props
}) {
  const variantClass = variants[variant] || 'btn-ghost'
  const sizeClass = sizes[size] || ''
  return (
    <button
      className={`btn ${variantClass} ${sizeClass} ${className}`.trim()}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  )
}

export function IconButton({
  className = '',
  disabled = false,
  'aria-label': ariaLabel,
  children,
  ...props
}) {
  return (
    <button
      className={`btn-icon ${className}`.trim()}
      disabled={disabled}
      aria-label={ariaLabel}
      {...props}
    >
      {children}
    </button>
  )
}

export default Button
