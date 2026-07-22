/* The toolbar's crystal ball — a tiny standalone GL rig that runs one
   effect over the stock stained-glass pane while every knob sweeps its
   whole range. One shared canvas + WebGL2 context, booted on the first
   hover and kept for the session; one FullscreenPass per effect kind,
   compiled the first time that effect is looked at. A mount adopts the
   canvas into the hover card and ticks its own rAF while the card is
   open; the main engine never knows this exists. */

import { FullscreenPass, toScreen } from '@ldlework/gl';
import { bootGL } from '../../engine/context';
import { FrameTex } from '../../engine/sources/frameTex';
import { paintStainedGlass } from '../../engine/sources/stainedGlass';
import { FX } from '../../fx';

/* backing store at 2× the card's 220×124 CSS box, for hidpi glass */
const W = 440;
const H = 248;
/* a full knob sweep about every nine seconds — the moderate pace */
const RATE = 0.7;
/* golden-angle phase spread so the knobs don't move in lockstep */
const GOLDEN = 2.399963229728653;

interface Rig {
  canvas: HTMLCanvasElement;
  gl: WebGL2RenderingContext;
  src: WebGLTexture;
  passes: Map<string, FullscreenPass>;
}

let rig: Rig | null = null;

function bootRig(): Rig {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  canvas.className = 'tool-card-preview';
  const { gl } = bootGL(canvas);
  const frame = new FrameTex(gl);
  frame.upload(paintStainedGlass());
  return { canvas, gl, src: frame.tex, passes: new Map() };
}

function passFor(r: Rig, kind: keyof typeof FX): FullscreenPass {
  let pass = r.passes.get(kind);
  if (!pass) {
    pass = new FullscreenPass(r.gl, FX[kind].frag);
    r.passes.set(kind, pass);
  }
  return pass;
}

/** Adopt the shared preview canvas into `host` and animate `kind`
    over the stained glass until the returned dispose runs. */
export function mountFxPreview(host: HTMLElement, kind: keyof typeof FX): () => void {
  const r = (rig ??= bootRig());
  host.appendChild(r.canvas);
  const def = FX[kind];
  const phase = new Map(Object.keys(def.params).map((k, i) => [k, i * GOLDEN]));
  const state: Record<string, unknown> = {};
  const t0 = performance.now();
  let raf = 0;
  const tick = () => {
    const t = (performance.now() - t0) / 1000;
    const pv = (key: string): number => {
      const p = def.params[key];
      return p.min + (p.max - p.min) * (0.5 + 0.5 * Math.sin(t * RATE + (phase.get(key) ?? 0)));
    };
    const vals = def.uniforms(pv, { simTime: t, state });
    toScreen(r.gl, W, H, () => passFor(r, kind).draw({ uSrc: r.src, uRes: [W, H], uTime: t, ...vals }));
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => {
    cancelAnimationFrame(raf);
    r.canvas.remove();
  };
}
