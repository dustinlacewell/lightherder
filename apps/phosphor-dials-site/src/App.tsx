import { useEffect } from 'react'
import { dial, read, attachFrom, setDepth, sine } from '@ldlework/dials'
import { Panel as DialsPanel } from '@ldlework/dials/react'
import { CodeBlock, Panel as ChromePanel } from '@ldlework/phosphor'
import { dialPanelComponents } from '@ldlework/phosphor-dials'

/*
 * Demo dial tree. `freq`/`amp`/`detune` are the Default story's synth
 * dials; the rAF loop below samples them every frame via read(), which
 * fills each slot's lastSample stash so a knob rides its live modulated
 * value the moment a source is attached from the picker in its face.
 *
 * `freq` starts pre-attached to a `sine` source so the page demonstrates
 * live modulation the moment it loads, instead of requiring the visitor
 * to discover the "↻ modulate…" picker themselves. Kept as a concretely-
 * typed object (not widened to `Dials`) so `synthDials.freq` stays
 * `Slot<number>` and attaches without an `any` cast.
 */
const synthDials = {
  freq: dial(600, { min: 50, max: 3000, scale: 'log', description: 'Oscillator pitch, in Hz.' }),
  amp: dial(0.5, { min: 0, max: 1, description: 'Output level, 0 to full.' }),
  detune: dial(0, { min: -100, max: 100, unit: '¢', description: 'Pitch offset in cents.' }),
}
// `sine`'s concrete params don't structurally satisfy attachFrom's erased
// `SourceDef<Record<string, unknown>, T>` — same variance gap documented
// in phosphor-dials' demoRecipes.ts; the runtime outType guard inside
// attachFrom is the real safety net, so the cast here is deliberate.
const sineOnFreq = attachFrom(synthDials.freq, sine as any)
sineOnFreq.params.freq.dial.value = 0.15 // slow sweep, easy to watch
setDepth(synthDials.freq, 0.4)

const INSTALL_SNIPPET = `import '@ldlework/phosphor/styles.css'
import '@ldlework/phosphor-dials/styles.css'
import { Panel } from '@ldlework/dials/react'
import { dialPanelComponents } from '@ldlework/phosphor-dials'

<Panel dials={mySurface} components={dialPanelComponents} />`

export function App() {
  // Host-app sampling loop: read() every frame keeps each slot's
  // lastSample fresh so an attached source's modulated value shows on
  // the knob without the Panel needing to know anything changed.
  useEffect(() => {
    let last = performance.now()
    let raf = requestAnimationFrame(function tick(now: number) {
      const dt = (now - last) / 1000
      last = now
      read(synthDials, { t: now / 1000, dt })
      raf = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <div className="site">
      <Hero />
      <DemoSection />
      <InstallSection />
      <Footer />
    </div>
  )
}

function Hero() {
  return (
    <section className="site-section site-hero">
      <div className="site-container">
        <p className="site-eyebrow">phosphor-dials</p>
        <h1 className="site-h1">Dials in the phosphor design language.</h1>
        <p className="site-prose site-hero-desc">
          A phosphor-styled component set for{' '}
          <a href="https://www.npmjs.com/package/@ldlework/dials" target="_blank" rel="noreferrer">
            @ldlework/dials
          </a>
          ' Panel. Pass <code>dialPanelComponents</code> to{' '}
          <code>&lt;Panel components={'{...}'}&gt;</code> and the whole dial
          tree — rows, headings, knobs, the modulation picker — renders in
          phosphor's chrome-and-glass chassis. No config, no per-slot
          styling; the same recursive modulation, in the hi-fi vocabulary.
        </p>
        <div className="site-links">
          <a href="https://www.npmjs.com/package/@ldlework/phosphor-dials" target="_blank" rel="noreferrer">npm</a>
          <a href="https://github.com/ldlework/phosphor" target="_blank" rel="noreferrer">GitHub</a>
          <a href="./storybook/">Storybook</a>
        </div>
      </div>
    </section>
  )
}

function DemoSection() {
  return (
    <section className="site-section" id="demo">
      <div className="site-container site-container--narrow">
        <h2 className="site-h2">Live demo</h2>
        <p className="site-prose site-demo-hint">
          A dials <code>Panel</code> rendered through{' '}
          <code>dialPanelComponents</code>, mounted on a phosphor chassis.
          <code>freq</code> starts modulated by a slow <code>sine</code> —
          watch the knob ride it. Open the "↻" picker in any knob's face to
          attach a different source (lfo, noise…); the row expands into a
          nested sub-panel of the source's own dials, recursively.
        </p>
        <ChromePanel style={{ padding: 24 }}>
          <div className="pd-demo-horizontal">
            <DialsPanel title="Synth" dials={synthDials} components={dialPanelComponents} />
          </div>
        </ChromePanel>
      </div>
    </section>
  )
}

function InstallSection() {
  return (
    <section className="site-section site-section--narrow" id="install">
      <div className="site-container site-container--narrow">
        <h2 className="site-h2">Install</h2>
        <CodeBlock lang="bash" code="pnpm add @ldlework/phosphor-dials" />
        <p className="site-prose site-install-prose">
          Import both stylesheets once (phosphor's chrome, then this
          package's layout-only CSS), then hand the bundle to dials' Panel:
        </p>
        <CodeBlock lang="tsx" code={INSTALL_SNIPPET} />
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
        <a href="https://www.npmjs.com/package/@ldlework/phosphor-dials" target="_blank" rel="noreferrer">npm</a>
      </div>
      <div>phosphor-dials · MIT · @ldlework</div>
    </footer>
  )
}
