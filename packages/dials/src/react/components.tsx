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

import { createContext, useContext, type ComponentType, type ReactNode } from 'react'
import type { ModMode, Slot } from '../core'
import { attachFrom, detach, setDepth, setMode } from '../attach'
import { setDial, setGlide } from '../dial'
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
   * The slot's glide time constant (`slot.glide`, in seconds) — the
   * slew applied to the combined output. Passed raw so a slider that
   * shows a glide readout (e.g. a bar under the knob) can render it;
   * the slider owns the mapping from seconds to its own display scale.
   */
  glide?: number
  /**
   * Set the glide (`slot.glide`) in seconds — the write side of
   * `glide`. A slider with a glide gesture (e.g. shift+right-drag on a
   * knob) calls this; the seconds↔display mapping is the slider's own.
   * The Panel routes it to `actions.setGlide`, and passes it only when
   * the slot opts in (`meta.glidable`) — absent means no gesture, no
   * editor.
   */
  onGlide?: (seconds: number) => void
  /** Unit suffix for the slider's own readout (`meta.unit`). */
  unit?: string
  /** Readout formatter (`meta.format`) — overrides the slider's built-in. */
  format?: (v: number) => string
  /**
   * The dial's construction-time value (`dial.initial`) — the reset
   * target for editors with a reset gesture (double-click, Home).
   */
  defaultValue?: number
  /**
   * Props for the slot's attach control, present when the bundle
   * declares `sliderHostsAttach` — the slider renders the configured
   * `AttachControl` itself (e.g. a knob placing the modulation glyph in
   * its face, via `usePanelComponents()`), supplying `hosted` so it
   * owns the popover's open state. The Panel's Row suppresses its own
   * copy, so the picker renders exactly once. Ignored by sliders that
   * don't host it (like DefaultSlider).
   */
  attachProps?: AttachControlProps
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
  /**
   * Whether the nested sub-panel is folded away. CONTROLLED: the state
   * lives on the slot (`slot.folded`, owned by `SlotRow`), not in the Row
   * — so folds survive remounts and are observable by the host (e.g. for
   * sizing a node to its visible modulation tree). Only meaningful when
   * `nested` is present.
   */
  folded?: boolean
  /**
   * Fold toggle callback. `next` is the desired folded state; `all`
   * (a shift-click) applies it to the entire subtree below this row.
   * Rows without a fold affordance ignore it.
   */
  onFold?: (next: boolean, all: boolean) => void
}

export interface HeadingProps {
  title: string
}

/**
 * The attach picker's contract — deliberately a PURE VIEW: current
 * selection, mode, candidates in; pre-bound callbacks out. No live
 * `Slot` crosses this seam, so an AttachControl implementation *cannot*
 * mutate the tree directly — every write goes through the callbacks,
 * which the Panel's SlotRow binds to `SlotActions`. That makes a host's
 * mediation (an op pipeline, a collab gate) enforceable by
 * construction, not convention.
 */
export interface AttachControlProps {
  /** Stable path to the attach target's slot (see SliderProps.path). */
  path?: string[]
  /** Name of the attached source, or `null` when nothing is attached. */
  current: string | null
  /** The slot's modulation mode (slot-level; present regardless of attachment). */
  mode: ModMode
  /** Registered sources matching the slot's type — the picker's options. */
  candidates: ReturnType<typeof sourcesForType>
  /** Pick a source by name; `null` detaches. Pre-bound to the actions. */
  onPick: (name: string | null) => void
  /** Set the modulation mode. Pre-bound to the actions. */
  onMode: (mode: ModMode) => void
  /**
   * Present when the bundle's Slider hosts this control inside itself
   * (`sliderHostsAttach`): the slider owns the popover's open state so
   * its own gestures (e.g. right-click on the knob face) can open it.
   * Implementations render their in-place presentation when this is
   * set, and their standalone trigger when it isn't.
   */
  hosted?: { open: boolean; onOpenChange: (open: boolean) => void }
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
  /**
   * Set the glide time constant `slot.glide`, in seconds. Driven by
   * the slider's glide gesture (shift+right-drag on the knob) or the
   * default bundle's glide field.
   */
  setGlide(path: string[], slot: Slot<unknown>, seconds: number): void
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
  setGlide: (_path, slot, seconds) => setGlide(slot, seconds),
}

/**
 * Per-slot chrome — an optional wrapper the Panel puts around each
 * row's control. A host renders app adornments here (indicator dots,
 * a context-menu policy, a MIDI-learn registration) around whatever
 * editor the bundle draws, WITHOUT forking the editor and without dials
 * knowing anything about those app concerns. `children` is the row's
 * control; return it wrapped.
 *
 * Contract policy on raw slots: chrome (here) and custom `SlotEditor`s
 * receive the live `Slot` — both are HOST-authored code, and the host
 * owns its model. Adapter-facing contracts (`SliderProps`,
 * `AttachControlProps`) deliberately do not: adapters get narrow data +
 * callbacks so they can't bypass the host's `SlotActions` mediation.
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
  attached, depth, onDepthChange, glide, onGlide,
}: SliderProps): ReactNode {
  // Log-scaled slider: requires min > 0. Slider position lives in
  // [0, 1]; we map to/from the host range via exp/log.
  const useLog = scale === 'log' && min > 0 && max > min
  let range: ReactNode
  if (useLog) {
    const logMin = Math.log(min)
    const logMax = Math.log(max)
    const pos = (Math.log(Math.max(value, min)) - logMin) / (logMax - logMin)
    range = (
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
  } else {
    range = (
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
  // The default bundle exposes EVERY model property, however plainly:
  // the modulation depth while a source is attached (the envelope it
  // scales), and the glide when the slot opts in (onGlide present ⇔
  // meta.glidable). Adapters replace these with gestures (right-drag,
  // shift+right-drag on a knob); the zero-config panel stays complete.
  const depthField =
    attached && onDepthChange ? (
      <label className="dials-depth" data-dials-depth="">
        depth
        <input
          type="number"
          min={0}
          max={1}
          step={0.01}
          value={depth ?? 0}
          onChange={(e) => onDepthChange(Number(e.target.value))}
        />
      </label>
    ) : null
  const glideField = onGlide ? (
    <label className="dials-glide" data-dials-glide="">
      glide
      <input
        type="number"
        min={0}
        step={0.1}
        value={glide ?? 0}
        onChange={(e) => onGlide(Number(e.target.value))}
      />
      s
    </label>
  ) : null
  if (!depthField && !glideField) return range
  return (
    <>
      {range}
      {depthField}
      {glideField}
    </>
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
  current, mode, candidates, onPick, onMode,
}: AttachControlProps): ReactNode {
  const { Dropdown } = usePanelComponents()
  if (candidates.length === 0 && !current) return null
  const options: DropdownOption[] = [
    { value: '', label: 'none' },
    ...candidates.map((d) => ({ value: d.name, label: d.name })),
  ]
  return (
    <>
      <Dropdown
        value={current ?? ''}
        options={options}
        onChange={(name) => onPick(name || null)}
      />
      <button
        type="button"
        className="dials-mode"
        data-dials-mode={mode}
        onClick={() => onMode(MODE_NEXT[mode])}
      >
        {MODE_GLYPH[mode]}
      </button>
    </>
  )
}

export const defaultPanelComponents: PanelComponents = {
  Slider: DefaultSlider,
  NumberField: DefaultNumberField,
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
