import { useCallback, useRef } from 'react'
import { CrtSurface } from '@ldlework/crt/react'
import type { DrawablePass, DrawCtx } from '@ldlework/crt'
import { DepositPass, makeSegmentPump, type BeamFn, type SegmentPump } from '@ldlework/scope'

/*
 * Live demo. A deterministic closed Lissajous curve stands in for a real
 * oscilloscope trace — no Wave / WavePumper machinery needed. The BeamFn
 * generator yields NDC samples each frame; `makeSegmentPump` batches them
 * into the instance data `DepositPass` additively deposits into crt's HDR
 * accumulator, which the phosphor chain then blooms and presents.
 */
const SEGMENT_CAPACITY = 4000

/** A closed Lissajous curve — deterministic, no dials/signal model needed. */
const lissajousBeam: BeamFn = function* (t) {
  const turns = 400
  for (let i = 0; i < turns; i++) {
    const phase = t * 0.6 + (i / turns) * Math.PI * 2
    yield {
      x: 0.8 * Math.sin(3 * phase),
      y: 0.8 * Math.sin(2 * phase),
      break: i === 0,
    }
  }
}

function ScopeDemo() {
  const depositRef = useRef<DepositPass | null>(null)
  const pumpRef = useRef<SegmentPump | null>(null)

  const passes = useCallback((gl: WebGL2RenderingContext): DrawablePass<DrawCtx>[] => {
    const deposit = new DepositPass(gl, SEGMENT_CAPACITY)
    deposit.setBeamWidth(1.5)
    depositRef.current = deposit
    pumpRef.current = makeSegmentPump(SEGMENT_CAPACITY)
    return [deposit]
  }, [])

  const stage = useCallback((t: number, dt: number) => {
    const deposit = depositRef.current
    const pump = pumpRef.current
    if (!deposit || !pump) return
    deposit.setBatch(pump.pump(lissajousBeam, t, dt))
  }, [])

  return (
    <div className="scope-frame">
      <CrtSurface passes={passes} stage={stage} intensity={1.2} />
    </div>
  )
}

export function App() {
  return (
    <>
      <section className="hero">
        <p className="hero-name">scope</p>
        <h1 className="hero-tagline">Oscilloscope signal modeling.</h1>
        <p className="hero-desc">
          Oscilloscope-style synthetic-signal generation, plus a WebGL2
          deposit pass that feeds the resulting beam trace into{' '}
          <code>@ldlework/crt</code>'s phosphor pipeline. Plain TypeScript —
          no dials, no React, no DOM, no presets, no persistence. The
          application composes scope with whatever parameter system and
          persistence it wants.
        </p>
        <div className="links">
          <a href="https://www.npmjs.com/package/@ldlework/scope" target="_blank" rel="noreferrer">npm</a>
          <a href="https://github.com/ldlework/phosphor" target="_blank" rel="noreferrer">GitHub</a>
          <a href="./storybook/">Storybook</a>
        </div>
      </section>

      <h2>Live demo</h2>
      <div className="demo-panel">
        <p className="demo-hint">
          A closed Lissajous curve fed through scope's <code>DepositPass</code>{' '}
          into crt's phosphor accumulator — a real beam trace without the full
          wave/dials stack.
        </p>
        <ScopeDemo />
      </div>

      <h2>What's in the box</h2>
      <ul>
        <li>
          <strong>Wave model</strong> — every wave is{' '}
          <code>Σᵢ ampᵢ·sin(2π·freqᵢ·t + phaseᵢ)</code> plus an always-on
          noise floor plus phase-locked bursts.
        </li>
        <li>
          <strong>WavePumper</strong> — the runtime. Walks a <code>Wave</code>{' '}
          at the configured beam sample rate and emits <code>BeamPosition</code>s
          (NDC x/y + per-sample beam character).
        </li>
        <li>
          <strong>Noise generators</strong> — white / brown / pink / drift,
          plus seeded variants for reproducible signal-floor noise.
        </li>
        <li>
          <strong>DepositPass + SegmentPump</strong> — the{' '}
          <code>@ldlework/crt</code> integration seam. <code>DepositPass</code>{' '}
          additively deposits beam segments via an analytical line-integral
          (woscope-style); <code>SegmentPump</code> batches a{' '}
          <code>BeamFn</code>'s per-frame samples into the instance data it
          consumes.
        </li>
      </ul>

      <h2>Install</h2>
      <pre><code>pnpm add @ldlework/scope</code></pre>
      <pre><code>{`import { makeWave, makeFundamental, WavePumper } from '@ldlework/scope'

const wave = makeWave()
wave.fundamentals = [makeFundamental(440, 0.5)]  // freq, amp, phase

const pumper = new WavePumper(500_000)  // beamHz
const sample = pumper.step(wave, { t, dt })
// sample: BeamPosition — { x, y, on?, beamI?, beamWidth? }`}</code></pre>

      <footer>scope · MIT · @ldlework</footer>
    </>
  )
}
