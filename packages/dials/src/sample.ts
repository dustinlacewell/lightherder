/**
 * The recursive sampler. The library's "do something" step.
 *
 * Three entry points:
 *   - `read(dials, ctx)`   — pull every slot in a dials object
 *   - `sampleSlot(slot, ctx)`   — pull one slot
 *   - `sampleSource(source, ctx)` — pull one source
 *
 * A slot's output is its dial's *base* value, plus, while a source is
 * attached, the source's normalized signal scaled by the slot's
 * `modDepth` — combined in knob-travel space via `toPos`/`fromPos` —
 * with `slot.glide` smoothing applied LAST, to the combined result.
 * Glide is a slew limiter on the whole signal: a fast source through a
 * heavy glide arrives as a gentle sweep, not a jitter (baseline +
 * modulation form the instantaneous target; the one-pole eases toward
 * it). With no source attached this is just the baseline eased. The
 * raw signal is first remapped through the slot's `modMode`: it is
 * normalized to a canonical shape (bipolar `b ∈ [-1,1]`, unipolar
 * `u ∈ [0,1]`) from the source's `polarity`, then `'center'` swings
 * both ways with `b`, `'up'` pushes only above the base with `u`, and
 * `'down'` only below. The modulation envelope never leaves the slot's
 * range: each side scales into whatever room remains between the base
 * and that extent, so full swings touch the ends instead of clipping
 * against them. Slots without range metadata combine in value space,
 * unclamped. The dial is always live; a source never replaces it
 * (except for non-numeric outputs, which can't combine).
 *
 * Allocation: zero per call. Each source instance owns one `_buf`
 * that gets mutated in place; `read()` keeps one result buffer per
 * dials object via a WeakMap. The returned object is the same
 * reference every call — destructure or copy; don't stash.
 *
 * Purity: pure given (tree state, ctx). Sample twice with the same
 * ctx, get the same answer twice. Buffers are an implementation
 * detail.
 *
 * Each slot sample also records its resolved value on the slot
 * (`slot.lastSample`) so display layers can show the live output
 * without sampling — the sampler is the only writer of the stash.
 */

import type { Ctx, Dials, DialsOut, Slot, Source } from './core'
import { fromPos, toPos, type RangeMeta } from './space'

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

export function sampleSlot<T>(slot: Slot<T>, ctx: Ctx): T {
  const att = slot.attached
  // The raw target — the knob value combined with any attached
  // modulation, BEFORE smoothing. Glide runs last, on this combined
  // value, so it slews the whole signal (see `glideTowards`).
  const base = slot.dial.value
  let out: T = base
  if (att) {
    const signal = sampleSource(att, ctx)
    if (typeof base === 'number' && typeof signal === 'number') {
      // Normalize the raw signal to the two canonical shapes the mode
      // math consumes, from the source's declared emission range:
      // bipolar `b ∈ [-1,1]`, unipolar `u ∈ [0,1]`.
      const bipolarSrc = att.def.polarity === 'bipolar'
      const b = bipolarSrc ? signal : 2 * signal - 1
      const u = bipolarSrc ? (signal + 1) / 2 : signal
      const mode = slot.modMode
      const meta = slot.dial.meta as RangeMeta
      if (
        typeof meta.min === 'number' &&
        typeof meta.max === 'number' &&
        Number.isFinite(meta.min) &&
        Number.isFinite(meta.max) &&
        meta.min < meta.max
      ) {
        // Combine in knob-travel space: symmetric on the arc for
        // every scale. The envelope is clipped to the arc first and
        // the signal's excursion scales per side into what remains —
        // a full swing touches the extents and comes back rather than
        // clipping and sitting pinned there. `mode` picks the
        // direction(s): `'center'` sweeps both ways with `b` (positive
        // half base → min(base+depth, max), negative half base →
        // max(base−depth, min)); `'up'`/`'down'` push one way with `u`.
        const depth = slot.modDepth
        const pos = clamp01(toPos(meta, base))
        if (mode === 'up') {
          const swing = Math.min(depth, 1 - pos)
          out = fromPos(meta, pos + swing * u) as T
        } else if (mode === 'down') {
          const swing = Math.min(depth, pos)
          out = fromPos(meta, pos - swing * u) as T
        } else {
          const swing =
            b >= 0
              ? Math.min(depth, 1 - pos)
              : Math.min(depth, pos)
          out = fromPos(meta, pos + swing * b) as T
        }
      } else {
        // No range metadata — combine in value space, unclamped.
        const depth = slot.modDepth
        const combined =
          mode === 'up'
            ? base + depth * u
            : mode === 'down'
              ? base - depth * u
              : base + depth * b
        out = combined as T
      }
    } else {
      // Non-numeric base or signal can't combine additively; the
      // source replaces the dial outright. Replace semantics survive
      // only for non-numbers.
      out = signal
    }
  }
  out = glideTowards(slot, out, ctx)
  slot.lastSample = out
  return out
}

/**
 * Ease the slot's combined output toward `target` with `slot.glide`
 * one-pole smoothing when set. `target` is the fully combined signal
 * (baseline + any modulation), so glide slews the whole thing — a fast
 * source through a heavy glide arrives as a gentle sweep. With glide
 * `0` (or on a non-numeric target) this is a pass-through — zero cost,
 * zero state.
 *
 * The filter memory lives on the slot (`_glideY`); first sample seeds
 * it to the current target so smoothing starts from where the signal
 * is, not from zero.
 */
function glideTowards<T>(slot: Slot<T>, target: T, ctx: Ctx): T {
  const tau = slot.glide
  if (typeof target !== 'number' || !(tau > 0)) {
    return target
  }
  const prev = slot._glideY
  if (typeof prev !== 'number' || !Number.isFinite(prev)) {
    slot._glideY = target
    return target
  }
  const dt = typeof ctx['dt'] === 'number' ? (ctx['dt'] as number) : 1 / 60
  const alpha = 1 - Math.exp(-dt / tau)
  const y = prev + (target - prev) * alpha
  slot._glideY = y
  return y as T
}

export function sampleSource<P extends Record<string, unknown>, T>(
  source: Source<P, T>,
  ctx: Ctx,
): T {
  const buf = source._buf as Record<string, unknown>
  const keys = source._keys
  const params = source.params as Record<string, Slot<unknown>>
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i] as string
    buf[k] = sampleSlot(params[k] as Slot<unknown>, ctx)
  }
  return source.body(source._buf, ctx)
}

/**
 * Per-dials-object cache. Each dials record gets its own reusable
 * result buffer + cached key list, populated lazily on first read.
 * WeakMap so the cache is collected when the dials object is.
 */
interface DialsCache {
  buf: Record<string, unknown>
  keys: string[]
}
const CACHE: WeakMap<Dials, DialsCache> = new WeakMap()

/**
 * Pull every slot in a dials object. Returns a shared buffer mutated
 * in place — valid until the next `read()` call on the same object.
 *
 *   const { freq, amp } = read(dials, { t: now })
 *
 * The output object is the same reference each call. Destructure or
 * copy if you need to persist across frames; stashing the reference
 * will alias under you.
 */
export function read<D extends Dials>(dials: D, ctx: Ctx = {}): DialsOut<D> {
  let cache = CACHE.get(dials)
  if (!cache) {
    cache = { buf: {}, keys: Object.keys(dials) }
    CACHE.set(dials, cache)
  }
  const { buf, keys } = cache
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i] as string
    buf[k] = sampleSlot(dials[k] as Slot<unknown>, ctx)
  }
  return buf as DialsOut<D>
}
