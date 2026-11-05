import { sumCents } from './money'
import { isBankLender } from './types'
import type { Cents, Game, LenderId, Player, PlayerId, Transaction } from './types'

export type PlayerSummary = {
  player: Player
  /** Own money put in through buy-ins and rebuys. */
  buyIns: Cents
  rebuyCount: number
  /** Money this player is owed by others. */
  lent: Cents
  /** Money this player owes others, including the bank. */
  borrowed: Cents
  /** The part of `borrowed` owed to the bank for chips it issued on credit. */
  owesBank: Cents
  /** Cash this player is on the hook for at the bank (buy-ins plus bank-funded loans given). */
  paidIn: Cents
  /** Chip value this player received from the bank or from other stacks. */
  chipsReceived: Cents
  cashOut: Cents | null
  /** Final result after loans are accounted for. Null until cashed out. */
  net: Cents | null
}

export type GameTotals = {
  /** Chips in play: cash held by the bank plus chips it issued on credit. */
  inPlay: Cents
  /** Every unpaid loan, whether owed to a player or to the bank. */
  loansOutstanding: Cents
  /** Chips the bank issued on credit that have not been paid back yet. */
  bankCredit: Cents
  cashedOut: Cents
  playersCashedOut: number
  /** cashedOut minus inPlay. Zero when every chip has been accounted for. */
  discrepancy: Cents
  isBalanced: boolean
}

function emptySummary(player: Player, cashOut: Cents | null): PlayerSummary {
  return {
    player,
    buyIns: 0,
    rebuyCount: 0,
    lent: 0,
    borrowed: 0,
    owesBank: 0,
    paidIn: 0,
    chipsReceived: 0,
    cashOut,
    net: null,
  }
}

function applyTransaction(summaries: Readonly<Record<PlayerId, PlayerSummary>>, transaction: Transaction): Record<PlayerId, PlayerSummary> {
  if ((transaction.kind === 'repayment' || transaction.kind === 'loan') && isBankLender(transaction.lenderId)) {
    const borrower = summaries[transaction.borrowerId]
    if (!borrower) return summaries
    return { ...summaries, [borrower.player.id]: applyBankCredit(borrower, transaction) }
  }

  if (transaction.kind === 'repayment') {
    const lender = summaries[transaction.lenderId]
    const borrower = summaries[transaction.borrowerId]
    if (!lender || !borrower) return summaries
    const inChips = transaction.method === 'chips'
    return {
      ...summaries,
      [lender.player.id]: {
        ...lender,
        lent: lender.lent - transaction.amount,
        chipsReceived: lender.chipsReceived + (inChips ? transaction.amount : 0),
      },
      [borrower.player.id]: {
        ...borrower,
        borrowed: borrower.borrowed - transaction.amount,
        chipsReceived: borrower.chipsReceived - (inChips ? transaction.amount : 0),
      },
    }
  }

  if (transaction.kind === 'loan') {
    const lender = summaries[transaction.lenderId]
    const borrower = summaries[transaction.borrowerId]
    if (!lender || !borrower) return summaries
    const fromBank = transaction.source === 'bank'
    return {
      ...summaries,
      [lender.player.id]: {
        ...lender,
        lent: lender.lent + transaction.amount,
        paidIn: lender.paidIn + (fromBank ? transaction.amount : 0),
        chipsReceived: lender.chipsReceived - (fromBank ? 0 : transaction.amount),
      },
      [borrower.player.id]: {
        ...borrower,
        borrowed: borrower.borrowed + transaction.amount,
        chipsReceived: borrower.chipsReceived + transaction.amount,
      },
    }
  }

  const summary = summaries[transaction.playerId]
  if (!summary) return summaries
  return {
    ...summaries,
    [summary.player.id]: {
      ...summary,
      buyIns: summary.buyIns + transaction.amount,
      rebuyCount: summary.rebuyCount + (transaction.kind === 'rebuy' ? 1 : 0),
      paidIn: summary.paidIn + transaction.amount,
      chipsReceived: summary.chipsReceived + transaction.amount,
    },
  }
}

