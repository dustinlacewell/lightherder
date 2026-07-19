# M3 — session/transport layer: implementation plan

All paths relative to `src/`. Design per HANDOFF §10/§12; this maps it to code. M4 (viewer) is outlined only where M3 must leave the seam.

## Signaling library: Trystero (v0.25.x, MIT)

Trystero's `makeAction` gives targeted per-peer sends, binary Blob transfer with automatic chunking + progress callbacks, and `rtcConfig`/`turnConfig` passthrough — the entire blob-transfer and signaling layer we'd otherwise hand-roll, over zero-own-infra strategies (nostr default, hundreds of public relays). Hand-rolled RTCPeerConnection + copy-paste signaling saves ~30kB but re-implements chunking, reconnect detection, and multi-peer offer plumbing for no gain.

- Import: `import { joinRoom, selfId } from 'trystero'` (nostr strategy). `joinRoom({ appId: 'herder', password: roomCode, turnConfig: [openRelay] }, roomCode)` — `password` AES-GCM-encrypts signaling for free.
- Trystero builds a full mesh; the **star is enforced at protocol level**: peers only honor `op`/`eph`/`snap` messages whose sender is the host, and only the host services `req`. Idle peer↔peer channels are harmless at session scale.
- TURN default: Open Relay (metered.ca free tier) static credentials in `session/room.ts`, overridable by env.

---

## A · The session module — `src/session/`

Layer position: imports `patch/`, `persist/`, `runtime/` (+ `trystero`). **Never imports `ui/`** — remote application goes through the dispatcher's registered applier, so M4's viewer can register a headless applier against the same seam.

| file | contents |
|---|---|
| `session/index.ts` | public surface (below) |
| `session/store.ts` | `sessionStore` — subscribable state singleton, `useSyncExternalStore`-shaped like `libStore` |
| `session/room.ts` | Trystero wrapper: `joinRoom`, action creation (`ctl`/`op`/`req`/`eph`/`blob`/`snap`), TURN config |
| `session/protocol.ts` | envelope types + versioning (`{ v: 1 }` in hello) |
| `session/host.ts` | host loop: `watchOps` → seq → broadcast; `req` validation; join servicing; permissions |
| `session/peer.ts` | peer loop: gate install, request send + coalescing, echo table, seq-ordered apply buffer, pending-blob holds |
| `session/apply.ts` | remote application: ops → `applyRemote`, ephemera → muted runtime calls, blob → `storeMedia` + `engineRef.loadMedia` |
| `session/snapshot.ts` | host assembly + peer join-swap |
| `session/blobKeys.ts` | `mediaKeysOf(mirrorNodes, entries)` — enumerate both key spaces |

Public surface (`session/index.ts`):

```ts
export interface SessionDeps { root(): SubPatch; rebuild(next: SubPatch): void }  // injected by Bench
export function createSession(deps: SessionDeps): Promise<void>;        // mints room code, becomes host
export function joinSession(code: string, deps: SessionDeps): Promise<void>;
export function leaveSession(): Promise<void>;                          // room.leave() + peer-side restore
export function setWrite(peerId: string, on: boolean): void;            // host only
export function setFollow(on: boolean): void;                           // peer: follow host pin
export const sessionStore: { state(): SessionState; version(): number; subscribe(fn): () => void };
// SessionState: { phase: 'idle'|'joining'|'live'|'ended', role: 'host'|'peer'|null, code: string|null,
//   selfId: string, peers: { id: string; write: boolean }[], write: boolean, follow: boolean,
//   remotePin: string|null, deniedAt: number, progress?: { key: string; pct: number } }
```

- **Data-channel lifecycle**: Trystero owns RTCPeerConnections and channels; the session owns the room handle. `leaveSession` tears down watchers (`watchOps` unsub, gate uninstall, ephemera unsub) then `room.leave()`.
- **Reconnection (simplest honest v1)**: a dropped peer rejoining is just `joinSession` again — fresh snapshot, no resume tokens, no op replay log. `onPeerLeave(hostId)` on a peer → phase `'ended'`; the local engine keeps running the last state; hitting Leave restores the stashed pre-session bench. Host holds the only authoritative doc + seq counter, so host-drop = session over; host migration is v2 machinery.
- Host identification: the creator broadcasts `ctl:{t:'host', id: selfId, seq}` on join and answers every `ctl:{t:'hello'}`. A joiner that hears no host claim within ~8s shows "no host in this room".

## B · Wire protocol

Actions (each a named Trystero action; ordered-reliable data channels underneath):

