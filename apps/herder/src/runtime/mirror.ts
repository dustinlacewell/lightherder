/* The compiled patch, as the engine reads it. React owns the tree
   (as editor state) and mirrors its flat compile here every render;
   the engine reads it every tick without ever touching React. The
   globals ride along — they're part of the document, and the engine
   paces itself by them. */

import { defaultGlobals, type PatchEdge, type PatchNode } from '../patch';

export const mirror = {
  nodes: [] as PatchNode[],
  edges: [] as PatchEdge[],
  globals: defaultGlobals(),
};
