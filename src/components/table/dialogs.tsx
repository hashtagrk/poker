import { useState, type FormEvent } from 'react'
import { MAX_NOTE_LENGTH, MAX_PLAYER_NAME_LENGTH } from '../../lib/game'
import { debtKey, outstandingDebts } from '../../lib/ledger'
import { centsToUnits, formatMoney, parseAmount } from '../../lib/money'
import type { Game, LoanSource, PlayerId, RepaymentMethod } from '../../lib/types'
import { useGameStore } from '../../store/gameStore'
import { RosterChips } from '../players/RosterChips'
import { Button, Dialog, Field, MoneyInput } from '../ui'
import type { LeagueMember } from '../../lib/roster'

function useAmount(initialCents: number) {
  const [value, setValue] = useState(String(centsToUnits(initialCents)))
  const [error, setError] = useState<string | null>(null)
  const validate = (): number | null => {
    const cents = parseAmount(value)
    if (cents === null || cents === 0) {
      setError('Enter an amount greater than zero')
      return null
    }
    setError(null)
    return cents
  }
  return { value, setValue, error, validate }
}

function PlayerSelect({
  game,
  id,
  value,
  onChange,
  exclude,
}: {
  game: Game
  id: string
  value: PlayerId
  onChange: (id: PlayerId) => void
  exclude?: PlayerId
}) {
  return (
    <select id={id} className="select" value={value} onChange={(event) => onChange(event.target.value)}>
      {game.players
        .filter((player) => player.id !== exclude)
        .map((player) => (
          <option key={player.id} value={player.id}>
            {player.name}
          </option>
        ))}
    </select>
  )
}

function NoteField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <Field label="Note">
      {({ id }) => (
        <input id={id} className="input" value={value} onChange={(event) => onChange(event.target.value)} maxLength={MAX_NOTE_LENGTH} placeholder="Optional" />
      )}
    </Field>
  )
}

type RebuyDialogProps = { game: Game; playerId: PlayerId; onClose: () => void }

export function RebuyDialog({ game, playerId: initialPlayerId, onClose }: RebuyDialogProps) {
  const recordTransaction = useGameStore((state) => state.recordTransaction)
  const [playerId, setPlayerId] = useState(initialPlayerId)
  const [note, setNote] = useState('')
  const amount = useAmount(game.defaultBuyIn)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const cents = amount.validate()
    if (cents === null) return
    if (recordTransaction(game.id, { kind: 'rebuy', playerId, amount: cents, note })) onClose()
  }

  return (
    <Dialog open title="Rebuy" onClose={onClose}>
      <form id="rebuy-form" className="stack" onSubmit={submit}>
        <Field label="Player">{({ id }) => <PlayerSelect game={game} id={id} value={playerId} onChange={setPlayerId} />}</Field>
        <Field label="Amount" error={amount.error}>
          {({ id, describedBy }) => (
            <MoneyInput
              id={id}
              size="lg"
              currency={game.currency}
              value={amount.value}
              onChange={amount.setValue}
              invalid={amount.error !== null}
              aria-describedby={describedBy}
              autoFocus
            />
          )}
        </Field>
        <NoteField value={note} onChange={setNote} />
      </form>
      <footer className="dialog__footer">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" type="submit" form="rebuy-form">
          Add rebuy
        </Button>
      </footer>
    </Dialog>
  )
}

type LoanDialogProps = { game: Game; borrowerId: PlayerId; onClose: () => void }

