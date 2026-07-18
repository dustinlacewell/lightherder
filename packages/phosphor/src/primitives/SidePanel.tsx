import type { CSSProperties, ReactNode } from 'react'

interface SidePanelProps {
  open: boolean
  onToggle: () => void
  /** Edge the panel docks to. Default 'right'. */
  side?: 'left' | 'right'
  /** Panel width. Number is treated as px; string passes through. Default 380px. */
  width?: number | string
  children: ReactNode
  className?: string
}

/**
 * A fixed chrome chassis docked to one viewport edge, with a hanger
 * toggle that pokes out of the opposite side. When `open` is false
 * the whole chassis (toggle included) slides off-screen — only the
 * hanger remains reachable, since it travels OUT past the panel's
 * leading edge.
 *
 * Inside, content scrolls in a column. The hanger receives ARIA
 * expanded state so screen readers can announce the panel's state.
 */
export function SidePanel({
  open,
  onToggle,
  side = 'right',
  width = 380,
  children,
  className = '',
}: SidePanelProps) {
  const widthValue = typeof width === 'number' ? `${width}px` : width
  const style: CSSProperties = { ['--sidepanel-width' as string]: widthValue }
  return (
    <aside
      className={`chrome-sidepanel ${open ? 'is-open' : 'is-closed'} ${className}`}
      data-side={side}
      style={style}
    >
      <button
        type="button"
        className="chrome-sidepanel-toggle"
        onClick={onToggle}
        aria-expanded={open}
        aria-label={open ? 'Close panel' : 'Open panel'}
      >
        <span className="chrome-sidepanel-toggle-glyph" aria-hidden="true">
          {sideChevron(side, open)}
        </span>
      </button>
      <div className="chrome-sidepanel-body">{children}</div>
    </aside>
  )
}

/**
 * Chevron direction so the hanger always points "outward when open,
 * inward when closed" — visually communicates which way the action
 * will move the panel.
 */
function sideChevron(side: 'left' | 'right', open: boolean): string {
  if (side === 'right') return open ? '›' : '‹'
  return open ? '‹' : '›'
}

export type { SidePanelProps }
