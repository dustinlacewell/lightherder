/*
 * Icon-based attach control for dials' Panel.
 *
 * Conforms phosphor's IconPicker to dials' `AttachControlProps`
 * contract: a small chrome trigger showing the current source's
 * waveform glyph, opening a popover grid of glyphs — one per candidate
 * source plus "none". Saves row width over the default text dropdown
 * and keeps the picker in the skeuomorphic hardware language.
 *
 * A PURE VIEW of dials' `AttachControlProps`: selection, mode, and
 * candidates in; `onPick`/`onMode` out. The Panel's SlotRow binds those
 * to `SlotActions`, so attach/swap/detach semantics (and a host's op
 * mediation) live upstream — this control cannot touch a slot.
 *
 * The picker popover always carries a footer: a compact three-option
 * segment (center / up / down) driving the slot's modulation mode, lit
 * in the modulation accent. Because mode is slot-level, the shape can
 * be pre-set before any source is attached. The trigger (`is-attached`)
 * carries the same accent so a modulated row is spottable at a glance.
 *
 * Everything hoverable here carries a HoverCard: the closed trigger
 * peeks the current selection's card (the same card as its grid cell,
 * live trace included), each source cell shows the source's name,
 * description, and a live SourcePreview sparkline actually running the
 * source, and each mode cell gets a one-liner. Native `title` tooltips
 * are off wherever a card covers the same ground.
 */

import type { ReactNode } from 'react'
import { type ModMode, type SourceDef } from '@ldlework/dials'
import { type AttachControlProps } from '@ldlework/dials/react'
import { HoverCard, IconPicker, type IconPickerOption } from '@ldlework/phosphor'
import { MODE_ICONS, noneIcon, sourceIcon } from './SourceIcons'
import { SourcePreview } from './SourcePreview'

const MODES: ModMode[] = ['center', 'up', 'down']
const MODE_HOVER: Record<ModMode, { title: string; body: string }> = {
  center: { title: 'Centered', body: 'Swings both ways from the set point.' },
  up: { title: 'Above', body: 'Pushes above the set point only.' },
  down: { title: 'Below', body: 'Pushes below the set point only.' },
}

/** Hover-card body for one source cell: name, one-liner, live trace. */
function sourceHover(def: SourceDef<Record<string, unknown>, unknown>): ReactNode {
  return (
    <>
      <strong>{def.name}</strong>
      {def.description ? <span>{def.description}</span> : null}
      <SourcePreview def={def} />
    </>
  )
}

const noneHover: ReactNode = (
  <>
    <strong>None</strong>
    <span>No modulation.</span>
  </>
)

/** Bottom-of-popover segment selecting the slot's modulation mode. */
function ModeFooter({
  mode, onPick,
}: {
  mode: ModMode
  onPick: (m: ModMode) => void
}): ReactNode {
  return (
    <div className="pd-mode-segment">
      {MODES.map((m) => (
        <HoverCard
          key={m}
          placement="side"
          anchorSelector=".chrome-iconpicker-popover"
          content={
            <>
              <strong>{MODE_HOVER[m].title}</strong>
              <span>{MODE_HOVER[m].body}</span>
            </>
          }
        >
          <button
            type="button"
            className={`chrome-iconpicker-cell ${m === mode ? 'is-mode' : ''}`}
            onClick={() => onPick(m)}
          >
            <span className="chrome-iconpicker-glyph" aria-hidden="true">
              {MODE_ICONS[m]}
            </span>
          </button>
        </HoverCard>
      ))}
    </div>
  )
}

/**
 * The inert on-dial modulation glyph — the current source's waveform
 * (or the "none" mark). Pure SVG, pointer-events off, so the right-
 * click that opens the picker passes straight through to the dial.
 */
export function AttachGlyph({
  current,
}: {
  current: string | null
}): ReactNode {
  return (
    <span
      className={`pd-knob-glyph ${current ? 'is-attached' : ''}`}
      aria-hidden="true"
    >
      {current ? sourceIcon(current) : noneIcon}
    </span>
  )
}

export function AttachControl({
  current, mode, candidates, onPick, onMode, hosted,
}: AttachControlProps): ReactNode {
  if (candidates.length === 0 && !current) return null
  const currentDef = candidates.find((d) => d.name === current)
  const options: IconPickerOption[] = [
    {
      value: '',
      label: 'none',
      icon: noneIcon,
      hover: noneHover,
    },
    ...candidates.map((d) => ({
      value: d.name,
      label: d.name,
      icon: sourceIcon(d.name),
      hover: sourceHover(d),
    })),
  ]
  // Hosted ⇔ in-dial: when a slider hosts this control it owns the open
  // state and paints the glyph on the dial face — no trigger button; the
  // popover is opened purely by the host's right-click. Standalone rows
  // keep the classic trigger + self-managed popover.
  const inDial = hosted !== undefined
  const picker = (
    <IconPicker
      className={`pd-attach-picker ${current ? 'is-attached' : ''} ${inDial ? 'pd-attach-indial' : ''}`}
      label="Modulation source"
      value={current ?? ''}
      options={options}
      // The trigger peeks the CURRENT selection's card — same card as
      // its grid cell, live trace included — not a generic explainer.
      // In-dial mode has no trigger, so the peek is off there.
      hoverContent={inDial ? undefined : currentDef ? sourceHover(currentDef) : noneHover}
      open={hosted?.open}
      onOpenChange={hosted?.onOpenChange}
      hideTrigger={inDial}
      footer={<ModeFooter mode={mode} onPick={onMode} />}
      // `onPick` handles detach (null), no-op (same name), and
      // swap-to-fresh upstream — depth and mode live on the slot and
      // survive a swap on their own. This control is a pure view.
      onChange={(name) => onPick(name || null)}
    />
  )

  return inDial ? (
    <>
      <AttachGlyph current={current} />
      {picker}
    </>
  ) : (
    picker
  )
}
