/* The wire proxy — where a param edit lands while a dial drives it.

   While a control wire rides a param, the dial IS the param: the
   engine bypasses the param's own base and maps the dial's signal onto
   the knob's range (rideValue). An edit on the ridden knob therefore
   belongs to the DIAL — writing the param's base would land in a cell
   the engine no longer reads. This helper is the one place that
   routing lives: every setParam-shaped edit (a knob drag, a MIDI CC's
   model fallback) dispatches through it.

   The redirect inverse-maps the value into signal space (rideSignal)
   and dispatches onto the winning dial's own axis — whose glide and
   attached modulation then carry it back down the wire, so the ridden
   knob eases to the edit exactly as the dial would. Sub-slot paths
   (a source's freq) and unridden params dispatch straight through. */

import type { Slot } from '@ldlework/dials';
import { rideSignal, type ParamHints } from '../patch';
import { dispatch, type DispatchOpts } from './dispatch';
import { liveDriver } from './live';

/** dispatch a param edit, routed through the wire proxy: a ridden root
    param's edit lands on the driving dial (in signal space); everything
    else lands on the param itself */
export function dispatchParam(node: string, key: string, slot: Slot<unknown>, v: number, opts: DispatchOpts = {}): void {
  const drv = key.includes('/') ? undefined : liveDriver(`${node}:${key}`);
  if (drv) {
    const m = slot.dial.meta;
    const c = rideSignal(m.min ?? 0, m.max ?? 1, m.hints as ParamHints | undefined, v);
    dispatch({ kind: 'setParam', scope: { kind: 'doc', path: [] }, node: drv.id, key: drv.axis, v: c }, opts);
    return;
  }
  dispatch({ kind: 'setParam', scope: { kind: 'doc', path: [] }, node, key, v }, opts);
}
