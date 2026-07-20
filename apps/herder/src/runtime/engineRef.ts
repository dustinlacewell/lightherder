/* The engine, as the rest of the app is allowed to see it — a narrow
   shape, not the class. The composition root sets the instance; UI
   and runtime code reach the engine only through this surface. */

export interface DrawSurface {
  stroke(x0: number, y0: number, x1: number, y1: number, hue: number, size: number): void;
  commit(): void;
  clear(): void;
  /** the live picture as a PNG — the join snapshot ships this so a peer
      sees the draw surface as it stands, not just its last committed
      pointer-up (S4). Resolves null if the canvas can't encode. */
  snapshot(): Promise<Blob | null>;
}

export interface EngineApi {
  readonly ticks: number;
  readonly simTime: number;
  /** one rAF: maybe tick the chain, then blit the faces */
  step(now: number, viewW: number, viewH: number): void;
  /** the step-debugger: advance exactly one video frame */
  tickOnce(): void;
  /** blank every screen */
  clearAll(): void;
  /** switch the loops' internal resolution (restarts every loop) */
  setResolution(step: number): void;
  /** load dropped media into a media node */
  loadMedia(id: string, file: Blob): Promise<void>;
  /** point a media node at a remote video URL instead of a dropped file */
  loadMediaUrl(id: string, url: string): Promise<void>;
  /** ask for the camera and start a webcam node's stream — must run from
      a user gesture */
  startWebcam(id: string): Promise<void>;
  /** release a webcam node's stream without dropping the node */
  stopWebcam(id: string): void;
  /** whether a webcam node currently has a live stream */
  webcamLive(id: string): boolean;
  /** the draw node's paint surface */
  drawFor(id: string): DrawSurface;
  /** release a PARKED node's live state (rings, textures, stamps) —
      its stored media stays put for when the view swings back */
  parkNode(id: string): void;
  /** release a departed node's GPU state and stored media */
  dropNode(id: string): void;
}

export const engineRef: { current: EngineApi | null } = { current: null };
