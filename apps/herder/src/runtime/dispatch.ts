/* The op dispatcher — the single choke point every mutation passes
   through (HANDOFF §10). The bench registers an applier at boot; every
   other layer reaches a mutation only by handing an op here.

   Three entrances, because three things happen to an op:

     dispatch(op)  the app WANTS this change — consult the gate (a session
                   installs one to block or defer a read-only/writer peer),
                   then apply it and tell the watchers. The bench applier
                   decides the mechanism (React Flow for the viewed level, a
                   tree write for a level that isn't mounted) so that
                   behavior is byte-for-byte what the scattered call sites
                   did before.

     record(op)    React Flow ALREADY applied this locally (a drag that
                   settled, a Delete-key removal) — do not re-apply, only
                   tell the watchers so the op still reaches the wire.

     applyRemote(op)  a REMOTE op arrived over the session wire — land it
                   through the applier in canonical mode (it is already
                   scoped), notifying watchers only when the host is
                   relaying a writer-peer's request.

   Echo suppression — the async-delivery problem. A remote removeNode (and
   the structural ops that drop wires: disconnect, setFlavor, togglePort)
   lands through React Flow — `rf.deleteElements`, `rf.setEdges` — which do
   NOT apply synchronously. deleteElements is `await`-ed inside xyflow; a
   setEdges pushes onto a batch queue flushed in a layout effect whose diff
   SYNTHESIZES the `{ type: 'remove' }` changes. The removal change therefore
   arrives a microtask (or a full commit) LATER, when handleNodesChange /
   handleEdgesChange fire and would record() the op back onto the wire. A
   synchronous "applyingRemote" window closed long before that echo lands, so
   it can't suppress it. Instead we keep a table of the element ids a remote
   application is EXPECTING React Flow to report back: the applier (which
   knows the compiled ids and can read rf.getEdges()) calls `expectEcho` at
   apply time; handleNodesChange/handleEdgesChange call `consumeEcho(id)`
   before recording and skip the wire emission when it consumes. Ids expire
   after ~2s so a mispredicted id (the removal RF never actually reports)
   can't silently swallow a legitimate future record of that same id.

   watchOps is the seam the network layer (M3) subscribes on: a host
   broadcasts every dispatched/recorded op; a peer feeds received ops back
   through applyRemote. Kept deliberately dumb — synchronous callbacks, no
   queue, no ordering machinery. That lives in the transport.

   The registry mirrors engineRef: the composition root (the bench)
   installs the live applier; until then dispatch is a no-op, exactly as
   a mutation before the bench mounts would be. */

import type { Op } from '../patch';

/** how an op is landed. `silent` forces the in-place tree write even
    when the op targets the viewed level — a MIDI CC must never ride a
    React render (relative encoders re-read the value they just wrote,
    and a CC burst would drop increments while React flushed). The op
    still reaches the wire; only the local mechanism changes.

    `recordOnly` means React Flow ALREADY applied the change locally (a
    settled drag, a Delete-key removal): the applier must NOT re-apply —
    no RF calls, no tree write, no bumps — but it MUST still canonicalize
    the raw compiled-id op, so the op reaching the wire carries the same
    scoped, entry-aware form a dispatched op would.

    `canonical` means the op is ALREADY scoped (it came off the wire, not
    from a call site holding a compiled id): skip canonicalize and route
    from the op's own scope. This is the remote entrance's mode.

    `query` marks a gateMode() pre-check, NOT a real dispatch: the gate
    returns its verdict (and still cues a block) but must leave no dispatch
    side effect behind — the peer gate skips stamping its pendingMode so a
    query before a record()-path spawn can't misclassify the record. */
export interface DispatchOpts { silent?: boolean; recordOnly?: boolean; canonical?: boolean; query?: boolean }

/** the session's veto on a local dispatch. Installed by the peer loop:
    a read-only peer blocks every op; a writer peer defers the ones that
    can't apply optimistically. Returning 'block' is expected to have
    already cued the UI (the gate owns the sessionStore.deniedAt bump, so
    runtime/ need not import session/). 'defer' records the op canonically
    (the request goes out; the host echo applies it); 'apply' is unchanged. */
export type Gate = (op: Op, opts: DispatchOpts) => 'apply' | 'defer' | 'block';

let applier: ((op: Op, opts: DispatchOpts) => Op) | null = null;
let gate: Gate | null = null;
const watchers = new Set<(op: Op) => void>();

/* the echo-suppression table (see the header): compiled element ids a
   remote application expects React Flow to report back as removals, each
   stamped with the time it was armed so a stale prediction lazily purges
   rather than shadowing a real record forever. */
