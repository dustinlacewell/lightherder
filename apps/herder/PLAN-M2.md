# Implementation plan — by-reference library modules (HANDOFF §11) on the M1 op layer

All paths relative to `src/`. Design is fixed (HANDOFF §11); this maps it to code.

## 0 · Data model (the vocabulary everything below uses)

`patch/graph.ts` — `NodeData` changes:

```ts
ref?: string;                          // module: library entry id
vals?: Record<string, InstVals>;       // module: per-instance values, keyed by rel path 'n5', 'n5/n2'
// `patch?: SubPatch` remains during the transition (C1–C4), deleted in C5
```

New `patch/library.ts` (pure, no imports above patch/):

```ts
interface InstVals { v: Record<string, number>; sel?: number; media?: boolean }
interface LibEntryDef { id: string; name: string; patch: SubPatch }   // patch is LIVE, parsed once
interface LibraryDoc { entries: LibEntryDef[] }
type EntryResolver = (id: string) => SubPatch | null;
```

Post-migration invariant: **every module is a ref**, so every drilled level below the root is an entry's root level. Doc `path` in scopes stays general (transition period has embedded modules) but ends up `[]` in practice.

---

## A · The drilled write-back split

**Decision: keep the wholesale render-time write-back for BOTH doc and ref levels; split its destination for ref levels.** §11 explicitly prescribes no-diff wholesale vals capture, and React Flow applies drags/deletions locally before any op exists, so an RF-state→tree sync must exist regardless — making ref levels op-driven would leave two mechanisms guarding one seam and double the invariant surface.

New helper `viewContext(root, path: Crumb[], resolve): ViewCtx | null` in `patch/drill.ts`:

```ts
interface ViewCtx {
  kind: 'doc' | 'entry';
  level: SubPatch;                     // the doc level, or the deepest entry's root graph
  entryId?: string;                    // deepest entry on the path
  owner?: { docPath: string[]; instId: string; relPrefix: string };  // outermost ref instance; relPrefix e.g. '' or 'J/'
  overlays?: { base: string; vals: Record<string, InstVals> }[];     // inner→outer frames for this level
}
```

