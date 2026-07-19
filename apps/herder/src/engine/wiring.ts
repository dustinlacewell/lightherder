/* The wiring, indexed for one tick: node lookup and "which wire lands
   on this input" — video inputs take one wire; control inputs fan in
   (a list, in wiring order, so the newest wire breaks stamp ties).
   Signal resolution rides through the pure-routing devices — switches
   and module-boundary IN/OUT — at zero frame cost. */

import { handleKind, type PatchEdge, type PatchNode } from '../patch';
import { heldInput } from '../runtime';
import type { DialBank } from './dials';

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

  /* what a control input reads. Control ports fan in: walk every wire
     on the port, riding through module-boundary IN/OUT devices (which
     fan in themselves), and give the port to the dial whose knob moved
     most recently — ties go to the newest wire. Rest (0) if nothing
     lands. */
  ctlIn(target: string, handle: string, dials: DialBank): number {
    let bestVal = 0, bestStamp = -1, bestOrder = -1;
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
        } else if (src.type === 'dial' || src.type === 'xypad') {
          const axis = src.type === 'dial' ? 'val' : (e.sourceHandle?.slice(2) || 'x');
          const stamp = dials.stampOf(src.id, axis);
          if (stamp > bestStamp || (stamp === bestStamp && order > bestOrder)) {
            bestStamp = stamp;
            bestOrder = order;
            bestVal = dials.signalOf(src, axis);
          }
        }
      }
    }
    return bestVal;
  }
}
