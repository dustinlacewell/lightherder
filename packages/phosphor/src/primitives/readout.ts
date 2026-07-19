/*
 * Shared numeric-readout heuristic for the dial family (Knob,
 * ArcGauge): compact fixed-point that keeps roughly three significant
 * digits across magnitudes, falling to exponential only below 0.01.
 * Internal — consumers override per-instance via the `format` prop.
 */
export function formatReadout(v: number, unit?: string): string {
  const abs = Math.abs(v)
  let s: string
  if (abs === 0) s = '0'
  else if (abs < 0.01) s = v.toExponential(1)
  else if (abs < 1) s = v.toFixed(3)
  else if (abs < 10) s = v.toFixed(2)
  else s = v.toFixed(1)
  return unit ? s + unit : s
}
