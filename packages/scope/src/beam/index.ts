/*
 * @ldlework/scope/beam — DepositPass + segment pump + BeamFn types.
 *
 * The oscilloscope-style consumer of @ldlework/crt. Register a
 * DepositPass with the Pipeline; pump beam samples each frame; the
 * pass deposits them into the same accumulator everything else uses.
 */

export { DepositPass, SEGMENT_STRIDE, type SegmentBatch } from './passes/DepositPass'
export { SegmentPump, makeSegmentPump } from './segment-pump'
export type { BeamFn, BeamSample } from './types'
