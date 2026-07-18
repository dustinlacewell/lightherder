/**
 * The recursive sampler. The library's "do something" step.
 *
 * Three entry points:
 *   - `read(dials, ctx)`   — pull every slot in a dials object
 *   - `sampleSlot(slot, ctx)`   — pull one slot
 *   - `sampleSource(source, ctx)` — pull one source
 *
 * Allocation: zero per call. Each source instance owns one `_buf`
 * that gets mutated in place; `read()` keeps one result buffer per
 * dials object via a WeakMap. The returned object is the same
 * reference every call — destructure or copy; don't stash.
 *
 * Purity: pure given (tree state, ctx). Sample twice with the same
 * ctx, get the same answer twice. Buffers are an implementation
 * detail.
 */

import type { Ctx, Dials, DialsOut, Slot, Source } from './core'

export function sampleSlot<T>(slot: Slot<T>, ctx: Ctx): T {
  const src = slot.attached
  if (src) return sampleSource(src, ctx)
  return sampleDial(slot, ctx)
}

/**
 * Emit the dial's literal value, applying `meta.lerp` one-pole
 * smoothing when configured. Without `lerp` this is just the raw
 * target — zero cost, zero state. With it, the output eases toward the
 * target over ~`tau` seconds so drags and preset loads glide in.
 *
 * The filter memory lives on the slot (`_lerpY`); first sample seeds it
 * to the current target so smoothing starts from where the dial is, not
 * from zero.
 */
function sampleDial<T>(slot: Slot<T>, ctx: Ctx): T {
  const target = slot.dial.value
  const meta = slot.dial.meta as { lerp?: number }
  const tau = meta.lerp
  if (
    typeof target !== 'number' ||
    typeof tau !== 'number' ||
    !(tau > 0)
  ) {
    return target
  }
  const prev = slot._lerpY
  if (typeof prev !== 'number' || !Number.isFinite(prev)) {
    slot._lerpY = target
    return target
  }
  const dt = typeof ctx['dt'] === 'number' ? (ctx['dt'] as number) : 1 / 60
  const alpha = 1 - Math.exp(-dt / tau)
  const y = prev + (target - prev) * alpha
  slot._lerpY = y
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
