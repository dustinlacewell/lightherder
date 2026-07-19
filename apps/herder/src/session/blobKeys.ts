/* The two blob key spaces a session must carry, enumerated as one list.

   Media in this app lives under two different addressing schemes, and a
   join snapshot (or a stash) has to name every blob across both:

     · COMPILED media — a media or draw node as the engine sees it, keyed
       by the blob it actually reads. A media node's picture rides under
       its `mediaKey` (the entry default the compile stamped, or the
       instance's own override copy) when it has one, else its plain id;
       a draw node's PNG is always under its id. This is the LIVE key
       space — what a running bench's IndexedDB actually holds.

     · ENTRY-DEFAULT media — the pictures a library entry carries for
       media nodes a peer hasn't instantiated yet but might drop later.
       Those live under "<entryId>/<pathWithinEntry>" (the same keys
       compile stamps when an instance DOESN'T override), enumerated by
       `mediaPaths` over each entry's own level.

   Both spaces together are every blob a peer needs to reproduce the host
   exactly and to keep dropping the host's library entries afterward. The
   result is deduped: an instantiated entry's default key appears once,
   whether it was reached through the mirror or the entry walk. */

import { mediaPaths, type PatchNode, type SubPatch } from '../patch';

/** every blob key across both spaces, deduped. `mirrorNodes` is the live
    compiled graph (mirror.nodes); `entries` is the library, each entry's
    own level patch. */
export function mediaKeysOf(
  mirrorNodes: PatchNode[],
  entries: { id: string; patch: SubPatch }[],
): string[] {
  const keys = new Set<string>();
  for (const n of mirrorNodes) {
    if (n.type === 'media') keys.add(n.data.mediaKey ?? n.id);
    else if (n.type === 'draw') keys.add(n.id);
  }
  for (const e of entries)
    for (const rel of mediaPaths(e.patch)) keys.add(e.id + '/' + rel);
  return [...keys];
}
