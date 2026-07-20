import type { FxDef } from './def';
import { fsig } from '../patch/fmt';

/* a 3×3 kernel with every tap on a knob */
const kdesc = (pos: string) => `The ${pos} tap of the 3×3 kernel. Center 1, rest 0 = a straight wire; every cell is live — morph between blur, sharpen, emboss and edge by hand or by wire.`;

export const convolve: FxDef = {
  label: 'Convolve',
  frag: /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 frag;
uniform sampler2D uSrc;
uniform vec2  uRes;
uniform float uK0; uniform float uK1; uniform float uK2;
uniform float uK3; uniform float uK4; uniform float uK5;
uniform float uK6; uniform float uK7; uniform float uK8;
uniform float uBias;
void main(){
  vec2 s = 1.0 / uRes;
  vec3 acc =
    texture(uSrc, vUv + vec2(-s.x,  s.y)).rgb * uK0 + texture(uSrc, vUv + vec2(0.0,  s.y)).rgb * uK1 + texture(uSrc, vUv + vec2(s.x,  s.y)).rgb * uK2 +
    texture(uSrc, vUv + vec2(-s.x,  0.0)).rgb * uK3 + texture(uSrc, vUv).rgb                   * uK4 + texture(uSrc, vUv + vec2(s.x,  0.0)).rgb * uK5 +
    texture(uSrc, vUv + vec2(-s.x, -s.y)).rgb * uK6 + texture(uSrc, vUv + vec2(0.0, -s.y)).rgb * uK7 + texture(uSrc, vUv + vec2(s.x, -s.y)).rgb * uK8;
  frag = vec4(clamp(acc + uBias, 0.0, 1.0), 1.0);
}`,
  params: {
    k0: { label: 'TL', min: -2, max: 2, def: 0, fmt: fsig, desc: kdesc('top-left') },
    k1: { label: 'T',  min: -2, max: 2, def: 0, fmt: fsig, desc: kdesc('top') },
    k2: { label: 'TR', min: -2, max: 2, def: 0, fmt: fsig, desc: kdesc('top-right') },
    k3: { label: 'L',  min: -2, max: 2, def: 0, fmt: fsig, desc: kdesc('left') },
    k4: { label: 'C',  min: -2, max: 2, def: 1, fmt: fsig, desc: kdesc('center') },
    k5: { label: 'R',  min: -2, max: 2, def: 0, fmt: fsig, desc: kdesc('right') },
    k6: { label: 'BL', min: -2, max: 2, def: 0, fmt: fsig, desc: kdesc('bottom-left') },
    k7: { label: 'B',  min: -2, max: 2, def: 0, fmt: fsig, desc: kdesc('bottom') },
    k8: { label: 'BR', min: -2, max: 2, def: 0, fmt: fsig, desc: kdesc('bottom-right') },
    bias: { label: 'Bias', min: -0.5, max: 0.5, def: 0, fmt: fsig, desc: 'Flat offset added after the kernel — lifts an edge-extract out of black, or sinks a heavy kernel back down.' },
  },
  uniforms: pv => ({
    uK0: pv('k0'), uK1: pv('k1'), uK2: pv('k2'),
    uK3: pv('k3'), uK4: pv('k4'), uK5: pv('k5'),
    uK6: pv('k6'), uK7: pv('k7'), uK8: pv('k8'),
    uBias: pv('bias'),
  }),
  face: { inp: 'the picture to filter', out: 'the filtered picture', reset: 'Reset to the identity kernel — center 1, everything else 0.' },
  hint: 'Convolve — a 3×3 kernel, every tap a knob: blur, sharpen, emboss and edge, morphed live',
};
