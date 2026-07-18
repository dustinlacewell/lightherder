#version 300 es
/*
 * Separable exponential blur for halation. Two passes (H then V).
 * 17 taps with weights exp(-|i|/σ_taps) covers ~6σ; the kernel is
 * normalised so a uniform field is preserved.
 *
 * Direction is passed in pixels-per-step via `uStep`. For a
 * horizontal pass, `uStep = (k / w, 0)`. For vertical,
 * `uStep = (0, k / h)`. The caller picks k so the tap range covers
 * the desired halation radius.
 */
precision highp float;
in vec2 vUv;
uniform sampler2D uSrc;
uniform vec2 uStep;       // one-pixel offset (1/w, 0) or (0, 1/h) scaled
uniform float uSigmaTaps; // σ measured in taps (radius / taps_count)
out vec4 outColor;
void main() {
  const int R = 8;
  vec3 acc = vec3(0.0);
  float wsum = 0.0;
  for (int i = -R; i <= R; ++i) {
    float w = exp(-abs(float(i)) / max(uSigmaTaps, 0.001));
    acc += texture(uSrc, vUv + uStep * float(i)).rgb * w;
    wsum += w;
  }
  outColor = vec4(acc / wsum, 1.0);
}
