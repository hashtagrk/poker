/** Integer minor units (cents). Never a float. */
export type Cents = number

export type PlayerId = string
export type GameId = string
export type TransactionId = string

export type CharacterId = (typeof CHARACTER_IDS)[number]

export const CHARACTER_IDS = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8'] as const

export type Player = {
  id: PlayerId
  name: string
  /** Optional table nickname, e.g. "The Shark". */
  title?: string
  /** Animated character shown on the player's seat. */
  character: CharacterId
  seat: number
}

type TransactionBase = {
  id: TransactionId
  /** ISO 8601 timestamp */
  at: string
  note?: string
}

/** A player puts their own money into the bank and receives chips. */
export type BuyInTransaction = TransactionBase & {
  kind: 'buy-in' | 'rebuy'
  playerId: PlayerId
  amount: Cents
}

/** Stands in for a player id when the bank itself is the lender. */
export const BANK = 'bank'

/** A player id, or `BANK` when the house lent the chips. */
export type LenderId = PlayerId | typeof BANK

/**
 * A loan to a player.
 * - lender is `BANK`: the bank issues chips on credit and the borrower owes the bank. `source` is always `bank`.
 * - `bank`: the lender pays the bank and the borrower receives freshly issued chips.
 * - `stack`: the lender hands chips from their own stack to the borrower.
 * In every case the borrower owes the lender `amount` at settlement.
 */
export type LoanTransaction = TransactionBase & {
  kind: 'loan'
  lenderId: LenderId
  borrowerId: PlayerId
  amount: Cents
  source: 'bank' | 'stack'
}

/**
 * A borrower paying a lender back during the game.
 * - `cash`: money changes hands away from the table (or into the bank); chips are untouched.
 * - `chips`: the borrower hands chips from their stack back to the lender (or the bank, taking them out of play).
 */
export type RepaymentTransaction = TransactionBase & {
  kind: 'repayment'
  borrowerId: PlayerId
  lenderId: LenderId
  amount: Cents
  method: 'cash' | 'chips'
}

export type Transaction = BuyInTransaction | LoanTransaction | RepaymentTransaction
export type RepaymentMethod = RepaymentTransaction['method']
export type TransactionKind = Transaction['kind']
export type LoanSource = LoanTransaction['source']

export function isBuyIn(transaction: Transaction): transaction is BuyInTransaction {
  return transaction.kind === 'buy-in' || transaction.kind === 'rebuy'
}

export function isBankLender(lenderId: LenderId): lenderId is typeof BANK {
  return lenderId === BANK
}

/** Every player a transaction touches. The bank is not a player. */
export function participantIds(transaction: Transaction): PlayerId[] {
  if (isBuyIn(transaction)) return [transaction.playerId]
  return isBankLender(transaction.lenderId) ? [transaction.borrowerId] : [transaction.lenderId, transaction.borrowerId]
}

export type GameStatus = 'setup' | 'active' | 'cash-out' | 'settled'

export type Game = {
  id: GameId
  name: string
  createdAt: string
  updatedAt: string
  settledAt?: string
  currency: string
  defaultBuyIn: Cents
  status: GameStatus
  players: readonly Player[]
  transactions: readonly Transaction[]
  /** Final chip value per player, present once entered during cash-out. */
  cashOuts: Readonly<Record<PlayerId, Cents>>
  /** Settlement transfers that have been paid, keyed by transfer key, valued by ISO timestamp. */
  payoffs: Readonly<Record<string, string>>
}

export const MAX_PLAYERS = 8
export const MIN_PLAYERS = 2
