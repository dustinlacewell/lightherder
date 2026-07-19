/* The compiled patch, as the engine reads it. React owns the tree
   (as editor state) and mirrors its flat compile here every render;
   the engine reads it every tick without ever touching React. The
   globals ride along — they're part of the document, and the engine
   paces itself by them. */

import { globalSlots, type PatchEdge, type PatchNode } from '../patch';
import type { Dials } from '@ldlework/dials';

export const mirror = {
  nodes: [] as PatchNode[],
  edges: [] as PatchEdge[],
  globals: globalSlots() as Dials,
};
