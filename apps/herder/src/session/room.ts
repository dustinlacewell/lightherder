/* The Trystero wrapper — the one place that touches the signaling
   library. It joins a room over the nostr strategy (zero own infra,
   hundreds of public relays) and mints the named actions the protocol
   speaks. The room password is the room code, which AES-GCM-encrypts the
   signaling for free, so a code is both address and key.

   Every action is minted here, at join, even though S1 only exchanges
   `ctl` — the wire NAMES must be fixed from the first session so a later
   peer speaking op/eph/blob/snap agrees with an earlier one. Trystero
   ties an action to its namespace string; declaring them all now freezes
   those strings. */

import { getRelaySockets, joinRoom, selfId } from 'trystero/nostr';
import type { BlobMeta, Ctl, OpMsg, PresMsg, ReqMsg, SnapMsg } from './protocol';

export { selfId };

const APP_ID = 'herder';

/* Trystero's nostr default relay pool is small and, in practice, flaky —
   damus rate-limits ("noting too much") and unibe errors, so a host claim
   can miss every joiner and the room reads "waiting for host". We pass an
   explicit, broader pool of currently-reliable public relays instead;
   passing `urls` makes Trystero use the ENTIRE list (redundancy is ignored),
   so the claim publishes through all of them at once and one relay's
   rate-limit no longer matters. Override with VITE_NOSTR_RELAYS (a
   comma-separated wss:// list) alongside the VITE_TURN_* pattern. Strategy
   is unchanged — nostr stays the default. */
const DEFAULT_NOSTR_RELAYS = [
  'wss://relay.nostr.band',
  'wss://nos.lol',
  'wss://relay.snort.social',
  'wss://nostr.mom',
  'wss://relay.nostr.bg',
  'wss://nostr.fmt.wiz.biz',
  'wss://relay.damus.io',
  'wss://relay.primal.net',
];

function nostrRelays(): string[] {
  const env = (import.meta as { env?: Record<string, string> }).env;
  const list = env?.VITE_NOSTR_RELAYS;
  if (list) return list.split(',').map(s => s.trim()).filter(Boolean);
  return DEFAULT_NOSTR_RELAYS;
}

/** how many of the configured relays have an open socket right now — the
    diagnosable half of a "waiting for host" hang. `open`/`total` so the
    panel can say "3/8 relays". Trystero keys getRelaySockets by relay URL;
    a socket in readyState OPEN (1) is a live signaling path. */
export function relayHealth(): { open: number; total: number } {
  const sockets = (getRelaySockets() ?? {}) as Record<string, { readyState?: number } | undefined>;
  const entries = Object.values(sockets);
  const open = entries.filter(s => s?.readyState === 1).length;
  return { open, total: nostrRelays().length };
}

/* Open Relay's free-tier TURN — a relay for the peers a public STUN
   can't punch a hole to (symmetric NATs, hostile firewalls). Static
   credentials are the free tier's model; an env override lets a heavier
   session bring its own metered account without a code change. */
const OPEN_RELAY_TURN = {
  urls: [
    'turn:openrelay.metered.ca:80',
    'turn:openrelay.metered.ca:443',
    'turn:openrelay.metered.ca:443?transport=tcp',
  ],
  username: 'openrelayproject',
  credential: 'openrelayproject',
};

function turnConfig(): { urls: string[]; username?: string; credential?: string }[] {
  const env = (import.meta as { env?: Record<string, string> }).env;
  const urls = env?.VITE_TURN_URLS;
  if (urls) {
    return [{
      urls: urls.split(','),
      username: env?.VITE_TURN_USER,
      credential: env?.VITE_TURN_CRED,
    }];
  }
  return [OPEN_RELAY_TURN];
}

/* every message the wire carries, one typed sender + one settable
   receiver per named channel. The shape mirrors Trystero's MessageAction
   (send + onMessage), narrowed to our payload types. */
export interface Actions {
  ctl: Channel<Ctl>;
  op: Channel<OpMsg>;
  req: Channel<ReqMsg>;
  eph: Channel<unknown>;          // the Eph union, kept opaque here (runtime owns it)
  pres: Channel<PresMsg>;
  snap: Channel<SnapMsg>;
  /** the blob action carries a Blob with { key, mime } metadata; the
      metadata rides Trystero's per-send `metadata` field */
  blob: BlobChannel;
}

