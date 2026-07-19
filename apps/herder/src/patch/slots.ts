/* Slot-tree helpers shared by the op appliers, compile, and JSON.

   A param's value now lives on a dials `Slot`, and a modulated param's
   sub-params are themselves slots on the attached source — a tree. Two
   things every layer needs:

     - RESOLVE a slot by its path ("zoom" | "zoom/freq") within a node's
       live tree, walking `slots[first]` then `attached.params[next]`…
     - CONVERT a live tree to/from the serializable `DialsSnap` at the
       edges (JSON, the compiled-instance overlays), re-instantiating
       sources by registry name on the way back.

   dials owns the per-slot primitives (setDial/attach/detach/…, toJSON/
   fromJSON, cloneSlot); this module is the herder-side glue that speaks
   in slot PATHS and in whole-tree snap overlays. */

import {
  attachFrom, cloneSlot, detach, fromJSON, getSource, setDepth, setDial, setMode, toJSON,
  type Dials, type DialsSnap, type Slot, type SlotSnap,
} from '@ldlework/dials';
import { slotFor, type ParamDef } from './params';

/** the slot a path names within a node's live tree, or null if the
    path walks through an unattached source (a stale sub-param key) */
export function resolveSlot(slots: Dials, key: string): Slot<unknown> | null {
  const parts = key.split('/');
  let slot = slots[parts[0]] as Slot<unknown> | undefined;
  for (let i = 1; i < parts.length && slot; i++) {
    slot = slot.attached?.params[parts[i]] as Slot<unknown> | undefined;
  }
  return slot ?? null;
}

/** snapshot one live slot subtree (delegates to dials via a 1-key
    record) — used to seed an instance overlay from a live slot */
export function slotToSnap(slot: Slot<unknown>): SlotSnap {
  return toJSON({ _: slot })._;
}

/** hydrate a fresh default slot for `def`, then apply a snap onto it —
    used when an overlay carries a whole modulated subtree. Missing
    sources drop (host loads stale/foreign overlays). */
export function slotFromSnap(def: ParamDef, snap: SlotSnap): Slot<number> {
  const slot = slotFor(def);
  fromJSON({ _: slot }, { _: snap }, { onMissingSource: 'drop' });
  return slot;
}

/** apply a DialsSnap overlay onto a live tree in place (hydrate over
    defaults). Keys absent from the snap keep their current slots; the
    snap's own missing sources drop rather than throw. */
export function applySnapOverlay(slots: Dials, snap: DialsSnap): void {
  fromJSON(slots, snap, { onMissingSource: 'drop' });
}

/** a live tree as a snap — the serialization edge */
export function treeToSnap(slots: Dials): DialsSnap {
  return toJSON(slots);
}

/** clone a whole node's slot tree (fresh sources per instance) — the
    compile-time materialization that used to be `{ ...data.v }` */
export function cloneTree(slots: Dials): Dials {
  const out: Dials = {};
  for (const k in slots) out[k] = cloneSlot(slots[k] as Slot<unknown>);
  return out;
}

/** apply a value/slot op's mutation to a live slot tree by path — the
    shared body of the applier routers that patch the compiled MIRROR
    slot (the fresh-under-a-ref node the tree↔mirror aliasing never
    reaches). Mirrors the ops.ts no-rel appliers exactly, on a given
    tree instead of the document node. Silently no-ops if the path or a
    named source doesn't resolve. */
export function applySlotOp(
  slots: Dials,
  op:
    | { kind: 'setParam'; key: string; v: number }
    | { kind: 'slotAttach'; key: string; source: string | null }
    | { kind: 'slotDepth'; key: string; depth: number }
    | { kind: 'slotMode'; key: string; mode: 'center' | 'up' | 'down' },
): void {
  const s = resolveSlot(slots, op.key);
  if (!s) return;
  switch (op.kind) {
    case 'setParam': setDial(s, op.v); return;
    case 'slotDepth': setDepth(s, op.depth); return;
    case 'slotMode': setMode(s, op.mode); return;
    case 'slotAttach': {
      if (!op.source) { detach(s); return; }
      if (s.attached?.def.name === op.source) return;
      const def = getSource(op.source);
      if (def) { detach(s); attachFrom(s, def); }
      return;
    }
  }
}
