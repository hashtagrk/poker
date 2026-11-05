import type { CharacterId } from './types'

export type CharacterDefinition = {
  id: CharacterId
  name: string
  /** Placeholder persona. Replace with the final character descriptions when supplied. */
  description: string
  /** CSS variable holding the seat chip colour. */
  chipVar: string
}

export const CHARACTERS: readonly CharacterDefinition[] = [
  { id: 'c1', name: 'Shades', description: 'Never shows a tell behind the sunglasses.', chipVar: '--chip-1' },
  { id: 'c2', name: 'Visor', description: 'Old-school card-room visor, calculates every pot.', chipVar: '--chip-2' },
  { id: 'c3', name: 'Crown', description: 'Self-declared royalty of the home game.', chipVar: '--chip-3' },
  { id: 'c4', name: 'Whiskers', description: 'The moustache twitches on a bluff.', chipVar: '--chip-4' },
  { id: 'c5', name: 'Beanie', description: 'Cold as ice, even on a river suck-out.', chipVar: '--chip-5' },
  { id: 'c6', name: 'Bowtie', description: 'Dressed for a casino, playing in a kitchen.', chipVar: '--chip-6' },
  { id: 'c7', name: 'Headphones', description: 'Hears nothing, folds nothing.', chipVar: '--chip-7' },
  { id: 'c8', name: 'Bloom', description: 'Sweet on the outside, ruthless with the nuts.', chipVar: '--chip-8' },
]

export function characterById(id: CharacterId): CharacterDefinition {
  return CHARACTERS.find((character) => character.id === id) ?? CHARACTERS[0]
}