const echoes = new Map<string, number>();
const ECHO_TTL_MS = 2000;

/** the applier arms the ids a remote structural op will make React Flow
    report back (the removed node id, its connected edge ids, a dropped
    edge id). Called at apply time, BEFORE the rf.deleteElements/setEdges
    that will asynchronously synthesize those removal changes. */
export function expectEcho(compiledIds: string[]): void {
  const now = Date.now();
  for (const id of compiledIds) echoes.set(id, now);
}

/** handleNodesChange/handleEdgesChange ask this on a removal before
    recording: true means the removal is a remote application's own echo
    (consume it and skip the wire emission), false means a genuine local
    edit to record. Lazily purges anything older than the TTL first, so a
    prediction that never materializes can't eat a legitimate later record
    of the same id. */
export function consumeEcho(id: string): boolean {
  const now = Date.now();
  for (const [k, t] of echoes) if (now - t > ECHO_TTL_MS) echoes.delete(k);
  return echoes.delete(id);
}

/** the bench installs the applier that lands an op — the one place
    that knows the viewed level and the React Flow state. It returns the
    canonical, network-ready op (a call site may address a node by its
    compiled view id; the applier resolves it to the scoped, level-local
    form the wire carries) */
export function registerApplier(fn: ((op: Op, opts: DispatchOpts) => Op) | null): void {
  applier = fn;
}

/** the session installs its gate here; null (no session) means every
    dispatch applies, exactly as before. */
export function setGate(g: Gate | null): void {
  gate = g;
}

/** ask the installed gate how an op would be handled — 'apply' when no
    gate. Call sites that run pre-dispatch side effects (blob copies, an
    entry mint, a resolution retune) consult this FIRST so a blocked op
    leaves no orphan state behind: they run the effects only on 'apply'/
    'defer' and bail on 'block'. This shares the gate's ordinary path, so
    a 'block' fires the very same cue a real dispatch would (the peer gate
    bumps deniedAt on block, rate-limited) — the denied flash is not lost
    when the caller bails instead of dispatching. A single representative
    op suffices: the gate decides by role, not by op kind. */
export function gateMode(op: Op): 'apply' | 'defer' | 'block' {
  return gate ? gate(op, { query: true }) : 'apply';
}

/** the app wants this change: consult the gate, then apply it locally
    and notify the wire with the canonical op the applier produced. With
    no gate installed the path is unchanged. */
export function dispatch(op: Op, opts: DispatchOpts = {}): void {
  const mode = gate ? gate(op, opts) : 'apply';
  if (mode === 'block') return;             // gate already cued deniedAt; no state touched
  if (mode === 'defer') {
    /* the change can't apply locally yet — canonicalize only (the request
       goes out; the host echo will apply it), then notify so the session
       sends it. recordOnly leaves no local change. */
    const canon = applier ? applier(op, { ...opts, recordOnly: true }) : op;
    notify(canon);
    return;
  }
  const canon = applier ? applier(op, opts) : op;
  notify(canon);
}

/** React Flow already applied this locally — do NOT re-apply, but run
    the op through the applier's canonicalize-only path so the wire
    carries the same scoped, entry-aware canon a dispatch would, then
    notify. The applier makes no local change under `recordOnly`. Ungated
    (RF already applied). A record that is really the ECHO of a remote
    application is caught upstream: handleNodesChange/handleEdgesChange
    call consumeEcho before reaching here, so a remotely-driven RF removal
    never re-enters the wire. */
export function record(op: Op): void {
  const canon = applier ? applier(op, { recordOnly: true }) : op;
  notify(canon);
}

/** the session's entrance: a remote op arrived. Land it in canonical
    mode (already scoped — no canonicalize). The applier arms the echo
    table for any removal React Flow will report back asynchronously, so
    the later handleNodesChange/handleEdgesChange record is suppressed
    there — this call returns before that echo ever lands. `notify` is set
    only when the HOST relays a writer-peer's request: the watcher emission
    IS the authoritative sequenced broadcast. */
export function applyRemote(op: Op, notify = false): void {
  let canon: Op = op;
  if (applier) canon = applier(op, { canonical: true });
  if (notify) for (const w of watchers) w(canon);
}

/* fan the op out to the watchers — the network layer's send seam */
function notify(op: Op): void {
  for (const w of watchers) w(op);
}

/** subscribe to the op stream (the network layer's seam); returns an
    unsubscribe */
export function watchOps(fn: (op: Op) => void): () => void {
  watchers.add(fn);
  return () => watchers.delete(fn);
}
