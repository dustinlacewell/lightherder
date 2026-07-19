/* Composition root for the viewer — a read-only peer that runs the full
   engine and shows exactly one thing: the host's pinned screen,
   full-window. It parallels main.tsx (boot GL + Engine + engineRef, run
   the frame loop) but with NONE of the bench's boot side effects: no
   migrate, no loadPatch, no MIDI. The viewer's document starts EMPTY —
   the join snapshot fills it and the op stream keeps it live.

   The session machinery is reused unchanged: joinSession installs the
   peer loop (read-only gate, join snapshot, op stream, ephemera), all of
   which route document changes through the headless applier registered
   here. The viewer never persists its own document. */

import { createRoot } from 'react-dom/client';
import './viewer.css';
import { bootGL } from '../gl/context';
import { Engine } from '../engine';
import { engineRef } from '../runtime';
import { installViewerApplier } from './applier';
import { resolveFollow } from './follow';
import { Viewer } from './Viewer';

const canvas = document.getElementById('glass') as HTMLCanvasElement;

function resize(): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.max(4, Math.round(window.innerWidth * dpr));
  canvas.height = Math.max(4, Math.round(window.innerHeight * dpr));
}

try {
  const glc = bootGL(canvas);
  engineRef.current = new Engine(glc);
} catch (err) {
  const e = document.createElement('div');
  e.className = 'gl-err';
  e.textContent = err instanceof Error ? err.message : String(err);
  document.body.append(e);
}

resize();
addEventListener('resize', resize);

/* register the headless applier BEFORE any join can feed it an op. No
   boot restore to await — the viewer holds an empty document and no stash
   of its own, so it mounts at once. */
installViewerApplier();
createRoot(document.getElementById('root')!).render(<Viewer />);

let rafId = 0;
function frame(now: number): void {
  rafId = requestAnimationFrame(frame);
  /* resolve the host's pin against the live mirror BEFORE the engine
     blits, so the preview points at a node that exists this frame (a pin
     that raced its node's op is retried here, every frame, until it lands) */
  resolveFollow();
  engineRef.current?.step(now, canvas.width, canvas.height);
}
rafId = requestAnimationFrame(frame);

/* a hidden tab burns no GPU; the tick scheduler re-anchors on return */
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { cancelAnimationFrame(rafId); rafId = 0; }
  else if (!rafId) rafId = requestAnimationFrame(frame);
});
