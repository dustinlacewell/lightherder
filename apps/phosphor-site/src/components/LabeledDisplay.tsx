import type { ReactNode } from 'react'

interface LabeledDisplayProps {
  /** Small embossed-chrome label sitting above the display. */
  label: string
  /** The display itself — typically a SegmentedDisplay or SegmentedSurface. */
  children: ReactNode
  /** Optional className passthrough. */
  className?: string
  /** Optional alignment of the label + display. Defaults to start. */
  align?: 'start' | 'center' | 'end'
}

/**
 * A label + display block, like a panel label engraved above an
 * embedded readout. Stacks the label on top with a small gap; the
 * display sits beneath in whatever size it naturally renders at.
 *
 * Used to compose chassis dashboards: a Panel hosts a grid of
 * these, each one a labeled instrument.
 */
export function LabeledDisplay({
  label,
  children,
  className = '',
  align = 'start',
}: LabeledDisplayProps) {
  return (
    <div className={`labeled-display ${className}`} data-align={align}>
      <span className="labeled-display-label chrome-emboss">{label}</span>
      <div className="labeled-display-body">{children}</div>
    </div>
  )
}
