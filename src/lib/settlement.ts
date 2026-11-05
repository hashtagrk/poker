import type { Cents } from './types'

export type Balance = {
  id: string
  /** Positive: should receive money. Negative: owes money. */
  amount: Cents
}

export type Transfer = {
  from: string
  to: string
  amount: Cents
}

/** Above this many non-zero balances the exact search is skipped in favour of greedy. */
const EXACT_SEARCH_LIMIT = 12

export class SettlementError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SettlementError'
  }
}

/**
 * Computes the minimum number of transfers that settle every balance.
 *
 * For up to 12 participants this is exact: balances are partitioned into the
 * maximum number of zero-sum groups (bitmask DP), and each group of size k is
 * then settled with k-1 transfers. Beyond that limit the greedy matcher is used,
 * which is still guaranteed to need at most n-1 transfers.
 */
export function settle(balances: readonly Balance[]): Transfer[] {
  const nonZero = balances.filter((balance) => balance.amount !== 0)
  const total = nonZero.reduce((sum, balance) => sum + balance.amount, 0)
  if (total !== 0) {
    throw new SettlementError(`Balances must sum to zero, got ${total}`)
  }
  if (nonZero.length === 0) return []

  const groups = nonZero.length <= EXACT_SEARCH_LIMIT ? partitionIntoZeroSumGroups(nonZero) : [nonZero]

  return groups.flatMap(settleGreedy)
}

/** Settles a zero-sum group by always matching the largest creditor with the largest debtor. */
export function settleGreedy(balances: readonly Balance[]): Transfer[] {
  const creditors = balances
    .filter((balance) => balance.amount > 0)
    .map((balance) => ({ ...balance }))
    .sort((a, b) => b.amount - a.amount)
  const debtors = balances
    .filter((balance) => balance.amount < 0)
    .map((balance) => ({ id: balance.id, amount: -balance.amount }))
    .sort((a, b) => b.amount - a.amount)

  const transfers: Transfer[] = []
  let creditorIndex = 0
  let debtorIndex = 0
  while (creditorIndex < creditors.length && debtorIndex < debtors.length) {
    const creditor = creditors[creditorIndex]
    const debtor = debtors[debtorIndex]
    const amount = Math.min(creditor.amount, debtor.amount)
    transfers.push({ from: debtor.id, to: creditor.id, amount })
    creditor.amount -= amount
    debtor.amount -= amount
    if (creditor.amount === 0) creditorIndex += 1
    if (debtor.amount === 0) debtorIndex += 1
  }
  return transfers
}

/**
 * Partitions balances into the maximum number of disjoint zero-sum groups.
 * dp[mask] = max zero-sum groups obtainable from the subset `mask`,
 * built by removing one element at a time and awarding a group whenever the
 * removed prefix sums to zero.
 */
function partitionIntoZeroSumGroups(balances: readonly Balance[]): Balance[][] {
  const count = balances.length
  const fullMask = (1 << count) - 1

  const subsetSum = new Int32Array(fullMask + 1)
  for (let mask = 1; mask <= fullMask; mask += 1) {
    const lowestBit = mask & -mask
    const index = 31 - Math.clz32(lowestBit)
    subsetSum[mask] = subsetSum[mask ^ lowestBit] + balances[index].amount
  }

  const best = new Int8Array(fullMask + 1)
  const parent = new Int8Array(fullMask + 1).fill(-1)
  for (let mask = 1; mask <= fullMask; mask += 1) {
    let bestChild = -1
    let bestValue = -1
    for (let index = 0; index < count; index += 1) {
      if ((mask & (1 << index)) === 0) continue
      const child = mask ^ (1 << index)
      if (best[child] > bestValue) {
        bestValue = best[child]
        bestChild = index
      }
    }
    best[mask] = bestValue + (subsetSum[mask] === 0 ? 1 : 0)
    parent[mask] = bestChild
  }

  const groups: Balance[][] = []
  let current: Balance[] = []
  let mask = fullMask
  while (mask !== 0) {
    const index = parent[mask]
    current = [...current, balances[index]]
    mask ^= 1 << index
    if (subsetSum[mask] === 0) {
      groups.push(current)
      current = []
    }
  }
  return groups
}
