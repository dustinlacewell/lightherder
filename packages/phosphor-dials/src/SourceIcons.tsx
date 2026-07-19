/*
 * Waveform glyphs for dials' stdlib sources.
 *
 * Pure presentation — no dials imports. Each glyph is a small
 * stroke-based SVG (24×16 viewBox, `currentColor` stroke) drawn to
 * stay legible at ~16px inside an IconPicker cell. The map is keyed
 * by stdlib source name; app-registered sources not in the map get
 * the generic-wave fallback via `sourceIcon()`.
 */

import type { ReactNode } from 'react'

/** Wrap one or more path `d` strings in the shared SVG shell. */
function glyph(...ds: string[]): ReactNode {
  return (
    <svg
      viewBox="0 0 24 16"
      width="100%"
      height="100%"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {ds.map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  )
}

/**
 * Glyphs keyed by stdlib source name. Shapes trace each source's
 * actual output character: one cycle for the oscillators, texture
 * sketches for the noises, operator marks for the combinators.
 */
export const SOURCE_ICONS: Record<string, ReactNode> = {
  /* One smooth full cycle. */
  sine: glyph('M2 8 C6 1, 8 1, 12 8 S18 15, 22 8'),
  /* One triangle cycle — linear ramps up and down. */
  tri: glyph('M2 8 L7 3 L17 13 L22 8'),
  /* Two rising ramps with vertical resets. */
  saw: glyph('M2 13 L11 3 L11 13 L20 3 L20 13'),
  /* One square pulse cycle. */
  square: glyph('M2 12 L2 4 L12 4 L12 12 L22 12 L22 4'),
  /* Dense uncorrelated zigzag — TV static. */
  whiteNoise: glyph('M2 8 L4 3 L6 12 L8 5 L10 13 L12 4 L14 11 L16 3 L18 12 L20 6 L22 9'),
  /* Gentle smooth wobble, a few bumps. */
  valueNoise: glyph('M2 10 C5 5, 7 5, 10 9 S14 12, 17 8 S21 5, 22 6'),
  /* Broader, cleaner wobble than valueNoise. */
  perlin1D: glyph('M2 8 C7 3, 11 3, 14 8 S19 13, 22 10'),
  /* Smooth base shape with fine ripple riding it. */
  fbm: glyph('M2 9 L4 7 L5 8 L7 5 L9 6 L11 4 L13 6 L15 8 L16 7 L18 10 L20 9 L22 11'),
  /* Meandering random-walk drift. */
  brown: glyph('M2 11 C5 11, 6 6, 9 7 S12 12, 15 9 S19 4, 22 6'),
  /* Hard step easing into a lowpassed curve. */
  smooth: glyph('M2 13 L7 13 C11 13, 11 4, 15 3.5 L22 3'),
  /* Sum operator. */
  add: glyph('M12 3 L12 13', 'M7 8 L17 8'),
  /* Product operator. */
  mul: glyph('M8 4 L16 12', 'M16 4 L8 12'),
  /* Two levels joined by a diagonal crossfade. */
  lerp: glyph('M2 12 L8 12 L16 4 L22 4'),
  /* Pulse train with flat closed gaps. */
  gate: glyph('M2 12 L4 12 L4 5 L8 5 L8 12 L13 12 L13 5 L17 5 L17 12 L22 12'),
  /* One pulse framed by window ticks. */
  phaseGate: glyph('M3 4 L3 12', 'M21 4 L21 12', 'M6 12 L9 12 L9 6 L15 6 L15 12 L18 12'),
}

/** Generic wave — for app-registered sources without a bespoke glyph. */
export const fallbackIcon: ReactNode = glyph('M4 9 C7 5, 9 5, 12 8 S17 11, 20 7')

/*
 * "No modulation" — an empty dashed circle. Sized to fill the same
 * fraction of the 24×16 box as the waveform glyphs (which span nearly
 * edge to edge): r=7 uses the full box height, so on the dial the mark
 * reads at the same visual weight as the others rather than looking
 * shrunken. Its stroke-width is bumped to match the glyphs' 1.5 at
 * their drawn scale.
 */
export const noneIcon: ReactNode = (
  <svg
    viewBox="0 0 24 16"
    width="100%"
    height="100%"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    strokeLinecap="round"
    aria-hidden="true"
  >
    <circle cx={12} cy={8} r={7} strokeDasharray="3 3" />
  </svg>
)

/** The glyph for a source name, or the generic-wave fallback. */
export function sourceIcon(name: string): ReactNode {
  return SOURCE_ICONS[name] ?? fallbackIcon
}

/**
 * Modulation-mode glyphs, in the same stroke idiom as the source
 * waveforms. `center` is a two-headed vertical arrow (swings both
 * ways), `up` a single up arrow (only above the base), `down` a single
 * down arrow (only below).
 */
export const MODE_ICONS: Record<'center' | 'up' | 'down', ReactNode> = {
  /* Vertical double-headed arrow — swings both ways. */
  center: glyph('M12 2 L12 14', 'M9 5 L12 2 L15 5', 'M9 11 L12 14 L15 11'),
  /* Up arrow — excursions only above the base. */
  up: glyph('M12 14 L12 2', 'M8 6 L12 2 L16 6'),
  /* Down arrow — excursions only below the base. */
  down: glyph('M12 2 L12 14', 'M8 10 L12 14 L16 10'),
}

/** The glyph for a modulation mode. */
export function modeIcon(mode: 'center' | 'up' | 'down'): ReactNode {
  return MODE_ICONS[mode]
}
