import { useEffect, useReducer, useRef } from 'react'
import { dial, read } from '@ldlework/dials'
import { Panel as DialsPanel } from '@ldlework/dials/react'
import { CodeBlock, Panel as ChromePanel } from '@ldlework/phosphor'
import { dialPanelComponents } from '@ldlework/phosphor-dials'

/*
 * Demo dials tree. `freq` and `amp` are plain numbers you can drag;
 * attach a modulation source (sine, noise…) from the picker on either
 * knob and its value starts riding the source live — the Panel doesn't
 * need to know anything changed, `read()` just picks it up on the next
 * frame.
 */
const params = {
  freq: dial(2, { min: 0.1, max: 12, step: 0.1, label: 'freq' }),
  amp: dial(0.6, { min: 0, max: 1, step: 0.01, label: 'amp' }),
}

const INSTALL_SNIPPET = `import { dial, read, attachFrom, sine } from '@ldlework/dials'

const params = {
  freq: dial(600, { min: 50, max: 3000 }),
  amp:  dial(0.5, { min: 0,  max: 1    }),
}

attachFrom(params.freq, sine)   // freq now rides a sine source

const { freq, amp } = read(params, { t: performance.now() / 1000 })`

export function App() {
  const [, forcePanel] = useReducer((x: number) => x + 1, 0)
  const readoutRef = useRef<HTMLSpanElement | null>(null)

  useEffect(() => {
    let raf = 0
    const t0 = performance.now()
    const tick = () => {
      const t = (performance.now() - t0) / 1000
      const { freq, amp } = read(params, { t })
      if (readoutRef.current) {
        readoutRef.current.textContent = (amp * Math.sin(2 * Math.PI * freq * t)).toFixed(4)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <div className="site">
      <Hero />
      <DemoSection readoutRef={readoutRef} onPanelChange={forcePanel} />
      <InstallSection />
      <Footer />
    </div>
  )
}

function Hero() {
  return (
    <section className="site-section site-hero">
      <div className="site-container">
        <p className="site-eyebrow">dials</p>
        <h1 className="site-h1">A parameter machine.</h1>
        <p className="site-prose site-hero-desc">
          An object of named slots; any slot's value can be driven by a
          modulation source whose own parameters are dials, recursively, no
          depth limit. Sample by pulling. Plain numbers out the other side.
          No time, no audio, no graphics, no React required — the knobs
          below are <code>@ldlework/phosphor-dials</code> dressing the
          library's headless React Panel.
        </p>
        <div className="site-links">
          <a href="https://www.npmjs.com/package/@ldlework/dials" target="_blank" rel="noreferrer">npm</a>
          <a href="https://github.com/ldlework/phosphor" target="_blank" rel="noreferrer">GitHub</a>
          <a href="./storybook/">Storybook</a>
        </div>
      </div>
    </section>
  )
}

function DemoSection({
  readoutRef,
  onPanelChange,
}: {
  readoutRef: React.RefObject<HTMLSpanElement | null>
  onPanelChange: () => void
}) {
  return (
    <section className="site-section" id="demo">
      <div className="site-container site-container--narrow">
        <h2 className="site-h2">Live demo</h2>
        <p className="site-prose site-demo-hint">
          Attach a source to <code>freq</code> or <code>amp</code> via the
          picker in a knob's face, then watch the readout below move on its
          own.
        </p>
        <ChromePanel style={{ padding: 24 }}>
          <div className="demo-horizontal">
            <DialsPanel dials={params} components={dialPanelComponents} onChange={onPanelChange} />
          </div>
          <p className="demo-readout">
            <code>amp · sin(2π · freq · t)</code> ={' '}
            <span ref={readoutRef}>0.0000</span>
          </p>
        </ChromePanel>
      </div>
    </section>
  )
}

function InstallSection() {
  return (
    <section className="site-section" id="install">
      <div className="site-container site-container--narrow">
        <h2 className="site-h2">Install</h2>
        <CodeBlock lang="bash" code="pnpm add @ldlework/dials" />
        <p className="site-prose site-install-prose">
          Headless core — define slots, attach sources, pull values:
        </p>
        <CodeBlock lang="ts" code={INSTALL_SNIPPET} />
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
        <a href="https://www.npmjs.com/package/@ldlework/dials" target="_blank" rel="noreferrer">npm</a>
      </div>
      <div>dials · MIT · @ldlework</div>
    </footer>
  )
}
