/* The stage — where the DOM and the glass canvas meet. The UI
   registers the elements whose rects matter to the blitter: each
   device's face well, the fixed panes faces must never paint over
   (shields), and the preview monitor with its optional popped-out
   window. The blitter reads rects from here every rAF. */

export interface PopoutSink { win: Window; ctx: CanvasRenderingContext2D; w: number; h: number }

export const stage = {
  faces: new Map<string, HTMLElement>(), // nodeId → the face div the blitter tracks
  /* fixed panes that sit above the bench but below the glass (preview,
     MIDI log): the blitter stencils their rects so node faces never
     paint over them */
  shields: new Set<HTMLElement>(),
  /* the preview monitor: a pinned well showing one node's output —
     `tap` scrubs its ring history while the bench is frozen. `popout`
     is a second sink: a same-origin child window's canvas, which the
     ENGINE paints directly via drawImage (GPU→GPU) each tick */
  preview: {
    el: null as HTMLElement | null,
    nodeId: null as string | null,
    tap: 0,
    popout: null as PopoutSink | null,
  },
};

/** a face well mounted (el) or unmounted (null) */
export function setFace(id: string, el: HTMLElement | null): void {
  if (el) stage.faces.set(id, el);
  else stage.faces.delete(id);
}

/** register a fixed pane the blitter must stencil out */
export function addShield(el: HTMLElement): void {
  stage.shields.add(el);
}

/** a node left the graph — drop its face registrations */
export function dropFacesUnder(id: string): void {
  const under = (k: string) => k === id || k.startsWith(id + '/');
  for (const k of [...stage.faces.keys()]) if (under(k)) stage.faces.delete(k);
}
