/*
 * Grow-on-demand instance buffer.
 *
 * Wraps a `WebGLBuffer` plus a backing `Float32Array` whose capacity
 * doubles on `ensureCapacity(n)` whenever `n` exceeds the current
 * slot count. Owning the backing array means the caller can write
 * directly into `float32` without going through a slow per-write GL
 * call; upload happens in one shot via the caller's `bufferSubData`.
 *
 * Usage:
 *   const buf = new DynamicInstanceBuffer(gl, glBuf, 1024, 8)  // 8 floats per instance
 *   buf.ensureCapacity(needed)
 *   const data = buf.float32                  // write directly
 *   gl.bufferSubData(gl.ARRAY_BUFFER, 0, data, 0, needed * 8)
 */

export class DynamicInstanceBuffer {
  private data: Float32Array
  private bytes: Uint8Array
  private capacity: number

  constructor(
    private readonly gl: WebGL2RenderingContext,
    private readonly buf: WebGLBuffer,
    initialCapacity: number,
    private readonly floatsPerInstance: number,
  ) {
    this.capacity = initialCapacity
    this.data = new Float32Array(initialCapacity * floatsPerInstance)
    this.bytes = new Uint8Array(this.data.buffer)
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, this.data.byteLength, gl.DYNAMIC_DRAW)
  }

  /**
   * Grow to at least `needed` slots if necessary. Doubles capacity
   * until it fits — amortised O(1) per append. Re-allocates the GL
   * buffer with the new size when growth happens.
   */
  ensureCapacity(needed: number): void {
    if (needed <= this.capacity) return
    while (this.capacity < needed) this.capacity *= 2
    const newData = new Float32Array(this.capacity * this.floatsPerInstance)
    newData.set(this.data)
    this.data = newData
    this.bytes = new Uint8Array(newData.buffer)
    const gl = this.gl
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf)
    gl.bufferData(gl.ARRAY_BUFFER, this.data.byteLength, gl.DYNAMIC_DRAW)
  }

  /** Live `Float32Array` view of the staging buffer. Mutate in place. */
  get float32(): Float32Array { return this.data }
  /** Live `Uint8Array` view of the same underlying memory. */
  get uint8(): Uint8Array { return this.bytes }
  /** The wrapped GL buffer object. */
  get buffer(): WebGLBuffer { return this.buf }
  /** Current slot capacity. */
  get slots(): number { return this.capacity }

  dispose(): void {
    this.gl.deleteBuffer(this.buf)
  }
}
