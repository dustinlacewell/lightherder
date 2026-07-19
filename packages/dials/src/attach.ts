/**
 * Attach / detach a modulation source to/from a slot.
 *
 * Attaching stores a live source instance directly on the slot
 * (`slot.attached`). The envelope width and mode both live on the slot
 * itself (`modDepth`, `modMode`), so they can be pre-armed before any
 * source is attached and survive detach/reattach; attaching a bare
 * source with no depth yet seeds `DEFAULT_DEPTH` so it visibly
 * modulates. The dial stays live: the sampler combines
 * `base + modDepth·signal` in knob-travel space, centered on the user's
 * value. Detaching drops the source — the dial, `modDepth`, and
 * `modMode` are untouched and the prior value is what `read()` will see
 * again.
 *
 * The functions guard at runtime that the source's `outType` matches
 * the slot's `outType`. The TypeScript signatures encode the same
 * constraint, but the runtime check is what makes deserialization
 * safe.
 */

import type { ModMode, Slot, Source, SourceDef } from './core'
import { instantiate } from './source'

/** Default modulation half-width in knob-travel space. */
export const DEFAULT_DEPTH = 0.15

/**
 * Attach an existing source instance to a slot. The mode is slot-level
 * (`slot.modMode`) and untouched here. If the slot's `modDepth` is
 * still `0`, seed it to `DEFAULT_DEPTH` so a bare attach visibly
 * modulates; an already pre-set depth is left alone. Returns the slot
 * so calls can chain in tests / fluent builders.
 */
export function attach<T>(
  slot: Slot<T>,
  source: Source<Record<string, unknown>, T>,
): Slot<T> {
  if (source.def.outType !== slot.outType) {
    throw new Error(
      `dials: cannot attach source "${source.def.name}" returning ${source.def.outType} ` +
        `to slot of type ${slot.outType}`,
    )
  }
  if (slot.modDepth === 0) slot.modDepth = DEFAULT_DEPTH
  slot.attached = source
  return slot
}

/**
 * Convenience: instantiate a def and attach in one step. The common
 * panel action — user picks "lfo" from the picker, this is what runs.
 * The mode is slot-level (`slot.modMode`) and untouched here. If the
 * slot's `modDepth` is still `0`, seed it to `DEFAULT_DEPTH` so a bare
 * attach visibly modulates; an already pre-set depth is left alone.
 * Returns the instantiated source (not the slot) so callers can reach
 * its fresh sub-slots directly.
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
  if (slot.modDepth === 0) slot.modDepth = DEFAULT_DEPTH
  const src = instantiate(def)
  slot.attached = src
  return src
}

/**
 * Detach whatever's currently modulating the slot. The base dial and
 * the slot's `modDepth` / `modMode` are unchanged, so `read()`
 * immediately returns its stored value again and a later reattach
 * reuses the armed width and mode.
 */
export function detach<T>(slot: Slot<T>): void {
  slot.attached = null
}

/**
 * Set the slot's modulation depth, clamped into [0, 1]. Writes
 * unconditionally — depth is a property of the slot, so this works
 * with nothing attached (arming the envelope ahead of a source) and
 * while attached alike.
 */
export function setDepth(slot: Slot<unknown>, depth: number): void {
  slot.modDepth = Math.max(0, Math.min(1, depth))
}

/**
 * Set the slot's modulation mode. Writes unconditionally — mode is a
 * property of the slot, so this works with nothing attached (arming the
 * envelope shape ahead of a source) and while attached alike.
 */
export function setMode(slot: Slot<unknown>, mode: ModMode): void {
  slot.modMode = mode
}
