/*
 * Knob-backed numeric-slot editor for dials' Panel.
 *
 * Conforms phosphor's Knob to dials' `SliderProps` contract. With no
 * source attached this is value-only mode: the baseline mirrors the
 * value. While a source is attached (`attached` + `live` from the
 * contract), a rAF loop polls the slot's last-sample stash and the
 * knob rides the modulation: `value` = live sample, `baseline` = the
 * dial's own value, so the Knob's built-in mod-accent treatment for
 * `value !== baseline` lights up on its own. Polling reads the stash
 * only — it never samples, so stateful sources are untouched. Drags,
 * wheel, and keys still edit the base dial via `onChange`, exactly as
 * in value-only mode.
 *
 * The modulation envelope needs no observation: the white band inlay
 * is a pure function of `(baseline, depth, mode)`, computed by the
 * Knob itself from the forwarded `depth`/`mode` props. Right-drag on
 * the knob edits the depth via `onDepthChange`.
 *
 * When the bundle hosts the attach picker in the dial
 * (`sliderHostsAttach`), the Panel hands this slider the picker's
 * PROPS (`attachProps`), not a pre-rendered node — the slider renders
 * the configured `AttachControl` itself (via `usePanelComponents`),
 * passing `hosted` open-state so a right-click on the dial face opens
 * the popover. No element surgery, and a custom bundle's AttachControl
 * is honored automatically.
 *
 * `scale: 'log'` passes straight through — the Knob maps drags through
 * log space internally, like phosphor's Slider. `step` is the slot's
 * DECLARED notch only (the Panel passes `meta.step`, undefined for a
 * continuous slot), so it forwards straight to the Knob. `unit` and
 * `format` (from the slot's meta) feed the Knob's own readout.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Knob } from '@ldlework/phosphor'
import { usePanelComponents, type SliderProps } from '@ldlework/dials/react'

/**
 * Knob face diameter in px. Set per bundle via `makeDialPanelComponents`
 * (a host with tighter node UI wants smaller knobs than the 56px
 * default). Not a per-slot prop — it's a bundle-wide look, so it rides
 * a module-level default the factory rebinds.
 */
const DEFAULT_KNOB_SIZE = 56

export interface KnobSliderExtras {
  /** Knob diameter in px (default 56). */
  knobSize?: number
  /**
   * Engrave the slot's label under the knob face (the Knob's own
   * caption), for a compact layout where the Row suppresses its caption
   * strip. Off by default — captioning stays the Row's job.
   */
  showLabel?: boolean
  /**
   * The glide (`slot.glide`) in seconds that reads as a FULL glide bar.
   * The slot's glide is normalized against this to fill the Knob's bar,
   * so the primitive stays unitless while the bundle owns the time
   * scale. Default 2s.
   */
  glideMax?: number
}

const DEFAULT_GLIDE_MAX = 2

/**
 * A `KnobSlider` variant bound to a fixed knob size (and optional
 * self-caption), for the panel bundle's `Slider` slot (which the Panel
 * calls with plain `SliderProps` only). Returns the shared `KnobSlider`
 * reference when nothing is set so the common bundle stays referentially
 * stable.
 */
export function sizedKnobSlider(
  knobSize?: number,
  showLabel?: boolean,
  glideMax?: number,
): (props: SliderProps) => ReactNode {
  if (knobSize === undefined && !showLabel && glideMax === undefined)
    return KnobSlider
  return (props: SliderProps) => (
    <KnobSlider
      {...props}
      {...(knobSize !== undefined ? { knobSize } : {})}
      {...(glideMax !== undefined ? { glideMax } : {})}
      showLabel={!!showLabel}
    />
  )
}

export function KnobSlider({
  value,
  min,
  max,
  step,
  scale,
  onChange,
  attached,
  live,
  depth,
  onDepthChange,
  mode,
  glide,
  onGlide,
  unit,
  format,
  defaultValue,
  attachProps,
  label,
  knobSize = DEFAULT_KNOB_SIZE,
  showLabel = false,
  glideMax = DEFAULT_GLIDE_MAX,
}: SliderProps & KnobSliderExtras): ReactNode {
  const [liveSample, setLiveSample] = useState<number | undefined>(undefined)
  // When the Panel routes the attach control here (sliderHostsAttach),
  // we own the picker's open state so a right-click on the dial can open
  // it. The configured AttachControl renders in-dial (it keys its
  // presentation off `hosted`); the glyph rides in the knob's face via
  // `tab`.
  const [pickerOpen, setPickerOpen] = useState(false)
  const { AttachControl } = usePanelComponents()
  const hostedAttach = attachProps ? (
    <AttachControl
      {...attachProps}
      hosted={{ open: pickerOpen, onOpenChange: setPickerOpen }}
    />
  ) : null

  // Live poll — only while a source is attached. React bails out of
  // re-rendering when the polled value is unchanged, so an unsampled
  // (or static) stash costs one no-op state set per frame.
  //
  // The poll reads `live` through a ref, and the rAF effect is keyed
  // ONLY on `attached` — NOT on `live`'s identity. A host commonly
  // rebuilds the `live` accessor every render (a fresh closure per
  // render is the natural way to write one); keying the effect on it
  // would tear down and restart the rAF loop on every re-render,
  // including re-renders provoked by a SIBLING knob's edit (one knob's
  // op re-renders the whole node). Each restart drops a frame of polling
  // and blips the sample — which reads as unrelated knobs jittering when
  // you touch any one of them. Holding `live` in a ref makes the loop
  // survive those re-renders untouched.
  const liveRef = useRef(live)
  liveRef.current = live
  useEffect(() => {
    if (!attached) {
      setLiveSample(undefined)
      return
    }
    let raf = requestAnimationFrame(function tick() {
      setLiveSample(liveRef.current?.())
      raf = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(raf)
  }, [attached])

  const riding = attached && liveSample !== undefined
  // Glide bar + gesture: the bar is a pure readout of the slot's glide
  // seconds normalized against the bundle's full-bar reference (0 draws
  // nothing). The gesture wires only when the Panel passed `onGlide` —
  // i.e. the slot opted in via `meta.glidable` — so a non-gliding knob
  // keeps shift+right free for the host's port chord. The gesture
  // reports normalized amt; map it back to seconds for the action.
  const glideNorm =
    typeof glide === 'number' && glideMax > 0
      ? Math.min(glide / glideMax, 1)
      : undefined
  const onChangeGlide = onGlide
    ? (amt: number) => onGlide(amt * glideMax)
    : undefined
  return (
    <Knob
      value={riding ? liveSample : value}
      baseline={value}
      range={[min, max]}
      depth={depth}
      mode={mode ?? 'center'}
      glide={glideNorm}
      onChangeGlide={onChangeGlide}
      onChangeDepth={onDepthChange}
      onRightClick={hostedAttach ? () => setPickerOpen(true) : undefined}
      scale={scale ?? 'linear'}
      size={knobSize}
      {...(step !== undefined ? { step } : {})}
      {...(unit !== undefined ? { unit } : {})}
      {...(format !== undefined ? { format } : {})}
      {...(showLabel && typeof label === 'string' ? { label } : {})}
      onChangeBaseline={onChange}
      defaultValue={defaultValue}
      tab={
        hostedAttach ? (
          <span className="pd-knob-attach">{hostedAttach}</span>
        ) : undefined
      }
    />
  )
}
