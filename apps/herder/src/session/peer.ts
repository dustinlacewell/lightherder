/* The peer loop — the receiving half of a session.

   A peer greets the room, learns who is host, then takes the join
   snapshot (S4) and, once its bench IS the host's, applies the op stream:

     · JOIN — the snap fixes the consistent document at a seq; the blobs
       stream after it on a separate channel. The peer COLLECTS the snap
       and every announced blob first (blobs and ops race the snap on
       different channels), then live-swaps its bench to the host's in one
       ordered sequence (snapshot.ts). Until that swap completes the op
       stream is buffered, never applied — the graph it addresses does not
       exist yet.

     · OP STREAM — after the swap, ops apply in strict sequence order from
       the snapshot's seq baseline; anything that arrived early (buffered
       from connect) replays for q > snap.seq, so a raced op lands exactly
       once. A hole that never fills means the reliable channel broke.

     · GATE (S5) — the write bit governs the choke point. Read-only: block
       every op. Write-granted: `setParam`/`setSel` and the record-path ops
       (drag/Delete) apply locally full-rate — the peer is non-optimistic
       only for the DEFERRED kinds (connect, rename, entryCreate, …), which
       recordOnly-canonicalize and wait for the host echo. Every request the
       peer sends is tracked per client-seq (`sentLocal`); the host echo of
       a locally-applied op is SKIPPED (it was already applied), a deferred
       op's echo APPLIES. A reject means the host refused — a locally-applied
       op diverged our state, so we auto-rejoin (fresh snapshot); a deferred
       op's reject just drops the pending cs.

   Only the host's messages are honored: an op, blob, snap or roster from
   anyone else is dropped, so the mesh Trystero builds stays a star. */

import { mediaPaths, type Op, type SubPatch } from '../patch';
import { applyRemote, engineRef, setGate, watchOps, type DispatchOpts } from '../runtime';
import { loadStoredMedia } from '../persist';
import { relayHealth, selfId } from './room';
import { sessionStore } from './store';
import { applyJoin, abortJoin, type HeldBlob } from './snapshot';
import { getLive, type Live } from './live';
import { opFromWire, opToWire } from './wireOps';
import type { BlobMeta, ReqMsg, SnapMsg } from './protocol';
import { PROTOCOL_VERSION } from './protocol';

/* how long a joiner waits for a host claim before giving up */
const HOST_WAIT_MS = 8000;
/* a hole in the op sequence that never fills means the reliable channel
   broke — the session ends and the peer keeps its last light until Leave */
const HOLE_MS = 5000;
/* how long to wait for the announced blobs before swapping anyway — a
   blob that never arrives leaves its source on its stained glass
   (degraded, not broken) */
const BLOB_WAIT_MS = 15000;
/* the wire request for value ops (knob drags) is coalesced latest-wins per
   node:key and flushed at this cadence — the knob stays full-rate LOCALLY,
   only its wire echo is rate-limited (carve-out #1) */
const FLUSH_MS = 33;   // ~30Hz

/** greet the room, wait for a host, take the snapshot, apply the op
    stream, install the write-aware gate. */
