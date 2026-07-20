import type { FxDef } from './def';
import { f2 } from '../patch/fmt';
import { COMMON } from './glsl';

/* the darkroom fold: tones past the threshold reflect back down */
export const solarize: FxDef = {
  label: 'Solarize',
  frag: /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 frag;

uniform sampler2D uSrc;
uniform float uThresh;
uniform float uFold;
uniform float uPerChan;
${COMMON}
void main(){
  vec3 src = texture(uSrc, vUv).rgb;
  /* the Sabattier fold: light past the threshold reflects back down.
     Luma-domain keeps hue and folds the envelope; per-channel folds
     R, G, B on their own and false color blooms at the crossings */
  float l = luma(src);
  float lf = l >= uThresh ? uThresh - (l - uThresh) * uFold : l;
  vec3 lumaFold = src * (lf / max(l, 1e-4));
  vec3 chanFold = mix(src, uThresh - (src - uThresh) * uFold, step(vec3(uThresh), src));
  frag = vec4(clamp(mix(lumaFold, chanFold, uPerChan), 0.0, 1.0), 1.0);
}`,
  params: {
  thresh:  { label: 'Thresh', min: 0, max: 1, def: 1, fmt: f2, desc: 'The fold point — light past this reflects back toward black. At 1 nothing folds: a straight wire. Sweep it down and highlights invert first, the Sabattier look.' },
  fold:    { label: 'Fold', min: 0, max: 2, def: 1, fmt: f2, desc: 'How hard the curve reflects — the slope past the threshold. ×1 mirrors; above 1 the fold overshoots and re-folds in a loop. Video wavefolding.' },
  perchan: { label: 'PerChan', min: 0, max: 1, def: 0, fmt: f2, desc: 'Fold each RGB channel on its own instead of the luma envelope — false color blooms where channels cross the threshold at different times.' },
  },
  uniforms: pv => ({ uThresh: pv('thresh'), uFold: pv('fold'), uPerChan: pv('perchan') }),
  face: { inp: 'the picture to fold', out: 'the folded tones', reset: 'Reset to a straight wire — threshold to the top, mirror fold, luma domain.' },
  hint: 'Solarize — folds tones past a threshold back down; the darkroom Sabattier fold, per-channel if you like',
};
