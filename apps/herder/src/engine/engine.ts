/* The bench, per tick:  every processing device (camera, monitor,
   mixer) renders its next frame from its inputs' PREVIOUS frames, then
   every ring advances together. Order is irrelevant and cycles are
   natural — which is the whole point: a feedback loop is just a cycle
   in the wiring.

   The chain ticks at VIDEO rate — the Video global, device frames per
   second — not at requestAnimationFrame rate, and every hop costs at
   least one video frame: each device reads its sources' last committed
   frames (a monitor's Delay knob reaches further back — the converters
   in its path). A hop is an imperceptible frame (the bench feels live)
   while a LAP is the sum of the hops — and that slowness is the
   phenomenon: a source stamps into a loop once per lap, so a lit dot
   becomes discrete stepped copies along its orbit instead of welding
   into a smear. Switches are pure routing (a cut is instant); dials
   are values, not video. The faces still blit to the overlay canvas
   every rAF between ticks.

   The engine is the ORCHESTRATOR: it owns the rings and sources and
   the clock, and delegates — the tick's wiring index (wiring.ts), the
   dial glides (dials.ts), effective params (params.ts), the GL device
   passes (renderer.ts), and the overlay painting (blitter.ts). */

import type { GLC } from '../gl/context';
import { Ring } from '../gl/ring';
import { RES_STEPS, type PatchNode } from '../patch';
import { dropStoredMediaUnder } from '../persist';
import { flushLive, mirror, sampleSpark, transport } from '../runtime';
import { Blitter } from './blitter';
import { DialBank } from './dials';
import { clampInt, paramValue } from './params';
import { DeviceRenderer, type CameraParams, type ScreenParams } from './renderer';
import { DrawSource } from './sources/draw';
import { MediaSource } from './sources/media';
import { Wiring } from './wiring';

const RING_DEPTH = 6;

const isProc = (n: PatchNode) => n.type === 'camera' || n.type === 'monitor' || n.type === 'mixer';

export class Engine {
  private rings = new Map<string, Ring>();
  private media = new Map<string, MediaSource>();
  private draws = new Map<string, DrawSource>();

  private renderer: DeviceRenderer;
  private blitter: Blitter;
  private dials = new DialBank();
  /* rebuilt each tick from the mirror */
  private wiring = new Wiring([], []);
  /* who has already rendered this tick — a delay-0 device reads its
     producer's JUST-WRITTEN frame, which only exists once it has run */
  private stepped = new Set<string>();

  private texW = RES_STEPS[0][0];
  private texH = RES_STEPS[0][1];
  private nextTick = 0;

  /** the bench's own clock: ticks since boot, and seconds of SIM time
      (advancing 1/video per tick) — so sparks age per tick, not per
      wall-second, and the step-debugger can move one frame at a time */
  ticks = 0;
  simTime = 0;

  constructor(private g: GLC) {
    this.renderer = new DeviceRenderer(g);
    this.blitter = new Blitter(g);
    this.renderer.setSize(this.texW, this.texH);
  }

  /* ---- lifecycle ------------------------------------------------------ */

  private ringFor(id: string): Ring {
    let r = this.rings.get(id);
    if (!r) {
      r = new Ring(this.g, this.texW, this.texH, RING_DEPTH);
      r.clearAll(this.renderer.fbo);
      this.rings.set(id, r);
    }
    return r;
  }

  private mediaFor(id: string): MediaSource {
    let m = this.media.get(id);
    if (!m) {
      m = new MediaSource(this.g, id);
      this.media.set(id, m);
    }
    return m;
  }

  /** the draw node's paint surface — the UI strokes it, videoIn reads it */
  drawFor(id: string): DrawSource {
    let d = this.draws.get(id);
    if (!d) {
      d = new DrawSource(this.g, id);
      this.draws.set(id, d);
    }
    return d;
  }

