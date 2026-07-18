/*
 * Resolve a CSS color expression (typically `var(--theme-lit-bright)`)
 * to an sRGB triple in [0, 1] using the document's live cascade. The
 * implementation paints the color into a 1×1 2D canvas and reads back
 * the bytes — that delegates parsing of `oklch()`, `color-mix()`, and
 * friends to the browser, instead of fragile regexing of
 * `getComputedStyle().color` (which in modern Chrome returns the
 * original `oklch(...)` literal verbatim).
 *
 * Returned components are sRGB-encoded — the present shader composites
 * directly in display space, so no linearisation is applied here.
 *
 * The probe span and the 1×1 canvas are module-scope singletons,
 * lazily attached on first call. Cheap to call once per frame.
 */

const FALLBACK_COLOR: readonly [number, number, number] = [0.5, 1, 0.5]
let themeProbeSpan: HTMLSpanElement | null = null
let themeProbeCtx: CanvasRenderingContext2D | null = null

export function resolveThemeColor(
  cssExpression: string,
): readonly [number, number, number] {
  if (typeof document === 'undefined') return FALLBACK_COLOR
  if (!themeProbeSpan) {
    const span = document.createElement('span')
    span.setAttribute('aria-hidden', 'true')
    span.style.cssText =
      'position:absolute;visibility:hidden;pointer-events:none;'
    document.body.appendChild(span)
    themeProbeSpan = span
  }
  if (!themeProbeCtx) {
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1
    themeProbeCtx =
      canvas.getContext('2d', { willReadFrequently: true }) ?? null
    if (!themeProbeCtx) return FALLBACK_COLOR
  }
  themeProbeSpan.style.color = cssExpression
  const resolved = getComputedStyle(themeProbeSpan).color
  themeProbeCtx.fillStyle = resolved
  themeProbeCtx.fillRect(0, 0, 1, 1)
  const [r, g, b] = themeProbeCtx.getImageData(0, 0, 1, 1).data
  return [r! / 255, g! / 255, b! / 255]
}
