/* The join snapshot — how a peer's bench becomes the host's, and how the
   host serves the picture that makes it so.

   Two halves of one hand-off:

     · HOST assembly + send. One synchronous pass captures the consistent
       document picture — the graph, the globals, the library, the pin,
       the freeze, stamped with the current op sequence — so nothing the
       host does after can tear it. Then, asynchronously, the blobs: a
       live draw surface is snapshotted fresh (its PNG is only as recent
       as the last pointer-up otherwise), everything else read from store.
       The snap goes first (targeted), then each blob (targeted, with its
       {key, mime}); the peer's seq baseline aligns the two channels.

     · PEER apply — the live-swap. Joining REPLACES the peer's bench with
       the host's, and the one real hazard is IndexedDB key collision: a
       node id shared between the peer's old bench and the host's, where
       the engine's fire-and-forget media drop could delete a blob the
       host just sent. The seven-step sequence below is engineered around
       that: stash the old bench, tear it down, drop the old keys behind a
       macrotask barrier, THEN store every snapshot blob, and only THEN
       rebuild — because the source constructors (MediaSource/DrawSource)
       read loadStoredMedia exactly once, at construction. Store after the
       rebuild and the picture would be a frame late or missing entirely. */

import { graphFromJSON, graphToJSON, type SubPatch } from '../patch';
import {
  dropStoredMediaUnder, hasStash, loadPatch, loadStoredMedia,
  reloadLibrary, restoreDocs, restoreMedia, storeMedia,
  stashDocs, stashMedia, dropStash, libStore,
} from '../persist';
import { engineRef, mirror, stage, transport } from '../runtime';
import { mediaKeysOf } from './blobKeys';
import { sessionStore } from './store';
import type { Live } from './live';
import type { SnapMsg } from './protocol';

/* ---- host: assemble and serve the snapshot ---------------------------- */

/** the library as the snapshot carries it — each entry's structure as
    JSON, its media following on the blob channel */
function entriesJSON(): SnapMsg['entries'] {
  return libStore.doc.entries.map(e => ({ id: e.id, name: e.name, patch: graphToJSON(e.patch) }));
}

/** assemble the consistent document picture in one synchronous pass, then
    stream it to `target`: the snap first, then every existing blob. The
    peer buffers ops from connect and replays those past `snap.seq`, so the
    seq stamped here is the alignment point between the two channels. */
export async function sendSnapshot(l: Live, target: string): Promise<void> {
  /* the synchronous consistent point — stamped with the live seq. Reading
     graphToJSON/globals/pin/frozen in one pass means no host edit can land
     between the fields and leave the picture internally torn. */
  const snap: SnapMsg = {
    seq: l.seq,
    patch: graphToJSON(l.deps.root()),
    globals: { ...mirror.globals },
    entries: entriesJSON(),
    pin: stage.preview.nodeId,
    frozen: transport.frozen,
    blobKeys: mediaKeysOf(mirror.nodes, libStore.doc.entries),
  };
  await l.room.actions.snap.send(snap, target);

  /* live draw surfaces are snapshotted fresh; everything else is read from
     store. A draw node's key IS its id, so the mirror's draw ids name the
     surfaces to promise. */
  const drawIds = new Set(mirror.nodes.filter(n => n.type === 'draw').map(n => n.id));
  for (const key of snap.blobKeys) {
    const blob = drawIds.has(key)
      ? await engineRef.current?.drawFor(key).snapshot() ?? null
      : await loadStoredMedia(key);
    if (!blob) continue;   // no picture stored (the media node on its stained glass) — skip
    await l.room.actions.blob.send(blob, { key, mime: blob.type || 'application/octet-stream' }, target);
  }
}

/* ---- peer: the live-swap join ----------------------------------------- */

/** one received blob, held until the rebuild that will read it back */
export interface HeldBlob { blob: Blob; mime: string }

/** the seven-step live-swap. Runs once the peer has collected every
    announced blob (or the collection timed out — a missing blob degrades
    the picture, never breaks the join). `blobs` is keyed by the same keys
    `snap.blobKeys` named; a key absent from it is a blob that never
    arrived, and its source simply falls back to its stained glass.

    The ordering is the whole point — see the file header. Every await here
    is load-bearing: skip the barrier and a colliding old key's async drop
    can outlive the new store; store after the rebuild and the constructors
    have already read black. */
