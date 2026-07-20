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

import { read, sampleSlot, type Ctx, type Slot } from '@ldlework/dials';
import { TextureRing } from '@ldlework/gl';
import type { GLC } from './context';
import { DELAY_MAX, RES_STEPS, type PatchNode } from '../patch';
import { dropStoredMediaUnder, dropStoredMediaUrl } from '../persist';
import { flushLive, mirror, notifyTick, sampleSpark, transport } from '../runtime';
import { Blitter } from './blitter';
import { FX, FX_KINDS } from '../fx';
import { StampBank } from './stamps';
import { clampInt, paramValue, slotValue } from './params';
import { DeviceRenderer, type CameraParams, type ScreenParams } from './renderer';
import { DrawSource } from './sources/draw';
import { MediaSource } from './sources/media';
import { WebcamSource } from './sources/webcam';
import { Wiring } from './wiring';

const RING_DEPTH = 6;

/* how many ticks the delay store waits below capacity before letting
   the memory go — long enough that a knob sweep never thrashes the
   allocator, short enough that a moment at 60 frames doesn't hold
   hundreds of megabytes for the rest of the session */
const DELAY_SHRINK_TICKS = 120;

const isProc = (n: PatchNode) => n.type === 'camera' || n.type === 'monitor' || n.type === 'mixer' || n.type === 'delay' || FX_KINDS.has(n.type);

/** a transport global's current value, off its (unmodulated) slot */
function globalNum(key: string): number {
  const s = mirror.globals[key] as Slot<number> | undefined;
  return s ? (s.lastSample ?? s.dial.value) : 0;
}

/** sample every slot in a node's tree — advances its sources once and
    writes each `lastSample`. The engine's per-tick pass calls this per
    node so the resolved values are ready for every reader downstream. */
function sampleTree(n: PatchNode, ctx: Ctx): void {
  const slots = n.data.slots;
  for (const k in slots) sampleSlot(slots[k] as Slot<unknown>, ctx);
}

export class Engine {
  private rings = new Map<string, TextureRing>();
  private media = new Map<string, MediaSource>();
  private webcams = new Map<string, WebcamSource>();
  private draws = new Map<string, DrawSource>();

  private renderer: DeviceRenderer;
  private blitter: Blitter;
  private dials = new StampBank();
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

