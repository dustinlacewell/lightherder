/* WebGL2 boot. Half-float buffers when the GPU offers them —
   the loop degrades gracefully to RGBA8 otherwise. */

export interface GLC {
  gl: WebGL2RenderingContext;
  ifmt: number;   // internal format for loop textures
  type: number;   // texel type
}

export function bootGL(canvas: HTMLCanvasElement): GLC {
  /* alpha: the canvas is a transparent overlay above the node editor —
     only the device faces get painted; everything else stays clear.
     stencil: the blitter stamps node panels into it so faces respect
     DOM stacking (a lower face never paints over a higher device). */
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: true, stencil: true, preserveDrawingBuffer: false });
  if (!gl) throw new Error('This device offered no WebGL2 context — the glass stays dark here. Try a recent browser with hardware acceleration on.');
  const hasFloat = !!gl.getExtension('EXT_color_buffer_float');
  return {
    gl,
    ifmt: hasFloat ? gl.RGBA16F : gl.RGBA8,
    type: hasFloat ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE,
  };
}
