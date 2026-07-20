/* Composition root: boot the GL overlay and the engine, mount the
   bench, run the frame loop. The engine lives entirely outside React —
   React mirrors the graph into the runtime and the engine reads it
   there. */

import { createRoot } from 'react-dom/client';
import '@xyflow/react/dist/style.css';
import '@ldlework/phosphor/styles.css';
import '@ldlework/phosphor-dials/styles.css';
import './style.css';
import { bootGL } from './engine/context';
import { Engine } from './engine';
import { engineRef } from './runtime';
import { App } from './ui/App';
import { bootRestore } from './ui/bench/boot';

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

/* gate the first render on the boot media restore: after a mid-session tab
   kill, boot.ts copies the peer's stashed blob shadows back over the live
   keys, and a MediaSource/DrawSource constructor reads loadStoredMedia
   exactly once at construction. Mount Bench (whose first compile builds
   those sources) only once the copy-back has settled, so no source reads a
   key mid-copy. bootRestore resolves immediately when there was no stash, so
   the common boot pays nothing but one already-resolved microtask. */
void bootRestore.then(() => {
  createRoot(document.getElementById('root')!).render(<App />);
});

let rafId = 0;
function frame(now: number): void {
  rafId = requestAnimationFrame(frame);
  engineRef.current?.step(now, canvas.width, canvas.height);
}
rafId = requestAnimationFrame(frame);

/* a hidden tab burns no GPU; the tick scheduler re-anchors on return */
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { cancelAnimationFrame(rafId); rafId = 0; }
  else if (!rafId) rafId = requestAnimationFrame(frame);
});
