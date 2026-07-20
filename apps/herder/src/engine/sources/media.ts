/* The media device — the source. Boots with a generated pane of
   stained glass (the image from the first video); accepts a dropped
   image or video, and remembers it across reloads (see mediaStore.ts).
   Its *camera* is a loop in the engine, not here. */

import type { GLC } from '../context';
import { dropStoredMedia, loadStoredMedia, loadStoredMediaUrl, storeMedia, storeMediaUrl } from '../../persist';
import { FrameTex } from './frameTex';

export class MediaSource {
  readonly tex: WebGLTexture;
  private frame: FrameTex;
  private video: HTMLVideoElement | null = null;

  constructor(g: GLC, private nodeId: string) {
    this.frame = new FrameTex(g.gl);
    this.tex = this.frame.tex;
    this.frame.upload(paintStainedGlass());
    loadStoredMedia(nodeId).then(f => { if (f) this.load(f, false); });
    /* a stored blob wins if both exist (shouldn't — load/loadUrl each
       clear the other's record) */
    loadStoredMediaUrl(nodeId).then(url => { if (url) this.loadUrl(url, false); });
  }

  /** re-upload each frame while a video is playing */
  update(): void {
    if (this.video && this.video.readyState >= 2 && !this.video.paused) this.frame.upload(this.video);
  }

  async load(file: Blob, persist = true): Promise<void> {
    if (file.type.startsWith('video/')) {
      const v = document.createElement('video');
      v.src = URL.createObjectURL(file);
      v.muted = true;
      v.loop = true;
      v.playsInline = true;
      await v.play();
      this.video = v;
    } else if (file.type.startsWith('image/')) {
      this.video = null;
      const bmp = await createImageBitmap(file);
      const cv = document.createElement('canvas');
      cv.width = 960; cv.height = 540;
      const cx = cv.getContext('2d')!;
      const s = Math.max(cv.width / bmp.width, cv.height / bmp.height);
      cx.drawImage(bmp, (cv.width - bmp.width * s) / 2, (cv.height - bmp.height * s) / 2, bmp.width * s, bmp.height * s);
      this.frame.upload(cv);
    }
    if (persist) {
      storeMedia(this.nodeId, file).catch(() => { /* storage full / denied — keep running, just don't remember it */ });
      storeMediaUrl(this.nodeId, null);
    }
  }

  /** point this device at a remote video file — same upload-per-tick
      shape as a dropped video, just sourced from a URL instead of an
      object URL over a local Blob. `crossOrigin` is required for the
      GPU to read the frame at all; a host without permissive CORS
      headers fails the texImage2D upload (browser policy, not ours). */
  async loadUrl(url: string, persist = true): Promise<void> {
    const v = document.createElement('video');
    v.crossOrigin = 'anonymous';
    v.src = url;
    v.muted = true;
    v.loop = true;
    v.playsInline = true;
    await v.play();
    this.video = v;
    if (persist) {
      storeMediaUrl(this.nodeId, url);
      dropStoredMedia(this.nodeId).catch(() => { /* best-effort */ });
    }
  }

}

/* a friend's pane of stained glass, remembered in voronoi */
function paintStainedGlass(): HTMLCanvasElement {
  const W = 480, H = 270;
  const seeds = Array.from({ length: 42 }, () => ({
    x: Math.random() * W,
    y: Math.random() * H,
    hue: Math.random() * 360,
    lum: 0.35 + Math.random() * 0.35,
  }));
  const img = new ImageData(W, H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let d1 = 1e9, d2 = 1e9, best = seeds[0];
      for (const s of seeds) {
        const d = (x - s.x) ** 2 + (y - s.y) ** 2;
        if (d < d1) { d2 = d1; d1 = d; best = s; }
        else if (d < d2) d2 = d;
      }
      const lead = Math.sqrt(d2) - Math.sqrt(d1) < 3.0;
      const i = (y * W + x) * 4;
      if (lead) { img.data[i] = 14; img.data[i + 1] = 12; img.data[i + 2] = 10; }
      else {
        const [r, g, b] = hsl(best.hue, 0.75, best.lum * (0.85 + 0.3 * Math.sin((x + y) * 0.05)));
        img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b;
      }
      img.data[i + 3] = 255;
    }
  }
  const small = document.createElement('canvas');
  small.width = W; small.height = H;
  small.getContext('2d')!.putImageData(img, 0, 0);
  const cv = document.createElement('canvas');
  cv.width = 960; cv.height = 540;
  const cx = cv.getContext('2d')!;
  cx.imageSmoothingEnabled = true;
  cx.drawImage(small, 0, 0, cv.width, cv.height);
  return cv;
}

function hsl(h: number, s: number, l: number): [number, number, number] {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0) * 255 | 0, f(8) * 255 | 0, f(4) * 255 | 0];
}
