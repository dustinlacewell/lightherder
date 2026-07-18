import { useId, type CSSProperties, type InputHTMLAttributes } from 'react'

interface NumberFieldProps
  extends Omit<
    InputHTMLAttributes<HTMLInputElement>,
    'value' | 'min' | 'max' | 'step' | 'onChange' | 'type' | 'disabled'
  > {
  value: number
  min?: number
  max?: number
  step?: number
  onChange: (value: number) => void
  disabled?: boolean
  /** Optional explicit box width. Accepts a CSS length string or px number. */
  width?: number | string
  className?: string
  style?: CSSProperties
}

/**
 * Numeric input rendered as a chrome-bezeled mini-display — a
 * recessed dark slot with a glowing digital readout. Uses
 * <input type="number"> for native increment / decimal / paste
 * behaviour; the visual is the same family as SegmentedDisplay's
 * embedded screen but with editable text.
 */
export function NumberField({
  value,
  min,
  max,
  step,
  onChange,
  disabled,
  width,
  className = '',
  style,
  ...rest
}: NumberFieldProps) {
  const id = useId()
  const mergedStyle: CSSProperties = {
    ...(width !== undefined ? { width: typeof width === 'number' ? `${width}px` : width } : {}),
    ...style,
  }
  return (
    <span
      className={`chrome-numberfield ${disabled ? 'is-disabled' : ''} ${className}`}
      style={mergedStyle}
    >
      <input
        {...rest}
        id={rest.id ?? id}
        type="number"
        value={Number.isFinite(value) ? value : ''}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={(e) => {
          const v = Number(e.target.value)
          if (Number.isFinite(v)) onChange(v)
        }}
      />
    </span>
  )
}

export type { NumberFieldProps }
