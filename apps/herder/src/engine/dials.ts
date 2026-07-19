/* Dials glide: once per tick each dial's wire signal closes on its
   knob through a one-pole — the Lerp knob is the time constant,
   0 = wired direct (the signal IS the knob). A knob that moved this
   tick is stamped, for last-write-wins fan-in. All in sim time, so a
   frozen bench holds mid-glide.

   A dial carries one signal (val); an XY pad carries two (x, y) off
   the same puck, sharing its Lerp — so glide state is keyed by
   nodeId+axis, not just nodeId. */

import type { PatchNode } from '../patch';

const DIAL_AXES: Record<string, string[]> = { dial: ['val'], xypad: ['x', 'y'] };

export class DialBank {
  private y = new Map<string, number>();      // the signal as it stands on the wire
  private prev = new Map<string, number>();   // the knob position last seen
  private stamp = new Map<string, number>();  // the tick the knob last moved

  step(nodes: PatchNode[], dt: number, ticks: number): void {
    for (const n of nodes) {
      const axes = DIAL_AXES[n.type];
      if (!axes) continue;
      const tau = n.data.v.lerp;
      for (const axis of axes) {
        const key = `${n.id}:${axis}`;
        const target = n.data.v[axis];
        if (this.prev.get(key) !== target) {
          if (this.prev.has(key)) this.stamp.set(key, ticks);
          this.prev.set(key, target);
        }
        const prev = this.y.get(key);
        if (prev === undefined || !(tau > 0)) { this.y.set(key, target); continue; }
        this.y.set(key, prev + (target - prev) * (1 - Math.exp(-dt / tau)));
      }
    }
  }

  /** the signal this dial (or this axis of an XY pad) puts on its wire now */
  signalOf(n: PatchNode, axis = 'val'): number {
    const key = `${n.id}:${axis}`;
    return this.y.get(key) ?? n.data.v[axis];
  }

  /** when this axis's knob last moved (0 = never) — fan-in tiebreak */
  stampOf(id: string, axis = 'val'): number {
    return this.stamp.get(`${id}:${axis}`) ?? 0;
  }

  /** a node left the graph — forget its glide state */
  dropUnder(id: string): void {
    const under = (k: string) => k === id || k.startsWith(id + ':') || k.startsWith(id + '/');
    for (const k of [...this.y.keys()]) if (under(k)) this.y.delete(k);
    for (const k of [...this.prev.keys()]) if (under(k)) this.prev.delete(k);
    for (const k of [...this.stamp.keys()]) if (under(k)) this.stamp.delete(k);
  }
}
