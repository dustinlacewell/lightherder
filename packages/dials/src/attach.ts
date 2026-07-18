/**
 * Attach / detach a source to/from a slot.
 *
 * Attaching swaps the slot's value provenance from its base dial to a
 * live source instance. Detaching drops the source — the dial is
 * untouched and its prior value is what `read()` will see again.
 *
 * The functions guard at runtime that the source's `outType` matches
 * the slot's `outType`. The TypeScript signatures encode the same
 * constraint, but the runtime check is what makes deserialization
 * safe.
 */

import type { Slot, Source, SourceDef } from './core'
import { instantiate } from './source'

/**
 * Attach an existing source instance to a slot. Returns the slot so
 * calls can chain in tests / fluent builders.
 */
export function attach<T>(slot: Slot<T>, source: Source<Record<string, unknown>, T>): Slot<T> {
  if (source.def.outType !== slot.outType) {
    throw new Error(
      `dials: cannot attach source "${source.def.name}" returning ${source.def.outType} ` +
        `to slot of type ${slot.outType}`,
    )
  }
  slot.attached = source
  return slot
}

/**
 * Convenience: instantiate a def and attach in one step. The common
 * panel action — user picks "lfo" from the picker, this is what runs.
 */
export function attachFrom<T>(
  slot: Slot<T>,
  def: SourceDef<Record<string, unknown>, T>,
): Source<Record<string, unknown>, T> {
  if (def.outType !== slot.outType) {
    throw new Error(
      `dials: cannot attach source "${def.name}" returning ${def.outType} ` +
        `to slot of type ${slot.outType}`,
    )
  }
  const src = instantiate(def)
  // Let the source tailor its parameter defaults to the host slot
  // (e.g. lfo center = host current value, depth scaled to range).
  if (def.onAttach) {
    def.onAttach(src.params, slot as Slot<unknown>)
  }
  slot.attached = src
  return src
}

/**
 * Detach whatever's currently driving the slot. The base dial is
 * unchanged, so `read()` immediately returns its stored value again.
 */
export function detach<T>(slot: Slot<T>): void {
  slot.attached = null
}
