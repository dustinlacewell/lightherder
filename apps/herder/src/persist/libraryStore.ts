/* The library — promoted from a shelf of templates to the live
   definition store the whole app resolves module refs against.

   An entry's `patch` is a LIVE SubPatch: parsed once from JSON at load,
   held in memory, mutated in place by structural ops, and serialized
   back only on a debounced save. compile, drill projection and
   ModuleNode all reach an entry's structure through `resolve`, so one
   edit to an entry is felt by every instance of it on the next compile
   — that shared structure is the by-reference feature.

   The store is a module-level singleton with a useSyncExternalStore
   shape (version + subscribe), loaded at import time so it stands ready
   before the bench's boot compile runs. Components hook it to
   re-derive when an entry changes elsewhere; persistence rides the same
   `touch`. */

import { graphFromJSON, graphToJSON, type LibEntryDef, type LibraryDoc, type SubPatch } from '../patch';
import { dropStoredMediaUnder } from './mediaStore';

/** a stored entry IS a definition — a live patch, not a JSON blob */
export interface LibEntry extends LibEntryDef {}

const KEY = 'herder.library.v1';
const SAVE_DELAY = 400;

/* ---- localStorage adapter (internal) ---------------------------------- */

/** read the shelf, parsing each entry's patch to a live SubPatch — a
    hostile or stale entry that no longer parses is dropped. A shelf whose
    ids are not unique is repaired: see dedupeIds. */
function loadLibrary(): LibEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    const d = raw ? JSON.parse(raw) : null;
    if (!Array.isArray(d)) return [];
    const out: LibEntry[] = [];
    for (const e of d) {
      if (!e || typeof e.id !== 'string' || typeof e.name !== 'string') continue;
      const patch = graphFromJSON(e.patch);
      if (patch) out.push({ id: e.id, name: e.name, patch });
    }
    return dedupeIds(out);
  } catch {
    return [];
  }
}

/** Recover a shelf corrupted by a mint-time id collision.

    A pre-fix boot could mint two entries with the SAME id (a ~1/1296
    same-millisecond chance); resolve() is find-first, so every reference
    to the pair resolved to the first entry and the second's structure was
    shadowed — the "editing one loop changed the other" bug. The refs that
    pointed at the shared id can no longer be told apart (both name the same
    string; the shadowed entry's true owner is gone), so this cannot restore
    the original wiring. What it CAN do is stop the shadowing: keep the first
    entry under the colliding id, re-mint a fresh unique id for each later
    duplicate so it becomes visible and distinct on the shelf again, and warn
    so the loss is not silent. The instances still resolving to the first
    entry are the user's to re-point (or restore from the pre-migration
    backup); the recovered duplicates are at least no longer invisible. */
function dedupeIds(entries: LibEntry[]): LibEntry[] {
  const seen = new Set<string>();
  let repaired = 0;
  for (const e of entries) {
    if (!seen.has(e.id)) { seen.add(e.id); continue; }
    const original = e.id;
    do { e.id = `lib.${Date.now().toString(36)}${(dedupeSeq++).toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`; }
    while (seen.has(e.id));
    seen.add(e.id);
    repaired++;
    console.warn(`herder: recovered a duplicate library entry id "${original}" (re-minted "${e.id}", name "${e.name}"). ` +
      `A past id collision had made instances of it share one definition; the duplicate is now visible on the shelf again, ` +
      `but instances cannot be re-attributed automatically — restore herder.patch.v1.premigrate to recover the original wiring.`);
  }
  if (repaired) console.warn(`herder: repaired ${repaired} duplicate library entry id(s).`);
  return entries;
}

/** an in-session counter folded into re-minted ids so a same-millisecond
    burst of repairs never collides on the timestamp */
let dedupeSeq = 0;

/** serialize every entry's live patch back to the JSON dialect */
function saveLibrary(entries: LibEntry[]): void {
  try {
    const flat = entries.map(e => ({ id: e.id, name: e.name, patch: graphToJSON(e.patch) }));
    localStorage.setItem(KEY, JSON.stringify(flat));
  } catch { /* storage full — the shelf just doesn't persist */ }
}

/* ---- the live singleton ----------------------------------------------- */

interface LibStore {
  /** the object applyOp mutates — its entries array and their patches */
  doc: LibraryDoc;
  entries(): LibEntry[];
  /** the EntryResolver everyone hands to compile/drill/ModuleNode */
  resolve(id: string): SubPatch | null;
  version(): number;
  subscribe(fn: () => void): () => void;
  /** bump the version, notify subscribers, schedule a debounced save —
      the one call every library mutation ends with */
  touch(): void;
}

function makeStore(): LibStore {
  const doc: LibraryDoc = { entries: loadLibrary() };
  const subs = new Set<() => void>();
  let ver = 0;
  let saveTimer: ReturnType<typeof setTimeout> | null = null;

  const notify = () => { for (const fn of subs) fn(); };

  return {
    doc,
    entries: () => doc.entries as LibEntry[],
    resolve: id => doc.entries.find(e => e.id === id)?.patch ?? null,
    version: () => ver,
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
    touch() {
      ver++;
      /* notify off the current task so a touch mid-render (an op landing
         during React's commit) can't re-enter a render synchronously */
      queueMicrotask(notify);
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(() => { saveTimer = null; saveLibrary(doc.entries as LibEntry[]); }, SAVE_DELAY);
    },
  };
}

export const libStore = makeStore();

/** persist the shelf immediately, bypassing the debounce — the boot
    migration needs the minted entries on disk before the app can touch
    them again, with no timer left dangling into the first frame */
export function saveLibraryNow(): void {
  saveLibrary(libStore.doc.entries as LibEntry[]);
}

/** re-read the shelf from storage into the live doc, in place — a session
    Leave restores the peer's own library (localStorage was put back from
    the stash twin, so this reparses the peer's entries over the host's
    seeded ones), then touches so every subscriber re-derives. The doc
    object identity is kept; only its entries array is replaced. */
export function reloadLibrary(): void {
  const fresh = loadLibrary();
  libStore.doc.entries.length = 0;
  (libStore.doc.entries as LibEntry[]).push(...fresh);
  libStore.touch();
}

/** delete an entry's stored media (instances keep their copies) */
export function dropEntryMedia(entryId: string): void {
  dropStoredMediaUnder(entryId).catch(() => { /* best-effort */ });
}
