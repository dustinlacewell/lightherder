/*
 * .chrome-help — small chrome-engraved "?" dot with a hover/focus popover.
 *
 * The popover is portaled to document.body so it can escape any
 * `overflow: hidden / auto` ancestor (e.g. a side panel's scroll body).
 * Position is computed from the trigger's bounding rect; if there's not
 * enough room below the trigger, the popover flips to above. Horizontal
 * position clamps so the popover never overflows the viewport.
 */

import { useEffect, useId, useRef, useState, type HTMLAttributes } from 'react'
import { createPortal } from 'react-dom'

interface HelpTooltipProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'title'> {
  title: string
  description: string
  className?: string
}

const POPOVER_WIDTH = 240
const VIEWPORT_MARGIN = 6
const TRIGGER_GAP = 6

interface PopoverPos {
  top: number
  left: number
  /** Did we end up flipping to render above the trigger? */
  above: boolean
}

export function HelpTooltip({
  title,
  description,
  className = '',
  ...rest
}: HelpTooltipProps) {
  const popoverId = useId()
  const triggerRef = useRef<HTMLSpanElement | null>(null)
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<PopoverPos | null>(null)

  // Recompute position whenever we open. Also reposition on scroll /
  // resize while open so the popover follows its trigger.
  useEffect(() => {
    if (!open) return
    const place = () => {
      const t = triggerRef.current
      if (!t) return
      setPos(computePosition(t.getBoundingClientRect()))
    }
    place()
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [open])

  return (
    <>
      <span
        {...rest}
        ref={triggerRef}
        className={`chrome-help ${className}`}
        tabIndex={0}
        role="button"
        aria-label={`About ${title}`}
        aria-describedby={open ? popoverId : undefined}
        onPointerEnter={() => setOpen(true)}
        onPointerLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        <span className="chrome-help-glyph" aria-hidden="true">?</span>
      </span>
      {open && pos
        ? createPortal(
            <div
              id={popoverId}
              role="tooltip"
              className="chrome-help-popover"
              data-placement={pos.above ? 'above' : 'below'}
              style={{ top: pos.top, left: pos.left, width: POPOVER_WIDTH }}
            >
              <strong>{title}</strong>
              <span>{description}</span>
            </div>,
            document.body,
          )
        : null}
    </>
  )
}

/**
 * Place the popover below the trigger by default; flip above if it
 * would extend past the bottom edge. Horizontally clamp to the viewport
 * so we never paint outside the visible window.
 */
function computePosition(trigger: DOMRect): PopoverPos {
  const vw = window.innerWidth
  const vh = window.innerHeight

  // Default vertical placement: below the trigger.
  // The actual popover height isn't known yet — we estimate ~5 lines
  // worth (~100px) for the flip decision. Once rendered, browser
  // clipping handles any remaining overflow.
  const estimatedH = 100
  const belowTop = trigger.bottom + TRIGGER_GAP
  const wantsAbove = belowTop + estimatedH + VIEWPORT_MARGIN > vh
  const above = wantsAbove && trigger.top - TRIGGER_GAP - estimatedH > VIEWPORT_MARGIN
  const top = above
    ? trigger.top - TRIGGER_GAP - estimatedH
    : belowTop

  // Default horizontal: align the popover's right edge with the
  // trigger's right edge — keeps the help icon visually "tethered"
  // to its tooltip. Clamp so we don't paint past either side.
  let left = trigger.right - POPOVER_WIDTH
  if (left < VIEWPORT_MARGIN) left = VIEWPORT_MARGIN
  if (left + POPOVER_WIDTH > vw - VIEWPORT_MARGIN) {
    left = vw - VIEWPORT_MARGIN - POPOVER_WIDTH
  }

  return { top, left, above }
}

export type { HelpTooltipProps }
