import { COMMON } from '../fx/glsl';

/* The passes, as GLSL:

   camera  — the physical camera, every stage on a knob: rotation/zoom
             warp (knobs + control wires), focus, sharpen, fringe,
             exposure + AGC, picture-profile contrast and saturation,
             sensor bleed, grain, highlight knee.
   monitor — its wired source at its delay, then the four analog knobs:
             bright → contrast → sat → hue; phosphor persistence; a
             tapped spark flashes on the face.
   mixer   — two sources composited (MIX = the 50/50 glass, KEY = B
             luma-keyed over A, plus the digital blend set: ADD, DIFF,
             MULT, SCREEN, OVERLAY, DODGE, BURN), then the same
             monitor treatment.
   screen  — a device face blitted onto the editor canvas: rounded
             corners, vignette, scanlines. */


/* the monitor/mixer shared tail: analog knobs, soft saturation,
   persistence, the spark */
const SCREEN_TAIL = /* glsl */ `
vec3 screenTail(vec3 c, vec2 uv){
  c += uBright;
  c = (c - 0.5) * uContrast + 0.5;
  float l = luma(c);
  c = mix(vec3(l), c, uSat);
  c = hueRotate(c, uHue);
  /* soft saturation, like a phosphor: bright channels roll off gently
     instead of clamping, so color differences survive in bright regions */
  vec3 soft = 0.8 + 0.2 * tanh((c - 0.8) / 0.2);
  c = mix(c, soft, step(0.8, c));
  /* phosphor persistence: displayed light decays, it doesn't vanish */
  c = mix(c, texture(uPrevSelf, uv).rgb, uPersist);
  /* a tapped spark flashes on THIS face — new light, added after
     everything, for a watching camera to pick up next frame */
  if (uSpark.z > 0.001) {
    vec2 d = (uv - uSpark.xy) * vec2(uRes.x / uRes.y, 1.0);
    c += hueRotate(vec3(1.0, 0.55, 0.22), uSpark.w) * exp(-dot(d, d) * 140.0) * uSpark.z;
  }
  return clamp(c, 0.0, 1.0);
}
`;

export const CAMERA_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 frag;

uniform sampler2D uSrc;     /* whatever the camera is pointed at        */
uniform sampler2D uPrev;    /* its own previous frame — the AGC state   */
uniform vec2  uRes;
uniform float uTime;

uniform float uRot, uPush;  /* rotation + zoom: knob and control wire   */
uniform vec2  uOff;         /* mount off-axis                           */
uniform float uFocus, uExposure, uGrain;
uniform float uAgc;         /* auto-exposure strength                   */
uniform float uSharpen;     /* edge-enhancement circuit gain            */
uniform float uCContrast;   /* picture profile: contrast                */
uniform float uCSat;        /* picture profile: saturation              */
uniform float uFringe;      /* lens chromatic aberration radius         */
uniform float uBleed;       /* sensor channel crosstalk                 */
uniform float uKnee;        /* sensor highlight rolloff softness        */

${COMMON}

vec2 toLens(vec2 uv){ vec2 p = uv - 0.5; p.x *= uRes.x / uRes.y; return p; }
vec2 fromLens(vec2 p){ p.x /= uRes.x / uRes.y; return p + 0.5; }

/* the subject has an edge; the camera sees the dark room beyond it.
   With the screen occupying only part of the frame (zoom < 1) this
   edge is what draws the nested-frame corridor of classic feedback. */
