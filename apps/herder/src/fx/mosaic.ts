import type { FxDef } from './def';
import { f2, fpx, sel } from '../patch/fmt';
import { COMMON } from './glsl';

/* cell quantization: square, hex, or triangle tiles */
const MOSAIC_SHAPES = ['SQUARE', 'HEX', 'TRI'];

export const mosaic: FxDef = {
  label: 'Mosaic',
  frag: /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 frag;
uniform sampler2D uSrc;
uniform vec2  uRes;
uniform float uSize;
uniform float uShape;  /* 0 square, 1 hex, 2 triangle */
uniform float uJitter;
uniform float uGap;
${COMMON}
void main(){
  vec2 px = vUv * uRes;
  vec2 center; float dEdge;
  if (uShape < 0.5) {
    vec2 cell = floor(px / uSize);
    center = (cell + 0.5) * uSize;
    vec2 f = fract(px / uSize);
    dEdge = 0.5 - max(abs(f.x - 0.5), abs(f.y - 0.5));
  } else if (uShape < 1.5) {
    vec2 sHex = vec2(1.0, 1.7320508) * uSize;
    vec4 hC = floor(vec4(px, px - vec2(0.5, 1.0) * uSize) / sHex.xyxy) + 0.5;
    vec4 h = vec4(px - hC.xy * sHex, px - (hC.zw + 0.5) * sHex);
    vec2 off = dot(h.xy, h.xy) < dot(h.zw, h.zw) ? h.xy : h.zw;
    center = px - off;
    dEdge = 0.5 - length(off) / uSize;
  } else {
    vec2 cell = floor(px / uSize);
    vec2 f = fract(px / uSize);
    center = (cell + (f.x + f.y < 1.0 ? vec2(0.333) : vec2(0.667))) * uSize;
    dEdge = 0.5 - max(abs(f.x - 0.5), abs(f.y - 0.5));
  }
  center += (hash3(floor(center)).xy - 0.5) * uSize * uJitter;
  vec3 c = texture(uSrc, clamp(center / uRes, 0.0, 1.0)).rgb;
  c *= smoothstep(uGap * 0.35 - 0.03, uGap * 0.35 + 0.03, dEdge + step(uGap, 0.001));
  frag = vec4(c, 1.0);
}`,
  params: {
    size:   { label: 'Size', min: 2, max: 64, def: 12, fmt: fpx, desc: 'Cell size. The pixelation knob — ride it with a dial for the classic privacy-blur reveal.' },
    shape:  { label: 'Shape', min: 0, max: 2, def: 0, step: 1, fmt: sel(MOSAIC_SHAPES), desc: 'Cell geometry: SQUARE pixels, HEX honeycomb, or TRI facets.' },
    jitter: { label: 'Jitter', min: 0, max: 1, def: 0, fmt: f2, desc: 'Scatters each cell’s sample point — the tiles stop agreeing with their contents, glass gone bumpy.' },
    gap:    { label: 'Gap', min: 0, max: 1, def: 0, fmt: f2, desc: 'Grout between the tiles — dark seams that read as mosaic rather than pixelation.' },
  },
  uniforms: pv => ({ uSize: pv('size'), uShape: Math.round(pv('shape')), uJitter: pv('jitter'), uGap: pv('gap') }),
  face: { inp: 'the picture to tile', out: 'the tiled picture', reset: 'Reset the tiles — modest squares, no jitter, no grout.' },
  hint: 'Mosaic — pixelate through stained-glass: square, hex or triangle cells with jitter and grout',
};
