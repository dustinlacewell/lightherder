#version 300 es
/*
 * Fullscreen triangle vertex shader. No VBO needed — gl_VertexID
 * drives the geometry. Draw with `gl.drawArrays(gl.TRIANGLES, 0, 3)`.
 *
 * Maps to clip-space corners (-1,-1), (3,-1), (-1,3). The single
 * triangle covers the full viewport with no rasterizer wasted on the
 * off-screen quarter that a fullscreen-quad pair would produce.
 *
 * `vUv` is `[0,1]²` on the visible portion — the over-extension into
 * [1,2] gets clipped before the fragment stage.
 */
out vec2 vUv;
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
