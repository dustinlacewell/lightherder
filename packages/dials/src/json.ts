/**
 * JSON round-trip for a dials object.
 *
 * The serialized form mirrors the live tree:
 *
 *   slot:  { value: <T>, attached?: { name: string, params: { [k]: slot } } }
 *
 * Type tags and source defs are NOT serialized — they live in code
 * and the registry. The serialized form is intentionally a thin
 * *state* snapshot, not a self-describing program. On load we look up
 * the source def by name; if it's missing we throw, because silently
 * dropping a modulation chain would be worse than failing loudly.
 *
 * `T` values are written through `JSON.stringify` as-is — numbers,
 * arrays, plain records all work. If you use a non-JSON-friendly
 * dial type, write your own (de)serializer pair.
 */

import type { Dials, Slot } from './core'
import { attachFrom, detach } from './attach'
import { setDial } from './dial'
import { getSource } from './source'

export interface SlotSnap {
  value: unknown
  attached?: SourceSnap
}

export interface SourceSnap {
  name: string
  params: Record<string, SlotSnap>
}

export type DialsSnap = Record<string, SlotSnap>

// ─── Save ─────────────────────────────────────────────────────────────

export function toJSON(dials: Dials): DialsSnap {
  const out: DialsSnap = {}
  for (const key in dials) {
    out[key] = slotToSnap(dials[key] as Slot<unknown>)
  }
  return out
}

function slotToSnap(slot: Slot<unknown>): SlotSnap {
  const snap: SlotSnap = { value: slot.dial.value }
  if (slot.attached) {
    const params: Record<string, SlotSnap> = {}
    for (const k in slot.attached.params) {
      params[k] = slotToSnap(slot.attached.params[k] as Slot<unknown>)
    }
    snap.attached = { name: slot.attached.def.name, params }
  }
  return snap
}

// ─── Load ─────────────────────────────────────────────────────────────

/**
 * Apply a snapshot to an existing dials object.
 *
 * Mutates `dials` in place — the assumption is you constructed the
 * object with default slots, then call `fromJSON` to hydrate it.
 * Keys not present in the snapshot are left at their defaults;
 * snapshot keys not present on the object are silently ignored
 * (forward-compat).
 */
export function fromJSON(dials: Dials, snap: DialsSnap): void {
  for (const key in dials) {
    const slotSnap = snap[key]
    if (!slotSnap) continue
    applySlotSnap(dials[key] as Slot<unknown>, slotSnap)
  }
}

function applySlotSnap(slot: Slot<unknown>, snap: SlotSnap): void {
  setDial(slot, snap.value)
  if (snap.attached) {
    const def = getSource(snap.attached.name)
    if (!def) {
      throw new Error(
        `dials: cannot hydrate — source "${snap.attached.name}" is not registered. ` +
          `Call registerSource(${snap.attached.name}) before fromJSON().`,
      )
    }
    const source = attachFrom(slot, def)
    for (const k in source.params) {
      const childSnap = snap.attached.params[k]
      if (childSnap) {
        applySlotSnap(source.params[k] as Slot<unknown>, childSnap)
      }
    }
  } else {
    detach(slot)
  }
}
