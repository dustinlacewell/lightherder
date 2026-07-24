/* The host loop — the authoritative half of a session.

   The creator becomes host: it claims the room, tracks membership and
   broadcasts the roster, sequences and broadcasts every op the local
   bench produces, and — the S5 addition — services writer-peer REQUESTS.

   The star's shape by role:

     · the host's OWN edits flow `dispatch/record → watchOps → broadcast`,
       tagged `f = self`, no cs.

     · a WRITER PEER's edit is a REQUEST (`req`): the host validates the
       peer's write bit (never trusting the client gate), then applies it
       via `applyRemote(op, true)` — notify on. That apply provokes the
       SAME watchOps emission the host's own edits ride, so the broadcast
       machinery is one path — but the emission must be tagged with the
       REQUESTER's id and cs so its echo table can reconcile. The host sets
       `pendingFrom`/`pendingCs` synchronously around the apply; the
       watchOps subscription reads them. An unauthorized req is dropped and
       a targeted `reject` (carrying the cs) sent back.

     · a req may carry BLOB deps (`req.b`): a peer's saveHere ships the
       entry's default pictures on the blob channel BEFORE the req. The
       host holds such a req until every b-key has arrived, stores the
       blobs, then applies + rebroadcasts the op AND re-sends the blobs to
       the other peers. The mirror of peer.ts's pending-blob holds. */

import { selfId } from './room';
import { applyRemote, engineRef, watchOps } from '../runtime';
import { storeMedia } from '../persist';
import { sessionStore } from './store';
import { getLive, type Live } from './live';
import { sendSnapshot } from './snapshot';
import { opFromWire, opToWire } from './wireOps';
import type { HeldBlob } from './snapshot';
import type { PeerInfo, ReqMsg } from './protocol';

/** the host's roster as the wire carries it */
function rosterList(l: Live): PeerInfo[] {
  return [...l.roster.values()];
}

/** claim the room, service membership, and start the op broadcast. */
export function installHost(l: Live): void {
  const { ctl } = l.room.actions;

  /* claim the room the moment a peer appears, and answer every hello — a
     joiner learns the host either way, whichever message wins the race */
  const claim = (target?: string): void => {
    void ctl.send({ t: 'host', id: selfId, seq: 0 }, target);
  };

  ctl.onMessage((msg, from) => {
    if (msg.t === 'hello') { claim(from); return; }
    if (msg.t === 'bye') { dropPeer(l, from); return; }
    /* a peer whose op was applied then rejected (revoke mid-flight) re-asks
       for the snapshot — the host already sees it connected, so onPeerJoin
       will not fire; re-serve on demand. */
    if (msg.t === 'resync') { void sendSnapshot(l, from); return; }
  });

  l.room.onPeerJoin(id => {
    claim(id);
    l.roster.set(id, { id, write: false });
    broadcastPeers(l);
    /* the join snapshot: the claim tells the peer who is host, then the
       snap+blobs give it the consistent document at the current seq. The
       peer buffers the op stream from connect and replays what postdates
       that seq, so serving this does not disturb the host's own session —
       the assembly is a read-only pass over the live document. */
    void sendSnapshot(l, id);
  });
  l.room.onPeerLeave(id => dropPeer(l, id));

  installOpBroadcast(l);
  installReqService(l);
}

/* every op the bench dispatches or records reaches the wire here: stamp
   the next sequence number at broadcast time (post-canonicalize, no gaps)
   and send it to every peer. The tag is `f = self` for the host's own
   edits; a peer request in flight sets pendingFrom/pendingCs (host.ts's
   serviceReq applies it with those live) so THIS emission carries the
   requester's id + cs and its `b` blob deps — the requester's echo table
   reads them to skip its own echo. An op a remote application triggers
   never reaches watchOps (its RF-echoed removal is caught by the echo
   table in handleNodesChange/handleEdgesChange), so this only carries
   genuine host edits and serviced peer requests. */
function installOpBroadcast(l: Live): void {
  const off = watchOps(op => {
    const q = ++l.seq;
    const f = l.pendingFrom ?? selfId;
    const cs = l.pendingCs ?? undefined;
    const b = l.pendingBlobs && l.pendingBlobs.length ? l.pendingBlobs : undefined;
    /* wire-encode: a structural op's live slot trees would lose their
       source bodies to JSON serialization (wireOps.ts) */
    const w = opToWire(op);
    void l.room.actions.op.send(cs !== undefined ? { q, f, cs, op: w, b } : { q, f, op: w, b });
  });
  l.teardown.push(off);
}

/* the request service — a writer peer's op, validated and re-broadcast.
   A req whose blob deps have not all arrived is HELD (mirror of peer.ts's
   pending-blob holds): each blob the peer sends lands in receivedBlobs,
   and a held req flushes when its last dep arrives (or a timeout gives up,
   degraded not broken). */
