/*
 * 2D pan-and-zoom camera that produces a column-major `mat3` mapping
 * world coordinates to clip space, suitable for direct use as a
 * `uniformMatrix3fv` in a WebGL2 vertex shader.
 *
 * Pure viewport math — this module has no DOM event listeners, no
 * input handling, no React. Wire up whatever input system you like
 * (drag, wheel, touch) and call `panBy` / `zoomAtScreen` / etc.
 *
 * Coordinate convention:
 *   World: (0, 0) top-left, (mapW, mapH) bottom-right, +Y pointing down.
 *   Clip:  (-1, -1) bottom-left, (+1, +1) top-right (GL default).
 *
 * The matrix flips Y so world-down → clip-up:
 *   sx =  zoom * 2 / canvasW
 *   sy = -zoom * 2 / canvasH
 *   tx = -offsetX * sx
 *   ty = -offsetY * sy
 *
 * The camera does *not* automatically observe the canvas — call
 * `resize(cssWidth, cssHeight)` whenever the canvas changes (typically
 * from a ResizeObserver). On the *first* resize call the camera does
 * an implicit `fitMap()` so the initial frame shows the whole map;
 * subsequent resizes preserve the current view.
 */

export interface CameraOpts {
  /** Min allowed zoom level. Default 0.2. */
  minZoom?: number
  /** Max allowed zoom level. Default 20. */
  maxZoom?: number
  /** Min zoom for `focusBBox`-driven jumps. Default 0.7. */
  focusMinZoom?: number
  /** Max zoom for `focusBBox`-driven jumps. Default 3. */
  focusMaxZoom?: number
  /** Initial fit factor (1.0 = exact fit, lower = padded). Default 0.9. */
  fitFillFactor?: number
}

export class Camera {
  offsetX: number
  offsetY: number
  zoom: number

  private mapW: number
  private mapH: number
  private canvasW = 1
  private canvasH = 1
  private mat = new Float32Array(9)
  private dirty = true
  /** True until the first valid `resize()` triggers the initial `fitMap()`. */
  private needsInitialFit = true

  private readonly minZoom: number
  private readonly maxZoom: number
  private readonly focusMinZoom: number
  private readonly focusMaxZoom: number
  private readonly fitFillFactor: number

  constructor(mapWidth: number, mapHeight: number, opts: CameraOpts = {}) {
    this.mapW = mapWidth
    this.mapH = mapHeight
    this.offsetX = mapWidth / 2
    this.offsetY = mapHeight / 2
    this.zoom = 1
    this.minZoom = opts.minZoom ?? 0.2
    this.maxZoom = opts.maxZoom ?? 20
    this.focusMinZoom = opts.focusMinZoom ?? 0.7
    this.focusMaxZoom = opts.focusMaxZoom ?? 3
    this.fitFillFactor = opts.fitFillFactor ?? 0.9
  }

  /**
   * Update canvas pixel dimensions. Pass CSS pixels — the camera
   * applies `window.devicePixelRatio` internally so the matrix is
   * correct in the GL framebuffer. The first call triggers a
   * `fitMap()` so the map is visible on first render.
   */
  resize(cssWidth: number, cssHeight: number): void {
    const dpr = window.devicePixelRatio || 1
    this.canvasW = Math.round(cssWidth * dpr)
    this.canvasH = Math.round(cssHeight * dpr)
    if (this.needsInitialFit) this.fitMap()
    this.dirty = true
  }

  /** Fit the map into the viewport with `fitFillFactor` padding. */
  fitMap(): void {
    this.offsetX = this.mapW / 2
    this.offsetY = this.mapH / 2
    const sx = this.canvasW / this.mapW
    const sy = this.canvasH / this.mapH
    this.zoom = Math.min(sx, sy) * this.fitFillFactor
    this.dirty = true
    this.needsInitialFit = false
  }

  /**
   * Center the camera on a bounding box with optional padding. The
   * resulting zoom is clamped to `[focusMinZoom, focusMaxZoom]` so
   * tiny boxes don't overshoot into extreme zoom and huge ones don't
   * zoom way out.
   */
  focusBBox(minX: number, minY: number, maxX: number, maxY: number, padding = 1.4): void {
    this.offsetX = (minX + maxX + 1) / 2
    this.offsetY = (minY + maxY + 1) / 2
    const bboxW = maxX - minX + 1
    const bboxH = maxY - minY + 1
    const sx = this.canvasW / bboxW
    const sy = this.canvasH / bboxH
    this.zoom = Math.max(
      this.focusMinZoom,
      Math.min(this.focusMaxZoom, Math.min(sx, sy) / padding),
    )
    this.clampOffset()
    this.dirty = true
  }

