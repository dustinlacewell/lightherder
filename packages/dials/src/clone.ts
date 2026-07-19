/**
 * Deep-clone a live slot tree.
 *
 * A `Slot` is not spreadable: it carries a live `Source` instance whose
 * body may close over per-instance mutable state (an LFO's phase, a
 * filter's memory, an RNG cursor). Two compiled instances of the same
 * prototype node must NOT share that state, so a host that materializes
 * many instances from one prototype (herder's `compile`, which used to
 * spread `{ ...data.v }`) needs a real deep copy that re-instantiates
 * every attached source.
 *
 * `cloneSlot` produces a fresh slot with:
 *   - a fresh `dial` (copied value / initial / meta — meta is shared by
 *     reference, since it is code-owned, immutable UI metadata),
 *   - the same `modDepth` / `modMode` (plain values),
 *   - a fresh `Source` (via `instantiate`, so stateful bodies get their
 *     own closure) whose sub-slots are themselves cloned recursively,
 *     carrying over each sub-slot's value / depth / mode.
 *
 * The result is independent: sampling the clone never advances the
 * original's sources and vice versa. `lastSample` / `_lerpY` are NOT
 * copied — they are sampler scratch, seeded fresh on first sample.
 */

import type { Dials, Slot, Source } from './core'
import { instantiate } from './source'

/** Deep-clone one slot and its entire attached-source subtree. */
export function cloneSlot<T>(slot: Slot<T>): Slot<T> {
  const out: Slot<T> = {
    kind: 'slot',
    outType: slot.outType,
    dial: {
      kind: 'dial',
      value: slot.dial.value,
      initial: slot.dial.initial,
      meta: slot.dial.meta,
    },
    attached: slot.attached ? cloneSource(slot.attached) : null,
    modDepth: slot.modDepth,
    modMode: slot.modMode,
  }
  return out
}

/** Re-instantiate a source (fresh body + fresh sub-slots), then copy
    each sub-slot's tunable state over from the original's sub-slots. */
function cloneSource<T>(
  src: Source<Record<string, unknown>, T>,
): Source<Record<string, unknown>, T> {
  const fresh = instantiate(src.def)
  for (const k in src.params) {
    const from = src.params[k] as Slot<unknown>
    const to = fresh.params[k] as Slot<unknown>
    copyState(from, to)
  }
  return fresh
}

/** Copy one slot's tunable state (value, depth, mode, and its own
    attachment subtree) onto a fresh default slot from `instantiate`. */
function copyState(from: Slot<unknown>, to: Slot<unknown>): void {
  to.dial.value = from.dial.value
  to.modDepth = from.modDepth
  to.modMode = from.modMode
  to.attached = from.attached ? cloneSource(from.attached) : null
}

/** Deep-clone a whole dials record. */
export function cloneDials(dials: Dials): Dials {
  const out: Dials = {}
  for (const key in dials) out[key] = cloneSlot(dials[key] as Slot<unknown>)
  return out
}

/**
 * Carry a live source's per-instance body state across a
 * re-instantiation of the same def.
 *
 * `cloneSlot` deliberately gives every clone a fresh stateful body — two
 * *sibling* instances must never share an LFO's phase or a filter's
 * memory. But a host that periodically RE-materializes the same logical
 * instance (herder recompiling its mirror after a structural edit) wants
 * the opposite: the new instance should continue where the old one left
 * off, not restart. This transplants the resolved body closure — the
 * whole of a source's per-instance state — from the retiring instance
 * into its successor, leaving the successor's own (freshly merged)
 * param slots untouched.
 *
 * Guarded by def identity: a different def (the attachment changed, or
 * HMR re-registered the source) means the old closure's shape can't be
 * trusted, so the successor keeps its fresh body. Stateless defs share
 * the def's own body function on every instance — the assignment is a
 * no-op there.
 */
export function adoptBody<T>(
  from: Source<Record<string, unknown>, T>,
  into: Source<Record<string, unknown>, T>,
): void {
  if (from === into || from.def !== into.def) return
  ;(into as { body: Source<Record<string, unknown>, T>['body'] }).body = from.body
}