export function installPeer(l: Live): void {
  const { ctl } = l.room.actions;

  l.hostWait = setTimeout(() => {
    /* no host answered — the room is empty or hostless. Stay put and let
       the panel show it; Leave tears down. */
    if (l.hostId === null) sessionStore.set({ phase: 'ended' });
  }, HOST_WAIT_MS);

  /* surface signaling-relay health into the store while joining, so a
     "waiting for host" that is really a relay-pool failure is diagnosable
     from the panel (the console showed damus rate-limiting the whole join).
     Cleared once live/torn-down. */
  const relayPoll = setInterval(() => {
    if (sessionStore.state().phase !== 'joining') return;
    const { open, total } = relayHealth();
    sessionStore.set({ relayNote: `${open}/${total} relays connected` });
  }, 1500);
  l.teardown.push(() => clearInterval(relayPoll));

  ctl.onMessage((msg, from) => {
    if (msg.t === 'host') {
      if (l.hostId !== null) return;      // first claim wins
      l.hostId = from;
      if (l.hostWait) { clearTimeout(l.hostWait); l.hostWait = null; }
      /* stay in 'joining' — the snapshot flips to 'live' once the bench is
         swapped in. The claim alone means a host exists, not that we are
         synced. */
      return;
    }
    if (msg.t === 'peers') {
      if (from !== l.hostId) return;      // only the host's roster counts
      const self = msg.peers.find(p => p.id === selfId);
      sessionStore.set({ peers: msg.peers, write: self?.write ?? false });
      return;
    }
    if (msg.t === 'reject') {
      if (from !== l.hostId) return;
      onReject(l, msg.cs);
      return;
    }
    if (msg.t === 'sync') {
      /* the host pushed a sync-all: re-take the snapshot exactly as a
         reject-rejoin does. Mid-join (not yet swapped) the collector is
         already armed and a snapshot already on its way — ignore. */
      if (from !== l.hostId || !l.swapped) return;
      l.restartJoin?.();
      void ctl.send({ t: 'resync' }, from);
      return;
    }
  });

  /* the host leaving ends the session; if the swap already completed the
     peer keeps its last light until Leave restores. If it leaves while we
     are still COLLECTING, the join is aborted cleanly (the bench was never
     swapped — restore is the cheap path). */
  l.room.onPeerLeave(id => {
    if (id !== l.hostId) return;
    if (l.swapped) sessionStore.set({ phase: 'ended' });
    else abortJoin(l);
  });

  /* op-apply installs first and hands back its drain (flush the buffer the
     instant the swap sets the seq baseline) and its clearHole (a resync must
     disarm a pre-reject op-gap timer so it can't fire 'ended' mid-resync) */
  const { drain, clearHole } = installOpApply(l);
  installJoin(l, drain, clearHole);
  installGate(l);

  /* greet the room and ask who's host */
  void ctl.send({ t: 'hello', v: PROTOCOL_VERSION });
}

/* ---- the echo table: per-cs reconciliation --------------------------- */

/* every request this peer sends is stamped with a client-seq and remembered
   here until its host echo returns. `localApplied` is true for a value op
   (applied full-rate) and a record-path op (RF already applied): its echo
   is SKIPPED (dropping a redundant re-apply that would fight a live drag).
   `localApplied` is false for a deferred op: its echo APPLIES (that IS the
   application). A reject reads the flag too — a locally-applied op's reject
   rejoins (our state diverged), a deferred op's does not. */
interface SentEntry { localApplied: boolean }

/* the peer's request-side state, kept on the closure of installGate so the
   gate, the coalescer and the reconciler share one table. */
interface PeerReq {
  sentLocal: Map<number, SentEntry>;
  nextCs: number;
  /* the pending client-seq the gate classified for the op currently being
     dispatched: 'apply' → locally applied, 'defer' → deferred, null → a
     record-path op (RF applied, no gate call) which is locally applied. */
  pendingMode: 'apply' | 'defer' | null;
}

/* ---- the write-aware gate + request sender --------------------------- */

/* the choke point (F). Read-only → block. Write → classify per B: value
   ops and record-path ops apply locally, deferred ops recordOnly. The gate
   only DECIDES here (and cues deniedAt on block); the actual request send
   happens on the watchOps subscription, which sees the canonical op the
   applier produced. The bridge between them is `pendingMode`: the gate sets
   it synchronously, the (synchronous) watcher reads and clears it. */
