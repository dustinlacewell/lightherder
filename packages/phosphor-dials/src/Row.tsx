/*
 * Skeuomorphic Row layout for dials' Panel.
 *
 * One slot row, title-over-dial layout:
 *
 *   ┌─────────────────────────────────────────────┐
 *   │                 label  (?)                   │   centered caption
 *   │                                              │
 *   │                 ( knob )                     │   control, centered
 *   │                            [attach pick]     │   attach, bottom-right
 *   │     ▸ nested sub-panel for attached source   │   (recursive)
 *   └─────────────────────────────────────────────┘
 *
 * The label sits centered above the dial; the attach picker tucks into
 * the bottom-right corner of the control area so it never displaces the
 * title. Nested sub-panels indent left with a coloured rail so the
 * recursion is visually unambiguous.
 */

import { type ReactNode } from 'react'
import { HoverCard } from '@ldlework/phosphor'
import type { RowProps } from '@ldlework/dials/react'

/**
 * Where the slot's caption sits. `'above'` (default) is the classic
 * title-over-dial strip. `'below'` suppresses that strip entirely — the
 * control draws its own caption under itself (a knob engraves the label
 * + value beneath its face), the compact layout herder's node strips
 * want. A modulated row's fold toggle then rides beside the control
 * instead of hanging off the (absent) caption.
 */
export type Caption = 'above' | 'below'

/** Build a Row bound to a caption placement (see `Caption`). */
export function makeRow(caption: Caption): (props: RowProps) => ReactNode {
  if (caption === 'above') return Row
  return (props) => <Row {...props} caption="below" />
}

export function Row({
  label,
  control,
  attach,
  nested,
  description,
  folded,
  onFold,
  caption = 'above',
}: RowProps & { caption?: Caption }): ReactNode {
  const below = caption === 'below'
  // A nested drawer (an attached source's sub-params) can be folded
  // away to keep deep modulation trees scannable. CONTROLLED: the state
  // lives on the slot (dials' SlotRow owns it and passes it down), so a
  // shift-click cascade is a plain slot-subtree walk upstream and the
  // host can observe how much of the tree is visible. Rows with no
  // drawer never show the toggle.
  const collapsed = folded ?? false

  const onFoldClick = (e: React.MouseEvent) => {
    onFold?.(!collapsed, e.shiftKey)
  }

  // The fold toggle for a modulated row. In the above layout it hangs
  // off the caption's left; in the below layout there is no caption, so
  // it rides in the control area's top-left corner instead.
  const fold = nested ? (
    <button
      type="button"
      className="pd-row-fold"
      aria-expanded={!collapsed}
      aria-label={collapsed ? 'Expand modulation' : 'Collapse modulation'}
      title="Click to fold · Shift-click to fold all below"
      onClick={onFoldClick}
    >
      {collapsed ? '▸' : '▾'}
    </button>
  ) : null

  return (
    <div
      className={`pd-row${below ? ' pd-row-below' : ''}`}
      data-collapsed={nested && collapsed ? '' : undefined}
    >
      {/* The caption strip — above layout only. Below layout lets the
          control (a knob) engrave its own label under its face. */}
      {!below ? (
        <div className="pd-row-caption">
          <span className="pd-row-label">
            {fold}
            {/* The title itself is the hover target — no separate (?).
                Falls back to plain text when the slot has no description. */}
            {description ? (
              <HoverCard
                content={
                  <>
                    <strong>{label}</strong>
                    <span>{description}</span>
                  </>
                }
              >
                <span className="pd-row-title">{label}</span>
              </HoverCard>
            ) : (
              <span className="pd-row-title pd-row-title-plain">{label}</span>
            )}
          </span>
        </div>
      ) : null}
      {control ? (
        <div className="pd-row-control">
          {below ? fold : null}
          {control}
          {attach ? <span className="pd-row-attach">{attach}</span> : null}
        </div>
      ) : attach ? (
        <div className="pd-row-attach pd-row-attach-bare">{attach}</div>
      ) : null}
      {nested ? (
        /* Kept mounted while collapsed (just hidden) so nested rows keep
           their editor state; their fold state lives on the slots anyway. */
        <div className="pd-row-nested" hidden={collapsed}>
          {nested}
        </div>
      ) : null}
    </div>
  )
}
