import { formatTime } from '../../lib/format'
import { playerName } from '../../lib/ledger'
import { isBankLender, isBuyIn, type Game, type Transaction } from '../../lib/types'
import { useGameStore } from '../../store/gameStore'
import { Button, Money } from '../ui'

function openingBuyInIds(game: Game): Set<string> {
  const seen = new Set<string>()
  const ids = new Set<string>()
  for (const transaction of game.transactions) {
    if (!isBuyIn(transaction) || seen.has(transaction.playerId)) continue
    seen.add(transaction.playerId)
    ids.add(transaction.id)
  }
  return ids
}

function describe(game: Game, transaction: Transaction): { glyph: string; text: React.ReactNode; tone: string } {
  if (transaction.kind === 'loan' && isBankLender(transaction.lenderId)) {
    return {
      glyph: '⇄',
      tone: 'loan',
      text: (
        <>
          <strong>{playerName(game, transaction.borrowerId)}</strong> borrowed from the bank
        </>
      ),
    }
  }
  if (transaction.kind === 'loan') {
    const source = transaction.source === 'bank' ? 'paid the bank' : 'handed over chips'
    return {
      glyph: '⇄',
      tone: 'loan',
      text: (
        <>
          <strong>{playerName(game, transaction.lenderId)}</strong> lent <strong>{playerName(game, transaction.borrowerId)}</strong> · {source}
        </>
      ),
    }
  }
  if (transaction.kind === 'repayment') {
    const method = transaction.method === 'cash' ? 'in cash' : 'in chips'
    return {
      glyph: '↩',
      tone: 'repayment',
      text: (
        <>
          <strong>{playerName(game, transaction.borrowerId)}</strong> repaid <strong>{playerName(game, transaction.lenderId)}</strong> · {method}
        </>
      ),
    }
  }
  if (transaction.kind === 'rebuy') {
    return {
      glyph: '+',
      tone: 'rebuy',
      text: (
        <>
          <strong>{playerName(game, transaction.playerId)}</strong> rebought
        </>
      ),
    }
  }
  return {
    glyph: '♠',
    tone: 'buy-in',
    text: (
      <>
        <strong>{playerName(game, transaction.playerId)}</strong> bought in
      </>
    ),
  }
}

export function LedgerTimeline({ game }: { game: Game }) {
  const removeTransaction = useGameStore((state) => state.removeTransaction)
  const protectedIds = openingBuyInIds(game)
  const entries = [...game.transactions].reverse()
  return (
    <aside className="ledger felt-panel rise-in" aria-labelledby="ledger-heading">
      <div className="row row--between">
        <h2 id="ledger-heading">Ledger</h2>
        <span className="muted">{entries.length} entries</span>
      </div>
      <ol className="ledger__list">
        {entries.map((transaction) => {
          const { glyph, text, tone } = describe(game, transaction)
          const canRemove = !protectedIds.has(transaction.id)
          return (
            <li key={transaction.id} className="entry">
              <span className={`entry__glyph entry__glyph--${tone}`} aria-hidden="true">
                {glyph}
              </span>
              <span className="entry__text">
                <span>{text}</span>
                <span className="entry__meta">
                  {formatTime(transaction.at)}
                  {transaction.note && ` · ${transaction.note}`}
                </span>
              </span>
              <span className="entry__side">
                <Money
                  cents={transaction.amount}
                  currency={game.currency}
                  tone={transaction.kind === 'loan' || transaction.kind === 'repayment' ? 'gold' : 'neutral'}
                  compact
                />
                {canRemove && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="btn--icon entry__remove"
                    onClick={() => removeTransaction(game.id, transaction.id)}
                    aria-label="Remove entry"
                  >
                    ×
                  </Button>
                )}
              </span>
            </li>
          )
        })}
      </ol>
    </aside>
  )
}
