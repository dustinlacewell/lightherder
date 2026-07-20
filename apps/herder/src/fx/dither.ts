import type { FxDef } from './def';
import { f2, fint, fpx, sel } from '../patch/fmt';
import { COMMON } from './glsl';

/* ordered quantization — tone carried by pattern */
const DITHER_MODES = ['BAYER', 'NOISE'];

export const dither: FxDef = {
  label: 'Dither',
  frag: /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 frag;
uniform sampler2D uSrc;
uniform vec2  uRes;
uniform float uBits;  /* quantization steps per channel */
uniform float uSize;  /* pattern cell size, px */
uniform float uMode;  /* 0 bayer, 1 noise */
uniform float uMono;
${COMMON}
void main(){
  const float B[16] = float[](
    0.0/16.0,  8.0/16.0,  2.0/16.0, 10.0/16.0,
   12.0/16.0,  4.0/16.0, 14.0/16.0,  6.0/16.0,
    3.0/16.0, 11.0/16.0,  1.0/16.0,  9.0/16.0,
   15.0/16.0,  7.0/16.0, 13.0/16.0,  5.0/16.0);
  vec2 px = floor(vUv * uRes / max(uSize, 1.0));
  float th;
  if (uMode < 0.5) {
    ivec2 b = ivec2(mod(px, 4.0));
    th = B[b.y * 4 + b.x];
  } else th = hash(px);
  vec3 c = texture(uSrc, vUv).rgb;
  c = mix(c, vec3(luma(c)), uMono);
  float L = max(uBits, 1.0);
  frag = vec4(clamp(floor(c * L + th) / L, 0.0, 1.0), 1.0);
}`,
  params: {
    bits: { label: 'Steps', min: 1, max: 6, def: 1, step: 1, fmt: fint, desc: 'Quantization steps per channel. 1 = pure 1-bit — every tone carried by pattern alone.' },
    size: { label: 'Size', min: 1, max: 8, def: 1, step: 1, fmt: fpx, desc: 'Pattern cell size. 1 = fine newsprint; up = chunky retro blocks.' },
    mode: { label: 'Mode', min: 0, max: 1, def: 0, step: 1, fmt: sel(DITHER_MODES), desc: 'BAYER is the ordered crosshatch of early screens; NOISE is patternless static.' },
    mono: { label: 'Mono', min: 0, max: 1, def: 0, fmt: f2, desc: 'Collapse toward grayscale before quantizing — 1 is the full one-green-screen look.' },
  },
  uniforms: pv => ({ uBits: pv('bits'), uSize: pv('size'), uMode: Math.round(pv('mode')), uMono: pv('mono') }),
  face: { inp: 'the picture to quantize', out: 'the dithered picture', reset: 'Reset to 1-bit Bayer at a single pixel — the pure newsprint wire.' },
  hint: 'Dither — ordered 1-bit-and-up quantization; the GameBoy/newsprint texture, live',
};
