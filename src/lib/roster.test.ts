import { describe, expect, test } from 'vitest'
import { addPlayer, createGame } from './game'
import { isSeated, LEAGUE_MEMBERS } from './roster'
import { CHARACTER_IDS, MAX_PLAYERS } from './types'

describe('league roster', () => {
  test('has a full table of unique members with valid characters', () => {
    expect(LEAGUE_MEMBERS).toHaveLength(MAX_PLAYERS)
    const names = LEAGUE_MEMBERS.map((member) => member.name.toLowerCase())
    expect(new Set(names).size).toBe(names.length)
    const characters = LEAGUE_MEMBERS.map((member) => member.character)
    expect(new Set(characters).size).toBe(characters.length)
    for (const member of LEAGUE_MEMBERS) expect(CHARACTER_IDS).toContain(member.character)
  })

  test('every member can be seated with their title and character', () => {
    let game = createGame({ name: 'League', currency: '₹', defaultBuyIn: 50000 })
    for (const member of LEAGUE_MEMBERS) game = addPlayer(game, member.name, { title: member.title, character: member.character })
    expect(game.players.map((player) => [player.name, player.title, player.character])).toEqual(
      LEAGUE_MEMBERS.map((member) => [member.name, member.title, member.character]),
    )
    expect(game.players.find((player) => player.name === 'Vishnu')?.title).toBeUndefined()
  })

  test('isSeated matches names case-insensitively', () => {
    expect(isSeated(['raj ', 'Anni'], LEAGUE_MEMBERS[0])).toBe(true)
    expect(isSeated(['Ben'], LEAGUE_MEMBERS[0])).toBe(false)
  })

  test('a preferred character that is already taken falls back to a free one', () => {
    let game = addPlayer(createGame({ name: 'x', currency: '₹', defaultBuyIn: 1 }), 'Someone', { character: 'c3' })
    game = addPlayer(game, 'Raj', { title: 'Big daddy', character: 'c3' })
    expect(game.players[1].character).not.toBe('c3')
  })
})
