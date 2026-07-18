/*
 * DSEGWeather glyphs.
 *
 * The font maps codepoints 0..9 to weather icons (all-on / sun /
 * cloud / rain / hard-rain / snow / thunder-rain / thunder-hard-
 * rain / thunder / sun-cloud). Codepoint ':' is the unlit/off
 * pictogram, ';' is the secondary off pictogram. Capital letters
 * are reserved for cardinal-direction arrows in some flavours.
 *
 * See: https://www.keshikan.net/fonts-e.html
 *
 * We expose a typed enum so consumers never need to remember the
 * character mapping.
 */

const ICON_TO_CHAR = {
  off: ':',
  allOn: '0',
  sun: '1',
  cloud: '2',
  rain: '3',
  hardRain: '4',
  snow: '5',
  thunderRain: '6',
  thunderHardRain: '7',
  thunder: '8',
  sunCloud: '9',
} as const

export type WeatherIcon = keyof typeof ICON_TO_CHAR

interface WeatherGlyphProps {
  icon: WeatherIcon
  /** Inline style passthrough — set font-size to scale the glyph. */
  style?: React.CSSProperties
  className?: string
}

/**
 * A single DSEGWeather glyph. Renders the character for the given
 * icon enum in the DSEGWeather font; consumers control colour and
 * size via parent CSS (this component just owns the font-family
 * and the codepoint mapping).
 */
export function WeatherGlyph({ icon, style, className = '' }: WeatherGlyphProps) {
  return (
    <span
      aria-hidden
      className={`weather-glyph ${className}`}
      style={style}
    >
      {ICON_TO_CHAR[icon]}
    </span>
  )
}