function installGate(l: Live): void {
  const req: PeerReq = { sentLocal: new Map(), nextCs: 1, pendingMode: null };
  l.peerReq = req;

  let lastDenied = 0;
  const DENY_COOLDOWN_MS = 800;

  setGate((op: Op, opts: DispatchOpts) => {
    const s = sessionStore.state();
    const peer = (s.phase === 'live' || s.phase === 'joining') && s.role === 'peer';
    if (!peer) return 'apply';               // host, or no session: unchanged
    /* read-only, OR mid-swap (joining, or the sliver where phase flipped to
       'live' before l.swapped set): block. Even a WRITE-granted peer must
       not edit while its bench is not yet the host's — an op applied against
       the old (or half-torn-down) graph would diverge from the snapshot the
       swap is about to install, and a deferred one would race the seq
       baseline. Blocking until swapped covers the initial join AND every
       resync window (restartJoin drops swapped). */
    if (!s.write || !l.swapped) {
      /* block, cue the pill (rate-limited so a CC burst doesn't storm every
         subscriber's render). */
      const now = Date.now();
      if (now - lastDenied >= DENY_COOLDOWN_MS) { lastDenied = now; sessionStore.set({ deniedAt: now }); }
      if (!opts.query) req.pendingMode = null;
      return 'block';
    }
    /* write-granted: value ops apply locally full-rate (carve-out #1);
       everything else defers (the host echo applies it). Record-path ops
       never reach the gate — they ride record(), classified null below.

       A query (gateMode pre-check) leaves pendingMode ALONE: it decides by
       role, not op kind, so its verdict is right, but stamping pendingMode
       here would misclassify the record()-path spawn that follows the check
       (a spawn asks gateMode first, then record()s — the record must read a
       clean null, meaning locally applied). */
    const value = op.kind === 'setParam' || op.kind === 'setSel';
    if (!opts.query) req.pendingMode = value ? 'apply' : 'defer';
    return value ? 'apply' : 'defer';
  });

  installReqSender(l, req);

  l.teardown.push(() => setGate(null));
}

/* convert the op stream the applier produces into wire requests. Every
   canonical op the dispatcher notifies passes here:

     · a value op (coalesced): merged latest-wins per node:key into a
       pending map, flushed at ~30Hz as one req with one fresh cs.
     · a deferred op (pendingMode 'defer'): sent immediately, its cs marked
       NOT locally applied (the echo will apply it). An entryCreate ships
       its entry's blob deps first (below).
     · a record-path op (pendingMode null — RF already applied): sent
       immediately, its cs marked locally applied (the echo is skipped).

   Only a peer sends; the host's own watchOps drives its broadcast (host.ts)
   and never installs this. */
function installReqSender(l: Live, req: PeerReq): void {
  /* the coalescer: latest value op per "node:key", plus whether the level
     is entry/doc so its scope survives the merge. Flushed on a timer. */
  const pending = new Map<string, Op>();
  let flush: ReturnType<typeof setInterval> | null = null;

  /* `localApplied` is captured at the CALL site from the gate's classified
     mode — never re-read from req.pendingMode, which the watcher has already
     cleared by send time. A deferred op is NOT locally applied (its host
     echo IS its application); a record-path op IS. */
  const send = (op: Op, localApplied: boolean, blobs?: string[]): void => {
    const cs = req.nextCs++;
    req.sentLocal.set(cs, { localApplied });
    /* wire-encode: a structural op's live slot trees would lose their
       source bodies to JSON serialization (wireOps.ts) */
    const w = opToWire(op);
    const msg: ReqMsg = blobs && blobs.length ? { cs, op: w, b: blobs } : { cs, op: w };
    void l.room.actions.req.send(msg);
  };

  const stopFlush = (): void => { if (flush) { clearInterval(flush); flush = null; } };

  const doFlush = (): void => {
    /* nothing pending → the drag settled: stop the timer so an idle session
       isn't ticking a no-op every 33ms. The next value write re-arms it
       (the push below arms when `!flush`). Final-value semantics are
       unchanged — the last coalesced value already flushed on a prior tick. */
    if (!pending.size) { stopFlush(); return; }
    const ops = [...pending.values()];
    pending.clear();
    /* one cs per coalesced op — each latest-wins value carries its own
       request so the host echo can be matched and skipped per key. */
    for (const op of ops) {
      const cs = req.nextCs++;
      req.sentLocal.set(cs, { localApplied: true });   // value ops apply locally
      void l.room.actions.req.send({ cs, op: opToWire(op) });
    }
  };

  const off = watchOps(op => {
    const mode = req.pendingMode;
    req.pendingMode = null;                  // consume the gate's classification

    /* value op — coalesce latest-wins per node:key/sel, flush at 30Hz */
    if (op.kind === 'setParam' || op.kind === 'setSel') {
      const key = op.kind === 'setParam'
        ? `${valScope(op)}:${op.node}:${op.rel ?? ''}:p:${op.key}`
        : `${valScope(op)}:${op.node}:${op.rel ?? ''}:s`;
      pending.set(key, op);
      if (!flush) flush = setInterval(doFlush, FLUSH_MS);
      return;
    }

    /* a deferred entryCreate carries its entry's default pictures: ship the
       blob frames FIRST (the bytes exist locally — saveHere copied them
       before dispatch), then the req naming them in `b`, so the host holds
       the req until they land (host.ts's held-req machinery). */
    if (op.kind === 'entryCreate' && mode === 'defer') {
      void shipEntryBlobs(l, op).then(keys => send(op, false, keys));   // deferred: echo applies
      return;
    }

    /* deferred (mode 'defer', echo applies) or record-path (mode null, RF
       already applied so its echo is skipped) — sent at once */
    send(op, mode !== 'defer');
  });

  l.teardown.push(() => {
    off();
    if (flush) { clearInterval(flush); flush = null; }
    pending.clear();
    l.room.actions.req.onMessage(null);
  });
}

