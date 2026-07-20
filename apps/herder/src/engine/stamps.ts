/* Fan-in stamps: which dial moved most recently.

   A control port fans in — several dials may share it, and the one
   whose knob moved last drives it (last write wins). That tiebreak
   needs one fact per dial axis: the tick its knob last moved. This is
   all that survives of the old engine-side DialBank; the GLIDE it used
   to do now lives on the slot itself (`Slot.glide`, applied by the
   dials sampler in sim-time), so a dial's wire carries its fully
   resolved — glided AND modulated — output straight off `lastSample`.

   A dial carries one axis (val); an XY pad carries two (x, y) off one
   puck, so a stamp is keyed by nodeId+axis, not just nodeId. */

import { type Dials, type Slot } from '@ldlework/dials';
import type { PatchNode } from '../patch';

const DIAL_AXES: Record<string, string[]> = { dial: ['val'], xypad: ['x', 'y'] };

/* the lerp param that glides each axis — a dial's one axis rides the
   shared `lerp`; an XY pad's axes each ride their own (independent slew) */
const AXIS_LERP: Record<string, string> = { val: 'lerp', x: 'lerpx', y: 'lerpy' };

/** the axis slot value a stamp watches — the user's dial position (not
    the sampled output; a stamp fires on a KNOB move, not on modulation
    drift) */
function axisValue(slots: Dials, axis: string): number | undefined {
  const s = slots[axis] as Slot<number> | undefined;
  return s ? s.dial.value : undefined;
}

export class StampBank {
  private prev = new Map<string, number>();   // the knob position last seen
  private stamp = new Map<string, number>();  // the tick the knob last moved

  /** watch every dial/xypad axis; stamp any whose knob moved this tick.
      Also mirrors each axis's own `lerp` param into the axis slot's
      `glide` (slot STATE, like modDepth — never the shared meta) so the
      sampler glides the combined signal in sim-time — the single owner
      of the one-pole the old DialBank used to run. An XY pad's axes glide
      independently (lerpx / lerpy); a dial's one axis rides `lerp`. */
  step(nodes: PatchNode[], ticks: number): void {
    for (const n of nodes) {
      const axes = DIAL_AXES[n.type];
      if (!axes) continue;
      for (const axis of axes) {
        const s = n.data.slots[axis] as Slot<number> | undefined;
        if (!s) continue;
        const tau = axisValue(n.data.slots, AXIS_LERP[axis]);
        if (typeof tau === 'number') s.glide = tau;
        const key = `${n.id}:${axis}`;
        const target = s.dial.value;
        if (this.prev.get(key) !== target) {
          if (this.prev.has(key)) this.stamp.set(key, ticks);
          this.prev.set(key, target);
        }
      }
    }
  }

  /** the signal this dial (or this axis of an XY pad) puts on its wire
      now — its fully resolved output: the sampler wrote it to
      `lastSample` (glided base + any attached modulation) this tick.
      Falls back to the raw dial value before the first sample. */
  signalOf(n: PatchNode, axis = 'val'): number {
    const s = n.data.slots[axis] as Slot<number> | undefined;
    if (!s) return 0;
    return s.lastSample ?? s.dial.value;
  }

  /** when this axis's knob last moved (0 = never) — fan-in tiebreak */
  stampOf(id: string, axis = 'val'): number {
    return this.stamp.get(`${id}:${axis}`) ?? 0;
  }

  /** a node left the graph — forget its stamp state */
  dropUnder(id: string): void {
    const under = (k: string) => k === id || k.startsWith(id + ':') || k.startsWith(id + '/');
    for (const k of [...this.prev.keys()]) if (under(k)) this.prev.delete(k);
    for (const k of [...this.stamp.keys()]) if (under(k)) this.stamp.delete(k);
  }
}
