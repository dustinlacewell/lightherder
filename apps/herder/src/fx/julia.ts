import type { FxDef } from './def';
import { f2, f3, fdeg, fint, fmul } from '../patch/fmt';
import { COMMON } from './glsl';

/* escape-time fractal with the constant on knobs */
export const julia: FxDef = {
  label: 'Julia',
  frag: /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 frag;
uniform sampler2D uSrc;
uniform vec2  uRes;
uniform float uJx;    /* the Julia constant — the shape lives here */
uniform float uJy;
uniform float uZoom;
uniform float uIter;
uniform float uShift; /* palette rotation */
uniform float uMix;
${COMMON}
void main(){
  float aspect = uRes.x / uRes.y;
  vec2 z = (vUv - 0.5) * vec2(aspect, 1.0) * 3.0 / uZoom;
  vec2 c = vec2(uJx, uJy);
  const int MAXIT = 96;
  int mi = int(uIter);
  float esc = -1.0;
  for (int k = 0; k < MAXIT; k++){
    if (k >= mi) break;
    z = vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + c;
    if (dot(z, z) > 4.0) { esc = float(k); break; }
  }
  vec3 col = esc < 0.0 ? vec3(0.0)
    : hueRotate(vec3(1.0, 0.25, 0.1), esc * 0.35 + uShift) * (0.3 + 0.7 * sqrt(esc / max(uIter, 1.0)));
  vec3 src = texture(uSrc, vUv).rgb;
  frag = vec4(mix(src, col, uMix), 1.0);
}`,
  params: {
    jx:    { label: 'C Re', min: -1, max: 1, def: -0.4, fmt: f3, desc: 'Real part of the Julia constant — the fractal’s whole shape lives on these two knobs. Sweep with an XY pad.' },
    jy:    { label: 'C Im', min: -1, max: 1, def: 0.6, fmt: f3, desc: 'Imaginary part of the Julia constant.' },
    zoom:  { label: 'Zoom', min: 0.25, max: 4, def: 1, fmt: fmul, scale: 'log', desc: 'Dive toward the boundary — the detail never runs out (until the iterations do).' },
    iter:  { label: 'Iter', min: 8, max: 96, def: 48, step: 1, fmt: fint, desc: 'Escape-time depth — sharpness of the boundary filigree, at GPU cost.' },
    shift: { label: 'Shift', min: 0, max: 2 * Math.PI, def: 0, fmt: fdeg, periodic: true, desc: 'Rotates the escape palette — ride it for the lava-lamp cycle.' },
    mix:   { label: 'Mix', min: 0, max: 1, def: 1, fmt: f2, desc: 'Fractal against the input.' },
  },
  uniforms: pv => ({ uJx: pv('jx'), uJy: pv('jy'), uZoom: pv('zoom'), uIter: pv('iter'), uShift: pv('shift'), uMix: pv('mix') }),
  face: { inp: 'a picture to sit behind the set', out: 'the Julia set', reset: 'Reset the constant to the classic seahorse — mid zoom, mid depth.' },
  hint: 'Julia — an escape-time fractal whose whole shape rides two knobs; wire an XY pad and morph it',
};
