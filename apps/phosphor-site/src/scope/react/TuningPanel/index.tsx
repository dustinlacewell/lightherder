/*
 * Tuning panel — Screen | Waves | Pointer tabs. Edits the HeroPreset
 * dials tree owned by HeroScope. Save button POSTs the whole preset
 * via saveHeroPreset.
 */

import { useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Panel } from '@ldlework/dials/react'
import type { HeroPreset } from '../../preset/hero-preset'
import {
  addBurst,
  addFundamental,
  removeBurst,
  removeFundamental,
} from '../../preset/wave-ops'
import { randomWave } from '../../preset/hero-preset'
import { waveFromSnap, waveToSnap } from '../../preset/snap'
import { saveHeroPreset, type PresetEndpoint } from '../../preset/network'
import type { WaveDials } from '../../signal/wave-dials'
import type { BurstDials } from '../../signal/burst-dials'
import type { FundamentalDials } from '../../signal/fundamental-dials'
import { Tabs, ChildTabbed } from './tabs'
import { WaveActions } from './wave-actions'
import { TUNING_CSS } from './styles'

export interface TuningPanelProps {
  preset: HeroPreset
  onChange: () => void
  setPreset: (p: HeroPreset) => void
  endpoint: PresetEndpoint
}

export function TuningPanel(props: TuningPanelProps) {
  if (!import.meta.env.DEV) return null
  return <TuningPanelInner {...props} />
}

function TuningPanelInner({ preset, onChange, setPreset, endpoint }: TuningPanelProps) {
  const [open, setOpen] = useState(true)
  const [top, setTop] = useState<'screen' | 'waves' | 'pointer'>('waves')

  const refresh = () => {
    setPreset({ ...preset })
    onChange()
  }

  const onSave = async () => {
    try {
      await saveHeroPreset(preset, endpoint)
    } catch (e) {
      console.warn('[hero] preset save failed', e)
    }
  }

  return createPortal(
    <>
      <style>{TUNING_CSS}</style>
      <Frame open={open} setOpen={setOpen}>
        <Tabs
          tabs={[
            { key: 'screen', label: 'Screen' },
            { key: 'waves',  label: `Waves (${preset.waves.length})` },
            { key: 'pointer', label: 'Pointer' },
          ]}
          active={top}
          onSelect={(k) => setTop(k as typeof top)}
        />

        {top === 'screen' && (
          <div className="hero-body">
            <Panel dials={preset.screen} onChange={onChange} />
          </div>
        )}
        {top === 'waves' && (
          <WavesPane preset={preset} onChange={onChange} refresh={refresh} />
        )}
        {top === 'pointer' && (
          <div className="hero-body">
            <Panel dials={preset.pointer} onChange={onChange} />
          </div>
        )}

        <ActionBar onSave={onSave} onReload={() => setPreset({ ...preset })} />
      </Frame>
    </>,
    document.body,
  )
}

function Frame({
  open, setOpen, children,
}: {
  open: boolean
  setOpen: (fn: (o: boolean) => boolean) => void
  children: ReactNode
}) {
  return (
    <div
      className={'hero-tuning' + (open ? '' : ' is-closed')}
      data-hero-tuning=""
      aria-hidden={!open}
    >
      <button
        type="button"
        className="hero-tuning-toggle"
        onClick={() => setOpen((o) => !o)}
        title={open ? 'Hide tuning panel' : 'Show tuning panel'}
      >
        {open ? '→' : '←'}
      </button>
      <div className="hero-tuning-scroll">{children}</div>
    </div>
  )
}

function WavesPane({
  preset, onChange, refresh,
}: {
  preset: HeroPreset
  onChange: () => void
  refresh: () => void
}) {
  const [waveIdx, setWaveIdx] = useState(0)
  const activeIdx = Math.min(waveIdx, preset.waves.length - 1)
  const wave = preset.waves[activeIdx]!

  return (
    <div className="hero-body">
      <Tabs
        tabs={[
          ...preset.waves.map((_, i) => ({ key: String(i), label: String(i) })),
          { key: '+', label: '+', isAdd: true },
        ]}
        active={String(activeIdx)}
        onSelect={(k) => {
          if (k === '+') {
            preset.waves.push(randomWave())
            setWaveIdx(preset.waves.length - 1)
            refresh()
          } else {
            setWaveIdx(Number(k))
          }
        }}
      />

      <WaveActions
        canRemove={preset.waves.length > 1}
        onDuplicate={() => {
          const copy = waveFromSnap(waveToSnap(wave))
          preset.waves.splice(activeIdx + 1, 0, copy)
          setWaveIdx(activeIdx + 1)
          refresh()
        }}
        onRandomize={() => {
          preset.waves[activeIdx] = randomWave()
          refresh()
        }}
        onRemove={() => {
          if (preset.waves.length <= 1) return
          preset.waves.splice(activeIdx, 1)
          setWaveIdx(Math.max(0, activeIdx - 1))
          refresh()
        }}
      />

      <WaveSectionPane wave={wave} onChange={onChange} refresh={refresh} />
    </div>
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
      <Tabs
        tabs={[
          { key: 'beam',         label: 'Beam' },
          { key: 'sweep',        label: 'Sweep' },
          { key: 'noise',        label: 'Noise' },
          { key: 'fundamentals', label: `Fund (${wave.fundamentals.length})` },
          { key: 'bursts',       label: `Bursts (${wave.bursts.length})` },
        ]}
        active={waveTab}
        onSelect={(k) => setWaveTab(k as WaveTab)}
      />

      <div className="hero-body">
        {waveTab === 'beam'  && <Panel dials={wave.beam}       onChange={onChange} />}
        {waveTab === 'sweep' && <Panel dials={wave.sweep}      onChange={onChange} />}
        {waveTab === 'noise' && <Panel dials={wave.noiseFloor} onChange={onChange} />}

        {waveTab === 'fundamentals' && (
          <ChildTabbed
            items={wave.fundamentals}
            activeIdx={activeFundIdx}
            onSelect={setFundIdx}
            onAdd={() => {
              addFundamental(wave)
              setFundIdx(wave.fundamentals.length - 1)
              refresh()
            }}
            onRemove={
              wave.fundamentals.length > 1
                ? () => {
                    removeFundamental(wave, activeFundIdx)
                    setFundIdx(Math.max(0, activeFundIdx - 1))
                    refresh()
                  }
                : undefined
            }
            renderActive={(f: FundamentalDials) => (
              <Panel dials={f} onChange={onChange} />
            )}
          />
        )}

        {waveTab === 'bursts' && (
          <ChildTabbed
            items={wave.bursts}
            activeIdx={activeBurstIdx}
            onSelect={setBurstIdx}
            onAdd={() => {
              addBurst(wave)
              setBurstIdx(wave.bursts.length - 1)
              refresh()
            }}
            onRemove={
              wave.bursts.length > 0
                ? () => {
                    removeBurst(wave, activeBurstIdx)
                    setBurstIdx(Math.max(0, activeBurstIdx - 1))
                    refresh()
                  }
                : undefined
            }
            renderActive={(b: BurstDials) => (
              <Panel dials={b} onChange={onChange} />
            )}
            emptyHint="No bursts yet. Hit + to add one."
          />
        )}
      </div>
    </>
  )
}

function ActionBar({
  onSave, onReload,
}: {
  onSave: () => void
  onReload: () => void
}) {
  return (
    <div className="hero-bottom">
      <button type="button" onClick={onSave}>Save preset</button>
      <button type="button" onClick={onReload}>Reload</button>
    </div>
  )
}
