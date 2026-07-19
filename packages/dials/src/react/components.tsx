/**
 * Pluggable component contracts for `<Panel/>`.
 *
 * Every UI part the Panel renders — slider, number field, dropdown,
 * help tooltip, row layout, heading, attach control — is defined here
 * as a typed React component slot. Adapter packages (e.g.
 * `@ldlework/phosphor-dials`) supply alternative implementations via
 * the Panel's `components` prop; the defaults shipped below reproduce
 * the historical unstyled markup with `data-dials-*` attributes so
 * zero-config consumers see no visible change.
 *
 * The contracts are *per-UI-part*, not per-data-type. Per-data-type
 * editors (custom widgets for `slot.outType === 'rgb'`, say) still
 * live on the Panel's `editors` prop — orthogonal concern.
 */

import type { ComponentType, ReactNode } from 'react'
import type { ModMode, Slot } from '../core'
import { attachFrom, detach, setMode } from '../attach'
import type { sourcesForType } from '../source'

// ─── Prop shapes ──────────────────────────────────────────────────────

export interface SliderProps {
  value: number
  min: number
  max: number
  step: number
  scale?: 'linear' | 'log'
  onChange: (v: number) => void
  /**
   * True while a source is attached to the slot this slider edits.
   * `value`/`onChange` still work the slot's own dial — the value the
   * slot returns to on detach — but a modulation-aware implementation
   * can restyle itself and display the live output via `live`.
   */
  attached?: boolean
  /**
   * Accessor for the slot's most recent sampled output
   * (`slot.lastSample`) — `undefined` until the host app first samples
   * the slot. Read-only by construction: the accessor never samples,
   * so polling it (e.g. from a rAF loop) cannot advance stateful
   * sources. Implementations that ignore it (like `DefaultSlider`)
   * simply keep editing the dial value.
   */
  live?: () => number | undefined
  /**
   * The slot's modulation half-width in knob-travel space, [0, 1] —
   * slot-level, so it's present regardless of attachment (a slot can
   * be armed ahead of attaching a source). A modulation-aware
   * implementation renders the envelope (`base ± depth` bipolar,
   * `base → base + depth` unipolar) around the dial's own value
   * whenever it's non-zero.
   */
  depth?: number
  /**
   * Gesture hook for editing the attachment's depth (e.g. a
   * right-button drag). Implementations that support the gesture call
   * this with the new travel-space half-width; the Panel writes it
   * onto the attachment.
   */
  onDepthChange?: (d: number) => void
  /**
   * The slot's modulation mode — slot-level, so always present for a
   * numeric slot regardless of attachment. Drives how the editor draws
   * the modulation envelope: `'center'` both ways around the base,
   * `'up'` only above, `'down'` only below.
   */
  mode?: ModMode
  /**
   * The dial's construction-time value (`dial.initial`) — the reset
   * target for editors with a reset gesture (double-click, Home).
   */
  defaultValue?: number
  /**
   * The slot's attach control, pre-rendered by the Panel. A slider
   * implementation may host it *inside* itself (e.g. a knob placing the
   * modulation glyph in its face) instead of leaving the Panel to lay
   * it out in the row. When a slider consumes this, the Panel's Row
   * should suppress its own copy to avoid rendering it twice. Optional
   * and ignored by sliders that don't relocate it (like DefaultSlider).
   */
  attach?: ReactNode
}

export interface NumberFieldProps {
  value: number
  min: number
  max: number
  step: number
  scale?: 'linear' | 'log'
  onChange: (v: number) => void
}

export interface LerpControlProps {
  /** Current smoothing time constant in seconds (0 = off). */
  value: number
  onChange: (seconds: number) => void
}

export interface DropdownOption {
  value: string
  label: string
}

export interface DropdownProps {
  value: string
  options: DropdownOption[]
  onChange: (v: string) => void
}

export interface HelpTooltipProps {
  title: string
  description: string
}

