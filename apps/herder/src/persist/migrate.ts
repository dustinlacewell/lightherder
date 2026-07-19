/* The one-time embedded → by-reference migration.

   Before by-reference modules, a MODULE instance carried its whole patch
   inline (`data.patch`), copied by value on every drop. This walk folds
   every such embedded patch into a library entry and turns the instance
   into a reference — the shape the rest of the app now speaks. It runs
   once at boot, ahead of the first compile; a document with no `patch`
   fields (already migrated, or freshly built) passes through untouched,
   so re-running it mints nothing new.

   Two invariants it must not break, both probed headlessly against a real
   saved patch (see the scratchpad probe accompanying this stage):

     · every knob keeps its value. Embedded node values were the
       instance's, so they migrate wholesale onto the OUTERMOST instance's
       `vals` (flattened through any nesting) — the outermost frame wins in
       compile's merge, reproducing the old value exactly. An entry created
       here holds those same values as its DEFAULTS (for future drops), but
       the live instance's own `vals` are what ride.

     · every picture keeps showing. An embedded media node's blob already
       lives under its compiled id; the instance just gains a `media`
       marker so compile stamps that same key, and the blob is copied to
       the new entry's default key so future drops inherit the picture.

   Innermost-first: a nested embedded module is migrated to a ref (with its
   own vals) before its parent is, so by the time a parent mints its entry
   the entry's structure already speaks refs, and the nested instance's
   values lift up into the parent instance keyed one level deeper. */

import { mediaPaths, treeToSnap, type LibraryDoc, type SubPatch } from '../patch';
import type { InstVals } from '../patch';
import { copyStoredMedia } from './mediaStore';

/** the localStorage key holding the verbatim pre-migration document — a
    one-time safety net so the original always survives the conversion */
const PATCH_KEY = 'herder.patch.v1';
const BACKUP_KEY = 'herder.patch.v1.premigrate';

/** stash the current serialized patch under the backup key, once. If a
    backup already exists (a prior boot took it) the original is left
    exactly as it was — the pre-migration document must never be
    overwritten by an already-migrated one. */
export function backupPremigration(): void {
  try {
    if (localStorage.getItem(BACKUP_KEY) !== null) return;
    const raw = localStorage.getItem(PATCH_KEY);
    if (raw !== null) localStorage.setItem(BACKUP_KEY, raw);
  } catch { /* storage unavailable — no backup, nothing to migrate against either */ }
}

/* Mint a fresh entry id that no entry in `doc` already carries.

   The id is a timestamp plus two random base-36 digits — a 1296-value
   suffix. Two mints in the same millisecond therefore collide with
   p≈1/1296, and a boot migrating two sibling instances mints both in the
   same tick: a real, roughly one-in-a-thousand chance that both refs land
   on ONE id. resolve() is find-first, so a collision makes every instance
   of the pair resolve to the first entry — editing one edits the other,
   the second's true structure shadowed and lost. The guarantee that
   averts it is uniqueness, checked here: loop until the minted id is
   absent from doc.entries (the running mint set AND any pre-existing shelf
   entry), and only then hand it back. A monotonic counter breaks the
   same-millisecond tie the timestamp can't. */
