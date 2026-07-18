#version 300 es
/*
 * Segment-deposit fragment shader — woscope's analytical line-integral.
 * Adapted from m1el/woscope (MIT).
 *
 * Evaluates the closed-form integral of a uniformly-moving Gaussian
 * beam at this pixel:
 *
 *   I(p) = (1 / (2L)) · exp(-py² / (2σ²))
 *               · [erf((L - px) / (√2 σ)) - erf((-px) / (√2 σ))]
 *
 * Three consequences:
 *   1. No stippling — deposit is mathematically continuous along the
 *      segment regardless of length.
 *   2. Velocity-dependent brightness is built into the `1/L` factor —
 *      fast beams (long segments per frame) draw dim lines, slow
 *      beams (short segments) burn bright.
 *   3. Joints between consecutive segments stack without seams because
 *      the integral is continuous across them.
 *
 * Per-segment beam intensity and width come from the vertex shader as
 * varyings (`vBeamI`, `vSigmaPx`) — already multiplied with the
 * global preset-level defaults.
 *
 * Output goes through additive blend (ONE, ONE) into the HDR
 * accumulator.
 */
precision highp float;
#define EPS 1e-6
#define SQRT2 1.4142135623730951
in vec3 vUVL;
in float vSigmaPx;
in float vBeamI;
uniform float uBeamI;            // global beamIntensity (preset)
out vec4 outColor;

// Abramowitz & Stegun 7.1.27 polynomial approximation of erf.
// Max error ~5e-4 — invisible at this scale.
float erfApprox(float x) {
  float s = sign(x);
  float a = abs(x);
  float t = 1.0 + (0.278393 + (0.230389 + (0.000972 + 0.078108 * a) * a) * a) * a;
  t *= t;
  return s - s / (t * t);
}

void main() {
  float tang = vUVL.x;
  float side = vUVL.y;
  float L = vUVL.z;
  float sigma = max(vSigmaPx, 0.001);
  // Reconstruct pixel-local (px, py) in the segment-aligned frame.
  // The vertex shader extruded each corner by ±σ along the segment
  // direction (past the endpoint) and ±σ perpendicular, so:
  //   px ∈ [-σ, L+σ] mapped linearly from tang ∈ [-1, +1]
  //   py = σ · side
  // The (L/2 + σ) factor below comes from solving for the linear
  // map: at tang=-1, px=-σ; at tang=+1, px=L+σ.
  vec2 xy = vec2((L * 0.5 + sigma) * tang + L * 0.5, sigma * side);

  float I;
  if (L < EPS) {
    // Degenerate — point splat fallback. Gaussian at the origin,
    // attenuated so it doesn't overshoot a real segment of length σ.
    I = exp(-dot(xy, xy) / (2.0 * sigma * sigma)) / (2.0 * sigma);
  } else {
    // Analytical integral of a Gaussian beam moving uniformly along
    // the segment, evaluated at this pixel.
    float gy = exp(-xy.y * xy.y / (2.0 * sigma * sigma));
    float gx = erfApprox((L - xy.x) / (SQRT2 * sigma))
             + erfApprox(xy.x / (SQRT2 * sigma));
    // Divide by 2L → fast beam (long segment) is dim, slow beam
    // (short segment) is bright. Multiply by σ to keep total
    // deposited energy roughly invariant to beam width.
    I = (gx * gy * sigma) / (2.0 * L);
  }
  I *= uBeamI * vBeamI;
  if (I <= 0.0) discard;
  outColor = vec4(vec3(I), 1.0);
}
