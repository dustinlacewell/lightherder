/**
 * Source definitions and the registry.
 *
 * A *source* is a named recipe that turns N sub-parameters into one
 * output value. `defineSource` builds the definition; `instantiate`
 * builds a live `Source` (with its own fresh slots) ready to attach.
 *
 * The registry exists only so the panel's "attach modulator…" picker
 * can list candidates matching a slot's output type. The library
 * itself never reaches into the registry to *evaluate* — it walks the
 * tree it's handed.
 *
 * Stateful sources (filters, integrators, seeded RNG cursors) pass a
 * `BodyFactory` instead of a `Body` — a zero-arg function that
 * returns a fresh body closure. The factory runs once per
 * instantiation so each instance has its own state.
 */

import type {
  Body,
  BodyFactory,
  Ctx,
  Slot,
  Source,
  SourceDef,
} from './core'

/**
 * Param spec passed to `defineSource`. Each entry says:
 *   - `type`: the type tag the sub-slot will carry
 *   - `slot`: a thunk that returns a fresh default slot per instance
 *
 * Using a thunk (not a literal) means every instantiation of the
 * source gets its own independent sub-slots — no shared mutable state.
 */
export type ParamSpec<T> = {
  type: string
  slot: () => Slot<T>
}

export type ParamsSpec<P extends Record<string, unknown>> = {
  [K in keyof P]: ParamSpec<P[K]>
}

export interface DefineSourceArgs<
  P extends Record<string, unknown>,
  Out,
> {
  /** Globally unique name. Used by serializer + attach picker. */
  name: string
  /** Optional human-readable description of the source's character. */
  description?: string
  /** Output type tag — matches against `Slot.outType`. */
  outType: string
  /** Normalized emission contract: `'bipolar'` [-1,1] or `'unipolar'` [0,1]. */
  polarity: 'bipolar' | 'unipolar'
  /** Sub-parameter schema, including defaults. */
  params: ParamsSpec<P>
  /** Stateless body. For stateful sources use `defineStatefulSource`. */
  body: Body<P, Out>
}

export interface DefineStatefulSourceArgs<
  P extends Record<string, unknown>,
  Out,
> {
  /** Globally unique name. Used by serializer + attach picker. */
  name: string
  /** Optional human-readable description of the source's character. */
  description?: string
  /** Output type tag — matches against `Slot.outType`. */
  outType: string
  /** Normalized emission contract: `'bipolar'` [-1,1] or `'unipolar'` [0,1]. */
  polarity: 'bipolar' | 'unipolar'
  /** Sub-parameter schema, including defaults. */
  params: ParamsSpec<P>
  /**
   * Body factory. Runs once per `instantiate()` and returns a fresh
   * body closure. Per-instance state lives in that closure — two
   * instances of the same stateful source never share memory.
   */
  body: BodyFactory<P, Out>
}

/**
 * Define a stateless named source. The body runs as-is on every
 * sample; no per-instance memory.
 */
export function defineSource<P extends Record<string, unknown>, Out>(
  args: DefineSourceArgs<P, Out>,
): SourceDef<P, Out> {
  return buildDef(
    args.name, args.description, args.outType, args.polarity,
    args.params, args.body, false,
  )
}

/**
 * Define a stateful named source. The body factory is invoked once
 * per `instantiate()` so each instance gets its own closure state
 * (filter memory, RNG cursor, accumulator, etc.).
 */
export function defineStatefulSource<
  P extends Record<string, unknown>,
  Out,
>(
  args: DefineStatefulSourceArgs<P, Out>,
): SourceDef<P, Out> {
  return buildDef(
    args.name, args.description, args.outType, args.polarity,
    args.params, args.body, true,
  )
}

function buildDef<P extends Record<string, unknown>, Out>(
  name: string,
  description: string | undefined,
  outType: string,
  polarity: 'bipolar' | 'unipolar',
  params: ParamsSpec<P>,
  body: Body<P, Out> | BodyFactory<P, Out>,
  stateful: boolean,
): SourceDef<P, Out> {
  const paramThunks = {} as SourceDef<P, Out>['params']
  for (const k in params) {
    const spec = params[k]
    paramThunks[k] = { type: spec.type, makeSlot: spec.slot }
  }
  return {
    kind: 'sourceDef',
    name,
    description,
    outType,
    polarity,
    params: paramThunks,
    body,
    stateful,
  }
}

