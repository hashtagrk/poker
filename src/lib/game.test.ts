import { describe, expect, test } from 'vitest'
import {
  addPlayer,
  beginCashOut,
  createGame,
  finalizeGame,
  GameError,
  markPayoff,
  recordTransaction,
  removePlayer,
  removeTransaction,
  updatePlayer,
  reopenGame,
  setCashOut,
  settlementFor,
  startGame,
  transferKey,
  updateSettings,
} from './game'
import { derivePlayerSummaries, deriveTotals } from './ledger'
import { parseGameJson } from './schema'
import { buildSummaryText } from './summary'
import { BANK, type Game } from './types'

function tableWith(names: string[], buyIn = 2000): Game {
  const game = names.reduce((current, name) => addPlayer(current, name), createGame({ name: 'Friday', currency: '$', defaultBuyIn: buyIn }))
  return startGame(game, Object.fromEntries(game.players.map((player) => [player.id, buyIn])))
}

const idOf = (game: Game, name: string) => {
  const player = game.players.find((candidate) => candidate.name === name)
  if (!player) throw new Error(`no player ${name}`)
  return player.id
}

describe('setup', () => {
  test('creates a game with defaults and trimmed names', () => {
    const game = createGame({ name: '  Friday  night ', currency: ' ', defaultBuyIn: 2000 })
    expect(game.name).toBe('Friday night')
    expect(game.currency).toBe('₹')
    expect(game.status).toBe('setup')
  })

  test('rejects a zero or negative default buy-in', () => {
    expect(() => createGame({ name: 'x', currency: '$', defaultBuyIn: 0 })).toThrow(GameError)
    expect(() => createGame({ name: 'x', currency: '$', defaultBuyIn: -5 })).toThrow(GameError)
  })

  test('adds up to eight unique players with sequential seats', () => {
    let game = createGame({ name: 'x', currency: '$', defaultBuyIn: 2000 })
    for (let index = 0; index < 7; index += 1) game = addPlayer(game, `Player ${index + 1}`)
    expect(() => addPlayer(game, 'player 1')).toThrow(/already at the table/)
    expect(() => addPlayer(game, '   ')).toThrow(/required/)
    game = addPlayer(game, 'Player 8')
    expect(game.players.map((player) => player.seat)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    expect(() => addPlayer(game, 'Ninth')).toThrow(/at most 8/)
  })

  test('does not mutate the previous game object', () => {
    const before = createGame({ name: 'x', currency: '$', defaultBuyIn: 2000 })
    const after = addPlayer(before, 'Ana')
    expect(before.players).toHaveLength(0)
    expect(after.players).toHaveLength(1)
  })

  test('requires at least two players and a buy-in for each to start', () => {
    const solo = addPlayer(createGame({ name: 'x', currency: '$', defaultBuyIn: 2000 }), 'Ana')
    expect(() => startGame(solo, {})).toThrow(/At least 2/)
    const pair = addPlayer(solo, 'Ben')
    expect(() => startGame(pair, { [idOf(pair, 'Ana')]: 2000 })).toThrow(/needs a buy-in/)
    const started = startGame(pair, { [idOf(pair, 'Ana')]: 2000, [idOf(pair, 'Ben')]: 4000 })
    expect(started.status).toBe('active')
    expect(started.transactions).toHaveLength(2)
    expect(deriveTotals(started).inPlay).toBe(6000)
  })

  test('edits player profile and removes players without transactions', () => {
    let game = addPlayer(addPlayer(createGame({ name: 'x', currency: '$', defaultBuyIn: 2000 }), 'Ana'), 'Ben')
    expect(game.players.map((player) => player.character)).toEqual(['c1', 'c2'])
    game = updatePlayer(game, idOf(game, 'Ben'), { name: 'Benji', title: ' The Rock ', character: 'c5' })
    expect(game.players[1]).toMatchObject({ name: 'Benji', title: 'The Rock', character: 'c5' })
    game = updatePlayer(game, idOf(game, 'Benji'), { title: '' })
    expect(game.players[1].title).toBeUndefined()
    expect(() => updatePlayer(game, idOf(game, 'Benji'), { name: 'ANA' })).toThrow(/already/)
    expect(() => updatePlayer(game, idOf(game, 'Benji'), { character: 'nope' })).toThrow(/character/)
    expect(() => updatePlayer(game, idOf(game, 'Benji'), { title: 'x'.repeat(31) })).toThrow(/30 characters/)
    game = removePlayer(game, idOf(game, 'Benji'))
    expect(game.players).toHaveLength(1)
  })

  test('updates settings only before the game is finished', () => {
    const game = updateSettings(createGame({ name: 'x', currency: '$', defaultBuyIn: 2000 }), { currency: '€', defaultBuyIn: 5000 })
    expect(game.currency).toBe('€')
    expect(updateSettings(game, { currency: 'INR' }).currency).toBe('₹')
    expect(game.defaultBuyIn).toBe(5000)
    expect(() => updateSettings(game, { currency: 'EURO' })).toThrow(/3 characters/)
  })
})

describe('ledger', () => {
  test('rebuys increase paid in and chips received', () => {
    let game = tableWith(['Ana', 'Ben'])
    game = recordTransaction(game, { kind: 'rebuy', playerId: idOf(game, 'Ana'), amount: 1500 })
    const [ana, ben] = derivePlayerSummaries(game)
    expect(ana.paidIn).toBe(3500)
    expect(ana.chipsReceived).toBe(3500)
    expect(ana.rebuyCount).toBe(1)
    expect(ben.paidIn).toBe(2000)
    expect(deriveTotals(game).inPlay).toBe(5500)
  })

  test('a bank-funded loan adds chips for the borrower and cash from the lender', () => {
    let game = tableWith(['Ana', 'Ben'])
    game = recordTransaction(game, {
      kind: 'loan',
      lenderId: idOf(game, 'Ana'),
      borrowerId: idOf(game, 'Ben'),
      amount: 1000,
      source: 'bank',
    })
    const [ana, ben] = derivePlayerSummaries(game)
    expect(ana.paidIn).toBe(3000)
    expect(ana.lent).toBe(1000)
    expect(ana.chipsReceived).toBe(2000)
    expect(ben.borrowed).toBe(1000)
    expect(ben.chipsReceived).toBe(3000)
    const totals = deriveTotals(game)
    expect(totals.inPlay).toBe(5000)
    expect(totals.loansOutstanding).toBe(1000)
  })

  test('a stack loan moves chips without touching the bank', () => {
    let game = tableWith(['Ana', 'Ben'])
    game = recordTransaction(game, {
      kind: 'loan',
      lenderId: idOf(game, 'Ana'),
      borrowerId: idOf(game, 'Ben'),
      amount: 500,
      source: 'stack',
    })
    const [ana, ben] = derivePlayerSummaries(game)
    expect(ana.paidIn).toBe(2000)
    expect(ana.chipsReceived).toBe(1500)
    expect(ben.chipsReceived).toBe(2500)
    expect(deriveTotals(game).inPlay).toBe(4000)
  })

  test('rejects self-loans, zero amounts, unknown players, and long notes', () => {
    const game = tableWith(['Ana', 'Ben'])
    const ana = idOf(game, 'Ana')
    expect(() => recordTransaction(game, { kind: 'loan', lenderId: ana, borrowerId: ana, amount: 100, source: 'bank' })).toThrow(/themselves/)
    expect(() => recordTransaction(game, { kind: 'rebuy', playerId: ana, amount: 0 })).toThrow(/greater than zero/)
    expect(() => recordTransaction(game, { kind: 'rebuy', playerId: 'nope', amount: 100 })).toThrow(/not in this game/)
    expect(() => recordTransaction(game, { kind: 'rebuy', playerId: ana, amount: 100, note: 'x'.repeat(81) })).toThrow(/80 characters/)
  })

  test('removes rebuys but protects opening buy-ins', () => {
    let game = tableWith(['Ana', 'Ben'])
    const opening = game.transactions[0].id
    expect(() => removeTransaction(game, opening)).toThrow(/opening buy-in/)
    game = recordTransaction(game, { kind: 'rebuy', playerId: idOf(game, 'Ana'), amount: 1500 })
    const rebuy = game.transactions.at(-1)?.id ?? ''
    game = removeTransaction(game, rebuy)
    expect(game.transactions).toHaveLength(2)
    expect(() => removeTransaction(game, 'missing')).toThrow(/no longer exists/)
  })

  test('blocks removing a player who has transactions', () => {
    const game = tableWith(['Ana', 'Ben'])
    expect(() => removePlayer(game, idOf(game, 'Ana'))).toThrow(/transactions/)
  })
})

describe('cash-out and settlement', () => {
  test('nets out loans so the lender is made whole', () => {
    let game = tableWith(['Ana', 'Ben', 'Cal'])
    const ana = idOf(game, 'Ana')
    const ben = idOf(game, 'Ben')
    const cal = idOf(game, 'Cal')
    game = recordTransaction(game, { kind: 'loan', lenderId: ana, borrowerId: ben, amount: 1000, source: 'bank' })
    game = beginCashOut(game)
    // Chips in play: 7000. Ben loses everything, Ana doubles up, Cal takes the rest.
    game = setCashOut(game, ana, 4000)
    game = setCashOut(game, ben, 0)
    game = setCashOut(game, cal, 3000)
    const totals = deriveTotals(game)
    expect(totals.isBalanced).toBe(true)
    const [anaSummary, benSummary, calSummary] = derivePlayerSummaries(game)
    expect(anaSummary.net).toBe(2000)
    expect(benSummary.net).toBe(-3000)
    expect(calSummary.net).toBe(1000)
    const transfers = settlementFor(game)
    expect(transfers).toEqual([
      { from: ben, to: ana, amount: 2000 },
      { from: ben, to: cal, amount: 1000 },
    ])
  })

  test('refuses to finalize until everyone is in and the chips balance', () => {
    let game = beginCashOut(tableWith(['Ana', 'Ben']))
    expect(() => finalizeGame(game)).toThrow(/Every player/)
    game = setCashOut(game, idOf(game, 'Ana'), 3000)
    game = setCashOut(game, idOf(game, 'Ben'), 500)
    expect(deriveTotals(game).discrepancy).toBe(-500)
    expect(settlementFor(game)).toEqual([])
    expect(() => finalizeGame(game)).toThrow(/add up/)
    game = setCashOut(game, idOf(game, 'Ben'), 1000)
    game = finalizeGame(game)
    expect(game.status).toBe('settled')
    expect(game.settledAt).toBeDefined()
  })

  test('cash-out values can be cleared and cannot be negative', () => {
    let game = beginCashOut(tableWith(['Ana', 'Ben']))
    const ana = idOf(game, 'Ana')
    game = setCashOut(game, ana, 100)
    game = setCashOut(game, ana, null)
    expect(game.cashOuts[ana]).toBeUndefined()
    expect(() => setCashOut(game, ana, -1)).toThrow(/negative/)
  })

  test('reopening steps back one stage and clears settledAt', () => {
    let game = beginCashOut(tableWith(['Ana', 'Ben']))
    game = setCashOut(game, idOf(game, 'Ana'), 4000)
    game = setCashOut(game, idOf(game, 'Ben'), 0)
    game = finalizeGame(game)
    game = reopenGame(game)
    expect(game.status).toBe('cash-out')
    expect(game.settledAt).toBeUndefined()
    game = reopenGame(game)
    expect(game.status).toBe('active')
    expect(() => recordTransaction(reopenGame(beginCashOut(game)), { kind: 'rebuy', playerId: idOf(game, 'Ana'), amount: 1 })).not.toThrow()
  })

  test('status guards reject out-of-order actions', () => {
    const game = tableWith(['Ana', 'Ben'])
    expect(() => startGame(game, {})).toThrow(/while the game is active/)
    expect(() => setCashOut(game, idOf(game, 'Ana'), 1)).toThrow(/while the game is active/)
    expect(() => reopenGame(game)).toThrow(/reopen/)
  })

  test('summary text lists results and transfers', () => {
    let game = beginCashOut(tableWith(['Ana', 'Ben']))
    game = setCashOut(game, idOf(game, 'Ana'), 4000)
    game = setCashOut(game, idOf(game, 'Ben'), 0)
    const text = buildSummaryText(finalizeGame(game), settlementFor(game))
    expect(text).toContain('Ana: in $20, out $40, net +$20')
    expect(text).toContain('Ben → Ana: $20')
  })
})

describe('schema', () => {
  test('round-trips a game through JSON', () => {
    const game = tableWith(['Ana', 'Ben'])
    expect(parseGameJson(JSON.stringify(game))).toEqual(game)
  })

  test('rejects malformed input with a readable message', () => {
    expect(() => parseGameJson('{nope')).toThrow(/not valid JSON/)
    expect(() => parseGameJson('{"id":"x"}')).toThrow(/Invalid game file/)
    const game = tableWith(['Ana', 'Ben'])
    const broken = { ...game, transactions: [{ ...game.transactions[0], playerId: 'ghost' }] }
    expect(() => parseGameJson(JSON.stringify(broken))).toThrow(/unknown player/)
  })
})

describe('bank loans', () => {
  function withBankLoan() {
    let game = tableWith(['Ana', 'Ben'])
    game = recordTransaction(game, { kind: 'loan', lenderId: BANK, borrowerId: idOf(game, 'Ben'), amount: 1000, source: 'stack' })
    return game
  }

  test('issues chips on credit: the borrower owes the bank and no player is the lender', () => {
    const game = withBankLoan()
    expect(game.transactions.at(-1)).toMatchObject({ lenderId: BANK, source: 'bank' })
    const [ana, ben] = derivePlayerSummaries(game)
    expect(ana.lent).toBe(0)
    expect(ana.paidIn).toBe(2000)
    expect(ben.borrowed).toBe(1000)
    expect(ben.owesBank).toBe(1000)
    expect(ben.paidIn).toBe(2000)
    expect(ben.chipsReceived).toBe(3000)
    const totals = deriveTotals(game)
    expect(totals.inPlay).toBe(5000)
    expect(totals.bankCredit).toBe(1000)
    expect(totals.loansOutstanding).toBe(1000)
  })

  test('settles with the bank debt netted into the borrower', () => {
    let game = beginCashOut(withBankLoan())
    // Ben turns 3000 in chips into 1000: down 2000 overall.
    game = setCashOut(game, idOf(game, 'Ana'), 4000)
    game = setCashOut(game, idOf(game, 'Ben'), 1000)
    expect(deriveTotals(game).isBalanced).toBe(true)
    expect(derivePlayerSummaries(game).map((summary) => summary.net)).toEqual([2000, -2000])
    expect(settlementFor(game)).toEqual([{ from: idOf(game, 'Ben'), to: idOf(game, 'Ana'), amount: 2000 }])
  })

  test('a cash repayment puts the money in the bank and keeps chips in play', () => {
    let game = withBankLoan()
    game = recordTransaction(game, { kind: 'repayment', borrowerId: idOf(game, 'Ben'), lenderId: BANK, amount: 400, method: 'cash' })
    const ben = derivePlayerSummaries(game)[1]
    expect(ben.owesBank).toBe(600)
    expect(ben.paidIn).toBe(2400)
    expect(ben.chipsReceived).toBe(3000)
    const totals = deriveTotals(game)
    expect(totals.inPlay).toBe(5000)
    expect(totals.bankCredit).toBe(600)
  })

  test('a chip repayment takes the chips out of play', () => {
    let game = withBankLoan()
    game = recordTransaction(game, { kind: 'repayment', borrowerId: idOf(game, 'Ben'), lenderId: BANK, amount: 1000, method: 'chips' })
    const ben = derivePlayerSummaries(game)[1]
    expect(ben.borrowed).toBe(0)
    expect(ben.chipsReceived).toBe(2000)
    expect(deriveTotals(game).inPlay).toBe(4000)
    expect(() => recordTransaction(game, { kind: 'repayment', borrowerId: idOf(game, 'Ben'), lenderId: BANK, amount: 1, method: 'cash' })).toThrow(
      /does not owe the bank/,
    )
  })

  test('survives a save and reload, and rejects a bank loan from a stack', () => {
    const game = withBankLoan()
    expect(parseGameJson(JSON.stringify(game)).transactions.at(-1)).toMatchObject({ lenderId: BANK })
    const broken = {
      ...game,
      transactions: game.transactions.map((transaction) => (transaction.kind === 'loan' ? { ...transaction, source: 'stack' } : transaction)),
    }
    expect(() => parseGameJson(JSON.stringify(broken))).toThrow(/bank loan/)
  })
})

describe('repayments and payoffs', () => {
  function withLoan() {
    let game = tableWith(['Ana', 'Ben'])
    game = recordTransaction(game, { kind: 'loan', lenderId: idOf(game, 'Ana'), borrowerId: idOf(game, 'Ben'), amount: 1000, source: 'bank' })
    return game
  }

  test('a cash repayment reduces the outstanding loan without touching chips', () => {
    let game = withLoan()
    game = recordTransaction(game, { kind: 'repayment', borrowerId: idOf(game, 'Ben'), lenderId: idOf(game, 'Ana'), amount: 400, method: 'cash' })
    const [ana, ben] = derivePlayerSummaries(game)
    expect(ana.lent).toBe(600)
    expect(ben.borrowed).toBe(600)
    expect(ana.chipsReceived).toBe(2000)
    expect(ben.chipsReceived).toBe(3000)
    expect(deriveTotals(game).loansOutstanding).toBe(600)
  })

  test('a chip repayment hands chips back and nets to the same result', () => {
    let game = withLoan()
    game = recordTransaction(game, { kind: 'repayment', borrowerId: idOf(game, 'Ben'), lenderId: idOf(game, 'Ana'), amount: 1000, method: 'chips' })
    const [ana, ben] = derivePlayerSummaries(game)
    expect(ana.chipsReceived).toBe(3000)
    expect(ben.chipsReceived).toBe(2000)
    expect(ana.lent).toBe(0)
    game = beginCashOut(game)
    game = setCashOut(game, idOf(game, 'Ana'), 3000)
    game = setCashOut(game, idOf(game, 'Ben'), 2000)
    expect(derivePlayerSummaries(game).map((summary) => summary.net)).toEqual([0, 0])
    expect(settlementFor(game)).toEqual([])
  })

  test('rejects repaying more than is owed, or a debt that does not exist', () => {
    const game = withLoan()
    const ben = idOf(game, 'Ben')
    const ana = idOf(game, 'Ana')
    expect(() => recordTransaction(game, { kind: 'repayment', borrowerId: ben, lenderId: ana, amount: 1500, method: 'cash' })).toThrow(/only owes/)
    expect(() => recordTransaction(game, { kind: 'repayment', borrowerId: ana, lenderId: ben, amount: 100, method: 'cash' })).toThrow(/does not owe/)
    expect(() => recordTransaction(game, { kind: 'repayment', borrowerId: ben, lenderId: ben, amount: 100, method: 'cash' })).toThrow(/themselves/)
  })

  test('a loan cannot be removed while a repayment against it remains', () => {
    let game = withLoan()
    const loanId = game.transactions.at(-1)?.id ?? ''
    game = recordTransaction(game, { kind: 'repayment', borrowerId: idOf(game, 'Ben'), lenderId: idOf(game, 'Ana'), amount: 400, method: 'cash' })
    expect(() => removeTransaction(game, loanId)).toThrow(/repayment/)
    const repaymentId = game.transactions.at(-1)?.id ?? ''
    game = removeTransaction(game, repaymentId)
    expect(() => removeTransaction(game, loanId)).not.toThrow()
  })

  test('settlement transfers can be ticked off as paid and reset on reopen', () => {
    let game = beginCashOut(tableWith(['Ana', 'Ben']))
    game = setCashOut(game, idOf(game, 'Ana'), 4000)
    game = setCashOut(game, idOf(game, 'Ben'), 0)
    game = finalizeGame(game)
    const [transfer] = settlementFor(game)
    const key = transferKey(transfer)
    expect(() => markPayoff(game, 'nope', true)).toThrow(/not part/)
    game = markPayoff(game, key, true, '2026-01-01T00:00:00.000Z')
    expect(game.payoffs[key]).toBe('2026-01-01T00:00:00.000Z')
    expect(buildSummaryText(game, settlementFor(game))).toContain('Ben → Ana: $20 ✓ paid')
    game = markPayoff(game, key, false)
    expect(game.payoffs[key]).toBeUndefined()
    game = markPayoff(game, key, true)
    game = reopenGame(game)
    expect(game.payoffs).toEqual({})
    expect(() => markPayoff(game, key, true)).toThrow(/cash-out/)
  })

  test('persisted games without a payoffs map still parse', () => {
    const game = tableWith(['Ana', 'Ben'])
    const { payoffs: _dropped, ...legacy } = game
    expect(parseGameJson(JSON.stringify(legacy)).payoffs).toEqual({})
  })
})
