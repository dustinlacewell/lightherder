/*
 * ArcGauge-backed lerp control for dials' Panel.
 *
 * Conforms phosphor's ArcGauge to dials' `LerpControlProps` contract:
 * the slot's smoothing time constant in seconds (0 = off, the dial
 * snaps). The display window is 0–2 s — clamped for display only; the
 * gauge's own output is passed through as raw seconds.
 */

import type { ReactNode } from 'react'
import { ArcGauge } from '@ldlework/phosphor'
import type { LerpControlProps } from '@ldlework/dials/react'

export function LerpControl({ value, onChange }: LerpControlProps): ReactNode {
  return (
    <ArcGauge
      value={Math.min(2, Math.max(0, value))}
      range={[0, 2]}
      step={0.01}
      defaultValue={0}
      label="lerp"
      format={(v) => `${v.toFixed(2)}s`}
      onChange={onChange}
    />
  )
}
