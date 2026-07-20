import {
  useCallback,
  useEffect,
  useId,
  useRef,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { formatReadout } from './readout'

interface KnobProps {
  /** Live resolved value — drives the fill arc and pointer. */
  value: number
  /** User-set anchor value — the thing drags, wheel, and keys edit. */
  baseline: number
  /** Value range mapped onto the 270° arc. */
  range: [number, number]
  /**
   * Modulation half-width in knob-travel (position) space, [0, 1].
   * When present and > 0, a white inlay arc is drawn at the track
   * radius — under the lit fill — showing the modulation envelope
   * around the baseline, its shape decided by `mode`: `baseline ±
   * depth` centered, `baseline → baseline + depth` up, `baseline −
   * depth → baseline` down. Ends clamp to the arc.
   */
  depth?: number | undefined
  /**
   * How the modulation envelope sits around the baseline — `'center'`
   * (the default) extends both ways, `'up'` only above, `'down'` only
   * below.
   */
  mode?: 'center' | 'up' | 'down'
  /**
   * Glide amount, normalized to [0, 1] — a static readout of the slot's
   * glide (smoothing) setting. When > 0, a thin bar sits in the arc's
   * bottom gap, filling left→right in proportion. The primitive is
   * unitless: the host maps its own glide seconds (against whatever max
   * it considers "full glide") into this 0..1. Absent/0 draws nothing.
   */
  glide?: number | undefined
  /**
   * SHIFT + right-button vertical drag edits the glide, reported here
   * in the same normalized [0, 1] as `glide` (same 150px-for-full /
   * Shift-already-held convention, so no extra fine mode). The gesture is
   * active only when this handler is provided. A shift+right press that
   * does NOT cross the drag threshold is left to bubble as a contextmenu
   * so a host chord (e.g. a port toggle) still fires on shift+right-CLICK.
   */
  onChangeGlide?: ((amt: number) => void) | undefined
  /**
   * Right-button vertical drag edits the modulation depth (same
   * 150px-for-full-travel / Shift = 0.15× fine convention as the value
   * drag), reported here clamped into [0, 1]. The gesture is active
   * only when this handler is provided.
   */
  onChangeDepth?: ((d: number) => void) | undefined
  /**
   * Right-button *tap* — a press and release without crossing the
   * depth-drag movement threshold. Lets a right-click open an
   * associated control (e.g. the modulation picker) while a right-drag
   * still edits depth. Fired on pointer-up only when the pointer barely
   * moved; a drag suppresses it.
   */
  onRightClick?: (() => void) | undefined
  /**
   * Mapping between arc position and value. `linear` is direct; `log`
   * requires `range[0] > 0` and maps arc position [0,1] to
   * value = exp(logMin + p * (logMax - logMin)) — drags and wheel
   * nudges then move through log space, like phosphor's Slider. When
   * the range is not strictly positive, silently falls back to linear.
   */
  scale?: 'linear' | 'log'
  onChangeBaseline: (v: number) => void
  /** Double-click (and Home) reset the baseline to this. No-op when absent. */
  defaultValue?: number | undefined
  /** Quantization notch in user units — drags, wheel, and arrows snap
   *  to multiples of it. Continuous when absent. */
  step?: number
  /** Overrides the built-in readout heuristic. Receives the raw value;
   *  `unit`/`displayScale` apply to the built-in readout only. */
  format?: (v: number) => string
  /** Dial diameter in px. */
  size?: number
  /** Uppercase caption under the dial. */
  label?: string
  /** Unit suffix appended to the built-in readout. */
  unit?: string
  /** Multiplier applied only to the displayed value (e.g. 1000 for milli). */
  displayScale?: number
  /** Optional slot rendered absolutely inside the dial (e.g. a mode button). */
  tab?: ReactNode
  className?: string
  style?: CSSProperties
}

/*
 * Arc geometry — herder's convention: angles in degrees, 0 = 12
 * o'clock, positive clockwise. The dial sweeps -135°..+135° with the
 * gap at the bottom. All drawing happens in a fixed 48-unit viewBox
 * that scales with `size`, so the design holds at 26 as well as 72.
 */
const A0 = -135
const A1 = 135
const VB = 48
const C = VB / 2
const TRACK_R = 19 // track + band inlay + fill arc
const CAP_R = 13.5 // machined cap
const PTR_IN = 8.5 // pointer line, inner…
const PTR_OUT = 11.5 // …to outer

const pt = (r: number, a: number): [number, number] => [
  C + r * Math.cos(((a - 90) * Math.PI) / 180),
  C + r * Math.sin(((a - 90) * Math.PI) / 180),
]

const arcPath = (r: number, a0: number, a1: number) => {
  const [x0, y0] = pt(r, a0)
  const [x1, y1] = pt(r, a1)
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${
    a1 - a0 > 180 ? 1 : 0
  } 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`
}

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v))

/**
 * Round rotary dial over a 270° arc, herder-style: a dim unlit track,
 * a lit fill arc from the start angle to the current value, and a
 * small machined chrome cap with a radial pointer line. Label and a
 * lit value readout stack underneath.
 *
 * Visual layers:
 *   1. Track      — the unlit ring (`--theme-lit-dim`). Always.
 *   2. Fill arc   — brand-lit arc from start to `baseline`, the
 *                   user-set value.
 *   3. Band inlay — a white arc, wider than the track, showing the
 *                   modulation envelope (`baseline ± depth` centered,
 *                   `baseline → baseline + depth` up, `baseline −
 *                   depth → baseline` down) — drawn over the fill so
 *                   it reads on both sides of the set point. Only when
 *                   `depth` is present and > 0.
 *   4. Offset arc — modulation-accent arc from `baseline` to the live
 *                   `value` while they differ — thinner than the
 *                   track, riding inside the white envelope.
 *   5. Cap + pointer — chrome cap circle, pointer at the value angle.
 *
 * Interaction:
 *   - Left-drag    → set `baseline`, sliding the modulation envelope
 *                    with it. Vertical, 150px = full range;
 *                    Shift = 0.15× fine.
 *   - Right-drag   → set modulation `depth` (same 150px / 0.15× fine
 *                    convention), when `onChangeDepth` is provided.
 *   - Wheel        → nudge baseline (by `step` when set, else a fixed
 *                    position notch; Shift = finer). Native non-passive
 *                    listener so preventDefault suppresses page scroll.
 *   - Double-click → reset baseline to `defaultValue`.
 *   - Keyboard     → ArrowUp/Right increment, ArrowDown/Left
 *                    decrement, Home = `defaultValue`; Shift = finer.
 */
export function Knob({
  value,
  baseline,
  range,
  depth,
  mode = 'center',
  glide,
  onChangeGlide,
  onChangeDepth,
  onRightClick,
  scale = 'linear',
  onChangeBaseline,
  defaultValue,
  step,
  format,
  size = 72,
  label,
  unit,
  displayScale = 1,
  tab,
  className = '',
  style,
}: KnobProps) {
  const [min, max] = range
  const rootRef = useRef<HTMLDivElement>(null)
  const capGradient = useId()
  // `moved` gates the baseline write: a plain click (press + release
  // without crossing the threshold) must NOT write — otherwise a click
  // on a modulated knob snaps the base to wherever the drag anchor sits
  // and the notch flickers. The write starts only once the pointer has
  // actually moved.
  const drag = useRef<{ y: number; v: number; moved: boolean } | null>(null)
  // Right-button depth drag — separate state so value- and
  // depth-drags never interfere. `moved` tracks whether the pointer
  // crossed the tap threshold: a right-release that never moved is a
  // right-click (opens the associated control) rather than a depth edit.
  const depthDrag = useRef<{ y: number; d: number; moved: boolean } | null>(
    null,
  )
  // SHIFT + right-button glide (lerp) drag — its own state so it never
  // interferes with value- or depth-drags. `moved` gates the same
  // drag-vs-tap split depth uses: a shift+right press that never crosses
  // the threshold is a click, left to bubble to the host's contextmenu.
  const glideDrag = useRef<{ y: number; l: number; moved: boolean } | null>(
    null,
  )
  // A committed lerp drag (shift+right, moved) must swallow the
  // contextmenu that fires around pointer-up, or the host's shift+right
  // chord (port toggle) would also fire. Set on release, read+cleared by
  // onContextMenu. A tap leaves it false, so the chord still runs.
  const glideDragCommitted = useRef(false)

  const useLog = scale === 'log' && min > 0 && max > min

  // Position [0,1] ↔ value mapping. All drag/wheel math runs in
  // position space, so log ranges get log-shaped drags for free and
  // consumers always see values in user units.
  const toPos = useCallback(
    (v: number) => {
      if (max === min) return 0
      if (useLog) {
        const logMin = Math.log(min)
        const logMax = Math.log(max)
        return (Math.log(clamp(v, min, max)) - logMin) / (logMax - logMin)
      }
      return (v - min) / (max - min)
    },
    [min, max, useLog],
  )
  const fromPos = useCallback(
    (p: number) => {
      const f = clamp(p, 0, 1)
      if (useLog) {
        const logMin = Math.log(min)
        const logMax = Math.log(max)
        return Math.exp(logMin + f * (logMax - logMin))
      }
      return min + f * (max - min)
    },
    [min, max, useLog],
  )

  // Quantize to `step` (herder's clampStep) and clamp to range.
  const quantize = useCallback(
    (v: number) => clamp(step ? Math.round(v / step) * step : v, min, max),
    [step, min, max],
  )
  const setBaseline = useCallback(
    (v: number) => onChangeBaseline(quantize(v)),
    [onChangeBaseline, quantize],
  )

  const onDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button === 2) {
        // SHIFT + right, with a glide handler wired, ARMS a lerp drag —
        // but only a drag past the threshold commits. Capture the pointer
        // to track movement. preventDefault kills the browser's focus ring
        // (it does NOT suppress the later contextmenu — that fires on
        // mouse-up independently), so a press that never moves still emits
        // a contextmenu for the host's shift+right-CLICK chord (e.g. a
        // port toggle). onMove decides drag vs tap; onUp tears down.
        if (
          e.shiftKey &&
          !e.ctrlKey &&
          !e.altKey &&
          !e.metaKey &&
          onChangeGlide
        ) {
          e.preventDefault()
          ;(e.target as Element).setPointerCapture(e.pointerId)
          glideDrag.current = { y: e.clientY, l: glide ?? 0, moved: false }
          return
        }
        // Any OTHER modified right-click (ctrl/alt/meta, or shift with no
        // glide handler) belongs to the host — bail and let the
        // contextmenu bubble to its onContextMenu. preventDefault (but
        // NOT capture) so the browser doesn't focus the knob and paint
        // its focus ring on what is really the host's gesture.
        if (e.ctrlKey || e.shiftKey || e.altKey || e.metaKey) {
          e.preventDefault()
          return
        }
        // Right button — a depth drag, or a tap that opens the
        // associated control. Active when either gesture is wired.
        // (The context menu is suppressed via onContextMenu regardless.)
        if (!onChangeDepth && !onRightClick) return
        e.preventDefault()
        ;(e.target as Element).setPointerCapture(e.pointerId)
        depthDrag.current = { y: e.clientY, d: depth ?? 0, moved: false }
        return
      }
      if (e.button !== 0) return
      e.preventDefault()
      ;(e.target as Element).setPointerCapture(e.pointerId)
      drag.current = { y: e.clientY, v: toPos(baseline), moved: false }
    },
    [baseline, toPos, depth, glide, onChangeDepth, onChangeGlide, onRightClick],
  )

  const onMove = useCallback(
    (e: React.PointerEvent) => {
      if (glideDrag.current) {
        const dy = glideDrag.current.y - e.clientY
        // Past a few px this is a drag — commit it; a shorter press stays
        // a tap and bubbles as a contextmenu (host chord) untouched.
        if (Math.abs(dy) > 3) glideDrag.current.moved = true
        const next = clamp(glideDrag.current.l + dy / 150, 0, 1)
        onChangeGlide?.(next)
        return
      }
      if (depthDrag.current) {
        const dy = depthDrag.current.y - e.clientY
        // Past a few px this is a drag, not a tap — suppresses the
        // right-click and (when wired) edits depth.
        if (Math.abs(dy) > 3) depthDrag.current.moved = true
        const fine = e.shiftKey ? 0.15 : 1
        const next = clamp(depthDrag.current.d + (dy / 150) * fine, 0, 1)
        onChangeDepth?.(next)
        return
      }
      if (!drag.current) return
      const dy = drag.current.y - e.clientY
      // Below the threshold this is still a click, not a drag — don't
      // write, so a plain click never nudges the base or flickers the notch.
      if (!drag.current.moved && Math.abs(dy) <= 3) return
      drag.current.moved = true
      const fine = e.shiftKey ? 0.15 : 1
      const next = drag.current.v + (dy / 150) * fine
      setBaseline(fromPos(next))
    },
    [setBaseline, fromPos, onChangeDepth, onChangeGlide],
  )

  const onUp = useCallback(
    (e: React.PointerEvent) => {
      // A right-release that never crossed the drag threshold is a tap
      // — open the associated control instead of leaving a depth edit.
      if (depthDrag.current && !depthDrag.current.moved) onRightClick?.()
      if (glideDrag.current?.moved) glideDragCommitted.current = true
      drag.current = null
      depthDrag.current = null
      glideDrag.current = null
      try {
        ;(e.target as Element).releasePointerCapture(e.pointerId)
      } catch {
        /* already released */
      }
    },
    [onRightClick],
  )

  // Wheel: nudge baseline — by `step` notches when set, else a fixed
  // position notch (Shift = finer). Native non-passive listener so
  // preventDefault actually suppresses page scroll/zoom.
  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const dir = -Math.sign(e.deltaY)
      if (step) {
        setBaseline(baseline + dir * step)
      } else {
        const notch = e.shiftKey ? 0.005 : 0.02
        setBaseline(fromPos(toPos(baseline) + dir * notch))
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [baseline, step, toPos, fromPos, setBaseline])

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const dir =
        e.key === 'ArrowUp' || e.key === 'ArrowRight'
          ? 1
          : e.key === 'ArrowDown' || e.key === 'ArrowLeft'
            ? -1
            : 0
      if (dir !== 0) {
        e.preventDefault()
        if (step) {
          // An explicit notch wins outright, like herder.
          setBaseline(baseline + dir * step)
        } else {
          // Continuous: move through position space so log ranges get
          // ratio-shaped steps. 1/80 of the arc; 1/400 with Shift.
          const d = dir / (e.shiftKey ? 400 : 80)
          setBaseline(fromPos(toPos(baseline) + d))
        }
        return
      }
      if (e.key === 'Home' && defaultValue !== undefined) {
        e.preventDefault()
        setBaseline(defaultValue)
      }
    },
    [baseline, step, defaultValue, setBaseline, toPos, fromPos],
  )

  const readout = format ? format(value) : formatReadout(value * displayScale, unit)

  // The pointer follows the live value; the fill arc runs start →
  // baseline (the user's setting), and while the live value wanders
  // off the baseline a separate accent arc spans baseline → value,
  // showing the offset rather than repainting the whole fill.
  const fValue = clamp(toPos(value), 0, 1)
  const aValue = A0 + fValue * (A1 - A0)
  const rad = ((aValue - 90) * Math.PI) / 180
  const isLive = value !== baseline

  // Band inlay: the modulation envelope, derived in position space
  // from the baseline and depth. `mode` picks the direction(s):
  // `'center'` swings both ways around the baseline, `'up'` extends
  // only above it, `'down'` only below. Ends clamp to the arc.
  const pb = clamp(toPos(baseline), 0, 1)
  const aBase = A0 + pb * (A1 - A0)
  const radBase = ((aBase - 90) * Math.PI) / 180
  const bandLo =
    depth !== undefined && (mode === 'center' || mode === 'down')
      ? clamp(pb - depth, 0, 1)
      : pb
  const bandHi =
    depth !== undefined && (mode === 'center' || mode === 'up')
      ? clamp(pb + depth, 0, 1)
      : pb
  const showBand = depth !== undefined && depth > 0 && bandHi > bandLo

  // Glide bar: a thin readout of the glide amount, sitting in the arc's
  // bottom gap — NOT spanning the two track ends, but a shorter rail
  // resting comfortably between them and a touch lower. The lit fill
  // grows left→right by the normalized glide. Pure readout.
  const glideAmt = typeof glide === 'number' ? clamp(glide, 0, 1) : 0
  const barHalf = 6 // half-width of the rail, in viewBox units
  const barX0 = C - barHalf
  const barX1 = C + barHalf
  const barY = C + 16.5 // below the arc endpoints, seated in the gap
  const showGlide = glideAmt > 0

  return (
    <div
      ref={rootRef}
      className={`chrome-knob ${className}`}
      style={style}
      data-live={isLive ? 'true' : undefined}
      tabIndex={0}
      title={label}
      role="slider"
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={readout}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onDoubleClick={(e) => {
        e.stopPropagation()
        if (defaultValue !== undefined) setBaseline(defaultValue)
      }}
      onContextMenu={(e) => {
        e.preventDefault()
        // A committed lerp drag owns this gesture — stop it reaching the
        // host's shift+right chord. A tap (flag false) lets it through.
        if (glideDragCommitted.current) {
          glideDragCommitted.current = false
          e.stopPropagation()
        }
      }}
      onKeyDown={onKeyDown}
    >
      <div className="chrome-knob-dial" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${VB} ${VB}`}>
          <defs>
            {/* Machined-cap sheen: light grazing the top of the metal. */}
            <radialGradient id={capGradient} cx="50%" cy="36%" r="72%">
              <stop offset="0%" stopColor="var(--chrome-slate-light)" />
              <stop offset="100%" stopColor="var(--chrome-slate-dark)" />
            </radialGradient>
          </defs>
          {/* 1. track — the unlit ring */}
          <path className="chrome-knob-track" d={arcPath(TRACK_R, A0, A1)} />
          {/* 2. lit fill arc, start → baseline (the user-set value) */}
          {aBase > A0 + 0.5 && (
            <path className="chrome-knob-fill" d={arcPath(TRACK_R, A0, aBase)} />
          )}
          {/* 3. band inlay — the white envelope, over the fill so it
                 reads on both sides of the set point */}
          {showBand && (
            <path
              className="chrome-knob-band"
              d={arcPath(
                TRACK_R,
                A0 + bandLo * (A1 - A0),
                A0 + bandHi * (A1 - A0),
              )}
            />
          )}
          {/* 4. offset arc, baseline → live value — the modulation's
                 current excursion, thinner than the band so the white
                 stays visible around it */}
          {isLive && Math.abs(aValue - aBase) > 0.5 && (
            <path
              className="chrome-knob-offset"
              d={arcPath(
                TRACK_R,
                Math.min(aBase, aValue),
                Math.max(aBase, aValue),
              )}
            />
          )}
          {/* glide bar — glide readout across the bottom gap: a dim rail
              end-to-end with a lit fill growing left→right. Drawn under
              the cap so the chrome sits over its inner ends. */}
          {showGlide && (
            <>
              <line
                className="chrome-knob-glide-rail"
                x1={barX0}
                y1={barY}
                x2={barX1}
                y2={barY}
              />
              <line
                className="chrome-knob-glide-fill"
                x1={barX0}
                y1={barY}
                x2={barX0 + (barX1 - barX0) * glideAmt}
                y2={barY}
              />
            </>
          )}
          {/* 5. cap + pointer(s) */}
          <circle
            className="chrome-knob-cap"
            cx={C}
            cy={C}
            r={CAP_R}
            fill={`url(#${capGradient})`}
          />
          {/* base pointer — where the user's knob is set. Shown alongside
              the live pointer while modulated so both notches read at
              once: the base you're setting, and the value riding on top.
              Drawn first (under the live pointer). */}
          {isLive && (
            <line
              className="chrome-knob-pointer chrome-knob-pointer-base"
              x1={C + PTR_IN * Math.cos(radBase)}
              y1={C + PTR_IN * Math.sin(radBase)}
              x2={C + PTR_OUT * Math.cos(radBase)}
              y2={C + PTR_OUT * Math.sin(radBase)}
            />
          )}
          {/* live pointer — the modulated value (or just the base when
              nothing rides) */}
          <line
            className="chrome-knob-pointer"
            x1={C + PTR_IN * Math.cos(rad)}
            y1={C + PTR_IN * Math.sin(rad)}
            x2={C + PTR_OUT * Math.cos(rad)}
            y2={C + PTR_OUT * Math.sin(rad)}
          />
        </svg>
        {tab}
      </div>
      {label && <div className="chrome-knob-label">{label}</div>}
      <div className="chrome-knob-value">{readout}</div>
    </div>
  )
}

export type { KnobProps }
