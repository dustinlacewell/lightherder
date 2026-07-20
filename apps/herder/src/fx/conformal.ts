import type { FxDef } from './def';
import { fmul, fsig, sel } from '../patch/fmt';

/* complex-plane remaps: z², z³, 1/z, Möbius */
const CONFORMAL_MAPS = ['Z²+C', 'Z³+C', '1/Z+C', 'MÖBIUS'];

export const conformal: FxDef = {
  label: 'Conformal',
  frag: /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 frag;
uniform sampler2D uSrc;
uniform vec2  uRes;
uniform float uMap;   /* 0 z^2+c, 1 z^3+c, 2 1/z+c, 3 moebius */
uniform float uRe;
uniform float uIm;
uniform float uZoom;
vec2 cmul(vec2 a, vec2 b){ return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x); }
vec2 cdiv(vec2 a, vec2 b){ float d = max(dot(b, b), 1e-6); return vec2(a.x * b.x + a.y * b.y, a.y * b.x - a.x * b.y) / d; }
float mtile(float t){ return abs(fract(t * 0.5) * 2.0 - 1.0); }
void main(){
  float aspect = uRes.x / uRes.y;
  vec2 p = (vUv - 0.5) * vec2(aspect, 1.0) * 2.0 / uZoom;
  vec2 c = vec2(uRe, uIm);
  vec2 w;
  if (uMap < 0.5)      w = cmul(p, p) + c;
  else if (uMap < 1.5) w = cmul(cmul(p, p), p) + c;
  else if (uMap < 2.5) w = cdiv(vec2(0.3, 0.0), p) + c;
  else                 w = cdiv(p + c, vec2(1.0, 0.0) + cmul(vec2(c.x, -c.y), p));
  vec2 suv = w * 0.5 / vec2(aspect, 1.0) + 0.5;
  /* mirror-tile out-of-range samples so the plane fills seamlessly */
  frag = vec4(texture(uSrc, vec2(mtile(suv.x), mtile(suv.y))).rgb, 1.0);
}`,
  params: {
    map:  { label: 'Map', min: 0, max: 3, def: 0, step: 1, fmt: sel(CONFORMAL_MAPS), desc: 'Which complex map bends the plane: squaring doubles the world around the origin, 1/Z turns it inside out, MÖBIUS slides the point at infinity around by the C knobs.' },
    re:   { label: 'Re', min: -1, max: 1, def: 0, fmt: fsig, desc: 'Real part of the constant C — drag the map’s fixed structure across the plane.' },
    im:   { label: 'Im', min: -1, max: 1, def: 0, fmt: fsig, desc: 'Imaginary part of C.' },
    zoom: { label: 'Zoom', min: 0.25, max: 4, def: 1, fmt: fmul, scale: 'log', desc: 'Scale of the plane fed to the map. ×1 = native; the maps behave wildly differently up close and far out.' },
  },
  uniforms: pv => ({ uMap: Math.round(pv('map')), uRe: pv('re'), uIm: pv('im'), uZoom: pv('zoom') }),
  face: { inp: 'the plane to bend', out: 'the bent plane', reset: 'Reset to Z²+C at the origin, native zoom.' },
  hint: 'Conformal — complex-plane warps camera glass can’t make: squarings, inversions, Möbius slides',
};
