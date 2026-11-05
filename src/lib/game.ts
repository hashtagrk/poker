import { createId } from './id'
import { formatMoney, normalizeCurrency } from './money'
import { debtKey, derivePlayerSummaries, deriveTotals, outstandingDebts } from './ledger'
import { settle, type Transfer } from './settlement'
import { CHARACTER_IDS, isBuyIn, MAX_PLAYERS, MIN_PLAYERS, participantIds } from './types'
import type { Cents, CharacterId, Game, LoanSource, Player, PlayerId, RepaymentMethod, Transaction, TransactionId } from './types'

export class GameError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GameError'
  }
}

export const MAX_PLAYER_NAME_LENGTH = 24
export const MAX_TITLE_LENGTH = 30
export const MAX_GAME_NAME_LENGTH = 48
export const MAX_NOTE_LENGTH = 80

type Clock = () => string
const now: Clock = () => new Date().toISOString()

export type NewGameInput = {
  name: string
  currency: string
  defaultBuyIn: Cents
}

function touch(game: Game, at = now()): Game {
  return { ...game, updatedAt: at }
}

function assertAmount(amount: Cents, label = 'Amount'): void {
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new GameError(`${label} must be greater than zero`)
  }
}

function assertStatus(game: Game, allowed: readonly Game['status'][], action: string): void {
  if (!allowed.includes(game.status)) {
    throw new GameError(`Cannot ${action} while the game is ${game.status}`)
  }
}

function assertPlayer(game: Game, playerId: PlayerId): Player {
  const player = game.players.find((candidate) => candidate.id === playerId)
  if (!player) throw new GameError('That player is not in this game')
  return player
}

function normalizeName(name: string, label: string, maxLength: number): string {
  const trimmed = name.trim().replace(/\s+/g, ' ')
  if (trimmed.length === 0) throw new GameError(`${label} is required`)
  if (trimmed.length > maxLength) throw new GameError(`${label} must be ${maxLength} characters or fewer`)
  return trimmed
}

export function createGame(input: NewGameInput, at = now()): Game {
  const currency = normalizeCurrency(input.currency)
  if (currency.length > 3) throw new GameError('Currency symbol must be 3 characters or fewer')
  assertAmount(input.defaultBuyIn, 'Default buy-in')
  return {
    id: createId(),
    name: normalizeName(input.name || 'Poker night', 'Game name', MAX_GAME_NAME_LENGTH),
    createdAt: at,
    updatedAt: at,
    currency,
    defaultBuyIn: input.defaultBuyIn,
    status: 'setup',
    players: [],
    transactions: [],
    cashOuts: {},
    payoffs: {},
  }
}

export function updateSettings(game: Game, patch: Partial<NewGameInput>): Game {
  assertStatus(game, ['setup', 'active'], 'change settings')
  const next = { ...game }
  if (patch.name !== undefined) next.name = normalizeName(patch.name, 'Game name', MAX_GAME_NAME_LENGTH)
  if (patch.currency !== undefined) {
    const currency = normalizeCurrency(patch.currency)
    if (currency.length > 3) throw new GameError('Currency symbol must be 3 characters or fewer')
    next.currency = currency
  }
  if (patch.defaultBuyIn !== undefined) {
    assertAmount(patch.defaultBuyIn, 'Default buy-in')
    next.defaultBuyIn = patch.defaultBuyIn
  }
  return touch(next)
}

export type PlayerProfile = { title?: string; character?: CharacterId }

export function addPlayer(game: Game, name: string, profile: PlayerProfile = {}): Game {
  assertStatus(game, ['setup', 'active'], 'add players')
  if (game.players.length >= MAX_PLAYERS) throw new GameError(`A table seats at most ${MAX_PLAYERS} players`)
  const clean = normalizeName(name, 'Player name', MAX_PLAYER_NAME_LENGTH)
  const duplicate = game.players.some((player) => player.name.toLowerCase() === clean.toLowerCase())
  if (duplicate) throw new GameError(`${clean} is already at the table`)
  const seat = Math.max(0, ...game.players.map((player) => player.seat)) + 1
  const taken = new Set(game.players.map((player) => player.character))
  const character = profile.character && !taken.has(profile.character) ? profile.character : nextFreeCharacter(game)
  const title = profile.title?.trim().replace(/\s+/g, ' ')
  if (title && title.length > MAX_TITLE_LENGTH) throw new GameError(`Titles must be ${MAX_TITLE_LENGTH} characters or fewer`)
  const player: Player = title ? { id: createId(), name: clean, title, seat, character } : { id: createId(), name: clean, seat, character }
  return touch({ ...game, players: [...game.players, player] })
}

