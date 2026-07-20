import type { FxDef } from './def';
import { f2, fdeg, fint } from '../patch/fmt';
import { COMMON } from './glsl';

/* the Sandin gesture: luma zones, each handed a hue */
export const colorize: FxDef = {
  label: 'Colorize',
  frag: /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 frag;

uniform sampler2D uSrc;
uniform float uZones;
uniform float uHue0;
uniform float uSpread;
uniform float uEdge;
uniform float uMix;
${COMMON}
void main(){
  vec3 src = texture(uSrc, vUv).rgb;
  float l = luma(src);
  float nz = max(2.0, floor(uZones + 0.5));
  float t = clamp(l, 0.0, 0.9999) * nz;
  float zi = floor(t);
  float f = t - zi;
  /* each zone a hue off the wheel, dark zones dim, bright zones lit —
     the analog colorizer's ladder, not a photographic grade */
  float hueStep = uSpread / max(nz - 1.0, 1.0);
  vec3 base = vec3(1.0, 0.12, 0.08);
  vec3 c0 = hueRotate(base, uHue0 + hueStep * zi);
  vec3 c1 = hueRotate(base, uHue0 + hueStep * (zi + 1.0));
  float w = uEdge > 0.001 ? smoothstep(1.0 - uEdge, 1.0, f) : 0.0;
  vec3 zone = mix(c0, c1, w) * ((zi + 0.5 + w) / nz);
  frag = vec4(mix(src, zone, uMix), 1.0);
}`,
  params: {
  zones:  { label: 'Zones', min: 2, max: 12, def: 4, step: 1, fmt: fint, desc: 'How many luma bands the picture quantizes into — each gets its own solid hue, dark zones dim, bright zones bright.' },
  hue0:   { label: 'Hue', min: 0, max: 2 * Math.PI, def: 0, fmt: fdeg, periodic: true, desc: 'The first band’s hue — where on the wheel the ladder starts. A dial here cycles the whole palette.' },
  spread: { label: 'Spread', min: 0, max: 2 * Math.PI, def: Math.PI, fmt: fdeg, desc: 'How far around the wheel the ladder climbs from darkest zone to brightest. Full circle rainbows; small values shade one family.' },
  edge:   { label: 'Edge', min: 0, max: 1, def: 0.08, fmt: f2, desc: 'Band boundary softness. 0 = hard posterized steps; up = zones melt into each other.' },
  mix:    { label: 'Mix', min: 0, max: 1, def: 1, fmt: f2, desc: 'Colorized against the source picture. 1 = pure zone color, 0 = a straight wire.' },
  },
  uniforms: pv => ({ uZones: pv('zones'), uHue0: pv('hue0'), uSpread: pv('spread'), uEdge: pv('edge'), uMix: pv('mix') }),
  face: { inp: 'the picture to quantize', out: 'the zone-colored picture', reset: 'Reset the ladder — four zones, half the wheel, hard edges, full mix.' },
  hint: 'Colorizer — quantizes luma into zones and hands each a hue off the wheel; the Sandin gesture',
};
