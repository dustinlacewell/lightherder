import { useCallback, useRef, useState } from 'react'
import { CrtSurface } from '@ldlework/crt/react'
import { CodeBlock, Display, Tabs } from '@ldlework/phosphor'
import {
  StampPass,
  PHOSPHOR_P31, PHOSPHOR_P7, PHOSPHOR_P39, PHOSPHOR_BEAUTY,
  type CrtPreset, type DrawablePass, type DrawCtx, type Stamp,
} from '@ldlework/crt'

/*
 * Live demo. `passes` runs once at mount with the live GL context: we
 * build a StampPass, hand it a small radial-gradient alpha texture (a
 * soft dot — StampPass samples the texture's alpha channel), and return
 * it. `stage` runs every rAF: while the pointer is over the canvas, the
 * cursor itself becomes the phosphor — a stamp trail follows the mouse.
 * Away from the canvas it falls back to an idle orbiting ring. Everything
 * else — persistence, halation, tonemap, the phosphor glow — is crt's own
 * effect chain doing its thing on top of those bare deposits.
 */

const STAMP_COUNT = 5

interface PresetOption {
  name: string
  preset: CrtPreset
  char: string
}

const PRESETS: PresetOption[] = [
  {
    name: 'PHOSPHOR_P31',
    preset: PHOSPHOR_P31,
    char: 'ZnS:Cu yellow-green — short persistence; the classic oscilloscope phosphor (the component defaults target it).',
  },
  {
    name: 'PHOSPHOR_P7',
    preset: PHOSPHOR_P7,
    char: 'Cascade blue→yellow — long persistence; the fade lingers for visible seconds. Radar / slow-scan look.',
  },
  {
    name: 'PHOSPHOR_P39',
    preset: PHOSPHOR_P39,
    char: 'ZnO:Zn slow-scan yellow-green — medium persistence; a heavier ghost trail than P31, less saturated than P7.',
  },
  {
    name: 'PHOSPHOR_BEAUTY',
    preset: PHOSPHOR_BEAUTY,
    char: 'Exaggerated halation and blown highlights — not strictly physical. For when the trace is the design, not instrumentation.',
  },
]

/** A soft round dot as an alpha-only texture for StampPass to sample. */
function makeDotTexture(gl: WebGL2RenderingContext): WebGLTexture {
  const size = 64
  const data = new Uint8Array(size * size * 4)
  const c = (size - 1) / 2
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - c) / c
      const dy = (y - c) / c
      const r = Math.sqrt(dx * dx + dy * dy)
      // Smooth falloff to zero at the edge; squared for a tighter core.
      const a = Math.max(0, 1 - r)
      const alpha = Math.round(a * a * 255)
      const o = (y * size + x) * 4
      data[o] = 255
      data[o + 1] = 255
      data[o + 2] = 255
      data[o + 3] = alpha
    }
  }
  const tex = gl.createTexture()
  if (!tex) throw new Error('createTexture failed (dot)')
  gl.bindTexture(gl.TEXTURE_2D, tex)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, data)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.bindTexture(gl.TEXTURE_2D, null)
  return tex
}

