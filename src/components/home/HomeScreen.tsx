import { useMemo, useRef, useState, type FormEvent } from 'react'
import { formatDateTime, pluralize } from '../../lib/format'
import { MAX_GAME_NAME_LENGTH } from '../../lib/game'
import { leagueStandings, leagueTotals, type Standing } from '../../lib/league'
import { deriveTotals } from '../../lib/ledger'
import { centsToUnits, DEFAULT_BUY_IN, DEFAULT_CURRENCY, parseAmount } from '../../lib/money'
import type { Game, GameStatus } from '../../lib/types'
import { selectGamesNewestFirst, useGameStore } from '../../store/gameStore'
import { Button, CharacterAvatar, Field, Money, MoneyInput, Stat } from '../ui'
import './home.css'

const STATUS_LABEL: Record<GameStatus, string> = {
  setup: 'Seating',
  active: 'In progress',
  'cash-out': 'Counting chips',
  settled: 'Settled',
}

function NewGameForm() {
  const createGame = useGameStore((state) => state.createGame)
  const [name, setName] = useState('')
  const [currency, setCurrency] = useState(DEFAULT_CURRENCY)
  const [buyIn, setBuyIn] = useState(String(centsToUnits(DEFAULT_BUY_IN)))
  const [error, setError] = useState<string | null>(null)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const cents = parseAmount(buyIn)
    if (cents === null || cents === 0) {
      setError('Enter a buy-in greater than zero')
      return
    }
    setError(null)
    createGame({ name: name.trim() || 'League night', currency, defaultBuyIn: cents })
  }

  return (
    <form className="new-game paper rise-in" onSubmit={submit} aria-labelledby="new-game-heading">
      <h2 id="new-game-heading">Start a league night</h2>
      <Field label="Night name">
        {({ id }) => (
          <input
            id={id}
            className="input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Friday at the lodge"
            maxLength={MAX_GAME_NAME_LENGTH}
          />
        )}
      </Field>
      <div className="new-game__row">
        <Field label="Currency">
          {({ id }) => <input id={id} className="input" value={currency} onChange={(event) => setCurrency(event.target.value)} maxLength={3} required />}
        </Field>
        <Field label="Default buy-in" error={error} hint="Each seat can override this.">
          {({ id, describedBy }) => (
            <MoneyInput
              id={id}
              currency={currency || DEFAULT_CURRENCY}
              value={buyIn}
              onChange={setBuyIn}
              invalid={error !== null}
              aria-describedby={describedBy}
            />
          )}
        </Field>
      </div>
      <Button type="submit" variant="primary" size="lg" block>
        Set up the table
      </Button>
    </form>
  )
}

function SessionCard({ game }: { game: Game }) {
  const setActiveGame = useGameStore((state) => state.setActiveGame)
  const deleteGame = useGameStore((state) => state.deleteGame)
  const [confirming, setConfirming] = useState(false)
  const totals = deriveTotals(game)
  const tone = game.status === 'settled' ? 'badge--win' : game.status === 'active' ? 'badge--gold' : ''

  return (
    <article className="session felt-panel">
      <div className="session__title">
        <h3>{game.name}</h3>
        <span className={`badge ${tone}`}>{STATUS_LABEL[game.status]}</span>
      </div>
      <div className="session__actions">
        {confirming ? (
          <>
            <Button size="sm" variant="danger" onClick={() => deleteGame(game.id)}>
              Delete for good
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
              Keep
            </Button>
          </>
        ) : (
          <>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(true)} aria-label={`Delete ${game.name}`}>
              Delete
            </Button>
            <Button size="sm" onClick={() => setActiveGame(game.id)}>
              {game.status === 'settled' ? 'Review' : 'Open'}
            </Button>
          </>
        )}
      </div>
      <div className="session__meta">
        <span className="session__avatars" aria-label={pluralize(game.players.length, 'player')}>
          {game.players.map((player) => (
            <CharacterAvatar key={player.id} character={player.character} seat={player.seat} size={28} surface="felt" animated={false} label={player.name} />
          ))}
        </span>
        <span>{pluralize(game.players.length, 'player')}</span>
        {totals.inPlay > 0 && (
          <span>
            <Money cents={totals.inPlay} currency={game.currency} tone="gold" compact /> on the table
          </span>
        )}
        <span>{formatDateTime(game.updatedAt)}</span>
      </div>
    </article>
  )
}

