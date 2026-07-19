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
import { attachFrom, detach, setDepth, setMode } from '../attach'
import { setDial } from '../dial'
import { sourcesForType } from '../source'

// ─── Prop shapes ──────────────────────────────────────────────────────

export interface SliderProps {
  /**
   * Stable path to this slot from the Panel root: the root slot key,
   * then one key per attached-source param descended into (e.g.
   * `['zoom', 'freq']`). Present when the Panel is given a path-aware
   * walk; a consumer keys MIDI targets, live channels, or ops off it.
   * Ignored by implementations that don't need identity.
   */
  path?: string[]
  value: number
  min: number
  max: number
  /**
   * The slot's quantization notch (`meta.step`), in user units — present
   * only for a DISCRETE slot. Absent for a continuous one: each slider
   * owns its own fine-grained fallback (a knob stays continuous, a linear
   * slider uses `(max - min) / 1000`), so a real declared step is never
   * confused with a synthesized default. A discrete slot snaps to this
   * everywhere — drag, wheel, keys.
   */
  step?: number
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
  /**
   * The slot's display label (`meta.label ?? key`), passed so a slider
   * that draws its own caption (e.g. a knob with the name engraved under
   * its face) can render it in place — a compact layout where the Row's
   * own caption strip is suppressed. Optional and ignored by sliders
   * that leave captioning to the Row (like DefaultSlider).
   */
  label?: ReactNode
}

export interface NumberFieldProps {
  value: number
  min: number
  max: number
  /** The slot's quantization notch (`meta.step`) — present only for a
      discrete slot; absent (continuous) lets the field step freely. */
  step?: number
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
  /** Stable path to this row's slot from the Panel root (see SliderProps.path). */
  path?: string[]
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
  /** Stable path to the attach target's slot (see SliderProps.path). */
  path?: string[]
  slot: Slot<unknown>
  candidates: ReturnType<typeof sourcesForType>
  onChange: () => void
}

// ─── Mediated mutation (SlotActions) ──────────────────────────────────
//
// Every mutation the Panel or an AttachControl performs on a slot —
// value edit, attach/detach, depth, mode, lerp — routes through this
// contract. The default implementation calls dials' own in-place
// mutators directly, so zero-config consumers are unchanged. A host
// that owns a mediation layer (an op/dispatch pipeline, a collab gate)
// supplies its own `actions`: it translates `(path, slot)` into its own
// write and performs NO direct mutation — the mediator does, and the
// same live slot tree is reached on every client.

export interface SlotActions {
  /** Edit the slot's own dial value (the base the slot returns to on detach). */
  setValue(path: string[], slot: Slot<unknown>, v: unknown): void
  /** Attach a source by name, or detach when `sourceName` is null. */
  attach(path: string[], slot: Slot<unknown>, sourceName: string | null): void
  /** Set the modulation half-width (travel space, [0, 1]). */
  setDepth(path: string[], slot: Slot<unknown>, depth: number): void
  /** Set the modulation mode. */
  setMode(path: string[], slot: Slot<unknown>, mode: ModMode): void
  /** Set the smoothing time constant `meta.lerp`, in seconds. */
  setLerp(path: string[], slot: Slot<unknown>, seconds: number): void
}

/**
 * Default actions — direct in-place mutation, the historical behavior.
 * `attach` resolves the source name against the slot's candidate set,
 * mirroring `DefaultAttachControl`'s swap semantics (detach first, then
 * attach a fresh instance; depth and mode survive on the slot).
 */
export const defaultSlotActions: SlotActions = {
  setValue: (_path, slot, v) => setDial(slot, v),
  attach: (_path, slot, sourceName) => {
    if (!sourceName) {
      detach(slot)
      return
    }
    const current = slot.attached?.def.name ?? ''
    if (sourceName === current) return
    detach(slot)
    const def = sourcesForType(slot.outType).find((d) => d.name === sourceName)
    if (def) attachFrom(slot, def)
  },
  setDepth: (_path, slot, depth) => setDepth(slot, depth),
  setMode: (_path, slot, mode) => setMode(slot, mode),
  setLerp: (_path, slot, seconds) => {
    slot.dial.meta.lerp = seconds
  },
}

/**
 * Per-slot chrome — an optional wrapper the Panel puts around each
 * row's control. A host renders app adornments here (indicator dots,
 * a context-menu policy, a MIDI-learn registration) around whatever
 * editor the bundle draws, WITHOUT forking the editor and without dials
 * knowing anything about those app concerns. `children` is the row's
 * control; return it wrapped.
 */
export interface SlotChromeProps {
  path: string[]
  slot: Slot<unknown>
  children: ReactNode
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
   * Optional per-slot wrapper around each row's control. When supplied,
   * the Panel wraps every numeric editor in it, passing the slot's path
   * and slot. A host uses it to hang app adornments (indicator dots, a
   * context menu, a live registration) around the editor without
   * forking it. Omitted → controls render bare.
   */
  SlotChrome?: ComponentType<SlotChromeProps>
  /**
   * Optional container the Panel wraps its rows in — the title bar plus
   * the row stack. Defaults to a plain `dials-panel` div. A consumer
   * that wants a different arrangement (a horizontal strip, say)
   * supplies its own Frame, or bypasses Panel entirely and composes
   * exported `SlotRow`s.
   */
  Frame?: ComponentType<{ title?: string; children: ReactNode }>
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
      // A discrete slot snaps to its declared step; a continuous one gets
      // a fine linear notch (a bare range input would default step to 1).
      step={step ?? (max - min) / 1000}
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
      // Discrete slot → its notch; continuous → a fine spinner step (a
      // bare number input's spinner would otherwise default to 1).
      step={step ?? (max - min) / 1000}
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
  path = [], slot, candidates, onChange,
}: AttachControlProps): ReactNode {
  // Consume context lazily to avoid an import cycle at module top.
  const { Dropdown } = usePanelComponents()
  const actions = useSlotActions()
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
          // Depth and mode live on the slot and survive a swap on their
          // own. `attach` handles null (detach), same-name (no-op), and
          // swap-to-fresh; the mediator (or the default) performs it.
          actions.attach(path, slot, name || null)
          onChange()
        }}
      />
      <button
        type="button"
        className="dials-mode"
        data-dials-mode={mode}
        onClick={() => {
          actions.setMode(path, slot, MODE_NEXT[mode])
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

// Slot-mutation mediation, provided separately from the components so a
// host can override the write path without touching the visual bundle.
// Defaults to direct in-place mutation (the historical behavior).
const SlotActionsContext = createContext<SlotActions>(defaultSlotActions)

export const SlotActionsProvider = SlotActionsContext.Provider

export function useSlotActions(): SlotActions {
  return useContext(SlotActionsContext)
}
