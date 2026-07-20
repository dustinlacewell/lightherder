/**
 * Recursive panel — walks a surface (or any slot) and renders one
 * row per slot. Numeric slots get a slider + number field; non-numeric
 * slots fall back to read-only display unless the caller supplies a
 * custom editor via `editors`.
 *
 * Every slot row carries an "attach modulator…" affordance whose
 * picker is populated from `sourcesForType(slot.outType)`. Attaching
 * causes the slot to expand into a nested sub-panel for the source's
 * own params — themselves modulatable, recursively, no depth limit.
 * Numeric slots keep their editor while attached: the slider shows
 * the live modulated output (via the slot's `lastSample` stash) while
 * still editing the slot's own dial.
 *
 * The Panel renders no concrete UI markup itself. Every visual piece
 * — slider, number input, dropdown, row layout, help icon, heading —
 * is supplied by a `PanelComponents` bundle. Defaults reproduce the
 * historical unstyled `data-dials-*` markup; pass `components` to
 * override individual parts (used by `@ldlework/phosphor-dials`).
 */

import { useCallback, useReducer, type ReactNode } from 'react'
import type { Dials, Slot } from '../core'
import { sourcesForType } from '../source'
import {
  PanelComponentsProvider,
  SlotActionsProvider,
  defaultPanelComponents,
  defaultSlotActions,
  usePanelComponents,
  useSlotActions,
  type AttachControlProps,
  type PanelComponents,
  type SlotActions,
} from './components'

/**
 * A custom editor for a non-numeric slot type. Keyed by the slot's
 * `outType`. Receives the current value and a setter; render whatever
 * UI you want.
 */
export type SlotEditor<T = unknown> = (props: {
  value: T
  set: (v: T) => void
  slot: Slot<T>
}) => ReactNode

/**
 * A host-supplied external live value for a slot — the effective value
 * some app-side layer resolves ON TOP of the slot's own modulation
 * (e.g. herder's control-port wire riding a param). Given a slot's path
 * and slot, return an accessor for that external value, or `undefined`
 * to fall back to the slot's own `lastSample` stash. The returned
 * accessor is polled like `SliderProps.live` — it must be read-only.
 */
export type LiveOverride = (
  path: string[],
  slot: Slot<unknown>,
) => (() => number | undefined) | undefined

export interface PanelProps<D extends Dials> {
  dials: D
  /** Custom editors keyed by slot.outType. Numbers get a built-in slider. */
  editors?: Record<string, SlotEditor>
  /** Optional label shown above the panel. */
  title?: string
  /**
   * Root path prefix for every slot's identity path. A host that hosts
   * multiple Panels (or embeds slots under an app-side id) passes e.g.
   * `['n3']` so paths read `['n3','zoom','freq']`. Defaults to `[]`.
   */
  id?: string
  /**
   * Mediation for every slot mutation the Panel performs. Defaults to
   * direct in-place mutation; a host with an op/collab pipeline passes
   * its own — see `SlotActions`.
   */
  actions?: Partial<SlotActions>
  /** External live value per slot — see `LiveOverride`. */
  liveOverride?: LiveOverride
  /**
   * Override any subset of the UI parts the Panel renders. Anything
   * not supplied falls back to `defaultPanelComponents`. The merged
   * set is propagated via context so deeply nested rows see the same
   * components without prop-drilling.
   */
  components?: Partial<PanelComponents>
  /**
   * Called after any user interaction that mutates the dials tree —
   * slider drag, attach, detach. Use this to re-render the parent so
   * downstream consumers (renderers, refs reading dial values) see
   * the change. The Panel always re-renders itself regardless.
   */
  onChange?: () => void
}

export function Panel<D extends Dials>({
  dials,
  editors,
  title,
  id,
  actions,
  liveOverride,
  components,
  onChange,
}: PanelProps<D>): ReactNode {
  const [, force] = useReducer((x: number) => x + 1, 0)
  const notify = () => {
    force()
    onChange?.()
  }
  const merged: PanelComponents = components
    ? { ...defaultPanelComponents, ...components }
    : defaultPanelComponents
  const mergedActions: SlotActions = actions
    ? { ...defaultSlotActions, ...actions }
    : defaultSlotActions
  const { Heading, Frame } = merged
  const root = id ? [id] : []
  const rows = Object.entries(dials).map(([key, slot]) => (
    <SlotRow
      key={key}
      label={key}
      path={[...root, key]}
      slot={slot as Slot<unknown>}
      editors={editors}
      liveOverride={liveOverride}
      onChange={notify}
    />
  ))
  const body = Frame ? (
    <Frame title={title}>{rows}</Frame>
  ) : (
    <div className="dials-panel" data-dials-panel="">
      {title ? <Heading title={title} /> : null}
      {rows}
    </div>
  )
  return (
    <PanelComponentsProvider value={merged}>
      <SlotActionsProvider value={mergedActions}>{body}</SlotActionsProvider>
    </PanelComponentsProvider>
  )
}

