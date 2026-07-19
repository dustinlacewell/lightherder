import type { Meta, StoryObj } from '@storybook/react'
import { useState } from 'react'
import { IconPicker, Panel, type IconPickerOption } from '@ldlework/phosphor'
import { noneIcon, sourceIcon } from '@ldlework/phosphor-dials'

const meta: Meta<typeof IconPicker> = {
  title: 'Primitives/IconPicker',
  component: IconPicker,
}
export default meta

/** Every dials stdlib source name, in registration order. */
const SOURCE_NAMES = [
  'sine', 'tri', 'saw', 'square',
  'whiteNoise', 'valueNoise', 'perlin1D', 'fbm', 'brown',
  'smooth',
  'add', 'mul', 'lerp',
  'gate', 'phaseGate',
]

const options: IconPickerOption[] = [
  { value: '', label: 'none', icon: noneIcon },
  ...SOURCE_NAMES.map((name) => ({
    value: name,
    label: name,
    icon: sourceIcon(name),
  })),
]

/**
 * Compact icon selector: a small square chrome trigger showing the
 * current option's glyph; clicking opens a popover grid of glyph
 * cells (Escape or outside-click dismisses). For option sets told
 * apart by shape rather than name — here, the full set of waveform
 * glyphs `phosphor-dials` draws for dials' stdlib sources, so this
 * story doubles as the glyph gallery.
 */
export const Default: StoryObj<typeof IconPicker> = {
  render: () => {
    const [value, setValue] = useState('sine')
    return (
      <Panel style={{ padding: '20px 20px 180px', minWidth: 220 }}>
        <IconPicker
          value={value}
          options={options}
          onChange={setValue}
          label="Modulation source"
        />
      </Panel>
    )
  },
}

/**
 * Hover popups. `hoverContent` puts a HoverCard on the closed trigger
 * (suppressed while the popover is open); `option.hover` parks a card
 * flush beside the popover while that cell is hovered/focused — the
 * card never covers the grid, and only one shows at a time. Cells
 * carrying `hover` drop their native title tooltip so the two never
 * double up. Content is arbitrary — `<strong>` + `<span>` render in
 * the HelpTooltip title/body treatment.
 */
export const WithHoverCards: StoryObj<typeof IconPicker> = {
  render: () => {
    const [value, setValue] = useState('sine')
    const hoverOptions: IconPickerOption[] = options.map((o) => ({
      ...o,
      hover: (
        <>
          <strong>{o.label || 'none'}</strong>
          <span>Selects the {o.label || 'none'} option.</span>
        </>
      ),
    }))
    return (
      <Panel style={{ padding: '20px 20px 180px', minWidth: 220 }}>
        <IconPicker
          value={value}
          options={hoverOptions}
          onChange={setValue}
          label="Modulation source"
          hoverContent={
            <>
              <strong>Modulation source</strong>
              <span>Hover the closed trigger for this explainer; open the
              grid and hover cells for per-option cards.</span>
            </>
          }
        />
      </Panel>
    )
  },
}

/**
 * The `footer` slot: auxiliary controls pinned below the grid, fenced
 * off by a hairline rule. Footer clicks don't close the popover (it
 * dismisses only on option select, outside-click, or Escape), so it's
 * a place for related knobs the host wants at hand while picking —
 * here a live count of how many times the footer button was pressed.
 * `phosphor-dials`' attach control uses it for the modulation-mode
 * segment.
 */
export const WithFooter: StoryObj<typeof IconPicker> = {
  render: () => {
    const [value, setValue] = useState('sine')
    const [count, setCount] = useState(0)
    return (
      <Panel style={{ padding: '20px 20px 180px', minWidth: 220 }}>
        <IconPicker
          value={value}
          options={options}
          onChange={setValue}
          label="Modulation source"
          footer={
            <button
              type="button"
              className="chrome-iconpicker-cell"
              style={{ width: '100%' }}
              title="Stays open on click"
              onClick={() => setCount((n) => n + 1)}
            >
              tapped {count}×
            </button>
          }
        />
      </Panel>
    )
  },
}