Walk the path from root: plain crumbs extend `docPath`; the first module with `ref` sets `owner`; each subsequent crumb is a ref-module node inside the current entry — it switches `entryId` and pushes an overlay frame (that node's `vals` stored in the entry = the middle merge layer) while the owner instance's `vals` sliced at `relPrefix` is always the outermost frame.

**Write-back (replaces the current `useBench` wholesale write).** Guarded exactly as today (`viewKeyRef`, `lastSync` identity check). `const local = unproject(nodes, edges, prefix)`, then:

- `ctx.kind === 'doc'` — unchanged: `level.nodes = local.nodes; level.edges = local.edges`.
- `ctx.kind === 'entry'` — two writes:
  1. **Structure → `ctx.level` (the entry graph).** For each `local` node: if the entry already has a node with that id, write `{...n, data: {...n.data, v: entryNode.data.v, sel: entryNode.data.sel, vals: entryNode.data.vals}}` — entry keeps its stored values/nested-init for pre-existing nodes; everything else (position, name, ports, flavor, momentary, open, labels, ref) comes from RF. New ids land wholesale (their current v/sel become entry defaults). `level.edges = local.edges`. Deleted nodes are simply absent.
  2. **Values → the owner instance, wholesale.** `inst = levelAt(root, ctx.owner.docPath).nodes.find(id === instId)`. For every non-module `local` node: `inst.vals[relPrefix + n.id] = { v: {...n.data.v}, sel: n.data.sel, media: prev?.media }` (preserve the media marker). Prune vals keys at this level (`relPrefix + <one segment>`) whose node is gone, plus keys under a deleted node's subtree (`relPrefix + id + '/'` prefix).
  3. Set `entryDirtyRef.current = ctx.entryId`; a `useEffect([nodes, edges])` flushes `libStore.touch()` (debounced persist + subscriber notify) — **never touch during render**.

**`viewKeyRef` / reprojection.** `viewKeyRef` becomes `{ key: string; libVer: number }`. Write-back records the version it will produce; the projection effect gains `libVer` (read via `useSyncExternalStore(libStore.subscribe, libStore.version)`) in its deps and reprojects when `viewKeyRef.current.libVer !== libVer` **and** the bump wasn't ours — i.e. own write-back updates the ref, external bumps (silent entry op, future remote op) leave it stale and force `projectLevel(ctx.level, prefix, ctx.overlays)` → `setNodes/setEdges`. This also *narrows the known trap*: a silent structural op on the viewed entry level now reprojects before the next write-back can erase it.

**Compile memo:** deps stay `[nodes, edges, pathKey, docVer]` — `libVer` is NOT added. Every library mutation path already bumps one of these: viewed write-back changes `nodes/edges` identity; dispatcher-applied entry-scoped structural ops call `bumpDoc()` (see B). `libStore.version` exists for LibraryPanel/ModuleNode/Crumbs subscriptions and persistence only.

---

## B · The resolver's two routing rules

**New scope union** (`patch/ops.ts`):

```ts
export type OpScope = { kind: 'doc'; path: string[] } | { kind: 'entry'; id: string };
```

No `path` on entry scope — an entry level is always the entry's root (nested modules are refs to *other* entries).

**Op shape changes:**

```ts
| { kind: 'setParam'; scope: OpScope; node: string; rel?: string; key: string; v: number }
| { kind: 'setSel';   scope: OpScope; node: string; rel?: string; i: number }
| { kind: 'markMedia'; scope: OpScope; node: string; rel: string; on: boolean }   // instance replaced a media file
| { kind: 'entryCreate'; entry: LibEntryDef }
| { kind: 'entryRename'; id: string; name: string }
| { kind: 'entryDelete'; id: string }
```

With `rel` present, `node` is the **instance** (level-local in `scope.path`'s level) and the write lands in `vals[rel]`. Without `rel`, semantics are unchanged (aliased in-place write). No separate `setVal` kind — `setParam` stays the one param verb the wire carries.

**Resolution algorithm** — the drill path is NOT needed; the compiled id is globally resolvable. New `resolveCompiled(root, resolve: EntryResolver, compiledId)` in `patch/resolve.ts` (or folded into `ops.ts`): split segments `s0…sk`; walk from root — a plain embedded module extends the doc path (transition only); the **first ref module** `sj` is the outermost instance (docPath = segments before it); from there each further segment resolves inside the current entry, each ref module switching `entryId`. Returns `{ docPath, inst: sj | null, rel: s(j+1)…sk, entryId: deepest, local: sk }`.

`useOps.canonicalize` becomes `canonicalize(root, lib, op)` and routes by op kind:

- `setParam` / `setSel` (and `markMedia`) crossing a ref → `{ scope: {kind:'doc', path: docPath}, node: inst, rel, key, v }`.
- Structural kinds (`moveNode`, `addNode`, `removeNode`, `connect`, `disconnect`, `rename`, `setFlavor`, `setProp`, `togglePort`) crossing a ref → `{ scope: {kind:'entry', id: entryId}, node/id/edge: entry-local (final segment / rebuilt edge id, as `connect` does today) }`.
- No ref crossed → today's `splitId` behavior, unchanged.

The `inPlace` test keeps comparing the op's **compiled level prefix** against `viewPath()` — the compiled prefix of a level is the drill prefix regardless of ref boundaries, so the mechanics don't change.

**`applyOp` and layering.** Signature becomes `applyOp(root, globals, lib: LibraryDoc, op): OpEffect` — the library is *passed in* as pure data; `patch/` imports nothing. Inside:

- `entry` scope: `level = lib.entries.find(e => e.id === op.scope.id)?.patch`; the existing per-op appliers already operate on a bare `SubPatch` level — reuse verbatim.
- `doc` scope: `levelAt(root, path, id => lib…patch ?? null)` (levelAt gains the resolver, §E).
- `setParam`/`setSel` with `rel`: `withData(level, op.node, d => { const e = (d.vals ??= {})[op.rel] ??= { v: {} }; e.v[op.key] = op.v /* or e.sel = op.i */ })`. Partial vals entries are fine — the merge is per-key (§C).
- `markMedia`: same, sets `e.media = op.on`.
- `entryCreate/Rename/Delete`: mutate `lib.entries`. `entryDelete` returns `{ removed: [], graph: false }` — the dispatcher handles the instance release sweep (below).

Dispatcher side (`useOps`): after applying an **entry-scoped structural** op in place, call `bumpDoc()` (recompile) and `libStore.touch()`. For `removeNode` under entry scope and for `entryDelete`, expand releases across all instances: `instancePrefixes(root, libStore.resolve, entryId)` (§F) → `releaseNode(prefix + localId)` (or the innards sweep for delete — prefix sweep covers nesting). Same sweep must run in `useBench.handleNodesChange`'s remove branch when the viewed level is an entry: RF releases `prefix+id` for the *viewed* instance; the handler additionally releases `P + localId` for every **other** instance prefix.

`midi/targets.ts` needs **no change**: `modelTarget` keeps dispatching `setParam` with the compiled id and `{silent:true}`; canonicalize does the rest. Its `onStep` re-read of `mirror.nodes…data.v` stays correct because the router writes the mirror in place (§C).

---

## C · compile with layered vals + the writeParam router

**Signature:** `compile(root: SubPatch, resolve: EntryResolver): SubPatch`. Callers: `ui/bench/boot.ts` (×1), `useBench` (memo + `rebuild`) — pass `libStore.resolve`.

**`expand` changes** (`patch/compile.ts`): carries `frames: {base: string, vals: Record<string,InstVals>}[]` (inner-first) and `active: Set<string>` (entry re-entrancy backstop alongside `MAX_DEPTH`). On a module node:

- `ref` set: `entry = resolve(ref)`; **null → emit nothing** (orphan; also exclude the module from the level's `modules` map AND record its id so edges touching it are dropped — don't emit dangling compiled edges). Else recurse into `entry` with `prefix + n.id + '/'`; frames gain `{ vals }` layers — outermost frame = the doc-tree instance; frames from entry-stored nested-module `vals` sit inner. Each frame stores its absolute prefix; rel per node is the compiled path sliced per frame.
- `patch` set (transition only): today's behavior.

**Merge order per non-module node under a ref** (fresh objects, mandatory — entry nodes are shared across instances):

```ts
const data = { ...n.data, v: { ...n.data.v } };          // layer 0: entry defaults
for (frame of frames /* inner → outer, outermost LAST = wins */) {
  const iv = frame.vals[relToFrame];
  if (iv) { Object.assign(data.v, iv.v); if (iv.sel !== undefined) data.sel = iv.sel; }
}
```

**Media stamping:** for `n.type === 'media'` under a ref: `data.mediaKey = (outermost frame's iv?.media) ? compiledId : entryId + '/' + relWithinDeepestEntry` (entry ids already begin `lib.`, matching existing blob keys). Consumers switch from `nodeId` to `data.mediaKey ?? id` — touchpoints: the media node component's `loadStoredMedia` call and the engine media source; grep for `loadStoredMedia(`/`storeMedia(`.

**What stays aliased:** root-level (doc) non-module nodes are pushed as-is — tree↔mirror aliasing and compile-free root param writes survive intact. **What doesn't:** everything under a ref boundary — fresh node + data + v each compile pass.

**The router** (§11's `writeParam`) — lives in `useOps`' existing silent/in-place branch, not a new module. After `applyOp` lands a canonical `setParam`/`setSel` **with `rel`**:

```ts
const m = mirror.nodes.find(n => n.id === compiledId);          // id from the pre-canonical op
if (m) m.data.v[op.key] = op.v;                                 // engine, same tick
const rn = rf.getNode(compiledId);                              // present only if level is viewed
if (rn) (rn.data as NodeData).v[op.key] = op.v;                 // keeps the next write-back honest
```

The RF in-place write is the explicit replacement for what aliasing did implicitly today — without it, a silent CC on a viewed ref level would be erased by the next wholesale vals write-back. `fireModelWrite()` stays (debounced persist). Non-silent viewed ops keep the `applyViewed` React path unchanged.

**Recompile triggers:** RF `nodes`/`edges` identity (all viewed edits, incl. entry write-backs) · `docVer` (silent/unviewed structural ops, now incl. entry-scoped) · `pathKey`. Perf shape: an entry edit recompiles the whole root in ONE pass — all sibling instances re-expand in it; cost is O(total compiled nodes). Same order as today's every-edit compile; compiled ids are stable so the engine keeps every ring, face and MIDI binding warm across it.

---

## D · Library store promotion

`persist/libraryStore.ts` becomes the live singleton (loaded at module init, before `boot.ts` compiles):

```ts
export interface LibEntry extends LibEntryDef {}     // patch: SubPatch — LIVE, parsed once via graphFromJSON
export const libStore: {
  doc: LibraryDoc;                                   // the object applyOp mutates
  entries(): LibEntry[];
  resolve(id: string): SubPatch | null;              // the EntryResolver everyone passes
  version(): number;
  subscribe(fn: () => void): () => void;             // useSyncExternalStore-shaped
  touch(): void;                                     // ++version, queueMicrotask notify, debounced save
}
```

Runtime entry state moves **out of Bench React state into this module-level store**; components hook it via `useSyncExternalStore`. `loadLibrary`/`saveLibrary` become internal; `snapshotEntry`/`instantiateEntry` are deleted in C5.

- **Bench.tsx:** delete `entries` state + save effect; `onDrop` looks up `libStore.entries()`; `saveHere` rebuilds as: `level = unproject(rf.getNodes(), rf.getEdges(), prefix)` (RF data = the merged view, so current values bake in as the new entry's defaults — §11's "save here" semantics); for nested module nodes bake `vals = merge(storedInit, ownerOverlaySlice)` (helper `bakeEntry(level, ctx.overlays)` in `patch/library.ts`); copy each media node's blob from its effective `mediaKey` to `<newId>/<rel>`; then `dispatch({kind:'entryCreate', entry})`.
- **LibraryPanel.tsx:** props shrink to `{ onSaveHere }`; reads the store; delete button dispatches `entryDelete` after the warning (§F); add inline rename → `entryRename`.
- **useSpawn.dropLib:** no `instantiateEntry`, no media copy, no await — `makeNode('module', …)` then `n.data.ref = entry.id; n.data.vals = {}`, cycle-guard first (§F), then the existing `setNodes` + `record(addNode)`.
- **Toolbar module spawn:** mints an entry immediately (`entryCreate` with an empty patch, named like the node) and drops a ref to it — see H1.

---

## E · Drill through refs

- **`levelAt(root, path, resolve?)`**: when the found module has `ref`, `cur = resolve?.(ref) ?? null`; missing → null (existing null handling in `useBench` resets the path — orphan drill is thereby blocked for free). Callers: `useBench` (×2), `applyOp`, `jump` freshen loop.
- **`projectLevel(level, prefix, overlays?)`**: with overlays (from `viewContext`), non-module nodes get fresh merged `data` (same merge as compile); module nodes project as-is. Doc levels: unchanged path.
- **`Crumb`** gains `entry?: { id: string; name: string }` — set in `useBench.enter` by looking the module up in the current level (if it has `ref`, attach the entry id + name from `libStore`).
- **Crumbs.tsx:** each crumb with `entry` renders a small library glyph; when the LAST crumb has `entry` (⇔ the viewed level IS a library entry), show the warning chip: "editing library entry '<name>' — structure changes apply to every instance".
- **modules.tsx / ModuleNode:** `moduleInterface(libStore.resolve(data.ref) ?? data.patch)` (transition), plus `useSyncExternalStore` so the ports re-derive when the entry is edited elsewhere (the existing `sig`-keyed `updateNodeInternals` effect then re-measures). `resolve(ref) === null` → `mod-dead` class + "missing entry" badge, no ports, open disabled. Face keeps showing the instance `data.name` (H2). `useBench.jump`'s freshen loop stays (harmless; projection now rebuilds merged data anyway).

---

## F · Cycle guard, media keys, migration, orphans

- **Cycle guard:** `refClosure(resolve: EntryResolver, entryId: string): Set<string>` in `patch/library.ts` (DFS with a seen-set). Guard predicate in `useSpawn`: reject drop when `path.some(c => c.entry && (c.entry.id === entryId || closure.has(c.entry.id)))`. Call sites: `dropLib`, `useClipboard` paste (any pasted module node's `ref` gets the same check), and the compile backstop (`active` set + `MAX_DEPTH`) for corrupted docs.
- **Media:** `mediaPaths` drops the module recursion — flat filter, signature unchanged. Media drop handler on a ref-inner node: `storeMedia(compiledId, file)` + `dispatch({kind:'markMedia', scope, node, rel, on:true})` (canonicalized like setParam). New media node added inside a drilled entry: blob also copied to `lib.<entryId>/<rel>` so siblings share the default (H7).
- **Migration:** `migrateEmbedded(root: SubPatch, doc: LibraryDoc): boolean` in new `persist/migrate.ts`. Walk the tree (recursing into embedded patches innermost-first); for each module with `data.patch`: mint entry id, push `{id, name: node.data.name, patch: embedded}`; set `node.data.ref = id`, copy the embedded values wholesale into `node.data.vals[rel] = {v, sel}` for every non-module node at every embedded level (values stay instance-owned — future entry-default edits must not move these knobs); for each media path set `vals[rel].media = true` (instance blobs already live under compiled keys — correctness needs no copy) and fire-and-forget `copyStoredMedia(instKey, entryId + '/' + rel)` for future drops; delete `data.patch`. Call site: `ui/bench/boot.ts` after `loadPatch()`, before the first `compile` — run on the preset fallback too. Idempotent by construction (no `patch` field remains).
- **Orphans:** compile emits nothing for a missing ref and drops its edges (§C); `ModuleNode` dead badge (§E); `entryDelete` in LibraryPanel first counts instances via `instancePrefixes(root, resolve, id)` — helper in `patch/library.ts`: walk root + every entry graph for `data.ref === id` (transitively, building compiled prefixes) — and confirms: "N module instances on this bench use '<name>'. They will go dark until an entry with this patch returns." Dispatch releases each instance prefix's innards via `releaseNode`.

---

## G · Staged commits (each `npx tsc && pnpm build` green)

1. **C1 — pure model + op vocabulary** (`patch/` only): `ref`/`vals` on NodeData, `patch/library.ts`, OpScope union + `rel` + entry ops + `markMedia`, `applyOp(root, globals, lib, op)` (callers pass `{entries: []}` for now), json.ts round-trips `ref`/`vals` (still parses AND emits `patch`), `levelAt`/`compile` gain optional resolver defaulting to embedded behavior. *Adversary:* zero behavior change — no producer of refs exists; an existing bench compiles byte-identically; `applyOp` doc-scope semantics unchanged.
2. **C2 — library store promotion** (`persist/` + Bench/LibraryPanel): `libStore` singleton, Bench drops entries state, entry lifecycle as ops through the dispatcher. `dropLib`/`saveHere` still by-value. *Adversary:* shelf UX identical; entries survive reload; deleting an entry still leaves by-value instances intact.
3. **C3 — read path, inert**: compile expands refs (merge layers, media stamping, orphan skip, cycle backstop); `viewContext` + overlay `projectLevel`; `levelAt` through refs; ModuleNode resolves ref-or-embedded. Nothing creates refs yet. *Adversary:* embedded modules still compile/drill identically; a hand-crafted ref doc (localStorage) compiles with correct merge precedence.
4. **C4 — the flip (the bounded atomic core)**: `dropLib` → ref instances; write-back split in `useBench`; `resolveCompiled` routing + router + entry-scope dispatch handling + multi-instance release sweeps in `useOps`/`handleNodesChange`; cycle guard at the doors; crumb badges; dead badge; toolbar module → minted entry. Files: `useBench.ts`, `useOps.ts`, `useSpawn.ts`, `Bench.tsx`, `modules.tsx`, `Crumbs.tsx`, clipboard touchpoint. Genuinely atomic — producers and routing can't land apart. *Adversary:* (a) drill-edit structure in instance A → instance B updates on next compile with rings warm (ids stable); (b) knob turn in A never moves B; (c) silent CC into an undrilled instance persists to `vals` AND hits the engine same tick AND survives the next write-back when that level is viewed; (d) write-back never clobbers entry defaults with instance values; (e) deleting an entry node releases GPU state in every sibling instance; (f) A-into-E-drilled-through-A rejected.
5. **C5 — migration + serialization cutover**: `migrateEmbedded` at boot — which must FIRST stash the pre-migration document verbatim under a one-time localStorage backup key (`herder.patch.v1.premigrate`) so the original always survives the conversion; `graphToJSON` stops emitting `patch`; `makeNode('module')` stops initializing it; compile/`moduleInterface`/`mediaPaths` drop embedded branches; delete `instantiateEntry`/copy path; `saveHere` bake. *Findings from the C4 adversary that C5 must absorb:* (i) `migrateEmbedded` must walk LIBRARY ENTRIES too, not just the root tree — pre-C5 saveHere can bake embedded modules into entries, and those never self-heal otherwise; (ii) the `saveHere` bake must fix the entry-level fork: snapshot the MERGED on-screen values (not entry defaults) and copy media blobs from each node's effective `mediaKey` (instance compiled keys don't exist for ref instances — the C2-era copy silently loses media). *Adversary:* an old save loads with identical knob values and visible media; second load mints no duplicate entries; migrated instance's knobs don't move when the minted entry's defaults are edited; an entry containing an embedded module migrates too; saveHere at a drilled entry level forks with on-screen values and working media.
6. **C6 — polish**: deletion warning count, entry rename UI, entry-default blob copy for new-node media drops (the instance-override `markMedia` flow was pulled forward into the C4 fix round), orphan styling. *Known tension to resolve or document:* viewing a level that contains an ORPHAN ref module permanently destroys its boundary edges (the view prunes them, the write-back persists the pruning) — the "goes dark until the entry returns" story currently loses the wires on first look.

---

## H · Decisions (defaults taken; flag to dustin, veto any)

1. **Toolbar-spawned MODULE mints a real, visible library entry** named after the node — one source of truth, no second module shape.
2. **Module face shows the instance name only** (initialized from the entry at drop); no entry-name tag until asked.
3. **Entry rename never renames instances** (instance `name` is instance data).
4. **"Save here" while viewing an entry level forks a NEW entry** (never updates in place); explicit push-to-entry (↻) stays skipped per §11.
5. **Migration mints one entry per embedded instance, no dedup** — structural-hash dedup would silently couple patches the user made independently.
6. **Deletion warning counts only the current bench's instances**, worded so it's clear other benches may also reference it.
7. **A media file dropped on a NEWLY added node inside a drilled entry becomes the entry's default** (blob copied to `lib.<id>/<rel>`, no marker); re-dropping on an existing node is an instance override (`vals[rel].media = true`, blob under the compiled id).
8. **Stale `vals` under deleted subtrees are pruned only by the wholesale write-back of a viewed level**; deeper stale keys are tolerated (bytes, not behavior).