/* an entryCreate's blob keys are `<entryId>/<rel>` for each media node in
   the entry's own patch (mediaPaths names the level-local rel ids). Read
   each blob and send it on the blob channel; return the keys so the req
   names them as deps. A blob the store lacks is simply skipped (degraded). */
async function shipEntryBlobs(l: Live, op: Extract<Op, { kind: 'entryCreate' }>): Promise<string[]> {
  const patch = op.entry.patch as SubPatch;
  const rels = mediaPaths(patch);
  const keys: string[] = [];
  for (const rel of rels) {
    const key = `${op.entry.id}/${rel}`;
    const blob = await loadStoredMedia(key);
    if (!blob) continue;
    keys.push(key);
    void l.room.actions.blob.send(blob, { key, mime: blob.type || 'application/octet-stream' });
  }
  return keys;
}

/* the coalescer key needs the op's scope so a doc value and an entry value
   at the "same" local id don't collide — a short discriminant is enough */
function valScope(op: Op): string {
  if (op.kind !== 'setParam' && op.kind !== 'setSel') return '';
  return op.scope.kind === 'entry' ? 'e:' + op.scope.id : 'd:' + op.scope.path.join('/');
}

/* ---- reject → the honest resync -------------------------------------- */

/* the host refused a request. If the cs was LOCALLY APPLIED (a value or a
   record-path op), the peer's state diverged from the host's authoritative
   truth — the only honest fix is a fresh snapshot: re-run the join flow
   (restartJoin re-arms the collectors; the op machinery stays installed),
   and ask the host to re-serve (onPeerJoin won't fire — we're connected).
   If the cs was DEFERRED, nothing was applied locally, so there is nothing
   to converge — just drop the pending cs and cue the denied flash. A cs the
   table no longer knows (already reconciled) is ignored. */
function onReject(l: Live, cs: number): void {
  const req = l.peerReq;
  const entry = req?.sentLocal.get(cs);
  if (!req || !entry) return;
  req.sentLocal.delete(cs);
  /* a resync is already under way (a prior reject flipped us to 'joining'):
     the fresh snapshot will converge everything, so a SECOND locally-applied
     reject arriving in the revoke→roster RTT window (the user kept dragging)
     must not stack another restartJoin/resync cycle. The pending cs is
     already dropped above; just cue the flash and bail. */
  if (sessionStore.state().phase === 'joining') { sessionStore.set({ deniedAt: Date.now() }); return; }
  if (!entry.localApplied) {
    sessionStore.set({ deniedAt: Date.now() });   // a deferred op simply denied
    return;
  }
  /* a locally-applied op was refused — rejoin to converge */
  sessionStore.set({ deniedAt: Date.now() });
  l.restartJoin?.();
  void l.room.actions.ctl.send({ t: 'resync' }, l.hostId ?? undefined);
}

