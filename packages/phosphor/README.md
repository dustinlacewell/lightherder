# @ldlework/phosphor

A React design system in the shape of late-80s / early-90s high-end audio
equipment: milled chrome chassis with raised plates, recessed OLED glass,
emitted-light pixel typography, a single-hue theme knob.

## Install

```bash
pnpm add @ldlework/phosphor
```

## Use

```tsx
import '@ldlework/phosphor/styles.css'
import { Display, PushButton, Panel } from '@ldlework/phosphor'

export function Example() {
  return (
    <Panel style={{ padding: 16 }}>
      <Display>
        <span className="screen-chip" data-lit="true">
          ON AIR
        </span>
      </Display>
      <PushButton>Engage</PushButton>
    </Panel>
  )
}
```

## Theming

One CSS variable drives the whole palette:

```css
:root { --theme-hue: 248; /* try 30 (amber), 145 (green), 320 (magenta) */ }
```

Colour math is OKLCH so perceptual brightness stays constant across hues.

## Primitives

- `Panel` — raised chrome plate (the chassis everything else mounts on)
- `Display` — chrome Lip + black Bezel + dark Screen (header / footer / readout slots)
- `PushButton` — three-layer pushable button
- `Modal` — backdrop + frame, designed to host a `Display` as the dialog
- `LeverSwitch` — two-position 3D rocker
- `SegmentedDisplay` — bare embedded screen with DSEG7 segmented digits
- `ScrubChipRow` — horizontal screen-chip row with drag-to-scrub selection
- `ChipToggle` — on-screen lit/unlit chip
- `HueStrip` — 360° OKLCH hue picker (bare embedded screen)
- `CodeBlock` — recessed code panel with theme-tracking syntax highlighting
