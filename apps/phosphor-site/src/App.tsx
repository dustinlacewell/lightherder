import { useCallback, useEffect, useState } from 'react'
import {
  ChipToggle,
  CodeBlock,
  HueStrip,
  LeverSwitch,
  Modal,
  Display,
  Panel,
  PushButton,
  ScrubChipRow,
  SegmentedDisplay,
  SegmentedSurface,
} from '@ldlework/phosphor'
import { HeroScope } from './scope'
import { DemoRow } from './components/DemoRow'
import { LabeledDisplay } from './components/LabeledDisplay'
import { WeatherGlyph, type WeatherIcon } from './components/WeatherGlyph'

/**
 * Shared hue state. The single source of truth is the `--theme-hue`
 * CSS custom property on <html>; multiple HueStrip demos on the page
 * read and write it through this hook so they don't fight each other.
 * The subscribe step pulls the current value out of the cascade on
 * mount and again whenever any consumer sets it.
 */
const HUE_EVENT = 'phosphor:hue-change'
function readHue(): number {
  const v = getComputedStyle(document.documentElement).getPropertyValue('--theme-hue')
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : 82
}
function useSharedHue() {
  const [hue, setHue] = useState<number>(() => (typeof document === 'undefined' ? 82 : readHue()))
  useEffect(() => {
    const onChange = () => setHue(readHue())
    window.addEventListener(HUE_EVENT, onChange)
    return () => window.removeEventListener(HUE_EVENT, onChange)
  }, [])
  const set = useCallback((next: number) => {
    document.documentElement.style.setProperty('--theme-hue', String(next))
    window.dispatchEvent(new CustomEvent(HUE_EVENT))
  }, [])
  return [hue, set] as const
}

export function App() {
  return (
    <div className="site">
      <Hero />
      <FeaturesSection />
      <PrimitivesSection />
      <InstallSection />
      <Footer />
    </div>
  )
}

/* ============================================================
 * Hero
 * ============================================================ */

function Hero() {
  return (
    <section className="site-hero">
      <div className="site-hero-stage">
        <Display style={{ width: '100%' }}>
          <div className="site-hero-screen">
            <div className="site-hero-scope" aria-hidden>
              <HeroScope />
            </div>
            <div className="site-hero-wordmark">PHOSPHOR</div>
            <div className="site-hero-tagline">
              A React design system from{' '}
              <a
                href="https://ldlework.com"
                target="_blank"
                rel="noreferrer"
                className="site-hero-tagline-link"
              >
                ldlework
              </a>
            </div>
            <div className="site-hero-cta">
              <button
                type="button"
                className="screen-chip site-hero-cta-chip"
                data-lit="true"
                onClick={() =>
                  document
                    .getElementById('primitives')
                    ?.scrollIntoView({ behavior: 'smooth' })
                }
              >
                Browse
              </button>
              <button
                type="button"
                className="screen-chip site-hero-cta-chip"
                data-lit="true"
                onClick={() =>
                  document
                    .getElementById('install')
                    ?.scrollIntoView({ behavior: 'smooth' })
                }
              >
                Install
              </button>
            </div>
          </div>
        </Display>
      </div>
    </section>
  )
}

/* ============================================================
 * Features trio
 * ============================================================ */

function FeaturesSection() {
  return (
    <section className="site-section">
      <div className="site-container">
        <h2 className="site-h2 site-features-title">
          Retrofuturistic hi-fi, for the web.
        </h2>
        <div className="site-features-grid">
          <p className="site-prose">
            Phosphor is modeled after high-end stereo equipment — brushed
            chrome chassis, recessed glass OLED screens, skeuomorphic push
            buttons, and rims that catch edge-glow from the lit pixels
            inside. Everything tints from a single OKLCH hue, so you can
            re-skin the whole library by setting one CSS variable.
          </p>
          <MetaphorDemo />
        </div>
      </div>
    </section>
  )
}

/**
 * One composed demo that shows the metaphor end-to-end:
 *   Panel (chassis)
 *     └─ Display (recessed glass)
 *         └─ HueStrip + readout (lit-pixel control)
 * Dragging the hue strip re-skins the whole page including the
 * chassis it sits on — the single-knob theming is the punchline.
 */
