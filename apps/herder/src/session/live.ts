/* The live session — the one room a tab is in at a time, and the seam
   the bench injects to reach the document.

   Kept apart from index.ts so the host and peer loops (host.ts / peer.ts)
   can share the shape without importing back through the public surface.
   This module reaches only sideways and down — room/, protocol/, patch/ —
   never up into ui/. */

import type { SubPatch } from '../patch';
import type { RoomHandle } from './room';
import type { PeerInfo } from './protocol';

/** the bench injects the document root and the live-swap rebuild; the
    session never reaches into React for them. `rebuild` is unused until
    the join snapshot (S4) but injected now so the wiring above is final. */
export interface SessionDeps { root(): SubPatch; rebuild(next: SubPatch): void }

/** everything one live room needs, host or peer. The op-stream and gate
    teardowns (`teardown`) are collected as they install so leaveSession
    unwinds them before the room closes. */
export interface Live {
  room: RoomHandle;
  deps: SessionDeps;
  /** host only: the authoritative roster, keyed by peer id */
  roster: Map<string, PeerInfo>;
  /** peer only: the timer that fires "no host" if none claims */
  hostWait: ReturnType<typeof setTimeout> | null;
  hostId: string | null;
  /** host: the monotonic op sequence stamped at broadcast time; peer:
      the last snapshot/op seq applied, so the ordered buffer knows the
      next it may play */
  seq: number;
  /** peer only: has the join snapshot swapped this bench in yet? False
      through the collect-and-apply window; true once applyJoin has run.
      Leave reads it to choose the restore path (a swap to reverse, or a
      collect to merely abort). */
  swapped?: boolean;
  /** host only, set synchronously AROUND a peer request's apply: the
      origin peer id and its client-seq, so the watchOps broadcast that
      the apply provokes is tagged `f`/`cs` for the requester's echo
      table. Null the rest of the time (the host's own edits tag `f=self`,
      no cs). See host.ts serviceReq / installOpBroadcast. */
  pendingFrom?: string | null;
  pendingCs?: number | null;
  /** host only: the blob deps of the peer request being serviced, so the
      broadcast the apply provokes carries them as `op.b` */
  pendingBlobs?: string[] | null;
  /** peer only: re-arm the join collectors for a resync (a reject after a
      locally-applied op). Installed by installJoin, called by the reject
      handler; leaves the op machinery in place and takes a fresh snapshot. */
  restartJoin?: () => void;
  /** peer only: the request-side state — the per-cs echo table and the
      gate's pending classification. Shared between the gate, the coalescer,
      the op-apply reconciler and the reject handler. Typed loosely here so
      live.ts stays free of peer.ts internals; peer.ts owns the shape. */
  peerReq?: { sentLocal: Map<number, { localApplied: boolean }>; nextCs: number; pendingMode: 'apply' | 'defer' | null };
  /** unsubscribes and uninstalls to run on leave (watchOps, gate, eph) */
  teardown: (() => void)[];
}

/* the module-level singleton — one session at a time. host.ts and peer.ts
   read it through the accessor so index.ts owns its lifetime. */
let current: Live | null = null;

export function getLive(): Live | null { return current; }
export function setLive(l: Live | null): void { current = l; }
