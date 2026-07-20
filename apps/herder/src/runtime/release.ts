/* A node left the graph: one call releases everything it held, across
   layers — the engine's GPU state and stored media, its pending
   gestures, its face registrations. The UI never sweeps piecemeal.

   Two verbs, one distinction: releaseNode is FOR GOOD (the node left
   the document — stored media is forgotten too); parkNode is a view
   swap (the solo drill benched the graph — everything live is swept,
   but stored media survives so the node comes back whole). */

import { engineRef } from './engineRef';
import { dropGesturesUnder } from './gestures';
import { dropFacesUnder } from './stage';

export function releaseNode(id: string): void {
  engineRef.current?.dropNode(id);
  dropGesturesUnder(id);
  dropFacesUnder(id);
}

export function parkNode(id: string): void {
  engineRef.current?.parkNode(id);
  dropGesturesUnder(id);
  dropFacesUnder(id);
}
