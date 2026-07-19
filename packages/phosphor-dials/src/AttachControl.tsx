/*
 * Icon-based attach control for dials' Panel.
 *
 * Conforms phosphor's IconPicker to dials' `AttachControlProps`
 * contract: a small chrome trigger showing the current source's
 * waveform glyph, opening a popover grid of glyphs — one per candidate
 * source plus "none". Saves row width over the default text dropdown
 * and keeps the picker in the skeuomorphic hardware language.
 *
 * Attach/swap/detach logic mirrors dials' `DefaultAttachControl`
 * exactly: picking "none" detaches; picking a different source swaps
 * to a fresh instance — the modulation depth and mode live on the slot
 * and survive the swap on their own, so the envelope the user dialed in
 * is preserved; picking the current source is a no-op.
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
import { attachFrom, detach, setMode, type ModMode, type SourceDef } from '@ldlework/dials'
import type { AttachControlProps } from '@ldlework/dials/react'
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
 * Extra props beyond the dials contract — supplied only when a host
 * (the KnobSlider hosting the glyph in the dial) drives the popover's
 * open state externally, so a right-click on the dial can open it.
 * Omitted in the standalone row layout, where the picker manages its
 * own open state.
 *
 * `inDial` switches to the on-dial presentation: no trigger button —
 * the current source's glyph is painted as an inert SVG on the dial
 * face (by the host), and the popover is opened purely by the host's
 * right-click. `currentGlyph` exposes that glyph so the host can place
 * it; `AttachGlyph` below renders it.
 */
interface HostedAttachProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  inDial?: boolean
}

/**
 * The inert on-dial modulation glyph — the current source's waveform
 * (or the "none" mark). Pure SVG, pointer-events off, so the right-
 * click that opens the picker passes straight through to the dial.
 */
export function AttachGlyph({
  slot,
}: {
  slot: AttachControlProps['slot']
}): ReactNode {
  const name = slot.attached?.def.name ?? ''
  return (
    <span
      className={`pd-knob-glyph ${slot.attached ? 'is-attached' : ''}`}
      aria-hidden="true"
    >
      {name ? sourceIcon(name) : noneIcon}
    </span>
  )
}

export function AttachControl({
  slot, candidates, onChange, open, onOpenChange, inDial = false,
}: AttachControlProps & HostedAttachProps): ReactNode {
  if (candidates.length === 0 && !slot.attached) return null
  const current = slot.attached?.def.name ?? ''
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
  const picker = (
    <IconPicker
      className={`pd-attach-picker ${slot.attached ? 'is-attached' : ''} ${inDial ? 'pd-attach-indial' : ''}`}
      label="Modulation source"
      value={current}
      options={options}
      // The trigger peeks the CURRENT selection's card — same card as
      // its grid cell, live trace included — not a generic explainer.
      // In-dial mode has no trigger, so the peek is off there.
      hoverContent={inDial ? undefined : currentDef ? sourceHover(currentDef) : noneHover}
      open={open}
      onOpenChange={onOpenChange}
      hideTrigger={inDial}
      footer={
        <ModeFooter
          mode={slot.modMode}
          onPick={(m) => {
            setMode(slot, m)
            onChange()
          }}
        />
      }
      onChange={(name) => {
        if (!name) {
          detach(slot)
        } else if (name !== current) {
          // The depth and mode live on the slot and survive the swap on
          // their own. The new source itself starts from fresh factory
          // defaults.
          detach(slot)
          const def = candidates.find((d) => d.name === name)
          if (def) attachFrom(slot, def)
        }
        onChange()
      }}
    />
  )

  // In-dial: the inert glyph is painted on the dial face and the
  // triggerless popover hangs off the same anchor. The standalone
  // layout is just the picker (trigger + popover) as before.
  return inDial ? (
    <>
      <AttachGlyph slot={slot} />
      {picker}
    </>
  ) : (
    picker
  )
}
