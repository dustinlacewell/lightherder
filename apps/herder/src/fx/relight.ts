import type { FxDef } from './def';
import { f2, fdeg } from '../patch/fmt';
import { COMMON } from './glsl';

/* the luma field as terrain, one movable light */
export const relight: FxDef = {
  label: 'Relight',
  frag: /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 frag;
uniform sampler2D uSrc;
uniform vec2  uRes;
uniform float uAzim;   /* light direction around the frame */
uniform float uElev;   /* light height above the surface */
uniform float uDepth;  /* heightfield exaggeration */
uniform float uSpec;
uniform float uMix;
${COMMON}
void main(){
  /* the luma field as terrain: gradient normals, one movable light —
     rake it low and every texture turns sculptural */
  vec2 s = 1.0 / uRes;
  vec3 src = texture(uSrc, vUv).rgb;
  float hL = luma(texture(uSrc, vUv - vec2(s.x, 0.0)).rgb);
  float hR = luma(texture(uSrc, vUv + vec2(s.x, 0.0)).rgb);
  float hD = luma(texture(uSrc, vUv - vec2(0.0, s.y)).rgb);
  float hU = luma(texture(uSrc, vUv + vec2(0.0, s.y)).rgb);
  vec3 nrm = normalize(vec3((hL - hR) * uDepth, (hD - hU) * uDepth, 1.0));
  vec3 L = normalize(vec3(cos(uAzim) * cos(uElev), sin(uAzim) * cos(uElev), sin(uElev)));
  float diff = max(dot(nrm, L), 0.0);
  float spec = pow(max(dot(nrm, normalize(L + vec3(0.0, 0.0, 1.0))), 0.0), 24.0) * uSpec;
  vec3 lit = src * (0.25 + 0.75 * diff) + spec;
  frag = vec4(clamp(mix(src, lit, uMix), 0.0, 1.0), 1.0);
}`,
  params: {
    azim:  { label: 'Azimuth', min: -Math.PI, max: Math.PI, def: 0.8, fmt: fdeg, periodic: true, desc: 'Where the light stands around the frame. Orbit it with a dial and every texture rotates its relief.' },
    elev:  { label: 'Elev', min: 0.1, max: 1.5, def: 0.9, fmt: fdeg, desc: 'Light height. Low rakes long shadows out of nothing; high flattens back toward the plain picture.' },
    depth: { label: 'Depth', min: 0, max: 8, def: 2, fmt: f2, desc: 'How much terrain the luma field is read as. 0 = flat; high turns grain into mountains.' },
    spec:  { label: 'Spec', min: 0, max: 1, def: 0.3, fmt: f2, desc: 'Glossy highlight on the slopes — wet plastic at 1, matte clay at 0.' },
    mix:   { label: 'Mix', min: 0, max: 1, def: 1, fmt: f2, desc: 'Lit against the source picture.' },
  },
  uniforms: pv => ({ uAzim: pv('azim'), uElev: pv('elev'), uDepth: pv('depth'), uSpec: pv('spec'), uMix: pv('mix') }),
  face: { inp: 'the terrain to light', out: 'the sculpted relief', reset: 'Reset the lamp — morning angle, modest depth, a little gloss.' },
  hint: 'Relight — reads the picture as terrain and rakes a movable light across it',
};
