/* A param as the device experiences it: the knob, plus whatever rides
   its control port (any param can carry one — the port is UI; the
   wire is what matters here). Bipolar params take ± half the knob's
   range around it; unipolar params (rest at the floor) take the FULL
   range, expecting a 0…+1 signal — either way a dial's full throw
   covers the whole param. Clamped to the knob's bounds (or the
   param's deliberate control-extended bounds); periodic params —
   rotations — wrap instead of clamping.

   Every resolved value is published to the live channel so the ridden
   knob can display what the engine actually rendered with. */

import { PARAMS, polarityOf, type PatchNode } from '../patch';
import { clearLive, setLive } from '../runtime';
import type { DialBank } from './dials';
import type { Wiring } from './wiring';

export function paramValue(n: PatchNode, key: string, wiring: Wiring, dials: DialBank): number {
  const v = n.data.v[key];
  const c = wiring.ctlIn(n.id, 'c:' + key, dials);
  if (!c) { clearLive(`${n.id}:${key}`); return v; }
  const def = PARAMS[n.type][key];
  const range = def.max - def.min;
  const raw = v + c * (polarityOf(def) === 'uni' ? range : range / 2);
  const out = def.periodic ? raw : clamp(raw, def.cmin ?? def.min, def.cmax ?? def.max);
  setLive(`${n.id}:${key}`, out);
  return out;
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const clampInt = (v: number, lo: number, hi: number) => Math.round(clamp(v, lo, hi));
