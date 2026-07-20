/* A source's GPU texture with sized upload: storage allocates only
   when the frame size changes; every other frame streams into the
   existing allocation via texSubImage2D. Video sources upload every
   tick — re-allocating driver storage per frame (what a bare
   texImage2D does) is churn the driver never amortizes. */

export class FrameTex {
  readonly tex: WebGLTexture;
  private w = 0;
  private h = 0;

  constructor(private gl: WebGL2RenderingContext) {
    this.tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    /* the dark room, until the first real frame lands (w/h stay 0 so
       that frame allocates at its own size) */
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([5, 4, 3, 255]));
  }

  upload(src: TexImageSource): void {
    const gl = this.gl;
    const [w, h] = sizeOf(src);
    if (w < 1 || h < 1) return;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    if (w === this.w && h === this.h) {
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, src);
    } else {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
      this.w = w; this.h = h;
    }
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  }
}

function sizeOf(src: TexImageSource): [number, number] {
  return src instanceof HTMLVideoElement
    ? [src.videoWidth, src.videoHeight]
    : [(src as { width: number }).width, (src as { height: number }).height];
}
