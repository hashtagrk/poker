import { downloadJson, formatDateTime, formatTime, slugify } from '../../lib/format'
import { settlementFor, transferKey } from '../../lib/game'
import { derivePlayerSummaries, deriveTotals, playerById } from '../../lib/ledger'
import { buildSummaryText } from '../../lib/summary'
import type { Game } from '../../lib/types'
import { useClipboard } from '../../hooks/useClipboard'
import { useGameStore } from '../../store/gameStore'
import { PlayerIdentity } from '../players/PlayerIdentity'
import { Button, CharacterAvatar, Money } from '../ui'
import './settlement.css'

export function SettlementScreen({ game }: { game: Game }) {
  const reopenGame = useGameStore((state) => state.reopenGame)
  const markPayoff = useGameStore((state) => state.markPayoff)
  const setActiveGame = useGameStore((state) => state.setActiveGame)
  const { copied, copy } = useClipboard()

  const summaries = [...derivePlayerSummaries(game)].sort((a, b) => (b.net ?? 0) - (a.net ?? 0))
  const totals = deriveTotals(game, summaries)
  const transfers = settlementFor(game)
  const leader = summaries[0]
  const everyoneEven = summaries.every((summary) => (summary.net ?? 0) === 0)
  const paidCount = transfers.filter((transfer) => game.payoffs[transferKey(transfer)]).length
  const allPaid = transfers.length > 0 && paidCount === transfers.length

  return (
    <div className="settlement">
      <header className="settlement__hero rise-in">
        <span className="eyebrow">Settled {game.settledAt ? formatDateTime(game.settledAt) : ''}</span>
        <h1>
          {everyoneEven ? (
            <>
              Everyone walks away <em>even</em>.
            </>
          ) : (
            <>
              <em>{leader.player.name}</em> takes the night.
            </>
          )}
        </h1>
        <p className="muted">
          <Money cents={totals.inPlay} currency={game.currency} tone="gold" compact /> changed hands across {game.players.length} players and{' '}
          {game.transactions.length} ledger entries.
        </p>
      </header>

      <div className="settlement__grid">
        <section className="results paper rise-in" aria-labelledby="results-heading">
          <h2 id="results-heading" className="sr-only">
            Results
          </h2>
          <table>
            <thead>
              <tr>
                <th scope="col">Player</th>
                <th scope="col">In</th>
                <th scope="col">Out</th>
                <th scope="col">Loans</th>
                <th scope="col">Net</th>
              </tr>
            </thead>
            <tbody>
              {summaries.map((summary) => (
                <tr key={summary.player.id}>
                  <td>
                    <PlayerIdentity player={summary.player} size={36} />
                  </td>
                  <td>
                    <Money cents={summary.paidIn} currency={game.currency} compact />
                  </td>
                  <td>
                    <Money cents={summary.cashOut ?? 0} currency={game.currency} compact />
                  </td>
                  <td className="muted">
                    {summary.lent - summary.borrowed === 0 ? '—' : <Money cents={summary.lent - summary.borrowed} currency={game.currency} signed compact />}
                  </td>
                  <td className="results__net">
                    <Money cents={summary.net ?? 0} currency={game.currency} tone="sign" signed compact />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>Table</td>
                <td>
                  <Money cents={totals.inPlay} currency={game.currency} compact />
                </td>
                <td>
                  <Money cents={totals.cashedOut} currency={game.currency} compact />
                </td>
                <td>—</td>
                <td>
                  <Money cents={0} currency={game.currency} compact />
                </td>
              </tr>
            </tfoot>
          </table>
        </section>

        <section className="transfers felt-panel rise-in" aria-labelledby="transfers-heading">
          <div className="row row--between">
            <h2 id="transfers-heading">Who pays whom</h2>
            {transfers.length > 0 && (
              <span className={`badge ${allPaid ? 'badge--win' : 'badge--gold'}`} role="status">
                {allPaid ? 'All squared up' : `${paidCount} of ${transfers.length} paid`}
              </span>
            )}
          </div>
          {transfers.length === 0 ? (
            <p className="muted">Nobody owes anything. Rare night.</p>
          ) : (
            <ol className="transfers__list">
              {transfers.map((transfer, index) => {
                const from = playerById(game, transfer.from)
                const to = playerById(game, transfer.to)
                if (!from || !to) return null
                const key = transferKey(transfer)
                const paidAt = game.payoffs[key]
                return (
                  <li key={key} className={`transfer ${paidAt ? 'transfer--paid' : ''}`} style={{ '--index': index } as React.CSSProperties}>
                    <span className="transfer__people">
                      <CharacterAvatar character={from.character} seat={from.seat} size={34} surface="felt" label={from.name} />
                      <span className="transfer__arrow" aria-hidden="true">
                        →
                      </span>
                      <CharacterAvatar character={to.character} seat={to.seat} size={34} surface="felt" label={to.name} />
                    </span>
                    <span className="transfer__text">
                      <span>
                        <strong>{from.name}</strong> pays <strong>{to.name}</strong>
                      </span>
                    </span>
                    <span className="transfer__side">
                      <Money cents={transfer.amount} currency={game.currency} tone="gold" compact />
                      <label className="transfer__paid">
                        <input type="checkbox" checked={Boolean(paidAt)} onChange={(event) => markPayoff(game.id, key, event.target.checked)} />
                        <span>{paidAt ? `Paid ${formatTime(paidAt)}` : 'Paid'}</span>
                      </label>
                    </span>
                  </li>
                )
              })}
            </ol>
          )}
          <p className="muted" style={{ fontSize: 'var(--text-xs)' }}>
            {transfers.length} transfer{transfers.length === 1 ? '' : 's'} is the fewest possible for this table. Loans are already netted in. Tick each one off
            as the money changes hands.
          </p>
        </section>
      </div>

      <div className="settlement__actions rise-in">
        <Button variant="primary" onClick={() => void copy(buildSummaryText(game, transfers))}>
          {copied ? 'Copied' : 'Copy summary'}
        </Button>
        <Button onClick={() => downloadJson(`${slugify(game.name)}.json`, game)}>Download JSON</Button>
        <Button variant="ghost" onClick={() => reopenGame(game.id)}>
          Reopen cash-out
        </Button>
        <Button variant="ghost" onClick={() => setActiveGame(null)}>
          League home
        </Button>
      </div>
    </div>
  )
}
