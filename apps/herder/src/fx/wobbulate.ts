import type { FxDef } from './def';
import { f2, f3 } from '../patch/fmt';

/* the Rutt/Etra gesture: scanlines ride one sine, columns another */
export const wobbulate: FxDef = {
  label: 'Wobbulator',
  frag: /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 frag;

uniform sampler2D uSrc;
uniform float uAmpX;    /* scanline throw, fraction of frame  */
uniform float uFreqX;   /* folds stacked down the frame       */
uniform float uAmpY;    /* column throw                       */
uniform float uFreqY;   /* folds stacked across the frame     */
uniform float uPhase;   /* accumulated crawl, radians         */

void main(){
  /* the Rutt/Etra bend: rows ride a sine of their height, columns a
     sine of their reach. The two phases run at different rates so a
     matched-freq weave still slides against itself. */
  vec2 uv = vUv;
  uv.x += uAmpX * sin(6.2831853 * uFreqX * vUv.y + uPhase);
  uv.y += uAmpY * sin(6.2831853 * uFreqY * vUv.x + uPhase * 1.7);
  frag = vec4(texture(uSrc, uv).rgb, 1.0);
}`,
  params: {
  ampx: { label: 'Amp X', min: 0, max: 0.20, def: 0, fmt: f3, desc: 'How far each scanline is thrown sideways, as a fraction of the frame. 0 = a straight wire. The classic wobbulator throw — a dial here breathes the whole raster.' },
  freqx: { label: 'Freq X', min: 0.5, max: 24, def: 3, fmt: f2, desc: 'How many sideways folds stack down the frame — the spatial frequency of the scanline wobble. Low = one lazy bend; high = corrugation.' },
  ampy: { label: 'Amp Y', min: 0, max: 0.20, def: 0, fmt: f3, desc: 'How far each column is thrown vertically, as a fraction of the frame. With Amp X it weaves; alone it ripples like a flag on its side.' },
  freqy: { label: 'Freq Y', min: 0.5, max: 24, def: 3, fmt: f2, desc: 'How many vertical folds stack across the frame. Detune it against Freq X and the weave stops repeating.' },
  speed: { label: 'Speed', min: -3, max: 3, def: 0.25, fmt: v => v.toFixed(2) + 'Hz', desc: 'How fast the wobble crawls, in cycles per second of SIM time. Negative runs it backward; 0 freezes the bend where it stands. The phase accumulates, so riding this knob bends time without tearing it.' },
  },
  uniforms: (pv, ctx) => {
    const st = (ctx.state.crawl ??= { phase: 0, last: ctx.simTime }) as { phase: number; last: number };
    st.phase += pv('speed') * 2 * Math.PI * (ctx.simTime - st.last);
    st.last = ctx.simTime;
    return { uAmpX: pv('ampx'), uFreqX: pv('freqx'), uAmpY: pv('ampy'), uFreqY: pv('freqy'), uPhase: st.phase };
  },
  face: { inp: 'the picture to bend', out: 'the bent raster', reset: 'Reset to a straight wire — both amps to zero, freqs and speed back to their marks.' },
  hint: 'Wobbulator — bends the raster: scanlines ride a sine, columns another; amps, folds and crawl all on knobs',
};
