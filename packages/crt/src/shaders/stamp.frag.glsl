#version 300 es
/*
 * Stamp deposit fragment shader.
 *
 * Reads the alpha of the staged texture and writes it as monochrome
 * intensity (same convention as DepositPass: equal RGB, alpha = 1).
 * The accumulator is monochrome — only the per-pixel intensity
 * matters; phosphor color is applied in PresentPass.
 *
 * Output goes through additive blend (ONE, ONE) into the HDR
 * accumulator, exactly like the beam deposit, so stamps stack and
 * decay alongside any other registered passes.
 */
precision highp float;
in vec2 vUv;
in float vIntensity;
uniform sampler2D uTex;
uniform float uGlobalI;   // master deposit gain (preset.beamIntensity)
out vec4 outColor;
void main() {
  float a = texture(uTex, vUv).a;
  float I = a * vIntensity * uGlobalI;
  if (I <= 0.0) discard;
  outColor = vec4(vec3(I), 1.0);
}
