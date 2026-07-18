import { useCallback, useEffect, useRef } from 'react'

interface HueStripProps {
  hue: number
  onChange: (hue: number) => void
  /** Optional aria-label override. Defaults to "Theme hue". */
  ariaLabel?: string
  className?: string
}

/**
 * Digital hue slider — a 360° OKLCH strip with a draggable thumb.
 * All emitted-light pixels: no chrome, no widget chassis. Belongs on
 * a Panel or inside the Screen of a Display.
 *
 * Pointer drag updates the hue continuously; click sets it. Keyboard:
 * arrows ±1°, PageUp/PageDown ±10°. The strip itself is the source
 * of truth for the visual mapping — the same OKLCH values it paints
 * are the ones the theme applies via `--theme-hue`.
 */
export function HueStrip({
  hue,
  onChange,
  ariaLabel = 'Theme hue',
  className = '',
}: HueStripProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)

  const updateFromEvent = useCallback(
    (clientX: number) => {
      const el = trackRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const fraction = (clientX - rect.left) / rect.width
      const next = Math.max(0, Math.min(360, fraction * 360))
      onChange(next)
    },
    [onChange],
  )

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!draggingRef.current) return
      updateFromEvent(e.clientX)
    }
    const onUp = () => {
      if (!draggingRef.current) return
      draggingRef.current = false
      // Lift the global "theme dragging" flag so the chrome family's
      // hover transitions resume their normal duration. See the
      // pointerdown handler for why this exists.
      document.documentElement.removeAttribute('data-theme-dragging')
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [updateFromEvent])

  // Build an OKLCH gradient at the same L/C the theme uses for the
  // primary lit color, so the strip is a faithful preview.
  const stops: string[] = []
  for (let h = 0; h <= 360; h += 30) {
    stops.push(`oklch(0.78 0.16 ${h}) ${(h / 360) * 100}%`)
  }
  const background = `linear-gradient(to right, ${stops.join(', ')})`
  const thumbPercent = (hue / 360) * 100

  return (
    <div
      ref={trackRef}
      role="slider"
      tabIndex={0}
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={360}
      aria-valuenow={Math.round(hue)}
      className={`screen-embedded hue-strip ${className}`}
      onPointerDown={(e) => {
        draggingRef.current = true
        e.currentTarget.setPointerCapture(e.pointerId)
        // Mark the document as actively re-skinning so chrome elements
        // suppress their hover-color transitions during the drag —
        // otherwise their `transition: color 200ms` makes them lag
        // behind --theme-hue, which the user sees as the active tab
        // chip catching up frames late.
        document.documentElement.setAttribute('data-theme-dragging', 'true')
        updateFromEvent(e.clientX)
      }}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft') onChange((hue - 1 + 360) % 360)
        else if (e.key === 'ArrowRight') onChange((hue + 1) % 360)
        else if (e.key === 'PageDown') onChange((hue - 10 + 360) % 360)
        else if (e.key === 'PageUp') onChange((hue + 10) % 360)
      }}
      style={{ background }}
    >
      <div
        aria-hidden
        className="hue-strip-thumb"
        style={{ left: `${thumbPercent}%` }}
      />
    </div>
  )
}
