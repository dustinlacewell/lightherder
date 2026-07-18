import type { ButtonHTMLAttributes, ReactNode } from 'react'

interface PushButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** Render the depressed state regardless of pointer interaction. */
  selected?: boolean
  /** Render the depressed state without changing color. */
  pressed?: boolean
  children: ReactNode
  /**
   * Optional content used **only** by the hidden width-sizer span.
   * When the visible label changes (e.g. a toggle that swaps between
   * "On" and "Off"), pass a stable sizer with the longest possible
   * label so the button's box width doesn't shift between states.
   *
   *   <PushButton sizer={<>Off</>}>{on ? 'On' : 'Off'}</PushButton>
   *
   * Or, more idiomatically for two-state toggles, render both
   * labels stacked inside a fragment — `chrome-button-sizer` uses
   * `display: inline-grid` with `grid-template-areas: 'a'` so any
   * number of children stack into one cell at max-of-each-axis.
   */
  sizer?: ReactNode
}

/**
 * Three-layer pushable button. Built on the shared raised-object
 * substrate (`.chrome-raised`) that Panel also uses; this component
 * adds press/select states and the brightness-ladder label.
 */
export function PushButton({
  selected,
  pressed,
  className = '',
  type = 'button',
  children,
  sizer,
  ...rest
}: PushButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      data-selected={selected ? 'true' : undefined}
      data-pressed={pressed ? 'true' : undefined}
      className={`chrome-button chrome-raised ${className}`}
    >
      <span className="chrome-raised-shadow" aria-hidden="true" />
      <span className="chrome-raised-edge" aria-hidden="true" />
      <span className="chrome-raised-front" aria-hidden="true" />
      <span className="chrome-button-label">{children}</span>
      <span className="chrome-button-sizer" aria-hidden="true">
        {sizer ?? children}
      </span>
    </button>
  )
}
