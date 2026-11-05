import { useState, type FormEvent } from 'react'
import { pluralize } from '../../lib/format'
import { MAX_GAME_NAME_LENGTH, MAX_PLAYER_NAME_LENGTH } from '../../lib/game'
import { centsToUnits, parseAmount, sumCents } from '../../lib/money'
import { MAX_PLAYERS, MIN_PLAYERS, type Cents, type Game, type Player, type PlayerId } from '../../lib/types'
import { useGameStore } from '../../store/gameStore'
import { PlayerEditorDialog } from '../players/PlayerEditorDialog'
import { PlayerIdentity } from '../players/PlayerIdentity'
import { RosterChips } from '../players/RosterChips'
import { Button, Field, Money, MoneyInput } from '../ui'
import './setup.css'

type BuyInDrafts = Readonly<Record<PlayerId, string>>

function resolveBuyIn(drafts: BuyInDrafts, player: Player, fallback: Cents): Cents | null {
  const draft = drafts[player.id]
  if (draft === undefined) return fallback
  return parseAmount(draft)
}

function SettingsPanel({ game }: { game: Game }) {
  const updateSettings = useGameStore((state) => state.updateSettings)
  const [name, setName] = useState(game.name)
  const [currency, setCurrency] = useState(game.currency)
  const [buyIn, setBuyIn] = useState(String(centsToUnits(game.defaultBuyIn)))
  const [buyInError, setBuyInError] = useState<string | null>(null)

  const commitBuyIn = () => {
    const cents = parseAmount(buyIn)
    if (cents === null || cents === 0) {
      setBuyInError('Enter an amount greater than zero')
      return
    }
    setBuyInError(null)
    if (cents !== game.defaultBuyIn) updateSettings(game.id, { defaultBuyIn: cents })
  }

  return (
    <div className="stack">
      <h2>Table settings</h2>
      <Field label="Game name">
        {({ id }) => (
          <input
            id={id}
            className="input"
            value={name}
            maxLength={MAX_GAME_NAME_LENGTH}
            onChange={(event) => setName(event.target.value)}
            onBlur={() => name.trim() && name !== game.name && updateSettings(game.id, { name })}
          />
        )}
      </Field>
      <Field label="Currency symbol">
        {({ id }) => (
          <input
            id={id}
            className="input"
            value={currency}
            maxLength={3}
            onChange={(event) => setCurrency(event.target.value)}
            onBlur={() => currency.trim() && currency !== game.currency && updateSettings(game.id, { currency })}
          />
        )}
      </Field>
      <Field label="Default buy-in" error={buyInError} hint="Used for new seats and rebuys.">
        {({ id, describedBy }) => (
          <MoneyInput
            id={id}
            currency={game.currency}
            value={buyIn}
            onChange={setBuyIn}
            onBlur={commitBuyIn}
            invalid={buyInError !== null}
            aria-describedby={describedBy}
          />
        )}
      </Field>
    </div>
  )
}

export function SetupScreen({ game }: { game: Game }) {
  const addPlayer = useGameStore((state) => state.addPlayer)
  const removePlayer = useGameStore((state) => state.removePlayer)
  const startGame = useGameStore((state) => state.startGame)
  const [newName, setNewName] = useState('')
  const [drafts, setDrafts] = useState<BuyInDrafts>({})
  const [editing, setEditing] = useState<Player | null>(null)

  const buyIns = game.players.map((player) => [player.id, resolveBuyIn(drafts, player, game.defaultBuyIn)] as const)
  const invalidIds = new Set(buyIns.filter(([, cents]) => cents === null || cents === 0).map(([id]) => id))
  const total = sumCents(buyIns.map(([, cents]) => cents ?? 0))
  const seatsLeft = MAX_PLAYERS - game.players.length
  const canStart = game.players.length >= MIN_PLAYERS && invalidIds.size === 0

  const submitPlayer = (event: FormEvent) => {
    event.preventDefault()
    if (addPlayer(game.id, newName)) setNewName('')
  }

  const start = () => {
    const resolved = Object.fromEntries(buyIns.flatMap(([id, cents]) => (cents === null ? [] : [[id, cents]])))
    startGame(game.id, resolved)
  }

  return (
    <div className="setup">
      <header className="setup__head rise-in">
        <span className="eyebrow">Step 1 of 4</span>
        <h1>Seat the table</h1>
        <p className="muted">Add everyone playing tonight and confirm what each person is buying in for.</p>
      </header>

      <section className="roster paper rise-in" aria-labelledby="roster-heading">
        <div className="roster__head">
          <h2 id="roster-heading">Seats</h2>
          <span className="muted">{seatsLeft === 0 ? 'Table is full' : `${pluralize(seatsLeft, 'seat')} left`}</span>
        </div>
        <form className="roster__add" onSubmit={submitPlayer}>
          <label className="sr-only" htmlFor="new-player">
            Player name
          </label>
          <input
            id="new-player"
            className="input"
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            placeholder="Player name"
            maxLength={MAX_PLAYER_NAME_LENGTH}
            disabled={seatsLeft === 0}
          />
          <Button type="submit" disabled={seatsLeft === 0 || newName.trim() === ''}>
            Add seat
          </Button>
        </form>
        <RosterChips
          seatedNames={game.players.map((player) => player.name)}
          onPick={(member) => addPlayer(game.id, member.name, { title: member.title, character: member.character })}
          onPickAll={(members) => {
            for (const member of members) {
              if (!addPlayer(game.id, member.name, { title: member.title, character: member.character })) break
            }
          }}
        />
        {game.players.length === 0 ? (
          <div className="empty">
            <strong>Nobody seated yet.</strong>
            <span>Add at least {MIN_PLAYERS} players to deal.</span>
          </div>
        ) : (
          <ul className="roster__list">
            {game.players.map((player) => (
              <li key={player.id} className="seat-row">
                <span className="seat-row__number" aria-label={`Seat ${player.seat}`}>
                  {player.seat}
                </span>
                <PlayerIdentity player={player} />
                <MoneyInput
                  className="seat-row__buyin"
                  currency={game.currency}
                  value={drafts[player.id] ?? String(centsToUnits(game.defaultBuyIn))}
                  onChange={(value) => setDrafts((current) => ({ ...current, [player.id]: value }))}
                  invalid={invalidIds.has(player.id)}
                  aria-label={`${player.name}'s buy-in`}
                />
                <span className="seat-row__actions">
                  <Button size="sm" variant="ghost" onClick={() => setEditing(player)}>
                    Edit
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => removePlayer(game.id, player.id)} aria-label={`Remove ${player.name}`}>
                    ×
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <aside className="setup__side felt-panel rise-in">
        <SettingsPanel game={game} />
        <div className="setup__summary">
          <span className="eyebrow">On the table</span>
          <strong>
            <Money cents={total} currency={game.currency} compact />
          </strong>
          <span className="muted">{pluralize(game.players.length, 'player')} buying in</span>
        </div>
        <Button variant="primary" size="lg" block onClick={start} disabled={!canStart}>
          Deal the cards
        </Button>
      </aside>

      <PlayerEditorDialog game={game} player={editing} onClose={() => setEditing(null)} />
    </div>
  )
}
