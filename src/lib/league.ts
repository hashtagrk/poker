import { derivePlayerSummaries } from './ledger'
import type { Cents, CharacterId, Game } from './types'

export type Standing = {
  /** Display name as last seen at a table. */
  name: string
  title?: string
  character: CharacterId
  nights: number
  net: Cents
  bestNight: Cents
  worstNight: Cents
  lastPlayed: string
}

export type LeagueTotals = {
  nightsSettled: number
  /** Money that crossed the tables across every settled night. */
  volume: Cents
  biggestWin: { name: string; amount: Cents } | null
}

const keyFor = (name: string) => name.trim().toLowerCase()

/** All-time standings across settled games, matched by player name (case-insensitive). */
export function leagueStandings(games: readonly Game[]): Standing[] {
  const settled = games.filter((game) => game.status === 'settled').sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))
  const table = new Map<string, Standing>()
  for (const game of settled) {
    for (const summary of derivePlayerSummaries(game)) {
      const net = summary.net ?? 0
      const key = keyFor(summary.player.name)
      const previous = table.get(key)
      table.set(key, {
        name: summary.player.name,
        title: summary.player.title ?? previous?.title,
        character: summary.player.character,
        nights: (previous?.nights ?? 0) + 1,
        net: (previous?.net ?? 0) + net,
        bestNight: Math.max(previous?.bestNight ?? net, net),
        worstNight: Math.min(previous?.worstNight ?? net, net),
        lastPlayed: game.settledAt ?? game.updatedAt,
      })
    }
  }
  return [...table.values()].sort((a, b) => b.net - a.net || b.nights - a.nights || a.name.localeCompare(b.name))
}

export function leagueTotals(games: readonly Game[], standings = leagueStandings(games)): LeagueTotals {
  const settled = games.filter((game) => game.status === 'settled')
  const volume = settled.reduce((sum, game) => sum + derivePlayerSummaries(game).reduce((inner, summary) => inner + summary.paidIn, 0), 0)
  const best = standings.reduce<Standing | null>((top, standing) => (top === null || standing.bestNight > top.bestNight ? standing : top), null)
  return {
    nightsSettled: settled.length,
    volume,
    biggestWin: best && best.bestNight > 0 ? { name: best.name, amount: best.bestNight } : null,
  }
}
