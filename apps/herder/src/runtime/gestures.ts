/* Performance gestures — the transient acts of playing the instrument
   that aren't part of the document: sparks tapped onto faces, and
   momentary switch holds. They cause no re-renders and never persist;
   they are exactly the kind of event a future collaborator's wire
   would carry. */

import { emitEph } from './ephemera';
import { engineRef } from './engineRef';
import { mirror } from './mirror';

/* a flash on a face: the default decays over ~3s of sim time; a TAP
   is an impulse — full power in exactly one committed frame */
export interface Spark { x: number; y: number; t: number; hue: number; power: number; tap: boolean }

const sparks = new Map<string, Spark>();   // nodeId → a tapped flash on that face
const holds = new Map<string, number>();   // momentary switch id → input held down

let sparkHue = 0;

/** flash a spark on one face — new light for a watching camera.
    Stamped in SIM time, so a frozen bench holds it for the stepper. */
export function spark(nodeId: string, x = 0.5, y = 0.5, power = 1.4): void {
  sparkHue += 1.9;
  sparks.set(nodeId, { x, y, t: engineRef.current?.simTime ?? 0, hue: sparkHue, power, tap: false });
  emitEph({ t: 'spark', id: nodeId, x, y });
}

/** a TAP: a single-frame impulse — it renders into exactly one
    committed frame and is consumed. The step-debugger's probe. */
export function tap(nodeId: string, x = 0.5, y = 0.5, power = 1.7): void {
  sparkHue += 1.9;
  sparks.set(nodeId, { x, y, t: engineRef.current?.simTime ?? 0, hue: sparkHue, power, tap: true });
  emitEph({ t: 'tap', id: nodeId, x, y });
}

/** seed every screen at once — the way to light a dark bench */
export function sparkAll(asTap = false): void {
  for (const n of mirror.nodes)
    if (n.type === 'monitor' || n.type === 'mixer')
      (asTap ? tap : spark)(n.id, 0.42, 0.55);
}

/** engine only: the spark on this face as it stands at `simTime` —
    [x, y, power, hue], power 0 when there's nothing to show. A TAP is
    consumed by the sampling (it renders exactly once). */
export function sampleSpark(id: string, simTime: number): [number, number, number, number] {
  const sp = sparks.get(id);
  if (!sp) return [0, 0, 0, 0];
  if (sp.tap) {
    sparks.delete(id);
    return [sp.x, sp.y, sp.power, sp.hue];
  }
  const age = simTime - sp.t;
  const power = age >= 0 && age < 3 ? Math.exp(-age * 5.5) * sp.power : 0;
  return [sp.x, sp.y, power, sp.hue];
}

/** a momentary switch (or a right-click HOLD) pressed down on an input */
export function holdSwitch(id: string, input: number): void {
  holds.set(id, input);
  emitEph({ t: 'hold', id, input });
}

export function releaseSwitch(id: string): void {
  holds.delete(id);
  emitEph({ t: 'unhold', id });
}

/** the input a held switch is routing right now; undefined = not held */
export function heldInput(id: string): number | undefined {
  return holds.get(id);
}

/* Draw acts — a stroke on a draw surface is a performance transient like
   a spark: the engine mutates the canvas, and a session replays the same
   segments so a peer's DrawSource paints identically. The runtime owns
   these so the UI call site stays "one act, one call". */

/** paint one stroke segment on a draw node and relay it */
export function drawStroke(id: string, x0: number, y0: number, x1: number, y1: number, hue: number, size: number): void {
  engineRef.current?.drawFor(id).stroke(x0, y0, x1, y1, hue, size);
  emitEph({ t: 'stroke', id, x0, y0, x1, y1, hue, size });
}

/** the stroke ended — commit the surface (persists its PNG) and relay */
export function drawCommit(id: string): void {
  engineRef.current?.drawFor(id).commit();
  emitEph({ t: 'drawcommit', id });
}

/** wipe a draw surface and relay */
export function drawClear(id: string): void {
  engineRef.current?.drawFor(id).clear();
  emitEph({ t: 'drawclear', id });
}

/** a node left the graph — forget its gestures (compiled module
    innards live under "<id>/…", so the sweep covers the prefix too) */
export function dropGesturesUnder(id: string): void {
  const under = (k: string) => k === id || k.startsWith(id + '/');
  for (const k of [...sparks.keys()]) if (under(k)) sparks.delete(k);
  for (const k of [...holds.keys()]) if (under(k)) holds.delete(k);
}
