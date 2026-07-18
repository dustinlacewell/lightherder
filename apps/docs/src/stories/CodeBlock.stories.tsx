import type { Meta, StoryObj } from '@storybook/react'
import { useEffect, useState } from 'react'
import { CodeBlock, HueStrip, Panel } from '@ldlework/phosphor'

const meta: Meta<typeof CodeBlock> = {
  title: 'Primitives/CodeBlock',
  component: CodeBlock,
}
export default meta

const TSX_EXAMPLE = `import { Display, ChipToggle } from '@ldlework/phosphor'

export function PowerStrip({ on, onToggle }) {
  // The chip is width-stable so the row never resizes.
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

const CSS_EXAMPLE = `/* The whole palette derives from one variable. */
:root {
  --theme-hue: 145; /* phosphor green */
}

.chrome-emboss {
  color: var(--chrome-button-label);
  text-shadow: var(--chrome-text-emboss);
}`

const BASH_EXAMPLE = `pnpm add @ldlework/phosphor`

export const TSX: StoryObj<typeof CodeBlock> = {
  render: () => (
    <CodeBlock lang="tsx" code={TSX_EXAMPLE} style={{ width: 520 }} />
  ),
}

/** CSS source — keywords, selectors, property names, and comments
 *  all derive their colors from the same --theme-hue, so the
 *  highlighting re-tints with the rest of the page. */
export const CSS: StoryObj<typeof CodeBlock> = {
  render: () => (
    <CodeBlock lang="css" code={CSS_EXAMPLE} style={{ width: 520 }} />
  ),
}

/** Shell — the bash grammar handles commands, flags, and strings.
 *  Short snippets like install commands work fine without ceremony. */
export const Bash: StoryObj<typeof CodeBlock> = {
  render: () => (
    <CodeBlock lang="bash" code={BASH_EXAMPLE} style={{ width: 520 }} />
  ),
}

/** CodeBlock brings its own chrome chassis (Lip · Bezel · Screen), so
 *  it works mounted bare on a Panel exactly the way a Display does —
 *  the two are interchangeable for "self-contained piece of hardware
 *  on the chassis." */
export const OnAPanel: StoryObj<typeof CodeBlock> = {
  render: () => (
    <Panel style={{ padding: 20, width: 560 }}>
      <CodeBlock lang="tsx" code={TSX_EXAMPLE} />
    </Panel>
  ),
}

/** Live theme tracking. Every token color derives from --theme-hue
 *  via OKLCH, so dragging the HueStrip re-tints every keyword,
 *  string, and comment in lockstep with the rest of the chassis. */
export const HueTracking: StoryObj<typeof CodeBlock> = {
  render: () => {
    const [hue, setHue] = useState(82)
    useEffect(() => {
      document.documentElement.style.setProperty('--theme-hue', String(hue))
    }, [hue])
    return (
      <Panel style={{ padding: 20, width: 560 }}>
        <CodeBlock lang="tsx" code={TSX_EXAMPLE} />
        <div style={{ height: 14 }} />
        <HueStrip hue={hue} onChange={setHue} />
      </Panel>
    )
  },
}
