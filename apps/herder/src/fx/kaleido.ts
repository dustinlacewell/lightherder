import type { FxDef } from './def';
import { f2, fdeg, fint, fmul } from '../patch/fmt';

/* the wedge-fold mirror */
export const kaleido: FxDef = {
  label: 'Kaleido',
  frag: /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 frag;

uniform sampler2D uSrc;
uniform vec2  uRes;
uniform float uSlices;  /* mirror wedges; 1 = no fold      */
uniform float uAngle;   /* wedge rotation                  */
uniform float uZoom;    /* radial reach                    */
uniform vec2  uCenter;  /* the scope's eye, off mid-frame  */

void main(){
  float aspect = uRes.x / uRes.y;
  vec2 c = vec2(0.5) + uCenter;
  vec2 p = (vUv - c) * vec2(aspect, 1.0);
  float r = length(p) / uZoom;
  float a = atan(p.y, p.x) - uAngle;
  float n = max(1.0, floor(uSlices + 0.5));
  if (n > 1.5) {
    /* dihedral fold: reflect the angle into one wedge */
    float seg = 6.2831853 / n;
    a = mod(a, seg);
    a = min(a, seg - a);
  }
  a += uAngle;
  vec2 s = c + r * vec2(cos(a) / aspect, sin(a));
  frag = vec4(texture(uSrc, s).rgb, 1.0);
}`,
  params: {
  slices: { label: 'Slices', min: 1, max: 16, def: 6, step: 1, fmt: fint, desc: 'How many mirror wedges the view folds into. 1 = no fold (zoom and angle still apply); even counts give the classic scope, high counts a mandala.' },
  angle:  { label: 'Angle', min: -Math.PI, max: Math.PI, def: 0, fmt: fdeg, periodic: true, desc: 'Rotation of the sampling wedge — spin it and the whole pattern turns. A dial here is the classic scope twist.' },
  zoom:   { label: 'Zoom', min: 0.25, max: 4, def: 1.0, fmt: fmul, scale: 'log', desc: 'Radial reach of the sample — how much of the source one wedge sweeps. ×1 = native scale. A riding dial multiplies: full throw sweeps ¼× to 4×.' },
  cx:     { label: 'Ctr X', min: -0.5, max: 0.5, def: 0, fmt: f2, desc: 'The scope’s eye, horizontal — slide the fold point off center and the symmetry walks across the frame.' },
  cy:     { label: 'Ctr Y', min: -0.5, max: 0.5, def: 0, fmt: f2, desc: 'The scope’s eye, vertical.' },
  },
  uniforms: pv => ({ uSlices: pv('slices'), uAngle: pv('angle'), uZoom: pv('zoom'), uCenter: [pv('cx'), pv('cy')] }),
  face: { inp: 'the picture to fold', out: 'the folded mandala', reset: 'Reset the scope — six wedges, centered eye, native zoom, no twist.' },
  hint: 'Kaleidoscope — folds the view into N mirror wedges; slices, twist, zoom and the eye all on knobs',
};
