import type { CSSProperties, HTMLAttributes, ReactNode } from 'react'

interface DisplayProps extends HTMLAttributes<HTMLDivElement> {
  /** The content displayed on the screen. */
  children: ReactNode
  /**
   * Optional header strip rendered on the chrome above the screen —
   * the place to mount embedded hardware-style controls (key displays,
   * instrument selectors, status lamps). Lives on the chrome plate
   * (Lip), not on the OLED glass.
   */
  header?: ReactNode
  /**
   * Optional footer strip rendered on the chrome below the screen —
   * compact secondary controls. Mirror of `header`.
   */
  footer?: ReactNode
  /**
   * Optional content rendered as an overlay on the OLED glass —
   * positioned above the screen content by absolute-positioning
   * inside the screen. For a quick floating label, wrap text in
   * `<span className="screen-readout">…</span>`.
   */
  readout?: ReactNode
  /**
   * Padding inside the Screen, around `children`. Number is treated as
   * px; string is passed through verbatim (`'16px 24px'`, `'1rem'`).
   * Defaults to `0` — the Screen is a pure substrate and lets the
   * composer choose breathing room. Pass `16` for the typical
   * "on-glass content sits a bit in from the chamfer" look.
   */
  padding?: number | string
  /**
   * Stretch the Display to fill its parent. When `true`, the chassis
   * and the inner Bezel + Screen all claim `flex: 1` so the screen
   * grows to whatever height the parent flexbox provides. The default
   * (`false`) lets the Display size to its content.
   */
  fill?: boolean
  /**
   * Style overrides for the inner Screen surface. Use for one-off
   * adjustments not covered by `padding` / `fill` (e.g. flex layout
   * of on-glass content). Doesn't affect the chrome chassis or bezel.
   */
  screenStyle?: CSSProperties
  /** Extra className for the inner Screen surface. */
  screenClassName?: string
  /**
   * Style overrides for the black Bezel ring around the screen.
   * Rarely needed; `fill` covers the common "stretch to parent" case.
   */
  bezelStyle?: CSSProperties
  /** Extra className for the Bezel. */
  bezelClassName?: string
}

/**
 * The canonical OLED display chassis: chrome Lip + black Bezel ring +
 * dark luminous Screen, with optional Header / Footer / Readout slots.
 *
 * Composition:
 *   1. Outer chrome plate (chrome-raised substrate + Lip class —
 *      the same substrate as Panel, with screen-light effects on
 *      the chrome side of the Lip↔Bezel interface)
 *   2. Optional `header` strip on the chrome, above the screen
 *   3. Black Bezel ring around the screen (paints its own inner
 *      rim-light at the bezel↔screen interface)
 *   4. The Screen — back panel + Spill (theme-tinted bloom) +
 *      Recess depth shading. Holds children + readout.
 *   5. Optional `footer` strip on the chrome, below the screen
 *
 * Header / footer / readout slots let composites embed controls on
 * the chrome (header/footer) or float content over the glass
 * (readout) without breaking the visual identity. Nothing physical
 * (chrome, widget chrome) is allowed inside the screen — children
 * should be emitted-light pixels only.
 *
 * The Screen has zero default padding. Use the `padding` prop for
 * the typical "on-glass content sits a bit in from the chamfer"
 * look (e.g. `padding={16}`), or leave it 0 to bleed content to the
 * screen edge (oscilloscope, full-bleed canvas).
 */
export function Display({
  className = '',
  children,
  header,
  footer,
  readout,
  padding,
  fill,
  screenStyle,
  screenClassName = '',
  bezelStyle,
  bezelClassName = '',
  ...rest
}: DisplayProps) {
  // Merge ergonomic props (padding, fill) with the screenStyle escape
  // hatch. Explicit screenStyle entries win — it's the override slot.
  const mergedScreenStyle: CSSProperties = {
    ...(padding !== undefined ? { padding } : {}),
    ...(fill ? { flex: 1 } : {}),
    ...screenStyle,
  }
  const mergedBezelStyle: CSSProperties = {
    ...(fill ? { flex: 1 } : {}),
    ...bezelStyle,
  }
  // Same flex on the outer chassis when `fill`, so the Display itself
  // claims its parent's available space before propagating down.
  const chassisStyle: CSSProperties | undefined = fill
    ? { flex: 1, ...rest.style }
    : rest.style
  return (
    <div
      {...rest}
      style={chassisStyle}
      className={`display lip chrome-raised ${className}`}
    >
      <span className="chrome-raised-shadow" aria-hidden="true" />
      <span className="chrome-raised-edge" aria-hidden="true" />
      <span className="chrome-raised-front" aria-hidden="true" />
      {header && <div className="display-header">{header}</div>}
      <div
        className={`bezel ${bezelClassName}`}
        style={mergedBezelStyle}
      >
        <div
          className={`screen ${screenClassName}`}
          style={mergedScreenStyle}
        >
          {readout}
          {children}
        </div>
      </div>
      {footer && <div className="display-footer">{footer}</div>}
    </div>
  )
}
