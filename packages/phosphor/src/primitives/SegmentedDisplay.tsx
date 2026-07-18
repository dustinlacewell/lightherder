import type { HTMLAttributes, ReactNode } from 'react'
import { SegmentedSurface } from './SegmentedSurface'

interface SegmentedDisplayProps extends HTMLAttributes<HTMLDivElement> {
  /**
   * Optional dim text rendered behind the content in the display's
   * unlit-segment colour. Use to draw the off-state segments under
   * a partial reading (e.g. `ghost="88:88"` behind `"03:14"` so the
   * other digit positions still show their segment outlines), or as
   * a placeholder when there's nothing to display.
   *
   * Same width assumption as `children` — both render with the
   * same monospaced segment font, so passing the same character
   * count keeps the layers aligned per-glyph.
   */
  ghost?: ReactNode
  /**
   * Pixel offset for the ghost layer relative to the lit layer.
   * Small values (e.g. `{ x: 1, y: 1 }`) give a depth-displaced
   * shadow read; larger ones lift the ghost like a parallax plane.
   * Default `{ x: 0, y: 0 }` — the ghost sits perfectly under the
   * lit layer.
   */
  ghostOffset?: { x?: number; y?: number }
  /**
   * The display's emitted color — any CSS color expression. Drives
   * the rim catch, body tint, glyph color, and glow for THIS display.
   * Omit to follow the page theme via `--display-color`.
   */
  color?: string
  children: ReactNode
}

/**
 * A small recessed-glass digit display, the kind a hi-fi unit
 * mounts on its faceplate. Numerals render in DSEG7-Classic; the
 * surrounding "frame" is the .screen-embedded substrate (chamfered
 * rim, display-color-tinted backing). The rim catch picks up the
 * display's `color` so a green display gets a green rim glow.
 *
 * Convenience wrapper over `SegmentedSurface` for the common
 * "lit text + optional ghost text" case. For anything more
 * (multiple fonts mixed, glyph icons, SVG content), use
 * `SegmentedSurface` directly with `lit` / `ghost` ReactNode slots.
 *
 * Designed to be mounted on a `Panel`, not inside a `Display` —
 * this primitive IS the small embedded display, not a chassis-level
 * piece of chrome.
 */
export function SegmentedDisplay({
  children,
  ghost,
  ghostOffset,
  color,
  ...rest
}: SegmentedDisplayProps) {
  return (
    <SegmentedSurface
      {...rest}
      lit={children}
      {...(ghost !== undefined ? { ghost } : {})}
      {...(ghostOffset !== undefined ? { ghostOffset } : {})}
      {...(color !== undefined ? { color } : {})}
    />
  )
}

export type { SegmentedDisplayProps }
