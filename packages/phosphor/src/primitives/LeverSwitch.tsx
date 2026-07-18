import type { HTMLAttributes } from 'react'

interface LeverSwitchProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onChange'> {
  /** Left-position label. */
  left: string
  /** Right-position label. */
  right: string
  /** Currently selected position. */
  position: 'left' | 'right'
  disabled?: boolean
  onChange: (position: 'left' | 'right') => void
}

/**
 * Two-position rocker switch with a 3D physical-feel tilt. The
 * un-active side rotates back into the panel; the active side glows.
 */
export function LeverSwitch({
  left,
  right,
  position,
  disabled,
  onChange,
  className = '',
  ...rest
}: LeverSwitchProps) {
  const handle = () => {
    if (disabled) return
    onChange(position === 'left' ? 'right' : 'left')
  }
  return (
    <div
      {...rest}
      role="switch"
      aria-checked={position === 'right'}
      aria-disabled={disabled || undefined}
      tabIndex={disabled ? -1 : 0}
      data-position={position}
      data-disabled={disabled ? 'true' : undefined}
      onClick={handle}
      onKeyDown={(e) => {
        if (disabled) return
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault()
          handle()
        }
      }}
      className={`chrome-lever ${className}`}
    >
      <div className="chrome-lever-mode">{left}</div>
      <div className="chrome-lever-mode">{right}</div>
    </div>
  )
}
