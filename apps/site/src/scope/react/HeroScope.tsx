/*
 * HeroScope — the site's composer. Owns the entire hero experience:
 *
 *   - HeroPreset (screen + waves + pointer dials), loaded from JSON,
 *     saved by the TuningPanel.
 *   - WavePumpers via useScopePumpers (one per wave).
 *   - BeamFn via useBeamFn (per-frame: read dials → step pumpers).
 *   - <CrtSurface> mount with a passes factory that builds:
 *       * DepositPass (beam) — fed by the segment pump
 *       * StampPass (pointer trail) — fed by the pointer listener
 *   - Per-frame `stage` callback that pumps segments + stages stamps.
 *   - TuningPanel mounted alongside.
 *
 * crt knows nothing about scope. scope knows nothing about dials.
 * dials knows nothing about either. The composition lives here.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import {
  CrtSurface,
  StampPass,
  type CrtPreset,
  type DrawablePass,
  type DrawCtx,
  type Stamp,
} from '@ldlework/crt'
import { DepositPass, makeSegmentPump, type SegmentPump } from '@ldlework/scope'
import { read } from '@ldlework/dials'
import {
  loadHeroPreset,
  type PresetEndpoint,
} from '../preset/network'
import { makeDefaultPreset, type HeroPreset } from '../preset/hero-preset'
import { readScreenDials } from '../preset/screen-dials'
import { useScopePumpers } from './useScopePumpers'
import {
  useBeamFn,
  DEFAULT_MAX_PER_WAVE,
  DEFAULT_MAX_TOTAL_PER_FRAME,
} from './useBeamFn'
import { TuningPanel } from './TuningPanel'

const DEFAULT_ENDPOINT: PresetEndpoint = {
  endpoint: '/__preset/scope',
  fallbackUrl: '/scope-preset.json',
}

export interface HeroScopeProps extends Partial<PresetEndpoint> {
  className?: string
  style?: CSSProperties
  noTuning?: boolean
  beamHz?: number
  /**
   * Per-wave sample budget. Each wave gets this many samples per frame
   * regardless of how many waves exist — so adding a wave doesn't dim
   * the existing ones. Default DEFAULT_MAX_PER_WAVE.
   */
  maxPerWave?: number
  /**
   * Absolute per-frame ceiling across all waves. Caps the total work
   * the GPU does even when many waves are present. Default
   * DEFAULT_MAX_TOTAL_PER_FRAME.
   */
  maxTotalPerFrame?: number
  /** Where to fetch the cursor PNG. */
  cursorPng?: string
}

/**
 * The PNG hotspot (arrow tip) in normalized texture coords from
 * top-left. Measured against the bundled 64×64 cursor.png.
 */
const HOTSPOT_U = 8 / 64
const HOTSPOT_V = 6 / 64

