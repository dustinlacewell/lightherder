/* The runtime — the live session state shared between React, the
   engine, and MIDI, split by domain:

     mirror     the compiled patch + globals the engine reads
     transport  the freeze switch
     gestures   sparks and momentary holds (performance transients)
     live       engine → knob feedback for ridden params
     stage      DOM rects the blitter paints into
     engineRef  the engine, as a narrow interface
     release    cross-layer teardown for a departed node

   React owns the graph and mirrors it here every render; the engine
   reads it every tick without ever touching React. */

export { mirror } from './mirror';
export { transport, setFrozen, stepOnce, clearAllScreens } from './transport';
export { spark, tap, sparkAll, sampleSpark, holdSwitch, releaseSwitch, heldInput, dropGesturesUnder, drawStroke, drawCommit, drawClear, type Spark } from './gestures';
export { emitEph, watchEph, muted, type Eph } from './ephemera';
export { liveValue, setLive, clearLive, flushLive, watchLive } from './live';
export { stage, setFace, addShield, dropFacesUnder, type PopoutSink } from './stage';
export { engineRef, type EngineApi, type DrawSurface } from './engineRef';
export { releaseNode } from './release';
export { dispatch, record, applyRemote, watchOps, registerApplier, setGate, gateMode, expectEcho, consumeEcho, type DispatchOpts, type Gate } from './dispatch';
