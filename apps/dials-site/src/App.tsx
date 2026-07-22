import { useEffect, useReducer, useRef } from 'react'
import { dial, read } from '@ldlework/dials'
import { Panel } from '@ldlework/dials/react'

/*
 * Demo dials tree. `freq` and `amp` are plain numbers you can drag;
 * attach a modulation source (sine, lfo, noise…) from the "modulate…"
 * picker on either row and its value starts riding the source live —
 * the Panel doesn't need to know anything changed, `read()` just picks
 * it up on the next frame.
 */
const params = {
  freq: dial(2, { min: 0.1, max: 12, step: 0.1, label: 'freq' }),
  amp: dial(0.6, { min: 0, max: 1, step: 0.01, label: 'amp' }),
}

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
    <>
      <section className="hero">
        <p className="hero-name">dials</p>
        <h1 className="hero-tagline">A parameter machine.</h1>
        <p className="hero-desc">
          An object of named slots; any slot's value can be driven by a
          modulation source whose own parameters are dials, recursively, no
          depth limit. Sample by pulling. Plain numbers out the other side.
          No time, no audio, no graphics, no React required.
        </p>
        <div className="links">
          <a href="https://www.npmjs.com/package/@ldlework/dials" target="_blank" rel="noreferrer">npm</a>
          <a href="https://github.com/ldlework/phosphor" target="_blank" rel="noreferrer">GitHub</a>
          <a href="./storybook/">Storybook</a>
        </div>
      </section>

      <h2>Live demo</h2>
      <div className="demo-panel">
        <p className="demo-hint">
          Attach a source to <code>freq</code> or <code>amp</code> via the
          "↻ modulate…" picker, then watch the readout below move on its own.
        </p>
        <Panel dials={params} onChange={forcePanel} />
        <p style={{ marginTop: 16 }}>
          <code>amp · sin(2π · freq · t)</code> ={' '}
          <span ref={readoutRef} style={{ color: 'var(--accent)' }}>0.0000</span>
        </p>
      </div>

      <h2>Install</h2>
      <pre><code>pnpm add @ldlework/dials</code></pre>
      <pre><code>{`import { dial, read, attach, instantiate, lfo } from '@ldlework/dials'

const params = {
  freq: dial(600, { min: 50, max: 3000 }),
  amp:  dial(0.5, { min: 0,  max: 1    }),
}

attach(params.freq, instantiate(lfo))   // freq now driven by an LFO

const { freq, amp } = read(params, { t: performance.now() / 1000 })`}</code></pre>

      <footer>dials · MIT · @ldlework</footer>
    </>
  )
}
