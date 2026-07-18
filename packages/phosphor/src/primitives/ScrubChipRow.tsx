import { useEffect, useRef, type ReactNode } from 'react'

/**
 * One chip in a scrub row. `key` identifies the item to the parent
 * — pass-through, opaque to this primitive. `lit` is the active
 * state. `content` is the rendered label (string, JSX — anything).
 * `chipClassName` lets variants extend the base chip class without
 * owning the whole DOM.
 */
export interface ScrubChipItem<K extends string> {
  key: K
  lit: boolean
  content: ReactNode
  chipClassName?: string
}

interface ScrubChipRowProps<K extends string> {
  items: ReadonlyArray<ScrubChipItem<K>>
  /**
   * Fired when the user picks an item with the **primary** button
   * — by tap or by drag-scrub crossing into it. Idempotent on the
   * same key (the row guards against repeated fires on the active
   * item during a drag).
   */
  onSelect: (key: K) => void
  /**
   * Optional override for plain-tap behavior on the primary button.
   * Defaults to `onSelect`.
   */
  onTap?: (key: K) => void
  /**
   * Fired when the user picks an item with the **secondary** (right)
   * button — by tap or by drag-scrub. When provided, the row
   * suppresses the browser context menu so right-drag is usable.
   */
  onAltSelect?: (key: K) => void
  /** Optional override for plain right-tap behavior; defaults to `onAltSelect`. */
  onAltTap?: (key: K) => void
  disabled?: boolean
  /**
   * Behavior when the drag pointer leaves the row's horizontal
   * extent. `wrap` (default) treats the row modulo its width.
   * `clamp` pins to the end chip. `none` simply stops scrubbing
   * until the pointer comes back over the row.
   */
  edgeBehavior?: 'wrap' | 'clamp' | 'none'
  className?: string
}

/** Which mouse button started the active drag. */
type DragMode = 'primary' | 'alt' | null

/**
 * A horizontal row of screen chips with drag-to-scrub. Press on any
 * chip and slide left/right to sweep through the row; the row
 * tracks the pointer globally so leaving the row vertically doesn't
 * drop the scrub. Tap (no drag) selects the chip pressed.
 *
 * Optionally supports a secondary (right-button) selection mode via
 * `onAltSelect` — same drag-scrub mechanics, distinct callback. The
 * mode is locked at the start of the drag, so left-drag stays a
 * primary scrub even if the user happens to press right mid-drag.
 *
 * Domain-agnostic: callers pass labels and an opaque key per item,
 * and receive a key on every selection.
 */
export function ScrubChipRow<K extends string>({
  items,
  onSelect,
  onTap,
  onAltSelect,
  onAltTap,
  disabled,
  edgeBehavior = 'wrap',
  className = 'screen-chip-row',
}: ScrubChipRowProps<K>) {
  const rowRef = useRef<HTMLDivElement | null>(null)
  const dragModeRef = useRef<DragMode>(null)
  const movedRef = useRef(false)
  const lastKeyRef = useRef<K | null>(null)

  // Latest callbacks in refs so the window-level listeners stay
  // stable across renders — re-binding `pointermove` every render
  // would drop in-flight drags whenever the parent rerenders.
  const onSelectRef = useRef(onSelect)
  const onAltSelectRef = useRef(onAltSelect)
  useEffect(() => {
    onSelectRef.current = onSelect
  }, [onSelect])
  useEffect(() => {
    onAltSelectRef.current = onAltSelect
  }, [onAltSelect])

  useEffect(() => {
    if (disabled) return
    const onMove = (e: PointerEvent) => {
      const mode = dragModeRef.current
      if (!mode) return
      const k = keyForX<K>(rowRef.current, e.clientX, edgeBehavior)
      if (k == null) return
      if (k === lastKeyRef.current) return
      movedRef.current = true
      lastKeyRef.current = k
      const cb = mode === 'alt' ? onAltSelectRef.current : onSelectRef.current
      cb?.(k)
    }
    const onUp = () => {
      dragModeRef.current = null
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [disabled, edgeBehavior])

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>, k: K) => {
    if (disabled) return
    let mode: DragMode = null
    if (e.button === 0) mode = 'primary'
    else if (e.button === 2 && onAltSelect) mode = 'alt'
    if (mode == null) return

    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
    dragModeRef.current = mode
    movedRef.current = false
    lastKeyRef.current = k
  }

  const handlePointerUp = (e: React.PointerEvent<HTMLButtonElement>, k: K) => {
    if (disabled) return
    const mode = dragModeRef.current
    if (mode === 'primary' && e.button !== 0) return
    if (mode === 'alt' && e.button !== 2) return
    if (movedRef.current) return
    if (mode === 'alt') (onAltTap ?? onAltSelect)?.(k)
    else (onTap ?? onSelect)(k)
  }

  const handleContextMenu = onAltSelect
    ? (e: React.MouseEvent<HTMLDivElement>) => e.preventDefault()
    : undefined

  return (
    <div ref={rowRef} className={className} onContextMenu={handleContextMenu}>
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          className={item.chipClassName ?? 'screen-chip'}
          data-lit={item.lit ? 'true' : 'false'}
          data-scrub-key={item.key}
          aria-pressed={item.lit}
          disabled={disabled}
          onPointerDown={(e) => handlePointerDown(e, item.key)}
          onPointerUp={(e) => handlePointerUp(e, item.key)}
        >
          {item.content}
        </button>
      ))}
    </div>
  )
}

/**
 * Map a viewport x-coordinate to the chip key under it, using the
 * row's actual chip rects. The row is treated as a 1D slider — y is
 * ignored, so the pointer can wander vertically without dropping
 * the scrub.
 */
function keyForX<K extends string>(
  row: HTMLDivElement | null,
  x: number,
  edgeBehavior: 'wrap' | 'clamp' | 'none',
): K | null {
  if (!row) return null
  const chips = row.querySelectorAll<HTMLElement>('[data-scrub-key]')
  if (chips.length === 0) return null
  const rects = Array.from(chips, (c) => c.getBoundingClientRect())
  const first = rects[0]
  const last = rects[rects.length - 1]
  if (!first || !last) return null
  const left = first.left
  const right = last.right
  const span = right - left
  if (span <= 0) return null

  let probeX = x
  if (x < left || x > right) {
    if (edgeBehavior === 'none') return null
    if (edgeBehavior === 'clamp') probeX = Math.max(left, Math.min(right, x))
    else probeX = left + ((((x - left) % span) + span) % span)
  }

  let best = 0
  let bestDist = Infinity
  for (let i = 0; i < rects.length; i++) {
    const r = rects[i]
    if (!r) continue
    const d = probeX < r.left ? r.left - probeX : probeX > r.right ? probeX - r.right : 0
    if (d < bestDist) {
      bestDist = d
      best = i
      if (d === 0) break
    }
  }
  const chip = chips[best]
  return (chip?.getAttribute('data-scrub-key') as K | null) ?? null
}
