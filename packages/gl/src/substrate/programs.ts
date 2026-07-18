/*
 * Shader program compilation and linking.
 *
 * `compileShader` and `createProgram` throw on failure with the GL info
 * log — the GLSL compile/link errors are far more useful surfaced as
 * exceptions than as silent `null` returns. Callers that genuinely want
 * to recover from a bad shader can wrap in try/catch.
 *
 * `shaderSrc` lets you parameterise GLSL at construction time without
 * resorting to template literals or a preprocessor. It just injects
 * `#define` lines after the `#version` directive, which means the rest
 * of the shader can reference the constants as if they were literals
 * (and the GL compiler will fold them through).
 */

export function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
): WebGLShader {
  const shader = gl.createShader(type)
  if (!shader) throw new Error('gl.createShader returned null')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? ''
    gl.deleteShader(shader)
    throw new Error(`Shader compile error:\n${log}`)
  }
  return shader
}

export function createProgram(
  gl: WebGL2RenderingContext,
  vertSrc: string,
  fragSrc: string,
): WebGLProgram {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vertSrc)
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fragSrc)
  const program = gl.createProgram()
  if (!program) throw new Error('gl.createProgram returned null')
  gl.attachShader(program, vs)
  gl.attachShader(program, fs)
  gl.linkProgram(program)
  gl.deleteShader(vs)
  gl.deleteShader(fs)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program) ?? ''
    gl.deleteProgram(program)
    throw new Error(`Program link error:\n${log}`)
  }
  return program
}

/**
 * Inject `#define` constants into a GLSL shader source string. Inserts
 * definitions immediately after the `#version` line so they're visible
 * to the rest of the shader. Values are stringified verbatim — for
 * non-numeric defines, format them yourself before calling.
 *
 * Usage:
 *   shaderSrc(blurFrag, { TAPS: 9, RADIUS: 4 })
 *   // → "#version 300 es\n#define TAPS 9\n#define RADIUS 4\n..."
 */
export function shaderSrc(
  source: string,
  defines: Record<string, number | string>,
): string {
  const defs = Object.entries(defines)
    .map(([k, v]) => `#define ${k} ${v}`)
    .join('\n')
  return source.replace('#version 300 es', `#version 300 es\n${defs}`)
}

/**
 * Look up a uniform location, throwing if it's missing. Useful when
 * you *expect* the uniform to exist (typo would be silent otherwise).
 * For optional uniforms, call `gl.getUniformLocation` directly and
 * check for null.
 */
export function requireUniform(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  name: string,
): WebGLUniformLocation {
  const loc = gl.getUniformLocation(program, name)
  if (loc === null) {
    throw new Error(`Uniform '${name}' not found in program (typo, or optimised out)`)
  }
  return loc
}
