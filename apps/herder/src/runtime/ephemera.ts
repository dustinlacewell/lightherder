/* Ephemera — the performance transients a session relays but the
   document never keeps: sparks, taps, switch holds, draw strokes, the
   freeze switch, the step tick, screen clears, preview pins, and the
   media blobs that ride alongside a markMedia op.

   Same shape as dispatch: emit fans out to whoever is watching (the
   session, when one exists), watch is the seam, and `muted` wraps remote
   application so replaying a received ephemeron doesn't echo back onto
   the wire. With no session there are no watchers, so every emit is a
   silent no-op and the call sites behave byte-for-byte as before.

   This module imports nothing above runtime — ephemera are a runtime
   concern; the session subscribes from the layer above. */

/** the transient acts of playing the instrument, as they cross the wire */
export type Eph =
  | { t: 'spark' | 'tap'; id: string; x: number; y: number }
  | { t: 'hold'; id: string; input: number }
  | { t: 'unhold'; id: string }
  | { t: 'stroke'; id: string; x0: number; y0: number; x1: number; y1: number; hue: number; size: number }
  | { t: 'drawcommit' | 'drawclear'; id: string }
  | { t: 'pin'; id: string | null }
  | { t: 'frozen'; on: boolean }
  | { t: 'tick' }
  | { t: 'clearAll' }
  | { t: 'media'; key: string; blob: Blob };

const watchers = new Set<(e: Eph) => void>();
let mute = 0;

/** fan an ephemeron out to the watchers — a no-op while muted (remote
    application is running) and a no-op with no session (no watchers) */
export function emitEph(e: Eph): void {
  if (mute) return;
  for (const w of watchers) w(e);
}

/** subscribe to the ephemera stream (the session's seam); returns an
    unsubscribe */
export function watchEph(fn: (e: Eph) => void): () => void {
  watchers.add(fn);
  return () => watchers.delete(fn);
}

/** run `fn` with emit suppressed — the wrapper the remote applier uses so
    replaying a received ephemeron drives the same runtime call without
    bouncing it back onto the wire. Reentrant (counted), restored on throw. */
export function muted<T>(fn: () => T): T {
  mute++;
  try { return fn(); }
  finally { mute--; }
}
