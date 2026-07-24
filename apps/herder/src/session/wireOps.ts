/* The op wire codec — how an Op crosses a Trystero JSON channel.

   Most ops are plain data and pass through untouched. Three kinds carry
   LIVE structures — `addNode` a PatchNode, `replaceGraph` a SubPatch (+
   optionally a globals tree), `entryCreate` an entry's SubPatch — whose
   slot trees hold dials Sources with function bodies. JSON serialization
   silently drops the functions, so a receiver that inserted the raw
   payload would hold slots whose attached sources cannot be sampled
   (`source.body is not a function`, thrown every engine tick).

   So the wire speaks the patch JSON dialect instead: structural payloads
   are converted with graphToJSON/treeToSnap on the way out and rebuilt
   with graphFromJSON/applySnapOverlay on the way in — fresh default
   slot trees hydrated from snaps, sources re-instantiated by registry
   name, exactly the shape the join snapshot already travels in.

   `opFromWire` returns null for a payload that doesn't parse (skew or a
   hostile peer): the receiver must still advance its seq for it, but
   apply nothing. */

import {
  applySnapOverlay, globalSlots, graphFromJSON, graphToJSON, treeToSnap,
  type Op, type SubPatch,
} from '../patch';
import type { DialsSnap } from '@ldlework/dials';

/** an Op as the wire carries it — identical to Op except the three
    structural kinds, whose live payloads travel as patch-JSON. Opaque
    beyond the discriminant; only this codec reads inside. */
export type WireOp = { kind: Op['kind'] } & Record<string, unknown>;

/** encode an op for a JSON channel — structural payloads to patch-JSON */
export function opToWire(op: Op): WireOp {
  switch (op.kind) {
    case 'addNode':
      return { ...op, node: graphToJSON({ nodes: [op.node], edges: [] }).nodes[0] };
    case 'replaceGraph':
      return {
        ...op,
        patch: graphToJSON(op.patch),
        ...(op.globals ? { globals: treeToSnap(op.globals) } : {}),
      };
    case 'entryCreate':
      return { ...op, entry: { ...op.entry, patch: graphToJSON(op.entry.patch) } };
    default:
      return op as unknown as WireOp;
  }
}

/** decode a wire op back to a live Op — fresh slot trees hydrated from
    the snaps, validated field by field. Null if the payload doesn't
    rebuild; the caller advances its sequence and applies nothing. */
export function opFromWire(w: WireOp): Op | null {
  switch (w.kind) {
    case 'addNode': {
      const g = graphFromJSON({ nodes: [w.node], edges: [] });
      const node = g?.nodes[0];
      return node ? ({ ...w, node } as unknown as Op) : null;
    }
    case 'replaceGraph': {
      const patch = graphFromJSON(w.patch);
      if (!patch) return null;
      if (w.globals && typeof w.globals === 'object') {
        const globals = globalSlots();
        applySnapOverlay(globals, w.globals as DialsSnap);
        return { ...w, patch, globals } as unknown as Op;
      }
      const { globals: _, ...rest } = w;
      return { ...rest, patch } as unknown as Op;
    }
    case 'entryCreate': {
      const entry = w.entry as { id: string; name: string; patch: unknown } | undefined;
      if (!entry || typeof entry.id !== 'string' || typeof entry.name !== 'string') return null;
      const patch: SubPatch | null = graphFromJSON(entry.patch);
      return patch ? ({ ...w, entry: { ...entry, patch } } as unknown as Op) : null;
    }
    default:
      return w as unknown as Op;
  }
}
