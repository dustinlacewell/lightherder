/* The wire proxy — a dial wired into a param IS that param.

   The engine renders the relationship every tick (replace semantics in
   paramValue) but never writes document state. Keeping the two FACES
   agreeing — the dial's knob and the param's knob — is EVENT work, and
   every event funnels through here:

     · the dial changes (knob drag, MIDI, a redirect below) —
       dispatchParam lands the dial op and propagates the mapped base
       onto every param the dial drives. One op moment, nothing ticks.
     · a ridden param is edited — the edit belongs to the dial: it
       inverse-maps into signal space (rideSignal) and re-enters as a
       dial change, which propagates straight back down, including onto
       the edited param itself.
     · a wire connects (seedConnect) — the dial adopts the param's
       current value when the param is its first destination, so
       plugging in never jerks the param; a dial already fanning out is
       a macro knob and pushes its own base onto the new port instead.

   Remote peers replay the same ops off the wire — the propagated and
   seed writes ride the op stream like any other value — so no peer
   re-derives anything, and every entrance (knob, MIDI, remote) stays
   consistent by construction. */

import type { Slot } from '@ldlework/dials';
import { rideSignal, rideValue, type ParamHints, type PatchEdge, type PatchNode } from '../patch';
import { dispatch, type DispatchOpts } from './dispatch';
import { heldInput } from './gestures';
import { liveDriver } from './live';
import { mirror } from './mirror';

const DOC = { kind: 'doc' as const, path: [] as string[] };

/** which output handle a dial-family axis emits from */
const AXIS_HANDLE: Record<string, string> = { val: 'c:out', x: 'c:x', y: 'c:y' };

/** a param port a dial drives: the compiled node and the param key */
export interface DrivenPort { node: PatchNode; key: string }

/** the param ports a dial axis drives: its wire walked forward through
    module-boundary IN/OUT devices and the SELECTED leg of control
    switches, in the compiled graph. `extra` folds in an edge not yet
    compiled into the mirror (a connect just dispatched). */
export function drivenPorts(id: string, sourceHandle: string, extra?: PatchEdge[]): DrivenPort[] {
  const edges = extra ? [...mirror.edges, ...extra] : mirror.edges;
  const byId = new Map(mirror.nodes.map(n => [n.id, n]));
  const seen = new Set<string>([`${id}|${sourceHandle}`]);
  const stack = [{ from: id, handle: sourceHandle }];
  const out: DrivenPort[] = [];
  const ride = (from: string, handle: string): void => {
    const k = `${from}|${handle}`;
    if (!seen.has(k)) { seen.add(k); stack.push({ from, handle }); }
  };
  while (stack.length) {
    const cur = stack.pop()!;
    for (const e of edges) {
      if (e.source !== cur.from || e.sourceHandle !== cur.handle || !e.targetHandle?.startsWith('c:')) continue;
      const tgt = byId.get(e.target);
      if (!tgt) continue;
      if (tgt.type === 'in' || tgt.type === 'out') { ride(tgt.id, 'c:out'); continue; }
      if (tgt.type === 'switch') {
        const sel = heldInput(tgt.id) ?? tgt.data.sel;
        if (e.targetHandle === `c:in${sel + 1}`) ride(tgt.id, 'c:out');
        continue;
      }
      const key = e.targetHandle.slice(2);
      if (tgt.data.slots[key]) out.push({ node: tgt, key });
    }
  }
  return out;
}

/** dispatch a param edit, routed through the proxy: a dial-axis edit
    propagates to everything it drives; a ridden param's edit re-enters
    as the driving dial's edit; everything else lands directly */
export function dispatchParam(node: string, key: string, slot: Slot<unknown>, v: number, opts: DispatchOpts = {}): void {
  const drv = key.includes('/') ? undefined : liveDriver(`${node}:${key}`);
  if (drv) {
    const m = slot.dial.meta;
    dispatchDial(drv.id, drv.axis, rideSignal(m.min ?? 0, m.max ?? 1, m.hints as ParamHints | undefined, v), opts);
    return;
  }
  const n = mirror.nodes.find(x => x.id === node);
  if (n && (n.type === 'dial' || n.type === 'xypad') && AXIS_HANDLE[key]) {
    dispatchDial(node, key, v, opts);
    return;
  }
  dispatch({ kind: 'setParam', scope: DOC, node, key, v }, opts);
}

/** a wire just connected: bring the two faces into agreement. A dial
    meeting its first destination adopts the param's value; a dial that
    already fans out pushes its base onto the port(s) it drives. Only a
    direct dial/xypad source seeds — a wire whose source is a module
    boundary settles on the dial's next move instead. */
export function seedConnect(edge: PatchEdge): void {
  if (!edge.sourceHandle || !edge.targetHandle?.startsWith('c:')) return;
  const src = mirror.nodes.find(n => n.id === edge.source);
  if (!src || (src.type !== 'dial' && src.type !== 'xypad')) return;
  const axis = src.type === 'dial' ? 'val' : edge.sourceHandle.slice(2);
  if (!AXIS_HANDLE[axis]) return;
  const dests = drivenPorts(src.id, edge.sourceHandle, [edge]);
  if (!dests.length) return;
  const opts = { silent: true };
  if (dests.length === 1) {
    const meta = metaOf(dests[0].node, dests[0].key);
    if (!meta) return;
    const v = (dests[0].node.data.slots[dests[0].key] as Slot<number>).dial.value;
    dispatchDial(src.id, axis, rideSignal(meta.min ?? 0, meta.max ?? 1, meta.hints as ParamHints | undefined, v), opts);
  } else {
    propagate(dests, (src.data.slots[axis] as Slot<number>).dial.value, opts);
  }
}

/* land a dial-axis value, then propagate its mapped base onto every
   param the dial drives — the proxy sync, fired exactly when the dial
   changes */
function dispatchDial(id: string, axis: string, c: number, opts: DispatchOpts): void {
  dispatch({ kind: 'setParam', scope: DOC, node: id, key: axis, v: c }, opts);
  propagate(drivenPorts(id, AXIS_HANDLE[axis]), c, opts);
}

function propagate(dests: DrivenPort[], c: number, opts: DispatchOpts): void {
  for (const { node, key } of dests) {
    const meta = metaOf(node, key);
    if (!meta) continue;
    const v = rideValue(meta.min ?? 0, meta.max ?? 1, meta.hints as ParamHints | undefined, c);
    dispatch({ kind: 'setParam', scope: DOC, node: node.id, key, v }, opts);
  }
}

function metaOf(n: PatchNode, key: string): Slot<number>['dial']['meta'] | undefined {
  return (n.data.slots[key] as Slot<number> | undefined)?.dial.meta;
}
