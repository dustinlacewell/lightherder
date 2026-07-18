import type { CSSProperties, SelectHTMLAttributes } from 'react'

interface DropdownOption {
  value: string
  label: string
}

interface DropdownProps
  extends Omit<
    SelectHTMLAttributes<HTMLSelectElement>,
    'value' | 'onChange' | 'disabled' | 'children'
  > {
  value: string
  options: DropdownOption[]
  onChange: (value: string) => void
  disabled?: boolean
  className?: string
  style?: CSSProperties
}

/**
 * Native `<select>` restyled as a chrome-raised pill with a chevron.
 * Uses the existing `.chrome-select` substrate plus a `chrome-dropdown`
 * wrapper class for the raised-pill envelope; the native popup keeps
 * keyboard / touch / accessibility behaviour intact.
 */
export function Dropdown({
  value,
  options,
  onChange,
  disabled,
  className = '',
  style,
  ...rest
}: DropdownProps) {
  return (
    <span
      className={`chrome-dropdown ${disabled ? 'is-disabled' : ''} ${className}`}
      style={style}
    >
      <select
        {...rest}
        className="chrome-dropdown-select"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </span>
  )
}

export type { DropdownProps, DropdownOption }
