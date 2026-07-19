/* Presence — the awareness layer: where each peer's pointer is, which
   level it is viewing, and what it is mid-dragging. None of it is
   document state and none of it needs the host's authority, so unlike
   ops and ephemera it skips the star entirely: every tab — read-only
   viewers included, that is the point of presence — broadcasts its own
   PresMsg straight to the mesh and renders what it hears. Lossy by
   design: a dropped frame is repaired by the next one, and the final
   truth of any drag is the moveNode / connect op that settles it.

   SEND — the UI calls announcePresence() with partial updates (pointer
   moves, path changes, drag frames); a rAF coalesces them into at most
   one send per frame, and only while something changed and a session is
   live.

   RECEIVE — messages land in a store the PresenceLayer subscribes to;
   a live drag frame additionally fans out through watchRemoteDrag so
   the bench can move the dragged nodes on the spot. Drags and cable
   ghosts are honored only from peers the roster says hold write — the
   same never-trust-the-client rule the host applies to reqs; a forged
   drag from a viewer moves nothing.

   Layer position: sideways only — store, live, protocol. The UI reaches
   in through the session's public surface. */

import { selfId } from './room';
import { sessionStore } from './store';
import { getLive, type Live } from './live';
import type { PresMsg } from './protocol';

/** a peer's presence as the UI renders it — the wire shape plus the
    identity the store derives (the sender id, its color) */
export interface PeerPresence extends PresMsg {
  id: string;
  color: string;
}

/* warm, distinct hues that sit well on the walnut bench */
const PALETTE = ['#e8a33d', '#e4573d', '#3dc9a0', '#4da3f2', '#b07df2', '#f25d9c', '#a8d23d', '#e8d43d'];

/** a peer's stable color — hashed from its id, so every tab agrees
    without a negotiation and a rejoin keeps the same hue */
export function peerColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

/* ---- the store (same subscribe/version shape as sessionStore) ---------- */

const peers = new Map<string, PeerPresence>();
let snapshot: PeerPresence[] = [];
let ver = 0;
const subs = new Set<() => void>();

function bump(): void {
  snapshot = [...peers.values()];
  ver++;
  for (const fn of subs) fn();
}

export const presenceStore = {
  /** every remote peer's latest presence (never our own — the mesh does
      not loop a send back) */
  peers: (): PeerPresence[] => snapshot,
  /** the pings currently animating — remote and our own local echo */
  pings: (): Ping[] => pingSnapshot,
  /** our own outbound presence — the local echo the bench renders for a
      spawn drag (the same ghost the peers see, in our own color). The
      store notifies for it only while a spawn is in flight, so ordinary
      pointer moves never wake the overlay. */
  self: (): PresMsg => outbound,
  version: (): number => ver,
  subscribe(fn: () => void): () => void {
    subs.add(fn);
    return () => { subs.delete(fn); };
  },
};

/* ---- pings --------------------------------------------------------------- */

/** one ping mid-animation: where, whose color, and on which level */
export interface Ping { key: string; color: string; x: number; y: number; path: string }

const PING_MS = 1600;
let pings: Ping[] = [];
let pingSnapshot: Ping[] = [];
let pingKey = 0;
/* per-peer last nonce seen, so the (unlikely) re-delivery of a flushed
   ping doesn't animate twice */
const lastPing = new Map<string, number>();

function addPing(color: string, x: number, y: number, path: string): void {
  const key = `p${++pingKey}`;
  pings = [...pings, { key, color, x, y, path }];
  pingSnapshot = pings;
  ver++;
  for (const fn of subs) fn();
  setTimeout(() => {
    pings = pings.filter(p => p.key !== key);
    pingSnapshot = pings;
    ver++;
    for (const fn of subs) fn();
  }, PING_MS);
}

let pingSeq = 0;

/** middle-click: ring the bench at a flow position — locally at once (the
    sender sees its own ping), and one-shot over the wire for the room */
export function pingBench(x: number, y: number): void {
  addPing(peerColor(selfId), x, y, outbound.path);
  announcePresence({ ping: { x, y, n: ++pingSeq } });
}

/** the host's presence, if a room is live and the host has been heard —
    what follow mode steers by */
export function hostPresence(): PeerPresence | null {
  const l = getLive();
  if (!l?.hostId) return null;
  return peers.get(l.hostId) ?? null;
}

/* ---- remote drag fan-out ------------------------------------------------ */

type DragMove = { id: string; x: number; y: number };
const dragWatchers = new Set<(moves: DragMove[]) => void>();

