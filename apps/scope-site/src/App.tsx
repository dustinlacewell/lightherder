import { useEffect, useReducer, useState } from 'react'
import { CodeBlock, Display, Panel as ChromePanel } from '@ldlework/phosphor'
import { makeDefaultPreset, type ScopePreset } from './scope/preset/preset'
import { loadPreset } from './scope/preset/store'
import { ScopeStage } from './scope/react/ScopeStage'
import { TuningPanel } from './scope/react/TuningPanel'

const USAGE_SNIPPET = `import { makeWave, makeFundamental, WavePumper } from '@ldlework/scope'

const wave = makeWave()
wave.fundamentals = [makeFundamental(440, 0.5)]  // freq, amp, phase

const pumper = new WavePumper(500_000)  // beamHz
const sample = pumper.step(wave, { t, dt })
// sample: BeamPosition — { x, y, on?, beamI?, beamWidth? }`

export function App() {
  return (
    <div className="site">
      <Hero />
      <PlaygroundSection />
      <InTheBoxSection />
      <InstallSection />
      <Footer />
    </div>
  )
}

function Hero() {
  return (
    <section className="site-section site-hero">
      <div className="site-container">
        <p className="site-eyebrow">scope</p>
        <h1 className="site-h1">Oscilloscope signal modeling.</h1>
        <p className="site-prose site-hero-desc">
          Oscilloscope-style synthetic-signal generation, plus a WebGL2
          deposit pass that feeds the resulting beam trace into{' '}
          <code>@ldlework/crt</code>'s phosphor pipeline. Plain TypeScript —
          no dials, no React, no DOM, no presets, no persistence. The
          application composes scope with whatever parameter system and
          persistence it wants. This page is one such application: the
          playground below drives scope through{' '}
          <code>@ldlework/dials</code>, rendered with{' '}
          <code>@ldlework/phosphor-dials</code>.
        </p>
        <div className="site-links">
          <a href="https://www.npmjs.com/package/@ldlework/scope" target="_blank" rel="noreferrer">npm</a>
          <a href="https://github.com/ldlework/phosphor" target="_blank" rel="noreferrer">GitHub</a>
          <a href="./storybook/">Storybook</a>
        </div>
      </div>
    </section>
  )
}

/*
 * The playground. The page owns the preset; ScopeStage renders it on
 * a phosphor Display, TuningPanel edits it from a chrome chassis
 * alongside. `bump` re-renders after dial-value drags so the stage's
 * refs see fresh values; structural edits go through setPreset.
 */
function PlaygroundSection() {
  const [preset, setPreset] = useState<ScopePreset>(makeDefaultPreset)
  const [, bump] = useReducer((x: number) => x + 1, 0)

  useEffect(() => {
    let cancelled = false
    void loadPreset().then((loaded) => {
      if (!cancelled) setPreset(loaded)
    })
    return () => { cancelled = true }
  }, [])

  return (
    <section className="site-section" id="playground">
      <div className="site-container">
        <h2 className="site-h2">Playground</h2>
        <p className="site-prose site-demo-hint">
          A full wave rig — beam, sweep and trigger, noise floor,
          fundamentals, phase-locked bursts — plus the CRT screen dials
          and a pointer trail. Every knob is modulatable: open a knob's
          picker to attach a source and watch the trace ride it. Save
          keeps your patch in this browser; Reset restores the default.
        </p>
        <div className="playground">
          <Display fill className="playground-display">
            <ScopeStage preset={preset} className="playground-stage" />
          </Display>
          <ChromePanel className="playground-chassis">
            <TuningPanel preset={preset} onChange={bump} setPreset={setPreset} />
          </ChromePanel>
        </div>
      </div>
    </section>
  )
}

function InTheBoxSection() {
  return (
    <section className="site-section" id="in-the-box">
      <div className="site-container site-container--narrow">
        <h2 className="site-h2">What's in the box</h2>
        <ul className="site-list">
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
      </div>
    </section>
  )
}

function InstallSection() {
  return (
    <section className="site-section" id="install">
      <div className="site-container site-container--narrow">
        <h2 className="site-h2">Install</h2>
        <CodeBlock lang="bash" code="pnpm add @ldlework/scope" />
        <p className="site-prose site-install-prose">
          The library is headless — model a wave, pump it, draw the
          samples however you like:
        </p>
        <CodeBlock lang="ts" code={USAGE_SNIPPET} />
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer className="site-footer">
      <div className="site-footer-links">
        <a href="https://github.com/ldlework/phosphor" target="_blank" rel="noreferrer">GitHub</a>
        <a href="./storybook/">Storybook</a>
        <a href="https://www.npmjs.com/package/@ldlework/scope" target="_blank" rel="noreferrer">npm</a>
      </div>
      <div>scope · MIT · @ldlework</div>
    </footer>
  )
}
