import { describe, expect, test } from 'vitest'
import { settle, settleGreedy, SettlementError, type Balance, type Transfer } from './settlement'

function applyTransfers(balances: readonly Balance[], transfers: readonly Transfer[]): Record<string, number> {
  const result: Record<string, number> = Object.fromEntries(balances.map((balance) => [balance.id, balance.amount]))
  for (const transfer of transfers) {
    result[transfer.from] += transfer.amount
    result[transfer.to] -= transfer.amount
  }
  return result
}

function expectSettled(balances: readonly Balance[], transfers: readonly Transfer[]): void {
  const remaining = applyTransfers(balances, transfers)
  for (const amount of Object.values(remaining)) expect(amount).toBe(0)
  for (const transfer of transfers) {
    expect(transfer.amount).toBeGreaterThan(0)
    expect(transfer.from).not.toBe(transfer.to)
  }
}

describe('settle', () => {
  test('returns nothing when everyone is even', () => {
    expect(
      settle([
        { id: 'a', amount: 0 },
        { id: 'b', amount: 0 },
      ]),
    ).toEqual([])
    expect(settle([])).toEqual([])
  })

  test('throws when balances do not sum to zero', () => {
    expect(() => settle([{ id: 'a', amount: 100 }])).toThrow(SettlementError)
  })

  test('settles a two player game with one transfer', () => {
    const transfers = settle([
      { id: 'winner', amount: 2500 },
      { id: 'loser', amount: -2500 },
    ])
    expect(transfers).toEqual([{ from: 'loser', to: 'winner', amount: 2500 }])
  })

  test('finds independent zero-sum groups to minimise transfer count', () => {
    const balances: Balance[] = [
      { id: 'a', amount: 1000 },
      { id: 'b', amount: -1000 },
      { id: 'c', amount: 3000 },
      { id: 'd', amount: -3000 },
      { id: 'e', amount: 500 },
      { id: 'f', amount: -500 },
    ]
    const transfers = settle(balances)
    expect(transfers).toHaveLength(3)
    expectSettled(balances, transfers)
  })

  test('beats greedy matching when a subset cancels exactly', () => {
    // Greedy largest-first pairs 7 with -4 and -3 first, needing 4 transfers.
    const balances: Balance[] = [
      { id: 'a', amount: 700 },
      { id: 'b', amount: -400 },
      { id: 'c', amount: -300 },
      { id: 'd', amount: 200 },
      { id: 'e', amount: -200 },
    ]
    expect(settleGreedy(balances).length).toBeGreaterThanOrEqual(3)
    const transfers = settle(balances)
    expect(transfers).toHaveLength(3)
    expectSettled(balances, transfers)
  })

  test('handles an eight player table', () => {
    const balances: Balance[] = [
      { id: 'p1', amount: 12345 },
      { id: 'p2', amount: -2000 },
      { id: 'p3', amount: -4000 },
      { id: 'p4', amount: 655 },
      { id: 'p5', amount: -5000 },
      { id: 'p6', amount: 0 },
      { id: 'p7', amount: -3000 },
      { id: 'p8', amount: 1000 },
    ]
    const transfers = settle(balances)
    expect(transfers.length).toBeLessThanOrEqual(7)
    expectSettled(balances, transfers)
    expect(transfers.some((transfer) => transfer.from === 'p6' || transfer.to === 'p6')).toBe(false)
  })

  test('never exceeds n-1 transfers on random tables', () => {
    let seed = 42
    const random = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296
      return seed / 4294967296
    }
    for (let round = 0; round < 200; round += 1) {
      const count = 2 + Math.floor(random() * 7)
      const amounts = Array.from({ length: count - 1 }, () => Math.floor(random() * 20001) - 10000)
      const last = -amounts.reduce((sum, value) => sum + value, 0)
      const balances = [...amounts, last].map((amount, index) => ({ id: `p${index}`, amount }))
      const transfers = settle(balances)
      const nonZero = balances.filter((balance) => balance.amount !== 0).length
      expect(transfers.length).toBeLessThanOrEqual(Math.max(0, nonZero - 1))
      expectSettled(balances, transfers)
    }
  })

  test('falls back to greedy for very large tables', () => {
    const balances = Array.from({ length: 20 }, (_, index) => ({
      id: `p${index}`,
      amount: index % 2 === 0 ? 100 : -100,
    }))
    const transfers = settle(balances)
    expectSettled(balances, transfers)
    expect(transfers.length).toBeLessThanOrEqual(19)
  })
})
