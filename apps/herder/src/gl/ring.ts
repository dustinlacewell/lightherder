/* A texture history ring — a signal with its recent past.
   Every hop through a real device is at least a frame of delay;
   the converters add more. The ring is where those taps live. */

import type { GLC } from './context';

export function makeTex(g: GLC, w: number, h: number): WebGLTexture {
  const gl = g.gl;
  const t = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, g.ifmt, w, h, 0, gl.RGBA, g.type, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}

export class Ring {
  private texs: WebGLTexture[] = [];
  private idx = 0;

  constructor(private g: GLC, readonly w: number, readonly h: number, depth: number) {
    for (let i = 0; i < depth; i++) this.texs.push(makeTex(g, w, h));
  }

  /** last committed frame */
  get current(): WebGLTexture { return this.texs[this.idx]; }

  /** k frames back (0 = current) */
  at(k: number): WebGLTexture {
    const n = this.texs.length;
    return this.texs[(this.idx - (k % n) + n) % n];
  }

  /** the texture the next frame should render into */
  get next(): WebGLTexture { return this.texs[(this.idx + 1) % this.texs.length]; }

  advance(): void { this.idx = (this.idx + 1) % this.texs.length; }

  clearAll(fbo: WebGLFramebuffer): void {
    const gl = this.g.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    for (const t of this.texs) {
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
      gl.viewport(0, 0, this.w, this.h);
      /* alpha 0.25 = AGC gain 1.0 for camera rings (alpha carries the state) */
      gl.clearColor(0, 0, 0, 0.25);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /** free the GPU textures — call before dropping the ring on a resize */
  dispose(): void {
    for (const t of this.texs) this.g.gl.deleteTexture(t);
    this.texs = [];
  }
}
