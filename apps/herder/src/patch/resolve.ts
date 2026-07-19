/* Where a compiled id lives in the document.

   A compiled id — "n5", "n2/n7", "J/K/n3" — is the flat address the
   engine, faces, sparks and MIDI all speak. It is globally resolvable
   without the drill path: this walk from the root reconstructs which
   part of the document owns it, so an op holding only the compiled id
   can route itself.

   The one boundary that matters is the FIRST ref module on the walk. A
   plain embedded module (transition only) just extends the doc path —
   its nodes are the user's own, edited in the tree like any other. But
   the first `ref` module is prototype-land: everything below it belongs
   to a library entry shared by every sibling instance. So the split is:

     · docPath  — the instance chain in the user's tree, up to (not
                  including) the outermost ref instance.
     · inst     — that outermost ref instance's level-local id, the node
                  that owns the values; null if no ref was crossed.
     · rel      — the path from the instance down to the addressed node,
                  the key its instance-owned value lands under.
     · entryId  — the deepest entry the id reaches into.
     · local    — the addressed node's own id (the last segment).

   Values route to (docPath, inst, rel); structure routes to (entryId,
   local). A compiled id that never crosses a ref returns inst = null,
   and the caller keeps its old doc-scope behavior. */

import { libHead } from './drill';
import type { PatchNode, SubPatch } from './graph';
import type { EntryResolver } from './library';

export interface Resolved {
  docPath: string[];
  inst: string | null;
  rel: string;
  entryId: string | null;
  local: string;
  /** set when the id is lib-rooted (a shelf-entered entry view) — the
      entry the walk started inside. Values route to THIS entry's scope:
      the entry's own node defaults (inst null), or a nested ref module's
      stored default vals (inst set, rel below it). */
  lib?: string;
}

export function resolveCompiled(root: SubPatch, resolve: EntryResolver, compiledId: string): Resolved {
  const segs = compiledId.split('/');

  /* a lib-rooted id — "lib:abc/n5", "lib:abc/n7/n3" — starts inside the
     entry itself; there is no doc instance above it. The walk is the
     same module-chain descent, just rooted at the entry's graph: the
     first ref module inside it owns the values (its vals are the entry's
     stored nested defaults), and each further ref switches the deepest
     entry, exactly as below. */
  const head = libHead(segs[0]);
  if (head !== null) {
    let cur: SubPatch | null = resolve(head);
    let inst: string | null = null;
    let entryId: string | null = head;
    let relFrom = segs.length - 1;
    for (let i = 1; i < segs.length - 1; i++) {
      const seg = segs[i];
      const m: PatchNode | undefined = cur?.nodes.find(n => n.id === seg && n.type === 'module');
      if (!m || m.data.ref === undefined) break;
      if (inst === null) { inst = seg; relFrom = i + 1; }
      entryId = m.data.ref;
      cur = resolve(m.data.ref);
    }
    return {
      docPath: [segs[0]],
      inst,
      rel: inst === null ? '' : segs.slice(relFrom).join('/'),
      entryId,
      local: segs[segs.length - 1],
      lib: head,
    };
  }
  const docPath: string[] = [];
  let cur: SubPatch | null = root;
  let inst: string | null = null;
  let entryId: string | null = null;
  let relFrom = segs.length - 1;          // index where the instance-relative tail begins

  /* walk only the MODULE chain — every segment but the last. The final
     segment is the addressed node itself, addressed AT its level; we do
     not descend into it even if it is a module (renaming or moving a
     module instance is a doc-level edit on that instance, not a reach
     into its entry). */
  for (let i = 0; i < segs.length - 1; i++) {
    const seg = segs[i];
    const m: PatchNode | undefined = cur?.nodes.find(n => n.id === seg && n.type === 'module');
    if (!m || m.data.ref === undefined) break;   // a stale id — stop here
    if (inst === null) {
      /* the first ref: this instance owns the values below it, and
         everything deeper resolves inside its entry */
      inst = seg;
      relFrom = i + 1;
      entryId = m.data.ref;
      cur = resolve(m.data.ref);
    } else {
      /* already inside prototype-land — each further ref module switches
         which entry the deepest segment reaches into. viewContext in
         patch/drill.ts is the twin of this walk. */
      entryId = m.data.ref;
      cur = resolve(m.data.ref);
    }
  }

  return {
    docPath,
    inst,
    rel: inst === null ? '' : segs.slice(relFrom).join('/'),
    entryId,
    local: segs[segs.length - 1],
  };
}
