/* Where a bound message lands. Every bindable target (a device param,
   a global) is named by one string, "nodeId:param" or "global:param".
   A mounted knob registers a live setter; when none is mounted (the
   target's level isn't the one drilled in, or its panel is collapsed)
   the message falls back to writing the param straight into the
   node's data in the patch tree.

   The model fallback dispatches a setParam op rather than writing the
   tree itself: the bench applier lands it on the right level (in place,
   by reference, so the engine feels it on its next read) and gives it
   the debounced persist. Globals never take this path — their knobs are
   always mounted. */

import { GLOBAL_PARAMS, resolveSlot } from '../patch';
import { dispatchParam, mirror } from '../runtime';
import type { Slot } from '@ldlework/dials';
import type { Listener, Target } from './types';

const targets = new Map<string, Target>();

/** a target registers the setter its knob already uses, plus a stepper
    for relative encoders; call this once per mount (and again if the
    setter identity changes) */
export function registerTarget(target: string, onValue: Listener, onStep: (steps: number) => void): void {
  targets.set(target, { onValue, onStep });
}

export function unregisterTarget(target: string): void {
  targets.delete(target);
}

/** the mounted knob's setters, or the model-write fallback; null if
    the target no longer names anything */
export function resolveTarget(target: string): Target | null {
  return targets.get(target) ?? modelTarget(target);
}

/** a target still resolves if it names a global param, or a param on
    a node that's still in the current graph — the check a bench
    rebuild (New/Piece/Duo/paste) needs before trusting old bindings */
export function targetResolves(target: string): boolean {
  const i = target.indexOf(':');
  if (i < 0) return false;
  const scope = target.slice(0, i), param = target.slice(i + 1);
  if (scope === 'global') return param in GLOBAL_PARAMS;
  const n = mirror.nodes.find(n => n.id === scope);
  /* `param` is a slot PATH ("zoom" | "zoom/freq"); it resolves if the
     path walks to a real slot in the node's live tree. A binding to a
     sub-slot dies when its source is swapped — the walk returns null. */
  return !!n && resolveSlot(n.data.slots, param) !== null;
}

/* ---- the model fallback ------------------------------------------------- */

let modelWritten: (() => void) | null = null;

/** the bench registers its debounced persist here, so a CC landing in
    an unmounted corner of the tree still survives a reload */
export function onModelWrite(cb: () => void): void {
  modelWritten = cb;
}

/** the bench applier fires this after a setParam op lands on an
    unmounted level — the same debounced persist the direct model write
    used to trigger itself */
export function fireModelWrite(): void {
  modelWritten?.();
}

/** min/max/step off a slot's meta — the range a CC maps into. Sub-slots
    (source params) carry their own meta, so this works at any depth. */
function slotRange(slot: Slot<number>): { min: number; max: number; step?: number } {
  const m = slot.dial.meta;
  return { min: m.min ?? 0, max: m.max ?? 1, ...(m.step !== undefined ? { step: m.step } : {}) };
}

const clampStep = (r: { min: number; max: number; step?: number }, v: number): number => {
  v = Math.min(r.max, Math.max(r.min, v));
  return r.step ? Math.round(v / r.step) * r.step : v;
};

/* a CC with no mounted knob rides the op dispatcher: the setParam op is
   addressed by the node's compiled id, which the applier resolves to
   (scope, level-local id) and lands in place. Scope is a placeholder —
   the applier reads the level from the compiled id. `silent` forces the
   in-place tree write on ANY level, viewed or not: a CC must never ride
   a React render, so a relative encoder re-reads the value it just wrote
   and a burst never drops an increment.

   `param` is a slot path — a root knob or a modulated sub-param; the
   range comes off the resolved slot's own meta, so learning a CC to a
   source's `freq` sub-slot works the same as to a root knob. */
function modelTarget(target: string): Target | null {
  const i = target.indexOf(':');
  if (i < 0) return null;
  const scope = target.slice(0, i), param = target.slice(i + 1);
  if (scope === 'global') return null;
  const n = mirror.nodes.find(n => n.id === scope);
  const slot = n ? (resolveSlot(n.data.slots, param) as Slot<number> | null) : null;
  if (!n || !slot) return null;
  const r = slotRange(slot);
  /* routed through the wire proxy: a CC on a ridden param belongs to
     the driving dial, exactly as the mounted knob's setter would land */
  const write = (v: number): void => {
    dispatchParam(scope, param, slot, clampStep(r, v), { silent: true });
  };
  const current = (): number => slot.lastSample ?? slot.dial.value;
  return {
    onValue: t => write(r.min + t * (r.max - r.min)),
    onStep: steps => write(current() + steps * (r.step || (r.max - r.min) / 120)),
  };
}
