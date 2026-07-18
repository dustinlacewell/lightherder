/*
 * Common vertex array objects.
 *
 * `createFullscreenQuad` returns a unit `[0,1]²` quad on attribute 0
 * — what post-process fragment shaders almost always want for their
 * texture sampling. If your shader prefers NDC corners (`[-1,+1]²`),
 * use `createClipspaceQuad` instead.
 *
 * `createMapQuad` is the same shape but scaled to arbitrary `(w, h)`
 * — useful when world-space coordinates run from `(0, 0)` to
 * `(mapW, mapH)` and a single camera matrix transforms the quad to
 * clip space.
 */

export function createFullscreenQuad(
  gl: WebGL2RenderingContext,
): WebGLVertexArrayObject {
  const vao = gl.createVertexArray()
  if (!vao) throw new Error('gl.createVertexArray returned null')
  gl.bindVertexArray(vao)
  const buf = gl.createBuffer()
  if (!buf) throw new Error('gl.createBuffer returned null')
  gl.bindBuffer(gl.ARRAY_BUFFER, buf)
  // Two triangles covering [0,1]². Vertex shader is expected to
  // either pass this through as the UV coord or remap to clip space.
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    0, 0, 1, 0, 0, 1,
    1, 0, 1, 1, 0, 1,
  ]), gl.STATIC_DRAW)
  gl.enableVertexAttribArray(0)
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
  gl.bindVertexArray(null)
  return vao
}

/**
 * Unit clip-space quad on attribute 0, vertices in `[-1, +1]²`. The
 * vertex shader can write `gl_Position = vec4(aPos, 0, 1)` directly.
 * Use this when the shader doesn't need a UV coord (or computes it
 * from `gl_FragCoord`).
 */
export function createClipspaceQuad(
  gl: WebGL2RenderingContext,
): WebGLVertexArrayObject {
  const vao = gl.createVertexArray()
  if (!vao) throw new Error('gl.createVertexArray returned null')
  gl.bindVertexArray(vao)
  const buf = gl.createBuffer()
  if (!buf) throw new Error('gl.createBuffer returned null')
  gl.bindBuffer(gl.ARRAY_BUFFER, buf)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1, -1, 1, -1, -1, 1,
    1, -1, 1, 1, -1, 1,
  ]), gl.STATIC_DRAW)
  gl.enableVertexAttribArray(0)
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
  gl.bindVertexArray(null)
  return vao
}

/**
 * Quad covering `[0, 0] → (mapWidth, mapHeight)` in world coords on
 * attribute 0. Used when a camera matrix transforms the quad into
 * clip space and a single texture covers the whole map.
 */
export function createMapQuad(
  gl: WebGL2RenderingContext,
  mapWidth: number,
  mapHeight: number,
): WebGLVertexArrayObject {
  const vao = gl.createVertexArray()
  if (!vao) throw new Error('gl.createVertexArray returned null')
  gl.bindVertexArray(vao)
  const positions = new Float32Array([
    0, 0,
    mapWidth, 0,
    0, mapHeight,
    0, mapHeight,
    mapWidth, 0,
    mapWidth, mapHeight,
  ])
  const buf = gl.createBuffer()
  if (!buf) throw new Error('gl.createBuffer returned null')
  gl.bindBuffer(gl.ARRAY_BUFFER, buf)
  gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW)
  gl.enableVertexAttribArray(0)
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
  gl.bindVertexArray(null)
  return vao
}