  private ringFor(id: string): TextureRing {
    let r = this.rings.get(id);
    if (!r) {
      const gl = this.g.gl;
      r = new TextureRing(gl, {
        width: this.texW, height: this.texH, depth: RING_DEPTH,
        internalFormat: this.g.ifmt, format: gl.RGBA, type: this.g.type,
        filter: gl.LINEAR,
      });
      /* alpha 0.25 = AGC gain 1.0 for camera rings (alpha carries the state) */
      r.clearAll(this.renderer.fbo, [0, 0, 0, 0.25]);
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

  private webcamFor(id: string): WebcamSource {
    let w = this.webcams.get(id);
    if (!w) {
      w = new WebcamSource(this.g);
      this.webcams.set(id, w);
    }
    return w;
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

  /** a node left the RUNNING graph but not the document — a view swap
      parked it (the solo drill of a library entry benches the whole
      doc graph). Release everything live — rings, media textures, draw
      surfaces, stamp state — but leave IndexedDB alone: when the node
      returns, mediaFor() reboots its MediaSource and the stored blob
      hydrates it right back. A module's compiled inner nodes live
      under "<id>/…", so the sweep covers the prefix too. */
  parkNode(id: string): void {
    const under = (k: string) => k === id || k.startsWith(id + '/');
    for (const [k, r] of [...this.rings]) if (under(k)) { r.dispose(); this.rings.delete(k); }
    for (const [k, r] of [...this.delayIns]) if (under(k)) { r.dispose(); this.delayIns.delete(k); this.delayIdle.delete(k); }
    for (const k of [...this.fxState.keys()]) if (under(k)) this.fxState.delete(k);
    for (const k of [...this.media.keys()]) if (under(k)) this.media.delete(k);   // texture is small; let GC of the map entry suffice
    for (const [k, w] of [...this.webcams]) if (under(k)) { w.dispose(); this.webcams.delete(k); }
    for (const k of [...this.draws.keys()]) if (under(k)) this.draws.delete(k);
    this.dials.dropUnder(id);
  }

  /** a node left the graph FOR GOOD — park it, and forget its stored
      media too (node ids are never reused, so an orphaned entry would
      just sit in IndexedDB forever). */
  dropNode(id: string): void {
    this.parkNode(id);
    dropStoredMediaUnder(id).catch(() => { /* best-effort cleanup */ });
    dropStoredMediaUrl(id);
  }

  /** load dropped media into a media node, remembering it for next boot */
  loadMedia(id: string, file: Blob): Promise<void> {
    return this.mediaFor(id).load(file);
  }

  /** point a media node at a remote video URL instead of a dropped file */
  loadMediaUrl(id: string, url: string): Promise<void> {
    return this.mediaFor(id).loadUrl(url);
  }

  /** ask for the camera and start a webcam node's stream — must run
      from a user gesture (the face click) */
  startWebcam(id: string): Promise<void> {
    return this.webcamFor(id).start();
  }

  /** release a webcam node's stream without dropping the node */
  stopWebcam(id: string): void {
    this.webcams.get(id)?.stop();
  }

  webcamLive(id: string): boolean {
    return this.webcams.get(id)?.live ?? false;
  }

  /** switch the loops' internal resolution — every ring reallocates and
      every loop restarts (a size change can't carry an image across) */
  setResolution(step: number): void {
    const [w, h] = RES_STEPS[clampInt(step, 0, RES_STEPS.length - 1)];
    if (w === this.texW && h === this.texH) return;
    for (const r of this.rings.values()) r.dispose();
    this.rings.clear();
    for (const r of this.delayIns.values()) r.dispose();
    this.delayIns.clear();
    this.delayIdle.clear();
    this.texW = w; this.texH = h;
    this.renderer.setSize(w, h);
  }

  clearAll(): void {
    for (const r of this.rings.values()) r.clearAll(this.renderer.fbo, [0, 0, 0, 0.25]);
    for (const r of this.delayIns.values()) r.clearAll(this.renderer.fbo, [0, 0, 0, 1]);
  }

  /* ---- the frame ------------------------------------------------------ */

  step(now: number, viewW: number, viewH: number): void {
    if (!transport.frozen && now >= this.nextTick) {
      /* steady cadence while keeping up; re-anchor after a stall
         (hidden tab) instead of bursting missed ticks */
      const frameMs = 1000 / globalNum('video');
      this.nextTick = this.nextTick + frameMs > now ? this.nextTick + frameMs : now + frameMs;
      this.tick();
    }
    this.blitter.blit(now, viewW, viewH, this.texOf, this.simTime, this.ticks);
  }

  /** the step-debugger: advance the frozen bench by exactly one video
      frame — one hop of light through every device */
  tickOnce(): void {
    this.tick();
  }

  private tick(): void {
    /* sources upload at TICK rate — the bench consumes frames no
       faster, so pushing video bytes every rAF was pure bus traffic */
    for (const m of this.media.values()) m.update();
    for (const w of this.webcams.values()) w.update();
    this.ticks++;
    const dt = 1 / globalNum('video');
    this.simTime += dt;

    /* THE sampling pass: the engine is the sole sampler. One sampleSlot
       walk per node's slot tree per tick advances every stateful source
       exactly once, applies each slot's glide in sim-time, and
       writes every `lastSample` — the resolved (glided + modulated) value
       every downstream reader (paramValue, StampBank, stepMixer, the UI's
       lastSample poll) consumes. Globals sampled too (they carry no
       modulation, but the read model is uniform). */
    const ctx: Ctx = { dt, t: this.simTime };
    read(mirror.globals, ctx);
    for (const n of mirror.nodes) sampleTree(n, ctx);

    this.wiring = new Wiring(mirror.nodes, mirror.edges);
    this.dials.step(mirror.nodes, this.ticks);

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
      else if (n.type === 'delay') this.stepDelay(n);
      else if (FX_KINDS.has(n.type)) this.stepEffect(n);
      else this.stepMixer(n);
      this.stepped.add(n.id);
    }
    for (const n of procs) this.rings.get(n.id)!.advance();
    flushLive();
    notifyTick();
  }

  /* order the processors so every delay-0 consumer runs after its
     same-tick producers (DFS topo; cycle back-edges are skipped and
     read committed frames instead) */
  private orderProcs(procs: PatchNode[]): PatchNode[] {
    const deps = new Map<string, string[]>();
    for (const n of procs) {
      if (n.type === 'camera') continue;   // a camera always charges its frame
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
    if (src.type === 'webcam') return this.webcamFor(src.id).tex;
    if (src.type === 'draw') return this.drawFor(src.id).tex;
    if (!isProc(src)) return this.renderer.black;
    if (delay === 0)
      return this.stepped.has(src.id) ? this.ringFor(src.id).next : this.ringFor(src.id).at(0);
    return this.ringFor(src.id).at(delay - 1);
  }

  /** what the blitter (face wells, preview, popout) shows for a node */
  private texOf = (n: PatchNode, tap: number): WebGLTexture | null =>
    n.type === 'media' ? this.mediaFor(n.data.mediaKey ?? n.id).tex
      : n.type === 'webcam' ? this.webcamFor(n.id).tex
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
    this.renderer.monitor(ring.next, this.videoIn(n.id, 'v:in', 0), ring.at(0), this.screenParams(n));
  }

  /* effects are analog wires: same-tick passthrough, no buffering —
     time lives in the delay device. The def's uniforms() turns the
     resolved knobs into shader values; per-node scratch (phase
     accumulators and the like) lives in fxState. */
  private fxState = new Map<string, Record<string, unknown>>();

  private stepEffect(n: PatchNode): void {
    const ring = this.ringFor(n.id);
    const def = FX[n.type as keyof typeof FX];
    let st = this.fxState.get(n.id);
    if (!st) { st = {}; this.fxState.set(n.id, st); }
    const vals = def.uniforms(k => this.pv(n, k), { simTime: this.simTime, state: st });
    this.renderer.effect(n.type, ring.next, this.videoIn(n.id, 'v:in', 0), { uTime: this.simTime, ...vals });
  }

  /* the delay line records its input every tick into its own store,
     and plays back the frame from N ticks ago — buffering that works
     against ANY producer, media included (a monitor's delay knob can
     only tap a ring-bearing device's history) */
  private delayIns = new Map<string, TextureRing>();
  private delayIdle = new Map<string, number>();

  /* the store follows the knob's reach: turning FRAMES past the buffer
     reallocates it now (clearing held history; it refills over the next
     N ticks), and a store sitting below capacity for DELAY_SHRINK_TICKS
     reallocates down, releasing the memory a passing sweep to 60 grabbed.
     It records verbatim copies for playback, so it rides in RGBA8 — a
     quarter of the half-float loop rings' footprint; loop values outside
     [0,1] clamp on the way in. */
  private delayInFor(id: string, depth: number): TextureRing {
    let r = this.delayIns.get(id);
    if (r && r.depth !== depth) {
      const idle = r.depth > depth ? (this.delayIdle.get(id) ?? 0) + 1 : 0;
      if (r.depth < depth || idle > DELAY_SHRINK_TICKS) {
        r.dispose(); this.delayIns.delete(id); r = undefined;
      } else {
        this.delayIdle.set(id, idle);
      }
    } else {
      this.delayIdle.delete(id);
    }
    if (!r) {
      const gl = this.g.gl;
      r = new TextureRing(gl, {
        width: this.texW, height: this.texH, depth,
        internalFormat: gl.RGBA8, format: gl.RGBA, type: gl.UNSIGNED_BYTE,
        filter: gl.LINEAR,
      });
      r.clearAll(this.renderer.fbo, [0, 0, 0, 1]);
      this.delayIns.set(id, r);
      this.delayIdle.delete(id);
    }
    return r;
  }

  private stepDelay(n: PatchNode): void {
    const ring = this.ringFor(n.id);
    const frames = clampInt(this.pv(n, 'frames'), 0, DELAY_MAX);
    const ins = this.delayInFor(n.id, frames + 1);
    this.renderer.copy(ins.next, this.videoIn(n.id, 'v:in', 0));
    ins.advance();
    this.renderer.copy(ring.next, ins.at(Math.min(frames, ins.depth - 1)));
  }

  private stepMixer(n: PatchNode): void {
    const ring = this.ringFor(n.id);
    this.renderer.mixer(
      ring.next,
      this.videoIn(n.id, 'v:a', 0),
      this.videoIn(n.id, 'v:b', 0),
      ring.at(0),
      slotValue(n, 'mode'),
      this.pv(n, 'keylvl'),
      this.screenParams(n),
    );
  }
}
