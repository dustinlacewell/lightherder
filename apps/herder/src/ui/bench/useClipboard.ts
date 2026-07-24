/* The whole patch through the clipboard, as JSON — the same dialect
   localStorage speaks, so a pasted patch is validated the same way.

   Media is the one thing localStorage's dialect doesn't have to carry
   (it lives in IndexedDB/mediaStore, addressed by node id) but the OS
   clipboard does: a pasted patch lands in a bench with no blob behind
   its media nodes unless the picture rides along in the JSON itself.
   So copy embeds each top-level media node's blob (or remote URL) as a
   data URI under its id; paste decodes those back into mediaStore
   before the graph goes live, keyed by the same ids replaceGraph keeps
   verbatim. */

import { useCallback } from 'react';
import { mediaPaths, patchFromJSON, patchToJSON, type Patch } from '../../patch';
import { libStore, loadStoredMedia, loadStoredMediaUrl, migrateEmbedded, storeMedia, storeMediaUrl } from '../../persist';
import { dispatch, gateMode, mirror } from '../../runtime';
import type { Bench } from './useBench';

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return res.blob();
}

/** each top-level media node's picture, as the clipboard carries it:
    a dropped file becomes a data URI, a remote URL rides as-is. A
    media node with neither (still on its stained glass) is omitted. */
async function mediaToJSON(nodeIds: string[]): Promise<Record<string, { data?: string; url?: string }>> {
  const out: Record<string, { data?: string; url?: string }> = {};
  for (const id of nodeIds) {
    const [blob, url] = await Promise.all([loadStoredMedia(id), loadStoredMediaUrl(id)]);
    if (blob) out[id] = { data: await blobToDataUrl(blob) };
    else if (url) out[id] = { url };
  }
  return out;
}

/** the reverse: decode each entry back into mediaStore/mediaUrlStore
    under its (verbatim, replaceGraph-preserved) node id */
async function mediaFromJSON(media: unknown): Promise<void> {
  if (!media || typeof media !== 'object') return;
  for (const [id, v] of Object.entries(media as Record<string, any>)) {
    if (!v || typeof v !== 'object') continue;
    if (typeof v.data === 'string') {
      try { await storeMedia(id, await dataUrlToBlob(v.data)); } catch { /* malformed data URI — skip */ }
    } else if (typeof v.url === 'string') {
      storeMediaUrl(id, v.url);
    }
  }
}

export function useClipboard(bench: Bench): { copyPatch: () => Promise<boolean>; pastePatch: () => Promise<boolean> } {
  const { root } = bench;

  const copyPatch = useCallback(async (): Promise<boolean> => {
    try {
      const p: Patch = { nodes: root().nodes, edges: root().edges, globals: mirror.globals };
      const media = await mediaToJSON(mediaPaths(root()));
      await navigator.clipboard.writeText(JSON.stringify({ ...patchToJSON(p), media }, null, 2));
      return true;
    } catch {
      return false;
    }
  }, [root]);

  const pastePatch = useCallback(async (): Promise<boolean> => {
    let p: Patch | null = null;
    let media: unknown;
    try {
      const raw = JSON.parse(await navigator.clipboard.readText());
      p = patchFromJSON(raw);
      media = raw?.media;
    } catch { return false; }
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
    /* the blobs land BEFORE the graph goes live — MediaSource reads
       loadStoredMedia/loadStoredMediaUrl exactly once, at construction,
       which the dispatch below triggers via compile. */
    await mediaFromJSON(media);
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
