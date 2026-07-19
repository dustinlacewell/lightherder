/* Painting the faces onto the overlay canvas, every rAF.

   The glass is ONE canvas above the whole editor, so painting alone
   can't reproduce DOM stacking — any pixel it owns covers every node.
   So faces draw top-down (React Flow z, then DOM order) and each
   node's whole panel is stamped into the stencil after its face:
   lower faces can't paint where a higher device sits, and that
   device's DOM shows through the untouched glass instead.

   The blitter owns the screen-space pass and the popped-out preview
   sink; the engine hands it a texture lookup and the clock. */

import type { GLC } from '../gl/context';
import { makeProgram, type Prog } from '../gl/program';
import { QUAD_VERT, SCREEN_FRAG } from '../gl/shaders';
import type { PatchNode } from '../patch';
import { mirror, stage, type PopoutSink } from '../runtime';

/** the engine's side of the bargain: a node's on-screen texture,
    scrubbed `tap` frames back for ring-bearing devices; null when the
    node has nothing to show */
export type TexOf = (n: PatchNode, tap: number) => WebGLTexture | null;

export class Blitter {
  private scrP: Prog;
  private vao: WebGLVertexArrayObject;
  private popoutStamp = '';

  constructor(private g: GLC) {
    this.scrP = makeProgram(g, QUAD_VERT, SCREEN_FRAG);
    this.vao = g.gl.createVertexArray()!;
  }

  blit(now: number, viewW: number, viewH: number, texOf: TexOf, simTime: number, ticks: number): void {
    const gl = this.g.gl;
    const byId = new Map(mirror.nodes.map(n => [n.id, n]));

    /* the popout draws first — it borrows the glass canvas as scratch
       space, same task, before the face pass clears it */
    const pv = stage.preview;
    if (pv.popout && pv.nodeId) {
      if (pv.popout.win.closed) stage.preview.popout = null;
      else {
        const n = byId.get(pv.nodeId);
        if (n) this.stepPopout(pv.popout, n, pv.tap, texOf, simTime, ticks);
      }
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, viewW, viewH);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
    gl.useProgram(this.scrP.p);
    const U = this.scrP.u;
    gl.uniform2f(U.uView, viewW, viewH);
    gl.uniform1f(U.uTime, now * 0.001);
    gl.uniform1i(U.uTex, 0);
    gl.bindVertexArray(this.vao);

    const dpr = viewW / Math.max(1, window.innerWidth);

    gl.enable(gl.STENCIL_TEST);
    gl.stencilFunc(gl.EQUAL, 0, 0xff);
    gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);

    /* the preview monitor mirrors whichever node is pinned to it,
       scrubbed back `tap` frames while the debugger has it frozen.
       Its face draws first (nothing sits above it on the glass), then
       its panel and the other shields go opaque to everything below */
    if (pv.el?.isConnected && pv.nodeId) {
      const n = byId.get(pv.nodeId);
      if (n) this.blitRect(U, pv.el, n, dpr, texOf, pv.tap);
    }
    for (const el of stage.shields) {
      if (!el.isConnected) { stage.shields.delete(el); continue; }
      this.stencilRect(el.getBoundingClientRect(), dpr, viewH);
    }

