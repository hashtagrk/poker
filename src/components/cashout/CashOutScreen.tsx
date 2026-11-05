import { useState } from 'react'
import { pluralize } from '../../lib/format'
import { derivePlayerSummaries, deriveTotals } from '../../lib/ledger'
import { centsToUnits, parseAmount } from '../../lib/money'
import type { Game, PlayerId } from '../../lib/types'
import { useGameStore } from '../../store/gameStore'
import { PlayerIdentity } from '../players/PlayerIdentity'
import { Button, Field, Money, MoneyInput } from '../ui'
import './cashout.css'

type Drafts = Readonly<Record<PlayerId, string>>

function initialDrafts(game: Game): Drafts {
  return Object.fromEntries(Object.entries(game.cashOuts).map(([id, cents]) => [id, String(centsToUnits(cents))]))
}

export function CashOutScreen({ game }: { game: Game }) {
  const setCashOut = useGameStore((state) => state.setCashOut)
  const finalizeGame = useGameStore((state) => state.finalizeGame)
  const reopenGame = useGameStore((state) => state.reopenGame)
  const [drafts, setDrafts] = useState<Drafts>(() => initialDrafts(game))
  const [absorber, setAbsorber] = useState<PlayerId>(game.players[0]?.id ?? '')

  const summaries = derivePlayerSummaries(game)
  const totals = deriveTotals(game, summaries)
  const invalid = new Set(Object.entries(drafts).flatMap(([id, draft]) => (draft.trim() !== '' && parseAmount(draft) === null ? [id] : [])))

  const change = (playerId: PlayerId, value: string) => {
    setDrafts((current) => ({ ...current, [playerId]: value }))
    const trimmed = value.trim()
    if (trimmed === '') {
      setCashOut(game.id, playerId, null)
      return
    }
    const cents = parseAmount(trimmed)
    if (cents !== null) setCashOut(game.id, playerId, cents)
  }

  const absorb = () => {
    const current = game.cashOuts[absorber]
    if (current === undefined) return
    const adjusted = current - totals.discrepancy
    if (adjusted < 0) return
    setCashOut(game.id, absorber, adjusted)
    setDrafts((drafts) => ({ ...drafts, [absorber]: String(centsToUnits(adjusted)) }))
  }

  const allCounted = totals.playersCashedOut === game.players.length
  const absorberCanTake = (game.cashOuts[absorber] ?? 0) - totals.discrepancy >= 0

  return (
    <div className="cashout">
      <header className="cashout__head rise-in">
        <span className="eyebrow">Step 3 of 4</span>
        <h1>Count the chips</h1>
        <p className="muted">Enter what each player is holding. The total has to match the chips in play before you can settle.</p>
      </header>

      <section className="count paper rise-in" aria-label="Chip counts">
        <ul className="count__list">
          {summaries.map((summary) => (
            <li key={summary.player.id} className="count-row">
              <PlayerIdentity player={summary.player} />
              <span className="count-row__facts">
                <span>
                  In <Money cents={summary.paidIn} currency={game.currency} compact />
                </span>
                {(summary.lent > 0 || summary.borrowed > 0) && (
                  <span>
                    {summary.lent > 0 && (
                      <>
                        lent <Money cents={summary.lent} currency={game.currency} compact />
                      </>
                    )}
                    {summary.lent > 0 && summary.borrowed > 0 && ' · '}
                    {summary.borrowed > 0 && (
                      <>
                        owes <Money cents={summary.borrowed} currency={game.currency} compact />
                      </>
                    )}
                  </span>
                )}
              </span>
              <MoneyInput
                currency={game.currency}
                value={drafts[summary.player.id] ?? ''}
                onChange={(value) => change(summary.player.id, value)}
                invalid={invalid.has(summary.player.id)}
                aria-label={`${summary.player.name}'s chips`}
              />
              <span className="count-row__net">
                {summary.net === null ? <span className="muted">—</span> : <Money cents={summary.net} currency={game.currency} tone="sign" signed compact />}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <aside className="balance felt-panel rise-in" aria-label="Balance check">
        <div className="balance__rows">
          <div className="balance__row">
            <span className="muted">Chips in play</span>
            <Money cents={totals.inPlay} currency={game.currency} tone="gold" compact />
          </div>
          <div className="balance__row">
            <span className="muted">
              Counted ({totals.playersCashedOut} of {game.players.length})
            </span>
            <Money cents={totals.cashedOut} currency={game.currency} compact />
          </div>
          <div className="balance__row balance__row--total">
            <span>Difference</span>
            <Money cents={totals.discrepancy} currency={game.currency} tone="sign" signed compact />
          </div>
        </div>

        {totals.isBalanced ? (
          <p className="balance__status balance__status--ok" role="status">
            Every chip is accounted for.
          </p>
        ) : allCounted ? (
          <div className="stack">
            <p className="balance__status balance__status--off" role="status">
              {totals.discrepancy > 0 ? 'More chips counted than were issued.' : 'Some chips are missing.'} Recount, or assign the difference to one player.
            </p>
            <div className="balance__fix">
              <Field label="Assign difference to">
                {({ id }) => (
                  <select id={id} className="select" value={absorber} onChange={(event) => setAbsorber(event.target.value)}>
                    {game.players.map((player) => (
                      <option key={player.id} value={player.id}>
                        {player.name}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
              <Button onClick={absorb} disabled={!absorberCanTake}>
                Apply
              </Button>
            </div>
          </div>
        ) : (
          <p className="balance__status" role="status">
            {pluralize(game.players.length - totals.playersCashedOut, 'player')} still to count.
          </p>
        )}

        <Button variant="primary" size="lg" block onClick={() => finalizeGame(game.id)} disabled={!totals.isBalanced}>
          Settle up
        </Button>
        <Button variant="ghost" onClick={() => reopenGame(game.id)}>
          Back to the table
        </Button>
      </aside>
    </div>
  )
}