export interface Channel<T> {
  send(data: T, target?: string): Promise<void>;
  onMessage(fn: ((data: T, peerId: string) => void) | null): void;
}

export interface BlobChannel {
  send(blob: Blob, meta: BlobMeta, target?: string,
    onProgress?: (pct: number, peerId: string) => void): Promise<void>;
  onMessage(fn: ((blob: Blob, peerId: string, meta: BlobMeta) => void) | null): void;
  onReceiveProgress(fn: ((pct: number, ctx: { peerId: string; metadata?: unknown }) => void) | null): void;
}

/** the live room: the actions, the peer-membership callbacks, and leave */
export interface RoomHandle {
  actions: Actions;
  onPeerJoin(fn: (id: string) => void): void;
  onPeerLeave(fn: (id: string) => void): void;
  peerIds(): string[];
  leave(): Promise<void>;
}

/** join the room named by `code`; mints every action up front */
export function openRoom(code: string): RoomHandle {
  const room = joinRoom(
    { appId: APP_ID, password: code, turnConfig: turnConfig(), relayConfig: { urls: nostrRelays() } },
    code,
  );

  const named = <T>(name: string): Channel<T> => {
    /* our payloads are all JSON objects — valid Trystero DataPayloads —
       but the library's generic bound is broader than our union, so the
       action is reached through a narrowed local shape */
    const action = room.makeAction(name) as unknown as {
      send(data: T, opts?: { target?: string | string[] }): Promise<void>;
      onMessage: ((data: T, ctx: { peerId: string }) => void) | null;
    };
    return {
      send: (data, target) => action.send(data, target ? { target } : undefined),
      onMessage: fn => { action.onMessage = fn ? (data, ctx) => fn(data, ctx.peerId) : null; },
    };
  };

  /* the received payload is a Uint8Array on the wire (Trystero strips a sent
     Blob to bytes), never a Blob — the receive type reflects that so the
     reconstitution below is type-checked, not cast away */
  const blobAction = room.makeAction<Blob>('blob') as unknown as {
    send(data: Blob, opts?: { target?: string | string[]; metadata?: unknown; onProgress?: (p: number, id: string) => void }): Promise<void>;
    onMessage: ((data: Blob | Uint8Array, ctx: { peerId: string; metadata?: unknown }) => void) | null;
    onReceiveProgress: ((p: number, ctx: { peerId: string; metadata?: unknown }) => void) | null;
  };
  const blob: BlobChannel = {
    send: (b, meta, target, onProgress) =>
      blobAction.send(b, {
        ...(target ? { target } : {}), metadata: meta,
        ...(onProgress ? { onProgress: (p: number, id: string) => onProgress(p * 100, id) } : {}),
      }),
    /* Trystero carries a Blob to the wire as raw bytes and delivers it back
       as a Uint8Array — the MIME type is dropped from the payload and rides
       our own metadata instead. Reconstitute the Blob HERE, at the one seam
       that touches the library, so every consumer (the join collector, the
       host's held-dep + live-media handlers, the peer's post-swap loadMedia)
       receives a well-typed Blob and none has to know the wire lost the type.
       An already-Blob delivery (a future strategy, or a same-tab loopback)
       passes through untouched. */
    onMessage: fn => {
      blobAction.onMessage = fn
        ? (b, ctx) => {
          const meta = ctx.metadata as BlobMeta;
          const blobData = b instanceof Blob ? b : new Blob([b as unknown as BlobPart], { type: meta?.mime || 'application/octet-stream' });
          fn(blobData, ctx.peerId, meta);
        }
        : null;
    },
    onReceiveProgress: fn => { blobAction.onReceiveProgress = fn ? (p, ctx) => fn(p * 100, ctx) : null; },
  };

  return {
    actions: {
      ctl: named<Ctl>('ctl'),
      op: named<OpMsg>('op'),
      req: named<ReqMsg>('req'),
      eph: named<unknown>('eph'),
      pres: named<PresMsg>('pres'),
      snap: named<SnapMsg>('snap'),
      blob,
    },
    onPeerJoin: fn => { room.onPeerJoin = fn; },
    onPeerLeave: fn => { room.onPeerLeave = fn; },
    peerIds: () => Object.keys(room.getPeers()),
    leave: () => room.leave(),
  };
}
