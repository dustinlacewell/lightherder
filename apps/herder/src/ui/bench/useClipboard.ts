/* The whole patch through the clipboard, as JSON — the same dialect
   localStorage speaks, so a pasted patch is validated the same way. */

import { useCallback } from 'react';
import { patchFromJSON, patchToJSON, type Patch } from '../../patch';
import { libStore, migrateEmbedded } from '../../persist';
import { dispatch, gateMode, mirror } from '../../runtime';
import type { Bench } from './useBench';

export function useClipboard(bench: Bench): { copyPatch: () => Promise<boolean>; pastePatch: () => Promise<boolean> } {
  const { root } = bench;

  const copyPatch = useCallback(async (): Promise<boolean> => {
    try {
      const p: Patch = { nodes: root().nodes, edges: root().edges, globals: mirror.globals };
      await navigator.clipboard.writeText(JSON.stringify(patchToJSON(p), null, 2));
      return true;
    } catch {
      return false;
    }
  }, [root]);

  const pastePatch = useCallback(async (): Promise<boolean> => {
    let p: Patch | null = null;
    try { p = patchFromJSON(JSON.parse(await navigator.clipboard.readText())); } catch { return false; }
    if (!p) return false;
    const graph = { nodes: p.nodes, edges: p.edges };
    /* a read-only peer must not paste: ask the gate FIRST, before the
       migration mutates the live library, so a blocked paste leaves the
       shelf untouched (the gate fires its own denied cue). */
    if (gateMode({ kind: 'replaceGraph', patch: graph, globals: p.globals }) === 'block') return false;
    /* a pasted patch may be OLD-shape (embedded module innards) — the
       recovery flow for pre-migration backups pastes exactly that. Run
       the same one-time migration boot runs, BEFORE the graph goes live:
       without it the embedded module compiles as an orphan and the next
       debounced save would serialize its innards away for good. */
    if (migrateEmbedded(graph, libStore.doc)) libStore.touch();
    /* no cycle guard: paste is replaceGraph, which resets the drill to
       the root, where no ref path is open — a cycle can only form among
       ENTRIES drilled through one another, and paste never mutates one.
       The globals ride the op now (the applier applies + retunes them), so
       the wire reproduces the pasted standard on every peer. */
    dispatch({ kind: 'replaceGraph', patch: graph, globals: p.globals });
    return true;
  }, []);

  return { copyPatch, pastePatch };
}
