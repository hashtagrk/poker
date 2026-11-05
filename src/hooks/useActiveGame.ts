import { selectActiveGame, useGameStore } from '../store/gameStore'
import type { Game } from '../lib/types'

export function useActiveGame(): Game | null {
  return useGameStore(selectActiveGame)
}
