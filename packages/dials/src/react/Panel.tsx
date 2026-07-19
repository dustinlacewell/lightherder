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
import { setDepth } from '../attach'
import { setDial } from '../dial'
import { sourcesForType } from '../source'
import {
  PanelComponentsProvider,
  defaultPanelComponents,
  usePanelComponents,
  type PanelComponents,
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

export interface PanelProps<D extends Dials> {
  dials: D
  /** Custom editors keyed by slot.outType. Numbers get a built-in slider. */
  editors?: Record<string, SlotEditor>
  /** Optional label shown above the panel. */
  title?: string
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
  const { Heading } = merged
  return (
    <PanelComponentsProvider value={merged}>
      <div className="dials-panel" data-dials-panel="">
        {title ? <Heading title={title} /> : null}
        {Object.entries(dials).map(([key, slot]) => (
          <SlotRow
            key={key}
            label={key}
            slot={slot as Slot<unknown>}
            editors={editors}
            onChange={notify}
          />
        ))}
      </div>
    </PanelComponentsProvider>
  )
}

interface SlotRowProps {
  label: string
  slot: Slot<unknown>
  editors?: Record<string, SlotEditor>
  onChange: () => void
}

function SlotRow({ label, slot, editors, onChange }: SlotRowProps): ReactNode {
  const c = usePanelComponents()
  const attached = slot.attached
  const candidates = sourcesForType(slot.outType)
  const displayLabel = slot.dial.meta.label ?? label

  const help = slot.dial.meta.description ? (
    <c.HelpTooltip
      title={displayLabel}
      description={slot.dial.meta.description}
    />
  ) : undefined

  // The attached source's description is the AttachControl's job to
  // surface (its trigger/cells carry it) — no separate help affordance.
  const attachNode =
    candidates.length > 0 || attached ? (
      <c.AttachControl
        slot={slot}
        candidates={candidates}
        onChange={onChange}
      />
    ) : undefined

  // When the bundle's Slider hosts the attach control itself (e.g. the
  // knob places the modulation glyph in its face), route the attach
  // node into the numeric editor and drop the standalone row cell so it
  // renders exactly once. Non-numeric slots always use the row cell.
  const hostsAttach = Boolean(c.sliderHostsAttach) && slot.outType === 'number'
  const hostedAttach = hostsAttach ? attachNode : undefined
  const rowAttach = hostsAttach ? undefined : attachNode

  // Numeric slots keep their editor while a source is attached — the
  // slider/knob shows the live modulated output (via the lastSample
  // stash) while drags still edit the slot's own dial, the value the
  // slot returns to on detach. Non-numeric attached slots have no
  // live display story yet, so they collapse to the nested panel only.
  const control = attached ? (
    slot.outType === 'number' ? (
      <NumberEditor
        slot={slot as Slot<number>}
        onChange={onChange}
        attach={hostedAttach}
      />
    ) : null
  ) : (
    <SlotEditorView
      slot={slot}
      editors={editors}
      onChange={onChange}
      attach={hostedAttach}
    />
  )

  const nested = attached ? (
    <div className="dials-source" data-dials-source={attached.def.name}>
      {Object.entries(attached.params).map(([k, sub]) => (
        <SlotRow
          key={k}
          label={k}
          slot={sub as Slot<unknown>}
          editors={editors}
          onChange={onChange}
        />
      ))}
    </div>
  ) : null

  return (
    <div
      className="dials-slot"
      data-dials-slot=""
      data-dials-attached={attached ? attached.def.name : ''}
    >
      <c.Row
        label={displayLabel}
        control={control}
        help={help}
        attach={rowAttach}
        nested={nested ?? undefined}
        description={slot.dial.meta.description}
      />
    </div>
  )
}

function SlotEditorView({
  slot,
  editors,
  onChange,
  attach,
}: {
  slot: Slot<unknown>
  editors?: Record<string, SlotEditor>
  onChange: () => void
  attach?: ReactNode
}): ReactNode {
  if (slot.outType === 'number') {
    return (
      <NumberEditor
        slot={slot as Slot<number>}
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
        setDial(slot, v)
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
  slot,
  onChange,
  attach,
}: {
  slot: Slot<number>
  onChange: () => void
  attach?: ReactNode
}): ReactNode {
  const c = usePanelComponents()
  const meta = slot.dial.meta
  const min = meta.min ?? 0
  const max = meta.max ?? 1
  const step = meta.step ?? (max - min) / 1000
  const scale = meta.scale
  const set = (v: number) => {
    setDial(slot, v)
    onChange()
  }
  // A slot opts into the smoothing control by declaring a `lerp` value
  // at construction (even `0`), mirroring how `description` gates the
  // help icon by presence. Slots that never mention lerp stay clean.
  const setLerp = (seconds: number) => {
    meta.lerp = seconds
    onChange()
  }
  // Narrow accessors for modulation-aware sliders: whether a source is
  // attached, the slot's last sampled output, the slot's own modDepth
  // and modMode (both slot-level, present regardless of attachment).
  // The raw Slot never crosses the components contract.
  const live = useCallback(() => slot.lastSample, [slot])
  const onDepthChange = useCallback(
    (d: number) => {
      setDepth(slot, d)
      onChange()
    },
    [slot, onChange],
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
        value={slot.dial.value}
        min={min}
        max={max}
        step={step}
        scale={scale}
        onChange={set}
        attached={slot.attached !== null}
        live={live}
        depth={slot.modDepth}
        mode={slot.modMode}
        onDepthChange={onDepthChange}
        defaultValue={slot.dial.initial}
        attach={attach}
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
      {meta.lerp !== undefined ? (
        <c.LerpControl value={meta.lerp} onChange={setLerp} />
      ) : null}
    </div>
  )
}
