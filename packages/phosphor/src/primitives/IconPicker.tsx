/*
 * .chrome-iconpicker — compact icon selector: a small square chrome
 * trigger showing the current option's glyph; clicking opens a popover
 * grid of glyph cells anchored below the trigger, right-aligned.
 *
 * Unlike Dropdown (a restyled native <select> for text options), this
 * exists for option sets that are best told apart by shape — waveform
 * glyphs, pattern swatches. The popover is plain absolute positioning
 * inside the picker's own stacking context — no portal, no flip logic —
 * so it stays cheap; hosts with clipping ancestors should reach for
 * Dropdown instead.
 *
 * Hover popups: the trigger (via `hoverContent`) and each grid cell
 * (via `option.hover`) can carry a HoverCard — a portaled popup in the
 * HelpTooltip visual family that reveals on hover/focus. Cell cards
 * park flush beside the popover so they never cover the grid; at most
 * one card is visible at a time. HoverCard is exported so consumer-
 * rendered footer cells can get the same treatment.
 */

import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface IconPickerOption {
  value: string
  label: string
  icon: ReactNode
  /** Optional longer text shown as the cell's title tooltip. */
  hint?: string | undefined
  /**
   * Rich hover popup shown beside the popover while this cell is
   * hovered/focused (a HoverCard). When set, the cell's `title`
   * tooltip is suppressed so the two never double up.
   */
  hover?: ReactNode | undefined
}

interface IconPickerProps {
  /** Matches an option value; '' conventionally means "none". */
  value: string
  options: IconPickerOption[]
  onChange: (v: string) => void
  /** Accessible name for the trigger. */
  label?: string | undefined
  /**
   * Auxiliary controls rendered inside the popover, below the glyph
   * grid and separated by a subtle rule. A slot for related knobs the
   * host wants at hand while the picker is open (e.g. a mode segment).
   * Footer clicks do NOT close the popover — it dismisses only on
   * option select, outside-click, or Escape, and the footer lives
   * inside the popover so the outside-click handler already ignores it.
   */
  footer?: ReactNode | undefined
  /**
   * Hover popup for the closed trigger — a HoverCard explaining what
   * the picker controls. Suppressed while the popover is open so the
   * explainer never sits on top of the grid.
   */
  hoverContent?: ReactNode | undefined
  /**
   * Controlled open state. When provided, the picker is controlled: it
   * renders open iff this is true and reports every open/close request
   * through `onOpenChange` instead of tracking its own state. Omit both
   * for the default uncontrolled behavior (the trigger toggles it).
   * Lets a host open the popover from an external gesture — e.g. a
   * right-click on an associated control.
   */
  open?: boolean | undefined
  onOpenChange?: ((open: boolean) => void) | undefined
  /**
   * Suppress the trigger button entirely — the picker becomes a
   * popover with no visible control of its own, opened by the host's
   * external gesture (via controlled `open`). The root span stays as
   * the popover's positioning anchor. `hoverContent` is ignored (there's
   * no trigger to hover). Use when another element (e.g. a knob face)
   * is the affordance.
   */
  hideTrigger?: boolean | undefined
  className?: string
  style?: CSSProperties
}

// ─── HoverCard ────────────────────────────────────────────────────────

interface HoverCardProps {
  /** Popup body — same visual family as HelpTooltip's popover. */
  content: ReactNode
  /** The hover target. Wrapped in an inline-flex span that shrink-wraps. */
  children: ReactNode
  /**
   * `'below'` (default) hangs the card under the target, right-aligned,
   * flipping above when the viewport runs out — the HelpTooltip idiom.
   * `'side'` parks it flush beside the nearest `anchorSelector`
   * ancestor (falling back to the target itself), top-aligned with the
   * target — for cells inside a popover the card must not cover.
   */
  placement?: 'below' | 'side' | undefined
  /** Ancestor selector the `'side'` placement anchors against. */
  anchorSelector?: string | undefined
  /** While true the card never shows (and hides if showing). */
  disabled?: boolean | undefined
  /**
   * Height guess the flip/clamp math plans around (default 110). Cards
   * size to content after render, so a card known to run tall (e.g.
   * one carrying a preview image) passes its real height here to keep
   * its bottom on-screen.
   */
  estimatedHeight?: number | undefined
  className?: string
}

