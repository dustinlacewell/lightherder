/* Boot: the saved bench, or the full piece. Runs once at module load,
   before the first render — the mirror must hold the compiled graph
   before the MIDI bindings load (they validate against it), and
   bindings load against the COMPILED graph so bindings inside modules
   survive. */

import { compile, piecePatch, projectLevel, type SubPatch } from '../../patch';
import {
  backupPremigration, dropStash, hasStash, libStore, loadPatch, migrateEmbedded,
  reloadLibrary, restoreDocs, restoreMedia, saveLibraryNow, savePatch,
} from '../../persist';
import { mirror } from '../../runtime';
import * as midi from '../../midi';

/* a stash present at boot means the tab died mid-session: the peer never
   reached Leave, so its pre-session bench is still parked in the
   `.sessionstash` twins and the `stash/…` blob shadows while the live keys
   hold the last session's imports. Restore the peer's own bench before
   anything reads it. The document twins go back SYNCHRONOUSLY (loadPatch
   below must see the peer's patch, not the host's).

   reloadLibrary MUST run here, right after restoreDocs. libStore parsed
   `herder.library.v1` into its live doc at its own module init — and ESM
   evaluates that BEFORE this branch runs, so libStore.doc still holds the
   HOST's session entries even though restoreDocs just put the peer's library
   JSON back in localStorage. Left alone, the first debounced libStore.touch()
   would serialize the host's entries over the peer's restored ones —
   permanent library loss. reloadLibrary reparses the restored JSON into the
   live doc, so libStore matches storage before anything compiles or touches.

   The shadow blobs are copied back on a promise `bootRestore` exposes, so
   main.tsx can gate the first render on it — the source constructors read
   loadStoredMedia exactly once, at construction, and must not race the
   copy-back. With no stash it resolves immediately. restoreMedia enumerates
   the `stash/` prefix straight from IndexedDB, so it needs no key list from
   the document. */
let restore: Promise<void>;
if (hasStash()) {
  restoreDocs();
  reloadLibrary();
  restore = restoreMedia().then(dropStash);
} else {
  restore = Promise.resolve();
}
/** resolves once the pre-crash media shadows are copied back over the live
    keys (immediately when there was no stash). main.tsx awaits it before the
    first render so no MediaSource/DrawSource constructor reads a key mid-copy. */
export const bootRestore: Promise<void> = restore;

/* stash the verbatim pre-migration document before touching anything —
   a one-time safety net so the original always survives the conversion */
backupPremigration();

const boot = loadPatch() ?? { ...piecePatch(), globals: { ...mirror.globals } };
mirror.globals = boot.globals;

export const bootRoot: SubPatch = { nodes: boot.nodes, edges: boot.edges };
/* fold any embedded modules (old saves, and the preset fallback) into
   library entries before the first compile — post-migration every module
   is a reference. Persist both stores when it actually changed anything so
   the migrated shape is what the next boot loads. */
if (migrateEmbedded(bootRoot, libStore.doc)) {
  saveLibraryNow();
  savePatch({ nodes: bootRoot.nodes, edges: bootRoot.edges, globals: boot.globals });
}
/* compile resolves module refs through the live library — the store is
   loaded at its own module init, before this boot runs */
const bootFlat = compile(bootRoot, libStore.resolve);
mirror.nodes = bootFlat.nodes;
mirror.edges = bootFlat.edges;
midi.loadBindings();

export const bootView = projectLevel(bootRoot, '', undefined, libStore.resolve);