export function HeroScope({
  className,
  style,
  noTuning = false,
  endpoint = DEFAULT_ENDPOINT.endpoint,
  fallbackUrl = DEFAULT_ENDPOINT.fallbackUrl,
  beamHz,
  maxPerWave = DEFAULT_MAX_PER_WAVE,
  maxTotalPerFrame = DEFAULT_MAX_TOTAL_PER_FRAME,
  cursorPng = '/cursor.png',
}: HeroScopeProps) {
  const endpointCfg = useMemo<PresetEndpoint>(
    () => ({ endpoint, ...(fallbackUrl !== undefined ? { fallbackUrl } : {}) }),
    [endpoint, fallbackUrl],
  )

  const [preset, setPreset] = useState<HeroPreset>(makeDefaultPreset)
  const [, bump] = useReducer((x: number) => x + 1, 0)
  const handleChange = useCallback(() => bump(), [])

  useEffect(() => {
    let cancelled = false
    void loadHeroPreset(endpointCfg).then((loaded) => {
      if (cancelled) return
      setPreset(loaded)
    })
    return () => { cancelled = true }
  }, [endpointCfg])

  // ── Wave pumpers + BeamFn ───────────────────────────────────────
  const pumpers = useScopePumpers(preset.waves, beamHz ?? 500_000)
  const beamFn = useBeamFn(
    pumpers,
    {
      ...(beamHz !== undefined ? { beamHz } : {}),
      maxPerWave,
      maxTotalPerFrame,
    },
  )
  const beamFnRef = useRef(beamFn)
  beamFnRef.current = beamFn

  const presetRef = useRef(preset)
  presetRef.current = preset

  // ── Pass refs filled by the factory at mount ────────────────────
  const depositRef = useRef<DepositPass | null>(null)
  const pumpRef = useRef<SegmentPump | null>(null)
  const stampRef = useRef<StampPass | null>(null)

  // ── Pointer trail state ─────────────────────────────────────────
  const ptr = useRef({
    curX: NaN, curY: NaN, lastX: NaN, lastY: NaN,
    canvasCssW: 0, canvasCssH: 0,
  })

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const canvas = document.querySelector('canvas')
      if (!canvas) return
      const r = canvas.getBoundingClientRect()
      if (r.width <= 0 || r.height <= 0) return
      ptr.current.curX = ((e.clientX - r.left) / r.width) * 2 - 1
      ptr.current.curY = -(((e.clientY - r.top) / r.height) * 2 - 1)
      ptr.current.canvasCssW = r.width
      ptr.current.canvasCssH = r.height
    }
    window.addEventListener('pointermove', onMove)
    return () => window.removeEventListener('pointermove', onMove)
  }, [])

  // ── passes factory: runs once at mount with the live GL context ─
  //
  // Size the DepositPass instance buffer and the segment pump to the
  // absolute total ceiling — not per-wave. That way the same surface
  // handles 1 wave (16K samples) up to N waves (capped at the total)
  // without ever needing to remount. The actual draw-call count each
  // frame is whatever the pumper happens to emit; the buffer just has
  // to be large enough to hold the maximum.
  const passesFactory = useCallback(
    (gl: WebGL2RenderingContext): DrawablePass<DrawCtx>[] => {
      const deposit = new DepositPass(gl, maxTotalPerFrame)
      depositRef.current = deposit
      pumpRef.current = makeSegmentPump(maxTotalPerFrame)
      const stamp = new StampPass(gl, { capacity: 64 })
      stampRef.current = stamp
      void loadCursorTexture(gl, cursorPng).then((tex) => stamp.setTexture(tex))
      return [deposit, stamp]
    },
    // Mount-time only — changing these doesn't re-run the factory.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  // ── per-frame: pump beam segments, set beam width, stage stamps ─
  const stage = useCallback((t: number, dt: number) => {
    const deposit = depositRef.current
    const pump = pumpRef.current
    const stamp = stampRef.current
    if (!deposit || !pump || !stamp) return
    const ctx = { t, dt }

    // Beam: pump samples → segment batch → DepositPass.
    const batch = pump.pump(beamFnRef.current, t, dt)
    deposit.setBatch(batch)
    const { beam } = readScreenDials(presetRef.current.screen, ctx)
    deposit.setBeamWidth(beam.beamWidthPx)

    // Pointer trail: read pointer dials, interpolate stamps along motion.
    const p = read(presetRef.current.pointer, ctx)
    const stamps = computePointerStamps(ptr.current, p.sizePx, p.intensity, p.interpolation, p.rotation)
    stamp.setStamps(stamps)
    ptr.current.lastX = ptr.current.curX
    ptr.current.lastY = ptr.current.curY
  }, [])

  const presetFn = useCallback(
    (t: number, dt: number): CrtPreset =>
      readScreenDials(presetRef.current.screen, { t, dt }).preset,
    [],
  )

  return (
    <>
      <CrtSurface
        passes={passesFactory}
        stage={stage}
        presetFn={presetFn}
        className={className ?? ''}
        style={style ?? {}}
      />
      {!noTuning && (
        <TuningPanel
          preset={preset}
          onChange={handleChange}
          setPreset={setPreset}
          endpoint={endpointCfg}
        />
      )}
    </>
  )
}

// ─── Pointer stamp interpolation ─────────────────────────────────────

interface PtrState {
  curX: number; curY: number
  lastX: number; lastY: number
  canvasCssW: number; canvasCssH: number
}

function computePointerStamps(
  s: PtrState,
  sizePx: number,
  intensity: number,
  interpolation: number,
  rotation: number,
): Stamp[] {
  const maxN = Math.max(1, Math.floor(interpolation))
  const ndcPerCssX = s.canvasCssW > 0 ? 2 / s.canvasCssW : 0
  const ndcPerCssY = s.canvasCssH > 0 ? 2 / s.canvasCssH : 0
  const offX = (0.5 - HOTSPOT_U) * sizePx * ndcPerCssX
  const offY = -(0.5 - HOTSPOT_V) * sizePx * ndcPerCssY

  const stampAt = (x: number, y: number): Stamp => ({
    x: x + offX, y: y + offY, sizePx, intensity, rotation,
  })

  if (Number.isNaN(s.curX)) return []
  if (Number.isNaN(s.lastX)) return [stampAt(s.curX, s.curY)]
  const dx = s.curX - s.lastX
  const dy = s.curY - s.lastY
  const distSq = dx * dx + dy * dy
  if (distSq === 0) return []
  const dist = Math.sqrt(distSq)
  const n = Math.max(1, Math.min(maxN, Math.ceil(dist * 50)))
  const out: Stamp[] = []
  for (let i = 1; i <= n; i++) {
    const t = i / n
    out.push(stampAt(s.lastX + dx * t, s.lastY + dy * t))
  }
  return out
}

// ─── Cursor texture loader ───────────────────────────────────────────

async function loadCursorTexture(
  gl: WebGL2RenderingContext,
  url: string,
): Promise<WebGLTexture> {
  const img = new Image()
  img.crossOrigin = 'anonymous'
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = () => reject(new Error(`failed to load ${url}`))
    img.src = url
  })
  const tex = gl.createTexture()
  if (!tex) throw new Error('createTexture failed')
  gl.bindTexture(gl.TEXTURE_2D, tex)
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  return tex
}
