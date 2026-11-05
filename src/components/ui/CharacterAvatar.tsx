import { characterById } from '../../lib/characters'
import type { CharacterId } from '../../lib/types'

type CharacterAvatarProps = {
  character: CharacterId
  /** Pixel size of the chip. */
  size?: number
  /** Staggers the idle animation so a table of seats does not move in lockstep. */
  seat?: number
  surface?: 'paper' | 'felt'
  animated?: boolean
  label?: string
}

const FACE = 'oklch(96% 0.02 85)'
const INK = 'oklch(22% 0.03 60)'

/**
 * Placeholder animated characters. Each id renders a face with a signature accessory;
 * the final character art can replace the `Accessory` switch without touching callers.
 */
function Accessory({ id }: { id: CharacterId }) {
  switch (id) {
    case 'c1':
      return (
        <g className="avatar__accessory">
          <rect x="12" y="24" width="16" height="9" rx="3" fill={INK} />
          <rect x="36" y="24" width="16" height="9" rx="3" fill={INK} />
          <path d="M28 27h8" stroke={INK} strokeWidth="2.5" />
        </g>
      )
    case 'c2':
      return (
        <g className="avatar__accessory">
          <path d="M14 20q18-14 36 0v4H14z" fill="oklch(45% 0.14 250)" />
          <path d="M10 24h44l-4 7H14z" fill="oklch(60% 0.12 250)" />
        </g>
      )
    case 'c3':
      return (
        <g className="avatar__accessory">
          <path d="M16 20l6-12 10 8 10-8 6 12z" fill="oklch(80% 0.14 85)" stroke="oklch(60% 0.14 75)" strokeWidth="1.5" strokeLinejoin="round" />
          <circle cx="22" cy="9" r="2" fill="oklch(65% 0.2 25)" />
          <circle cx="42" cy="9" r="2" fill="oklch(65% 0.2 25)" />
        </g>
      )
    case 'c4':
      return (
        <g className="avatar__accessory">
          <path d="M20 40q6-6 12 0q6-6 12 0q-4 7-12 3q-8 4-12-3z" fill={INK} />
        </g>
      )
    case 'c5':
      return (
        <g className="avatar__accessory">
          <path d="M14 26q18-22 36 0z" fill="oklch(55% 0.15 250)" />
          <rect x="12" y="22" width="40" height="7" rx="3" fill="oklch(70% 0.1 250)" />
          <circle cx="32" cy="7" r="4" fill="oklch(90% 0.02 85)" />
        </g>
      )
    case 'c6':
      return (
        <g className="avatar__accessory">
          <path d="M20 50l10 4-10 4z M44 50l-10 4 10 4z" fill="oklch(60% 0.2 310)" />
          <circle cx="32" cy="54" r="3" fill="oklch(45% 0.2 310)" />
        </g>
      )
    case 'c7':
      return (
        <g className="avatar__accessory">
          <path d="M14 34q0-20 18-20t18 20" fill="none" stroke={INK} strokeWidth="3.5" strokeLinecap="round" />
          <rect x="9" y="30" width="9" height="13" rx="4" fill="oklch(65% 0.18 55)" />
          <rect x="46" y="30" width="9" height="13" rx="4" fill="oklch(65% 0.18 55)" />
        </g>
      )
    case 'c8':
      return (
        <g className="avatar__accessory">
          {[0, 72, 144, 216, 288].map((angle) => (
            <ellipse key={angle} cx="47" cy="14" rx="3.5" ry="6" fill="oklch(78% 0.17 350)" transform={`rotate(${angle} 47 20)`} />
          ))}
          <circle cx="47" cy="20" r="3.5" fill="oklch(85% 0.14 85)" />
        </g>
      )
  }
}

export function CharacterAvatar({ character, size = 48, seat = 0, surface = 'paper', animated = true, label }: CharacterAvatarProps) {
  const definition = characterById(character)
  const style = {
    '--avatar-size': `${size}px`,
    '--avatar-chip': `var(${definition.chipVar})`,
    '--avatar-delay': `${(seat % 8) * -0.45}s`,
  } as React.CSSProperties
  const classes = ['avatar', surface === 'felt' && 'avatar--felt', !animated && 'avatar--still'].filter(Boolean).join(' ')
  return (
    <span className={classes} style={style} role="img" aria-label={label ?? definition.name}>
      <svg className="avatar__svg" viewBox="0 0 64 64" aria-hidden="true">
        <circle cx="32" cy="34" r="20" fill={FACE} />
        <g className="avatar__eyes">
          <ellipse cx="25" cy="30" rx="2.4" ry="3" fill={INK} />
          <ellipse cx="39" cy="30" rx="2.4" ry="3" fill={INK} />
        </g>
        <path d="M26 41q6 4 12 0" fill="none" stroke={INK} strokeWidth="2.2" strokeLinecap="round" />
        <circle cx="21" cy="37" r="2.5" fill="oklch(80% 0.1 25 / 0.6)" />
        <circle cx="43" cy="37" r="2.5" fill="oklch(80% 0.1 25 / 0.6)" />
        <Accessory id={character} />
      </svg>
    </span>
  )
}
