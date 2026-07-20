/* The webcam device — a live camera feed as a source. Same
   upload-per-tick shape as a media node's video, but there's nothing
   to persist across a reload: a stream isn't a file, so every boot
   starts idle and waits for the device to be started again. */

import type { GLC } from '../context';
import { FrameTex } from './frameTex';

export class WebcamSource {
  readonly tex: WebGLTexture;
  private frame: FrameTex;
  private video: HTMLVideoElement | null = null;
  private stream: MediaStream | null = null;

  constructor(g: GLC) {
    this.frame = new FrameTex(g.gl);
    this.tex = this.frame.tex;
  }

  get live(): boolean { return this.video !== null; }

  /** ask for the camera and start streaming — must run from a user
      gesture (the face click), same as any getUserMedia call. */
  async start(): Promise<void> {
    if (this.video) return;
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    const v = document.createElement('video');
    v.srcObject = stream;
    v.muted = true;
    v.playsInline = true;
    await v.play();
    this.stream = stream;
    this.video = v;
  }

  stop(): void {
    this.video = null;
    this.stream?.getTracks().forEach(t => t.stop());
    this.stream = null;
  }

  /** re-upload each frame while the camera is running */
  update(): void {
    if (this.video && this.video.readyState >= 2) this.frame.upload(this.video);
  }

  dispose(): void {
    this.stop();
  }
}