    for (const f of this.facesTopDown(byId)) {
      this.blitRect(U, f.el, f.n, dpr, texOf);
      this.stencilRect(f.wrap.getBoundingClientRect(), dpr, viewH);
    }
    gl.disable(gl.STENCIL_TEST);
  }

  /* ---- the popped-out preview ------------------------------------------- */
  /* The child window's canvas is drawn by US (same origin, same
     thread): the frame renders into the top-left of the glass canvas
     and ctx.drawImage copies it across — a GPU→GPU blit in a
     hardware-accelerated browser. No readPixels, no bus round-trip,
     so a 4K popout costs two quads. It runs before the face pass
     clears the glass, inside the same task, so the intermediate never
     composites to the screen; frames are produced at TICK rate (the
     content can't change faster). Sharpness is bounded by the glass
     canvas (the scratch surface) — a popout larger than the main
     window upscales. */

  private stepPopout(popout: PopoutSink, n: PatchNode, tap: number, texOf: TexOf, simTime: number, ticks: number): void {
    const gl = this.g.gl;
    const glass = gl.canvas as HTMLCanvasElement;
    if (popout.w < 2 || popout.h < 2 || glass.width < 2 || glass.height < 2) return;
    const s = Math.min(1, glass.width / popout.w, glass.height / popout.h);
    const pw = Math.max(2, Math.floor(popout.w * s));
    const ph = Math.max(2, Math.floor(popout.h * s));

    const stamp = `${n.id}|${pw}x${ph}|${popout.w}x${popout.h}|${ticks}|${tap}`;
    if (stamp === this.popoutStamp) return;       // nothing new to show
    const tex = texOf(n, tap);
    if (!tex) return;
    this.popoutStamp = stamp;

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, glass.width, glass.height);
    gl.useProgram(this.scrP.p);
    const U = this.scrP.u;
    gl.uniform2f(U.uView, glass.width, glass.height);
    gl.uniform1f(U.uTime, simTime);
    gl.uniform1i(U.uTex, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform2f(U.uCenter, pw / 2, ph / 2);
    gl.uniform2f(U.uHalf, pw / 2, ph / 2);
    gl.uniform2f(U.uPx, pw, ph);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    popout.ctx.drawImage(glass, 0, 0, pw, ph, 0, 0, popout.w, popout.h);
  }

  /* the device faces, topmost first — React Flow's z (selection lifts
     a node to 1000), DOM order breaking ties exactly as CSS paints */
  private facesTopDown(byId: Map<string, PatchNode>): { n: PatchNode; el: HTMLElement; wrap: HTMLElement }[] {
    const out: { n: PatchNode; el: HTMLElement; wrap: HTMLElement; z: number }[] = [];
    for (const [id, el] of stage.faces) {
      if (!el.isConnected) { stage.faces.delete(id); continue; }
      const n = byId.get(id);
      if (!n) continue;
      const wrap = (el.closest('.react-flow__node') as HTMLElement) ?? el;
      out.push({ n, el, wrap, z: Number(wrap.style.zIndex) || 0 });
    }
    out.sort((a, b) => b.z - a.z
      || ((a.wrap.compareDocumentPosition(b.wrap) & Node.DOCUMENT_POSITION_FOLLOWING) ? 1 : -1));
    return out;
  }

  /* stamp a client rect into the stencil: pixels no later face may own */
  private stencilRect(r: DOMRect, dpr: number, viewH: number): void {
    const gl = this.g.gl;
    const w = Math.ceil(r.width * dpr), h = Math.ceil(r.height * dpr);
    if (w < 1 || h < 1) return;
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(Math.floor(r.left * dpr), Math.floor(viewH - r.bottom * dpr), w, h);
    gl.clearStencil(1);
    gl.clear(gl.STENCIL_BUFFER_BIT);
    gl.clearStencil(0);
    gl.disable(gl.SCISSOR_TEST);
  }

  private blitRect(U: Record<string, WebGLUniformLocation>, el: HTMLElement, n: PatchNode, dpr: number, texOf: TexOf, tap = 0): void {
    const gl = this.g.gl;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.right < 0 || r.bottom < 0 || r.left > window.innerWidth || r.top > window.innerHeight) return;
    const tex = texOf(n, tap);
    if (!tex) return;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform2f(U.uCenter, (r.left + r.width / 2) * dpr, (r.top + r.height / 2) * dpr);
    gl.uniform2f(U.uHalf, r.width / 2 * dpr, r.height / 2 * dpr);
    gl.uniform2f(U.uPx, r.width * dpr, r.height * dpr);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}
