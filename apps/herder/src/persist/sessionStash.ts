/* The session stash — a peer's pre-session bench, held aside for the
   length of a join and returned intact when the session ends.

   The physics this exists for: joining a room REPLACES your bench with
   the host's, live-swapped through the same rebuild the boot path uses.
   That is destructive — the peer's own patch, library and media are
   overwritten in place so the engine can run the host's document. The
   stash is the twin of that overwrite: before the swap, the peer's two
   localStorage documents are copied to `.sessionstash` sibling keys and
   every media blob it owns is copied to a `stash/<key>` shadow in
   IndexedDB. On Leave (or, if the tab died mid-session, at the next
   boot) the stash is copied back over the session's imports and dropped,
   and the peer is exactly where it left off.

   The blob enumeration is the subtle part. A bench's live media keys are
   NOT recoverable from the stored patch JSON alone — an instance's media
   override rides under its compiled id, and an entry default under
   "<entryId>/<path>", both of which only the COMPILE pass names. So the
   honest source is a compile of the stored root against the live library
   (the same two key spaces session/blobKeys walks), computed here rather
   than reaching up into the runtime mirror — persist/ stays a leaf. */

import { compile, mediaPaths, patchFromJSON, type PatchNode, type SubPatch } from '../patch';
import { copyStoredMedia, dropStoredMediaUnder, listStoredMedia } from './mediaStore';
import { libStore } from './libraryStore';

const PATCH_KEY = 'herder.patch.v1';
const LIB_KEY = 'herder.library.v1';
const STASH_SUFFIX = '.sessionstash';
const STASH_PREFIX = 'stash/';

/* ---- the two document twins (localStorage) ---------------------------- */

/** copy `herder.patch.v1` + `herder.library.v1` to their `.sessionstash`
    twins. A missing source leaves no twin (nothing to restore).

    One-time guard (the backupPremigration precedent): a stash already
    present is NEVER overwritten. A rejoin without a preceding Leave would
    otherwise stash the SESSION document over the peer's original, losing the
    real pre-session bench forever. While a stash stands, the peer's own doc
    is already parked; a second stash can only be the session's, so we refuse
    it and keep the first. */
export function stashDocs(): void {
  if (hasStash()) return;
  copyKey(PATCH_KEY);
  copyKey(LIB_KEY);
}

/** copy the twins back over the live keys — the pre-session documents
    return. A twin the stash never wrote is left alone. */
export function restoreDocs(): void {
  restoreKey(PATCH_KEY);
  restoreKey(LIB_KEY);
}

/** is there a stash to restore? True after stashDocs, until dropStash —
    at boot it means a tab died mid-session. */
export function hasStash(): boolean {
  try { return localStorage.getItem(PATCH_KEY + STASH_SUFFIX) !== null; }
  catch { return false; }
}

/** drop both twins — the stash has been restored (or discarded). */
export function dropStash(): void {
  try { localStorage.removeItem(PATCH_KEY + STASH_SUFFIX); } catch { /* gone */ }
  try { localStorage.removeItem(LIB_KEY + STASH_SUFFIX); } catch { /* gone */ }
}

function copyKey(key: string): void {
  try {
    const v = localStorage.getItem(key);
    if (v !== null) localStorage.setItem(key + STASH_SUFFIX, v);
    else localStorage.removeItem(key + STASH_SUFFIX);   // no source → no stale twin
  } catch { /* storage full / denied — the stash just doesn't persist */ }
}

function restoreKey(key: string): void {
  try {
    const v = localStorage.getItem(key + STASH_SUFFIX);
    if (v !== null) localStorage.setItem(key, v);
  } catch { /* gone */ }
}

/* ---- the media blobs (IndexedDB) -------------------------------------- */

/** every media key a stored patch owns, across both key spaces — the
    compiled live keys (media/draw nodes, instance overrides included) and
    every library entry's defaults. Computed by compiling the stored root
    against the live library, so the answer matches exactly what the
    running bench read. A null root (nothing stored) yields the library
    defaults alone. */
function stashedMediaKeys(): string[] {
  const patch = readPatch();
  const nodes: PatchNode[] = patch ? compile(patch, libStore.resolve).nodes : [];
  const entries = libStore.doc.entries as { id: string; patch: SubPatch }[];
  const keys = new Set<string>();
  for (const n of nodes) {
    if (n.type === 'media') keys.add(n.data.mediaKey ?? n.id);
    else if (n.type === 'draw') keys.add(n.id);
  }
  for (const e of entries)
    for (const rel of mediaPaths(e.patch)) keys.add(e.id + '/' + rel);
  return [...keys];
}

/** copy every current media blob to its `stash/<key>` shadow — the twin
    of the document stash, in IndexedDB. Awaited so the join's own drops
    (which run next) can't race the copies. */
export async function stashMedia(): Promise<void> {
  await Promise.all(stashedMediaKeys().map(k => copyStoredMedia(k, 'stash/' + k)));
}

/** copy the shadows back over the live keys and drop the shadows — the
    pre-session pictures return. The keys are enumerated from IndexedDB by
    the `stash/` prefix itself, NOT recomputed from any document: whatever
    stashMedia wrote is exactly what comes back, so no ordering dance with
    the library reload can leave the enumeration reading the wrong doc. Each
    shadow `stash/<key>` copies back to its bare `<key>` (prefix stripped),
    then all shadows are dropped. */
export async function restoreMedia(): Promise<void> {
  const shadows = await listStoredMedia(STASH_PREFIX.slice(0, -1));   // "stash", scan covers "stash/…"
  await Promise.all(shadows.map(s => copyStoredMedia(s, s.slice(STASH_PREFIX.length))));
  await Promise.all(shadows.map(s => dropStoredMediaUnder(s)));
}

function readPatch(): SubPatch | null {
  try {
    const raw = localStorage.getItem(PATCH_KEY);
    const p = raw ? patchFromJSON(JSON.parse(raw)) : null;
    return p ? { nodes: p.nodes, edges: p.edges } : null;
  } catch { return null; }
}