float inFrame(vec2 uv){
  vec2 s = smoothstep(vec2(0.0), vec2(0.012), uv)
         * (vec2(1.0) - smoothstep(vec2(0.988), vec2(1.0), uv));
  return s.x * s.y;
}
vec3 tap(sampler2D t, vec2 uv){
  vec2 px = uFocus / uRes;
  vec3 c = texture(t, uv).rgb * 0.40;
  c += texture(t, uv + vec2( px.x,  px.y)).rgb * 0.15;
  c += texture(t, uv + vec2(-px.x,  px.y)).rgb * 0.15;
  c += texture(t, uv + vec2( px.x, -px.y)).rgb * 0.15;
  c += texture(t, uv + vec2(-px.x, -px.y)).rgb * 0.15;
  /* the SHARPEN circuit — the mechanism that lets an image PERSIST:
     everything else in the loop is a low-pass (resampling, focus), so
     detail can only decay; this is gain >1 on structure. Blair: the
     flat DSLR profile let feedback dissipate until he "turned up the
     sharpness" in the camera.
     Like a real camcorder detail circuit it is a BAND-PASS on mid
     frequencies, NOT a raw highpass — a naive unsharp mask peaks at
     the pixel checkerboard (Nyquist), and in a closed loop that mode
     out-grows everything and rails. Both taps here are 2×2 boxes
     (bilinear at half-pixel offsets), which have ZERO response at
     Nyquist: edges and lines get the gain, pixel alternation none. */
  vec2 f1 = 0.5 / uRes, f2 = 1.5 / uRes;
  vec3 fine   = ( texture(t, uv + vec2( f1.x,  f1.y)).rgb + texture(t, uv + vec2(-f1.x,  f1.y)).rgb
                + texture(t, uv + vec2( f1.x, -f1.y)).rgb + texture(t, uv + vec2(-f1.x, -f1.y)).rgb) * 0.25;
  vec3 coarse = ( texture(t, uv + vec2( f2.x,  f2.y)).rgb + texture(t, uv + vec2(-f2.x,  f2.y)).rgb
                + texture(t, uv + vec2( f2.x, -f2.y)).rgb + texture(t, uv + vec2(-f2.x, -f2.y)).rgb) * 0.25;
  c += (fine - coarse) * uSharpen;
  /* chromatic FRINGE — a lens is never honest; the fringes it adds get
     amplified into color by every trip around the loop. It COMPOUNDS
     per lap (red spirals inward, blue outward), so at unity loop gain
     it must stay a whisper or the channels fully separate in seconds. */
  vec2 c0 = uv - 0.5;
  c.r = mix(c.r, texture(t, 0.5 + c0 * (1.0 + uFringe)).r, 0.5);
  c.b = mix(c.b, texture(t, 0.5 + c0 * (1.0 - uFringe)).b, 0.5);
  return c;
}

void main(){
  /* the mount: rotate about the axis, zoom toward/away, drift off-axis */
  vec2 p = toLens(vUv);
  float ca = cos(uRot), sa = sin(uRot);
  p = mat2(ca, -sa, sa, ca) * p;
  p /= uPush;
  p -= uOff;
  vec2 uv = fromLens(p);
  vec3 col = tap(uSrc, uv) * inFrame(uv);

  /* auto-exposure, done like a real camcorder: the gain is a STATE
     that adapts toward mid-gray, riding along in this pass's alpha
     channel: read last frame's gain, nudge it, write it back.
     DAMPING IS STRUCTURAL, not a tuning nicety: in a closed loop the
     scene level is entirely a product of past gains, so a pure
     integrating AGC rings UNDAMPED at any adaptation speed (the
     linearized update has determinant 1 — slowing it only lowers the
     strobe's pitch). The pow(gPrev, λ) leak relaxes gain toward
     unity, putting the eigenvalues inside the circle. The price is a
     little droop — a lossy loop settles a bit dim instead of pinned
     at mid-gray — and the cure for that is the knobs, which is the
     instrument working as designed. */
  float gPrev = texture(uPrev, vec2(0.5, 0.5)).a * 4.0;
  /* matrix metering with HIGHLIGHT PROTECTION: a screen that doesn't
     fill the frame sits in a black room, and a plain mean would read
     "underexposed" and drive the face to clipped white (the
     film-a-TV-in-a-dark-room failure). Metering the brighter of the
     mean and half the peak means blown highlights pull gain DOWN even
     when the surround is dark. */
  float mean = 0.0, peak = 0.0;
  for (int i = 0; i < 3; i++)
    for (int j = 0; j < 3; j++) {
      float l = luma(texture(uPrev, vec2(0.2 + 0.3 * float(i), 0.2 + 0.3 * float(j))).rgb);
      mean += l;
      peak = max(peak, l);
    }
  mean /= 9.0;
  float meter = max(mean, peak * 0.5);
  float ratio = clamp(0.30 / max(meter, 0.01), 0.25, 4.0);
  float gain = clamp(pow(gPrev, 0.94) * pow(ratio, 0.07), 0.25, 2.5);
  col *= uExposure * mix(1.0, gain, uAgc);

  /* the PICTURE PROFILE — contrast and saturation dialed in the
     camera itself, not the monitors. ×1 = flat profile (identity). */
  col = (col - 0.5) * uCContrast + 0.5;
  col = mix(vec3(luma(col)), col, uCSat);

  /* sensor BLEED — the channels leak into each other a little.
     Without it each channel runs the loop INDEPENDENTLY, and any
     channel in a clamped over-unity loop rails to 0 or 1 — the whole
     palette collapses to the corners of the RGB cube. 0 = none. */
  col = mix(col, vec3(luma(col)), uBleed);

  /* per-channel sensor grain — the color seed the knobs amplify.
     Zero means ZERO: a black loop stays black until something is fed
     in (no hidden noise floor to self-ignite a flicker cycle). */
  col += (hash3(vUv * uRes + fract(uTime) * vec2(157.0, 113.0)) - 0.5) * uGrain;

  /* the sensor's KNEE: highlights roll off softly instead of clamping,
     so channel differences (color) survive where a loop over-drives —
     a hard clamp rails whites and posterizes. */
  vec3 soft = 0.8 + 0.2 * tanh((col - 0.8) / 0.2);
  col = mix(col, soft, step(0.8, col) * uKnee);

  frag = vec4(max(col, 0.0), gain * 0.25);   /* alpha carries the AGC state */
}`;

export const MONITOR_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 frag;
uniform sampler2D uSrc;      /* the wired source, at this monitor's delay */
uniform sampler2D uPrevSelf; /* what this screen showed last frame */
uniform float uPersist;
uniform float uBright, uContrast, uSat, uHue;
uniform vec2  uRes;
uniform vec4  uSpark;        /* xy uv · z power · w hue */
${COMMON}
${SCREEN_TAIL}
void main(){
  vec3 c = texture(uSrc, vUv).rgb;
  frag = vec4(screenTail(c, vUv), 1.0);
}`;

