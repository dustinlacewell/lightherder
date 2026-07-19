import type { Meta, StoryObj } from '@storybook/react'
import { useCallback, useRef } from 'react'
import { CrtSurface, type DrawablePass, type DrawCtx } from '@ldlework/crt'
import { DepositPass, makeSegmentPump, type BeamFn, type SegmentPump } from '@ldlework/scope'

/**
 * `CrtSurface` owns the phosphor effect chain (decay → caller passes
 * → halation → present) but is content-agnostic — it renders whatever
 * `DrawablePass`es its `passes` factory returns. This demo feeds it
 * `@ldlework/scope`'s `DepositPass` (the beam deposit pass scope ships
 * for exactly this purpose) with a simple Lissajous sweep, standing in
 * for a real oscilloscope trace without the full wave/dials stack.
 */
const meta: Meta<typeof CrtSurface> = {
  title: 'Crt/CrtSurface',
  component: CrtSurface,
}
export default meta

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

export const LissajousSweep: StoryObj<typeof CrtSurface> = {
  render: () => {
    const depositRef = useRef<DepositPass | null>(null)
    const pumpRef = useRef<SegmentPump | null>(null)

    const passesFactory = useCallback(
      (gl: WebGL2RenderingContext): DrawablePass<DrawCtx>[] => {
        const deposit = new DepositPass(gl, SEGMENT_CAPACITY)
        deposit.setBeamWidth(1.5)
        depositRef.current = deposit
        pumpRef.current = makeSegmentPump(SEGMENT_CAPACITY)
        return [deposit]
      },
      [],
    )

    const stage = useCallback((t: number, dt: number) => {
      const deposit = depositRef.current
      const pump = pumpRef.current
      if (!deposit || !pump) return
      deposit.setBatch(pump.pump(lissajousBeam, t, dt))
    }, [])

    return (
      <div style={{ width: 480, height: 480 }}>
        <CrtSurface passes={passesFactory} stage={stage} intensity={1.2} />
      </div>
    )
  },
}
