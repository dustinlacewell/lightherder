/* A param as the device experiences it: its own resolved slot output —
   unless a control wire rides its port, in which case the wire DRIVES
   it.

   The slot output is the dials-resolved value: the user's knob plus any
   attached-source modulation (base + depth·signal), slewed by the
   slot's `glide` — already written to `slot.lastSample` by the engine's
   per-tick sampling pass. That is the param's value while nothing
   rides.

   A riding wire replaces it outright: the winning dial's signal maps
   onto the knob's full range (rideValue — linear or log, unipolar from
   the floor or bipolar around the center), and the param's own base is
   bypassed. The dial IS the param while wired — its glide and attached
   modulation arrive already folded into the signal, so automation on
   the dial automates the param. Clamped to the knob's bounds (or the
   param's deliberate control-extended bounds); periodic params —
   rotations — wrap instead.

   Every ridden value is published to the live channel — with the
   winning dial's identity — so the ridden knob displays what the
   engine rendered with, and an edit on it can be routed back to the
   dial that owns it (runtime's dispatchParam). */

import { type Slot } from '@ldlework/dials';
import { rideValue, type ParamHints, type PatchNode } from '../patch';
import { clearLive, setLive } from '../runtime';
import type { StampBank } from './stamps';
import type { Wiring } from './wiring';

/** the slot output the sampler resolved for this param this tick — the
    glided, modulated base value. Falls back to the raw dial value before
    the first sample (or if the key is absent). */
export function slotValue(n: PatchNode, key: string): number {
  const s = n.data.slots[key] as Slot<number> | undefined;
  if (!s) return 0;
  return s.lastSample ?? s.dial.value;
}

/** the engine-only combine hints stashed on a slot's meta by slotFor */
function hintsOf(n: PatchNode, key: string): ParamHints | undefined {
  const s = n.data.slots[key] as Slot<number> | undefined;
  return s?.dial.meta.hints as ParamHints | undefined;
}

export function paramValue(n: PatchNode, key: string, wiring: Wiring, dials: StampBank): number {
  const target = `${n.id}:${key}`;
  const ride = wiring.ctlIn(n.id, 'c:' + key, dials);
  if (!ride) { clearLive(target); return slotValue(n, key); }
  const h = hintsOf(n, key);
  const s = n.data.slots[key] as Slot<number>;
  const min = s.dial.meta.min ?? 0;
  const max = s.dial.meta.max ?? 1;
  const raw = rideValue(min, max, h, ride.v);
  const out = h?.periodic ? raw : clamp(raw, h?.cmin ?? min, h?.cmax ?? max);
  setLive(target, out, { id: ride.src.id, axis: ride.axis });
  return out;
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const clampInt = (v: number, lo: number, hi: number) => Math.round(clamp(v, lo, hi));
