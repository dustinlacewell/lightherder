import type { FxDef } from './def';
import { fpx, sel } from '../patch/fmt';

/* morphological erode/dilate with a shaped element */
const MORPH_OPS = ['ERODE', 'DILATE'];
const MORPH_SHAPES = ['DISC', 'BOX', 'CROSS'];

export const morph: FxDef = {
  label: 'Morph',
  frag: /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 frag;
uniform sampler2D uSrc;
uniform vec2  uRes;
uniform float uRadius;
uniform float uOp;     /* 0 erode, 1 dilate */
uniform float uShape;  /* 0 disc, 1 box, 2 cross */
void main(){
  const int MAXR = 6;
  int r = int(clamp(uRadius, 0.0, 6.0) + 0.5);
  if (r == 0) { frag = vec4(texture(uSrc, vUv).rgb, 1.0); return; }
  vec2 s = 1.0 / uRes;
  bool dil = uOp > 0.5;
  vec3 ext = dil ? vec3(0.0) : vec3(1.0);
  for (int dy = -MAXR; dy <= MAXR; dy++){
    for (int dx = -MAXR; dx <= MAXR; dx++){
      if (abs(dx) > r || abs(dy) > r) continue;
      if (uShape < 0.5 && dx * dx + dy * dy > r * r) continue;
      if (uShape > 1.5 && dx != 0 && dy != 0) continue;
      vec3 v = texture(uSrc, vUv + vec2(float(dx), float(dy)) * s).rgb;
      ext = dil ? max(ext, v) : min(ext, v);
    }
  }
  frag = vec4(ext, 1.0);
}`,
  params: {
    radius: { label: 'Radius', min: 0, max: 6, def: 0, fmt: fpx, desc: 'Reach of the structuring element. 0 = a straight wire; each pixel becomes the min (erode) or max (dilate) of its neighborhood.' },
    op:     { label: 'Op', min: 0, max: 1, def: 0, step: 1, fmt: sel(MORPH_OPS), desc: 'ERODE shrinks bright blobs and eats speckle; DILATE grows them and fills gaps.' },
    shape:  { label: 'Shape', min: 0, max: 2, def: 0, step: 1, fmt: sel(MORPH_SHAPES), desc: 'The element’s footprint — DISC grows round, BOX grows square, CROSS grows along the axes.' },
  },
  uniforms: pv => ({ uRadius: pv('radius'), uOp: Math.round(pv('op')), uShape: Math.round(pv('shape')) }),
  face: { inp: 'the blobs to shape', out: 'the reshaped blobs', reset: 'Reset to a straight wire — zero reach.' },
  hint: 'Morph — grow or shrink the bright shapes; blob-sculpting for loops and mattes',
};
