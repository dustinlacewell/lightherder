#version 300 es
/*
 * Stamp deposit vertex shader.
 *
 * Each stamp is one instanced quad. The corner attribute is the
 * canonical [-1,+1] quad (also used by the deposit pass); per-instance
 * attributes locate it in NDC, scale it to a CSS-pixel size, and
 * rotate it.
 *
 * Instance attribs:
 *   aPos.xy   — center in NDC
 *   aPos.zw   — sizePx, rotation (radians)
 *   aMul.x    — per-stamp intensity multiplier
 *
 * Vertex output:
 *   vUv       — [0,1]² for sampling the stamp texture
 *   vIntensity — per-stamp intensity, threaded to the frag stage
 */
layout(location = 0) in vec2 aCorner;
layout(location = 1) in vec4 aPos;
layout(location = 2) in float aMul;
uniform vec2 uHalfSizePx;  // half the FBO size in px
out vec2 vUv;
out float vIntensity;
void main() {
  // Build the quad in pixel space, then convert back to NDC.
  float sizePx  = aPos.z;
  float rot     = aPos.w;
  vec2 centerPx = aPos.xy * uHalfSizePx;
  float c = cos(rot), s = sin(rot);
  vec2 local = 0.5 * sizePx * aCorner;
  vec2 rotated = vec2(c * local.x - s * local.y, s * local.x + c * local.y);
  vec2 px = centerPx + rotated;
  gl_Position = vec4(px / uHalfSizePx, 0.0, 1.0);
  // aCorner is in [-1, +1]; map to [0, 1] for uv.
  vUv = aCorner * 0.5 + 0.5;
  vIntensity = aMul;
}
