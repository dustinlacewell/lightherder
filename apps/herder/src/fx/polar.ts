import type { FxDef } from './def';
import { f2, fdeg, fmul } from '../patch/fmt';

/* cartesian↔polar remap */
const POLAR_MODES = ['UNWRAP', 'PLANET'];

export const polar: FxDef = {
  label: 'Polar',
  frag: /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 frag;

uniform sampler2D uSrc;
uniform vec2  uRes;
uniform float uMode;   /* 0 = UNWRAP, 1 = PLANET */
uniform float uTurns;
uniform float uRad;
uniform float uSpin;

void main(){
  float aspect = uRes.x / uRes.y;
  vec2 s;
  if (uMode < 0.5) {
    /* UNWRAP: read the source by this pixel's angle and radius —
       rings become rows, spokes become columns */
    vec2 p = (vUv - 0.5) * vec2(aspect, 1.0);
    float a = atan(p.y, p.x) + uSpin;
    float r = length(p);
    s = vec2(fract(a / 6.2831853 * uTurns), clamp(r * uRad * 1.4142, 0.0, 1.0));
  } else {
    /* PLANET: rows wrap around the center — the tiny-planet curl */
    float a = vUv.x * 6.2831853 * uTurns + uSpin;
    float r = (1.0 - vUv.y) * 0.5 * uRad;
    s = vec2(0.5) + r * vec2(cos(a) / aspect, sin(a));
  }
  frag = vec4(texture(uSrc, s).rgb, 1.0);
}`,
  params: {
  mode:  { label: 'Mode', min: 0, max: 1, def: 0, step: 1, fmt: v => POLAR_MODES[Math.round(v)] ?? 'UNWRAP', desc: 'UNWRAP reads the source by each pixel’s angle and radius — rings become rows. PLANET is the inverse — rows wrap around the center, the tiny-planet curl.' },
  turns: { label: 'Turns', min: 1, max: 8, def: 1, fmt: f2, desc: 'Angular repetition — how many times the source wraps (or unwraps) per revolution. Non-integer values seam; sometimes that’s the point.' },
  rad:   { label: 'Radius', min: 0.25, max: 4, def: 1.0, fmt: fmul, scale: 'log', desc: 'Radial scale — how fast the sweep reaches out from (or climbs up) the frame. A riding dial multiplies: full throw sweeps ¼× to 4×.' },
  spin:  { label: 'Spin', min: -Math.PI, max: Math.PI, def: 0, fmt: fdeg, periodic: true, desc: 'Angular offset — turn it and the whole remap rotates. A dial here spins the planet.' },
  },
  uniforms: pv => ({ uMode: Math.round(pv('mode')), uTurns: pv('turns'), uRad: pv('rad'), uSpin: pv('spin') }),
  face: { inp: 'the picture to remap', out: 'the remapped picture', reset: 'Reset to UNWRAP at one turn, native radius, no spin.' },
  hint: 'Polar — unwraps rings into rows, or curls rows into a tiny planet; turns, radius and spin on knobs',
};
