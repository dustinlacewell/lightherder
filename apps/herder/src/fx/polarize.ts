import type { FxDef } from './def';
import { f2, fdeg } from '../patch/fmt';
import { COMMON, NOISE } from './glsl';

/* faked birefringence: stress-field interference colors */
export const polarize: FxDef = {
  label: 'Polarize',
  frag: /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 frag;
uniform sampler2D uSrc;
uniform vec2  uRes;
uniform float uTime;
uniform float uRetard;  /* retardance — orders of interference color */
uniform float uAxis;
uniform float uStress;  /* stress-field scale */
uniform float uFlow;    /* field drift rate */
${COMMON}
${NOISE}
void main(){
  /* birefringence faked: picture luma + a drifting stress field set
     the phase; three offset sinusoids are the interference colors —
     plastic between crossed polarizers */
  vec3 src = texture(uSrc, vUv).rgb;
  float l = luma(src);
  vec2 p = vUv * uStress + vec2(cos(uAxis), sin(uAxis)) * (uTime * uFlow);
  float ph = (fbmn(p, 4.0) + l) * uRetard * 6.2831853;
  vec3 irid = 0.5 + 0.5 * vec3(sin(ph), sin(ph + 2.094), sin(ph + 4.188));
  vec3 lit = src * 0.35 + irid * (0.25 + 0.75 * l);
  frag = vec4(mix(src, lit, clamp(uRetard, 0.0, 1.0)), 1.0);
}`,
  params: {
    retard: { label: 'Retard', min: 0, max: 6, def: 0, fmt: f2, desc: 'Retardance — how many orders of interference color the material walks through. 0 = a straight wire; up and the picture films over with oil-slick iridescence.' },
    axis:   { label: 'Axis', min: -Math.PI, max: Math.PI, def: 0, fmt: fdeg, periodic: true, desc: 'The polarizer angle — which way the stress field drifts.' },
    stress: { label: 'Stress', min: 0.5, max: 8, def: 2, fmt: f2, desc: 'Scale of the stress field the fringes follow. Fine = crumpled cellophane; broad = slow tempered-glass sweeps.' },
    flow:   { label: 'Flow', min: -3, max: 3, def: 0.3, fmt: f2, desc: 'Drift rate of the field along the axis. 0 freezes the fringes onto the picture.' },
  },
  uniforms: pv => ({ uRetard: pv('retard'), uAxis: pv('axis'), uStress: pv('stress'), uFlow: pv('flow') }),
  face: { inp: 'the picture to stress', out: 'the iridescent picture', reset: 'Reset to clear glass — no retardance, the fringes gone.' },
  hint: 'Polarize — plastic between crossed polarizers: oil-slick interference fringes ride the picture',
};
