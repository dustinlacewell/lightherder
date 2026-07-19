/* The pop-out: a same-origin child window whose canvas the ENGINE
   paints directly (same thread) with a GPU→GPU drawImage — full
   native resolution, no pixels over the bus. This module only builds
   the window and registers its context with the stage. */

import { stage } from '../../runtime';

export function openPopout(): Window | null {
  const w = window.open('', 'herder-preview', 'width=520,height=320');
  if (!w) return null;
  w.document.body.style.cssText = 'margin:0;background:#0d0b08;overflow:hidden;';
  const canvas = w.document.createElement('canvas');
  canvas.style.cssText = 'width:100vw;height:100vh;display:block;';
  w.document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  if (!ctx) return w;
  const resize = (): void => {
    const dpr = Math.min(w.devicePixelRatio || 1, 2);
    canvas.width = Math.max(4, Math.round(w.innerWidth * dpr));
    canvas.height = Math.max(4, Math.round(w.innerHeight * dpr));
    stage.preview.popout = { win: w, ctx, w: canvas.width, h: canvas.height };
  };
  w.addEventListener('resize', resize);
  resize();
  return w;
}
