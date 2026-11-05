import { describe, expect, test } from 'vitest'
import { addPlayer, beginCashOut, createGame, finalizeGame, setCashOut, startGame, updatePlayer } from './game'
import { leagueStandings, leagueTotals } from './league'
import type { Game } from './types'

function settledNight(name: string, results: Record<string, [buyIn: number, cashOut: number]>, settledAt: string): Game {
  let game = createGame({ name, currency: '₹', defaultBuyIn: 50000 }, settledAt)
  for (const player of Object.keys(results)) game = addPlayer(game, player)
  game = startGame(game, Object.fromEntries(game.players.map((player) => [player.id, results[player.name][0]])), settledAt)
  game = beginCashOut(game)
  for (const player of game.players) game = setCashOut(game, player.id, results[player.name][1])
  return finalizeGame(game, settledAt)
}

describe('league standings', () => {
  test('aggregates nets across settled nights by name, ignoring case', () => {
    const first = settledNight('Night 1', { Ana: [50000, 80000], ben: [50000, 20000] }, '2026-01-01T00:00:00.000Z')
    const second = settledNight('Night 2', { ana: [50000, 30000], Ben: [50000, 70000], Cal: [50000, 50000] }, '2026-01-08T00:00:00.000Z')
    const open = addPlayer(createGame({ name: 'Open', currency: '₹', defaultBuyIn: 1 }), 'Ana')

    const standings = leagueStandings([second, first, open])
    expect(standings.map((standing) => [standing.name, standing.nights, standing.net])).toEqual([
      ['ana', 2, 10000],
      ['Cal', 1, 0],
      ['Ben', 2, -10000],
    ])
    expect(standings[0].bestNight).toBe(30000)
    expect(standings[0].worstNight).toBe(-20000)
    expect(standings[0].lastPlayed).toBe('2026-01-08T00:00:00.000Z')
  })

  test('keeps the most recent title when a later night has none', () => {
    let first = settledNight('Night 1', { Ana: [100, 100], Ben: [100, 100] }, '2026-01-01T00:00:00.000Z')
    first = { ...first, players: first.players.map((player) => (player.name === 'Ana' ? { ...player, title: 'The Shark' } : player)) }
    const second = settledNight('Night 2', { Ana: [100, 100], Ben: [100, 100] }, '2026-01-02T00:00:00.000Z')
    expect(leagueStandings([first, second]).find((standing) => standing.name === 'Ana')?.title).toBe('The Shark')
    const retitled = {
      ...second,
      players: second.players.map((player) =>
        player.name === 'Ana' ? updatePlayer(second, player.id, { title: 'River Rat' }).players.find((p) => p.id === player.id)! : player,
      ),
    }
    expect(leagueStandings([first, retitled]).find((standing) => standing.name === 'Ana')?.title).toBe('River Rat')
  })

  test('totals count settled nights, volume, and the biggest single win', () => {
    const first = settledNight('Night 1', { Ana: [50000, 80000], Ben: [50000, 20000] }, '2026-01-01T00:00:00.000Z')
    const totals = leagueTotals([first])
    expect(totals).toEqual({ nightsSettled: 1, volume: 100000, biggestWin: { name: 'Ana', amount: 30000 } })
    expect(leagueTotals([])).toEqual({ nightsSettled: 0, volume: 0, biggestWin: null })
  })
})
