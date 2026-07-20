/* The device passes — pure GL. Runs one camera / monitor / mixer step
   given target and source textures plus fully-resolved params; knows
   nothing about the graph, the runtime, or who feeds whom.

   Each pass is a FullscreenPass: shader-side uniform names are the
   only declaration, reflection finds them, and a step is one dict. */

import { FullscreenPass, createTexture2D, toTexture, type UniformValues } from '@ldlework/gl';
import type { GLC } from './context';
import { FX } from '../fx';
import { CAMERA_FRAG, COPY_FRAG, MIXER_FRAG, MONITOR_FRAG } from './shaders';

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

  private cam: FullscreenPass;
  private mon: FullscreenPass;
  private mix: FullscreenPass;
  private fx: Map<string, FullscreenPass>;
  private cp: FullscreenPass;
  private w = 0;
  private h = 0;

  constructor(private g: GLC) {
    const gl = g.gl;
    this.cam = new FullscreenPass(gl, CAMERA_FRAG);
    this.mon = new FullscreenPass(gl, MONITOR_FRAG);
    this.mix = new FullscreenPass(gl, MIXER_FRAG);
    this.fx = new Map(Object.entries(FX).map(([k, d]) => [k, new FullscreenPass(gl, d.frag)]));
    this.cp = new FullscreenPass(gl, COPY_FRAG);
    this.fbo = gl.createFramebuffer()!;
    this.black = createTexture2D(gl, {
      width: 1, height: 1,
      internalFormat: gl.RGBA8, format: gl.RGBA, type: gl.UNSIGNED_BYTE,
      data: new Uint8Array([0, 0, 0, 255]),
    });
  }

  /** the loop resolution the passes render at */
  setSize(w: number, h: number): void {
    this.w = w;
    this.h = h;
  }

  camera(target: WebGLTexture, src: WebGLTexture, prevSelf: WebGLTexture, p: CameraParams, simTime: number): void {
    this.run(this.cam, target, {
      uSrc: src, uPrev: prevSelf,
      uRes: [this.w, this.h], uTime: simTime,
      uRot: p.rot, uPush: p.zoom, uOff: [p.offx, p.offy],
      uFocus: p.focus, uSharpen: p.sharpen,
      uExposure: p.exposure, uAgc: p.agc,
      uCContrast: p.contrast, uCSat: p.sat,
      uFringe: p.fringe, uBleed: p.bleed,
      uKnee: p.knee, uGrain: p.grain,
    });
  }

  /** one simple 1-in effect step — the pass is picked by kind, the
      params arrive as ready-made uniforms */
  effect(kind: string, target: WebGLTexture, src: WebGLTexture, values: UniformValues): void {
    const pass = this.fx.get(kind);
    if (!pass) throw new Error(`no effect pass for kind '${kind}'`);
    this.run(pass, target, { uSrc: src, uRes: [this.w, this.h], ...values });
  }

  /** verbatim blit — the delay line's record and playback heads */
  copy(target: WebGLTexture, src: WebGLTexture): void {
    this.run(this.cp, target, { uSrc: src });
  }

  monitor(target: WebGLTexture, src: WebGLTexture, prevSelf: WebGLTexture, p: ScreenParams): void {
    this.run(this.mon, target, {
      uSrc: src, uPrevSelf: prevSelf,
      ...this.screenUniforms(p),
    });
  }

  mixer(target: WebGLTexture, a: WebGLTexture, b: WebGLTexture, prevSelf: WebGLTexture, mode: number, keylvl: number, p: ScreenParams): void {
    this.run(this.mix, target, {
      uA: a, uB: b, uPrevSelf: prevSelf,
      uMode: mode, uKeyLvl: keylvl,
      ...this.screenUniforms(p),
    });
  }

  private screenUniforms(p: ScreenParams): UniformValues {
    return {
      uPersist: p.persist, uBright: p.bright, uContrast: p.contrast,
      uSat: p.sat, uHue: p.hue,
      uRes: [this.w, this.h], uSpark: p.spark,
    };
  }

  private run(pass: FullscreenPass, target: WebGLTexture, values: UniformValues): void {
    toTexture(this.g.gl, this.fbo, target, this.w, this.h, () => pass.draw(values));
  }
}
