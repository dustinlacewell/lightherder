/* The wiring, indexed for one tick: node lookup and "which wire lands
   on this input" — video inputs take one wire; control inputs fan in
   (a list, in wiring order, so the newest wire breaks stamp ties).
   Signal resolution rides through the pure-routing devices — switches
   and module-boundary IN/OUT — at zero frame cost. */

import { handleKind, type PatchEdge, type PatchNode } from '../patch';
import { heldInput } from '../runtime';
import type { StampBank } from './stamps';

const MAX_RIDE = 16;

export class Wiring {
  readonly byId = new Map<string, PatchNode>();
  private inEdge = new Map<string, PatchEdge>();
  private ctlEdges = new Map<string, { e: PatchEdge; order: number }[]>();

  constructor(nodes: PatchNode[], edges: PatchEdge[]) {
    for (const n of nodes) this.byId.set(n.id, n);
    let order = 0;
    for (const e of edges) {
      if (!e.targetHandle) continue;
      if (handleKind(e.targetHandle) === 'c') {
        const key = `${e.target}|${e.targetHandle}`;
        let list = this.ctlEdges.get(key);
        if (!list) this.ctlEdges.set(key, list = []);
        list.push({ e, order: order++ });
      } else {
        this.inEdge.set(`${e.target}|${e.targetHandle}`, e);
      }
    }
  }

  /* who actually produces the picture on this input: follow the wire,
     riding through switches and module-boundary IN/OUT devices (both
     are pure routing — no frame cost); null for unwired, broken
     chains, or a ring of pass-throughs */
  producerOf(target: string, handle: string): PatchNode | null {
    let e = this.inEdge.get(`${target}|${handle}`);
    for (let depth = 0; depth < MAX_RIDE; depth++) {
      if (!e) return null;
      const src = this.byId.get(e.source);
      if (!src) return null;
      if (src.type === 'switch') {
        const sel = heldInput(src.id) ?? src.data.sel;
        e = this.inEdge.get(`${src.id}|v:in${sel + 1}`);
        continue;
      }
      if (src.type === 'in' || src.type === 'out') {
        e = this.inEdge.get(`${src.id}|v:in`);
        continue;
      }
      return src;
    }
    return null;
  }

  /* what a control input reads — and WHO. Control ports fan in: walk
     every wire on the port, riding through module-boundary IN/OUT
     devices (which fan in themselves), and give the port to the dial
     whose knob moved most recently — ties go to the newest wire. Null
     if nothing lands (distinct from a winning dial resting at 0: a
     riding dial DRIVES the param, so its rest position is a value, not
     an absence). The winner's identity rides along so paramValue can
     publish who owns the port — the write-back path's addressee. */
  ctlIn(target: string, handle: string, dials: StampBank): CtlRide | null {
    let best: CtlRide | null = null;
    let bestStamp = -1, bestOrder = -1;
    const visited = new Set<string>();
    const stack: { key: string; depth: number }[] = [{ key: `${target}|${handle}`, depth: 0 }];
    while (stack.length) {
      const { key, depth } = stack.pop()!;
      if (depth > MAX_RIDE || visited.has(key)) continue;
      visited.add(key);
      for (const { e, order } of this.ctlEdges.get(key) ?? []) {
        const src = this.byId.get(e.source);
        if (!src) continue;
        if (src.type === 'in' || src.type === 'out') {
          stack.push({ key: `${src.id}|c:in`, depth: depth + 1 });
        } else if (src.type === 'switch') {
          /* a control switch is pure routing, like its video twin: ride
             through the selected input (held overrides the latched sel),
             so only that dial's wire reaches this port */
          const sel = heldInput(src.id) ?? src.data.sel;
          stack.push({ key: `${src.id}|c:in${sel + 1}`, depth: depth + 1 });
        } else if (src.type === 'dial' || src.type === 'xypad') {
          const axis = src.type === 'dial' ? 'val' : (e.sourceHandle?.slice(2) || 'x');
          const stamp = dials.stampOf(src.id, axis);
          if (stamp > bestStamp || (stamp === bestStamp && order > bestOrder)) {
            bestStamp = stamp;
            bestOrder = order;
            best = { v: dials.signalOf(src, axis), src, axis };
          }
        }
      }
    }
    return best;
  }
}

/** a control wire's resolved landing: the winning dial's signal, and
    the dial itself (node + axis) — the port's owner this tick */
export interface CtlRide { v: number; src: PatchNode; axis: string }
