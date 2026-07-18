/*
 * Skeuomorphic Row layout for dials' Panel.
 *
 * One slot row, two-line layout:
 *
 *   ┌─────────────────────────────────────────────┐
 *   │ label             (?)        [attach pick]  │   header strip
 *   │ ─────────────────────────────────────────── │
 *   │ ──slider── [ 0.42 ]                          │   control row
 *   │     ▸ nested sub-panel for attached source   │   (recursive)
 *   └─────────────────────────────────────────────┘
 *
 * Header sits on its own line so long labels + attached-source helps
 * never collide with the control row. Nested sub-panels indent left
 * with a coloured rail so the recursion is visually unambiguous.
 */

import type { ReactNode } from 'react'
import type { RowProps } from '@ldlework/dials/react'

export function Row({ label, control, help, attach, nested }: RowProps): ReactNode {
  return (
    <div className="pd-row">
      <div className="pd-row-header">
        <span className="pd-row-label">{label}</span>
        {help ? <span className="pd-row-help">{help}</span> : null}
        {attach ? <span className="pd-row-attach">{attach}</span> : null}
      </div>
      {control ? <div className="pd-row-control">{control}</div> : null}
      {nested ? <div className="pd-row-nested">{nested}</div> : null}
    </div>
  )
}
