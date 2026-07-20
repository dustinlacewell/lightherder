import type { FxDef } from './def';
import { f2, f4, fint } from '../patch/fmt';
import { COMMON } from './glsl';

/* self-warp: the picture displaced by its own gradient */
export const turbwarp: FxDef = {
  label: 'Turbwarp',
  frag: /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 frag;
uniform sampler2D uSrc;
uniform vec2  uRes;
uniform float uAmt;
uniform float uIters;
uniform float uCurl;  /* 0 = flow down the gradient, 1 = swirl along it */
${COMMON}
void main(){
  /* self-warp: the picture displaced by its own luma gradient,
     re-applied — images eat their own structure */
  vec2 p = vUv;
  vec2 s = 1.5 / uRes;
  const int MAXI = 4;
  int it = int(uIters + 0.5);
  for (int i = 0; i < MAXI; i++){
    if (i >= it) break;
    float gx = luma(texture(uSrc, p + vec2(s.x, 0.0)).rgb) - luma(texture(uSrc, p - vec2(s.x, 0.0)).rgb);
    float gy = luma(texture(uSrc, p + vec2(0.0, s.y)).rgb) - luma(texture(uSrc, p - vec2(0.0, s.y)).rgb);
    vec2 g = vec2(gx, gy);
    p += mix(g, vec2(-g.y, g.x), uCurl) * uAmt;
  }
  frag = vec4(texture(uSrc, p).rgb, 1.0);
}`,
  params: {
    amt:   { label: 'Amt', min: 0, max: 0.05, def: 0, fmt: f4, desc: 'Warp per pass — how far each pixel slides along the picture’s own gradient. 0 = a straight wire; the melt knob.' },
    iters: { label: 'Iters', min: 1, max: 4, def: 2, step: 1, fmt: fint, desc: 'How many times the warp re-applies within the pass — each one compounds the melt.' },
    curl:  { label: 'Curl', min: 0, max: 1, def: 0.5, fmt: f2, desc: '0 flows downhill off bright edges; 1 swirls along them. The difference between dripping and marbling.' },
  },
  uniforms: pv => ({ uAmt: pv('amt'), uIters: pv('iters'), uCurl: pv('curl') }),
  face: { inp: 'the picture to melt', out: 'the self-eaten picture', reset: 'Reset to a straight wire — no melt.' },
  hint: 'Turbwarp — the picture eats its own structure: gradient-driven melt and marbling',
};
