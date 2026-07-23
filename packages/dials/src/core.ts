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
   * Whether an editor offers the glide affordance (the bar under the
   * knob, the shift+right-drag gesture, the default bundle's glide
   * field) for this slot. The glide *state* lives on the slot
   * (`Slot.glide`) and the sampler honors it regardless — this flag
   * only gates the UI, exactly as `modulatable` gates the attach
   * picker. Default `false`: glide integrates `ctx.dt`, so it only
   * makes sense on surfaces sampled against advancing time — a slot
   * opts in rather than every purely user-driven dial growing a time
   * control.
   */
  glidable?: boolean
  /**
   * Unit suffix for readouts ('Hz', 's', 'px'). Display-only; editors
   * append it to the value they render. Only meaningful for `T = number`.
   */
  unit?: string
  /**
   * Readout formatter — overrides an editor's built-in value display.
   * Receives the raw value. Display-only, code-owned like the rest of
   * the meta. Only meaningful for `T = number`.
   */
  format?: (v: number) => string
  /** Hint for the panel — e.g. 'oklch' for a color dial. */
  space?: string
  /**
   * Whether this slot may have a source attached. `true`/`undefined`
   * (the default) — the panel offers the attach control. `false` — the
   * slot does not modulate: the panel suppresses the attach control
   * and depth gesture entirely, and `fromJSON` drops a snapshot's
   * attachment onto it (stale state can't force a modulation the code
   * says can't exist). The slot still renders its editor and still
   * samples (base only), so a non-modulatable numeric slot looks
   * exactly like a modulatable one minus the modulation affordances.
   * For discrete or transport-like values where modulation is
   * nonsensical (a resolution, a frame count), or for hosts that route
   * modulation through their own layer instead of per-knob sources.
   */
  modulatable?: boolean
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
   * a snapshot changes `value`, never this. `rebaseSlot` is the one
   * sanctioned way to move it — for hosts that clone a live prototype
   * tree and want the prototype's current state as the clone's home.
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
   * Glide time constant in seconds — user-tunable slot STATE, like
   * `modDepth`/`modMode` (not metadata: it's edited by gesture,
   * serialized, and copied by `cloneSlot`). When `> 0`, the slot's
   * COMBINED output (base plus any modulation) is one-pole lowpassed
   * toward its instantaneous target instead of snapping — a slew
   * limiter on the whole signal, so a fast source through a heavy
   * glide arrives as a gentle sweep. `0` means snap (the default).
   * Reads `ctx.dt`, matching the stdlib time convention. Only
   * meaningful for `T = number`.
   */
  glide: number
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
   * View state: whether this slot's attached-source sub-panel is folded
   * away in an editor. Carried on the slot — like `lastSample` — so it
   * survives remounts and so any layer (e.g. a host computing how wide
   * an expanded modulation tree renders) can observe it without asking
   * the component tree. Written by the editor's fold toggle (`SlotRow`),
   * never by the sampler; not serialized; `undefined` means expanded.
   */
  folded?: boolean
  /**
   * @internal — one-pole filter memory for `glide` smoothing. Holds
   * the last emitted (smoothed) COMBINED output — baseline plus any
   * modulation — since glide slews the whole signal. Unset until the
   * first sample, at which point it initializes to the current combined
   * target so smoothing eases from where the signal is, not from zero.
   */
  _glideY?: number
  /**
   * Time of the last glide integration step. The one-pole advances
   * once per tick — repeated samples at the same `ctx.t` return the
   * already-integrated value instead of converging again.
   */
  _glideT?: number
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
