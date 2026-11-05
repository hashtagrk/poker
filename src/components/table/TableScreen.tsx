import { useState } from 'react'
import { derivePlayerSummaries, deriveTotals } from '../../lib/ledger'
import type { Game, PlayerId } from '../../lib/types'
import { useGameStore } from '../../store/gameStore'
import { PlayerEditorDialog } from '../players/PlayerEditorDialog'
import { LateSeatDialog, LoanDialog, RebuyDialog, RepayDialog } from './dialogs'
import { LedgerTimeline } from './LedgerTimeline'
import { PlayerSeat } from './PlayerSeat'
import { TotalsBar } from './TotalsBar'
import './table.css'

type DialogState =
  | { kind: 'rebuy'; playerId: PlayerId }
  | { kind: 'loan'; borrowerId: PlayerId }
  | { kind: 'repay'; borrowerId: PlayerId }
  | { kind: 'late-seat' }
  | { kind: 'edit'; playerId: PlayerId }
  | null

export function TableScreen({ game }: { game: Game }) {
  const beginCashOut = useGameStore((state) => state.beginCashOut)
  const [dialog, setDialog] = useState<DialogState>(null)
  const summaries = derivePlayerSummaries(game)
  const totals = deriveTotals(game, summaries)
  const firstPlayer = game.players[0]?.id ?? ''
  const close = () => setDialog(null)
  const editing = dialog?.kind === 'edit' ? (game.players.find((player) => player.id === dialog.playerId) ?? null) : null

  return (
    <div className="table">
      <TotalsBar
        game={game}
        totals={totals}
        summaries={summaries}
        onRebuy={() => setDialog({ kind: 'rebuy', playerId: firstPlayer })}
        onLoan={() => setDialog({ kind: 'loan', borrowerId: firstPlayer })}
        onRepay={() => setDialog({ kind: 'repay', borrowerId: firstPlayer })}
        onAddPlayer={() => setDialog({ kind: 'late-seat' })}
        onCashOut={() => beginCashOut(game.id)}
      />
      <section className="seats" aria-label="Seats">
        {summaries.map((summary, index) => (
          <PlayerSeat
            key={summary.player.id}
            game={game}
            summary={summary}
            index={index}
            onRebuy={() => setDialog({ kind: 'rebuy', playerId: summary.player.id })}
            onBorrow={() => setDialog({ kind: 'loan', borrowerId: summary.player.id })}
            onRepay={() => setDialog({ kind: 'repay', borrowerId: summary.player.id })}
            onEdit={() => setDialog({ kind: 'edit', playerId: summary.player.id })}
          />
        ))}
      </section>
      <LedgerTimeline game={game} />

      {dialog?.kind === 'rebuy' && <RebuyDialog game={game} playerId={dialog.playerId} onClose={close} />}
      {dialog?.kind === 'loan' && <LoanDialog game={game} borrowerId={dialog.borrowerId} onClose={close} />}
      {dialog?.kind === 'repay' && <RepayDialog game={game} borrowerId={dialog.borrowerId} onClose={close} />}
      {dialog?.kind === 'late-seat' && <LateSeatDialog game={game} onClose={close} />}
      <PlayerEditorDialog game={game} player={editing} onClose={close} />
    </div>
  )
}