function MetaphorDemo() {
  const [hue, setHue] = useSharedHue()
  return (
    <Panel style={{ padding: 20 }}>
      {/* The OLED on top of the chassis displays the current hue;
          the recessed-glass HueStrip is a chassis-mounted control
          below it. Same Panel hosts both — that's the metaphor. */}
      <Display>
        <div className="screen-row">
          <span className="screen-row-label">Hue</span>
          <span className="screen-row-readout">
            H {Math.round(hue).toString().padStart(3, '0')}°
          </span>
        </div>
      </Display>
      <div style={{ height: 12 }} />
      <HueStrip hue={hue} onChange={setHue} />
    </Panel>
  )
}

/* ============================================================
 * Primitives listing
 * ============================================================ */

function PrimitivesSection() {
  return (
    <section className="site-section" id="primitives">
      <div className="site-container">
        <h2 className="site-h2">Primitives</h2>
        <p className="site-prose" style={{ marginBottom: 16 }}>
          Ten components covering the chassis-and-glass vocabulary.
          They compose freely — drop any one inside any other.
        </p>

        <DemoRow
          id="panel"
          side="left"
          name="Panel"
          description="A raised chrome plate — the chassis everything else sits on. Sized by its container; group related controls inside one Panel so they read as a single unit."
          demo={<PanelDemo />}
        />

        <DemoRow
          id="oledframe"
          side="right"
          name="Display"
          description="The chrome-bezelled OLED display. Anything you put on the glass renders as a lit pixel — including a live oscilloscope trace and on-glass chips that drive it."
          demo={<DisplayDemo />}
        />

        <DemoRow
          id="pushbutton"
          side="left"
          name="PushButton"
          description="A three-layer pushable button mounted on a Panel. Press, select, and disabled states all read at a glance through the brightness ladder."
          demo={<PushButtonDemo />}
        />

        <DemoRow
          id="modal"
          side="right"
          name="Modal"
          description="Backdrop, centered frame, Escape, click-outside. The dialog itself IS a Display; there is no extra modal chrome."
          demo={<ModalDemo />}
        />

        <DemoRow
          id="leverswitch"
          side="left"
          name="LeverSwitch"
          description="A two-position rocker with a 3D tilt, mounted on a Panel like every chassis control. One side glows; the other tilts back into the panel."
          demo={<LeverSwitchDemo />}
        />

        <DemoRow
          id="segmenteddisplay"
          side="right"
          name="SegmentedDisplay"
          description="A small recessed-glass digit display, the kind a hi-fi unit mounts on its faceplate. Real 7-segment numerals; chamfered rim catches edge-glow."
          demo={<SegmentedDisplayDemo />}
        />

        <DemoRow
          id="scrubchiprow"
          side="left"
          name="ScrubChipRow"
          description="A horizontal row of OLED chips with drag-to-scrub selection. Press and slide to sweep through values; the row tracks the pointer globally."
          demo={<ScrubChipDemo />}
        />

        <DemoRow
          id="chiptoggle"
          side="right"
          name="ChipToggle"
          description="One on-glass chip with lit / unlit states. Pass both labels to lock the chip's width so toggling never resizes the box."
          demo={<ChipToggleDemo />}
        />

        <DemoRow
          id="huestrip"
          side="left"
          name="HueStrip"
          description="A 360° OKLCH hue picker — a recessed-glass strip with the spectrum painted behind it. Drives the global theme variable so the whole page re-skins as you drag."
          demo={<HueStripDemo />}
        />

        <DemoRow
          id="codeblock"
          side="right"
          name="CodeBlock"
          description="A recessed-glass syntax-highlighted source panel. Every token color is a CSS variable that tracks the theme hue — the code re-skins live along with the rest of the chassis."
          demo={<CodeBlockDemo />}
        />
      </div>
    </section>
  )
}

/** The Panel demo is just the Panel. The point of the primitive is
 *  the chassis itself — the brushed plate, the rolled chamfer, the
 *  bottom catch-light. Putting "content" inside would distract from
 *  the only thing we're showing. */
