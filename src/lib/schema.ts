import { z } from 'zod'
import { CHARACTER_IDS, MAX_PLAYERS } from './types'
import type { Game } from './types'

const cents = z.number().int().min(0)
const isoDate = z.string().refine((value) => !Number.isNaN(Date.parse(value)), 'Invalid date')

const playerSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(64),
  title: z.string().max(64).optional(),
  character: z.enum(CHARACTER_IDS),
  seat: z.number().int().min(1),
})

const transactionBase = {
  id: z.string().min(1),
  at: isoDate,
  note: z.string().max(200).optional(),
}

const buyInSchema = z.object({
  ...transactionBase,
  kind: z.enum(['buy-in', 'rebuy']),
  playerId: z.string().min(1),
  amount: cents,
})

const loanSchema = z.object({
  ...transactionBase,
  kind: z.literal('loan'),
  lenderId: z.string().min(1),
  borrowerId: z.string().min(1),
  amount: cents,
  source: z.enum(['bank', 'stack']),
})

const repaymentSchema = z.object({
  ...transactionBase,
  kind: z.literal('repayment'),
  borrowerId: z.string().min(1),
  lenderId: z.string().min(1),
  amount: cents,
  method: z.enum(['cash', 'chips']),
})

export const gameSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1).max(64),
    createdAt: isoDate,
    updatedAt: isoDate,
    settledAt: isoDate.optional(),
    currency: z.string().min(1).max(3),
    defaultBuyIn: cents,
    status: z.enum(['setup', 'active', 'cash-out', 'settled']),
    players: z.array(playerSchema).max(MAX_PLAYERS),
    transactions: z.array(z.discriminatedUnion('kind', [buyInSchema, loanSchema, repaymentSchema])),
    cashOuts: z.record(z.string(), cents),
    payoffs: z.record(z.string(), isoDate).default({}),
  })
  .superRefine((game, context) => {
    const ids = new Set(game.players.map((player) => player.id))
    game.transactions.forEach((transaction, index) => {
      const refs = 'playerId' in transaction ? [transaction.playerId] : [transaction.lenderId, transaction.borrowerId]
      for (const ref of refs) {
        if (!ids.has(ref)) {
          context.addIssue({
            code: 'custom',
            path: ['transactions', index],
            message: 'Transaction references an unknown player',
          })
        }
      }
    })
  })

export const persistedStateSchema = z.object({
  games: z.record(z.string(), gameSchema),
  activeGameId: z.string().nullable(),
})

export type PersistedState = z.infer<typeof persistedStateSchema>

export function parseGame(value: unknown): Game {
  return gameSchema.parse(value) as Game
}

export function parseGameJson(json: string): Game {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    throw new Error('That file is not valid JSON')
  }
  const result = gameSchema.safeParse(parsed)
  if (!result.success) {
    const first = result.error.issues[0]
    throw new Error(`Invalid game file: ${first?.message ?? 'unknown error'}`)
  }
  return result.data as Game
}