  /** a node left the graph — release its GPU state and forget its
      stored media (node ids are never reused, so an orphaned entry
      would just sit in IndexedDB forever). A module's compiled inner
      nodes live under "<id>/…", so the sweep covers the prefix too. */
  dropNode(id: string): void {
    const under = (k: string) => k === id || k.startsWith(id + '/');
    for (const [k, r] of [...this.rings]) if (under(k)) { r.dispose(); this.rings.delete(k); }
    for (const k of [...this.media.keys()]) if (under(k)) this.media.delete(k);   // texture is small; let GC of the map entry suffice
    for (const k of [...this.draws.keys()]) if (under(k)) this.draws.delete(k);
    this.dials.dropUnder(id);
    dropStoredMediaUnder(id).catch(() => { /* best-effort cleanup */ });
  }

  /** load dropped media into a media node, remembering it for next boot */
  loadMedia(id: string, file: Blob): Promise<void> {
    return this.mediaFor(id).load(file);
  }

  /** switch the loops' internal resolution — every ring reallocates and
      every loop restarts (a size change can't carry an image across) */
  setResolution(step: number): void {
    const [w, h] = RES_STEPS[clampInt(step, 0, RES_STEPS.length - 1)];
    if (w === this.texW && h === this.texH) return;
    for (const r of this.rings.values()) r.dispose();
    this.rings.clear();
    this.texW = w; this.texH = h;
    this.renderer.setSize(w, h);
  }

  clearAll(): void {
    for (const r of this.rings.values()) r.clearAll(this.renderer.fbo);
  }

  /* ---- the frame ------------------------------------------------------ */

  step(now: number, viewW: number, viewH: number): void {
    if (!transport.frozen) {
      for (const m of this.media.values()) m.update();
      if (now >= this.nextTick) {
        /* steady cadence while keeping up; re-anchor after a stall
           (hidden tab) instead of bursting missed ticks */
        const frameMs = 1000 / mirror.globals.video;
        this.nextTick = this.nextTick + frameMs > now ? this.nextTick + frameMs : now + frameMs;
        this.tick();
      }
    }
    this.blitter.blit(now, viewW, viewH, this.texOf, this.simTime, this.ticks);
  }

  /** the step-debugger: advance the frozen bench by exactly one video
      frame — one hop of light through every device */
  tickOnce(): void {
    for (const m of this.media.values()) m.update();
    this.tick();
  }

  private tick(): void {
    this.ticks++;
    this.simTime += 1 / mirror.globals.video;
    this.wiring = new Wiring(mirror.nodes, mirror.edges);
    this.dials.step(mirror.nodes, 1 / mirror.globals.video, this.ticks);

    /* everyone renders, THEN everyone advances. Devices at delay ≥ 1
       read last tick's commits, so their order can't matter; a delay-0
       device (an analog wire) reads its producer's same-tick frame, so
       zero-delay chains evaluate in dependency order. A camera-less
       zero-delay cycle has no answer — its back edge falls back to the
       committed frame (delay 1). */
    const procs = this.orderProcs(mirror.nodes.filter(isProc));
    this.stepped.clear();
    for (const n of procs) {
      if (n.type === 'camera') this.stepCamera(n);
      else if (n.type === 'monitor') this.stepMonitor(n);
      else this.stepMixer(n);
      this.stepped.add(n.id);
    }
    for (const n of procs) this.rings.get(n.id)!.advance();
    flushLive();
  }

  /* order the processors so every delay-0 consumer runs after its
     same-tick producers (DFS topo; cycle back-edges are skipped and
     read committed frames instead) */
  private orderProcs(procs: PatchNode[]): PatchNode[] {
    const deps = new Map<string, string[]>();
    for (const n of procs) {
      if (n.type === 'camera') continue;   // a camera always charges its frame
      if (clampInt(this.pv(n, 'delay'), 0, RING_DEPTH - 1) !== 0) continue;
      const ds: string[] = [];
      for (const h of n.type === 'mixer' ? ['v:a', 'v:b'] : ['v:in']) {
        const src = this.wiring.producerOf(n.id, h);
        if (src && isProc(src) && src.id !== n.id) ds.push(src.id);
      }
      if (ds.length) deps.set(n.id, ds);
    }
    if (!deps.size) return procs;
    const order: PatchNode[] = [];
    const state = new Map<string, 1 | 2>();   // 1 = visiting, 2 = placed
    const visit = (n: PatchNode): void => {
      if (state.has(n.id)) return;            // placed, or a cycle back-edge
      state.set(n.id, 1);
      for (const d of deps.get(n.id) ?? []) {
        const p = this.wiring.byId.get(d);
        if (p && isProc(p)) visit(p);
      }
      state.set(n.id, 2);
      order.push(n);
    };
    for (const n of procs) visit(n);
    return order;
  }