export function LoanDialog({ game, borrowerId: initialBorrowerId, onClose }: LoanDialogProps) {
  const recordTransaction = useGameStore((state) => state.recordTransaction)
  const firstOther = game.players.find((player) => player.id !== initialBorrowerId)?.id ?? initialBorrowerId
  const [borrowerId, setBorrowerId] = useState(initialBorrowerId)
  const [lenderId, setLenderId] = useState(firstOther)
  const [source, setSource] = useState<LoanSource>('bank')
  const [note, setNote] = useState('')
  const amount = useAmount(game.defaultBuyIn)

  const changeBorrower = (id: PlayerId) => {
    setBorrowerId(id)
    if (id === lenderId) setLenderId(game.players.find((player) => player.id !== id)?.id ?? id)
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const cents = amount.validate()
    if (cents === null) return
    if (recordTransaction(game.id, { kind: 'loan', lenderId, borrowerId, amount: cents, source, note })) onClose()
  }

  return (
    <Dialog open title="Loan between players" onClose={onClose}>
      <form id="loan-form" className="stack" onSubmit={submit}>
        <Field label="Borrower" hint="Who needs chips">
          {({ id }) => <PlayerSelect game={game} id={id} value={borrowerId} onChange={changeBorrower} />}
        </Field>
        <Field label="Lender" hint="Who is covering them">
          {({ id }) => <PlayerSelect game={game} id={id} value={lenderId} onChange={setLenderId} exclude={borrowerId} />}
        </Field>
        <Field label="Amount" error={amount.error}>
          {({ id, describedBy }) => (
            <MoneyInput
              id={id}
              size="lg"
              currency={game.currency}
              value={amount.value}
              onChange={amount.setValue}
              invalid={amount.error !== null}
              aria-describedby={describedBy}
            />
          )}
        </Field>
        <fieldset className="choice-group" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="field__label">Where do the chips come from?</legend>
          <label className="choice">
            <input type="radio" name="source" value="bank" checked={source === 'bank'} onChange={() => setSource('bank')} />
            <span>
              <span className="choice__title">New chips from the bank</span>
              <span className="choice__hint">The lender pays the bank. More money goes in play.</span>
            </span>
          </label>
          <label className="choice">
            <input type="radio" name="source" value="stack" checked={source === 'stack'} onChange={() => setSource('stack')} />
            <span>
              <span className="choice__title">Chips from the lender&apos;s stack</span>
              <span className="choice__hint">Chips move across the table. The bank is untouched.</span>
            </span>
          </label>
        </fieldset>
        <NoteField value={note} onChange={setNote} />
      </form>
      <footer className="dialog__footer">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" type="submit" form="loan-form">
          Record loan
        </Button>
      </footer>
    </Dialog>
  )
}

export function LateSeatDialog({ game, onClose }: { game: Game; onClose: () => void }) {
  const addPlayer = useGameStore((state) => state.addPlayer)
  const recordTransaction = useGameStore((state) => state.recordTransaction)
  const [name, setName] = useState('')
  const [member, setMember] = useState<LeagueMember | null>(null)
  const amount = useAmount(game.defaultBuyIn)

  const pick = (picked: LeagueMember) => {
    setMember(picked)
    setName(picked.name)
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const cents = amount.validate()
    if (cents === null) return
    const profile = member && member.name === name.trim() ? { title: member.title, character: member.character } : {}
    if (!addPlayer(game.id, name, profile)) return
    const added = useGameStore.getState().games[game.id]?.players.at(-1)
    if (added && recordTransaction(game.id, { kind: 'buy-in', playerId: added.id, amount: cents })) onClose()
  }

  return (
    <Dialog open title="Late seat" onClose={onClose}>
      <form id="late-seat-form" className="stack" onSubmit={submit}>
        <RosterChips seatedNames={game.players.map((player) => player.name)} onPick={pick} compact />
        <Field label="Name">
          {({ id }) => (
            <input
              id={id}
              className="input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={MAX_PLAYER_NAME_LENGTH}
              required
              autoFocus
            />
          )}
        </Field>
        <Field label="Buy-in" error={amount.error}>
          {({ id, describedBy }) => (
            <MoneyInput
              id={id}
              size="lg"
              currency={game.currency}
              value={amount.value}
              onChange={amount.setValue}
              invalid={amount.error !== null}
              aria-describedby={describedBy}
            />
          )}
        </Field>
      </form>
      <footer className="dialog__footer">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" type="submit" form="late-seat-form">
          Seat player
        </Button>
      </footer>
    </Dialog>
  )
}