/** Cap, not a fixed size — cards shrink-wrap their content. */
const CARD_MAX_WIDTH = 240
const CARD_MARGIN = 6
const CARD_GAP = 6
/** Height guess for flip/clamp decisions — the HelpTooltip approach;
    browser clipping handles any remaining overflow after render. */
const CARD_ESTIMATED_H = 110

/**
 * Cards size to their content, so alignment pins whichever edge is
 * known: `left` when the card grows rightward, `right` (as a CSS
 * `right` offset) when it grows leftward.
 */
interface CardPos {
  top: number
  left?: number
  right?: number
  placement: 'above' | 'below' | 'side'
}

/*
 * Only one hover card is visible at a time, globally — a freshly
 * shown card closes whichever card was up (hover + keyboard focus can
 * otherwise light two at once).
 */
let activeCard: { id: object; close: () => void } | null = null

function claimActiveCard(id: object, close: () => void): void {
  if (activeCard && activeCard.id !== id) activeCard.close()
  activeCard = { id, close }
}

function releaseActiveCard(id: object): void {
  if (activeCard && activeCard.id === id) activeCard = null
}

/**
 * Hover/focus-revealed popup in the HelpTooltip visual family, for
 * arbitrary content. Portaled to document.body so it escapes clipping
 * ancestors; position recomputes on scroll/resize while shown; at most
 * one card is visible app-wide. The popup is pointer-inert (like the
 * help popover) — it's a peek, not a surface.
 */