```
ctl   JSON   hello / host / welcome / peers / perm / ready / reject / bye
op    JSON   host→all: { q: seq, f: originPeerId, cs?: clientSeq, op: Op, b?: string[] /* blob deps */ }
req   JSON   peer→host: { cs: clientSeq, op: Op, b?: string[] }        (canonical ops only)
eph   JSON   ephemera (see E) — host→all, and writer-peer→host (host rebroadcasts, tagged f)
blob  binary Blob with metadata { key, mime } — Trystero chunks automatically; onReceiveProgress → store.progress
snap  JSON   host→joiner (targeted): { seq, patch, globals, entries, pin, frozen, blobKeys: string[] }
```

- **Sequencing**: host keeps `let seq = 0`; every `op` broadcast gets `++seq` at broadcast time (post-coalescing — no gaps). `snap` and `op` are different channels, so seq aligns them: joiner buffers every `op` from connect and, after applying the snapshot, plays the buffer for `q > snap.seq` in order (holes → wait; a >5s hole on a reliable channel = broken session → auto-rejoin).
- **Join handshake** — host: `onPeerJoin`/`hello` → send `host` → serialize doc+library+globals synchronously (the consistent point, stamped with current `seq`) → async-read blobs → send `snap` then `blob`s targeted → peer applies → `ctl:{t:'ready'}` → host broadcasts updated `peers`.
- **Host-sequenced ops**: host's own ops flow `dispatch/record → watchOps → session watcher assigns seq → broadcast (f=hostId)`. A writing peer's op is a **request**: host validates perms, applies via `applyRemote(op, { notify: true })` — the applier notifies `watchOps`, whose emission *is* the authoritative sequenced broadcast (host session sets pendingFrom/pendingCs synchronously around the apply so the watcher can tag `f`/`cs`).
- **Non-optimistic peers, two carve-outs**:
  1. **`setParam`/`setSel` local echo via the normal viewed path, not silent.** Knob is fully controlled, so a silent in-place echo would freeze the knob mid-drag. Value ops apply locally exactly as today (full-rate, `applyViewed` render), the wire request is coalesced (latest-wins per `node:key`, flushed at 30Hz), and the peer skips host echoes of its own value ops (`f === selfId`). Host echo reconciles everyone else.
  2. **record-path ops are inherently local-first.** React Flow applies drags/Delete-key removals before `record()` fires; they stay local-applied, the peer sends the request and skips its own echo (tracked per `cs`). All are LWW-safe (moveNode) or idempotent (removeNode).
  - Everything else a writing peer dispatches (connect, disconnect, rename, setProp, togglePort, setFlavor, entryCreate/Delete, replaceGraph, setGlobal) is **deferred**: `dispatch` runs the applier in recordOnly mode (canonicalize only), the request goes out, the host echo applies it. 100–300ms on a wire drag is acceptable v1. A `reject` (perms revoked mid-flight) → peer auto-rejoins (fresh snapshot — the one honest resync).
- Peer-originated `entryCreate` (saveHere) carries its entry-default blob keys in `req.b`; the peer sends those blobs to the host first; host stores, then rebroadcasts op + blobs.

## C · Remote application

**A separate remote entrance on the dispatcher** (origin as functions — no reentry guard needed because remote application never rides `dispatch()`):

`runtime/dispatch.ts` additions:

```ts
export interface DispatchOpts { silent?: boolean; recordOnly?: boolean; canonical?: boolean }
export type Gate = (op: Op, opts: DispatchOpts) => 'apply' | 'defer' | 'block';
export function setGate(g: Gate | null): void;
export function applyRemote(op: Op, notify = false): void {      // session's entrance
  const canon = applier ? applier(op, { canonical: true }) : op;
  if (notify) for (const w of watchers) w(canon);                // host relaying a peer request
}
// dispatch(): const mode = gate?.(op, opts) ?? 'apply';
//   'block' → sessionStore cue (gate bumps deniedAt), return;
//   'defer' → canon = applier(op, {...opts, recordOnly: true}); notify watchers; return;
//   'apply' → unchanged.
// record(): un-gated (RF already applied); notify as today.
```

Loop closure: `applyViewed`'s `removeNode` uses `rf.deleteElements` → `handleNodesChange` → `record(removeNode)` — on a peer applying a remote remove that would request an op it just received. Fix: a module-level `applyingRemote` flag in `dispatch.ts`, set inside `applyRemote`, checked by `record()`/`dispatch()`'s watcher notify (canon-only application still runs; nothing reaches the wire). Also silences today's harmless double-emission of viewed removes on the host.

