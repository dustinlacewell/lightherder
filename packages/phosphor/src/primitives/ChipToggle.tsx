import type { ButtonHTMLAttributes, ReactNode } from 'react'

interface ChipToggleProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onChange' | 'children' | 'value'> {
  /** Lit when true; phantom outline when false. */
  value: boolean
  onChange: (next: boolean) => void
  /**
   * Label rendered when `value` is the current state. Used in
   * "dynamic label" mode where you change what's shown yourself.
   * Ignored when both `onLabel` and `offLabel` are provided.
   */
  children?: ReactNode
  /**
   * The label rendered when `value` is false. When this AND
   * `onLabel` are both provided, the chip renders the appropriate
   * label for the state with a hidden sizer for the longer of the
   * two — locking the chip's width regardless of state.
   */
  offLabel?: ReactNode
  /** The label rendered when `value` is true. See `offLabel`. */
  onLabel?: ReactNode
}

/**
 * Single screen chip toggle. Lives on the dark glass of a Display —
 * the lit/unlit appearance comes from the same `.screen-chip` styling
 * that the rest of the on-glass chip language uses.
 *
 * The chip's lit pill IS the "checked" state; there is no separate
 * checkbox glyph because nothing physical (no chrome, no widget
 * chrome) is allowed inside the Display — only emitted-light pixels.
 *
 * Width stability: when `onLabel` AND `offLabel` are both provided,
 * a hidden sizer renders both labels stacked so the chip always
 * reserves space for the longer of the two. The visible label floats
 * over the sizer absolutely so swapping states doesn't shift the
 * chip's box.
 */
export function ChipToggle({
  value,
  onChange,
  className = 'screen-chip',
  children,
  offLabel,
  onLabel,
  type = 'button',
  ...rest
}: ChipToggleProps) {
  const stable = onLabel !== undefined && offLabel !== undefined
  const visibleLabel = stable ? (value ? onLabel : offLabel) : children

  return (
    <button
      {...rest}
      type={type}
      className={className}
      data-lit={value ? 'true' : 'false'}
      aria-pressed={value}
      onClick={() => onChange(!value)}
    >
      {stable ? (
        <span className="screen-chip-sized">
          {/* Sizer: both labels stacked, hidden, take up the union
              width. The visible label sits absolutely over them. */}
          <span className="screen-chip-sizer" aria-hidden="true">
            <span>{onLabel}</span>
            <span>{offLabel}</span>
          </span>
          <span className="screen-chip-visible">{visibleLabel}</span>
        </span>
      ) : (
        children
      )}
    </button>
  )
}