export interface RowProps {
  label: ReactNode
  control: ReactNode
  help?: ReactNode
  attach?: ReactNode
  nested?: ReactNode
  /**
   * The slot's own description (`meta.description`), passed raw so a Row
   * implementation can surface it however it likes — e.g. making the
   * label itself the hover target instead of rendering a separate help
   * affordance. `help` remains the pre-rendered `(?)` node for Rows that
   * prefer the default treatment; a Row uses one or the other.
   */
  description?: string
}

export interface HeadingProps {
  title: string
}

export interface AttachControlProps {
  slot: Slot<unknown>
  candidates: ReturnType<typeof sourcesForType>
  onChange: () => void
}

// ─── The bundle ───────────────────────────────────────────────────────

export interface PanelComponents {
  Slider: ComponentType<SliderProps>
  NumberField: ComponentType<NumberFieldProps>
  LerpControl: ComponentType<LerpControlProps>
  Dropdown: ComponentType<DropdownProps>
  HelpTooltip: ComponentType<HelpTooltipProps>
  Row: ComponentType<RowProps>
  Heading: ComponentType<HeadingProps>
  AttachControl: ComponentType<AttachControlProps>
  /**
   * The bundle's Slider renders its own value readout; Panel omits
   * the separate NumberField in numeric rows.
   */
  sliderShowsValue?: boolean
  /**
   * The bundle's Slider hosts the attach control itself (e.g. inside a
   * knob face). Panel passes the attach node to the Slider via
   * `SliderProps.attach` and its Row omits the standalone attach cell,
   * so the picker renders once, inside the dial. Numeric slots only —
   * non-numeric attached slots still get the standalone control.
   */
  sliderHostsAttach?: boolean
}

// ─── Default implementations ──────────────────────────────────────────
//
// These reproduce the markup the Panel emitted before the components
// system existed. They're intentionally unstyled — consumers wire CSS
// to the `data-dials-*` attributes — and intentionally minimal so an
// adapter has the smallest possible baseline to override.

export function DefaultSlider({
  value, min, max, step, scale, onChange,
}: SliderProps): ReactNode {
  // Log-scaled slider: requires min > 0. Slider position lives in
  // [0, 1]; we map to/from the host range via exp/log.
  const useLog = scale === 'log' && min > 0 && max > min
  if (useLog) {
    const logMin = Math.log(min)
    const logMax = Math.log(max)
    const pos = (Math.log(Math.max(value, min)) - logMin) / (logMax - logMin)
    return (
      <input
        type="range"
        min={0}
        max={1}
        step={1 / 1000}
        value={pos}
        onChange={(e) => {
          const p = Number(e.target.value)
          onChange(Math.exp(logMin + p * (logMax - logMin)))
        }}
      />
    )
  }
  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
    />
  )
}

export function DefaultNumberField({
  value, min, max, step, onChange,
}: NumberFieldProps): ReactNode {
  // The numeric input is always linear — users typing values think in
  // linear units regardless of the slider's scale.
  return (
    <input
      type="number"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
    />
  )
}

/**
 * Default lerp control — a small seconds field for the slot's
 * smoothing time constant (`meta.lerp`). `0` means no smoothing (the
 * dial snaps). Rendered only for slots that opt in by declaring a
 * `lerp` value at construction (see `NumberEditor`).
 */
export function DefaultLerpControl({
  value, onChange,
}: LerpControlProps): ReactNode {
  return (
    <label className="dials-lerp" data-dials-lerp="">
      <span className="dials-lerp-label">lerp (s)</span>
      <input
        type="number"
        min={0}
        step={0.01}
        value={value}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value)))}
      />
    </label>
  )
}

