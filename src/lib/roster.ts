import type { CharacterId } from './types'

export type LeagueMember = {
  name: string
  title?: string
  character: CharacterId
}

/** The league regulars, offered as one-click seats. */
export const LEAGUE_MEMBERS: readonly LeagueMember[] = [
  { name: 'Raj', title: 'Big daddy', character: 'c3' },
  { name: 'Porni', title: 'Shaky Hands', character: 'c6' },
  { name: 'KG', title: 'F*** it!!', character: 'c1' },
  { name: 'Anni', title: 'Stats king', character: 'c2' },
  { name: 'Sushanth', title: 'Sushi', character: 'c8' },
  { name: 'Vishnu', character: 'c5' },
  { name: 'Ganesh', title: 'Quints', character: 'c4' },
  { name: 'Sanjay', title: 'Pocket Kings', character: 'c7' },
]

export function isSeated(names: readonly string[], member: LeagueMember): boolean {
  const target = member.name.toLowerCase()
  return names.some((name) => name.trim().toLowerCase() === target)
}
