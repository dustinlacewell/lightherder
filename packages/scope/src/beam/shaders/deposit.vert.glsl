#version 300 es
/*
 * Segment-deposit vertex shader. Adapted from m1el/woscope (MIT) —
 * https://m1el.github.io/woscope-how/.
 *
 * Each segment between two consecutive beam samples is rasterised as
 * one quad. The quad's pixel-local coordinate frame is rotated so the
 * segment lies along the X axis from (0, 0) to (L, 0), with a σ-pixel
 * margin on all four sides — where σ here is the *effective* σ for
 * this segment, i.e. `uBeamSigmaPx * aBeam.y`.
 *
 * The fragment shader then evaluates the closed-form integral of a
 * uniformly-moving Gaussian beam — see deposit.frag.glsl.
 *
 * Instance attribs:
 *   aSeg.xy  — segment start, NDC
 *   aSeg.zw  — segment end,   NDC
 *   aBeam.x  — per-segment beamI multiplier (1 = neutral)
 *   aBeam.y  — per-segment beam-width multiplier (1 = neutral)
 */
layout(location = 0) in vec2 aCorner;   // [-1,+1] quad corner
layout(location = 1) in vec4 aSeg;      // xy=start, zw=end (NDC)
layout(location = 2) in vec2 aBeam;     // x=beamI mul, y=width mul
uniform vec2 uHalfSizePx;               // half of FBO size in px
uniform float uBeamSigmaPx;             // baseline beam σ in FBO px
out vec3 vUVL;                          // (tang, side, length-in-px)
out float vSigmaPx;                     // effective σ for this segment
out float vBeamI;                       // effective beamI for this segment
void main() {
  // Effective beam parameters for this segment.
  float sigma = max(uBeamSigmaPx * aBeam.y, 0.001);
  vSigmaPx = sigma;
  vBeamI = aBeam.x;

  // Pull start/end into FBO pixel space so all segment maths happens
  // in pixels — that's the frame the fragment shader's analytical
  // integral assumes.
  vec2 startPx = aSeg.xy * uHalfSizePx;
  vec2 endPx   = aSeg.zw * uHalfSizePx;
  vec2 d = endPx - startPx;
  float L = length(d);
  // dir along segment; norm perpendicular. If the segment is
  // degenerate (start == end), fall back to a unit-X frame so the
  // quad still has positive area and the fragment-shader EPS branch
  // handles the rendering.
  vec2 dir  = L > 0.0 ? d / L : vec2(1.0, 0.0);
  vec2 norm = vec2(-dir.y, dir.x);
  // aCorner.x = tang ∈ {-1, +1} → start corner vs end corner.
  // aCorner.y = side ∈ {-1, +1} → which side of the segment line.
  float tang = aCorner.x;
  float side = aCorner.y;
  // Pick the endpoint this corner belongs to.
  vec2 endpoint = tang < 0.0 ? startPx : endPx;
  // Extrude σ pixels along the segment direction (past the endpoint)
  // and σ pixels perpendicular. That gives the fragment a 1-σ margin
  // in both axes — wider would catch more of the Gaussian tail but
  // our halation pass handles spillover.
  vec2 px = endpoint + (tang * dir + side * norm) * sigma;
  gl_Position = vec4(px / uHalfSizePx, 0.0, 1.0);
  vUVL = vec3(tang, side, L);
}