export function DefaultDropdown({
  value, options, onChange,
}: DropdownProps): ReactNode {
  return (
    <select
      className="dials-attach"
      data-dials-attach=""
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

export function DefaultHelpTooltip({
  title, description,
}: HelpTooltipProps): ReactNode {
  return (
    <span
      className="dials-help"
      data-dials-help=""
      aria-label={`About ${title}`}
      tabIndex={0}
    >
      ?
      <span className="dials-help-popover" data-dials-help-popover="" role="tooltip">
        <strong>{title}</strong>
        <span>{description}</span>
      </span>
    </span>
  )
}

export function DefaultRow({
  label, control, help, attach, nested,
}: RowProps): ReactNode {
  return (
    <>
      <div className="dials-slot-header">
        <span className="dials-slot-label">{label}</span>
        {help ?? null}
        {attach ?? null}
      </div>
      {control}
      {nested ?? null}
    </>
  )
}

export function DefaultHeading({ title }: HeadingProps): ReactNode {
  return <div className="dials-panel-title">{title}</div>
}

/**
 * Default attach control — single dropdown that picks the source
 * modulating the slot.
 *
 *   value=""        → no modulation (the dial's own value, unmodified)
 *   value=<name>    → that registered source is attached
 *
 * Selecting a different source while one is attached swaps to a fresh
 * instance (old source state is discarded); the modulation depth and
 * mode live on the slot, so the envelope the user dialed in survives
 * the swap on its own.
 *
 * The mode-cycle button (± / + / −) sits alongside the dropdown and is
 * always present — mode is slot-level state, so the shape can be
 * pre-set before any source is attached.
 *
 * The dropdown itself goes through the configured `Dropdown`
 * component so adapters can restyle without re-implementing the
 * attach/detach logic.
 */
const MODE_GLYPH: Record<ModMode, string> = {
  center: '±',
  up: '+',
  down: '−',
}
const MODE_NEXT: Record<ModMode, ModMode> = {
  center: 'up',
  up: 'down',
  down: 'center',
}

export function DefaultAttachControl({
  slot, candidates, onChange,
}: AttachControlProps): ReactNode {
  // Consume context lazily to avoid an import cycle at module top.
  const { Dropdown } = usePanelComponents()
  if (candidates.length === 0 && !slot.attached) return null
  const current = slot.attached?.def.name ?? ''
  const options: DropdownOption[] = [
    { value: '', label: 'none' },
    ...candidates.map((d) => ({ value: d.name, label: d.name })),
  ]
  const mode = slot.modMode
  return (
    <>
      <Dropdown
        value={current}
        options={options}
        onChange={(name) => {
          if (!name) {
            detach(slot)
          } else if (name !== current) {
            // The depth and mode live on the slot and survive the swap
            // on their own. The new source itself starts from fresh
            // factory defaults.
            detach(slot)
            const def = candidates.find((d) => d.name === name)
            if (def) attachFrom(slot, def)
          }
          onChange()
        }}
      />
      <button
        type="button"
        className="dials-mode"
        data-dials-mode={mode}
        onClick={() => {
          setMode(slot, MODE_NEXT[mode])
          onChange()
        }}
      >
        {MODE_GLYPH[mode]}
      </button>
    </>
  )
}

export const defaultPanelComponents: PanelComponents = {
  Slider: DefaultSlider,
  NumberField: DefaultNumberField,
  LerpControl: DefaultLerpControl,
  Dropdown: DefaultDropdown,
  HelpTooltip: DefaultHelpTooltip,
  Row: DefaultRow,
  Heading: DefaultHeading,
  AttachControl: DefaultAttachControl,
}

// ─── Context plumbing ─────────────────────────────────────────────────
//
// Lives here (not in Panel.tsx) so the default AttachControl can read
// the active `Dropdown` without an import cycle through Panel.

import { createContext, useContext } from 'react'

const PanelComponentsContext = createContext<PanelComponents>(
  defaultPanelComponents,
)

export const PanelComponentsProvider = PanelComponentsContext.Provider

export function usePanelComponents(): PanelComponents {
  return useContext(PanelComponentsContext)
}