type RepayDialogProps = { game: Game; borrowerId: PlayerId; onClose: () => void }

export function RepayDialog({ game, borrowerId: initialBorrowerId, onClose }: RepayDialogProps) {
  const recordTransaction = useGameStore((state) => state.recordTransaction)
  const debts = outstandingDebts(game)
  const borrowers = game.players.filter((player) => game.players.some((other) => (debts.get(debtKey(player.id, other.id)) ?? 0) > 0))
  const [borrowerId, setBorrowerId] = useState(borrowers.some((player) => player.id === initialBorrowerId) ? initialBorrowerId : (borrowers[0]?.id ?? ''))
  const lenders = game.players.filter((player) => (debts.get(debtKey(borrowerId, player.id)) ?? 0) > 0)
  const [lenderId, setLenderId] = useState(lenders[0]?.id ?? '')
  const activeLender = lenders.some((player) => player.id === lenderId) ? lenderId : (lenders[0]?.id ?? '')
  const owed = debts.get(debtKey(borrowerId, activeLender)) ?? 0
  const [method, setMethod] = useState<RepaymentMethod>('cash')
  const [note, setNote] = useState('')
  const amount = useAmount(owed)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const cents = amount.validate()
    if (cents === null) return
    if (recordTransaction(game.id, { kind: 'repayment', borrowerId, lenderId: activeLender, amount: cents, method, note })) onClose()
  }

  if (borrowers.length === 0) {
    return (
      <Dialog open title="Pay off a loan" onClose={onClose}>
        <p className="muted">Nobody owes anyone at the table right now.</p>
        <footer className="dialog__footer">
          <Button onClick={onClose}>Close</Button>
        </footer>
      </Dialog>
    )
  }

  return (
    <Dialog open title="Pay off a loan" onClose={onClose}>
      <form id="repay-form" className="stack" onSubmit={submit}>
        <Field label="Borrower" hint="Who is paying back">
          {({ id }) => (
            <select
              id={id}
              className="select"
              value={borrowerId}
              onChange={(event) => {
                setBorrowerId(event.target.value)
                setLenderId('')
              }}
            >
              {borrowers.map((player) => (
                <option key={player.id} value={player.id}>
                  {player.name}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Lender" hint={owed > 0 ? `Outstanding: ${formatMoney(owed, game.currency, { compact: true })}` : undefined}>
          {({ id, describedBy }) => (
            <select id={id} className="select" value={activeLender} onChange={(event) => setLenderId(event.target.value)} aria-describedby={describedBy}>
              {lenders.map((player) => (
                <option key={player.id} value={player.id}>
                  {player.name}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Amount" error={amount.error}>
          {({ id, describedBy }) => (
            <MoneyInput
              id={id}
              size="lg"
              currency={game.currency}
              value={amount.value}
              onChange={amount.setValue}
              invalid={amount.error !== null}
              aria-describedby={describedBy}
            />
          )}
        </Field>
        <fieldset className="choice-group" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="field__label">How is it being paid?</legend>
          <label className="choice">
            <input type="radio" name="method" value="cash" checked={method === 'cash'} onChange={() => setMethod('cash')} />
            <span>
              <span className="choice__title">Cash, away from the table</span>
              <span className="choice__hint">Chips stay where they are. The debt is cleared.</span>
            </span>
          </label>
          <label className="choice">
            <input type="radio" name="method" value="chips" checked={method === 'chips'} onChange={() => setMethod('chips')} />
            <span>
              <span className="choice__title">Chips handed back</span>
              <span className="choice__hint">Chips move from the borrower&apos;s stack to the lender&apos;s.</span>
            </span>
          </label>
        </fieldset>
        <NoteField value={note} onChange={setNote} />
      </form>
      <footer className="dialog__footer">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" type="submit" form="repay-form">
          Record payoff
        </Button>
      </footer>
    </Dialog>
  )
}
