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

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { HoverCard } from '@ldlework/phosphor'
import type { RowProps } from '@ldlework/dials/react'

/*
 * Subtree fold-all signal. A shift-click on a row's fold toggle applies
 * that row's new state to everything below it — collapse-all or
 * expand-all, whichever direction the shift-click just set. Since nested
 * rows are opaque children, the ancestor can't reach them directly:
 * each row broadcasts a `{ target, nonce }` to its descendants and bumps
 * the nonce on shift-click; every descendant snaps to `target` whenever
 * the nonce changes. Each row re-provides its own signal, so the cascade
 * is scoped to the clicked row's subtree, not the whole panel. `nonce
 * === 0` is the mount baseline (no cascade requested yet).
 */
interface FoldSignal {
  target: boolean // desired `collapsed` for the subtree
  nonce: number // bumped per shift-click to force re-application
}
const FoldAllContext = createContext<FoldSignal>({ target: false, nonce: 0 })

export function Row({
  label,
  control,
  attach,
  nested,
  description,
}: RowProps): ReactNode {
  // A nested drawer (an attached source's sub-params) can be folded
  // away to keep deep modulation trees scannable. State is per-row and
  // ephemeral — presentation only, never touches the dials tree. Rows
  // with no drawer never show the toggle.
  const [collapsed, setCollapsed] = useState(false)

  // When an ancestor issues a fold-all, its nonce changes; snap to the
  // broadcast target. Only a change *after* this instance mounted counts
  // — the nonce seen at mount is the baseline, so remounting never
  // re-fires a stale request.
  const parentSignal = useContext(FoldAllContext)
  const seenNonce = useRef(parentSignal.nonce)
  useEffect(() => {
    if (parentSignal.nonce !== seenNonce.current) {
      seenNonce.current = parentSignal.nonce
      setCollapsed(parentSignal.target)
    }
  }, [parentSignal])

  // Our own signal for descendants — its nonce bumps on shift-click to
  // cascade the fold/unfold through the subtree.
  const [subSignal, setSubSignal] = useState<FoldSignal>({
    target: false,
    nonce: 0,
  })

  const onFold = (e: React.MouseEvent) => {
    if (e.shiftKey) {
      // Toggle this row and cascade the same target to everything below.
      const next = !collapsed
      setCollapsed(next)
      setSubSignal((s) => ({ target: next, nonce: s.nonce + 1 }))
      return
    }
    setCollapsed((c) => !c)
  }

  return (
    <div className="pd-row" data-collapsed={nested && collapsed ? '' : undefined}>
      <div className="pd-row-caption">
        <span className="pd-row-label">
          {nested ? (
            <button
              type="button"
              className="pd-row-fold"
              aria-expanded={!collapsed}
              aria-label={collapsed ? 'Expand modulation' : 'Collapse modulation'}
              title="Click to fold · Shift-click to fold all below"
              onClick={onFold}
            >
              {collapsed ? '▸' : '▾'}
            </button>
          ) : null}
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
      {control ? (
        <div className="pd-row-control">
          {control}
          {attach ? <span className="pd-row-attach">{attach}</span> : null}
        </div>
      ) : attach ? (
        <div className="pd-row-attach pd-row-attach-bare">{attach}</div>
      ) : null}
      {nested ? (
        <FoldAllContext.Provider value={subSignal}>
          {/* Kept mounted while collapsed (just hidden) so each nested
              row's own fold state survives folding an ancestor. */}
          <div className="pd-row-nested" hidden={collapsed}>
            {nested}
          </div>
        </FoldAllContext.Provider>
      ) : null}
    </div>
  )
}
