import { pluralize } from '../../lib/format'
import type { GameTotals, PlayerSummary } from '../../lib/ledger'
import type { Game } from '../../lib/types'
import { Button, Money, Stat } from '../ui'

type TotalsBarProps = {
  game: Game
  totals: GameTotals
  summaries: readonly PlayerSummary[]
  onRebuy: () => void
  onLoan: () => void
  onRepay: () => void
  onAddPlayer: () => void
  onCashOut: () => void
}

export function TotalsBar({ game, totals, summaries, onRebuy, onLoan, onRepay, onAddPlayer, onCashOut }: TotalsBarProps) {
  const rebuys = summaries.reduce((sum, summary) => sum + summary.rebuyCount, 0)
  return (
    <section className="totals felt-panel rise-in" aria-label="Table totals">
      <Stat label="In play">
        <Money cents={totals.inPlay} currency={game.currency} tone="gold" compact />
      </Stat>
      <Stat label="Loans out">
        <Money cents={totals.loansOutstanding} currency={game.currency} compact />
      </Stat>
      <Stat label="Rebuys">{rebuys}</Stat>
      <Stat label="Seated">{pluralize(game.players.length, 'player')}</Stat>
      <div className="totals__actions">
        <Button onClick={onRebuy}>Rebuy</Button>
        <Button onClick={onLoan}>Loan</Button>
        <Button onClick={onRepay} disabled={totals.loansOutstanding === 0}>
          Pay off
        </Button>
        <Button variant="ghost" onClick={onAddPlayer} disabled={game.players.length >= 8}>
          Late seat
        </Button>
        <Button variant="primary" onClick={onCashOut}>
          Cash out
        </Button>
      </div>
    </section>
  )
}
