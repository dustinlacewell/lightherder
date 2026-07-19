/* New devices land on the level being viewed: ids are minted against
   the level's LOCAL ids, then wear the drill prefix in the view.

   A library entry drops as a MODULE instance that is nothing but a
   REFERENCE — its `ref` names the entry, its `vals` start empty, and no
   structure or media is copied. Editing the entry later moves this
   instance with it; that sharing is the feature. A toolbar-spawned
   module has no entry yet, so it mints an empty one first and drops a
   reference to that — one module shape, always by reference. */

import { useCallback } from 'react';
import { useReactFlow } from '@xyflow/react';
import { makeNode, refClosure, type MakeOpts, type NodeKind, type PatchNode } from '../../patch';
import { dispatch, gateMode, record } from '../../runtime';
import { libStore, type LibEntry } from '../../persist';
import type { BenchNode } from './types';
import type { Bench } from './useBench';

/* a placeholder scope on a recorded op — record()'s canonicalize-only
   applier pass rebuilds the scope from the op's compiled id, so this
   value is never read; it only satisfies the Op union's shape. */
const DOC_ROOT = { kind: 'doc' as const, path: [] as string[] };

/* a spawn lands through record()/rf.setNodes — the RF-already-applied
   path, which never consults the gate. A read-only peer would slip a node
   through there, so every spawn entry point asks the gate FIRST with a
   representative addNode op (the gate decides by role, not op kind) and
   bails on block — the gate fires the denied cue. Returns true when blocked. */
function spawnBlocked(): boolean {
  const node = { id: '', type: 'in', position: { x: 0, y: 0 }, data: {} } as unknown as PatchNode;
  return gateMode({ kind: 'addNode', scope: DOC_ROOT, node }) === 'block';
}

/** would dropping entry `entryId` here close a loop? Reject when the
    drill path passes through the entry itself, or through any entry the
    entry transitively contains — either way the drop would nest an entry
    inside its own descendant, and compile would spin. */
function wouldCycle(path: Bench['path'], entryId: string): boolean {
  const closure = refClosure(libStore.resolve, entryId);
  return path.some(c => c.entry !== undefined && (c.entry.id === entryId || closure.has(c.entry.id)));
}

export function useSpawn(bench: Bench): {
  spawn: (kind: NodeKind, opts: MakeOpts, sx: number, sy: number) => void;
  dropLib: (entry: LibEntry, sx: number, sy: number) => void;
} {
  const { prefix, strip, path } = bench;
  const rf = useReactFlow();

  /* mint the id against a synchronous read, then append functionally —
     the updater queue means minting INSIDE setNodes would leave nothing
     to record (the updater hasn't run when this function returns), and
     the op stream must carry every spawn. Two spawns in one task could
     in principle collide on an id, but no UI flow produces that. The
     recorded op is addressed by COMPILED id (the prefixed node RF holds);
     record()'s canonicalize-only pass routes it — an { entry } scope when
     the viewed level is a library entry, a { doc, path } otherwise. */
  const land = useCallback((mint: (locals: PatchNode[]) => PatchNode): void => {
    const locals = rf.getNodes().map(n => ({ ...n, id: strip(n.id) })) as PatchNode[];
    const n = mint(locals);
    const compiled = { ...n, id: prefix + n.id };
    rf.setNodes(ns => [...ns, compiled as BenchNode]);
    record({ kind: 'addNode', scope: DOC_ROOT, node: compiled });
  }, [rf, prefix, strip]);

  /* a plain device lands on the viewed level. A MODULE is special: it
     mints an empty library entry named after the node and drops a
     reference to it, so a toolbar module is by-reference like every
     other — there is no second, embedded module shape. */
  const spawn = useCallback((kind: NodeKind, opts: MakeOpts, sx: number, sy: number) => {
    /* the record()/setNodes spawn path never hits the gate — ask it here
       so a read-only peer's spawn is denied before anything lands (a
       module spawn must be blocked BEFORE its entryCreate, so no orphan
       entry is minted). */
    if (spawnBlocked()) return;
    const p = rf.screenToFlowPosition({ x: sx, y: sy });
    if (kind === 'module') {
      const locals = rf.getNodes().map(n => ({ ...n, id: strip(n.id) })) as PatchNode[];
      const n = makeNode('module', p.x - 105, p.y - 16, locals);
      const id = `lib.${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
      dispatch({ kind: 'entryCreate', entry: { id, name: n.data.name, patch: { nodes: [], edges: [] } } });
      n.data.ref = id;
      n.data.vals = {};
      const compiled = { ...n, id: prefix + n.id };
      rf.setNodes(ns => [...ns, compiled as BenchNode]);
      record({ kind: 'addNode', scope: DOC_ROOT, node: compiled });
      return;
    }
    land(locals => makeNode(kind, p.x - 105, p.y - 16, locals, opts));
  }, [rf, land, prefix, strip]);

  /* a library entry drops as a reference — no instantiate, no media copy,
     no await. The cycle guard runs first: nesting an entry inside its own
     descendant would loop the compile. */
  const dropLib = useCallback((entry: LibEntry, sx: number, sy: number) => {
    if (spawnBlocked()) return;   // read-only peer: deny the drop, cue the pill
    if (wouldCycle(path, entry.id)) return;
    const p = rf.screenToFlowPosition({ x: sx, y: sy });
    land(locals => {
      const n = makeNode('module', p.x - 105, p.y - 16, locals);
      n.data.name = entry.name;
      n.data.ref = entry.id;
      n.data.vals = {};
      return n;
    });
  }, [rf, land, path]);

  return { spawn, dropLib };
}
