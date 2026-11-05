import { beforeEach, describe, expect, test } from 'vitest'
import { selectActiveGame, selectGamesNewestFirst, STORAGE_KEY, useGameStore } from './gameStore'
import { useToastStore } from './toastStore'

beforeEach(() => {
  useGameStore.setState({ games: {}, activeGameId: null })
  useToastStore.setState({ toasts: [] })
})

describe('gameStore', () => {
  test('creates a game and makes it active', () => {
    const id = useGameStore.getState().createGame({ name: 'Friday', currency: '$', defaultBuyIn: 2000 })
    expect(id).not.toBeNull()
    expect(selectActiveGame(useGameStore.getState())?.name).toBe('Friday')
  })

  test('surfaces domain errors as toasts instead of throwing', () => {
    const store = useGameStore.getState()
    const id = store.createGame({ name: 'Friday', currency: '$', defaultBuyIn: 2000 }) ?? ''
    expect(store.addPlayer(id, 'Ana')).toBe(true)
    expect(store.addPlayer(id, 'Ana')).toBe(false)
    expect(useToastStore.getState().toasts.at(-1)?.message).toMatch(/already at the table/)
    expect(store.mutate('missing', (game) => game)).toBe(false)
  })

  test('runs a full game through the store', () => {
    const store = useGameStore.getState()
    const id = store.createGame({ name: 'Friday', currency: '$', defaultBuyIn: 2000 }) ?? ''
    store.addPlayer(id, 'Ana')
    store.addPlayer(id, 'Ben')
    const [ana, ben] = useGameStore.getState().games[id].players
    expect(store.startGame(id, { [ana.id]: 2000, [ben.id]: 2000 })).toBe(true)
    expect(store.recordTransaction(id, { kind: 'rebuy', playerId: ben.id, amount: 2000 })).toBe(true)
    expect(store.beginCashOut(id)).toBe(true)
    store.setCashOut(id, ana.id, 6000)
    store.setCashOut(id, ben.id, 0)
    expect(store.finalizeGame(id)).toBe(true)
    expect(useGameStore.getState().games[id].status).toBe('settled')
    expect(store.reopenGame(id)).toBe(true)
    expect(useGameStore.getState().games[id].status).toBe('cash-out')
  })

  test('deletes games and clears the active pointer', () => {
    const store = useGameStore.getState()
    const id = store.createGame({ name: 'Friday', currency: '$', defaultBuyIn: 2000 }) ?? ''
    store.deleteGame(id)
    expect(useGameStore.getState().games[id]).toBeUndefined()
    expect(useGameStore.getState().activeGameId).toBeNull()
  })

  test('imports valid JSON and rejects invalid JSON', () => {
    const store = useGameStore.getState()
    const id = store.createGame({ name: 'Friday', currency: '$', defaultBuyIn: 2000 }) ?? ''
    const json = JSON.stringify(useGameStore.getState().games[id])
    store.deleteGame(id)
    expect(store.importGame(json)).toBe(id)
    expect(store.importGame('{"bad": true}')).toBeNull()
  })

  test('persists to localStorage and drops corrupt games on rehydrate', async () => {
    const store = useGameStore.getState()
    const id = store.createGame({ name: 'Friday', currency: '$', defaultBuyIn: 2000 }) ?? ''
    const raw = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}')
    expect(raw.state.games[id].name).toBe('Friday')
    raw.state.games.corrupt = { id: 'corrupt', nope: true }
    raw.state.activeGameId = 'corrupt'
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(raw))
    await useGameStore.persist.rehydrate()
    const state = useGameStore.getState()
    expect(Object.keys(state.games)).toEqual([id])
    expect(state.activeGameId).toBeNull()
  })

  test('orders games newest first', () => {
    const store = useGameStore.getState()
    const first = store.createGame({ name: 'One', currency: '$', defaultBuyIn: 100 }) ?? ''
    const second = store.createGame({ name: 'Two', currency: '$', defaultBuyIn: 100 }) ?? ''
    useGameStore.setState((state) => ({
      games: {
        ...state.games,
        [first]: { ...state.games[first], updatedAt: '2026-01-02T00:00:00.000Z' },
        [second]: { ...state.games[second], updatedAt: '2026-01-01T00:00:00.000Z' },
      },
    }))
    expect(selectGamesNewestFirst(useGameStore.getState().games).map((game) => game.name)).toEqual(['One', 'Two'])
  })
})