/**
 * A bank loan issues chips on credit. Paying it back in cash puts that cash in the bank;
 * paying it back in chips takes those chips out of play.
 */
function applyBankCredit(borrower: PlayerSummary, transaction: Extract<Transaction, { kind: 'loan' | 'repayment' }>): PlayerSummary {
  if (transaction.kind === 'loan') {
    return {
      ...borrower,
      borrowed: borrower.borrowed + transaction.amount,
      owesBank: borrower.owesBank + transaction.amount,
      chipsReceived: borrower.chipsReceived + transaction.amount,
    }
  }
  const inChips = transaction.method === 'chips'
  return {
    ...borrower,
    borrowed: borrower.borrowed - transaction.amount,
    owesBank: borrower.owesBank - transaction.amount,
    paidIn: borrower.paidIn + (inChips ? 0 : transaction.amount),
    chipsReceived: borrower.chipsReceived - (inChips ? transaction.amount : 0),
  }
}

/** Net result = cash out − paid in + money lent − money borrowed. */
export function computeNet(summary: Omit<PlayerSummary, 'net'>): Cents | null {
  if (summary.cashOut === null) return null
  return summary.cashOut - summary.paidIn + summary.lent - summary.borrowed
}

export function derivePlayerSummaries(game: Game): PlayerSummary[] {
  const initial = Object.fromEntries(game.players.map((player) => [player.id, emptySummary(player, game.cashOuts[player.id] ?? null)])) as Record<
    PlayerId,
    PlayerSummary
  >

  const applied = game.transactions.reduce(applyTransaction, initial)

  return [...game.players]
    .sort((a, b) => a.seat - b.seat)
    .map((player) => {
      const summary = applied[player.id]
      return { ...summary, net: computeNet(summary) }
    })
}

export function deriveTotals(game: Game, summaries = derivePlayerSummaries(game)): GameTotals {
  const bankCredit = sumCents(summaries.map((summary) => summary.owesBank))
  const inPlay = sumCents(summaries.map((summary) => summary.paidIn)) + bankCredit
  const loansOutstanding = sumCents(summaries.map((summary) => summary.borrowed))
  const cashedOutSummaries = summaries.filter((summary) => summary.cashOut !== null)
  const cashedOut = sumCents(cashedOutSummaries.map((summary) => summary.cashOut ?? 0))
  const discrepancy = cashedOut - inPlay
  return {
    inPlay,
    loansOutstanding,
    bankCredit,
    cashedOut,
    playersCashedOut: cashedOutSummaries.length,
    discrepancy,
    isBalanced: cashedOutSummaries.length === summaries.length && discrepancy === 0,
  }
}

export const debtKey = (borrowerId: PlayerId, lenderId: LenderId) => `${borrowerId}>${lenderId}`

/** Outstanding loan balance per borrower→lender pair, after repayments. */
export function outstandingDebts(game: Game): ReadonlyMap<string, Cents> {
  const debts = new Map<string, Cents>()
  for (const transaction of game.transactions) {
    if (transaction.kind === 'loan') {
      const key = debtKey(transaction.borrowerId, transaction.lenderId)
      debts.set(key, (debts.get(key) ?? 0) + transaction.amount)
    } else if (transaction.kind === 'repayment') {
      const key = debtKey(transaction.borrowerId, transaction.lenderId)
      debts.set(key, (debts.get(key) ?? 0) - transaction.amount)
    }
  }
  return debts
}

export function playerById(game: Game, playerId: PlayerId): Player | undefined {
  return game.players.find((player) => player.id === playerId)
}

export function playerName(game: Game, playerId: LenderId): string {
  if (isBankLender(playerId)) return 'the bank'
  return playerById(game, playerId)?.name ?? 'Unknown player'
}
