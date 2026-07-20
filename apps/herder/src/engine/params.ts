/* A param as the device experiences it: the resolved slot output, plus
   whatever rides its control port (any param can carry one — the port
   is UI; the wire is what matters here).

   The slot output is the dials-resolved value: the user's knob plus any
   attached-source modulation (base + depth·signal), slewed by the
   slot's `glide` — already written to `slot.lastSample` by the engine's
   per-tick sampling pass. That resolved value is the new "base"; a
   riding control-port WIRE then adds a second, engine-side layer on top.
   Bipolar params take ± half the knob's range around it; unipolar
   params (rest at the floor) take the FULL range, expecting a 0…+1
   signal — either way a dial's full throw covers the whole param.
   Clamped to the knob's bounds (or the param's deliberate control-
   extended bounds); periodic params — rotations — wrap instead.

   Every resolved value is published to the live channel so the ridden
   knob can display what the engine actually rendered with. */

import { type Slot } from '@ldlework/dials';
import { type ParamHints, type PatchNode } from '../patch';
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
  const v = slotValue(n, key);
  const c = wiring.ctlIn(n.id, 'c:' + key, dials);
  if (!c) { clearLive(`${n.id}:${key}`); return v; }
  const h = hintsOf(n, key);
  const s = n.data.slots[key] as Slot<number>;
  const min = s.dial.meta.min ?? 0;
  const max = s.dial.meta.max ?? 1;
  const range = max - min;
  /* ratio params ride in log space: the signal multiplies, so a full
     throw is min↔max from a centered knob instead of a lopsided add */
  const raw = h?.scale === 'log'
    ? v * Math.exp(c * Math.log(max / Math.max(min, 1e-6)) * (h?.polarity === 'uni' ? 1 : 0.5))
    : v + c * (h?.polarity === 'uni' ? range : range / 2);
  const out = h?.periodic ? raw : clamp(raw, h?.cmin ?? min, h?.cmax ?? max);
  setLive(`${n.id}:${key}`, out);
  return out;
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const clampInt = (v: number, lo: number, hi: number) => Math.round(clamp(v, lo, hi));
