/*
 * Tuning panel — the playground's control chassis, mounted under the
 * screen. One header toolbar (section tabs + save/reset), then the
 * active section's controls. Collections (waves, fundamentals, bursts)
 * get an IndexStrip; dial trees render through phosphor-dials with the
 * root knobs flowing horizontally like a real front panel.
 */

import { useState } from 'react'
import { Panel as DialsPanel } from '@ldlework/dials/react'
import { IndexStrip, PushButton, Tabs } from '@ldlework/phosphor'
import { makeDialPanelComponents } from '@ldlework/phosphor-dials'
import type { ScopePreset } from '../preset/preset'
import { randomWave } from '../preset/preset'
import {
  addBurst,
  addFundamental,
  removeBurst,
  removeFundamental,
} from '../preset/wave-ops'
import { waveFromSnap, waveToSnap } from '../preset/snap'
import { savePreset, resetPreset } from '../preset/store'
import type { WaveDials } from '../signal/wave-dials'

/** Front-panel dial faces — engraved caption under each knob. */
const tuningComponents = makeDialPanelComponents({ knobSize: 52, caption: 'below' })

export interface TuningPanelProps {
  preset: ScopePreset
  /** Fired after any dial-value mutation so the host re-renders. */
  onChange: () => void
  /** Replaces the whole preset (reset, structural rebuild). */
  setPreset: (p: ScopePreset) => void
}

export function TuningPanel({ preset, onChange, setPreset }: TuningPanelProps) {
  const [top, setTop] = useState<'screen' | 'waves' | 'pointer'>('waves')

  const refresh = () => {
    setPreset({ ...preset })
    onChange()
  }

  return (
    <div className="tuning">
      <div className="tuning-header">
        <Tabs
          tabs={[
            { key: 'screen', label: 'Screen' },
            { key: 'waves', label: `Waves (${preset.waves.length})` },
            { key: 'pointer', label: 'Pointer' },
          ]}
          active={top}
          onSelect={(k) => setTop(k as typeof top)}
        />
        <div className="tuning-header-actions">
          <PushButton onClick={() => savePreset(preset)}>Save</PushButton>
          <PushButton onClick={() => void resetPreset().then(setPreset)}>
            Reset
          </PushButton>
        </div>
      </div>

      {top === 'screen' && (
        <DialsPanel dials={preset.screen} components={tuningComponents} onChange={onChange} />
      )}
      {top === 'waves' && (
        <WavesPane preset={preset} onChange={onChange} refresh={refresh} />
      )}
      {top === 'pointer' && (
        <DialsPanel dials={preset.pointer} components={tuningComponents} onChange={onChange} />
      )}
    </div>
  )
}

function WavesPane({
  preset, onChange, refresh,
}: {
  preset: ScopePreset
  onChange: () => void
  refresh: () => void
}) {
  const [waveIdx, setWaveIdx] = useState(0)
  const activeIdx = Math.min(waveIdx, preset.waves.length - 1)
  const wave = preset.waves[activeIdx]!

  return (
    <>
      <IndexStrip
        count={preset.waves.length}
        active={activeIdx}
        onSelect={setWaveIdx}
        chipState={(i) => (preset.waves[i]?.mute ? 'muted' : undefined)}
        actions={[
          {
            icon: '⚂', label: 'randomize wave',
            onClick: () => {
              preset.waves[activeIdx] = randomWave()
              refresh()
            },
          },
          {
            icon: '⧉', label: 'duplicate wave',
            onClick: () => {
              const copy = waveFromSnap(waveToSnap(wave))
              preset.waves.splice(activeIdx + 1, 0, copy)
              setWaveIdx(activeIdx + 1)
              refresh()
            },
          },
          {
            icon: '+', label: 'add wave',
            onClick: () => {
              preset.waves.push(randomWave())
              setWaveIdx(preset.waves.length - 1)
              refresh()
            },
          },
          {
            icon: '−', label: 'remove wave',
            disabled: preset.waves.length <= 1,
            onClick: () => {
              preset.waves.splice(activeIdx, 1)
              setWaveIdx(Math.max(0, activeIdx - 1))
              refresh()
            },
          },
        ]}
      />

      <WaveSectionPane wave={wave} onChange={onChange} refresh={refresh} />
    </>
  )
}