/** Picks the first character nobody at the table is using yet. */
function nextFreeCharacter(game: Game): CharacterId {
  const taken = new Set(game.players.map((player) => player.character))
  return CHARACTER_IDS.find((id) => !taken.has(id)) ?? CHARACTER_IDS[game.players.length % CHARACTER_IDS.length]
}

export type PlayerPatch = { name?: string; title?: string; character?: string }

export function updatePlayer(game: Game, playerId: PlayerId, patch: PlayerPatch): Game {
  const existing = assertPlayer(game, playerId)
  let next: Player = { ...existing }
  if (patch.name !== undefined) {
    const clean = normalizeName(patch.name, 'Player name', MAX_PLAYER_NAME_LENGTH)
    const duplicate = game.players.some((player) => player.id !== playerId && player.name.toLowerCase() === clean.toLowerCase())
    if (duplicate) throw new GameError(`${clean} is already at the table`)
    next = { ...next, name: clean }
  }
  if (patch.title !== undefined) {
    const title = patch.title.trim().replace(/\s+/g, ' ')
    if (title.length > MAX_TITLE_LENGTH) throw new GameError(`Titles must be ${MAX_TITLE_LENGTH} characters or fewer`)
    const { title: _old, ...withoutTitle } = next
    next = title ? { ...withoutTitle, title } : withoutTitle
  }
  if (patch.character !== undefined) {
    if (!isCharacterId(patch.character)) throw new GameError('Unknown character')
    next = { ...next, character: patch.character }
  }
  return touch({ ...game, players: game.players.map((player) => (player.id === playerId ? next : player)) })
}

export function isCharacterId(value: string): value is CharacterId {
  return (CHARACTER_IDS as readonly string[]).includes(value)
}

export function removePlayer(game: Game, playerId: PlayerId): Game {
  assertStatus(game, ['setup', 'active'], 'remove players')
  assertPlayer(game, playerId)
  const involved = game.transactions.some((transaction) => participantIds(transaction).includes(playerId))
  if (involved) throw new GameError('Remove or void their transactions before removing this player')
  const { [playerId]: _removed, ...cashOuts } = game.cashOuts
  return touch({
    ...game,
    players: game.players.filter((player) => player.id !== playerId),
    cashOuts,
  })
}

/** Moves the game to `active`, recording an initial buy-in for every player. */
export function startGame(game: Game, buyIns: Readonly<Record<PlayerId, Cents>>, at = now()): Game {
  assertStatus(game, ['setup'], 'start')
  if (game.players.length < MIN_PLAYERS) throw new GameError(`At least ${MIN_PLAYERS} players are needed`)
  const transactions = game.players.map((player): Transaction => {
    const amount = buyIns[player.id]
    if (amount === undefined) throw new GameError(`${player.name} needs a buy-in amount`)
    assertAmount(amount, `${player.name}'s buy-in`)
    return { id: createId(), at, kind: 'buy-in', playerId: player.id, amount }
  })
  return touch({ ...game, status: 'active', transactions: [...game.transactions, ...transactions] }, at)
}

export type BuyInInput = { kind: 'buy-in' | 'rebuy'; playerId: PlayerId; amount: Cents; note?: string }
export type LoanInput = {
  kind: 'loan'
  lenderId: PlayerId
  borrowerId: PlayerId
  amount: Cents
  source: LoanSource
  note?: string
}
export type RepaymentInput = {
  kind: 'repayment'
  borrowerId: PlayerId
  lenderId: PlayerId
  amount: Cents
  method: RepaymentMethod
  note?: string
}
export type TransactionInput = BuyInInput | LoanInput | RepaymentInput

function cleanNote(note: string | undefined): string | undefined {
  const trimmed = note?.trim()
  if (!trimmed) return undefined
  if (trimmed.length > MAX_NOTE_LENGTH) throw new GameError(`Notes must be ${MAX_NOTE_LENGTH} characters or fewer`)
  return trimmed
}