function StandingsTable({ standings, currency }: { standings: readonly Standing[]; currency: string }) {
  return (
    <table className="standings__table">
      <thead>
        <tr>
          <th scope="col">#</th>
          <th scope="col" className="standings__player">
            Player
          </th>
          <th scope="col">Nights</th>
          <th scope="col">Best</th>
          <th scope="col">Worst</th>
          <th scope="col">All-time</th>
        </tr>
      </thead>
      <tbody>
        {standings.map((standing, index) => (
          <tr key={standing.name.toLowerCase()} className={index === 0 ? 'standings__leader' : ''}>
            <td className="standings__rank">{index + 1}</td>
            <td className="standings__player">
              <span className="player-identity">
                <CharacterAvatar character={standing.character} seat={index} size={36} animated={index === 0} label={standing.name} />
                <span className="player-identity__text">
                  <span className="player-identity__name">{standing.name}</span>
                  {standing.title && <span className="player-identity__title">{standing.title}</span>}
                </span>
              </span>
            </td>
            <td>{standing.nights}</td>
            <td>
              <Money cents={standing.bestNight} currency={currency} tone="sign" signed compact />
            </td>
            <td>
              <Money cents={standing.worstNight} currency={currency} tone="sign" signed compact />
            </td>
            <td className="standings__net">
              <Money cents={standing.net} currency={currency} tone="sign" signed compact />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function HomeScreen() {
  const gameMap = useGameStore((state) => state.games)
  const importGame = useGameStore((state) => state.importGame)
  const fileInput = useRef<HTMLInputElement>(null)
  const games = useMemo(() => selectGamesNewestFirst(gameMap), [gameMap])
  const standings = useMemo(() => leagueStandings(games), [games])
  const league = useMemo(() => leagueTotals(games, standings), [games, standings])
  const leagueCurrency = games.find((game) => game.status === 'settled')?.currency ?? DEFAULT_CURRENCY

  const onImport = async (file: File | undefined) => {
    if (!file) return
    importGame(await file.text())
    if (fileInput.current) fileInput.current.value = ''
  }

  return (
    <div className="home">
      <section className="home__hero rise-in" aria-labelledby="home-heading">
        <span className="eyebrow">Members only · up to eight seats</span>
        <h1 id="home-heading">
          Alpine <em>Poker</em> League
        </h1>
        <p className="home__lede">
          The league ledger. Log every buy-in, rebuy and loan as it happens, count the chips once, and settle each night with the fewest possible transfers.
        </p>
        <dl className="home__stats">
          <Stat label="Nights settled">{league.nightsSettled}</Stat>
          <Stat label="Across the tables">
            <Money cents={league.volume} currency={leagueCurrency} tone="gold" compact />
          </Stat>
          <Stat label="Biggest night">
            {league.biggestWin ? (
              <>
                <Money cents={league.biggestWin.amount} currency={leagueCurrency} tone="sign" signed compact />{' '}
                <span className="home__stat-note">{league.biggestWin.name}</span>
              </>
            ) : (
              '—'
            )}
          </Stat>
        </dl>
      </section>

      <div className="home__grid">
        <NewGameForm />
        <section className="sessions" aria-labelledby="sessions-heading">
          <div className="sessions__head">
            <h2 id="sessions-heading">League nights</h2>
            <Button size="sm" variant="ghost" onClick={() => fileInput.current?.click()}>
              Import JSON
            </Button>
            <input
              ref={fileInput}
              type="file"
              accept="application/json,.json"
              className="sr-only"
              aria-label="Import a game file"
              onChange={(event) => void onImport(event.target.files?.[0])}
            />
          </div>
          {games.length === 0 ? (
            <div className="empty">
              <strong>No nights on record.</strong>
              <span>Set up a table and the first league night will appear here.</span>
            </div>
          ) : (
            games.map((game) => <SessionCard key={game.id} game={game} />)
          )}
        </section>
      </div>

      <section className="standings paper rise-in" aria-labelledby="standings-heading">
        <div className="standings__head">
          <div>
            <span className="eyebrow">Season table</span>
            <h2 id="standings-heading">League standings</h2>
          </div>
          <span className="muted">Settled nights only, matched by player name</span>
        </div>
        {standings.length === 0 ? (
          <div className="empty">
            <strong>Standings appear after the first settled night.</strong>
            <span>Finish a game and every player&apos;s all-time result lands here.</span>
          </div>
        ) : (
          <StandingsTable standings={standings} currency={leagueCurrency} />
        )}
      </section>
    </div>
  )
}
