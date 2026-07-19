/* The session — the public surface the bench reaches to host or join a
   live room, and the loop wiring underneath it.

   Layer position: this module imports patch/, persist/, runtime/ and
   trystero — never ui/. A remote change reaches the document through the
   dispatcher's registered applier (applyRemote → the bench applier in
   canonical mode), so M4's headless viewer rides the same seam with no UI
   at all.

   What is live now (S1–S5): the handshake (hello / host / peers / reject /
   resync / bye), the JOIN SNAPSHOT (a joiner's bench live-swaps to the
   host's), the host→peer OP STREAM (the host sequences every edit — its own
   and serviced peer requests), WRITE PERMISSIONS (the host grants a peer the
   pen; its edits become requests the host validates and re-broadcasts, with
   per-cs echo reconciliation and reject→rejoin), and the EPHEMERA relay
   (host→all, and a write-peer→host→all). S6 wires pin-follow, the URL-hash
   join and the TURN/password polish.

   index.ts owns the session lifetime; host.ts / peer.ts own the loops and
   collect their teardowns on `live.teardown`, which leaveSession unwinds
   before the room closes. */

import { openRoom, selfId } from './room';
import { sessionStore } from './store';
import { installHost, setHostWrite } from './host';
import { installPeer } from './peer';
import { installEph } from './apply';
import { installPresence } from './presence';
import { restorePeerBench } from './snapshot';
import { getLive, setLive, type Live, type SessionDeps } from './live';
import type { PeerInfo } from './protocol';

export { sessionStore } from './store';
export { syncAllPeers } from './host';
export { requestResync } from './peer';
export { announcePresence, hostPresence, peerColor, pingBench, presenceStore, watchRemoteDrag, type PeerPresence, type Ping } from './presence';
export type { SessionState, Phase, Role, PeerInfo, PresMsg } from './protocol';
export type { SessionDeps } from './live';

/** a 5-char room code over an unambiguous alphabet — no 0/O, 1/I/L, so a
    code read aloud or off a screen can't be mistyped */
function mintCode(): string {
  const alpha = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  let s = '';
  for (let i = 0; i < 5; i++) s += alpha[Math.floor(Math.random() * alpha.length)];
  return s;
}

/** the host's roster as the wire carries it (self first) */
function rosterList(l: Live): PeerInfo[] {
  return [...l.roster.values()];
}

/* ---- host ------------------------------------------------------------- */

/** mint a code, join its room, become host. Resolves once the room is up
    (the actions exist synchronously; peers arrive asynchronously). */
export async function createSession(deps: SessionDeps): Promise<void> {
  const code = mintCode();
  const room = openRoom(code);
  const roster = new Map<string, PeerInfo>([[selfId, { id: selfId, write: true }]]);
  const live: Live = { room, deps, roster, hostWait: null, hostId: selfId, seq: 0, teardown: [] };
  setLive(live);

  sessionStore.set({
    phase: 'live', role: 'host', code, selfId,
    peers: rosterList(live), write: true, follow: false, remotePin: null,
  });

  installHost(live);
  installEph(live, true);        // isHost: mirror own play to all, relay write-peers'
  installPresence(live);         // presence is mesh — same install both roles
}

/* ---- peer ------------------------------------------------------------- */

/** join an existing room by code. Resolves once the room is up; the
    handshake (hearing a host claim, or timing out) runs asynchronously.

    Rejected while a session is already 'live' or 'joining': replacing a live
    session in place would strand its loops and its stash. Leave first. A
    fresh join after 'ended' (a host-dropped session the peer is still
    playing) or from 'idle' is allowed — and rides applyJoin's stash guard,
    so it never overwrites the pre-session original. */
export async function joinSession(code: string, deps: SessionDeps): Promise<void> {
  const phase = sessionStore.state().phase;
  if (phase === 'live' || phase === 'joining') {
    console.warn(`herder: ignoring joinSession while a session is ${phase} — Leave first.`);
    return;
  }
  const room = openRoom(code);
  const live: Live = { room, deps, roster: new Map(), hostWait: null, hostId: null, seq: 0, teardown: [] };
  setLive(live);

  sessionStore.set({
    phase: 'joining', role: 'peer', code, selfId,
    peers: [], write: false, follow: false, remotePin: null,
  });

  installPeer(live);
  installEph(live, false);       // peer: apply relayed eph; send only while write-granted
  installPresence(live);         // presence is mesh — same install both roles
}

/* ---- leave ------------------------------------------------------------- */

/** tear the session down: unwind the loops (op stream, gate, ephemera),
    say bye, drop the room. A PEER additionally restores its pre-session
    bench from the stash the join took — the docs, the media and the graph
    it had before joining (a completed swap is reversed; a join that never
    swapped just sheds the stash). A HOST holds the only authoritative doc
    and took no stash, so it simply tears down. */
export async function leaveSession(): Promise<void> {
  const l = getLive();
  setLive(null);
  if (!l) return;
  if (l.hostWait) { clearTimeout(l.hostWait); l.hostWait = null; }
  for (const off of l.teardown) { try { off(); } catch { /* already gone */ } }
  try { void l.room.actions.ctl.send({ t: 'bye' }); } catch { /* room may be gone */ }
  try { await l.room.leave(); } catch { /* already torn down */ }
  /* a peer restores; the swap flag distinguishes a completed join (reverse
     it) from one aborted mid-collect (just shed the stash). The host role
     never stashed, so this is a peer-only path. */
  if (sessionStore.state().role === 'peer') {
    try { await restorePeerBench(l, l.swapped === true); } catch { /* best-effort */ }
  }
  sessionStore.reset();
}

/* ---- permission / follow ---------------------------------------------- */

/** host: grant or revoke a peer's write bit (store + roster broadcast).
    The bit gates request validation — every `req` the peer sends is checked
    against the authoritative roster, so a revoke drops (and rejects) the
    peer's next request the instant it lands. */
export function setWrite(peerId: string, on: boolean): void {
  setHostWrite(peerId, on);
}

/** peer: follow the host — usePreviewPin mirrors its preview pin,
    useFollow rides its camera and drill level. A user pan/zoom gesture
    on the bench turns it back off (the escape hatch). */
export function setFollow(on: boolean): void {
  sessionStore.set({ follow: on });
}
