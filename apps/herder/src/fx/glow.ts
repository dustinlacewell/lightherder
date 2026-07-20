import type { FxDef } from './def';
import { f2, fpx } from '../patch/fmt';

/* threshold bloom with film halation */
export const glow: FxDef = {
  label: 'Glow',
  frag: /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 frag;
uniform sampler2D uSrc;
uniform vec2  uRes;
uniform float uThresh;
uniform float uRadius;
uniform float uHal;    /* halation — the bloom reddens like film */
uniform float uAmt;
void main(){
  const vec2 TAPS[12] = vec2[](
    vec2( 0.326, 0.406), vec2(-0.840,-0.074), vec2(-0.696, 0.457),
    vec2(-0.203, 0.621), vec2( 0.962,-0.195), vec2( 0.473,-0.480),
    vec2( 0.519, 0.767), vec2( 0.185,-0.893), vec2( 0.507, 0.064),
    vec2( 0.896, 0.412), vec2(-0.322,-0.933), vec2(-0.792,-0.598));
  vec3 c = texture(uSrc, vUv).rgb;
  vec3 acc = vec3(0.0);
  for (int i = 0; i < 12; i++){
    vec3 s = texture(uSrc, vUv + TAPS[i] * uRadius / uRes).rgb;
    acc += max(s - uThresh, 0.0);
  }
  acc /= 12.0 * max(1.0 - uThresh, 1e-3);
  vec3 halo = acc * vec3(1.0, 1.0 - 0.5 * uHal, 1.0 - uHal);
  frag = vec4(clamp(c + halo * uAmt, 0.0, 1.0), 1.0);
}`,
  params: {
    thresh:   { label: 'Thresh', min: 0, max: 1, def: 0.7, fmt: f2, desc: 'What counts as a highlight — only light past this blooms. Drop it and everything glows.' },
    radius:   { label: 'Radius', min: 1, max: 24, def: 8, fmt: fpx, desc: 'How far the bloom spreads. In a feedback loop this compounds: a whisper becomes a halo becomes the whole frame.' },
    halation: { label: 'Halation', min: 0, max: 1, def: 0.2, fmt: f2, desc: 'The film look: bloom reddens as it spreads, like light scattering in emulsion. 0 = clean digital glow.' },
    amt:      { label: 'Amt', min: 0, max: 2, def: 0.8, fmt: f2, desc: 'Bloom gain on the add-back. Past 1 a loop will run away with it — sometimes the point.' },
  },
  uniforms: pv => ({ uThresh: pv('thresh'), uRadius: pv('radius'), uHal: pv('halation'), uAmt: pv('amt') }),
  face: { inp: 'the picture to bloom', out: 'the haloed picture', reset: 'Reset the lamp — highlights only, a modest halo, no halation.' },
  hint: 'Glow — threshold bloom with film halation; the feedback loop energizer',
};
