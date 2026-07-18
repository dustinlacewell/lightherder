#version 300 es
/*
 * Decay shader. Reads the previous-frame accumulation, applies a
 * stretched-exponential survival factor in luminance, writes the
 * decayed accumulation. The β = 1 case is the pure-exponential
 * `× persistence` decay; β < 1 makes bright peaks fade quickly while
 * the dim tail lingers — exactly what real phosphors do.
 *
 * Per-frame survival factor `s = uPersistence` is raised to a
 * luminance-dependent exponent so brighter pixels decay
 * disproportionately:
 *
 *   survival(L) = uPersistence ^ pow(L + ε, max(1 - uBeta, 0))
 *
 * When β = 1 the exponent is 0 → survival = 1 for all L, which would
 * be no decay — so callers should clamp β to (0, 1]. β = 1.0 is
 * effectively "no Kohlrausch stretch" rather than "no decay" because
 * the supplied uPersistence is itself the per-frame survival.
 */
precision highp float;
in vec2 vUv;
uniform sampler2D uAccum;
uniform float uPersistence;
uniform float uBeta;
out vec4 outColor;
void main() {
  vec4 c = texture(uAccum, vUv);
  float L = max(max(c.r, c.g), c.b);
  // Guard β at 1.0 to avoid NaN at L=0 when 1-β=0.
  float exponent = pow(L + 1e-4, max(1.0 - uBeta, 0.0));
  float survival = pow(clamp(uPersistence, 0.0, 0.9999), exponent);
  outColor = vec4(c.rgb * survival, c.a);
}
