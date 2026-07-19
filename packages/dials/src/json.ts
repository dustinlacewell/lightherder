/**
 * JSON round-trip for a dials object.
 *
 * The serialized form mirrors the live tree:
 *
 *   slot:  { value: <T>, depth?: number, mode?, attached?: { name: string, params: { [k]: slot } } }
 *
 * `depth` and `mode` are slot-level — the modulation half-width and
 * shape — so they round-trip whether or not a source is attached (a
 * slot can be armed ahead of attaching one).
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

import type { Dials, ModMode, Slot } from './core'
import { attachFrom, detach } from './attach'
import { setDial } from './dial'
import { getSource } from './source'

export interface SlotSnap {
  value: unknown
  /**
   * Modulation half-width in knob-travel space, [0, 1] — slot-level,
   * present regardless of attachment so an armed-but-unattached slot
   * round-trips. Absent snapshots leave the slot's current depth.
   */
  depth?: number
  /**
   * Modulation mode — slot-level, present regardless of attachment so
   * an armed-but-unattached slot round-trips. Absent snapshots leave
   * the slot's current mode.
   */
  mode?: ModMode
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
  const snap: SlotSnap = {
    value: slot.dial.value,
    depth: slot.modDepth,
    mode: slot.modMode,
  }
  if (slot.attached) {
    const params: Record<string, SlotSnap> = {}
    for (const k in slot.attached.params) {
      params[k] = slotToSnap(slot.attached.params[k] as Slot<unknown>)
    }
    snap.attached = {
      name: slot.attached.def.name,
      params,
    }
  }
  return snap
}

// ─── Load ─────────────────────────────────────────────────────────────

/**
 * Options for `fromJSON`.
 */
export interface FromJSONOptions {
  /**
   * What to do when a snapshot names a source that isn't registered:
   *   - `'throw'` (default): fail loudly — silently dropping a
   *     modulation chain is usually worse than failing.
   *   - `'drop'`: keep the slot's value, drop the attachment, and move
   *     on. For hosts that load hostile/stale state and must degrade
   *     per-field rather than lose a whole document.
   */
  onMissingSource?: 'throw' | 'drop'
}

/**
 * Apply a snapshot to an existing dials object.
 *
 * Mutates `dials` in place — the assumption is you constructed the
 * object with default slots, then call `fromJSON` to hydrate it.
 * Keys not present in the snapshot are left at their defaults;
 * snapshot keys not present on the object are silently ignored
 * (forward-compat).
 */
export function fromJSON(
  dials: Dials,
  snap: DialsSnap,
  opts: FromJSONOptions = {},
): void {
  const onMissing = opts.onMissingSource ?? 'throw'
  for (const key in dials) {
    const slotSnap = snap[key]
    if (!slotSnap) continue
    applySlotSnap(dials[key] as Slot<unknown>, slotSnap, onMissing)
  }
}

function applySlotSnap(
  slot: Slot<unknown>,
  snap: SlotSnap,
  onMissing: 'throw' | 'drop',
): void {
  setDial(slot, snap.value)
  if (snap.attached) {
    const def = getSource(snap.attached.name)
    if (!def) {
      if (onMissing === 'drop') {
        // Degrade: keep the value, lose the attachment, survive.
        detach(slot)
        applySlotLevel(slot, snap)
        return
      }
      throw new Error(
        `dials: cannot hydrate — source "${snap.attached.name}" is not registered. ` +
          `Call registerSource(${snap.attached.name}) before fromJSON().`,
      )
    }
    const source = attachFrom(slot, def)
    for (const k in source.params) {
      const childSnap = snap.attached.params[k]
      if (childSnap) {
        applySlotSnap(source.params[k] as Slot<unknown>, childSnap, onMissing)
      }
    }
  } else {
    detach(slot)
  }
  applySlotLevel(slot, snap)
}

/**
 * Apply the slot-level modulation state (mode, then depth) from a
 * snapshot. Depth is applied AFTER any attach so the attach-time
 * seeding (which fires while modDepth is still 0) can't clobber an
 * explicit snapshot value — including an explicit 0. Absent fields
 * leave the slot's current value (its 'center' / seeded default).
 */
function applySlotLevel(slot: Slot<unknown>, snap: SlotSnap): void {
  if (snap.mode) slot.modMode = snap.mode
  if (typeof snap.depth === 'number') slot.modDepth = snap.depth
}
