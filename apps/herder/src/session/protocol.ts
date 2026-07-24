/* The wire protocol — the shapes that cross the data channels, and the
   session state a peer keeps while a room is live (M3, PLAN §A/§B).

   Every message is one of the named Trystero actions; this file only
   names the payloads and the local state, so the room wiring and the UI
   agree on one vocabulary. The full op/blob/snapshot envelopes are
   declared now — the wire names must be fixed from the first commit even
   though S1 only speaks `ctl` — but only the control messages are
   exchanged until the op stream and join snapshot land (S3/S4). */

import type { DialsSnap } from '@ldlework/dials';
import type { NodeKind } from '../patch';
import type { WireOp } from './wireOps';

/** the protocol version, stamped in `hello` so a future dialect can be
    told from this one before a handshake commits to it */
export const PROTOCOL_VERSION = 1;

/* ---- ctl: the control channel (JSON) ----------------------------------- */

/** a peer greets the room and asks who is host */
export interface CtlHello { t: 'hello'; v: number }
/** the creator claims the host role — stamped with its join seq so a
    late duplicate claim can be told from the first */
export interface CtlHost { t: 'host'; id: string; seq: number }
/** the host's roster, broadcast on every membership change */
export interface CtlPeers { t: 'peers'; peers: PeerInfo[] }
/** a permission grant/revoke for one peer (S5) */
export interface CtlPerm { t: 'perm'; id: string; write: boolean }
/** a joiner has applied the snapshot and is live (S4) */
export interface CtlReady { t: 'ready' }
/** the host refused a request — targeted at the requester, carrying the
    client-seq it dropped so the peer can tell an applied op (rejoin to
    converge) from a merely-deferred one (drop the pending cs, no rejoin) */
export interface CtlReject { t: 'reject'; cs: number }
/** a peer asks the host to re-serve the join snapshot — the resync a
    reject triggers, since the host already sees the peer connected and
    onPeerJoin will not fire again */
export interface CtlResync { t: 'resync' }
/** host→all: re-take the snapshot (the Sync-all button). Each peer answers
    by re-arming its join collector and sending `resync` back — the host
    never pushes a snap unsolicited, so one can't race an un-reset collector */
export interface CtlSync { t: 'sync' }
/** a clean departure */
export interface CtlBye { t: 'bye' }

export type Ctl = CtlHello | CtlHost | CtlPeers | CtlPerm | CtlReady | CtlReject | CtlResync | CtlSync | CtlBye;

/** one peer as the roster carries it — id and its write grant */
export interface PeerInfo { id: string; write: boolean }

/* ---- op / req: the document stream (JSON) ------------------------------ */

/** host→all: one sequenced op, tagged with its origin and blob deps.
    `op` is wire-encoded (wireOps.ts) — structural payloads travel as
    patch-JSON, never live slot trees. */
export interface OpMsg { q: number; f: string; cs?: number; op: WireOp; b?: string[] }
/** a writing peer→host: a request to apply an op (canonical ops only) */
export interface ReqMsg { cs: number; op: WireOp; b?: string[] }

/* ---- snap: the join snapshot (JSON, targeted) -------------------------- */

/** host→joiner: the consistent document picture at `seq` (S4) */
export interface SnapMsg {
  seq: number;
  patch: unknown;                 // graphToJSON of the root
  globals: DialsSnap;             // treeToSnap of the globals tree
  entries: { id: string; name: string; patch: unknown }[];
  pin: string | null;
  frozen: boolean;
  blobKeys: string[];
}

/* ---- pres: presence (JSON, mesh — every tab to every tab) -------------- */

/** one tab's live presence: pointer, viewed level, and any drag in
    flight. Awareness, not document state — there is no authority to
    enforce, so unlike ops and ephemera it never relays through the host:
    every tab (read-only viewers included) broadcasts straight to the
    mesh, at most once per animation frame and only on change. Lossy by
    design; the truth of any drag is the op that settles it. */
export interface PresMsg {
  /** flow-space pointer, or null when it left the bench / the tab hid */
  cur: { x: number; y: number } | null;
  /** the drill path being viewed ('' = root) — a cursor renders only for
      peers looking at the same level */
  path: string;
  /** a node drag in flight: compiled id → flow position, one entry per
      dragged node (a multi-select drags several) */
  drag?: { id: string; x: number; y: number }[];
  /** a cable drag in flight: the anchored handle — the loose end is `cur` */
  wire?: { node: string; handle: string; from: 'source' | 'target' };
  /** a toolbar / shelf drag in flight — enough for every tab (the
      dragger's own included) to render the ACTUAL device component as a
      ghost at the drop anchor: the kind, the display name, the library
      ref for a module (so its real ports show), the momentary flag for
      the MOM switch */
  spawn?: { kind: NodeKind; label: string; ref?: string; mom?: boolean };
  /** a one-shot ping (middle click), deduped by its nonce `n` — the sender
      clears it from its outbound state the moment it flushes, so it rides
      exactly one message */
  ping?: { x: number; y: number; n: number };
  /** the camera: the flow-space point at the viewport's CENTER plus the
      zoom. A center survives differing window sizes — a follower aims its
      own middle at the same spot. Every tab announces it; follow mode
      reads it off the host's presence alone. */
  cam?: { x: number; y: number; z: number };
}

/* ---- blob: binary media (Trystero chunks it) --------------------------- */

/** the metadata riding alongside a blob transfer. `kind: 'media'` marks a
    LIVE media-drop blob (a mid-session picture change relayed on this
    channel, S6) so the host can tell it from an entryCreate's held blob
    dep — a media blob is applied + rebroadcast at once, a dep is held until
    its req. Absent kind = a snapshot blob or an entry dep, unchanged. */
export interface BlobMeta { key: string; mime: string; kind?: 'media' }

/* ---- the local session state ------------------------------------------- */

export type Phase = 'idle' | 'joining' | 'live' | 'ended';
export type Role = 'host' | 'peer' | null;

/** everything the UI reads about the current session. Kept flat and
    serializable so a store can hold it and a panel can render it. */
export interface SessionState {
  phase: Phase;
  role: Role;
  code: string | null;
  selfId: string;
  peers: PeerInfo[];
  write: boolean;
  follow: boolean;
  remotePin: string | null;
  deniedAt: number;
  progress?: { key: string; pct: number };
  /** a short signaling-relay health note, shown small in the panel while
      joining — how many of the configured nostr relays have an open socket,
      so a "waiting for host" that is really a relay-pool failure is
      diagnosable from the UI, not just the console. Absent with no session. */
  relayNote?: string;
}

/** the state before any room is joined */
export function idleState(selfId: string): SessionState {
  return {
    phase: 'idle', role: null, code: null, selfId,
    peers: [], write: false, follow: false, remotePin: null, deniedAt: 0,
  };
}
