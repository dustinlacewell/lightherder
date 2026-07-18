/*
 * Pass interface.
 *
 * A renderer is an ordered list of passes. Each pass owns its program,
 * its uniforms, and any FBOs it writes to. It exposes `draw()` (per
 * frame) and `dispose()` (lifecycle end). Some passes also need
 * `resize(w, h)` when the canvas changes — that's a separate optional
 * interface to avoid forcing every pass to implement it.
 *
 * The interface is intentionally minimal: it's a *convention*, not a
 * framework. Concrete pass classes are free to take whatever extra
 * parameters they need in `draw()` (camera matrices, tick numbers,
 * etc.). The base interface just guarantees that `dispose()` exists.
 *
 * If a renderer wants to walk an array of passes uniformly with a
 * single shared draw context, that's an application-level decision —
 * see `SimplePassList` for one way to do that.
 */

export interface Pass {
  /** Free GL resources owned by this pass. */
  dispose(): void
}

export interface ResizablePass extends Pass {
  resize(width: number, height: number): void
}

/**
 * Optional helper: a renderer that walks an ordered list of passes
 * with a single typed draw context. Most non-trivial renderers will
 * outgrow this — they need conditional pass enabling, multi-target
 * dispatch, or pass-specific arguments — but for simple linear
 * pipelines this saves boilerplate.
 *
 * The context type is yours to define. A typical context bundles the
 * camera matrix, the wall-clock tick, the viewport dimensions, and
 * any shared resources the passes look up by name.
 */
export interface DrawablePass<TCtx> extends Pass {
  draw(ctx: TCtx): void
}

export class SimplePassList<TCtx> {
  constructor(private readonly passes: Array<DrawablePass<TCtx>>) {}
  draw(ctx: TCtx): void {
    for (const p of this.passes) p.draw(ctx)
  }
  dispose(): void {
    for (const p of this.passes) p.dispose()
  }
}
