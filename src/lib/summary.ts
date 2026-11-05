import { derivePlayerSummaries, deriveTotals, playerName } from './ledger'
import { transferKey } from './game'
import { formatMoney } from './money'
import type { Transfer } from './settlement'
import type { Game } from './types'

export function buildSummaryText(game: Game, transfers: readonly Transfer[]): string {
  const summaries = derivePlayerSummaries(game)
  const totals = deriveTotals(game, summaries)
  const money = (cents: number, signed = false) => formatMoney(cents, game.currency, { signed, compact: true })

  const lines: string[] = [`${game.name} — settlement`, `In play: ${money(totals.inPlay)} across ${game.players.length} players`, '', 'Results']
  for (const summary of summaries) {
    const loans = summary.lent || summary.borrowed ? ` (lent ${money(summary.lent)}, borrowed ${money(summary.borrowed)})` : ''
    lines.push(`• ${summary.player.name}: in ${money(summary.paidIn)}, out ${money(summary.cashOut ?? 0)}, net ${money(summary.net ?? 0, true)}${loans}`)
  }
  lines.push('', transfers.length === 0 ? 'Nobody owes anything.' : 'Who pays whom')
  for (const transfer of transfers) {
    const paid = game.payoffs[transferKey(transfer)] ? ' ✓ paid' : ''
    lines.push(`• ${playerName(game, transfer.from)} → ${playerName(game, transfer.to)}: ${money(transfer.amount)}${paid}`)
  }
  return lines.join('\n')
}
