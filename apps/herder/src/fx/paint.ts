import type { FxDef } from './def';
import { f2, fint } from '../patch/fmt';

/* Kuwahara: the least-varied quadrant wins — painterly flattening */
export const paint: FxDef = {
  label: 'Paint',
  frag: /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 frag;
uniform sampler2D uSrc;
uniform vec2  uRes;
uniform float uRadius;
uniform float uSharp;  /* how hard the flattest quadrant wins */
void main(){
  /* Kuwahara: mean of the least-varied quadrant — noise melts into
     brushstrokes, edges survive */
  const int MAXR = 6;
  int r = int(clamp(uRadius, 1.0, 6.0) + 0.5);
  vec2 s = 1.0 / uRes;
  vec3 mean[4]; vec3 sq[4]; float cnt[4];
  for (int q = 0; q < 4; q++){ mean[q] = vec3(0.0); sq[q] = vec3(0.0); cnt[q] = 0.0; }
  for (int dy = -MAXR; dy <= MAXR; dy++){
    for (int dx = -MAXR; dx <= MAXR; dx++){
      if (abs(dx) > r || abs(dy) > r) continue;
      vec3 v = texture(uSrc, vUv + vec2(float(dx), float(dy)) * s).rgb;
      int q = (dx <= 0 ? 0 : 1) + (dy <= 0 ? 0 : 2);
      mean[q] += v; sq[q] += v * v; cnt[q] += 1.0;
    }
  }
  vec3 outc = vec3(0.0);
  float wsum = 0.0;
  for (int q = 0; q < 4; q++){
    vec3 m = mean[q] / cnt[q];
    vec3 va = sq[q] / cnt[q] - m * m;
    float v = va.r + va.g + va.b;
    float w = pow(1.0 / (1.0 + v * 64.0), uSharp);
    outc += m * w; wsum += w;
  }
  frag = vec4(outc / max(wsum, 1e-5), 1.0);
}`,
  params: {
    radius: { label: 'Radius', min: 1, max: 6, def: 3, step: 1, fmt: fint, desc: 'Brush size — the window each stroke averages. Bigger flattens more of the picture into each daub.' },
    sharp:  { label: 'Sharp', min: 1, max: 16, def: 8, fmt: f2, desc: 'How decisively the flattest region wins. High = crisp paint edges; low = soft watercolor pooling.' },
  },
  uniforms: pv => ({ uRadius: pv('radius'), uSharp: pv('sharp') }),
  face: { inp: 'the picture to paint', out: 'the painted picture', reset: 'Reset the brush — a modest daub, decisive edges.' },
  hint: 'Paint — Kuwahara painterly smoothing: noise melts into brushstrokes, edges survive',
};