  /* ---- signal resolution ---------------------------------------------- */

  /** a param as this device experiences it, this tick */
  private pv(n: PatchNode, key: string): number {
    return paramValue(n, key, this.wiring, this.dials);
  }

  /* what a video input sees, `delay` frames back. Delay 0 is the analog
     wire: the producer's frame from THIS tick — valid only once it has
     rendered (evaluation is ordered for that); a cycle's back edge
     lands here un-stepped and falls back to the committed frame. */
  private videoIn(target: string, handle: string, delay: number): WebGLTexture {
    const src = this.wiring.producerOf(target, handle);
    if (!src) return this.renderer.black;
    if (src.type === 'media') return this.mediaFor(src.data.mediaKey ?? src.id).tex;
    if (src.type === 'draw') return this.drawFor(src.id).tex;
    if (!isProc(src)) return this.renderer.black;
    if (delay === 0)
      return this.stepped.has(src.id) ? this.ringFor(src.id).next : this.ringFor(src.id).at(0);
    return this.ringFor(src.id).at(delay - 1);
  }

  /** what the blitter (face wells, preview, popout) shows for a node */
  private texOf = (n: PatchNode, tap: number): WebGLTexture | null =>
    n.type === 'media' ? this.mediaFor(n.data.mediaKey ?? n.id).tex
      : n.type === 'draw' ? this.drawFor(n.id).tex
      : isProc(n) ? this.ringFor(n.id).at(tap)
      : null;

  /* ---- the devices ----------------------------------------------------- */

  private stepCamera(n: PatchNode): void {
    const ring = this.ringFor(n.id);
    const p: CameraParams = {
      rot: this.pv(n, 'rot'), zoom: this.pv(n, 'zoom'),
      offx: this.pv(n, 'offx'), offy: this.pv(n, 'offy'),
      focus: this.pv(n, 'focus'), sharpen: this.pv(n, 'sharpen'),
      exposure: this.pv(n, 'exposure'), agc: this.pv(n, 'agc'),
      contrast: this.pv(n, 'contrast'), sat: this.pv(n, 'sat'),
      fringe: this.pv(n, 'fringe'), bleed: this.pv(n, 'bleed'),
      knee: this.pv(n, 'knee'), grain: this.pv(n, 'grain'),
    };
    this.renderer.camera(ring.next, this.videoIn(n.id, 'v:in', 1), ring.at(0), p, this.simTime);
  }

  /* spark age runs on SIM time, so a frozen bench holds its sparks and
     the step-debugger watches them decay one frame at a time */
  private screenParams(n: PatchNode): ScreenParams {
    return {
      persist: this.pv(n, 'persist'), bright: this.pv(n, 'bright'),
      contrast: this.pv(n, 'contrast'), sat: this.pv(n, 'sat'), hue: this.pv(n, 'hue'),
      spark: sampleSpark(n.id, this.simTime),
    };
  }

  private stepMonitor(n: PatchNode): void {
    const ring = this.ringFor(n.id);
    /* delay 0 = an analog wire (same-tick passthrough); 1 = one digital
       hop; more = the converters in this path */
    const delay = clampInt(this.pv(n, 'delay'), 0, RING_DEPTH - 1);
    this.renderer.monitor(ring.next, this.videoIn(n.id, 'v:in', delay), ring.at(0), this.screenParams(n));
  }

  private stepMixer(n: PatchNode): void {
    const ring = this.ringFor(n.id);
    const delay = clampInt(this.pv(n, 'delay'), 0, RING_DEPTH - 1);
    this.renderer.mixer(
      ring.next,
      this.videoIn(n.id, 'v:a', delay),
      this.videoIn(n.id, 'v:b', delay),
      ring.at(0),
      n.data.v.mode,
      this.pv(n, 'keylvl'),
      this.screenParams(n),
    );
  }
}
