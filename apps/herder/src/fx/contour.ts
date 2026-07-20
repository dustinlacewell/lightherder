import type { FxDef } from './def';
import { f2 } from '../patch/fmt';
import { COMMON } from './glsl';

/* equal-luma level lines, like a topo map */
export const contour: FxDef = {
  label: 'Contour',
  frag: /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 frag;

uniform sampler2D uSrc;
uniform float uBands;
uniform float uWidth;
uniform float uShift;
uniform float uFill;
${COMMON}
void main(){
  vec3 src = texture(uSrc, vUv).rgb;
  float l = luma(src);
  float t = l * uBands + uShift;
  float f = fract(t);
  float d = min(f, 1.0 - f);   /* distance to the nearest level line */
  float line = 1.0 - smoothstep(uWidth * 0.5, uWidth * 0.5 + 0.02, d);
  /* the terraces between the lines: the source dimmed by its level */
  vec3 banded = src * clamp((floor(t) + 0.5) / uBands, 0.0, 1.2);
  frag = vec4(mix(banded * uFill, vec3(1.0), line), 1.0);
}`,
  params: {
  bands: { label: 'Bands', min: 2, max: 24, def: 8, fmt: f2, desc: 'Contour density — how many level lines span black to white. High counts read as engraving.' },
  width: { label: 'Width', min: 0, max: 1, def: 0.15, fmt: f2, desc: 'Line weight, as a fraction of the gap between levels. Wide lines merge into bands of ink.' },
  shift: { label: 'Shift', min: 0, max: 1, def: 0, fmt: f2, periodic: true, desc: 'Slides the whole contour set through the luma field — a dial here makes the lines flow across the picture like a scanning elevation.' },
  fill:  { label: 'Fill', min: 0, max: 1, def: 0.35, fmt: f2, desc: 'How much of the terraced picture shows between the lines. 0 = pure ink on black; 1 = full hypsometric tint.' },
  },
  uniforms: pv => ({ uBands: pv('bands'), uWidth: pv('width'), uShift: pv('shift'), uFill: pv('fill') }),
  face: { inp: 'the luma field to trace', out: 'the level lines', reset: 'Reset the map — eight levels, fine lines, faint terraces.' },
  hint: 'Contour — traces equal-luma level lines like a topo map; slide the set and the lines flow',
};
