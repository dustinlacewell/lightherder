/**
 * Core types for `dials` — a parameter machine.
 *
 * The mental model in one sentence:
 *
 *   A *dials* object is a flat record of named *slots*. Each slot is
 *   a literal value (a slider) that may additionally carry an
 *   *attached* signal source whose normalized signal, scaled by the
 *   slot's own depth, modulates the slot's output around the user-set
 *   value (`base + depth·signal` in knob-travel space). A source's own
 *   sub-slots are themselves slots, modulatable recursively.
 *
 * The dial is always live: attaching never replaces the user's value,
 * it centers a modulation envelope on it.
 *
 * Nothing in this file knows about time, audio, graphics, or React.
 * The library's whole job is: "given some context, walk the tree,
 * return a plain record of values."
 */

/**
 * Sampling context. Whatever fields a source body wants to read live
 * here. The library does not impose any shape — `{ t }` for a frame
 * loop, `{ x, y }` for spatial, `{ beat, sweep }` for layered
 * domains, `{}` for purely user-driven values.
 */
export type Ctx = Record<string, unknown>

/**
 * UI / range metadata attached to a dial.
 */
export interface DialMeta<T> {
  label?: string
  /** Numeric range. Only meaningful for `T = number`. */
  min?: number
  max?: number
  step?: number
  /**
   * Slider scale. `'linear'` (default) maps slider position linearly
   * to value. `'log'` maps it exponentially — the bottom half of the
   * slider covers the bottom decade, etc. Use for quantities humans
   * tune in log space (frequencies, time constants, gains spanning
   * many orders of magnitude). Requires `min > 0`.
   */
  scale?: 'linear' | 'log'
  /**
   * Smoothing time constant in seconds. When set (and `> 0`), the
   * slot's *base* value is one-pole lowpassed toward the dial's target
   * value instead of snapping. So a user drag or a preset load eases
   * in over roughly `lerp` seconds rather than jumping. `undefined`/`0`
   * means snap (the default). Only meaningful for `T = number`.
   *
   * This smooths the base term; while a source is attached, modulation
   * (`depth·signal`) adds on top of the smoothed base (smooth a
   * source's own signal with the `smooth` source instead). Reads
   * `ctx.dt`, matching the stdlib time convention.
   */
  lerp?: number
  /** Hint for the panel — e.g. 'oklch' for a color dial. */
  space?: string
  /**
   * Optional explainer text. When set, the panel renders a small (?)
   * affordance next to the slot label that reveals this text in a
   * popover on hover / focus. Use for non-obvious slots whose purpose,
   * units, or interactions a user would otherwise have to guess at.
   */
  description?: string
  /** Free-form bag the panel/app can extend. */
  hints?: Record<string, unknown>
}

/**
 * A leaf value cell — the user-editable slider value of a slot when
 * no source is attached.
 */
export interface Dial<T> {
  readonly kind: 'dial'
  value: T
  /**
   * The construction-time value — the dial's code-defined home.
   * Editors use it as the reset target (double-click / Home); loading
   * a snapshot changes `value`, never this.
   */
  readonly initial: T
  readonly meta: DialMeta<T>
}

/**
 * A source body — pure function from resolved params + ctx to output.
 *
 * Stateless sources supply this directly. Stateful sources (filters,
 * integrators, seeded RNG) supply a `BodyFactory` instead — it runs
 * once per instantiation and closes over per-instance mutable state.
 */
export type Body<Params extends Record<string, unknown>, Out> = (
  params: Params,
  ctx: Ctx,
) => Out

/**
 * A factory that, when invoked at `instantiate()` time, returns a
 * fresh body closure.
 */
export type BodyFactory<Params extends Record<string, unknown>, Out> = () => Body<
  Params,
  Out
>