/**
 * Build a live source from a def, with fresh default slots for every
 * parameter. The resulting `Source` is ready to attach to a slot of
 * matching `outType`.
 *
 * For stateful defs, calls the body factory exactly once and stashes
 * the resulting closure on the instance. For stateless defs, uses the
 * shared body function directly.
 *
 * Each instance carries its own `_buf` (reused across samples to
 * avoid per-frame allocation) and `_keys` (cached param iteration).
 */
export function instantiate<P extends Record<string, unknown>, Out>(
  def: SourceDef<P, Out>,
): Source<P, Out> {
  const params = {} as { [K in keyof P]: Slot<P[K]> }
  const keys: (keyof P & string)[] = []
  const buf = {} as P
  for (const k in def.params) {
    params[k] = def.params[k].makeSlot()
    keys.push(k as keyof P & string)
  }
  const body: Body<P, Out> = def.stateful
    ? guardPerTick((def.body as BodyFactory<P, Out>)())
    : (def.body as Body<P, Out>)
  return {
    kind: 'source',
    def,
    params,
    body,
    _buf: buf,
    _keys: keys,
  } as Source<Record<string, unknown>, Out> as Source<P, Out>
}

/**
 * Per-tick guard for stateful bodies. A stateful source integrates its
 * closure state by `dt` inside the body — so it must run exactly once
 * per time tick, no matter how many slots ride it or how many times a
 * host samples the tree within one frame. Repeated samples at the same
 * `ctx.t` return the tick's cached output; the body only advances when
 * `t` moves. This is what makes the sampler's documented contract —
 * "sample twice with the same ctx, get the same answer twice" — hold
 * for stateful sources.
 */
function guardPerTick<P extends Record<string, unknown>, Out>(
  fn: Body<P, Out>,
): Body<P, Out> {
  let lastT: number | undefined
  let lastOut: Out
  let primed = false
  return (params, ctx) => {
    const t = ctx['t']
    if (typeof t === 'number' && primed && t === lastT) return lastOut
    lastT = typeof t === 'number' ? t : undefined
    lastOut = fn(params, ctx)
    primed = true
    return lastOut
  }
}

// ─── Registry ─────────────────────────────────────────────────────────
//
// A single module-level registry: one source palette per process.
// Known limitation, accepted for now — two surfaces in one app cannot
// offer different palettes, and per-slot filtering is only the binary
// `meta.modulatable`. If a host ever needs scoped palettes, the shape
// is an injectable registry on the Panel (defaulting to this one), not
// more flags here.

const REGISTRY = new Map<string, SourceDef<Record<string, unknown>, unknown>>()

/**
 * Register a source globally so the panel's attach picker can offer
 * it. Idempotent on `name` — re-registering with the same name
 * replaces (useful for HMR).
 */
export function registerSource<
  P extends Record<string, unknown>,
  Out,
>(def: SourceDef<P, Out>): SourceDef<P, Out> {
  REGISTRY.set(
    def.name,
    def as unknown as SourceDef<Record<string, unknown>, unknown>,
  )
  return def
}

/**
 * Look up a registered source by name. Returns `undefined` if absent
 * — callers (notably the deserializer) decide how to handle that.
 */
export function getSource(
  name: string,
): SourceDef<Record<string, unknown>, unknown> | undefined {
  return REGISTRY.get(name)
}

/**
 * List all registered sources whose `outType` matches the given tag.
 * The panel calls this to build the "attach modulator…" picker for a
 * specific slot.
 */
export function sourcesForType(
  outType: string,
): SourceDef<Record<string, unknown>, unknown>[] {
  const out: SourceDef<Record<string, unknown>, unknown>[] = []
  for (const def of REGISTRY.values()) {
    if (def.outType === outType) out.push(def)
  }
  return out
}

/**
 * Drop everything from the registry. Test/HMR helper.
 */
export function clearRegistry(): void {
  REGISTRY.clear()
}
