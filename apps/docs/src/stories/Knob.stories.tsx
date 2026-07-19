import type { Meta, StoryObj } from '@storybook/react'
import { useEffect, useRef, useState } from 'react'
import { Knob, Panel } from '@ldlework/phosphor'

const meta: Meta<typeof Knob> = {
  title: 'Primitives/Knob',
  component: Knob,
}
export default meta

/**
 * The base dial: dim track, lit fill arc from the start angle to the
 * value, chrome cap with pointer. Drag vertically (Shift = fine),
 * scroll to nudge, arrows/Home on the keyboard, double-click to reset
 * to `defaultValue`.
 */
export const Default: StoryObj<typeof Knob> = {
  render: () => {
    const [v, setV] = useState(0.5)
    return (
      <Panel style={{ padding: 20 }}>
        <Knob
          value={v}
          baseline={v}
          range={[0, 1]}
          defaultValue={0.5}
          label="amp"
          onChangeBaseline={setV}
        />
      </Panel>
    )
  },
}

/**
 * `scale="log"` maps the drag onto a logarithmic value range — equal
 * drag distance covers equal ratios, so low-end precision matters as
 * much as high-end. Requires `range[0] > 0`. The readout stays in
 * user units.
 */
export const LogScale: StoryObj<typeof Knob> = {
  render: () => {
    const [v, setV] = useState(600)
    return (
      <Panel style={{ padding: 20 }}>
        <Knob
          value={v}
          baseline={v}
          range={[50, 3000]}
          scale="log"
          defaultValue={600}
          label="freq"
          unit="hz"
          onChangeBaseline={setV}
        />
      </Panel>
    )
  },
}

/**
 * `step` quantizes everything — drags snap to notches, each wheel
 * click moves exactly one, arrows too. `format` overrides the built-in
 * readout heuristic.
 */
export const Stepped: StoryObj<typeof Knob> = {
  render: () => {
    const [v, setV] = useState(0)
    return (
      <Panel style={{ padding: 20 }}>
        <Knob
          value={v}
          baseline={v}
          range={[-12, 12]}
          step={1}
          defaultValue={0}
          label="transpose"
          format={(x) => (x > 0 ? `+${x}` : `${x}`)}
          onChangeBaseline={setV}
        />
      </Panel>
    )
  },
}

/**
 * The full modulated look: an rAF-driven sine LFO wanders the live
 * value around the baseline — the fill arc and pointer ride it in the
 * modulation accent, sweeping over a white inlay band that marks the
 * modulation envelope the Knob derives from `depth`/`mode`. The
 * `mode` control cycles the three envelope shapes: `center` swings
 * `baseline ± depth`, `up` pushes only above the baseline, `down` only
 * below. Left-drag sets the baseline, sliding the whole envelope with
 * it; right-drag sets the depth, widening or narrowing the band; the
 * wheel nudges the baseline; Shift makes any of them finer.
 */
type Mode = 'center' | 'up' | 'down'
const MODE_NEXT: Record<Mode, Mode> = { center: 'up', up: 'down', down: 'center' }

export const Modulated: StoryObj<typeof Knob> = {
  render: () => {
    const [baseline, setBaseline] = useState(0.5)
    const [depth, setDepth] = useState(0.2)
    const [mode, setMode] = useState<Mode>('center')
    const [value, setValue] = useState(0.5)
    const SPEED = 0.4
    // Ref so the rAF loop reads the current baseline/depth/mode without
    // resubscribing.
    const cfg = useRef({ baseline, depth, mode })
    cfg.current = { baseline, depth, mode }
    const phase = useRef(0)
    useEffect(() => {
      let raf = 0
      let last = performance.now()
      const tick = (now: number) => {
        const dt = (now - last) / 1000
        last = now
        phase.current += dt * SPEED
        // Mirror the dials sampler on a [0, 1] linear slot: a bipolar
        // signal `s ∈ [-1, 1]` becomes `b = s` for center, `u =
        // (s+1)/2 ∈ [0, 1]` pushing one way for up/down. Clamped to
        // the range.
        const { baseline: b, depth: d, mode: m } = cfg.current
        const s = Math.sin(phase.current * Math.PI * 2)
        const u = (s + 1) / 2
        const raw =
          m === 'up' ? b + d * u : m === 'down' ? b - d * u : b + d * s
        setValue(Math.min(1, Math.max(0, raw)))
        raf = requestAnimationFrame(tick)
      }
      raf = requestAnimationFrame(tick)
      return () => cancelAnimationFrame(raf)
    }, [])
    return (
      <Panel style={{ padding: 20 }}>
        <Knob
          value={value}
          baseline={baseline}
          depth={depth}
          mode={mode}
          onChangeDepth={setDepth}
          range={[0, 1]}
          defaultValue={0.5}
          label="drift"
          onChangeBaseline={setBaseline}
        />
        <button
          type="button"
          style={{ marginTop: 12 }}
          onClick={() => setMode((m) => MODE_NEXT[m])}
        >
          mode: {mode}
        </button>
      </Panel>
    )
  },
}