export function App() {
  const stampRef = useRef<StampPass | null>(null)
  const canvasElRef = useRef<HTMLDivElement | null>(null)
  const [presetIndex, setPresetIndex] = useState(0)
  const presetIndexRef = useRef(0)
  presetIndexRef.current = presetIndex

  // Pointer state, in NDC. NaN means "not hovering" — falls back to the
  // idle orbit. Read every stage() tick; written by the pointermove
  // listener below, so no React re-render on mouse movement.
  const ptr = useRef({ x: NaN, y: NaN, active: false })

  const passes = useCallback((gl: WebGL2RenderingContext): DrawablePass<DrawCtx>[] => {
    const stamp = new StampPass(gl)
    stamp.setTexture(makeDotTexture(gl))
    stampRef.current = stamp
    return [stamp]
  }, [])

  const stage = useCallback((t: number) => {
    const stamp = stampRef.current
    if (!stamp) return
    const stamps: Stamp[] = []

    if (ptr.current.active) {
      // The cursor itself is the phosphor — one bright core stamp at the
      // pointer, trailed by a few fading echoes for a comet-tail feel.
      const TRAIL = 4
      for (let i = 0; i < TRAIL; i++) {
        const fade = 1 - i / TRAIL
        stamps.push({
          x: ptr.current.x,
          y: ptr.current.y,
          sizePx: 22 + i * 6,
          intensity: fade * fade,
        })
      }
    } else {
      // Idle: the same orbiting, pulsing ring as before.
      for (let i = 0; i < STAMP_COUNT; i++) {
        const phase = (i / STAMP_COUNT) * Math.PI * 2
        const angle = t * 0.5 + phase
        const radius = 0.6
        const pulse = 0.55 + 0.45 * Math.sin(t * 2 + phase)
        stamps.push({
          x: radius * Math.cos(angle),
          y: radius * Math.sin(angle),
          sizePx: 26,
          intensity: pulse,
        })
      }
    }
    stamp.setStamps(stamps)
  }, [])

  const presetFn = useCallback(
    (): CrtPreset => PRESETS[presetIndexRef.current]!.preset,
    [],
  )

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const el = canvasElRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    ptr.current.x = ((e.clientX - r.left) / r.width) * 2 - 1
    ptr.current.y = -(((e.clientY - r.top) / r.height) * 2 - 1)
    ptr.current.active = true
  }, [])

  const onPointerLeave = useCallback(() => {
    ptr.current.active = false
  }, [])

  const active = PRESETS[presetIndex]!

  return (
    <div className="site">
      <section className="site-section site-hero">
        <div className="site-container">
          <p className="site-eyebrow">crt</p>
          <h1 className="site-h1">A phosphor display renderer.</h1>
          <p className="site-prose site-hero-desc">
            Renders whatever you draw into it as if it were painted onto a real
            cathode-ray-tube phosphor: an HDR beam accumulator, Kohlrausch
            stretched-exponential persistence, separable halation, and an
            ACES-shoulder tonemap with phosphor-color modulation. crt is
            content-agnostic — it owns the effect chain, not what gets drawn.
          </p>
          <div className="site-links">
            <a href="https://www.npmjs.com/package/@ldlework/crt" target="_blank" rel="noreferrer">npm</a>
            <a href="https://github.com/ldlework/phosphor" target="_blank" rel="noreferrer">GitHub</a>
            <a href="./storybook/">Storybook</a>
          </div>
        </div>
      </section>

      <section className="site-section" id="demo">
        <div className="site-container">
          <h2 className="site-h2">Live demo</h2>
          <p className="site-prose site-demo-hint">
            Move the mouse over the screen — the cursor becomes the phosphor,
            trailing a soft comet tail (crt's own <code>StampPass</code>). Away
            from the screen it idles in an orbiting ring. Pick a coating with
            the tabs.
          </p>
          <Display fill className="demo-display">
            <div
              className="demo-stage"
              ref={canvasElRef}
              onPointerMove={onPointerMove}
              onPointerLeave={onPointerLeave}
            >
              <CrtSurface passes={passes} stage={stage} presetFn={presetFn} {...active.preset} />
            </div>
          </Display>
          <div className="demo-presets">
            <Tabs
              tabs={PRESETS.map((p, i) => ({ key: String(i), label: p.name.replace('PHOSPHOR_', '') }))}
              active={String(presetIndex)}
              onSelect={(k) => setPresetIndex(Number(k))}
            />
            <p className="site-prose demo-preset-char">
              <code>{active.name}</code> — {active.char}
            </p>
          </div>
        </div>
      </section>

      <section className="site-section" id="install">
        <div className="site-container site-container--narrow">
          <h2 className="site-h2">Install</h2>
          <CodeBlock lang="bash" code="pnpm add @ldlework/crt" />
          <p className="site-prose site-install-prose">
            Bring your own passes — crt owns the effect chain, you own the
            deposits:
          </p>
          <CodeBlock
            lang="tsx"
            code={`import { useCallback, useRef } from 'react'
import { CrtSurface } from '@ldlework/crt/react'
import {
  StampPass, PHOSPHOR_P31,
  type DrawablePass, type DrawCtx,
} from '@ldlework/crt'

function Scanner() {
  const stampRef = useRef<StampPass | null>(null)

  const passes = useCallback((gl: WebGL2RenderingContext): DrawablePass<DrawCtx>[] => {
    const stamp = new StampPass(gl)
    stampRef.current = stamp
    return [stamp]
  }, [])

  const stage = useCallback((t: number) => {
    stampRef.current?.setStamps([{ x: Math.sin(t), y: Math.cos(t), sizePx: 24 }])
  }, [])

  return <CrtSurface passes={passes} stage={stage} {...PHOSPHOR_P31} />
}`}
          />
        </div>
      </section>

      <footer className="site-footer">
        <div className="site-footer-links">
          <a href="https://github.com/ldlework/phosphor" target="_blank" rel="noreferrer">GitHub</a>
          <a href="./storybook/">Storybook</a>
          <a href="https://www.npmjs.com/package/@ldlework/crt" target="_blank" rel="noreferrer">npm</a>
        </div>
        <div>crt · MIT · @ldlework</div>
      </footer>
    </div>
  )
}
