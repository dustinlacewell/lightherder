import type { FxDef } from './def';
import { f2, fint, sel } from '../patch/fmt';
import { COMMON, NOISE } from './glsl';

/* domain-warped noise fields: fbm, ridged, cells */
const NOISE_TYPES = ['FBM', 'RIDGE', 'CELLS'];

export const noise: FxDef = {
  label: 'Noise',
  frag: /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 frag;
uniform sampler2D uSrc;
uniform vec2  uRes;
uniform float uTime;
uniform float uType;   /* 0 fbm, 1 ridged, 2 cells */
uniform float uScale;
uniform float uOct;
uniform float uWarp;
uniform float uEvolve;
uniform float uMix;
${COMMON}
${NOISE}
void main(){
  float aspect = uRes.x / uRes.y;
  vec2 p = (vUv - 0.5) * vec2(aspect, 1.0) * uScale;
  float t = uTime * uEvolve;
  p += uWarp * vec2(fbmn(p + vec2(0.0, t), uOct), fbmn(p + vec2(5.2, t * 1.3), uOct));
  float v;
  if (uType < 0.5)      v = fbmn(p + t * 0.3, uOct);
  else if (uType < 1.5) v = 1.0 - abs(2.0 * fbmn(p + t * 0.3, uOct) - 1.0);
  else                  v = clamp(worley(p, t), 0.0, 1.0);
  vec3 src = texture(uSrc, vUv).rgb;
  frag = vec4(mix(src, vec3(v), uMix), 1.0);
}`,
  params: {
    type:   { label: 'Type', min: 0, max: 2, def: 0, step: 1, fmt: sel(NOISE_TYPES), desc: 'The field’s character: FBM cloud, RIDGE veins, or CELLS — cracked-mud Worley cells.' },
    scale:  { label: 'Scale', min: 1, max: 16, def: 4, fmt: f2, desc: 'Spatial frequency — weather systems at 1, TV static toward 16.' },
    oct:    { label: 'Octaves', min: 1, max: 6, def: 4, step: 1, fmt: fint, desc: 'Layers of detail stacked into the field.' },
    warp:   { label: 'Warp', min: 0, max: 2, def: 0, fmt: f2, desc: 'The field folded through itself — domain warping. Up and the clouds go liquid.' },
    evolve: { label: 'Evolve', min: -2, max: 2, def: 0.25, fmt: f2, desc: 'Time drift. 0 freezes the field solid.' },
    mix:    { label: 'Mix', min: 0, max: 1, def: 1, fmt: f2, desc: 'Field against the input. Unwired, 1 is a pure generator; wired, sweep it to sit the field over the picture.' },
  },
  uniforms: pv => ({ uType: Math.round(pv('type')), uScale: pv('scale'), uOct: pv('oct'), uWarp: pv('warp'), uEvolve: pv('evolve'), uMix: pv('mix') }),
  face: { inp: 'a picture to sit under the field', out: 'the noise field', reset: 'Reset the weather — mid cloud, no warp, a slow drift.' },
  hint: 'Noise — fbm, ridged and cellular fields; the universal texture and displacement source',
};
