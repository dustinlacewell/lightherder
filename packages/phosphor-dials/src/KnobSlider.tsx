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
 * `scale: 'log'` passes straight through — the Knob maps drags through
 * log space internally, like phosphor's Slider. `step` is deliberately
 * NOT passed: dials synthesizes `(max - min) / 1000` for slots that
 * declare no step, and the Knob would quantize log ranges in value
 * space and shrink wheel notches to 0.1% — the Knob stays continuous
 * here.
 */

import {
  cloneElement,
  isValidElement,
  useEffect,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react'
import { Knob } from '@ldlework/phosphor'
import type { SliderProps } from '@ldlework/dials/react'

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
}

/**
 * A `KnobSlider` variant bound to a fixed knob size, for the panel
 * bundle's `Slider` slot (which the Panel calls with plain `SliderProps`
 * only). Returns the shared `KnobSlider` reference for the default size
 * so the common bundle stays referentially stable.
 */
export function sizedKnobSlider(
  knobSize?: number,
): (props: SliderProps) => ReactNode {
  if (knobSize === undefined) return KnobSlider
  return (props: SliderProps) => <KnobSlider {...props} knobSize={knobSize} />
}

export function KnobSlider({
  value,
  min,
  max,
  scale,
  onChange,
  attached,
  live,
  depth,
  onDepthChange,
  mode,
  defaultValue,
  attach,
  knobSize = DEFAULT_KNOB_SIZE,
}: SliderProps & KnobSliderExtras): ReactNode {
  const [liveSample, setLiveSample] = useState<number | undefined>(undefined)
  // When the Panel routes the attach control here (sliderHostsAttach),
  // we own the picker's open state so a right-click on the dial can open
  // it. Cloned onto the pre-rendered AttachControl element as controlled
  // open props; the glyph rides in the knob's face via `tab`.
  const [pickerOpen, setPickerOpen] = useState(false)
  const hostedAttach =
    attach && isValidElement(attach)
      ? cloneElement(attach as ReactElement<any>, {
          inDial: true,
          open: pickerOpen,
          onOpenChange: setPickerOpen,
        })
      : null

  // Live poll — only while a source is attached. React bails out of
  // re-rendering when the polled value is unchanged, so an unsampled
  // (or static) stash costs one no-op state set per frame. Cancelled
  // on unmount and on detach (the effect re-runs with attached=false
  // and clears the sample so the knob returns to value-only mode).
  useEffect(() => {
    if (!attached || !live) {
      setLiveSample(undefined)
      return
    }
    let raf = requestAnimationFrame(function tick() {
      setLiveSample(live())
      raf = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(raf)
  }, [attached, live])

  const riding = attached && liveSample !== undefined
  return (
    <Knob
      value={riding ? liveSample : value}
      baseline={value}
      range={[min, max]}
      depth={depth}
      mode={mode ?? 'center'}
      onChangeDepth={onDepthChange}
      onRightClick={hostedAttach ? () => setPickerOpen(true) : undefined}
      scale={scale ?? 'linear'}
      size={knobSize}
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