/** peer: re-take the host's snapshot on demand — the Sync button. The same
    machinery a reject-rejoin rides: re-arm the collector, ask the host to
    re-serve. Only for a live, swapped peer; mid-join the collector is
    already armed and asking again would double-serve. */
export function requestResync(): void {
  const l = getLive();
  if (!l || l.hostId === null || l.hostId === selfId || !l.swapped) return;
  l.restartJoin?.();
  void l.room.actions.ctl.send({ t: 'resync' }, l.hostId);
}

/* collect the snapshot and its blobs, then live-swap. The snap and the
   blobs race on separate channels, so both handlers feed one collector;
   the swap runs when every announced key has arrived (or the wait times
   out — a missing blob degrades the picture, never blocks the join).

   `restartJoin` (S5) re-arms this whole collector for a resync: a reject
   after a locally-applied op needs a fresh snapshot, and the host re-serves
   on `resync`. The op machinery stays installed; only the collect state and
   the swapped flag reset. */
function installJoin(l: Live, drain: () => void, clearHole: () => void): void {
  let snap: SnapMsg | null = null;
  let blobs = new Map<string, HeldBlob>();
  let swapping = false;
  let timeout: ReturnType<typeof setTimeout> | null = null;

  /* every announced key present (or the wait elapsed) → run the swap once.
     The op stream keeps buffering meanwhile; the swap sets the seq baseline
     and drain() flushes it. */
  const maybeSwap = (force: boolean): void => {
    if (swapping || !snap) return;
    const have = snap.blobKeys.every(k => blobs.has(k));
    if (!have && !force) return;
    swapping = true;
    if (timeout) { clearTimeout(timeout); timeout = null; }
    void applyJoin(l, snap, blobs).then(() => { l.swapped = true; drain(); });
  };

  /* reset the collector for a resync — the swap flag drops so the op buffer
     holds again until the fresh snapshot re-sets the baseline, and the
     pending request table is cleared (its ops are moot; the snapshot IS the
     truth now). */
  l.restartJoin = (): void => {
    snap = null;
    blobs = new Map();
    swapping = false;
    if (timeout) { clearTimeout(timeout); timeout = null; }
    /* disarm any op-gap hole timer: the reject that triggers a resync is
       preceded by a seq gap (the rejected op never broadcast), and a hole
       timer armed on that gap would fire 'ended' mid-resync — the snapshot
       is about to reset the baseline, so the gap is expected, not broken. */
    clearHole();
    l.swapped = false;
    l.peerReq?.sentLocal.clear();
    sessionStore.set({ phase: 'joining' });
  };

  l.room.actions.snap.onMessage((msg, from) => {
    if (from !== l.hostId || snap) return;   // only the host; first snap wins
    snap = msg;
    /* progress starts now — a snap with no blobs jumps straight to the
       swap; otherwise each arriving blob advances the bar */
    reportProgress(snap, blobs);
    /* arm the degrade timeout: swap anyway if a blob is lost in transit */
    timeout = setTimeout(() => maybeSwap(true), BLOB_WAIT_MS);
    maybeSwap(false);
  });

  l.room.actions.blob.onMessage((blob, from, meta: BlobMeta) => {
    if (from !== l.hostId) return;   // only the host relays blobs
    /* the ONE post-swap blob path (S6): a blob the host relays after the
       swap is a live media drop or a fellow write-peer's entry default.
       Store it AND feed the live source — loadMedia(key, blob) uploads the
       texture on the keyed MediaSource in place (and persists), so every
       peer's picture updates without a rejoin. loadMedia is safe for any
       key: an entry-default key it doesn't yet reference just caches a
       source the next instance reads. Before the swap it feeds the join
       collector instead. */
    if (swapping) { void engineRef.current?.loadMedia(meta.key, blob); return; }
    blobs.set(meta.key, { blob, mime: meta.mime });
    if (snap) { reportProgress(snap, blobs); maybeSwap(false); }
  });

  l.teardown.push(() => {
    if (timeout) clearTimeout(timeout);
    l.room.actions.snap.onMessage(null);
    l.room.actions.blob.onMessage(null);
  });
}

/* the joining progress bar: fraction of announced blobs received. The
   panel shows it while phase==='joining'; applyJoin clears it. */
