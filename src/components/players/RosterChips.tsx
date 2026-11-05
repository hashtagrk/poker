import { isSeated, LEAGUE_MEMBERS, type LeagueMember } from '../../lib/roster'
import { MAX_PLAYERS } from '../../lib/types'
import { Button, CharacterAvatar } from '../ui'
import './players.css'

type RosterChipsProps = {
  seatedNames: readonly string[]
  onPick: (member: LeagueMember) => void
  onPickAll?: (members: readonly LeagueMember[]) => void
  compact?: boolean
}

/** One-click seats for the league regulars, with their titles. */
export function RosterChips({ seatedNames, onPick, onPickAll, compact = false }: RosterChipsProps) {
  const seatsLeft = MAX_PLAYERS - seatedNames.length
  const available = LEAGUE_MEMBERS.filter((member) => !isSeated(seatedNames, member))
  if (available.length === 0) return null
  return (
    <div className={`roster-chips ${compact ? 'roster-chips--compact' : ''}`} aria-label="League regulars">
      <div className="roster-chips__head">
        <span className="eyebrow">League regulars</span>
        {onPickAll && seatsLeft > 0 && available.length > 1 && (
          <Button size="sm" variant="ghost" onClick={() => onPickAll(available.slice(0, seatsLeft))}>
            Seat {available.length <= seatsLeft ? 'everyone' : `next ${seatsLeft}`}
          </Button>
        )}
      </div>
      <ul className="roster-chips__list">
        {available.map((member) => (
          <li key={member.name}>
            <button
              type="button"
              className="roster-chip"
              onClick={() => onPick(member)}
              disabled={seatsLeft === 0}
              aria-label={member.title ? `Seat ${member.name}, ${member.title}` : `Seat ${member.name}`}
            >
              <CharacterAvatar character={member.character} size={compact ? 22 : 26} animated={false} />
              <span className="roster-chip__text">
                <span className="roster-chip__name">{member.name}</span>
                {member.title && <span className="roster-chip__title">{member.title}</span>}
              </span>
              <span className="roster-chip__plus" aria-hidden="true">
                +
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
