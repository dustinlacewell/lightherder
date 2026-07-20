/* The patch domain — the pure document model and its transformations.
   No DOM, no GL, no React: everything here runs anywhere a patch
   needs to exist (editor, engine, a future headless viewer). */

export {
  polarityOf, defaultValues, defaultGlobals,
  slotFor, slotsFor, globalSlots, paramHints,
  PARAMS, DRAWER, GLOBAL_PARAMS, DIAL_VAL_UNI, XYPAD_X_UNI, XYPAD_Y_UNI, MIXER_MODES, DELAY_MAX, RES_STEPS, RES_LABELS,
  type ParamDef, type ParamHints,
} from './params';
export {
  resolveSlot, slotToSnap, slotFromSnap, applySnapOverlay, treeToSnap, cloneTree, applySlotOp,
} from './slots';
export {
  handleKind, validConnection, moduleInterface, mediaPaths, makeNode, makeEdge, mintNodeId,
  SWITCH_INS,
  type NodeKind, type NodeData, type PatchNode, type PatchEdge, type SubPatch,
  type Patch, type ModulePort, type MakeOpts,
} from './graph';
export {
  refClosure, instancePrefixes, sweepEntryVals, bakeEntry,
  type InstVals, type LibEntryDef, type LibraryDoc, type EntryResolver,
} from './library';
export { compile, adoptSources } from './compile';
export { levelAt, viewContext, projectLevel, unproject, carryOrphanEdges, libCrumbId, libHead, type Crumb, type ViewCtx, type Overlay } from './drill';
export { resolveCompiled, type Resolved } from './resolve';
export {
  applyOp, isValueOp, isSlotValueOp, VALUE_OPS,
  type Op, type OpScope, type OpEffect, type PropKey, type SlotValueOp,
} from './ops';
export { graphToJSON, graphFromJSON, patchToJSON, patchFromJSON } from './json';
export { CAMCORDER, piecePatch, duoPatch } from './presets';