function PanelDemo() {
  return (
    <Panel
      style={{
        width: '100%',
        height: '100%',
        boxSizing: 'border-box',
      }}
    />
  )
}

type RadioKey = 'low' | 'mid' | 'high'
const RADIO_OPTIONS: ReadonlyArray<{ key: RadioKey; label: string }> = [
  { key: 'low', label: 'Low' },
  { key: 'mid', label: 'Mid' },
  { key: 'high', label: 'High' },
]

function PushButtonDemo() {
  const [toggled, setToggled] = useState(false)
  const [radio, setRadio] = useState<RadioKey>('mid')
  return (
    <Panel
      style={{
        padding: 24,
        width: '100%',
        height: '100%',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        /* Distribute the three rows across the panel height. */
        justifyContent: 'space-around',
        gap: 14,
      }}
    >
      <div className="site-row-controls">
        <span className="chrome-emboss site-row-controls-label">Action</span>
        <PushButton>Engage</PushButton>
      </div>
      <div className="site-row-controls">
        <span className="chrome-emboss site-row-controls-label">Toggle</span>
        <PushButton
          selected={toggled}
          onClick={() => setToggled((s) => !s)}
          /* Stack both labels into the sizer so the button is sized
             to fit whichever is longer ("Off"). Without this it
             would resize as the visible label swaps. */
          sizer={
            <>
              <span>On</span>
              <span>Off</span>
            </>
          }
        >
          {toggled ? 'On' : 'Off'}
        </PushButton>
      </div>
      <div className="site-row-controls">
        <span className="chrome-emboss site-row-controls-label">Band</span>
        <div style={{ display: 'flex', gap: 8 }}>
          {RADIO_OPTIONS.map((o) => (
            <PushButton
              key={o.key}
              selected={radio === o.key}
              onClick={() => setRadio(o.key)}
            >
              {o.label}
            </PushButton>
          ))}
        </div>
      </div>
    </Panel>
  )
}

/* Display demo: oscilloscope on the glass with two on-glass chip
   rows driving the synthetic feed. Demonstrates the "anything on the
   glass is a lit pixel" rule with a working composition. */
const FREQ_OPTIONS = [
  { key: 'slow', label: 'Slow', mul: 0.5 },
  { key: 'med', label: 'Med', mul: 1 },
  { key: 'fast', label: 'Fast', mul: 2.4 },
] as const
type FreqKey = (typeof FREQ_OPTIONS)[number]['key']
const NOISE_OPTIONS = [
  { key: 'clean', label: 'Clean', n: 0 },
  { key: 'low', label: 'Lo', n: 0.06 },
  { key: 'high', label: 'Hi', n: 0.22 },
] as const
type NoiseKey = (typeof NOISE_OPTIONS)[number]['key']

function DisplayDemo() {
  const [freq, setFreq] = useState<FreqKey>('med')
  const [noise, setNoise] = useState<NoiseKey>('low')
  const freqMul = FREQ_OPTIONS.find((o) => o.key === freq)?.mul ?? 1
  const noiseVal = NOISE_OPTIONS.find((o) => o.key === noise)?.n ?? 0
  return (
    <Display
      style={{ width: '100%', height: '100%', boxSizing: 'border-box' }}
      /* The scope bleeds to the screen edge; the chip rows need
         a small inset so they don't kiss the chamfer. We split:
         the scope is absolutely positioned to fill the bare screen,
         and the rows sit in a padded sibling wrapper. */
    >
      <div
        style={{
          /* Scope layer — absolute to the .screen parent, fills
             corner-to-corner so the trace touches the chamfer. */
          position: 'absolute',
          inset: 0,
        }}
      >
        {/* DisplayDemo's chip-driven freq/noise no longer flow into
            the sweep signal — they only affected the old splat-era
            generator. The chips remain as a visual demo of on-glass
            ScrubChipRow; wiring them to override individual wave dials
            (e.g. by holding refs and mutating fundamental.freq.dial
            .value) is a follow-up. `noTuning` keeps the dev panel
            scoped to the hero scope only. */}
        <HeroScope noTuning />
      </div>
      <div
        style={{
          /* Control rows — sit in the bottom inset of the screen,
             padded in from the chamfer. position:relative keeps
             them above the absolute scope layer. */
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          gap: 8,
          padding: 16,
          justifyContent: 'flex-end',
          pointerEvents: 'none',
        }}
      >
        <div
          className="screen-row"
          style={{ gap: 12, pointerEvents: 'auto' }}
        >
          <span className="screen-row-label">Freq</span>
          <ScrubChipRow<FreqKey>
            items={FREQ_OPTIONS.map((o) => ({
              key: o.key,
              lit: o.key === freq,
              content: o.label,
            }))}
            onSelect={(k) => setFreq(k)}
          />
        </div>
        <div
          className="screen-row"
          style={{ gap: 12, pointerEvents: 'auto' }}
        >
          <span className="screen-row-label">Noise</span>
          <ScrubChipRow<NoiseKey>
            items={NOISE_OPTIONS.map((o) => ({
              key: o.key,
              lit: o.key === noise,
              content: o.label,
            }))}
            onSelect={(k) => setNoise(k)}
          />
        </div>
      </div>
    </Display>
  )
}

