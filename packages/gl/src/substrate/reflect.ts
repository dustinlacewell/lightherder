/*
 * Uniform reflection and data-driven application.
 *
 * `reflectUniforms` introspects a linked program once, capturing each
 * active uniform's location, GLSL type, and — for samplers — a stable
 * texture unit assigned in declaration order. `applyUniforms` then
 * dispatches a plain `Record<string, value>` to the right gl.uniform*
 * call, binding textures to their reflected units.
 *
 * Keys with no matching active uniform are skipped silently: the GLSL
 * compiler eliminates unused uniforms, so presence is not a reliable
 * signal and callers routinely share one value dict across several
 * shaders. Use `requireUniform` (programs.ts) when absence should be
 * loud.
 */

export interface ReflectedUniform {
  location: WebGLUniformLocation
  /** GLSL type enum (gl.FLOAT, gl.FLOAT_VEC2, gl.SAMPLER_2D, …). */
  type: number
  /** Array length for uniform arrays; 1 for scalars. */
  size: number
  /** Texture unit, assigned in declaration order. Samplers only. */
  unit?: number
}

export type UniformValue =
  | number
  | boolean
  | number[]
  | Float32Array
  | Int32Array
  | WebGLTexture

export type UniformValues = Record<string, UniformValue>

export function reflectUniforms(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
): Record<string, ReflectedUniform> {
  const out: Record<string, ReflectedUniform> = {}
  const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) as number
  let nextUnit = 0
  for (let i = 0; i < count; i++) {
    const info = gl.getActiveUniform(program, i)
    if (!info) continue
    const location = gl.getUniformLocation(program, info.name)
    if (location === null) continue
    /* uniform arrays reflect as "name[0]" — expose the bare name */
    const name = info.name.replace(/\[0\]$/, '')
    const u: ReflectedUniform = { location, type: info.type, size: info.size }
    if (isSampler(gl, info.type)) {
      u.unit = nextUnit
      nextUnit += info.size
    }
    out[name] = u
  }
  return out
}

function isSampler(gl: WebGL2RenderingContext, type: number): boolean {
  return (
    type === gl.SAMPLER_2D ||
    type === gl.SAMPLER_3D ||
    type === gl.SAMPLER_CUBE ||
    type === gl.SAMPLER_2D_ARRAY ||
    type === gl.SAMPLER_2D_SHADOW ||
    type === gl.INT_SAMPLER_2D ||
    type === gl.UNSIGNED_INT_SAMPLER_2D
  )
}

/**
 * Apply a value dict against a reflected uniform table. The program
 * must already be in use (`gl.useProgram`). Textures bind to the unit
 * reflection assigned them; everything else dispatches on the
 * reflected GLSL type, so callers never name a gl.uniform* function.
 */
export function applyUniforms(
  gl: WebGL2RenderingContext,
  uniforms: Record<string, ReflectedUniform>,
  values: UniformValues,
): void {
  for (const [name, value] of Object.entries(values)) {
    const u = uniforms[name]
    if (!u) continue
    if (value instanceof WebGLTexture) {
      if (u.unit === undefined)
        throw new Error(`Uniform '${name}' is not a sampler`)
      gl.activeTexture(gl.TEXTURE0 + u.unit)
      gl.bindTexture(bindTargetFor(gl, u.type), value)
      gl.uniform1i(u.location, u.unit)
      continue
    }
    applyNumeric(gl, u, name, value)
  }
}

function bindTargetFor(gl: WebGL2RenderingContext, type: number): number {
  if (type === gl.SAMPLER_3D) return gl.TEXTURE_3D
  if (type === gl.SAMPLER_CUBE) return gl.TEXTURE_CUBE_MAP
  if (type === gl.SAMPLER_2D_ARRAY) return gl.TEXTURE_2D_ARRAY
  return gl.TEXTURE_2D
}

function applyNumeric(
  gl: WebGL2RenderingContext,
  u: ReflectedUniform,
  name: string,
  value: number | boolean | number[] | Float32Array | Int32Array,
): void {
  const L = u.location
  if (typeof value === 'boolean') return gl.uniform1i(L, value ? 1 : 0)
  if (typeof value === 'number') {
    if (u.type === gl.FLOAT) return gl.uniform1f(L, value)
    if (u.type === gl.INT || u.type === gl.BOOL || u.type === gl.UNSIGNED_INT)
      return gl.uniform1i(L, value)
    throw new Error(`Uniform '${name}' is not scalar (type 0x${u.type.toString(16)})`)
  }
  const v = value instanceof Int32Array ? value : Float32Array.from(value)
  switch (u.type) {
    case gl.FLOAT:       return gl.uniform1fv(L, v as Float32Array)
    case gl.FLOAT_VEC2:  return gl.uniform2fv(L, v as Float32Array)
    case gl.FLOAT_VEC3:  return gl.uniform3fv(L, v as Float32Array)
    case gl.FLOAT_VEC4:  return gl.uniform4fv(L, v as Float32Array)
    case gl.INT:
    case gl.BOOL:        return gl.uniform1iv(L, Int32Array.from(value as ArrayLike<number>))
    case gl.INT_VEC2:    return gl.uniform2iv(L, Int32Array.from(value as ArrayLike<number>))
    case gl.INT_VEC3:    return gl.uniform3iv(L, Int32Array.from(value as ArrayLike<number>))
    case gl.INT_VEC4:    return gl.uniform4iv(L, Int32Array.from(value as ArrayLike<number>))
    case gl.FLOAT_MAT2:  return gl.uniformMatrix2fv(L, false, v as Float32Array)
    case gl.FLOAT_MAT3:  return gl.uniformMatrix3fv(L, false, v as Float32Array)
    case gl.FLOAT_MAT4:  return gl.uniformMatrix4fv(L, false, v as Float32Array)
    default:
      throw new Error(`Uniform '${name}': unhandled type 0x${u.type.toString(16)}`)
  }
}
