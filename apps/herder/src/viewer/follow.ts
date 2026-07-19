/* Follow, hard-on — the viewer's one act of choosing what to show.

   The host relays its preview pin as session state (remotePin); the
   viewer points its full-window preview at whatever that names, as soon
   as the named node EXISTS in the compiled mirror. Two facts make this a
   per-frame resolve rather than a React effect:

     · a pin can arrive before the op that brings its node into the graph
       (the ephemera and op channels are separate), so a pin that doesn't
       resolve yet must be retried until it does — every frame is the
       cheapest honest retry.
     · once a screen has been caught, a pin that stops resolving (a screen
       mid-removal, a transient) must not blank the monitor — keep the last
       valid pin. Only a fresh pin that DOES resolve replaces it.

   Called from the frame loop before the engine step, so stage.preview
   points at a live node before the blitter reads it. Returns the resolved
   id (or null) so the UI can show the "waiting for a screen" note until
   the first one lands. */

import { mirror, stage } from '../runtime';
import { sessionStore } from '../session';

/* the kinds with a face the preview can mirror — the bench's own set */
const FACED = new Set<string>(['camera', 'monitor', 'mixer', 'draw', 'media']);

/** resolve the host's pin against the live mirror; adopt it when it names
    a faced node, else keep whatever the preview already shows. */
export function resolveFollow(): void {
  const pin = sessionStore.state().remotePin;
  if (pin && mirror.nodes.some(n => n.id === pin && FACED.has(n.type ?? ''))) {
    stage.preview.nodeId = pin;
  }
  /* an unresolved pin leaves stage.preview.nodeId untouched — the last
     caught screen keeps showing (or null, the waiting state, if none ever). */
}
