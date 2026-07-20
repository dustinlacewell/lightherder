import type { FxDef } from './def';
import { f2, fdeg, fmul } from '../patch/fmt';

/* log-polar self-similarity — the Escher print-gallery fold */
export const droste: FxDef = {
  label: 'Droste',
  frag: /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 frag;
uniform sampler2D uSrc;
uniform vec2  uRes;
uniform float uTime;
uniform float uRatio;  /* self-similar scale step */
uniform float uTwist;  /* spiral coupling per level */
uniform float uSpeed;  /* zoom crawl */
void main(){
  /* log-polar self-similarity: the picture repeats inward every
     uRatio of scale, sheared into a spiral by the twist — the Escher
     print-gallery fold, crawling forever at uSpeed */
  float aspect = uRes.x / uRes.y;
  vec2 p = (vUv - 0.5) * vec2(aspect, 1.0);
  float lr = log(max(uRatio, 1.05));
  vec2 z = vec2(log(max(length(p), 1e-5)), atan(p.y, p.x));
  z.y += (z.x + uTime * uSpeed * lr) * (uTwist / lr) * 0.15915494;
  z.x = mod(z.x + uTime * uSpeed * lr, lr);
  float rr = exp(z.x + log(0.15));
  vec2 q = rr * vec2(cos(z.y), sin(z.y));
  vec2 suv = q / vec2(aspect, 1.0) + 0.5;
  frag = vec4(texture(uSrc, clamp(suv, 0.0, 1.0)).rgb, 1.0);
}`,
  params: {
    ratio: { label: 'Ratio', min: 1.2, max: 4, def: 2, fmt: fmul, scale: 'log', desc: 'The self-similar step — how much smaller each ring of the picture repeats inside itself.' },
    twist: { label: 'Twist', min: -Math.PI, max: Math.PI, def: 0, fmt: fdeg, periodic: true, desc: 'Shears the repetition into a spiral — the Escher print-gallery fold. 0 = straight concentric rings.' },
    speed: { label: 'Speed', min: -1, max: 1, def: 0.15, fmt: f2, desc: 'The infinite crawl inward (or outward, negative). 0 holds the recursion still.' },
  },
  uniforms: pv => ({ uRatio: pv('ratio'), uTwist: pv('twist'), uSpeed: pv('speed') }),
  face: { inp: 'the picture to nest', out: 'the picture inside itself', reset: 'Reset the spiral — a doubling step, no twist, a gentle crawl.' },
  hint: 'Droste — the picture repeats inside itself forever, sheared into an Escher spiral',
};
