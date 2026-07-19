import { useCallback, useRef, type CSSProperties } from 'react'
import { formatReadout } from './readout'

interface ArcGaugeProps {
  value: number
  /** Value range mapped linearly onto the 270° arc. */
  range: [number, number]
  onChange: (v: number) => void
  /** Dial diameter in px. */
  size?: number
  /** Quantization notch in user units — drag and arrows snap to
   *  multiples of it. Continuous when absent. */
  step?: number
  /** Double-click (and Home) reset to this. No-op when absent. */
  defaultValue?: number
  /** Overrides the built-in readout heuristic. */
  format?: (v: number) => string
  /** Uppercase caption under the arc. */
  label?: string
  className?: string
  style?: CSSProperties
}

/*
 * Same sweep as the Knob (-135°..+135°, gap at the bottom), drawn in a
 * fixed 26-unit viewBox that scales with `size`.
 */
const A0 = -135
const A1 = 135
const VB = 26
const C = VB / 2
const R = 10

const pt = (a: number): [number, number] => [
  C + R * Math.cos(((a - 90) * Math.PI) / 180),
  C + R * Math.sin(((a - 90) * Math.PI) / 180),
]

const arcPath = (a0: number, a1: number) => {
  const [x0, y0] = pt(a0)
  const [x1, y1] = pt(a1)
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${R} ${R} 0 ${
    a1 - a0 > 180 ? 1 : 0
  } 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`
}

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v))

/**
 * A little arc gauge — the Knob's quiet sibling: the same sweep, no
 * cap, a thin fill arc in the secondary (modulation) accent, and a
 * tiny value readout below. For auxiliary quantities that sit beside
 * a main control (e.g. a smoothing time constant).
 *
 * Interaction:
 *   - Vertical drag → set value. 150px = full range; Shift = 0.15×.
 *   - Double-click  → reset to `defaultValue`.
 *   - Keyboard      → ArrowUp/Right increment, ArrowDown/Left
 *                     decrement, Home = `defaultValue`; Shift = finer.
 */
export function ArcGauge({
  value,
  range,
  onChange,
  size = 26,
  step,
  defaultValue,
  format,
  label,
  className = '',
  style,
}: ArcGaugeProps) {
  const [min, max] = range
  const drag = useRef<{ y: number; v: number } | null>(null)

  const set = useCallback(
    (v: number) =>
      onChange(clamp(step ? Math.round(v / step) * step : v, min, max)),
    [onChange, step, min, max],
  )

  const readout = format ? format(value) : formatReadout(value)
  const t = max === min ? 0 : clamp((value - min) / (max - min), 0, 1)
  const aValue = A0 + t * (A1 - A0)

  return (
    <div
      className={`chrome-arcgauge ${className}`}
      style={style}
      tabIndex={0}
      title={label}
      role="slider"
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={readout}
      onPointerDown={(e) => {
        if (e.button !== 0) return
        e.preventDefault()
        ;(e.target as Element).setPointerCapture(e.pointerId)
        drag.current = { y: e.clientY, v: value }
      }}
      onPointerMove={(e) => {
        if (!drag.current) return
        const fine = e.shiftKey ? 0.15 : 1
        set(drag.current.v + ((drag.current.y - e.clientY) / 150) * fine * (max - min))
      }}
      onPointerUp={() => {
        drag.current = null
      }}
      onPointerCancel={() => {
        drag.current = null
      }}
      onDoubleClick={(e) => {
        e.stopPropagation()
        if (defaultValue !== undefined) set(defaultValue)
      }}
      onKeyDown={(e) => {
        const dir =
          e.key === 'ArrowUp' || e.key === 'ArrowRight'
            ? 1
            : e.key === 'ArrowDown' || e.key === 'ArrowLeft'
              ? -1
              : 0
        if (dir !== 0) {
          e.preventDefault()
          const st = step || (max - min) / (e.shiftKey ? 400 : 80)
          set(value + dir * st)
          return
        }
        if (e.key === 'Home' && defaultValue !== undefined) {
          e.preventDefault()
          set(defaultValue)
        }
      }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${VB} ${VB}`}>
        <path className="chrome-arcgauge-track" d={arcPath(A0, A1)} />
        {aValue > A0 + 0.5 && (
          <path className="chrome-arcgauge-fill" d={arcPath(A0, aValue)} />
        )}
      </svg>
      {label && <div className="chrome-arcgauge-label">{label}</div>}
      <div className="chrome-arcgauge-value">{readout}</div>
    </div>
  )
}

export type { ArcGaugeProps }
