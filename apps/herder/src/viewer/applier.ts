/* The headless applier — the viewer's whole document mechanism.

   A viewer has no React Flow, no bench, no mounted level: it holds only
   a live root tree, the compiled mirror the engine reads, and the
   library. Every op arrives over the session wire ALREADY scoped
   (canonical), so this is the pure in-place half of the bench's
   applyCanonical (useOps.ts) — the same §C per-kind routing with every
   `viewed`/React-Flow branch stripped away, because nothing is ever
   viewed here. There is no writeParam-to-RF, no echo table (no RF
   removal ever bounces back), no MIDI persist (the viewer never keeps
   its own document — the join snapshot fed it and Leave restores).

   The rule that keeps the light alive is the same one the bench obeys:
   never rebuild for an ordinary op. A value op writes the mirror node's
   data in place (the engine reads it that very tick); a structural op
   applies to the tree and then recompiles into the mirror — compiled
   ids stay stable across the recompile, so rings, faces and sparks stay
   warm. Only replaceGraph legitimately swaps the whole root and drops
   the rings (the host pressed New). */

import {
  adoptSources, applyOp, applySlotOp, compile, instancePrefixes, isSlotValueOp, isValueOp, sweepEntryVals,
  type NodeData, type Op, type OpScope, type SubPatch,
} from '../patch';
import { setDial, type Slot } from '@ldlework/dials';
import { dropEntryMedia, libStore } from '../persist';
import { engineRef, mirror, registerApplier, releaseNode, type DispatchOpts } from '../runtime';

/* the viewer's document root — an EMPTY bench at boot; the join snapshot
   fills it through `rebuild` below, and the op stream mutates it in
   place thereafter. Module-level, like the bench's `bench.root`. */
let root: SubPatch = { nodes: [], edges: [] };

/** the live root, for the session's `deps.root()` — the host's snapshot
    assembly never runs on a viewer, but the seam is symmetric. */
export function viewerRoot(): SubPatch {
  return root;
}

/* recompile the tree into the mirror BY REFERENCE — the engine reads
   mirror.nodes/edges every tick, so swapping the arrays in place is what
   makes a structural edit visible without a rebuild. compiled ids are
   stable for surviving nodes, so rings stay warm — and each surviving
   instance's source state (LFO phase, filter memory, lastSample) is
   adopted across the re-clone, so a structural op doesn't skip every
   module's modulation. */
function recompile(): void {
  const flat = compile(root, libStore.resolve);
  adoptSources(mirror.nodes, flat.nodes);
  mirror.nodes = flat.nodes;
  mirror.edges = flat.edges;
}

/** the session's `deps.rebuild`: release every current node, swap the
    root, compile FRESH — no state adoption; rings and source state
    legitimately die (a new graph replaces the old). The join snapshot's
    live-swap and replaceGraph both ride this, exactly the bench's
    rebuild semantics minus React Flow. */
export function viewerRebuild(next: SubPatch): void {
  for (const n of mirror.nodes) releaseNode(n.id);
  root = next;
  const flat = compile(root, libStore.resolve);
  mirror.nodes = flat.nodes;
  mirror.edges = flat.edges;
}

/** install the headless applier on the dispatcher. Every remote op rides
    applyRemote → this, in canonical mode; a stray local dispatch (there
    are no call sites, but the seam is shared) is gated 'block' by the
    peer loop, so it never reaches here. */
export function installViewerApplier(): void {
  registerApplier((op: Op, opts: DispatchOpts): Op => applyViewer(op, opts));
}

/* the pre-canonicalize ops carry no drill scope — their wire form IS the
   raw op. The recordOnly guard the bench keeps (a deferred write-peer op)
   never fires here: a viewer never defers (it never writes), so canonical
   application always lands. */