type WaveTab = 'beam' | 'sweep' | 'noise' | 'fundamentals' | 'bursts'

function WaveSectionPane({
  wave, onChange, refresh,
}: {
  wave: WaveDials
  onChange: () => void
  refresh: () => void
}) {
  const [waveTab, setWaveTab] = useState<WaveTab>('beam')
  const [fundIdx, setFundIdx] = useState(0)
  const [burstIdx, setBurstIdx] = useState(0)

  const activeFundIdx = Math.min(fundIdx, wave.fundamentals.length - 1)
  const activeBurstIdx = Math.min(burstIdx, Math.max(0, wave.bursts.length - 1))

  return (
    <>
      <div className="tuning-row">
        <Tabs
          tabs={[
            { key: 'beam', label: 'Beam' },
            { key: 'sweep', label: 'Sweep' },
            { key: 'noise', label: 'Noise' },
            { key: 'fundamentals', label: `Fund (${wave.fundamentals.length})` },
            { key: 'bursts', label: `Bursts (${wave.bursts.length})` },
          ]}
          active={waveTab}
          onSelect={(k) => setWaveTab(k as WaveTab)}
        />
        <PushButton
          selected={wave.mute}
          onClick={() => {
            wave.mute = !wave.mute
            refresh()
          }}
        >
          Mute
        </PushButton>
      </div>

      {waveTab === 'beam' && (
        <DialsPanel dials={wave.beam} components={tuningComponents} onChange={onChange} />
      )}
      {waveTab === 'sweep' && (
        <DialsPanel dials={wave.sweep} components={tuningComponents} onChange={onChange} />
      )}
      {waveTab === 'noise' && (
        <DialsPanel dials={wave.noiseFloor} components={tuningComponents} onChange={onChange} />
      )}

      {waveTab === 'fundamentals' && (
        <>
          <IndexStrip
            count={wave.fundamentals.length}
            active={activeFundIdx}
            onSelect={setFundIdx}
            actions={[
              {
                icon: '+', label: 'add fundamental',
                onClick: () => {
                  addFundamental(wave)
                  setFundIdx(wave.fundamentals.length - 1)
                  refresh()
                },
              },
              {
                icon: '−', label: 'remove fundamental',
                disabled: wave.fundamentals.length <= 1,
                onClick: () => {
                  removeFundamental(wave, activeFundIdx)
                  setFundIdx(Math.max(0, activeFundIdx - 1))
                  refresh()
                },
              },
            ]}
          />
          <DialsPanel
            dials={wave.fundamentals[activeFundIdx]!}
            components={tuningComponents}
            onChange={onChange}
          />
        </>
      )}

      {waveTab === 'bursts' && (
        <>
          <IndexStrip
            count={wave.bursts.length}
            active={activeBurstIdx}
            onSelect={setBurstIdx}
            actions={[
              {
                icon: '+', label: 'add burst',
                onClick: () => {
                  addBurst(wave)
                  setBurstIdx(wave.bursts.length - 1)
                  refresh()
                },
              },
              {
                icon: '−', label: 'remove burst',
                disabled: wave.bursts.length === 0,
                onClick: () => {
                  removeBurst(wave, activeBurstIdx)
                  setBurstIdx(Math.max(0, activeBurstIdx - 1))
                  refresh()
                },
              },
            ]}
          />
          {wave.bursts.length > 0 ? (
            <DialsPanel
              dials={wave.bursts[activeBurstIdx]!}
              components={tuningComponents}
              onChange={onChange}
            />
          ) : (
            <div className="tuning-empty">No bursts yet. Hit + to add one.</div>
          )}
        </>
      )}
    </>
  )
}
