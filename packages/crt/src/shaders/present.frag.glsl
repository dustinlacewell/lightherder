#version 300 es
/*
 * Tonemap / composite to screen. Models the real CRT-tube look — the
 * trace and its glow are *saturated phosphor color*; only the brightest
 * extrema (sine peaks where the beam is slow) push toward white. Most
 * of the trace stays pure green / amber / whatever the phosphor color
 * is.
 *
 *   accum     = HDR scalar (deposit writes equal RGB, so .r == .g == .b)
 *   halo      = blurred copy at lower res
 *   intensity = accum.r + halo.r * uHaloI
 *   color     = phosphorColor * intensity
 *             + (whitePoint - phosphorColor) * smoothstep(knee, knee+slope, intensity) * intensity
 *
 * The result tonemaps softly past 1.0 with an ACES-style shoulder.
 * Alpha tracks luminance so dim/empty pixels stay transparent and the
 * dark OLED glass shows through.
 */
precision highp float;
in vec2 vUv;
uniform sampler2D uAccum;
uniform sampler2D uHalo;
uniform float uHaloI;
uniform float uHaloTint;       // reserved for future taste knob
uniform float uSatKnee;
uniform float uWhiteHot;
uniform float uGrain;
uniform float uFlicker;
uniform float uTime;
uniform float uAlpha;          // global surface opacity in [0, 1]
uniform vec3 uPhosphorColor;
uniform vec3 uWhitePoint;
out vec4 outColor;

// Cheap hash for grain.
float hash(vec2 p) {
  p = fract(p * vec2(443.8975, 397.2973));
  p += dot(p, p.yx + 19.19);
  return fract((p.x + p.y) * p.x);
}

// ACES-ish soft shoulder: gentle compression above 1.0.
vec3 filmic(vec3 x) {
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x*(a*x+b)) / (x*(c*x+d)+e), 0.0, 1.0);
}

void main() {
  float accum = texture(uAccum, vUv).r;
  float halo  = texture(uHalo, vUv).r * uHaloI;
  float I = accum + halo;

  // Base: pure phosphor color scaled by intensity.
  vec3 color = uPhosphorColor * I;

  // Bleach-to-white only at the very brightest cores. The knee is
  // configurable; default sits well above 1.0 so only the extrema
  // (sine peaks where the beam is slow + stacked oversamples) ever
  // push toward white. The slope is controlled by uWhiteHot.
  float bleach = smoothstep(
    uSatKnee,
    uSatKnee + 1.0 / max(uWhiteHot, 0.01),
    I
  );
  color += (uWhitePoint - uPhosphorColor) * bleach * I;

  // Filmic shoulder so highlights compress smoothly rather than clip.
  color = filmic(color);

  // 120Hz brightness wobble (mains hum aliased to half-line).
  float wobble = 1.0 + uFlicker * sin(uTime * 754.0);
  color *= wobble;

  // Screen grain — phosphor granularity. Subtractive so the dark
  // background stays clean. Only applied where there's some signal.
  float lum = max(max(color.r, color.g), color.b);
  float n = hash(gl_FragCoord.xy + vec2(uTime * 37.0));
  color = max(color - vec3(uGrain) * (1.0 - n) * step(0.01, lum), vec3(0.0));

  // Alpha tracks luminance — dim/empty pixels are transparent so the
  // OLED glass background shows through everywhere there's no trace.
  // uAlpha is the global surface opacity, multiplied in last so it
  // fades the whole trace (including its halo) uniformly without
  // touching the underlying glass.
  float a = clamp(max(max(color.r, color.g), color.b), 0.0, 1.0) * uAlpha;
  outColor = vec4(color * uAlpha, a);

  // Silence the unused-uniform warning without spending a sampler.
  if (uHaloTint < -1.0) discard;
}