function applyViewer(op: Op, _opts: DispatchOpts): Op {
  if (op.kind === 'setGlobal') {
    setDial(mirror.globals[op.k] as Slot<number>, op.v);
    if (op.k === 'res') engineRef.current?.setResolution(op.v);
    return op;
  }
  if (op.kind === 'replaceGraph') {
    /* a wholesale swap (the host pressed New / pasted): adopt the pasted
       globals and retune before the rebuild, then swap the root. Rings
       legitimately drop — that is the semantics. */
    if (op.globals) {
      mirror.globals = op.globals;
      const resSlot = op.globals.res as Slot<number> | undefined;
      if (resSlot) engineRef.current?.setResolution(resSlot.dial.value);
    }
    viewerRebuild(op.patch);
    return op;
  }
  if (op.kind === 'entryDelete') {
    /* release every instance's ring before the entry's definition goes —
       the instances go orphan-dark on the next compile, but their rings
       would otherwise linger. Then shed the entry's stored media and drop
       the definition. */
    for (const p of instancePrefixes(root, libStore.resolve, op.id))
      for (const n of mirror.nodes) if (n.id.startsWith(p)) releaseNode(n.id);
    dropEntryMedia(op.id);
    applyOp(root, mirror.globals, libStore.doc, op);
    recompile();
    libStore.touch();
    return op;
  }
  if (op.kind === 'entryCreate' || op.kind === 'entryRename') {
    applyOp(root, mirror.globals, libStore.doc, op);
    /* entryCreate adds a definition (no live compile change until an
       instance references it); entryRename touches names only. A recompile
       is harmless and keeps the mirror honest if any instance already
       points at the new/renamed entry. */
    recompile();
    libStore.touch();
    return op;
  }

  applyCanonical(op);
  return op;
}

/* the §C per-kind routing, in place only. The op names its scope; the
   viewer has no mounted level, so every op is "unviewed" — the bench's
   inPlace branch, verbatim, minus the RF write-back and the MIDI persist.

     · value ops write the mirror node's data (the engine feels it this
       tick); a ref-boundary value (rel set) rode applyOp into the vals,
       so writeParam patches the fresh compiled mirror node too. Neither
       recompiles — compiled ids and rings are untouched.
     · structural ops mutate the tree, then recompile; an entry-scoped one
       additionally releases the departed prototype's ring in every sibling
       instance and sweeps their stale vals; a doc-scope removeNode releases
       each departed id at its compiled address. */
function applyCanonical(op: Exclude<Op, { kind: 'setGlobal' | 'replaceGraph' | 'entryCreate' | 'entryRename' | 'entryDelete' }>): void {
  const scope = op.scope;
  const effect = applyOp(root, mirror.globals, libStore.doc, op);
  writeParamRemote(op, scope);

  if (isValueOp(op)) return;   // values never recompile
  if (op.kind === 'markMedia') {
    /* an override marker changed the compiled mediaKey — recompile so the
       node re-stamps its key and the engine reads the newly-stored blob. */
    recompile();
    return;
  }

  /* a structural op reshaped the graph: recompile the mirror (rings warm,
     ids stable), then the cross-layer releases the pure document can't do. */
  recompile();
  if (scope.kind === 'entry') {
    libStore.touch();
    if (op.kind === 'removeNode') {
      for (const p of instancePrefixes(root, libStore.resolve, scope.id))
        releaseNode(p + op.id);
      sweepEntryVals(root, libStore.resolve, scope.id, op.id);
    }
  } else if (effect.removed.length) {
    /* the doc in-place removeNode release: applyOp reports the departed
       ids, so release each at its compiled address (scope prefix + local). */
    const pfx = prefixOf(scope.path);
    for (const rid of effect.removed) releaseNode(pfx + rid);
  }
}

/* a ref-boundary value (rel set) landed in the instance's vals, so the
   freshly recompiled mirror node never saw it — write it into the mirror
   in place so the engine feels it now. The viewer has no React Flow node
   to patch (the bench's other half); the mirror write alone carries the
   engine. Values without rel already rode applyOp's aliased in-place write
   into the shared node data. */
function writeParamRemote(op: Op, scope: OpScope): void {
  if (!(isSlotValueOp(op) || op.kind === 'setSel') || op.rel === undefined) return;
  const prefix = scope.kind === 'doc' ? prefixOf(scope.path) : '';
  const compiledId = prefix + op.node + '/' + op.rel;
  const m = mirror.nodes.find(n => n.id === compiledId);
  if (!m) return;
  if (op.kind === 'setSel') (m.data as NodeData).sel = op.i;
  else if (isSlotValueOp(op)) applySlotOp((m.data as NodeData).slots, op);
}

const prefixOf = (path: string[]): string => (path.length ? path.join('/') + '/' : '');