export function HoverCard({
  content,
  children,
  placement = 'below',
  anchorSelector,
  disabled = false,
  estimatedHeight = CARD_ESTIMATED_H,
  className = '',
}: HoverCardProps) {
  const hostRef = useRef<HTMLSpanElement | null>(null)
  const idRef = useRef<object>({})
  const [open, setOpen] = useState(false)

  const show = () => {
    if (disabled) return
    claimActiveCard(idRef.current, () => setOpen(false))
    setOpen(true)
  }
  const hide = () => {
    releaseActiveCard(idRef.current)
    setOpen(false)
  }

  // Becoming disabled (e.g. the picker popover opening under the
  // trigger's card) dismisses immediately.
  useEffect(() => {
    if (!disabled) return
    releaseActiveCard(idRef.current)
    setOpen(false)
  }, [disabled])

  // Never leave a dangling registry claim behind on unmount.
  useEffect(() => {
    const id = idRef.current
    return () => releaseActiveCard(id)
  }, [])

  const [pos, setPos] = useState<CardPos | null>(null)

  // Position on open; follow the target through scroll/resize.
  useEffect(() => {
    if (!open) return
    const place = () => {
      const host = hostRef.current
      if (!host) return
      const anchor =
        (anchorSelector ? host.closest(anchorSelector) : null) ?? host
      setPos(
        computeCardPosition(
          host.getBoundingClientRect(),
          anchor.getBoundingClientRect(),
          placement,
          estimatedHeight,
        ),
      )
    }
    place()
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [open, placement, anchorSelector, estimatedHeight])

  return (
    <>
      <span
        ref={hostRef}
        className={`chrome-hovercard-host ${className}`}
        onPointerEnter={show}
        onPointerLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        {children}
      </span>
      {open && pos
        ? createPortal(
            <div
              role="tooltip"
              className="chrome-help-popover chrome-hovercard"
              data-placement={pos.placement}
              style={{
                top: pos.top,
                left: pos.left,
                right: pos.right,
                width: 'max-content',
                maxWidth: CARD_MAX_WIDTH,
              }}
            >
              {content}
            </div>,
            document.body,
          )
        : null}
    </>
  )
}

/**
 * `'below'`: under the target, right edges aligned (right-edge pin, so
 * the shrink-wrapped card grows leftward), flipping above when the
 * bottom would clip — the HelpTooltip recipe. `'side'`: flush right of
 * the anchor, top-aligned with the target, swapping to the anchor's
 * left (right-edge pin) when a max-width card would clip. Both clamp
 * into the viewport using the max width as the worst case.
 */
function computeCardPosition(
  target: DOMRect,
  anchor: DOMRect,
  placement: 'below' | 'side',
  estH: number = CARD_ESTIMATED_H,
): CardPos {
  const vw = window.innerWidth
  const vh = window.innerHeight

  if (placement === 'side') {
    let top = target.top
    if (top + estH > vh - CARD_MARGIN) {
      top = vh - CARD_MARGIN - estH
    }
    if (top < CARD_MARGIN) top = CARD_MARGIN
    const left = anchor.right + CARD_GAP
    if (left + CARD_MAX_WIDTH > vw - CARD_MARGIN) {
      // Flip: card sits left of the anchor, its right edge pinned there.
      return { top, right: vw - anchor.left + CARD_GAP, placement: 'side' }
    }
    return { top, left, placement: 'side' }
  }

  const belowTop = target.bottom + CARD_GAP
  const wantsAbove = belowTop + estH + CARD_MARGIN > vh
  const above = wantsAbove && target.top - CARD_GAP - estH > CARD_MARGIN
  const top = above ? target.top - CARD_GAP - estH : belowTop

  // Right edges aligned; clamp the pin inside the viewport.
  let right = vw - target.right
  if (right < CARD_MARGIN) right = CARD_MARGIN
  if (right > vw - CARD_MARGIN - CARD_MAX_WIDTH) {
    right = Math.max(CARD_MARGIN, vw - CARD_MARGIN - CARD_MAX_WIDTH)
  }

  return { top, right, placement: above ? 'above' : 'below' }
}

/**
 * Icon-grid picker in a chrome shell. The trigger is a small raised
 * chrome button carrying the current option's glyph (falling back to
 * the first option's when `value` matches nothing); selecting a cell
 * fires `onChange` and closes. Outside-click and Escape both dismiss.
 */
export function IconPicker({
  value,
  options,
  onChange,
  label,
  footer,
  hoverContent,
  open: openProp,
  onOpenChange,
  hideTrigger = false,
  className = '',
  style,
}: IconPickerProps) {
  const popoverId = useId()
  const rootRef = useRef<HTMLSpanElement | null>(null)
  // Controlled when `open` is supplied; otherwise track locally. A
  // single `setOpen` funnels both paths — it writes local state when
  // uncontrolled and always reports through `onOpenChange`.
  const [openLocal, setOpenLocal] = useState(false)
  const controlled = openProp !== undefined
  const open = controlled ? openProp : openLocal
  const setOpen = (next: boolean) => {
    if (!controlled) setOpenLocal(next)
    onOpenChange?.(next)
  }

  // Dismissal — outside-click (capture-phase, so clicks that other
  // handlers swallow still close us) and Escape, wired only while open.
  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      const root = rootRef.current
      if (root && !root.contains(e.target as Node)) setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const current = options.find((o) => o.value === value) ?? options[0]

  const trigger = hideTrigger ? null : (
    <button
      type="button"
      className="chrome-iconpicker-trigger"
      aria-haspopup="true"
      aria-expanded={open}
      aria-label={label}
      aria-controls={open ? popoverId : undefined}
      onClick={() => setOpen(!open)}
    >
      <span className="chrome-iconpicker-glyph" aria-hidden="true">
        {current?.icon}
      </span>
    </button>
  )

  return (
    <span ref={rootRef} className={`chrome-iconpicker ${className}`} style={style}>
      {hideTrigger ? null : hoverContent !== undefined ? (
        <HoverCard content={hoverContent} disabled={open}>
          {trigger}
        </HoverCard>
      ) : (
        trigger
      )}
      {open ? (
        <div
          id={popoverId}
          role="listbox"
          aria-label={label}
          className="chrome-iconpicker-popover"
        >
          {options.map((o) => {
            const cell = (
              <button
                type="button"
                role="option"
                aria-selected={o.value === value}
                className={`chrome-iconpicker-cell ${o.value === value ? 'is-selected' : ''}`}
                // The hover card supersedes the native tooltip — never
                // both at once.
                title={
                  o.hover !== undefined
                    ? undefined
                    : o.hint
                      ? `${o.label} — ${o.hint}`
                      : o.label
                }
                onClick={() => {
                  onChange(o.value)
                  setOpen(false)
                }}
              >
                <span className="chrome-iconpicker-glyph" aria-hidden="true">
                  {o.icon}
                </span>
              </button>
            )
            return o.hover !== undefined ? (
              <HoverCard
                key={o.value}
                placement="side"
                anchorSelector=".chrome-iconpicker-popover"
                content={o.hover}
              >
                {cell}
              </HoverCard>
            ) : (
              <span key={o.value} className="chrome-hovercard-host">
                {cell}
              </span>
            )
          })}
          {footer ? (
            <div className="chrome-iconpicker-footer">{footer}</div>
          ) : null}
        </div>
      ) : null}
    </span>
  )
}

export type { IconPickerProps, IconPickerOption, HoverCardProps }
