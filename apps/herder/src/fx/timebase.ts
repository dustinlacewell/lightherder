import type { FxDef } from './def';
import { f2, f3 } from '../patch/fmt';
import { COMMON } from './glsl';

/* time-base corrector failure: per-scanline horizontal error */
export const timebase: FxDef = {
  label: 'Timebase',
  frag: /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 frag;
uniform sampler2D uSrc;
uniform vec2  uRes;
uniform float uTime;
uniform float uAmt;    /* max scanline throw, fraction of width */
uniform float uDecay;  /* how fast the jitter settles below the top */
uniform float uHz;     /* how often the error re-rolls */
uniform float uBand;   /* head-switch noise band height at the bottom */
${COMMON}
void main(){
  /* time-base corrector failure: each scanline lands with its own
     horizontal error, worst at the top of the field, re-rolled uHz
     times a second; the head-switch tear lives at the bottom */
  float line = floor(vUv.y * uRes.y);
  float tq = floor(uTime * max(uHz, 0.001));
  float n = hash(vec2(line * 0.013, tq)) * 2.0 - 1.0;
  float off = uAmt * n * exp(-(1.0 - vUv.y) * uDecay);
  float band = step(vUv.y, uBand);
  off += band * (hash(vec2(line, uTime)) - 0.5) * 0.15;
  vec3 c = texture(uSrc, vec2(vUv.x + off, vUv.y)).rgb;
  c = mix(c, vec3(hash(vUv * uRes + fract(uTime) * 91.0)), band * 0.3);
  frag = vec4(c, 1.0);
}`,
  params: {
    amt:   { label: 'Amt', min: 0, max: 0.08, def: 0, fmt: f3, desc: 'Max scanline throw, as a fraction of the width. 0 = a locked TBC; up and every line lands with its own horizontal error.' },
    decay: { label: 'Decay', min: 0, max: 8, def: 3, fmt: f2, desc: 'How fast the jitter settles below the top of the field — high and only the first lines wave; 0 and the whole frame swims.' },
    hz:    { label: 'Rate', min: 0, max: 30, def: 8, fmt: f2, desc: 'How many times a second the error re-rolls. Low = slow drunken sway; high = nervous shiver.' },
    band:  { label: 'Band', min: 0, max: 0.2, def: 0.05, fmt: f3, desc: 'The head-switch tear at the bottom of the picture — its height. The torn noise every VCR hid under the mask.' },
  },
  uniforms: pv => ({ uAmt: pv('amt'), uDecay: pv('decay'), uHz: pv('hz'), uBand: pv('band') }),
  face: { inp: 'the tape to mistrack', out: 'the unstable playback', reset: 'Reset to a locked TBC — no throw, gentle decay, the band tucked away.' },
  hint: 'Timebase — VCR tracking instability: scanlines land with their own error, worst at the top; the head-switch tear at the bottom',
};