  /** Set the camera center to a world position. */
  panTo(worldX: number, worldY: number): void {
    this.offsetX = worldX
    this.offsetY = worldY
    this.clampOffset()
    this.dirty = true
  }

  /** Shift the camera center by a world-space delta (drag panning). */
  panBy(dx: number, dy: number): void {
    this.offsetX += dx
    this.offsetY += dy
    this.clampOffset()
    this.dirty = true
  }

  /** Restore an explicit (x, y, z) state, suppressing the initial fit. */
  setCameraState(x: number, y: number, z: number): void {
    this.offsetX = x
    this.offsetY = y
    this.zoom = z
    this.needsInitialFit = false
    this.dirty = true
  }

  /** Multiply zoom by a factor (clamped to `[minZoom, maxZoom]`). */
  zoomBy(factor: number): void {
    this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoom * factor))
    this.clampOffset()
    this.dirty = true
  }

  /** Set absolute zoom level (clamped to `[minZoom, maxZoom]`). */
  zoomTo(level: number): void {
    this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, level))
    this.clampOffset()
    this.dirty = true
  }

  /**
   * Zoom by a factor while keeping a screen point fixed in world space.
   * Standard wheel-zoom behaviour: the world position under the cursor
   * stays under the cursor after the zoom.
   */
  zoomAtScreen(factor: number, screenX: number, screenY: number): void {
    const worldBefore = this.screenToWorld(screenX, screenY)
    this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoom * factor))
    const worldAfter = this.screenToWorld(screenX, screenY)
    this.offsetX += worldBefore.x - worldAfter.x
    this.offsetY += worldBefore.y - worldAfter.y
    this.clampOffset()
    this.dirty = true
  }

  /**
   * Return the column-major `mat3` camera matrix (world → clip).
   * The returned `Float32Array` is reused across calls — copy it if
   * you need to keep the value past the next mutation.
   */
  getMatrix(): Float32Array {
    if (this.dirty) {
      const sx = this.zoom * 2 / this.canvasW
      const sy = this.zoom * -2 / this.canvasH
      const tx = -this.offsetX * sx
      const ty = -this.offsetY * sy
      const m = this.mat
      m[0] = sx;  m[1] = 0;   m[2] = 0
      m[3] = 0;   m[4] = sy;  m[5] = 0
      m[6] = tx;  m[7] = ty;  m[8] = 1
      this.dirty = false
    }
    return this.mat
  }

  /** Convert a screen pixel position to world coordinates. */
  screenToWorld(screenX: number, screenY: number): { x: number; y: number } {
    const dpr = window.devicePixelRatio || 1
    const ndcX = (screenX * dpr / this.canvasW) * 2 - 1
    const ndcY = -((screenY * dpr / this.canvasH) * 2 - 1)
    const sx = this.zoom * 2 / this.canvasW
    const sy = this.zoom * -2 / this.canvasH
    return {
      x: (ndcX - (-this.offsetX * sx)) / sx,
      y: (ndcY - (-this.offsetY * sy)) / sy,
    }
  }

  /** Convert world coordinates to screen position (CSS pixels). */
  worldToScreen(worldX: number, worldY: number): { x: number; y: number } {
    const dpr = window.devicePixelRatio || 1
    return {
      x: this.zoom * (worldX - this.offsetX) / dpr + this.canvasW / (2 * dpr),
      y: this.zoom * (worldY - this.offsetY) / dpr + this.canvasH / (2 * dpr),
    }
  }

  private clampOffset(): void {
    const halfVpW = this.canvasW / (2 * this.zoom)
    const halfVpH = this.canvasH / (2 * this.zoom)
    this.offsetX = Math.max(-halfVpW, Math.min(this.mapW + halfVpW, this.offsetX))
    this.offsetY = Math.max(-halfVpH, Math.min(this.mapH + halfVpH, this.offsetY))
  }
}
