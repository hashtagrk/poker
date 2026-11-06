import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import * as actions from '../lib/game'
import { GameError, type NewGameInput, type PlayerPatch, type PlayerProfile, type TransactionInput } from '../lib/game'
import { gameSchema } from '../lib/schema'
import { parseGameJson } from '../lib/schema'
import type { Cents, Game, GameId, PlayerId, TransactionId } from '../lib/types'
import { isNative, nativeStorage } from '../lib/native'
import { notify } from './toastStore'

export const STORAGE_KEY = 'poker-ledger/v1'

type GameMap = Readonly<Record<GameId, Game>>

type GameState = {
  games: GameMap
  activeGameId: GameId | null
}

type Mutation = (game: Game) => Game

type GameActions = {
  createGame: (input: NewGameInput) => GameId | null
  setActiveGame: (id: GameId | null) => void
  deleteGame: (id: GameId) => void
  importGame: (json: string) => GameId | null
  /** Applies a pure mutation to a game; surfaces GameError as a toast and returns false. */
  mutate: (id: GameId, mutation: Mutation, successMessage?: string) => boolean
  updateSettings: (id: GameId, patch: Partial<NewGameInput>) => boolean
  addPlayer: (id: GameId, name: string, profile?: PlayerProfile) => boolean
  updatePlayer: (id: GameId, playerId: PlayerId, patch: PlayerPatch) => boolean
  removePlayer: (id: GameId, playerId: PlayerId) => boolean
  startGame: (id: GameId, buyIns: Readonly<Record<PlayerId, Cents>>) => boolean
  recordTransaction: (id: GameId, input: TransactionInput) => boolean
  removeTransaction: (id: GameId, transactionId: TransactionId) => boolean
  beginCashOut: (id: GameId) => boolean
  setCashOut: (id: GameId, playerId: PlayerId, amount: Cents | null) => boolean
  finalizeGame: (id: GameId) => boolean
  reopenGame: (id: GameId) => boolean
  markPayoff: (id: GameId, key: string, paid: boolean) => boolean
}

export type GameStore = GameState & GameActions

/** Drops any persisted game that fails validation instead of crashing the app. */
function sanitizeGames(value: unknown): GameMap {
  if (!value || typeof value !== 'object') return {}
  const entries = Object.entries(value as Record<string, unknown>).flatMap(([id, candidate]) => {
    const result = gameSchema.safeParse(candidate)
    return result.success && result.data.id === id ? [[id, result.data as Game] as const] : []
  })
  return Object.fromEntries(entries)
}

export const useGameStore = create<GameStore>()(
  persist(
    (set, get) => ({
      games: {},
      activeGameId: null,

      createGame: (input) => {
        try {
          const game = actions.createGame(input)
          set((state) => ({ games: { ...state.games, [game.id]: game }, activeGameId: game.id }))
          return game.id
        } catch (error) {
          if (error instanceof GameError) {
            notify(error.message, 'error')
            return null
          }
          throw error
        }
      },

      setActiveGame: (id) => set({ activeGameId: id }),

      deleteGame: (id) =>
        set((state) => {
          const { [id]: _removed, ...games } = state.games
          return { games, activeGameId: state.activeGameId === id ? null : state.activeGameId }
        }),

      importGame: (json) => {
        try {
          const game = parseGameJson(json)
          set((state) => ({ games: { ...state.games, [game.id]: game }, activeGameId: game.id }))
          notify(`Imported “${game.name}”`, 'success')
          return game.id
        } catch (error) {
          notify(error instanceof Error ? error.message : 'Could not import that file', 'error')
          return null
        }
      },

      mutate: (id, mutation, successMessage) => {
        const game = get().games[id]
        if (!game) {
          notify('That game no longer exists', 'error')
          return false
        }
        try {
          const next = mutation(game)
          set((state) => ({ games: { ...state.games, [id]: next } }))
          if (successMessage) notify(successMessage, 'success')
          return true
        } catch (error) {
          if (error instanceof GameError) {
            notify(error.message, 'error')
            return false
          }
          throw error
        }
      },

      updateSettings: (id, patch) => get().mutate(id, (game) => actions.updateSettings(game, patch)),
      addPlayer: (id, name, profile) => get().mutate(id, (game) => actions.addPlayer(game, name, profile)),
      updatePlayer: (id, playerId, patch) => get().mutate(id, (game) => actions.updatePlayer(game, playerId, patch)),
      removePlayer: (id, playerId) => get().mutate(id, (game) => actions.removePlayer(game, playerId)),
      startGame: (id, buyIns) => get().mutate(id, (game) => actions.startGame(game, buyIns), 'Cards in the air'),
      recordTransaction: (id, input) => get().mutate(id, (game) => actions.recordTransaction(game, input)),
      removeTransaction: (id, transactionId) => get().mutate(id, (game) => actions.removeTransaction(game, transactionId), 'Transaction removed'),
      beginCashOut: (id) => get().mutate(id, (game) => actions.beginCashOut(game)),
      setCashOut: (id, playerId, amount) => get().mutate(id, (game) => actions.setCashOut(game, playerId, amount)),
      finalizeGame: (id) => get().mutate(id, (game) => actions.finalizeGame(game), 'Game settled'),
      reopenGame: (id) => get().mutate(id, (game) => actions.reopenGame(game)),
      markPayoff: (id, key, paid) => get().mutate(id, (game) => actions.markPayoff(game, key, paid)),
    }),
    {
      name: STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => (isNative ? nativeStorage : localStorage)),
      partialize: (state) => ({ games: state.games, activeGameId: state.activeGameId }),
      merge: (persisted, current) => {
        const raw = (persisted ?? {}) as Partial<GameState>
        const games = sanitizeGames(raw.games)
        const activeGameId = raw.activeGameId && games[raw.activeGameId] ? raw.activeGameId : null
        return { ...current, games, activeGameId }
      },
    },
  ),
)

export const selectActiveGame = (state: GameStore): Game | null => (state.activeGameId ? (state.games[state.activeGameId] ?? null) : null)

/** Returns a new array; memoize at the call site rather than passing it straight to the store hook. */
export const selectGamesNewestFirst = (games: GameMap): Game[] => Object.values(games).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
