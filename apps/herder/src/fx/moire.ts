import type { FxDef } from './def';
import { f2, fdeg, sel } from '../patch/fmt';

/* two gratings multiplied — beat frequencies from nothing */
const MOIRE_SHAPES = ['LINES', 'RINGS'];

export const moire: FxDef = {
  label: 'Moiré',
  frag: /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 frag;
uniform sampler2D uSrc;
uniform vec2  uRes;
uniform float uFreq;
uniform float uDetune;  /* second grating's frequency offset — the beat */
uniform float uAngA;
uniform float uAngB;
uniform float uShape;   /* 0 lines, 1 rings */
uniform float uMix;
float grating(vec2 p, float f, float ang, float shape){
  float x = shape < 0.5 ? dot(p, vec2(cos(ang), sin(ang)))
                        : length(p - 0.35 * vec2(cos(ang), sin(ang)));
  return 0.5 + 0.5 * sin(x * f * 6.2831853);
}
void main(){
  /* two gratings multiplied: the picture is their beat frequency —
     near-equal freqs make vast slow fringes from nothing */
  float aspect = uRes.x / uRes.y;
  vec2 p = (vUv - 0.5) * vec2(aspect, 1.0);
  float v = grating(p, uFreq, uAngA, uShape) * grating(p, uFreq + uDetune, uAngB, uShape);
  vec3 src = texture(uSrc, vUv).rgb;
  frag = vec4(mix(src, vec3(v), uMix), 1.0);
}`,
  params: {
    freq:   { label: 'Freq', min: 2, max: 120, def: 40, fmt: f2, desc: 'Line frequency of the first grating.' },
    detune: { label: 'Detune', min: -4, max: 4, def: 0.5, fmt: f2, desc: 'The second grating’s offset from the first — the beat. Near 0 the fringes go vast and slow; this is the money knob.' },
    anga:   { label: 'Angle A', min: -Math.PI, max: Math.PI, def: 0, fmt: fdeg, periodic: true, desc: 'First grating’s orientation.' },
    angb:   { label: 'Angle B', min: -Math.PI, max: Math.PI, def: 0.09, fmt: fdeg, periodic: true, desc: 'Second grating’s orientation — a hair off Angle A makes the classic op-art shimmer.' },
    shape:  { label: 'Shape', min: 0, max: 1, def: 0, step: 1, fmt: sel(MOIRE_SHAPES), desc: 'LINES beat like fabric; RINGS beat like ripples from two stones.' },
    mix:    { label: 'Mix', min: 0, max: 1, def: 1, fmt: f2, desc: 'Pattern against the input.' },
  },
  uniforms: pv => ({ uFreq: pv('freq'), uDetune: pv('detune'), uAngA: pv('anga'), uAngB: pv('angb'), uShape: Math.round(pv('shape')), uMix: pv('mix') }),
  face: { inp: 'a picture to sit under the beat', out: 'the interference pattern', reset: 'Reset the gratings — a gentle detune, a hair of angle.' },
  hint: 'Moiré — two gratings beat against each other; op-art fringes from almost nothing',
};