function installReqService(l: Live): void {
  /* blobs the peers announced, awaiting the req that depends on them */
  const received = new Map<string, HeldBlob>();
  /* reqs held for missing blob deps, each with the peer that sent it */
  const held: { from: string; msg: ReqMsg; armed: number }[] = [];
  const HELD_MS = 10000;
  /* a lightweight sweep so a held req whose blobs NEVER arrive still times
     out (blob arrival is the only other flush trigger; without traffic a
     lost blob would otherwise strand the req and leak the peer's cs). Armed
     while anything is held, cleared when the queue drains. */
  let sweep: ReturnType<typeof setInterval> | null = null;
  const armSweep = (): void => { if (!sweep) sweep = setInterval(flushHeld, 2000); };
  const stopSweep = (): void => { if (sweep) { clearInterval(sweep); sweep = null; } };

  l.room.actions.blob.onMessage((blob, from, meta) => {
    if (!l.roster.get(from)?.write) return;    // only a writer's blobs count
    /* a LIVE media drop (S6): apply it to the host's own picture and
       rebroadcast to the OTHER peers so every screen updates without a
       rejoin. It is NOT a held-req dep, so it never enters `received`. */
    if (meta.kind === 'media') {
      void engineRef.current?.loadMedia(meta.key, blob);   // loadMedia persists too
      for (const id of l.roster.keys())
        if (id !== from && id !== selfId)
          void l.room.actions.blob.send(blob, { key: meta.key, mime: meta.mime, kind: 'media' }, id);
      return;
    }
    received.set(meta.key, { blob, mime: meta.mime });
    void storeMedia(meta.key, blob);
    flushHeld();
  });

  l.room.actions.req.onMessage((msg, from) => {
    /* validate against the AUTHORITATIVE roster, never the client's gate.
       An unauthorized req (never granted, or revoked between the peer's
       send and this receive) is dropped and rejected — the targeted reject
       carries the cs so the peer knows which op the host refused. */
    if (!l.roster.get(from)?.write) {
      void l.room.actions.ctl.send({ t: 'reject', cs: msg.cs }, from);
      return;
    }
    const deps = msg.b ?? [];
    if (deps.length && !deps.every(k => received.has(k))) {
      held.push({ from, msg, armed: Date.now() });
      armSweep();
      return;
    }
    service(from, msg);
  });

  /* apply + rebroadcast one validated req. pendingFrom/pendingCs are set
     synchronously AROUND applyRemote(notify:true): the watchOps emission
     the apply provokes is the authoritative sequenced broadcast, and it
     reads these to tag `f`/`cs`/`b`. Cleared straight after so the host's
     own next edit tags itself. */
  const service = (from: string, msg: ReqMsg): void => {
    /* decode the wire form back to a live op; a payload that doesn't
       rebuild (skew, hostile) is refused like any invalid request */
    const op = opFromWire(msg.op);
    if (!op) {
      void l.room.actions.ctl.send({ t: 'reject', cs: msg.cs }, from);
      return;
    }
    l.pendingFrom = from;
    l.pendingCs = msg.cs;
    l.pendingBlobs = msg.b;
    try {
      applyRemote(op, true);
    } finally {
      l.pendingFrom = null;
      l.pendingCs = null;
      l.pendingBlobs = null;
    }
    /* re-send the req's blobs to the OTHER peers (the requester already
       has them). The op's `b` deps rode the broadcast; the bytes ride here
       so a third peer can resolve the same dependency. */
    for (const key of msg.b ?? []) {
      const b = received.get(key);
      if (b) void l.room.actions.blob.send(b.blob, { key, mime: b.mime });
    }
  };

  function flushHeld(): void {
    for (let i = held.length - 1; i >= 0; i--) {
      const h = held[i];
      const deps = h.msg.b ?? [];
      const ready = deps.every(k => received.has(k));
      const stale = Date.now() - h.armed > HELD_MS;
      /* a held req is resolved three ways, each of which must clear the
         peer's cs so no clientSeq leaks: its blobs arrived (service it, but
         only if the write bit still stands — a mid-hold REVOKE means deny),
         or it went stale (the blobs never came). A drop for revoke or
         staleness sends the targeted reject so the peer sheds the pending cs
         (a deferred op → deny only, no rejoin — the peer's own reject
         handling). */
      if (ready || stale) {
        held.splice(i, 1);
        if (ready && l.roster.get(h.from)?.write) service(h.from, h.msg);
        else void l.room.actions.ctl.send({ t: 'reject', cs: h.msg.cs }, h.from);
      }
    }
    if (!held.length) stopSweep();
  }

  l.teardown.push(() => {
    l.room.actions.req.onMessage(null);
    l.room.actions.blob.onMessage(null);
    received.clear();
    held.length = 0;
    stopSweep();
  });
}

function dropPeer(l: Live, id: string): void {
  if (!l.roster.has(id)) return;
  l.roster.delete(id);
  broadcastPeers(l);
}

function broadcastPeers(l: Live): void {
  const peers = rosterList(l);
  void l.room.actions.ctl.send({ t: 'peers', peers });
  sessionStore.set({ peers });
}

/** host: grant or revoke a peer's write bit (store + roster broadcast).
    The bit gates request validation — a revoke takes effect the instant it
    lands here, so an in-flight req that arrives after is dropped + rejected
    (the race the plan's invariant (e) names). */
export function setHostWrite(peerId: string, on: boolean): void {
  const l = getLive();
  if (!l || l.hostId !== selfId) return;
  const info = l.roster.get(peerId);
  if (!info) return;
  info.write = on;
  broadcastPeers(l);
}

/** host: push a fresh snapshot to every peer — the Sync-all button. The
    broadcast tells each peer to re-arm its join collector and ask again
    (the resync path the ctl handler above already serves), so a snapshot
    never races an un-reset collector. */
export function syncAllPeers(): void {
  const l = getLive();
  if (!l || l.hostId !== selfId) return;
  void l.room.actions.ctl.send({ t: 'sync' });
}