export interface SlotRowProps {
  label: string
  /**
   * Stable identity path to this slot (root prefix + keys). Threaded
   * into every child (RowProps/SliderProps/AttachControlProps) and every
   * SlotActions call. Defaults to `[label]` when omitted, so a bare
   * `<SlotRow label slot/>` still works.
   */
  path?: string[]
  slot: Slot<unknown>
  editors?: Record<string, SlotEditor>
  /** External live value per slot — see `LiveOverride`. */
  liveOverride?: LiveOverride
  onChange: () => void
}

/* Set `folded` across a slot's whole modulation subtree — the shift-click
   fold-all cascade. Plain recursion over the live tree; no component
   plumbing needed because fold state lives on the slots themselves. */
function foldSubtree(slot: Slot<unknown>, next: boolean): void {
  slot.folded = next
  const src = slot.attached
  if (!src) return
  for (const k in src.params) {
    foldSubtree(src.params[k] as Slot<unknown>, next)
  }
}

/**
 * One slot's row: caption, editor, attach control, and — when a source
 * is attached — a nested sub-panel of the source's own params (itself a
 * stack of `SlotRow`s, recursively). Exported so a consumer can compose
 * its own container arrangement (e.g. a horizontal strip) without
 * reimplementing the recursion, editor selection, or attach logic.
 *
 * The row's fold state (`slot.folded`) is owned HERE, not by the Row
 * component: the toggle writes the slot and notifies through `onChange`,
 * so folds survive remounts and the host can observe how much of the
 * modulation tree is actually visible (herder sizes the dial node from
 * it). Deliberately NOT a SlotAction — fold is view state, not model
 * state: no op, no wire, no persistence.
 */
export function SlotRow({
  label,
  path,
  slot,
  editors,
  liveOverride,
  onChange,
}: SlotRowProps): ReactNode {
  const c = usePanelComponents()
  const actions = useSlotActions()
  const attached = slot.attached
  // A slot can opt out of modulation entirely (meta.modulatable: false):
  // no attach glyph, no picker, no candidates. It still renders its
  // editor and samples base-only, so it looks like any other slot minus
  // the attach affordance. Suppressing candidates here also stops the
  // Row from reserving the attach cell.
  const modulatable = slot.dial.meta.modulatable !== false
  const candidates = modulatable ? sourcesForType(slot.outType) : []
  const displayLabel = slot.dial.meta.label ?? label
  const rowPath = path ?? [label]

  const help = slot.dial.meta.description ? (
    <c.HelpTooltip
      title={displayLabel}
      description={slot.dial.meta.description}
    />
  ) : undefined

  // The attach picker's pure-view props: current selection, mode,
  // candidates, and callbacks pre-bound to the actions HERE — the
  // control itself never touches the slot, so a host's mediation can't
  // be bypassed. The attached source's description is the
  // AttachControl's job to surface (its trigger/cells carry it).
  const attachProps: AttachControlProps | undefined =
    candidates.length > 0 || attached
      ? {
          path: rowPath,
          current: attached?.def.name ?? null,
          mode: slot.modMode,
          candidates,
          onPick: (name) => {
            actions.attach(rowPath, slot, name)
            onChange()
          },
          onMode: (m) => {
            actions.setMode(rowPath, slot, m)
            onChange()
          },
        }
      : undefined

  // When the bundle's Slider hosts the attach control itself (e.g. the
  // knob places the modulation glyph in its face), route the attach
  // props into the numeric editor — it renders the configured
  // AttachControl with `hosted` open-state — and drop the standalone
  // row cell so the picker renders exactly once. Non-numeric slots
  // always use the row cell.
  const hostsAttach = Boolean(c.sliderHostsAttach) && slot.outType === 'number'
  const hostedAttach = hostsAttach ? attachProps : undefined
  const rowAttach =
    !hostsAttach && attachProps ? <c.AttachControl {...attachProps} /> : undefined

  // Numeric slots keep their editor while a source is attached — the
  // slider/knob shows the live modulated output (via the lastSample
  // stash) while drags still edit the slot's own dial, the value the
  // slot returns to on detach. Non-numeric attached slots have no
  // live display story yet, so they collapse to the nested panel only.
  const editor = attached ? (
    slot.outType === 'number' ? (
      <NumberEditor
        path={rowPath}
        slot={slot as Slot<number>}
        liveOverride={liveOverride}
        onChange={onChange}
        attach={hostedAttach}
      />
    ) : null
  ) : (
    <SlotEditorView
      path={rowPath}
      slot={slot}
      editors={editors}
      liveOverride={liveOverride}
      onChange={onChange}
      attach={hostedAttach}
    />
  )

  // A host may wrap each control in per-slot chrome (indicator dots, a
  // context menu, a live registration) without forking the editor.
  const control =
    editor && c.SlotChrome ? (
      <c.SlotChrome path={rowPath} slot={slot}>
        {editor}
      </c.SlotChrome>
    ) : (
      editor
    )

  const nested = attached ? (
    <div className="dials-source" data-dials-source={attached.def.name}>
      {Object.entries(attached.params).map(([k, sub]) => (
        <SlotRow
          key={k}
          label={k}
          path={[...rowPath, k]}
          slot={sub as Slot<unknown>}
          editors={editors}
          liveOverride={liveOverride}
          onChange={onChange}
        />
      ))}
    </div>
  ) : null

  const onFold = (next: boolean, all: boolean): void => {
    if (all) foldSubtree(slot, next)
    else slot.folded = next
    onChange()
  }

  return (
    <div
      className="dials-slot"
      data-dials-slot=""
      data-dials-attached={attached ? attached.def.name : ''}
    >
      <c.Row
        path={rowPath}
        label={displayLabel}
        control={control}
        help={help}
        attach={rowAttach}
        nested={nested ?? undefined}
        description={slot.dial.meta.description}
        folded={Boolean(attached && slot.folded)}
        onFold={onFold}
      />
    </div>
  )
}