function ModalDemo() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Panel
        style={{
          padding: 24,
          width: '100%',
          height: '100%',
          boxSizing: 'border-box',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <PushButton onClick={() => setOpen(true)}>Open dialog</PushButton>
      </Panel>
      <Modal open={open} onClose={() => setOpen(false)} ariaLabel="Confirm">
        <Display>
          {/* Title on glass — lit-pixel typography, no chip pretense. */}
          <div className="site-modal-title">Confirm action</div>
          <p className="site-modal-body">
            This is the on-glass dialog body. Backdrop click or
            Escape dismisses; or use the chips below.
          </p>
          <div className="screen-divider" />
          <div
            className="screen-chip-row"
            style={{ justifyContent: 'flex-end' }}
          >
            <button
              type="button"
              className="screen-chip"
              data-lit="false"
              onClick={() => setOpen(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="screen-chip"
              data-lit="true"
              onClick={() => setOpen(false)}
            >
              Confirm
            </button>
          </div>
        </Display>
      </Modal>
    </>
  )
}

function LeverSwitchDemo() {
  const [pos, setPos] = useState<'left' | 'right'>('left')
  return (
    <Panel
      style={{
        padding: 20,
        width: '100%',
        height: '100%',
        boxSizing: 'border-box',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <LeverSwitch left="AUTO" right="MAN" position={pos} onChange={setPos} />
    </Panel>
  )
}

/* ============================================================
 * SegmentedDisplay demo — a faux weather/clock dashboard.
 *
 * Decomposed into small reusable pieces:
 *   useNow()           live clock state, ticks once a second
 *   ClockDisplay       HH:MM:SS with all-segments-on ghost
 *   DateDisplay        YYYY-MM-DD ditto
 *   TempDisplay        XX.X with a small °C glyph beside
 *   HumidityDisplay    XXX with a small %rh glyph beside
 *   ForecastCell       weather pictogram in a SegmentedSurface
 *   SegmentedDisplayDemo  composes the above on a Panel
 *
 * Each piece is something a consumer would build in their own app
 * with nothing but the published primitives. The SegmentedSurface
 * primitive is what makes the weather pictograms possible — it's
 * the bare two-layer EmbeddedScreen cutout with arbitrary content.
 * ============================================================ */

const GHOST_OFFSET = { x: 1, y: 1 } as const
const pad2 = (n: number) => n.toString().padStart(2, '0')
const pad3 = (n: number) => n.toString().padStart(3, '0')

function useNow() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(id)
  }, [])
  return now
}

function ClockDisplay() {
  const now = useNow()
  const time = `${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}`
  return (
    <SegmentedDisplay
      color="oklch(0.85 0.18 145)"
      ghost="88:88:88"
      ghostOffset={GHOST_OFFSET}
    >
      {time}
    </SegmentedDisplay>
  )
}

function DateDisplay() {
  const now = useNow()
  const date = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`
  return (
    <SegmentedDisplay ghost="8888-88-88" ghostOffset={GHOST_OFFSET}>
      {date}
    </SegmentedDisplay>
  )
}

/* Inner layout of the weather surface. Rendered TWICE — once for
   the lit layer (with the real icons + numbers) and once for the
   ghost layer (with all-on icons + all-8 digits). Both layers
   share the exact same DOM tree shape so they overlay per-glyph.
   Consumers pass a `variant` discriminating which one to render. */
interface WeatherPanelProps {
  variant: 'lit' | 'ghost'
  current: WeatherIcon
  incoming: WeatherIcon
  temp: number
  humidity: number
}

function WeatherPanel({
  variant,
  current,
  incoming,
  temp,
  humidity,
}: WeatherPanelProps) {
  // For the ghost layer, every glyph/digit becomes its all-on form.
  const cur = variant === 'lit' ? current : 'allOn'
  const inc = variant === 'lit' ? incoming : 'allOn'
  const tempText = variant === 'lit' ? temp.toFixed(1) : '88.8'
  const humText = variant === 'lit' ? pad3(humidity) : '888'
  return (
    <div className="weather-surface">
      <div className="weather-surface-forecast">
        <span className="weather-surface-label">FORECAST</span>
        <div className="weather-surface-forecast-row">
          <WeatherGlyph icon={cur} />
          <span className="weather-surface-arrow">→</span>
          <WeatherGlyph icon={inc} />
        </div>
      </div>

      <div className="weather-surface-readouts">
        <div className="weather-surface-readout">
          <span className="weather-surface-label">TEMPERATURE</span>
          <div className="weather-surface-readout-row">
            <span className="weather-surface-numeric">{tempText}</span>
            <span className="weather-surface-unit">°C</span>
          </div>
        </div>
        <div className="weather-surface-readout">
          <span className="weather-surface-label">HUMIDITY</span>
          <div className="weather-surface-readout-row">
            <span className="weather-surface-numeric">{humText}</span>
            <span className="weather-surface-unit">%rh</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function SegmentedDisplayDemo() {
  const weather = { current: 'sun', incoming: 'rain', temp: 23.7, humidity: 53 } as const
  return (
    <Panel
      style={{
        padding: 24,
        width: '100%',
        height: '100%',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        gap: 18,
      }}
    >
      {/* Two text-based displays at the top — Date / Time. Wraps to
          stacked when the panel is too narrow for both side-by-side. */}
      <div className="site-segdemo-row">
        <LabeledDisplay label="Date"><DateDisplay /></LabeledDisplay>
        <LabeledDisplay label="Time"><ClockDisplay /></LabeledDisplay>
      </div>

      {/* One big SegmentedSurface for the whole weather panel. The
          lit + ghost layers render the same WeatherPanel layout
          with different content so they stack per-glyph. */}
      <SegmentedSurface
        lit={<WeatherPanel variant="lit" {...weather} />}
        ghost={<WeatherPanel variant="ghost" {...weather} />}
        ghostOffset={GHOST_OFFSET}
        style={{
          padding: 18,
          // SegmentedSurface inherits `display: inline-grid` from
          // .segdisplay, which sizes to content. Force it to
          // claim the full row width of the Panel above so the
          // weather grid inside has a definite track to work with.
          width: '100%',
          boxSizing: 'border-box',
          flex: 1,
        }}
      />
    </Panel>
  )
}

type Note = 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B'
const NOTES: ReadonlyArray<Note> = ['C', 'D', 'E', 'F', 'G', 'A', 'B']

/* Layout for "Display fills the Panel, content centered on glass":
   the Panel is a flex parent, `<Display fill>` stretches the chassis
   + bezel + screen to claim the available space, and screenStyle adds
   the flex-column-center layout for the on-glass content. */
const CENTER_ON_GLASS = {
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
} as const

function ScrubChipDemo() {
  const [picked, setPicked] = useState<Note>('C')
  return (
    <Panel
      style={{
        padding: 20,
        width: '100%',
        height: '100%',
        boxSizing: 'border-box',
        display: 'flex',
      }}
    >
      <Display fill screenStyle={CENTER_ON_GLASS}>
        <ScrubChipRow<Note>
          items={NOTES.map((n) => ({ key: n, lit: n === picked, content: n }))}
          onSelect={(k) => setPicked(k)}
        />
      </Display>
    </Panel>
  )
}

function ChipToggleDemo() {
  const [on, setOn] = useState(true)
  return (
    <Panel
      style={{
        padding: 20,
        width: '100%',
        height: '100%',
        boxSizing: 'border-box',
        display: 'flex',
      }}
    >
      <Display fill screenStyle={CENTER_ON_GLASS}>
        <div
          className="screen-chip-row"
          style={{ justifyContent: 'center' }}
        >
          <ChipToggle value={on} onChange={setOn} onLabel="ON" offLabel="OFF" />
          <ChipToggle
            value={!on}
            onChange={(v) => setOn(!v)}
            onLabel="STANDBY"
            offLabel="LIVE"
          />
        </div>
      </Display>
    </Panel>
  )
}

function HueStripDemo() {
  const [hue, setHue] = useSharedHue()
  return (
    <Panel
      style={{
        padding: 20,
        width: '100%',
        height: '100%',
        boxSizing: 'border-box',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
      }}
    >
      <SegmentedDisplay style={{ minWidth: '5ch' }}>
        {Math.round(hue).toString().padStart(3, '0')}
      </SegmentedDisplay>
      <div style={{ flex: 1 }}>
        <HueStrip hue={hue} onChange={setHue} />
      </div>
    </Panel>
  )
}

/* CodeBlock demo — show the primitive highlighting a small but
   real-looking JSX snippet. The point is to demonstrate the live
   hue tracking (drag the HueStrip and the keywords/strings/comments
   re-tint along with the chassis), so the content is incidental —
   any plausible composition works. */
const CODEBLOCK_DEMO_SOURCE = `export function PowerStrip({ on, onToggle }) {
  return (
    <Display>
      <ChipToggle
        value={on}
        onChange={onToggle}
        onLabel="LIVE"
        offLabel="STANDBY"
      />
    </Display>
  )
}`

function CodeBlockDemo() {
  // CodeBlock brings its own chrome chassis (chrome plate + OLED
  // bezel), so the demo cell hosts it bare — no Panel wrapper. The
  // primitive is meant to read as a piece of hardware on whatever
  // background it sits on.
  return (
    <CodeBlock
      lang="tsx"
      code={CODEBLOCK_DEMO_SOURCE}
      style={{ width: '100%', minWidth: 0 }}
    />
  )
}

/* ============================================================
 * Install + footer
 * ============================================================ */

function InstallSection() {
  return (
    <section className="site-section site-section--narrow" id="install">
      <div className="site-container">
        <h2 className="site-h2">Install</h2>

        <CodeBlock lang="bash" code="pnpm add @ldlework/phosphor" />

        <p className="site-prose" style={{ marginTop: 16 }}>
          Import the stylesheet once, then use the primitives anywhere:
        </p>

        <CodeBlock
          lang="tsx"
          code={`import '@ldlework/phosphor/styles.css'
import { Display, PushButton } from '@ldlework/phosphor'

export function Example() {
  return (
    <Display>
      <span className="screen-chip" data-lit="true">
        ON AIR
      </span>
    </Display>
  )
}`}
        />

        <h3 className="site-h3" style={{ marginTop: 24 }}>Theming</h3>
        <p className="site-prose">
          One CSS variable drives the whole palette. Set <code>--theme-hue</code> on
          <code>:root</code> (or anywhere down-tree to scope it) and every chrome
          primitive re-skins in OKLCH. Perceptual brightness stays roughly
          constant across hues, so the visual hierarchy holds.
        </p>
        <CodeBlock
          lang="css"
          code={`:root { --theme-hue: 30; }   /* amber */
:root { --theme-hue: 145; }  /* phosphor green */
:root { --theme-hue: 320; }  /* magenta */`}
        />
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer className="site-footer">
      <div className="site-footer-links">
        <a href="https://github.com/ldlework/phosphor" target="_blank" rel="noreferrer">GitHub</a>
        <a href="./storybook/">Storybook</a>
        <a href="https://www.npmjs.com/package/@ldlework/phosphor" target="_blank" rel="noreferrer">npm</a>
      </div>
      <div>Phosphor · MIT · @ldlework</div>
    </footer>
  )
}
