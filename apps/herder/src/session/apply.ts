/* Remote ephemera — the performance transients a session relays but the
   document never keeps: sparks, taps, holds, draw strokes, freeze, step,
   clear, pin, remote media URLs (media blobs ride the blob channel, S4).

   Two directions, one file:

     · SEND — the host mirrors its own play to every peer. A subscription
       on the runtime's ephemera seam batches per animation frame and sends
       the batch on `eph`. A read-only peer sends nothing (H5), so only the
       host installs this.

     · APPLY — a received ephemeron drives the SAME runtime call that made
       it, wrapped in `muted` so replaying it doesn't bounce back onto the
       wire. Both host and peer apply what they hear from the other.

   The runtime functions each emit their own ephemeron; `muted` is what
   keeps a remote spark from echoing. Non-blob ephemera are wired fully here
   so two-tab testing shows sparks, holds, draws and freezes syncing; the
   `media` blob is stubbed until S4 brings the blob channel semantics. */

import {
  clearAllScreens, drawClear, drawCommit, drawStroke, engineRef, holdSwitch, muted,
  releaseSwitch, setFrozen, spark, stepOnce, tap, watchEph, type Eph,
} from '../runtime';
import { selfId } from './room';
import { sessionStore } from './store';
import type { Live } from './live';

/** an ephemeron on the wire, tagged with its origin so the star can relay
    it: the host rebroadcasts a write-peer's gesture under the originator's
    `f`, and the originator skips its own rebroadcast (f === selfId). */
interface EphMsg { f: string; e: Eph }

/** wire the ephemera relay for a live session (§E direction). BOTH roles
    send now (S5): the host mirrors its own play to all; a WRITE-granted
    peer sends its gestures to the host, which validates the write bit and
    rebroadcasts them tagged `f`. A read-only peer sends nothing (invariant
    (h)). Both roles apply the foreign ephemera they hear. */
export function installEph(l: Live, isHost: boolean): void {
  installEphSend(l, isHost);
  installEphApply(l, isHost);
}

/* mirror this tab's own play. The host always sends; a peer sends only
   while WRITE-granted (checked at flush, so a mid-session revoke stops the
   stream at once — invariant (h)). Batched per rAF so a burst of stroke
   segments becomes one send. Every ephemeron carries our own id as origin
   so the receiver can tell it apart from its own rebroadcast. */
function installEphSend(l: Live, isHost: boolean): void {
  let batch: Eph[] = [];
  let raf = 0;
  const flush = (): void => {
    raf = 0;
    const b = batch; batch = [];
    /* a read-only peer relays nothing — checked HERE (not at watch time) so
       a write grant/revoke that lands mid-frame is honored on this flush */
    if (!isHost && !sessionStore.state().write) return;
    for (const e of b) void l.room.actions.eph.send({ f: selfId, e });
  };
  const off = watchEph(e => {
    /* a media blob can't ride the JSON eph channel — it goes on the blob
       channel instead (S6), tagged kind:'media' so the receiver applies it
       live and the host tells it from an entryCreate's held dep. The host
       broadcasts to all; a WRITE-granted peer ships to the host, which
       validates the write bit and rebroadcasts (installEphApply's host
       branch has no media role — the blob channel carries it). A read-only
       peer sends nothing (invariant (h)). */
    if (e.t === 'media') {
      if (!isHost && !sessionStore.state().write) return;
      void l.room.actions.blob.send(e.blob, { key: e.key, mime: e.blob.type || 'application/octet-stream', kind: 'media' });
      return;
    }
    batch.push(e);
    if (!raf) raf = requestAnimationFrame(flush);
  });
  l.teardown.push(() => { off(); if (raf) cancelAnimationFrame(raf); });
}

/* apply a received ephemeron by driving its runtime call, muted so the
   call's own emit doesn't re-send it.

   The star's relay: a PEER only ever receives eph from the host connection;
   the `f` tag names the true origin (the host, or a fellow write-peer whose
   gesture the host relayed). It applies anything whose origin is not itself
   (skipping its own rebroadcast). The HOST receives a write-peer's gesture
   directly: it validates the sender's write bit, APPLIES it locally, and
   REBROADCASTS it tagged `f = origin` so the other peers see it too.

   Dropped entirely while phase === 'joining': the swap has not run, so the
   bench is still the peer's own (or half-torn-down) and none of the host's
   node ids exist yet. Sparks and strokes are transient — losing the handful
   that race the snapshot costs nothing. But applying them pre-swap is
   actively harmful: a `stroke`/`drawcommit`/`drawclear` calls drawFor(id),
   whose DrawSource constructor would auto-create a host-id surface that
   MISSES the incoming snapshot PNG, and a pre-swap drawcommit could persist
   a partial canvas over the host's stored picture before it even arrives.
   So we hold nothing and replay nothing — just drop until 'live'. */
function installEphApply(l: Live, isHost: boolean): void {
  l.room.actions.eph.onMessage((raw, from) => {
    const msg = raw as EphMsg;
    if (isHost) {
      /* only a WRITE-granted peer's gesture counts (never trust the client);
         apply it, then relay to the other peers under the origin's id */
      if (!l.roster.get(from)?.write) return;
      apply(msg.e);
      void l.room.actions.eph.send({ f: from, e: msg.e });
      return;
    }
    /* peer: only the host relays eph. Skip our OWN rebroadcast (f === self),
       apply everything else the host forwards. */
    if (from !== l.hostId) return;
    if (msg.f === selfId) return;
    if (sessionStore.state().phase === 'joining') return;   // pre-swap: drop (see above)
    apply(msg.e);
  });
  l.teardown.push(() => l.room.actions.eph.onMessage(null));
}

function apply(e: Eph): void {
  muted(() => {
    switch (e.t) {
      case 'spark': spark(e.id, e.x, e.y); return;
      case 'tap': tap(e.id, e.x, e.y); return;
      case 'hold': holdSwitch(e.id, e.input); return;
      case 'unhold': releaseSwitch(e.id); return;
      case 'stroke': drawStroke(e.id, e.x0, e.y0, e.x1, e.y1, e.hue, e.size); return;
      case 'drawcommit': drawCommit(e.id); return;
      case 'drawclear': drawClear(e.id); return;
      /* a remote freeze flips the runtime switch; bump the session version
         so useFreeze re-reads transport.frozen and the Transport button
         reflects the host's state (invariant (e)) */
      case 'frozen': setFrozen(e.on); sessionStore.set({}); return;
      case 'tick': stepOnce(); return;
      case 'clearAll': clearAllScreens(); return;
      /* the pin is state, not a runtime act: a following peer's preview
         reads remotePin (S6 wires the follow). Set it now so the seam is
         live for two-tab testing. */
      case 'pin': sessionStore.set({ remotePin: e.id }); return;
      /* unreachable: a media ephemeron never rides the eph channel — its
         blob goes on the blob channel (installEphSend strips it, the host/
         peer blob handlers store + loadMedia it, S6). Kept for exhaustiveness. */
      case 'media': return;
      /* a URL is a string, not a blob — it rides the normal eph batch */
      case 'mediaurl': void engineRef.current?.loadMediaUrl(e.key, e.url); return;
    }
  });
}
