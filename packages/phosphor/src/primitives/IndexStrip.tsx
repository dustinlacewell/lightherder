/*
 * IndexStrip — an instrument-panel-style row for picking an index from
 * a short list (waves, fundamentals, bursts, …) plus a right-anchored
 * cluster of chrome action tiles.
 *
 *   [ 0  1  2  3                       ]  [🎲][📄][+][−]
 *    └── on-glass chips, flex-grow ───┘    └── chrome action tiles
 *
 * The whole row spans the container width. Chips live on an embedded
 * screen substrate and grow to fill leftover space; the action tiles
 * are neutral chrome and hug the right.
 *
 * Actions are caller-supplied — the strip has no built-in concept of
 * "add" or "remove". Pass any combination of icon tiles:
 *   actions={[
 *     { icon: '🎲', label: 'randomize', onClick: doRandomize },
 *     { icon: '+',  label: 'add',       onClick: doAdd },
 *     { icon: '−',  label: 'remove',    onClick: doRemove, disabled: count <= 1 },
 *   ]}
 *
 * Icons are arbitrary ReactNodes — a glyph character, an inline SVG,
 * a phosphor icon component, anything. Each tile is sized to a square
 * matching the strip's height.
 */

import type { CSSProperties, ReactNode } from 'react'

export interface IndexStripAction {
  /** Icon rendered inside the tile (glyph, SVG, JSX). */
  icon: ReactNode
  /** Accessible label / tooltip. */
  label: string
  onClick: () => void
  disabled?: boolean
}

interface IndexStripProps {
  /** Total number of items; chips are rendered 0..count-1. */
  count: number
  /** Currently lit index. */
  active: number
  /** Fired when the user clicks an index chip. */
  onSelect: (index: number) => void
  /**
   * Optional cluster of chrome action tiles rendered to the right of
   * the chip strip. Caller supplies any combination.
   */
  actions?: IndexStripAction[]
  /**
   * Render style for the index labels — default is the index number
   * as-is ("0", "1", "2", …). Override for 1-based or letter labels.
   */
  formatLabel?: (index: number) => ReactNode
  /**
   * Optional per-chip state hint. The returned string is written to
   * the chip's `data-chip-state` attribute, letting consumers attach
   * CSS like `[data-chip-state="muted"] { opacity: 0.4 }`. Returning
   * undefined leaves the chip in its default state.
   */
  chipState?: (index: number) => string | undefined
  className?: string
  style?: CSSProperties
}

export function IndexStrip({
  count,
  active,
  onSelect,
  actions,
  formatLabel = (i) => String(i),
  chipState,
  className = '',
  style,
}: IndexStripProps) {
  return (
    <div className={`chrome-index-strip ${className}`} style={style}>
      <div className="chrome-index-strip-screen screen-embedded" role="tablist">
        {Array.from({ length: count }, (_, i) => {
          const lit = i === active
          const state = chipState?.(i)
          return (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={lit}
              className="screen-chip chrome-index-chip"
              data-lit={lit ? 'true' : 'false'}
              {...(state ? { 'data-chip-state': state } : {})}
              onClick={() => onSelect(i)}
            >
              {formatLabel(i)}
            </button>
          )
        })}
      </div>
      {actions && actions.length > 0 ? (
        <div className="chrome-index-strip-actions">
          {actions.map((action, i) => (
            <button
              key={i}
              type="button"
              className="chrome-index-strip-tile"
              onClick={action.disabled ? undefined : action.onClick}
              disabled={action.disabled}
              aria-label={action.label}
              title={action.label}
            >
              {action.icon}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export type { IndexStripProps }
