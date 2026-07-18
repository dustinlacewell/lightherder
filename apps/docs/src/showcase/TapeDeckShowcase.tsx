import { useState } from 'react'
import {
  LeverSwitch,
  Display,
  Panel,
  PushButton,
  SegmentedDisplay,
} from '@ldlework/phosphor'

/**
 * A pretend tape-deck face — composes Panel as the chassis, an
 * Display for the on-glass display, a row of PushButtons for
 * transport, a LeverSwitch for monitor mode, and SegmentedDisplays
 * for time + level. Demonstrates the full physical / lit-pixel
 * vocabulary in one piece.
 */
export function TapeDeckShowcase() {
  const [transport, setTransport] = useState<'stop' | 'play' | 'rec'>('stop')
  const [monitor, setMonitor] = useState<'left' | 'right'>('left')

  return (
    <Panel style={{ padding: 24, width: 640 }}>
      <div style={{ display: 'flex', gap: 16, alignItems: 'stretch' }}>
        <Display
          style={{ flex: 1 }}
          header={
            <>
              <SegmentedDisplay>00:42</SegmentedDisplay>
              <SegmentedDisplay>−06.4</SegmentedDisplay>
            </>
          }
          footer={
            <span
              className="chrome-emboss"
              style={{ fontSize: 11, letterSpacing: '0.2em' }}
            >
              PHOSPHOR · MK II
            </span>
          }
        >
          <div className="screen-chip-row">
            <span
              className="screen-chip"
              data-lit={transport === 'play' ? 'true' : 'false'}
            >
              PLAY
            </span>
            <span
              className="screen-chip"
              data-lit={transport === 'rec' ? 'alt' : 'false'}
            >
              REC
            </span>
            <span
              className="screen-chip"
              data-lit={transport === 'stop' ? 'true' : 'false'}
            >
              STOP
            </span>
          </div>
          <div className="screen-divider" />
          <div className="screen-row">
            <span className="screen-row-label">Monitor</span>
            <span className="screen-row-readout">
              {monitor === 'left' ? 'TAPE' : 'SOURCE'}
            </span>
          </div>
        </Display>
      </div>

      <div style={{ display: 'flex', gap: 12, marginTop: 18, alignItems: 'center' }}>
        <PushButton selected={transport === 'play'} onClick={() => setTransport('play')}>
          ▶
        </PushButton>
        <PushButton selected={transport === 'stop'} onClick={() => setTransport('stop')}>
          ■
        </PushButton>
        <PushButton selected={transport === 'rec'} onClick={() => setTransport('rec')}>
          ●
        </PushButton>
        <div style={{ flex: 1 }} />
        <LeverSwitch
          left="TAPE"
          right="SRC"
          position={monitor}
          onChange={setMonitor}
        />
      </div>
    </Panel>
  )
}