function SlotEditorView({
  path,
  slot,
  editors,
  liveOverride,
  onChange,
  attach,
}: {
  path: string[]
  slot: Slot<unknown>
  editors?: Record<string, SlotEditor>
  liveOverride?: LiveOverride
  onChange: () => void
  attach?: AttachControlProps
}): ReactNode {
  const actions = useSlotActions()
  if (slot.outType === 'number') {
    return (
      <NumberEditor
        path={path}
        slot={slot as Slot<number>}
        liveOverride={liveOverride}
        onChange={onChange}
        attach={attach}
      />
    )
  }
  const custom = editors?.[slot.outType]
  if (custom) {
    return custom({
      value: slot.dial.value,
      set: (v) => {
        actions.setValue(path, slot, v)
        onChange()
      },
      slot,
    })
  }
  return (
    <div className="dials-readonly" data-dials-readonly="">
      {String(slot.dial.value)}
    </div>
  )
}

function NumberEditor({
  path,
  slot,
  liveOverride,
  onChange,
  attach,
}: {
  path: string[]
  slot: Slot<number>
  liveOverride?: LiveOverride
  onChange: () => void
  attach?: AttachControlProps
}): ReactNode {
  const c = usePanelComponents()
  const actions = useSlotActions()
  const meta = slot.dial.meta
  const min = meta.min ?? 0
  const max = meta.max ?? 1
  // The DECLARED step only — a discrete slot's quantization notch, passed
  // through verbatim (undefined when the slot is continuous). Each slider
  // owns its own fine fallback, so a real step is never confused with a
  // synthesized default: a discrete dial snaps everywhere, a continuous
  // one moves freely.
  const step = meta.step
  const scale = meta.scale
  const set = (v: number) => {
    actions.setValue(path, slot, v)
    onChange()
  }
  const setGlide = (seconds: number) => {
    actions.setGlide(path, slot, seconds)
    onChange()
  }
  // Narrow accessors for modulation-aware sliders: whether a source is
  // attached, the slot's last sampled output, the slot's own modDepth
  // and modMode (both slot-level, present regardless of attachment).
  // The raw Slot never crosses the components contract.
  //
  // A host may override the live accessor per slot — its own effective
  // value resolved on top of the slot's modulation (e.g. a control-port
  // wire riding the param). When it declines (returns undefined), fall
  // back to the slot's own last-sample stash.
  const override = liveOverride?.(path, slot)
  const stash = useCallback(() => slot.lastSample, [slot])
  const live = override ?? stash
  const onDepthChange = useCallback(
    (d: number) => {
      actions.setDepth(path, slot, d)
      onChange()
    },
    [actions, path, slot, onChange],
  )
  return (
    <div
      className="dials-number"
      data-dials-number=""
      {...(scale === 'log' && min > 0 && max > min
        ? { 'data-dials-scale': 'log' }
        : {})}
    >
      <c.Slider
        path={path}
        value={slot.dial.value}
        min={min}
        max={max}
        step={step}
        scale={scale}
        onChange={set}
        attached={slot.attached !== null || Boolean(override)}
        live={live}
        depth={slot.modDepth}
        mode={slot.modMode}
        // Like the attach picker, the depth gesture is a modulation
        // affordance — a non-modulatable slot gets neither, so its
        // knob is fully inert to right-drag.
        onDepthChange={meta.modulatable !== false ? onDepthChange : undefined}
        glide={slot.glide}
        // The glide affordance is opt-in per slot (meta.glidable) — the
        // sampler honors slot.glide regardless, but only an opted-in
        // slot grows the gesture/editor.
        onGlide={meta.glidable ? setGlide : undefined}
        unit={meta.unit}
        format={meta.format}
        defaultValue={slot.dial.initial}
        attachProps={attach}
        label={slot.dial.meta.label ?? path[path.length - 1]}
      />
      {c.sliderShowsValue ? null : (
        <c.NumberField
          value={slot.dial.value}
          min={min}
          max={max}
          step={step}
          scale={scale}
          onChange={set}
        />
      )}
    </div>
  )
}
