/* The device passes — pure GL. Runs one camera / monitor / mixer step
   given target and source textures plus fully-resolved params; knows
   nothing about the graph, the runtime, or who feeds whom. */

import type { GLC } from '../gl/context';
import { makeProgram, type Prog } from '../gl/program';
import { CAMERA_FRAG, FULL_VERT, MIXER_FRAG, MONITOR_FRAG } from '../gl/shaders';

export interface CameraParams {
  rot: number; zoom: number; offx: number; offy: number;
  focus: number; sharpen: number; exposure: number; agc: number;
  contrast: number; sat: number; fringe: number; bleed: number;
  knee: number; grain: number;
}

export interface ScreenParams {
  persist: number; bright: number; contrast: number; sat: number; hue: number;
  spark: [number, number, number, number];
}

export class DeviceRenderer {
  /** the shared render-target framebuffer (rings clear through it too) */
  readonly fbo: WebGLFramebuffer;
  /** what an unwired input sees: the dark room */
  readonly black: WebGLTexture;

  private camP: Prog;
  private monP: Prog;
  private mixP: Prog;
  private vao: WebGLVertexArrayObject;
  private w = 0;
  private h = 0;

  constructor(private g: GLC) {
    const gl = g.gl;
    this.camP = makeProgram(g, FULL_VERT, CAMERA_FRAG);
    this.monP = makeProgram(g, FULL_VERT, MONITOR_FRAG);
    this.mixP = makeProgram(g, FULL_VERT, MIXER_FRAG);
    this.vao = gl.createVertexArray()!;
    this.fbo = gl.createFramebuffer()!;

    this.black = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.black);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  }

  /** the loop resolution the passes render at */
  setSize(w: number, h: number): void {
    this.w = w;
    this.h = h;
  }

  camera(target: WebGLTexture, src: WebGLTexture, prevSelf: WebGLTexture, p: CameraParams, simTime: number): void {
    const gl = this.g.gl;
    this.bindTarget(target);
    gl.useProgram(this.camP.p);
    const U = this.camP.u;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, src);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, prevSelf);
    gl.uniform1i(U.uSrc, 0);
    gl.uniform1i(U.uPrev, 1);
    gl.uniform2f(U.uRes, this.w, this.h);
    gl.uniform1f(U.uTime, simTime);
    gl.uniform1f(U.uRot, p.rot);
    gl.uniform1f(U.uPush, p.zoom);
    gl.uniform2f(U.uOff, p.offx, p.offy);
    gl.uniform1f(U.uFocus, p.focus);
    gl.uniform1f(U.uSharpen, p.sharpen);
    gl.uniform1f(U.uExposure, p.exposure);
    gl.uniform1f(U.uAgc, p.agc);
    gl.uniform1f(U.uCContrast, p.contrast);
    gl.uniform1f(U.uCSat, p.sat);
    gl.uniform1f(U.uFringe, p.fringe);
    gl.uniform1f(U.uBleed, p.bleed);
    gl.uniform1f(U.uKnee, p.knee);
    gl.uniform1f(U.uGrain, p.grain);
    this.draw();
  }

  monitor(target: WebGLTexture, src: WebGLTexture, prevSelf: WebGLTexture, p: ScreenParams): void {
    const gl = this.g.gl;
    this.bindTarget(target);
    gl.useProgram(this.monP.p);
    const U = this.monP.u;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, src);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, prevSelf);
    gl.uniform1i(U.uSrc, 0);
    gl.uniform1i(U.uPrevSelf, 1);
    this.screenUniforms(U, p);
    this.draw();
  }

  mixer(target: WebGLTexture, a: WebGLTexture, b: WebGLTexture, prevSelf: WebGLTexture, mode: number, keylvl: number, p: ScreenParams): void {
    const gl = this.g.gl;
    this.bindTarget(target);
    gl.useProgram(this.mixP.p);
    const U = this.mixP.u;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, a);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, b);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, prevSelf);
    gl.uniform1i(U.uA, 0);
    gl.uniform1i(U.uB, 1);
    gl.uniform1i(U.uPrevSelf, 2);
    gl.uniform1f(U.uMode, mode);
    gl.uniform1f(U.uKeyLvl, keylvl);
    this.screenUniforms(U, p);
    this.draw();
  }

  private screenUniforms(U: Record<string, WebGLUniformLocation>, p: ScreenParams): void {
    const gl = this.g.gl;
    gl.uniform1f(U.uPersist, p.persist);
    gl.uniform1f(U.uBright, p.bright);
    gl.uniform1f(U.uContrast, p.contrast);
    gl.uniform1f(U.uSat, p.sat);
    gl.uniform1f(U.uHue, p.hue);
    gl.uniform2f(U.uRes, this.w, this.h);
    gl.uniform4f(U.uSpark, ...p.spark);
  }

  private bindTarget(tex: WebGLTexture): void {
    const gl = this.g.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.viewport(0, 0, this.w, this.h);
  }

  private draw(): void {
    const gl = this.g.gl;
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}
