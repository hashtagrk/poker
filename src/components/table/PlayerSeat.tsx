import type { PlayerSummary } from '../../lib/ledger'
import type { Game } from '../../lib/types'
import { PlayerIdentity } from '../players/PlayerIdentity'
import { Button, Money } from '../ui'

type PlayerSeatProps = {
  game: Game
  summary: PlayerSummary
  index: number
  onRebuy: () => void
  onBorrow: () => void
  onRepay: () => void
  onEdit: () => void
}

export function PlayerSeat({ game, summary, index, onRebuy, onBorrow, onRepay, onEdit }: PlayerSeatProps) {
  const { player } = summary
  return (
    <article className="seat paper" style={{ '--seat-index': index } as React.CSSProperties} aria-label={`${player.name}, seat ${player.seat}`}>
      <header className="seat__head">
        <button type="button" className="seat__edit" onClick={onEdit} aria-label={`Edit ${player.name}`}>
          <PlayerIdentity player={player} />
        </button>
        <span className="seat__number">seat {player.seat}</span>
      </header>
      <div className="seat__figures">
        <span className="seat__figure">
          <span className="eyebrow">Paid in</span>
          <Money cents={summary.paidIn} currency={game.currency} compact />
        </span>
        <span className="seat__figure">
          <span className="eyebrow">Chips</span>
          <Money cents={summary.chipsReceived} currency={game.currency} tone="gold" compact />
        </span>
      </div>
      <div className="seat__loans" aria-label="Loans">
        {summary.rebuyCount > 0 && <span className="badge">{summary.rebuyCount}× rebuy</span>}
        {summary.lent > 0 && (
          <span className="badge badge--win">
            Lent <Money cents={summary.lent} currency={game.currency} compact />
          </span>
        )}
        {summary.borrowed - summary.owesBank > 0 && (
          <span className="badge badge--loss">
            Owes <Money cents={summary.borrowed - summary.owesBank} currency={game.currency} compact />
          </span>
        )}
        {summary.owesBank > 0 && (
          <span className="badge badge--loss">
            Owes bank <Money cents={summary.owesBank} currency={game.currency} compact />
          </span>
        )}
      </div>
      <div className="seat__actions">
        <Button size="sm" onClick={onRebuy}>
          Rebuy
        </Button>
        <Button size="sm" variant="ghost" onClick={onBorrow}>
          Borrow
        </Button>
        {summary.borrowed > 0 && (
          <Button size="sm" variant="ghost" className="seat__payoff" onClick={onRepay}>
            Pay off <Money cents={summary.borrowed} currency={game.currency} compact />
          </Button>
        )}
      </div>
    </article>
  )
}
