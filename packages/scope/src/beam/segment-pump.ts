/*
 * Segment pump — converts a stream of BeamSamples into the packed
 * per-segment instance data the DepositPass needs.
 *
 * Maintains the previous-sample position across calls so consecutive
 * non-break samples close into segments, and so a `break: true`
 * sample correctly starts a fresh chain at its (x, y) without
 * painting from the prior position.
 *
 * Pure TypeScript — testable in isolation, no GL involved.
 */

import { SEGMENT_STRIDE, type SegmentBatch } from './passes/DepositPass'
import type { BeamFn } from './types'

/**
 * Stateful packer. One instance per surface; reused across frames.
 */
export class SegmentPump {
  private prevX = 0
  private prevY = 0
  private havePrev = false

  constructor(
    private readonly maxSegments: number,
    /** Backing storage; one Float32Array shared across frames. */
    readonly batch: SegmentBatch,
  ) {}

  /**
   * Pull samples from `beamFn`, pack them into `batch.data`, and
   * update `batch.count`. Returns the same batch for chaining.
   */
  pump(beamFn: BeamFn, t: number, dt: number): SegmentBatch {
    const data = this.batch.data
    let n = 0
    for (const s of beamFn(t, dt)) {
      if (n >= this.maxSegments) break
      if (s.break) {
        this.havePrev = false
        continue
      }
      if (this.havePrev) {
        const i = n * SEGMENT_STRIDE
        data[i]     = this.prevX
        data[i + 1] = this.prevY
        data[i + 2] = s.x
        data[i + 3] = s.y
        data[i + 4] = s.beamI ?? 1
        data[i + 5] = s.beamWidth ?? 1
        n++
      }
      this.prevX = s.x
      this.prevY = s.y
      this.havePrev = true
    }
    this.batch.count = n
    return this.batch
  }
}

/** Fresh SegmentPump with a fresh backing array sized to `capacity`. */
export function makeSegmentPump(capacity: number): SegmentPump {
  const data = new Float32Array(capacity * SEGMENT_STRIDE)
  return new SegmentPump(capacity, { data, count: 0 })
}
