/* The media device — the source. Boots with a generated pane of
   stained glass (the image from the first video); accepts a dropped
   image or video, and remembers it across reloads (see mediaStore.ts).
   Its *camera* is a loop in the engine, not here. */

import type { GLC } from '../../gl/context';
import { loadStoredMedia, storeMedia } from '../../persist';

export class MediaSource {
  readonly tex: WebGLTexture;
  private video: HTMLVideoElement | null = null;

  constructor(private g: GLC, private nodeId: string) {
    const gl = g.gl;
    this.tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.upload(paintStainedGlass());
    loadStoredMedia(nodeId).then(f => { if (f) this.load(f, false); });
  }

  /** re-upload each frame while a video is playing */
  update(): void {
    if (this.video && this.video.readyState >= 2 && !this.video.paused) this.upload(this.video);
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
      this.upload(cv);
    }
    if (persist) storeMedia(this.nodeId, file).catch(() => { /* storage full / denied — keep running, just don't remember it */ });
  }

  private upload(src: TexImageSource): void {
    const gl = this.g.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
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