function reportProgress(snap: SnapMsg, blobs: Map<string, HeldBlob>): void {
  const total = snap.blobKeys.length;
  const pct = total ? Math.round((blobs.size / total) * 100) : 100;
  sessionStore.set({ progress: { key: `${blobs.size}/${total}`, pct } });
}

/* apply the host's ops in sequence order, from the snapshot's seq baseline.
   Trystero's channel is reliable-ordered, but the op and snap channels are
   separate, so an op can outrun the snapshot that fixes the baseline —
   everything is held in a buffer keyed by seq and drained in order, and
   NOTHING drains until the swap has run (the graph the ops address does not
   exist before then). A gap the buffer can't bridge starts a timer; if it
   hasn't filled in HOLE_MS the reliable channel is broken and the session
   ends. Returns its drain, which the join loop calls once the swap sets the
   seq baseline, to flush whatever buffered during the join window.

   Echo reconciliation (S5): an op the host tags with `f === selfId` is the
   echo of a request THIS peer made. If its cs was locally applied (a value
   or record-path op), it is SKIPPED — applying it again would fight the
   live drag or redundantly re-remove; but the seq still advances so the
   stream stays gapless. If its cs was deferred, it APPLIES normally (the
   echo IS the application). Foreign ops (f !== selfId) always apply. */
function installOpApply(l: Live): { drain: () => void; clearHole: () => void } {
  /* op is null when the wire payload failed to rebuild (opFromWire) —
     the seq still advances through it, nothing applies */
  const buffer = new Map<number, { op: Op | null; skip: boolean }>();
  let hole: ReturnType<typeof setTimeout> | null = null;
  let holeSeq = 0;

  const clearHole = (): void => { if (hole) { clearTimeout(hole); hole = null; } };
  const armHole = (missing: number): void => {
    if (hole && holeSeq === missing) return;
    clearHole();
    holeSeq = missing;
    hole = setTimeout(() => {
      sessionStore.set({ phase: 'ended' });
    }, HOLE_MS);
  };

  const drain = (): void => {
    if (!l.swapped) return;
    for (const q of buffer.keys()) if (q <= l.seq) buffer.delete(q);
    for (;;) {
      const next = buffer.get(l.seq + 1);
      if (next === undefined) break;
      buffer.delete(l.seq + 1);
      l.seq++;
      /* our own echo of a locally-applied op: advance the seq (kept gapless)
         but do NOT re-apply — dropping the fight with the live edit. Our own
         echo of a deferred op, and every foreign op, apply. */
      if (!next.skip && next.op) {
        applyRemote(next.op);
        /* a remote setGlobal writes mirror.globals with nothing observable
           to React — bump the session version so GlobalsBar repaints the
           knob (a version subscription, not a refactor). */
        if (next.op.kind === 'setGlobal') sessionStore.set({});
      }
    }
    if (buffer.size) armHole(l.seq + 1); else clearHole();
  };

  l.room.actions.op.onMessage((msg, from) => {
    if (from !== l.hostId) return;        // only the host sequences ops
    const { q, op } = msg;
    if (l.swapped && q <= l.seq) return;
    /* is this the echo of a request we sent? An op tagged with our own id
       carries the cs we stamped; reconcile against sentLocal. A cs we no
       longer track (already reconciled, or from before a resync) is treated
       as foreign — applied — which is safe: the snapshot reset the table. */
    let skip = false;
    if (msg.f === selfId && msg.cs !== undefined) {
      const entry = l.peerReq?.sentLocal.get(msg.cs);
      if (entry) {
        skip = entry.localApplied;         // locally applied → skip its echo
        l.peerReq!.sentLocal.delete(msg.cs);
      }
    }
    /* decode the wire form; a payload that doesn't rebuild still takes
       its seq slot (gapless stream) but applies nothing */
    buffer.set(q, { op: opFromWire(op), skip });
    drain();
  });

  l.teardown.push(() => {
    clearHole(); buffer.clear();
    l.room.actions.op.onMessage(null);
  });

  return { drain, clearHole };
}
