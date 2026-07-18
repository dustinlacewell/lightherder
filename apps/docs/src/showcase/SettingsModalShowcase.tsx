import { useEffect, useState } from 'react'
import {
  ChipToggle,
  HueStrip,
  Modal,
  Display,
  Panel,
  PushButton,
} from '@ldlework/phosphor'

type TabKey = 'display' | 'theme'
const TABS: ReadonlyArray<{ key: TabKey; label: string }> = [
  { key: 'display', label: 'Display' },
  { key: 'theme', label: 'Theme' },
]

/**
 * Settings modal showcase. A chassis Panel hosts an OLED for the
 * display readout and a recessed-glass HueStrip below it — the same
 * "chassis with mounted controls" metaphor every other Phosphor
 * composition uses.
 */
export function SettingsModalShowcase() {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState<TabKey>('display')
  const [fullscreen, setFullscreen] = useState(false)
  const [hue, setHue] = useState(82)

  useEffect(() => {
    document.documentElement.style.setProperty('--theme-hue', String(hue))
  }, [hue])

  return (
    <>
      <PushButton onClick={() => setOpen(true)}>Settings</PushButton>
      <Modal open={open} onClose={() => setOpen(false)} ariaLabel="Settings">
        <Panel style={{ padding: 20 }}>
          <Display>
            <div className="screen-chip-row">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  className="screen-chip"
                  data-lit={t.key === active ? 'true' : 'false'}
                  onClick={() => setActive(t.key)}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="screen-divider" />

            <div className="screen-rows" style={{ minHeight: 80 }}>
              {active === 'display' && (
                <div className="screen-row">
                  <span className="screen-row-label">Fullscreen</span>
                  <ChipToggle
                    value={fullscreen}
                    onChange={setFullscreen}
                    onLabel="ON"
                    offLabel="OFF"
                  />
                </div>
              )}
              {active === 'theme' && (
                <div className="screen-row">
                  <span className="screen-row-label">Hue</span>
                  <span className="screen-row-readout">
                    H {Math.round(hue).toString().padStart(3, '0')}°
                  </span>
                </div>
              )}
            </div>
          </Display>

          {active === 'theme' && (
            <>
              <div style={{ height: 14 }} />
              <HueStrip hue={hue} onChange={setHue} />
            </>
          )}
        </Panel>
      </Modal>
    </>
  )
}
