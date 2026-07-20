/* Copy/paste of a SELECTION — Ctrl+C / Ctrl+V on one or more selected
   nodes, distinct from useClipboard's whole-patch JSON (that one goes
   through the OS clipboard and the util-bar buttons; this one is an
   in-memory snapshot, since a partial paste needs live node data
   (cloneTree, not a JSON round-trip) and never touches the OS
   clipboard's plain-text contract).

   Lands through the same record()/rf.setNodes choke point useSpawn's
   land() uses: mint every id against a single growing local list
   (paste can drop many nodes in one gesture), append functionally,
   then record an addNode/connect op per node/edge so the op stream
   carries every one of them, exactly as a spawn would. */

import { useCallback, useRef } from 'react';
import { useReactFlow } from '@xyflow/react';
import { cloneTree, makeEdge, mintNodeId, type PatchEdge, type PatchNode } from '../../patch';
import { dispatch, gateMode, record } from '../../runtime';
import type { BenchEdge, BenchNode } from './types';
import type { Bench } from './useBench';

const DOC_ROOT = { kind: 'doc' as const, path: [] as string[] };

/** would pasting be denied? Asks the gate with a representative addNode,
    exactly as useSpawn's spawnBlocked does — the gate decides by role,
    not op kind, so one probe covers the whole paste. */
function pasteBlocked(): boolean {
  const node = { id: '', type: 'in', position: { x: 0, y: 0 }, data: {} } as unknown as PatchNode;
  return gateMode({ kind: 'addNode', scope: DOC_ROOT, node }) === 'block';
}

const PASTE_OFFSET = 40;

export function useSelectionClipboard(bench: Bench): { copySelection: () => void; pasteSelection: () => void } {
  const { prefix, strip, setNodes, bumpDoc } = bench;
  const rf = useReactFlow();
  /* the clipboard is local-id shaped (never the compiled/prefixed ids),
     so a copy from one drill level pastes sanely if the user has since
     drilled elsewhere */
  const clip = useRef<{ nodes: PatchNode[]; edges: PatchEdge[] } | null>(null);

  const copySelection = useCallback((): void => {
    const selectedIds = new Set(rf.getNodes().filter(n => n.selected).map(n => n.id));
    if (selectedIds.size === 0) return;
    const nodes = (rf.getNodes() as BenchNode[])
      .filter(n => selectedIds.has(n.id))
      .map(n => ({ ...n, id: strip(n.id) })) as PatchNode[];
    const edges = (rf.getEdges() as BenchEdge[])
      .filter(e => selectedIds.has(e.source) && selectedIds.has(e.target))
      .map(e => ({ ...e, id: strip(e.id), source: strip(e.source), target: strip(e.target) }));
    clip.current = { nodes, edges };
  }, [rf, strip]);

  const pasteSelection = useCallback((): void => {
    if (!clip.current || clip.current.nodes.length === 0) return;
    if (pasteBlocked()) return;
    const locals = rf.getNodes().map(n => ({ ...n, id: strip(n.id) })) as PatchNode[];

    /* mint every new id against the SAME growing list — two pasted
       nodes must never collide, so each mint folds its result back in
       before the next */
    const idMap = new Map<string, string>();
    const pool = [...locals];
    for (const n of clip.current.nodes) {
      const id = mintNodeId(pool);
      idMap.set(n.id, id);
      pool.push({ ...n, id });
    }

    const compiledNodes: BenchNode[] = clip.current.nodes.map(n => ({
      ...n,
      id: prefix + idMap.get(n.id)!,
      position: { x: n.position.x + PASTE_OFFSET, y: n.position.y + PASTE_OFFSET },
      data: { ...n.data, slots: cloneTree(n.data.slots) },
    }) as BenchNode);

    /* nodes land the addNode way (apply-first through the CONTROLLED
       setter, then record — see useSpawn's land()); the pasted selection
       replaces whatever was selected before, so the new nodes read as
       "what just landed" */
    setNodes(ns => [
      ...ns.map(n => ({ ...n, selected: false })),
      ...compiledNodes.map(n => ({ ...n, selected: true })),
    ]);
    for (const n of compiledNodes) record({ kind: 'addNode', scope: DOC_ROOT, node: n });
    /* record() applies nothing — one bump lands the whole batch in the
       mirror (a paste of unwired nodes has no connect below to do it) */
    bumpDoc();

    /* edges land the onConnect way: dispatch applies through the
       applier itself (setEdges + the doc write) — unlike addNode there
       is no existing "RF already applied" path for a wire */
    for (const e of clip.current.edges) {
      dispatch({
        kind: 'connect', scope: DOC_ROOT,
        edge: makeEdge(prefix + idMap.get(e.source)!, e.sourceHandle, prefix + idMap.get(e.target)!, e.targetHandle),
      });
    }
  }, [rf, prefix, strip, setNodes, bumpDoc]);

  return { copySelection, pasteSelection };
}