export async function applyJoin(l: Live, snap: SnapMsg, blobs: Map<string, HeldBlob>): Promise<void> {
  /* the peer's own media keys BEFORE the swap — every blob the old bench
     owns, so step 3 can drop exactly them (idempotent with the engine's
     own per-node drops, but reaching keys the released nodes might not). */
  const oldKeys = mediaKeysOf(mirror.nodes, libStore.doc.entries);

  /* 1 · stash the pre-session bench (docs + media), awaited — Leave (or a
        post-crash boot) copies it back over the session's imports. ONE-TIME:
        a stash already standing is the peer's ORIGINAL bench (a prior join
        that never reached Leave — e.g. a host-drop to 'ended' then a fresh
        rejoin). Re-stashing now would park the SESSION document over that
        original and lose it forever, so skip when a stash exists — the twin
        of stashDocs's own guard, covering the media half too. */
  if (!hasStash()) {
    stashDocs();
    await stashMedia();
  }

  /* 2 · release every old node — rebuild to an empty bench drops every
        ring, face, gesture and (fire-and-forget) stored blob. */
  l.deps.rebuild({ nodes: [], edges: [] });

  /* 3 · drop the old keys ourselves (belt to the engine's fire-and-forget
        drops), then one macrotask — a barrier over IndexedDB transaction
        ordering so a lingering delete can't reach a key step 4 just wrote.
        THIS is the collision guard: a node id shared between the peer's old
        bench and the host's would otherwise lose the host's blob here. */
  await Promise.all(oldKeys.map(k => dropStoredMediaUnder(k)));
  await new Promise<void>(r => setTimeout(r, 50));

  /* 4 · store every snapshot blob — BEFORE any source is constructed. The
        MediaSource/DrawSource constructors read loadStoredMedia exactly
        once, at construction (step 6's rebuild), so the blobs must be on
        disk first. A blob that never arrived is simply skipped. */
  await Promise.all([...blobs].map(([key, b]) => storeMedia(key, b.blob)));

  /* 5 · seed the library with the host's entries and touch it, so compile
        (step 6) resolves the host's refs and every ModuleNode re-derives. */
  const entries = snap.entries
    .map(e => ({ id: e.id, name: e.name, patch: graphFromJSON(e.patch) }))
    .filter((e): e is { id: string; name: string; patch: SubPatch } => e.patch !== null);
  libStore.doc.entries.length = 0;
  libStore.doc.entries.push(...entries);
  libStore.touch();

  /* 6 · adopt the host's globals, resolution, freeze and pin, then rebuild
        the graph — the swap. globals/res BEFORE the rebuild so the first
        compile paces itself by the host's standard. */
  mirror.globals = { ...snap.globals };
  engineRef.current?.setResolution(snap.globals.res);
  transport.frozen = snap.frozen;
  sessionStore.set({ remotePin: snap.pin });
  const root = graphFromJSON(snap.patch) ?? { nodes: [], edges: [] };
  l.deps.rebuild(root);

  /* 7 · live. The peer's seq baseline is the snapshot's seq: the op buffer
        (peer.ts) replays everything past it in order, so an op that raced
        the snapshot lands exactly once. */
  l.seq = snap.seq;
  sessionStore.set({ phase: 'live', progress: undefined, relayNote: undefined });
}

/* ---- peer: restore the pre-session bench ------------------------------ */

/** put the peer's own bench back — the exact reverse of applyJoin, run on
    Leave (or a host-drop after the swap). The order is applyJoin's own
    choreography, run backwards: RELEASE the session bench before restoring
    the peer's blobs, with a macrotask barrier between, because the same
    "release before restore" physics that governs the join governs the
    undo. This is the twin of applyJoin — read its step 2/3 comment first.

    The hazard is identical and symmetric: `deps.rebuild` releasing the
    session's mirror nodes makes engine.dropNode fire-and-forget
    `dropStoredMediaUnder(id)` for each. Session and peer benches near-
    certainly share compiled ids (both mint n1, n2, …), so if those async
    deletes fire AFTER the stash copy-back, they delete the peer's just-
    restored blobs wherever the ids collide. So we rebuild to EMPTY first
    (the deletes fire against session state), drain our own drops for the
    session keys, cross one setTimeout barrier, and only THEN copy the peer's
    shadows back — nothing left in flight can reach them.

    `swapped` is false when the swap never ran (the host dropped mid-collect,
    before applyJoin): the live bench is untouched, so only the stash twins
    and shadows need clearing — no rebuild, no key surgery. */
export async function restorePeerBench(l: Live, swapped: boolean): Promise<void> {
  if (!swapped) {
    /* nothing was imported and nothing swapped — the peer's own bench
       (docs, media, mirror) is exactly as it was. Shed the stash: copying
       the shadows back over their unchanged originals is a no-op, and
       restoreMedia drops the shadows afterward; then the doc twins go. */
    await restoreMedia();
    dropStash();
    return;
  }

  /* the session's current keys (what the swap imported) — dropped so the
     restored bench doesn't inherit the host's blobs, and enumerated NOW
     while the session document is still live in the mirror. */
  const sessionKeys = mediaKeysOf(mirror.nodes, libStore.doc.entries);

  /* release the session bench FIRST — rebuild to empty drops every ring,
     face and (fire-and-forget) stored blob, so the engine's per-node deletes
     fire against session state, before any peer blob is on disk. */
  l.deps.rebuild({ nodes: [], edges: [] });

  /* drain our own drops for the session keys (belt to the engine's fire-and-
     forget), then one macrotask barrier over IDB transaction ordering — the
     same guard applyJoin uses, so a lingering session delete can't reach a
     peer key the copy-back is about to write. */
  await Promise.all(sessionKeys.map(k => dropStoredMediaUnder(k)));
  await new Promise<void>(r => setTimeout(r, 50));

  /* now the peer's own documents and library return, and the stash shadows
     copy back over the peer's keys (restoreMedia enumerates the `stash/`
     prefix from IDB, so no key list from either document is needed). */
  restoreDocs();
  reloadLibrary();
  await restoreMedia();

  /* rebuild the graph from the restored patch — the constructors read the
     peer's pictures, which are now safely back on disk. */
  const patch = loadPatch() ?? { nodes: [], edges: [], globals: { ...mirror.globals } };
  mirror.globals = patch.globals;
  engineRef.current?.setResolution(patch.globals.res);
  l.deps.rebuild({ nodes: patch.nodes, edges: patch.edges });

  dropStash();
}

/** the host dropped while we were still COLLECTING (before applyJoin) —
    the bench was never swapped, so restore is the cheap path. Leave runs
    the full restorePeerBench(l, true) after a completed swap. */
export function abortJoin(l: Live): void {
  void restorePeerBench(l, false);
  sessionStore.set({ phase: 'ended', progress: undefined });
}