export interface SourceDef<Params extends Record<string, unknown>, Out> {
  readonly kind: 'sourceDef'
  /** Globally unique name used for serialization and the picker. */
  readonly name: string
  /** Human-readable description rendered by the panel as a tooltip. */
  readonly description?: string
  /** Return type tag — must match the host slot's `outType` to attach. */
  readonly outType: string
  /**
   * The source's normalized emission range contract: `'bipolar'`
   * sources emit in `[-1, 1]`, `'unipolar'` sources in `[0, 1]`.
   * Drives the panel's modulation-band rendering and the combine
   * math's expectations — a bipolar signal swings the slot both ways
   * around its base value; a unipolar one pushes only upward.
   */
  readonly polarity: 'bipolar' | 'unipolar'
  /**
   * Per-parameter defaults. Each entry is a recipe for the *initial*
   * sub-slot when this source is selected. The thunk gives each
   * instantiation its own fresh slots.
   */
  readonly params: {
    [K in keyof Params]: {
      type: string
      makeSlot: () => Slot<Params[K]>
    }
  }
  /**
   * Either a direct body (stateless) or a factory that builds one
   * fresh body per instantiation (stateful).
   */
  readonly body: Body<Params, Out> | BodyFactory<Params, Out>
  /** @internal — set to true if `body` is a `BodyFactory`. */
  readonly stateful: boolean
}

/**
 * A live instance of a source — the def plus per-instance sub-slots
 * (each itself a recursively-tunable Slot) and the resolved body.
 */
export interface Source<Params extends Record<string, unknown>, Out> {
  readonly kind: 'source'
  readonly def: SourceDef<Params, Out>
  /** One slot per param. Iteration order matches `def.params`. */
  readonly params: { [K in keyof Params]: Slot<Params[K]> }
  /** Resolved body (post-factory for stateful defs). */
  readonly body: Body<Params, Out>
  /** @internal — reusable params buffer for the sampler. */
  readonly _buf: Params
  /** @internal — pre-computed param keys for iteration. */
  readonly _keys: readonly (keyof Params & string)[]
}

/**
 * How a source's normalized signal is applied around the slot's base
 * value. `'center'` swings both ways (the classic bipolar behavior),
 * `'up'` pushes only above the base, `'down'` only below. Independent
 * of the source's `polarity` (which describes its raw emission range):
 * the signal is normalized to a canonical shape first, then this mode
 * decides which direction(s) the excursion travels. It is slot-level
 * and user-owned (see `Slot.modMode`) — independent of the attached
 * source, defaulting to `'center'`.
 */
export type ModMode = 'center' | 'up' | 'down'

/**
 * A slot is the thing sampled. It carries a `dial` (the user-editable
 * value — always live, never replaced) and an optional `attached`
 * source whose normalized signal, scaled by the slot's `modDepth` and
 * shaped by its `modMode`, adds onto the base value in knob-travel
 * space.
 *
 * `outType` is the type tag the registry uses to filter which sources
 * the picker offers.
 */
export interface Slot<T> {
  readonly kind: 'slot'
  readonly outType: string
  readonly dial: Dial<T>
  attached: Source<Record<string, unknown>, T> | null
  /**
   * Modulation half-width in knob-travel space, [0, 1]. Slot-level so
   * it can be pre-set before any source is attached — the panel arms
   * the envelope with it — and so it survives detach/reattach. `0`
   * means no envelope. While a source is attached the sampler scales
   * its normalized signal by this width around the base value.
   */
  modDepth: number
  /**
   * How the normalized signal is applied around the base value —
   * `'center'` both ways, `'up'` only above, `'down'` only below.
   * Slot-level and purely user-owned: `'center'` by default, unchanged
   * by attaching a source (the sampler normalizes any source's emission
   * into whatever mode is set), and surviving detach/reattach. Applies
   * to whatever source is or later becomes attached.
   */
  modMode: ModMode
  /**
   * The value this slot resolved to on its most recent sample — the
   * combined output (`base + depth·signal`) while modulated — written
   * by the sampler every time the slot is pulled (attached or not),
   * never by the UI. `undefined` until the first sample. This is how
   * an editor can *display* the live modulated output without
   * sampling it (stateful sources mutate on every sample, so
   * UI-driven re-sampling would corrupt the host's signal).
   */
  lastSample?: T
  /**
   * @internal — one-pole filter memory for `meta.lerp` smoothing. Holds
   * the last emitted (smoothed) value of the dial branch. `NaN` until
   * the first sample, at which point it initializes to the dial's
   * target so smoothing eases from the current value, not from zero.
   */
  _lerpY?: number
}

/** The type a slot resolves to. */
export type SlotOut<S> = S extends Slot<infer T> ? T : never

/**
 * A record of named slots — the thing your app hands to `read()` and
 * to `<Panel/>`.
 */
export type Dials = Record<string, Slot<unknown>>

/**
 * The output shape produced by `read(dials, ctx)`. Maps each slot to
 * its resolved value type.
 */
export type DialsOut<D extends Dials> = {
  [K in keyof D]: SlotOut<D[K]>
}