export const MIXER_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 frag;
uniform sampler2D uA;        /* input A — the base */
uniform sampler2D uB;        /* input B — the other pane, or the key fill */
uniform sampler2D uPrevSelf;
uniform float uMode;         /* index into MIXER_MODES — the ladder below */
uniform float uKeyLvl;       /* the keyer's luma threshold */
uniform float uPersist;
uniform float uBright, uContrast, uSat, uHue;
uniform vec2  uRes;
uniform vec4  uSpark;
${COMMON}
${SCREEN_TAIL}
void main(){
  vec3 a = texture(uA, vUv).rgb;
  vec3 b = texture(uB, vUv).rgb;
  /* MIX is the beamsplitter, TRUE 50/50: both panes carrying a loop
     superpose to self-gain 1.0 — the stable IFS weighting; a single
     lit pane arrives at 0.5 and a camera's iris pays the loss back.
     KEY does the same job electronically: bright pixels of B land
     over A, dark ones let A through. The rest are the digital blend
     set — ADD is the superimpose bus (self-gain 2.0: loops bloom and
     the iris pays it back down), DODGE and BURN divide, so they clamp
     against a floored denominator instead of railing to infinity. */
  int m = int(uMode + 0.5);
  vec3 c;
  if      (m == 0) c = (a + b) * 0.5;
  else if (m == 1) c = mix(a, b, smoothstep(uKeyLvl - 0.07, uKeyLvl + 0.07, luma(b)));
  else if (m == 2) c = a + b;
  else if (m == 3) c = abs(a - b);
  else if (m == 4) c = a * b;
  else if (m == 5) c = 1.0 - (1.0 - a) * (1.0 - b);
  else if (m == 6) c = mix(2.0 * a * b, 1.0 - 2.0 * (1.0 - a) * (1.0 - b), step(0.5, a));
  else if (m == 7) c = min(a / max(1.0 - b, 1e-3), vec3(1.0));
  else             c = 1.0 - min((1.0 - a) / max(b, 1e-3), vec3(1.0));
  frag = vec4(screenTail(c, vUv), 1.0);
}`;

export const COPY_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 frag;
uniform sampler2D uSrc;
void main(){ frag = texture(uSrc, vUv); }`;

export const QUAD_VERT = /* glsl */ `#version 300 es
uniform vec2  uCenter;   /* px, origin top-left */
uniform vec2  uHalf;     /* px */
uniform vec2  uView;     /* canvas px */
out vec2 vUv;
void main(){
  vec2 c = vec2(float(gl_VertexID & 1), float((gl_VertexID >> 1) & 1));
  vUv = vec2(c.x, 1.0 - c.y);
  vec2 p = (c * 2.0 - 1.0) * uHalf + uCenter;
  vec2 clip = (p / uView) * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
}`;

export const SCREEN_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 frag;
uniform sampler2D uTex;
uniform float uTime;
uniform vec2  uPx;       /* this quad's size in px */
${COMMON}
void main(){
  /* rounded corners to sit in the node's face well */
  vec2 hp = uPx * 0.5;
  vec2 dp = abs(vUv * uPx - hp) - (hp - 5.0);
  if (length(max(dp, 0.0)) - 5.0 > 0.0) discard;

  vec3 c = texture(uTex, vUv).rgb;
  vec2 p = vUv - 0.5;
  c *= 1.0 - dot(p, p) * 0.45;
  c = pow(c, vec3(0.92));
  c *= 0.97 + 0.03 * sin(vUv.y * 540.0 * 3.14159);
  c += (hash(vUv * uPx + fract(uTime) * vec2(91.0, 53.0)) - 0.5) * 0.010;
  frag = vec4(c, 1.0);
}`;