**`useOps.ts` — canonical mode.** When `opts.canonical`, the op is already scoped; skip `canonicalize` and derive routing from the scope (new dep `viewEntry: () => string | null` on `OpsDeps`, read off the last crumb's `entry.id`):

- **doc scope**: viewed ⇔ `scope.path.join('/') === viewPath().join('/')`. Compiled ids reconstructed: node ops → `prefix + op.node`; value ops with `rel` → `prefix + op.node + '/' + op.rel`; connect → prefix both ends + `makeEdge` id; disconnect → `prefix + op.id`.
- **entry scope**: viewed ⇔ `viewEntry() === scope.id` (catches viewing through *any* instance) → `applyViewed` with `prefix + local` ids; the subsequent write-back (`writeEntry`) lands it in the entry. Unviewed → existing in-place branch verbatim: `applyOp` on the entry + `bumpDoc()` + `libStore.touch()` + the removeNode release/`sweepEntryVals` sweeps.

Per-kind application map (§12 rules made explicit):

| op kind | viewed level | unviewed |
|---|---|---|
| setParam/setSel (no rel) | `applyViewed` (RF render) | `applyOp` in place — aliasing carries to mirror, no bump |
| setParam/setSel (rel) | `applyOp` (vals) + `writeParam` (mirror + RF in place) | same, minus RF write |
| markMedia | forced in-place + `bumpDoc` | same |
| rename/setProp/setFlavor/togglePort/moveNode/addNode/connect/disconnect | `applyViewed` | `applyOp` + `bumpDoc` |
| removeNode (doc) | `applyViewed` (releases) | `applyOp` + `bumpDoc` + **release fix**: the in-place branch currently discards `OpEffect.removed` — add `releaseNode(scopePrefix + rid)` per removed id |
| removeNode (entry) | `applyViewed` → `handleNodesChange` sibling sweep | existing entry branch (instancePrefixes sweep + sweepEntryVals) |
| entryCreate/Rename/Delete | pre-canonicalize branch as-is; entryDelete while a peer is drilled inside → `touch` → projection finds `viewContext` null → `setPath([])` (already handled) | same |
| setGlobal | `mirror.globals[k] = v` — **move the `res → engineRef.setResolution` retune from GlobalsBar into this applier branch** (behavior-preserving; remote res changes then retune too) | same |
| replaceGraph | `rebuild` — legitimately drops rings (host pressed New; that's the semantics) | same |

**Never rebuild otherwise** — remote ops recompile via `bumpDoc` at most; compiled ids are stable, rings stay warm.

**Gap found — edge deletions never reach the wire**: `useBench` passes RF's raw `onEdgesChange` through; deleting a selected edge is applied + written back but no op is recorded. M3 wraps it: `handleEdgesChange` records `{ kind: 'disconnect', scope: <from view>, id: strip(ch.id) }` for `ch.type === 'remove'`.

**Blob-dependency ordering**: `blob` and `op` are separate channels — no cross-channel ordering. Envelope `b: string[]` lists dependencies (host computes: markMedia → the compiled override key; entryCreate → `mediaPaths(entry.patch)` keys; the `eph media` message → its key). `session/peer.ts` holds any op whose `b` keys aren't all in `receivedBlobs`; blob arrival flushes held ops in seq order; a 10s timeout applies anyway (missing blob = degraded, not broken).

## D · Join snapshot

**Host assembly** (`session/snapshot.ts`):
- Doc: `graphToJSON(deps.root())` + `mirror.globals` + `stage.preview.nodeId` + `transport.frozen` + current `seq` — one synchronous pass.
- Library: `libStore.doc.entries.map(e => ({ id, name, patch: graphToJSON(e.patch) }))`.
- Blob keys (`session/blobKeys.ts`), both key spaces: mirror media nodes → `n.data.mediaKey ?? n.id` (covers root nodes, instance overrides, instantiated entry defaults); mirror draw nodes → `n.id`; plus every entry → `mediaPaths(e.patch).map(rel => `${e.id}/${rel}`)` (uninstantiated entries a peer might drop later).
- **Draw surfaces**: `DrawSource` already PNG-persists to mediaStore on `commit()`/`clear()` and restores at construction — stored PNGs are only as fresh as the last pointer-up. **M3 adds `snapshot(): Promise<Blob|null>`** (promisified `cv.toBlob`) to `DrawSurface` (`runtime/engineRef.ts` interface + `engine/sources/draw.ts`). Host uses `drawFor(id).snapshot()` for live draw nodes, `loadStoredMedia(key)` for everything else.

**Peer apply — live-swap via the existing `rebuild`, keeping the boot path single.** Call `deps.rebuild` **directly, never via `dispatch(replaceGraph)`** (that would notify watchers → the peer would *request* a replaceGraph). Sequence in `applyJoin`, engineered around the one real hazard — colliding IDB keys between the peer's old bench and the host's (engine `dropNode` fire-and-forgets `dropStoredMediaUnder`):

1. **Stash** (awaited): copy `herder.patch.v1` + `herder.library.v1` to `.sessionstash` twins (new `persist/sessionStash.ts`: `stashDocs/restoreDocs/hasStash/dropStash`); `copyStoredMedia(key, 'stash/' + key)` for every old blob key.
2. `deps.rebuild({ nodes: [], edges: [] })` — releases every old node.
3. Await own `dropStoredMediaUnder(key)` for all old keys (idempotent with the engine's), then one `setTimeout(50)` macrotask — belt over IDB transaction ordering.
4. `await Promise.all(storeMedia(key, blob))` for all snapshot blobs — must precede first source construction (`MediaSource`/`DrawSource` constructors read `loadStoredMedia` exactly once).
5. `libStore.doc.entries = parsedEntries`; `libStore.touch()`.
6. `mirror.globals = snap.globals`; `setResolution(globals.res)`; `transport.frozen = snap.frozen`; `sessionStore.remotePin = snap.pin`; `deps.rebuild(graphFromJSON(snap.patch))`.
7. Phase `'live'`; flush the op buffer for `q > snap.seq`.

Peer persistence keeps running during the session (harmless — Leave restores the stash). **Unclean exit**: a stash existing at boot means the tab died mid-session → `boot.ts` calls `restoreSessionStash()` before `loadPatch()`. On Leave: `restoreDocs()` + restore stashed blobs + delete session-imported keys + `deps.rebuild(loadPatch())`.

## E · Gesture + ephemera relay

New `runtime/ephemera.ts` — same shape as `dispatch`:

```ts
export type Eph =
  | { t: 'spark'|'tap'; id: string; x: number; y: number }
  | { t: 'hold'; id: string; input: number } | { t: 'unhold'; id: string }
  | { t: 'stroke'; id: string; x0,y0,x1,y1,hue,size: number } | { t: 'drawcommit'|'drawclear'; id: string }
  | { t: 'pin'; id: string | null } | { t: 'frozen'; on: boolean } | { t: 'tick' } | { t: 'clearAll' }
  | { t: 'media'; key: string; blob: Blob };
export function emitEph(e: Eph): void;          // no-op while muted
export function watchEph(fn): () => void;       // the session's seam
export function muted<T>(fn: () => T): T;       // remote application wrapper
```

Hook points (call-site swaps, no UI rewrite):
- **Sparks/taps/holds**: `runtime/gestures.ts` `spark`/`tap`/`holdSwitch`/`releaseSwitch` gain one `emitEph` line each — Shell.tsx / devices.tsx untouched.
- **Draw strokes**: new runtime helpers `drawStroke/drawCommit/drawClear` = `engineRef.drawFor(id).…` + emit. Swap the four call sites in `sources.tsx`. Peers replay strokes → their DrawSource mutates + commits identically.
- **Media drops**: `MediaNode.load` adds `emitEph({ t:'media', key, blob: f })` after each successful loadMedia (both branches — the markMedia *op* rides the op stream; the blob rides this).
- **Transport**: `runtime/transport.ts` gains `setFrozen(on)`; `stepOnce()`/`clearAllScreens()` runtime helpers (engineRef call + emit); call sites in Transport.tsx and Bench.tsx swap.
- **Pin**: `usePreviewPin` — `useEffect(() => emitEph({ t:'pin', id: shownId ?? null }), [shownId])`. Peer: `sessionStore.remotePin`; when follow is on, `shownId = follow && remotePin !== undefined ? remotePin : (locked ? pinnedId : selectedId ?? pinnedId)`. The lock toggle stays the escape hatch (turning follow off).
- **Globals**: already ops — nothing to relay; remote repaint via a sessionStore subscription in GlobalsBar; useFreeze re-reads `transport.frozen` on session-version change.

Session side: `watchEph` → send on `eph` (batched per animation frame). Remote: `session/apply.ts` wraps in `muted(() => …)` calling the same runtime functions (`media` → `storeMedia` + `loadMedia`). Direction: host→all always; a write-enabled peer's gestures go peer→host, host rebroadcasts; read-only peers' gestures are not sent (H5).

## F · Permissions + session UI

- Host holds `Map<peerId, { write: boolean }>`; broadcasts `ctl:{t:'peers'}` on change; validates every `req` (drop + reject if unauthorized — never trust the client gate).
- **Peer-side blocking: the dispatcher choke point.** The session installs the Gate: read-only → `'block'` for every op; write → `'defer'`/`'apply'` per B. record-path prevention for read-only peers at React Flow: `nodesDraggable={canWrite} nodesConnectable={canWrite} edgesFocusable={canWrite} deleteKeyCode={canWrite ? [...] : null}` (selection/panning stay on — it's a viewer, not a screenshot).
- **Cue**: a `read-only` pill in the topcenter strip whenever `phase==='live' && !write`; the gate bumps `deniedAt` and the pill flashes.
- **Panel**: `ui/panels/SessionPanel.tsx`, copying the MidiLog idiom (toggled fixed pane, UtilBar toggle), list styling from LibraryPanel. Contents: Create (5-char room code + copy-link `#room=` URL), Join input, phase dot, peer list with write toggles (host) / own badge (peer), follow-pin toggle (peer), transfer progress during joining, Leave. URL auto-join: Bench mount effect parses `location.hash`.
- MIDI on a read-only peer: silent setParam → gate blocks — no special-casing.

## G · Staged commits (each `npx tsc && pnpm build` green)

1. **S1 — session skeleton** *(pure addition)*: trystero dep; session/ room/store/protocol; SessionPanel + UtilBar toggle; ctl hello/host/peers only. Adversary: no session → zero behavior change; two tabs same room see each other's peer rows; host-drop flips phase.
2. **S2 — ephemera seams** *(runtime + 4 UI files)*: `runtime/ephemera.ts`; emit lines in gestures.ts; draw/transport helpers; call-site swaps in sources.tsx, Transport.tsx, Bench.tsx, usePreviewPin.ts; `DrawSurface.snapshot()`. Adversary: with no session, every gesture/draw/freeze/clear/pin behaves byte-identically; draw commit still persists; sampleSpark still consumes taps.
3. **S3 — read-only op stream, host→peer** *(the heavy seam commit — dispatch.ts, useOps.ts, useBench.ts)*: applyRemote + canonical mode + Gate + applyingRemote flag; viewEntry dep; in-place removeNode release fix; res retune move; handleEdgesChange disconnect recording; host seq broadcast + peer ordered apply (all peers read-only). Adversary: no-session local editing byte-identical; remote setParam on an unviewed module keeps rings warm; remote structural op on the peer's viewed level survives the next write-back; remote entry op while peer views that entry through a different instance routes viewed; unviewed entry op bumps + touches + reprojects via libVer accounting; no echo loop through deleteElements→record; rebuild never called except replaceGraph.
4. **S4 — join snapshot** *(boot.ts, persist/)*: blobKeys, snapshot assemble/apply, sessionStash, boot orphan-stash restore, progress UI. Adversary: joiner's picture matches host doc (knobs, entries, media incl. overrides, draw PNGs, pin, frozen); peer's own bench + blobs restored on Leave and after a mid-session tab kill; colliding node ids don't lose blobs; ops during transfer land exactly once.
5. **S5 — write permissions + peer requests**: defer/echo machinery (cs table), knob coalescing @30Hz, req validation + reject→rejoin, blob-carrying entryCreate requests, RO UI. Adversary: peer knob drag full-rate locally with no echo fight; deferred connect arrives once, ordered; revoke mid-drag converges via rejoin; host never applies an unauthorized req.
6. **S6 — polish**: pin-follow wiring, GlobalsBar/useFreeze session subscriptions, URL-hash join, TURN config + password, gesture relay from writer peers.

## H · Decisions (defaults taken; veto any)

1. **Signaling**: Trystero over nostr, room password = room code.
2. **TURN on by default**: Open Relay free-tier creds in the default turnConfig.
3. **Join replaces your bench, stash + auto-restore** on Leave or post-crash boot.
4. **Host drop = session ends but the peer keeps playing** the last state until Leave (which restores).
5. **Read-only peers may spark/draw locally** (their light diverges; nothing relayed) — veto for full lockout.
6. **Peers unnamed in v1** (ids shown truncated).
7. **Follow-host-pin defaults OFF for bench peers** (editor-leaning; M4's viewer defaults ON).

M4 seam: `session/` never touches `ui/`; the viewer entry (`viewer.html` + a headless applier: `applyOp → compile → mirror` + releases, registered via `registerApplier`) rides `applyRemote`/`applyEph`/`applyJoin` unchanged, with `stage.preview` on a full-window face and follow hard-on.
