/* The draw device — a hand-painted source. A 960×540 canvas the UI
   strokes segment by segment; every stroke re-uploads the texture the
   loops read. The picture survives reloads through the same store the
   media device uses (one PNG per node id). */

import type { GLC } from '../../gl/context';
import { loadStoredMedia, storeMedia } from '../../persist';

const W = 960, H = 540;

export class DrawSource {
  readonly tex: WebGLTexture;
  private cv: HTMLCanvasElement;
  private cx: CanvasRenderingContext2D;

  constructor(private g: GLC, private nodeId: string) {
    const gl = g.gl;
    this.tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    this.cv = document.createElement('canvas');
    this.cv.width = W;
    this.cv.height = H;
    this.cx = this.cv.getContext('2d')!;
    this.cx.lineCap = 'round';
    this.cx.lineJoin = 'round';
    this.cx.fillStyle = '#000';
    this.cx.fillRect(0, 0, W, H);
    this.upload();
    loadStoredMedia(nodeId).then(async f => {
      if (!f) return;
      const bmp = await createImageBitmap(f);
      this.cx.drawImage(bmp, 0, 0, W, H);
      this.upload();
    }).catch(() => { /* nothing remembered — stay black */ });
  }

  /** one stroke segment, in normalized face coordinates (y down) */
  stroke(x0: number, y0: number, x1: number, y1: number, hue: number, size: number): void {
    const c = this.cx;
    c.strokeStyle = c.fillStyle = `hsl(${hue}, 100%, 55%)`;
    if (x0 === x1 && y0 === y1) {
      /* a zero-length round-capped line paints nothing — dot it */
      c.beginPath();
      c.arc(x0 * W, y0 * H, size / 2, 0, Math.PI * 2);
      c.fill();
    } else {
      c.lineWidth = size;
      c.beginPath();
      c.moveTo(x0 * W, y0 * H);
      c.lineTo(x1 * W, y1 * H);
      c.stroke();
    }
    this.upload();
  }

  /** the stroke ended — remember the picture for next boot */
  commit(): void {
    this.cv.toBlob(b => {
      if (b) storeMedia(this.nodeId, b).catch(() => { /* storage full / denied — keep running */ });
    }, 'image/png');
  }

  clear(): void {
    this.cx.fillStyle = '#000';
    this.cx.fillRect(0, 0, W, H);
    this.upload();
    this.commit();
  }

  /** the picture as it stands, as a PNG — the live snapshot the join
      hand-off ships, fresher than the last committed pointer-up */
  snapshot(): Promise<Blob | null> {
    return new Promise(resolve => this.cv.toBlob(b => resolve(b), 'image/png'));
  }

  private upload(): void {
    const gl = this.g.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.cv);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  }
}
