/* Live param values — the engine's feedback channel to the knobs.

   "nodeId:param" → the value the engine actually rendered with last
   tick (knob + what rides its control port). An entry exists ONLY
   while a wire is riding the param — presence is the signal that the
   knob should display this instead of its base value. The engine
   publishes once per tick; a mounted knob subscribes to its own
   target and re-renders on change. Same shape as the midi module's
   learnWatchers — no polling, and a tick that changes nothing
   notifies no one. */

const liveValues = new Map<string, number>();
const liveWatchers = new Map<string, Set<() => void>>();
const liveDirty = new Set<string>();

/** the ridden value for a target, if a wire is riding it right now */
export function liveValue(target: string): number | undefined {
  return liveValues.get(target);
}

/** engine only: record a ridden param's effective value this tick */
export function setLive(target: string, v: number): void {
  if (liveValues.get(target) === v) return;
  liveValues.set(target, v);
  liveDirty.add(target);
}

/** engine only: nothing rides this param anymore — the knob's base is
    the truth again */
export function clearLive(target: string): void {
  if (liveValues.delete(target)) liveDirty.add(target);
}

/** engine only: end of tick — tell every watcher whose value moved */
export function flushLive(): void {
  if (!liveDirty.size) return;
  for (const t of liveDirty) for (const cb of liveWatchers.get(t) ?? []) cb();
  liveDirty.clear();
}

/** a knob subscribes to its own "nodeId:param" — called whenever the
    engine's effective value for it changes (or stops existing) */
export function watchLive(target: string, cb: () => void): () => void {
  let set = liveWatchers.get(target);
  if (!set) liveWatchers.set(target, set = new Set());
  set.add(cb);
  return () => { set!.delete(cb); if (!set!.size) liveWatchers.delete(target); };
}

/* ---- the tick pulse ---------------------------------------------------
   Some followers track engine-resolved values that live outside the
   live map — the xypad's lag puck reads its slot's own lastSample.
   Those values only move when the engine ticks, so followers wake here,
   once per tick, instead of each running a rAF poll of its own. */

const tickWatchers = new Set<() => void>();

/** engine only: end of tick — wake the per-tick followers */
export function notifyTick(): void {
  for (const cb of tickWatchers) cb();
}

/** subscribe to the engine's tick pulse; returns an unsubscribe */
export function watchTick(cb: () => void): () => void {
  tickWatchers.add(cb);
  return () => { tickWatchers.delete(cb); };
}