export function recordTransaction(game: Game, input: TransactionInput, at = now()): Game {
  assertStatus(game, ['active'], 'record transactions')
  assertAmount(input.amount)
  const note = cleanNote(input.note)
  let transaction: Transaction
  if (input.kind === 'repayment') {
    if (input.lenderId === input.borrowerId) throw new GameError('A player cannot repay themselves')
    const borrower = assertPlayer(game, input.borrowerId)
    const lender = assertPlayer(game, input.lenderId)
    const owed = outstandingDebts(game).get(debtKey(input.borrowerId, input.lenderId)) ?? 0
    if (owed <= 0) throw new GameError(`${borrower.name} does not owe ${lender.name} anything`)
    if (input.amount > owed) throw new GameError(`${borrower.name} only owes ${lender.name} ${formatMoney(owed, game.currency, { compact: true })}`)
    transaction = {
      id: createId(),
      at,
      kind: 'repayment',
      borrowerId: input.borrowerId,
      lenderId: input.lenderId,
      amount: input.amount,
      method: input.method,
      note,
    }
  } else if (input.kind === 'loan') {
    if (input.lenderId === input.borrowerId) throw new GameError('A player cannot lend to themselves')
    assertPlayer(game, input.lenderId)
    assertPlayer(game, input.borrowerId)
    transaction = {
      id: createId(),
      at,
      kind: 'loan',
      lenderId: input.lenderId,
      borrowerId: input.borrowerId,
      amount: input.amount,
      source: input.source,
      note,
    }
  } else {
    assertPlayer(game, input.playerId)
    transaction = { id: createId(), at, kind: input.kind, playerId: input.playerId, amount: input.amount, note }
  }
  return touch({ ...game, transactions: [...game.transactions, transaction] }, at)
}

export function removeTransaction(game: Game, transactionId: TransactionId): Game {
  assertStatus(game, ['active'], 'remove transactions')
  const target = game.transactions.find((transaction) => transaction.id === transactionId)
  if (!target) throw new GameError('That transaction no longer exists')
  const isInitialBuyIn =
    target.kind === 'buy-in' && game.transactions.find((transaction) => isBuyIn(transaction) && transaction.playerId === target.playerId)?.id === target.id
  if (isInitialBuyIn) throw new GameError('The opening buy-in cannot be removed; remove the player instead')
  const next = { ...game, transactions: game.transactions.filter((transaction) => transaction.id !== transactionId) }
  const overpaid = [...outstandingDebts(next).values()].some((owed) => owed < 0)
  if (overpaid) throw new GameError('Remove the repayment of this loan first')
  return touch(next)
}

export function beginCashOut(game: Game): Game {
  assertStatus(game, ['active'], 'cash out')
  return touch({ ...game, status: 'cash-out' })
}

export function setCashOut(game: Game, playerId: PlayerId, amount: Cents | null): Game {
  assertStatus(game, ['cash-out'], 'enter cash-outs')
  assertPlayer(game, playerId)
  if (amount === null) {
    const { [playerId]: _removed, ...cashOuts } = game.cashOuts
    return touch({ ...game, cashOuts })
  }
  if (!Number.isSafeInteger(amount) || amount < 0) throw new GameError('Cash-out cannot be negative')
  return touch({ ...game, cashOuts: { ...game.cashOuts, [playerId]: amount } })
}

export function finalizeGame(game: Game, at = now()): Game {
  assertStatus(game, ['cash-out'], 'finalize')
  const totals = deriveTotals(game)
  if (totals.playersCashedOut !== game.players.length) {
    throw new GameError('Every player needs a cash-out amount before settling')
  }
  if (totals.discrepancy !== 0) {
    throw new GameError('Cash-outs must add up to the chips in play before settling')
  }
  return touch({ ...game, status: 'settled', settledAt: at }, at)
}

export function reopenGame(game: Game): Game {
  assertStatus(game, ['cash-out', 'settled'], 'reopen')
  const { settledAt: _settledAt, ...rest } = game
  return touch({ ...rest, status: game.status === 'settled' ? 'cash-out' : 'active', payoffs: {} })
}

export const transferKey = (transfer: Transfer) => `${transfer.from}>${transfer.to}`

/** Marks a settlement transfer as paid (or unpaid). Only valid once the game is settled. */
export function markPayoff(game: Game, key: string, paid: boolean, at = now()): Game {
  assertStatus(game, ['settled'], 'mark payoffs')
  const valid = settlementFor(game).some((transfer) => transferKey(transfer) === key)
  if (!valid) throw new GameError('That transfer is not part of this settlement')
  if (!paid) {
    const { [key]: _removed, ...payoffs } = game.payoffs
    return touch({ ...game, payoffs }, at)
  }
  return touch({ ...game, payoffs: { ...game.payoffs, [key]: at } }, at)
}

/** Transfers that settle a finished game. Empty until every cash-out is in and balanced. */
export function settlementFor(game: Game): Transfer[] {
  const summaries = derivePlayerSummaries(game)
  const totals = deriveTotals(game, summaries)
  if (!totals.isBalanced) return []
  return settle(summaries.map((summary) => ({ id: summary.player.id, amount: summary.net ?? 0 })))
}
