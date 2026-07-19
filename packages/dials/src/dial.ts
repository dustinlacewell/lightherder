/**
 * The leaf primitive — a user-tunable value with UI metadata.
 *
 * Two ways to construct:
 *
 *   dial(0.5, { min: 0, max: 1, label: 'amp' })   // numeric, type tag 'number'
 *   typedDial<RGB>('rgb', [1, 0, 0])              // arbitrary type with explicit tag
 *
 * The type tag is what the registry uses to decide which sources can
 * be attached. For numbers it's `'number'`; for anything else the
 * caller declares the tag they want to identify the type by.
 */

import type { Dial, DialMeta, Slot } from './core'

/**
 * Numeric dial — the common case. Type tag is always `'number'`.
 */
export function dial(value: number, meta: DialMeta<number> = {}): Slot<number> {
  return slotFromDial<number>('number', { kind: 'dial', value, initial: value, meta })
}

/**
 * Typed dial — when the value isn't a plain number. The `type` arg is
 * the tag the registry will match against when filtering sources you
 * can attach to this dial. Pick stable strings: 'rgb', 'vec2', 'bool',
 * 'oklch', etc.
 */
export function typedDial<T>(
  type: string,
  value: T,
  meta: DialMeta<T> = {},
): Slot<T> {
  return slotFromDial<T>(type, { kind: 'dial', value, initial: value, meta })
}

/**
 * Internal: wrap a fresh `Dial<T>` in a slot with no source attached.
 * Exported because `defineSource` builds slots the same way.
 */
export function slotFromDial<T>(type: string, dial: Dial<T>): Slot<T> {
  return {
    kind: 'slot',
    outType: type,
    dial,
    attached: null,
    modDepth: 0,
    modMode: 'center',
  }
}

/**
 * Set a dial's value. Equivalent to `slot.dial.value = v` but clamps
 * to `min`/`max` when both are defined and `T = number`. Use this
 * from the panel; the app should never need to call it directly.
 */
export function setDial<T>(slot: Slot<T>, value: T): void {
  const meta = slot.dial.meta as DialMeta<number>
  if (
    typeof value === 'number' &&
    typeof meta.min === 'number' &&
    typeof meta.max === 'number'
  ) {
    const clamped = Math.max(meta.min, Math.min(meta.max, value))
    slot.dial.value = clamped as T
    return
  }
  slot.dial.value = value
}