/** subscribe to remote live-drag frames — the bench moves the dragged
    nodes here, through the same updateNode call a remote moveNode op
    uses, so nothing records and nothing echoes */
export function watchRemoteDrag(fn: (moves: DragMove[]) => void): () => void {
  dragWatchers.add(fn);
  return () => { dragWatchers.delete(fn); };
}

/* ---- send --------------------------------------------------------------- */

let outbound: PresMsg = { cur: null, path: '' };
let dirty = false;
let raf = 0;

/** merge a partial presence update and schedule the frame's send. Callable
    from anywhere at any rate — pointermove, drag frames, path changes —
    the rAF coalesces to one message per frame, sent only while live. */
export function announcePresence(patch: Partial<PresMsg>): void {
  const hadSpawn = outbound.spawn !== undefined;
  outbound = { ...outbound, ...patch };
  dirty = true;
  /* the local spawn-ghost echo: wake subscribers when a spawn starts,
     moves (cursor updates while carrying) or ends — and only then */
  if ('spawn' in patch || (hadSpawn && 'cur' in patch)) {
    ver++;
    for (const fn of subs) fn();
  }
  const l = getLive();
  if (!l || sessionStore.state().phase !== 'live') return;
  if (!raf) raf = requestAnimationFrame(() => flush(l));
}

function flush(l: Live): void {
  raf = 0;
  if (!dirty || getLive() !== l) return;
  dirty = false;
  void l.room.actions.pres.send(outbound);
  /* a ping is an event, not state — it rides exactly one flush */
  if (outbound.ping) outbound = { ...outbound, ping: undefined };
}

/* ---- install ------------------------------------------------------------ */

/** does the roster say this peer holds the pen? The host always does;
    early presence from the host (before a joiner's first roster) passes
    on the hostId fallback. */
function writerAt(id: string, l: Live): boolean {
  if (id === l.hostId) return true;
  return sessionStore.state().peers.some(p => p.id === id && p.write);
}

/** wire presence for a live session, both roles alike */
export function installPresence(l: Live): void {
  l.room.actions.pres.onMessage((msg, from) => {
    /* pre-swap, the bench is still the joiner's own — hold nothing,
       replay nothing, same rule as the ephemera */
    if (sessionStore.state().phase !== 'live') return;
    /* drags, cable ghosts and spawn chips are write acts — honored only
       from peers the roster says hold the pen. A ping is pure awareness,
       so a read-only viewer's "look here" lands like anyone's — and so is
       the camera (only the host's is ever steered by). */
    const canDrag = writerAt(from, l);
    const firstHeard = !peers.has(from);
    const p: PeerPresence = {
      id: from, color: peerColor(from),
      cur: msg.cur, path: msg.path, cam: msg.cam,
      drag: canDrag ? msg.drag : undefined,
      wire: canDrag ? msg.wire : undefined,
      spawn: canDrag ? msg.spawn : undefined,
    };
    peers.set(from, p);
    /* a peer heard for the FIRST time missed everything announced before
       it went live — answer with a re-announce, so it gets our cursor,
       path and camera without waiting for our next move. Terminates: the
       reply reaches a peer that already knows us, and knowing is only
       forgotten on departure. */
    if (firstHeard) announcePresence({});
    bump();
    if (p.drag?.length) for (const fn of dragWatchers) fn(p.drag);
    if (msg.ping && lastPing.get(from) !== msg.ping.n) {
      lastPing.set(from, msg.ping.n);
      addPing(p.color, msg.ping.x, msg.ping.y, msg.path);
    }
  });

  /* a departure reaches everyone as a roster change — prune to it, so a
     left peer's cursor doesn't linger frozen on the bench */
  const offRoster = sessionStore.subscribe(() => {
    const live = new Set(sessionStore.state().peers.map(p => p.id));
    let dropped = false;
    for (const id of peers.keys()) if (!live.has(id)) { peers.delete(id); lastPing.delete(id); dropped = true; }
    if (dropped) bump();
  });

  /* a hidden tab's pointer is gone — say so instead of freezing it */
  const onVis = (): void => {
    if (document.hidden) announcePresence({ cur: null, drag: undefined, wire: undefined });
  };
  document.addEventListener('visibilitychange', onVis);

  l.teardown.push(() => {
    l.room.actions.pres.onMessage(null);
    offRoster();
    document.removeEventListener('visibilitychange', onVis);
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    dirty = false;
    peers.clear();
    lastPing.clear();
    bump();
  });
}
