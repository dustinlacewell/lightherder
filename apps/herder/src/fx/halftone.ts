import type { FxDef } from './def';
import { fdeg, fpx, sel } from '../patch/fmt';

/* rotated per-channel screens — print rosettes as an oscillator */
const HALFTONE_SHAPES = ['DOT', 'LINE', 'SQUARE'];

export const halftone: FxDef = {
  label: 'Halftone',
  frag: /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 frag;
uniform sampler2D uSrc;
uniform vec2  uRes;
uniform float uPitch;
uniform float uAngle;
uniform float uRosette;  /* per-channel screen-angle offset — the rosettes */
uniform float uShape;    /* 0 dot, 1 line, 2 square */
void main(){
  vec3 outc = vec3(0.0);
  for (int i = 0; i < 3; i++){
    float ang = uAngle + uRosette * float(i);
    vec2 d = vec2(cos(ang), sin(ang));
    mat2 R  = mat2(d.x, d.y, -d.y, d.x);
    mat2 Ri = mat2(d.x, -d.y, d.y, d.x);
    vec2 g = R * (vUv * uRes) / uPitch;
    vec2 cuv = (Ri * ((floor(g) + 0.5) * uPitch)) / uRes;
    float val = texture(uSrc, clamp(cuv, 0.0, 1.0))[i];
    vec2 cell = fract(g) - 0.5;
    float cov;
    if (uShape < 0.5)      { float rr = sqrt(val) * 0.564; cov = smoothstep(rr, rr - 0.12, length(cell)); }
    else if (uShape < 1.5) { float w = val * 0.5;          cov = smoothstep(w, w - 0.12, abs(cell.y)); }
    else                   { float h = sqrt(val) * 0.5;    cov = smoothstep(h, h - 0.12, max(abs(cell.x), abs(cell.y))); }
    outc[i] = cov;
  }
  frag = vec4(outc, 1.0);
}`,
  params: {
    pitch:   { label: 'Pitch', min: 2, max: 24, def: 8, fmt: fpx, desc: 'Dot-grid spacing. Small reads as print; large turns the picture into pop-art punctuation.' },
    angle:   { label: 'Angle', min: -Math.PI, max: Math.PI, def: 0.26, fmt: fdeg, periodic: true, desc: 'Base screen angle. Spin it and the whole page of dots rotates.' },
    rosette: { label: 'Rosette', min: 0, max: 0.6, def: 0.26, fmt: fdeg, desc: 'Angle offset between the three channel screens — the source of the print rosettes. Detune it live and the interference blooms and crawls.' },
    shape:   { label: 'Shape', min: 0, max: 2, def: 0, step: 1, fmt: sel(HALFTONE_SHAPES), desc: 'The screen element: round DOTs, engraving LINEs, or hard SQUAREs.' },
  },
  uniforms: pv => ({ uPitch: pv('pitch'), uAngle: pv('angle'), uRosette: pv('rosette'), uShape: Math.round(pv('shape')) }),
  face: { inp: 'the picture to screen', out: 'the screened print', reset: 'Reset the press — classic pitch and angles, round dots.' },
  hint: 'Halftone — rotated per-channel dot screens; detune the angles and the rosettes crawl',
};