function mintEntryId(doc: LibraryDoc): string {
  for (;;) {
    const id = `lib.${Date.now().toString(36)}${(mintSeq++).toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
    if (!doc.entries.some(e => e.id === id)) return id;
  }
}

/** an in-session counter folded into every minted id, so two mints in the
    same millisecond never share a suffix even before the uniqueness check */
let mintSeq = 0;

/** fold every embedded `patch` in the root tree AND in every existing
    library entry into by-reference modules, minting one entry per embedded
    instance. Returns whether anything changed (so the caller can persist).
    Idempotent by construction: a migrated node carries no `patch`. */
export function migrateEmbedded(root: SubPatch, doc: LibraryDoc): boolean {
  let changed = false;

  const walk = (level: SubPatch, mediaPrefix: string): void => {
    for (const n of level.nodes) {
      if (n.type !== 'module' || !n.data.patch) continue;
      const embedded = n.data.patch;
      /* innermost-first: migrate the embedded patch's own nested modules
         to refs before minting this one, so the entry's structure already
         speaks refs and a nested instance's values lift into this one */
      walk(embedded, mediaPrefix + n.id + '/');

      const id = mintEntryId(doc);
      doc.entries.push({ id, name: n.data.name, patch: embedded });
      n.data.ref = id;
      const vals = (n.data.vals ??= {});
      /* the embedded values were this instance's own — copy them wholesale
         onto the outermost instance, flattened through any nesting, so the
         outermost frame wins in compile's merge and the knob is unmoved */
      collectVals(embedded, '', vals);
      /* each embedded media node's blob already lives under its compiled
         id (mediaPrefix + n.id + '/' + rel). Mark the instance override so
         compile stamps that same key, and seed the entry's default blob so
         a future drop of the entry shows the picture. */
      for (const rel of mediaPaths(embedded)) {
        (vals[rel] ??= { slots: {} }).media = true;
        void copyStoredMedia(mediaPrefix + n.id + '/' + rel, id + '/' + rel);
      }
      delete n.data.patch;
      changed = true;
    }
  };

  walk(root, '');
  /* library entries too: a pre-migration "save here" could bake an
     embedded module into an entry, and those never self-heal otherwise.
     An embedded module inside entry E becomes a ref to a fresh entry E2;
     its values become E's nested-init defaults (E2's defaults are the same
     values), and its media copies from E's key space into E2's. */
  for (const e of [...doc.entries]) migrateEntry(e.patch, e.id, doc, () => { changed = true; });

  return changed;
}

/* walk one level collecting every non-module node's value into `out`,
   keyed by the node's path relative to the instance. A nested module is,
   after the innermost-first pass, a ref carrying its own migrated vals —
   those lift up here, re-keyed one level deeper, so a single instance owns
   the whole flattened value set. */
function collectVals(level: SubPatch, rel: string, out: Record<string, InstVals>): void {
  for (const n of level.nodes) {
    if (n.type === 'module') {
      if (n.data.vals)
        for (const [k, iv] of Object.entries(n.data.vals)) out[rel + n.id + '/' + k] = cloneVals(iv);
    } else {
      out[rel + n.id] = { slots: treeToSnap(n.data.slots), sel: n.data.sel };
    }
  }
}

function cloneVals(iv: InstVals): InstVals {
  const out: InstVals = { slots: structuredClone(iv.slots) };
  if (iv.sel !== undefined) out.sel = iv.sel;
  if (iv.media) out.media = true;
  return out;
}

/* migrate the embedded modules baked into a library entry. Here there is
   no live instance — the entry defines defaults — so an embedded module
   becomes a ref whose migrated `vals` sit on the (now-ref) module node as
   the entry's nested-init defaults, and its media copies from the entry's
   own key space into the freshly minted entry's. */
function migrateEntry(level: SubPatch, entryKey: string, doc: LibraryDoc, mark: () => void): void {
  for (const n of level.nodes) {
    if (n.type !== 'module' || !n.data.patch) continue;
    const embedded = n.data.patch;
    migrateEntry(embedded, entryKey + '/' + n.id, doc, mark);
    const id = mintEntryId(doc);
    doc.entries.push({ id, name: n.data.name, patch: embedded });
    n.data.ref = id;
    const vals = (n.data.vals ??= {});
    collectVals(embedded, '', vals);
    for (const rel of mediaPaths(embedded)) {
      (vals[rel] ??= { slots: {} }).media = true;
      void copyStoredMedia(entryKey + '/' + n.id + '/' + rel, id + '/' + rel);
    }
    delete n.data.patch;
    mark();
  }
}
