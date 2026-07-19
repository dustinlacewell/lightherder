/* A node left the graph: one call releases everything it held, across
   layers — the engine's GPU state and stored media, its pending
   gestures, its face registrations. The UI never sweeps piecemeal. */

import { engineRef } from './engineRef';
import { dropGesturesUnder } from './gestures';
import { dropFacesUnder } from './stage';

export function releaseNode(id: string): void {
  engineRef.current?.dropNode(id);
  dropGesturesUnder(id);
  dropFacesUnder(id);
}
