import XCTest
@testable import AlpinePoker

/// Ported from the web app's Vitest suites, so both apps keep the same money rules.

private func table(_ names: [String], buyIn: Cents = 2000) throws -> Game {
    var game = try Game.create(name: "Test night", currency: "$", defaultBuyIn: buyIn)
    for name in names { try game.addPlayer(name) }
    try game.start(buyIns: Dictionary(uniqueKeysWithValues: game.players.map { ($0.id, buyIn) }))
    return game
}

private func id(_ game: Game, _ name: String) -> PlayerID {
    game.players.first { $0.name == name }!.id
}

private func settles(_ balances: [Balance], _ transfers: [Transfer]) -> Bool {
    var remaining = Dictionary(uniqueKeysWithValues: balances.map { ($0.id, $0.amount) })
    for t in transfers {
        remaining[t.from, default: 0] += t.amount
        remaining[t.to, default: 0] -= t.amount
        if t.amount <= 0 || t.from == t.to { return false }
    }
    return remaining.values.allSatisfy { $0 == 0 }
}

private func expectError(_ pattern: String, _ body: () throws -> Void, file: StaticString = #filePath, line: UInt = #line) {
    do {
        try body()
        XCTFail("expected an error containing “\(pattern)”", file: file, line: line)
    } catch {
        XCTAssertTrue(error.localizedDescription.contains(pattern), "“\(error.localizedDescription)” lacks “\(pattern)”", file: file, line: line)
    }
}

final class MoneyTests: XCTestCase {
    func testParse() {
        XCTAssertEqual(Money.parse("20"), 2000)
        XCTAssertEqual(Money.parse("20.5"), 2050)
        XCTAssertEqual(Money.parse("0.07"), 7)
        XCTAssertEqual(Money.parse("1,250.75"), 125_075)
        XCTAssertEqual(Money.parse(" $40 "), 4000)
        XCTAssertEqual(Money.parse("€12.30"), 1230)
        XCTAssertEqual(Money.parse("₹1,500"), 150_000)
        XCTAssertNil(Money.parse(""))
        XCTAssertNil(Money.parse("."))
        XCTAssertNil(Money.parse("-5"))
        XCTAssertNil(Money.parse("1.234"))
        XCTAssertNil(Money.parse("abc"))
        XCTAssertNil(Money.parse("1.2.3"))
    }

    func testFormat() {
        XCTAssertEqual(Money.format(123_450, "$"), "$1,234.50")
        XCTAssertEqual(Money.format(0, "$"), "$0.00")
        XCTAssertEqual(Money.format(-500, "$"), "−$5.00")
        XCTAssertEqual(Money.format(500, "$", signed: true), "+$5.00")
        XCTAssertEqual(Money.format(0, "$", signed: true), "$0.00")
        XCTAssertEqual(Money.format(12_345_600, "₹"), "₹1,23,456.00")
        XCTAssertEqual(Money.format(12_345_600, "$"), "$123,456.00")
        XCTAssertEqual(Money.format(2000, "£", compact: true), "£20")
        XCTAssertEqual(Money.format(2050, "£", compact: true), "£20.50")
    }

    func testCurrencyAndEditableText() {
        XCTAssertEqual(Money.normalizeCurrency("INR"), "₹")
        XCTAssertEqual(Money.normalizeCurrency(" rs "), "₹")
        XCTAssertEqual(Money.normalizeCurrency("usd"), "$")
        XCTAssertEqual(Money.normalizeCurrency(""), "₹")
        XCTAssertEqual(Money.normalizeCurrency("kr"), "kr")
        XCTAssertEqual(Money.editable(150_000), "1500")
        XCTAssertEqual(Money.editable(2050), "20.5")
        XCTAssertEqual(Money.editable(2005), "20.05")
    }
}

final class SettlementTests: XCTestCase {
    func testEvenAndUnbalanced() throws {
        XCTAssertEqual(try Settlement.settle([Balance(id: "a", amount: 0), Balance(id: "b", amount: 0)]), [])
        XCTAssertEqual(try Settlement.settle([]), [])
        XCTAssertThrowsError(try Settlement.settle([Balance(id: "a", amount: 100)]))
    }

    func testTwoPlayers() throws {
        XCTAssertEqual(try Settlement.settle([Balance(id: "winner", amount: 2500), Balance(id: "loser", amount: -2500)]),
                       [Transfer(from: "loser", to: "winner", amount: 2500)])
    }

    func testIndependentGroups() throws {
        let balances = [("a", 1000), ("b", -1000), ("c", 3000), ("d", -3000), ("e", 500), ("f", -500)].map { Balance(id: $0.0, amount: $0.1) }
        let transfers = try Settlement.settle(balances)
        XCTAssertEqual(transfers.count, 3)
        XCTAssertTrue(settles(balances, transfers))
    }

    func testBeatsGreedyWhenASubsetCancels() throws {
        let balances = [("a", 700), ("b", -400), ("c", -300), ("d", 200), ("e", -200)].map { Balance(id: $0.0, amount: $0.1) }
        XCTAssertGreaterThanOrEqual(Settlement.greedy(balances).count, 3)
        let transfers = try Settlement.settle(balances)
        XCTAssertEqual(transfers.count, 3)
        XCTAssertTrue(settles(balances, transfers))
    }

    func testEightPlayersAndZeroBalanceLeftOut() throws {
        let balances = [("p1", 12345), ("p2", -2000), ("p3", -4000), ("p4", 655), ("p5", -5000), ("p6", 0), ("p7", -3000), ("p8", 1000)]
            .map { Balance(id: $0.0, amount: $0.1) }
        let transfers = try Settlement.settle(balances)
        XCTAssertLessThanOrEqual(transfers.count, 7)
        XCTAssertTrue(settles(balances, transfers))
        XCTAssertFalse(transfers.contains { $0.from == "p6" || $0.to == "p6" })
    }

    func testNeverMoreThanNMinusOneOnRandomTables() throws {
        var seed: UInt64 = 42
        func random() -> Double {
            seed = (seed &* 1_664_525 &+ 1_013_904_223) % 4_294_967_296
            return Double(seed) / 4_294_967_296
        }
        for _ in 0..<200 {
            let count = 2 + Int(random() * 7)
            var amounts = (0..<(count - 1)).map { _ in Int(random() * 20001) - 10000 }
            amounts.append(-amounts.reduce(0, +))
            let balances = amounts.enumerated().map { Balance(id: "p\($0.offset)", amount: $0.element) }
            let transfers = try Settlement.settle(balances)
            XCTAssertLessThanOrEqual(transfers.count, max(0, balances.filter { $0.amount != 0 }.count - 1))
            XCTAssertTrue(settles(balances, transfers))
        }
    }

    func testGreedyForVeryLargeTables() throws {
        let balances = (0..<20).map { Balance(id: "p\($0)", amount: $0 % 2 == 0 ? 100 : -100) }
        let transfers = try Settlement.settle(balances)
        XCTAssertTrue(settles(balances, transfers))
        XCTAssertLessThanOrEqual(transfers.count, 19)
    }
}

final class GameTests: XCTestCase {
    func testCreateDefaultsAndValidation() throws {
        let game = try Game.create(name: "  ", currency: "INR", defaultBuyIn: 1500)
        XCTAssertEqual(game.name, "Poker night")
        XCTAssertEqual(game.currency, "₹")
        XCTAssertEqual(game.status, .setup)
        expectError("greater than zero") { _ = try Game.create(name: "x", currency: "$", defaultBuyIn: 0) }
    }

    func testSeatsUpToEightUniquePlayers() throws {
        var game = try Game.create(name: "x", currency: "$", defaultBuyIn: 100)
        for n in 1...8 { try game.addPlayer("P\(n)") }
        XCTAssertEqual(game.players.map(\.seat), Array(1...8))
        XCTAssertEqual(Set(game.players.map(\.character)).count, 8, "each seat gets its own character")
        expectError("at most 8") { try game.addPlayer("Nine") }
        var small = try Game.create(name: "x", currency: "$", defaultBuyIn: 100)
        try small.addPlayer("Ana")
        expectError("already at the table") { try small.addPlayer(" ana ") }
    }

    func testStartNeedsTwoPlayersAndBuyIns() throws {
        var game = try Game.create(name: "x", currency: "$", defaultBuyIn: 100)
        try game.addPlayer("Ana")
        expectError("At least 2") { try game.start(buyIns: [:]) }
        try game.addPlayer("Ben")
        expectError("needs a buy-in") { try game.start(buyIns: [id(game, "Ana"): 100]) }
    }

    func testRebuyAndLoans() throws {
        var game = try table(["Ana", "Ben"])
        try game.buyIn(id(game, "Ana"), amount: 1500)
        var s = Ledger.summaries(game)
        XCTAssertEqual(s[0].paidIn, 3500)
        XCTAssertEqual(s[0].rebuyCount, 1)
        XCTAssertEqual(Ledger.totals(game).inPlay, 5500)

        game = try table(["Ana", "Ben"])
        try game.loan(from: id(game, "Ana"), to: id(game, "Ben"), amount: 1000, source: .bank)
        s = Ledger.summaries(game)
        XCTAssertEqual([s[0].paidIn, s[0].lent, s[0].chipsReceived], [3000, 1000, 2000])
        XCTAssertEqual([s[1].borrowed, s[1].chipsReceived], [1000, 3000])
        XCTAssertEqual(Ledger.totals(game).inPlay, 5000)

        game = try table(["Ana", "Ben"])
        try game.loan(from: id(game, "Ana"), to: id(game, "Ben"), amount: 500, source: .stack)
        s = Ledger.summaries(game)
        XCTAssertEqual([s[0].paidIn, s[0].chipsReceived, s[1].chipsReceived], [2000, 1500, 2500])
        XCTAssertEqual(Ledger.totals(game).inPlay, 4000)
    }

    func testRejectsBadTransactions() throws {
        var game = try table(["Ana", "Ben"])
        let ana = id(game, "Ana")
        expectError("themselves") { try game.loan(from: ana, to: ana, amount: 100, source: .bank) }
        expectError("greater than zero") { try game.buyIn(ana, amount: 0) }
        expectError("not in this game") { try game.buyIn("nope", amount: 100) }
        expectError("80 characters") { try game.buyIn(ana, amount: 100, note: String(repeating: "x", count: 81)) }
    }

    func testOpeningBuyInIsProtected() throws {
        var game = try table(["Ana", "Ben"])
        let opening = game.transactions[0].id
        expectError("opening buy-in") { try game.removeTransaction(opening) }
        try game.buyIn(id(game, "Ana"), amount: 1500)
        try game.removeTransaction(game.transactions.last!.id)
        XCTAssertEqual(game.transactions.count, 2)
        expectError("no longer exists") { try game.removeTransaction("missing") }
        expectError("transactions") { try game.removePlayer(id(game, "Ana")) }
    }

    func testLoansNetOutSoTheLenderIsWhole() throws {
        var game = try table(["Ana", "Ben", "Cal"])
        let (ana, ben, cal) = (id(game, "Ana"), id(game, "Ben"), id(game, "Cal"))
        try game.loan(from: ana, to: ben, amount: 1000, source: .bank)
        try game.beginCashOut()
        try game.setCashOut(ana, 4000)
        try game.setCashOut(ben, 0)
        try game.setCashOut(cal, 3000)
        XCTAssertTrue(Ledger.totals(game).isBalanced)
        XCTAssertEqual(Ledger.summaries(game).map(\.net), [2000, -3000, 1000])
        XCTAssertEqual(game.settlement, [Transfer(from: ben, to: ana, amount: 2000), Transfer(from: ben, to: cal, amount: 1000)])
    }

    func testFinalizeNeedsEveryCountAndBalance() throws {
        var game = try table(["Ana", "Ben"])
        try game.beginCashOut()
        try game.setCashOut(id(game, "Ana"), 4000)
        expectError("Every player") { try game.finalize() }
        try game.setCashOut(id(game, "Ben"), 1)
        expectError("add up") { try game.finalize() }
        try game.setCashOut(id(game, "Ben"), 0)
        try game.finalize()
        XCTAssertEqual(game.status, .settled)
        XCTAssertNotNil(game.settledAt)
        expectError("negative") {
            var g = try table(["A", "B"]); try g.beginCashOut(); try g.setCashOut(id(g, "A"), -1)
        }
    }

    func testReopenStepsBackAndClearsPayoffs() throws {
        var game = try table(["Ana", "Ben"])
        try game.beginCashOut()
        try game.setCashOut(id(game, "Ana"), 3000)
        try game.setCashOut(id(game, "Ben"), 1000)
        try game.finalize()
        let transfer = game.settlement[0]
        try game.markPayoff(transfer.key, paid: true)
        XCTAssertNotNil(game.payoffs[transfer.key])
        expectError("not part of this settlement") { try game.markPayoff("x>y", paid: true) }
        try game.reopen()
        XCTAssertEqual(game.status, .cashOut)
        XCTAssertNil(game.settledAt)
        XCTAssertTrue(game.payoffs.isEmpty)
        try game.reopen()
        XCTAssertEqual(game.status, .active)
        expectError("Cannot finalize while the game is active") { try game.finalize() }
    }

    func testBankLoanAndRepayments() throws {
        var game = try table(["Ana", "Ben"])
        let ben = id(game, "Ben")
        try game.loan(from: bankID, to: ben, amount: 1000, source: .stack)
        XCTAssertEqual(game.transactions.last?.source, .bank, "the bank always issues the chips")
        var s = Ledger.summaries(game)
        XCTAssertEqual([s[0].lent, s[1].borrowed, s[1].owesBank, s[1].paidIn, s[1].chipsReceived], [0, 1000, 1000, 2000, 3000])
        XCTAssertEqual(Ledger.totals(game).bankCredit, 1000)
        XCTAssertEqual(Ledger.totals(game).inPlay, 5000)

        var cash = game
        try cash.repay(ben, to: bankID, amount: 400, method: .cash)
        s = Ledger.summaries(cash)
        XCTAssertEqual([s[1].owesBank, s[1].paidIn, s[1].chipsReceived], [600, 2400, 3000])
        XCTAssertEqual(Ledger.totals(cash).inPlay, 5000)

        var chips = game
        try chips.repay(ben, to: bankID, amount: 1000, method: .chips)
        s = Ledger.summaries(chips)
        XCTAssertEqual([s[1].borrowed, s[1].chipsReceived], [0, 2000])
        XCTAssertEqual(Ledger.totals(chips).inPlay, 4000)
        expectError("does not owe the bank") { try chips.repay(ben, to: bankID, amount: 1, method: .cash) }
        expectError("only owes") { try game.repay(ben, to: bankID, amount: 5000, method: .cash) }

        try game.beginCashOut()
        try game.setCashOut(id(game, "Ana"), 4000)
        try game.setCashOut(ben, 1000)
        XCTAssertEqual(Ledger.summaries(game).map(\.net), [2000, -2000])
        XCTAssertEqual(game.settlement, [Transfer(from: ben, to: id(game, "Ana"), amount: 2000)])
    }

    func testLoanCannotBeRemovedUnderItsRepayment() throws {
        var game = try table(["Ana", "Ben"])
        try game.loan(from: id(game, "Ana"), to: id(game, "Ben"), amount: 1000, source: .bank)
        let loan = game.transactions.last!.id
        try game.repay(id(game, "Ben"), to: id(game, "Ana"), amount: 400, method: .cash)
        expectError("repayment of this loan first") { try game.removeTransaction(loan) }
    }

    func testFailedChangeLeavesTheGameUntouched() throws {
        var game = try table(["Ana", "Ben"])
        let before = game
        XCTAssertThrowsError(try game.buyIn("nope", amount: 100))
        XCTAssertEqual(game, before)
    }
}

final class LeagueTests: XCTestCase {
    private func night(_ results: [(String, Cents)]) throws -> Game {
        var game = try table(results.map(\.0))
        try game.beginCashOut()
        for (name, out) in results { try game.setCashOut(id(game, name), out) }
        try game.finalize()
        return game
    }

    func testStandingsAcrossNightsIgnoringCase() throws {
        let one = try night([("Raj", 3000), ("Ajay", 1000)])
        var two = try night([("raj", 500), ("Ajay", 3500)])
        two.updatedAt = "2099-01-01T00:00:00.000Z"
        let standings = League.standings([one, two])
        XCTAssertEqual(standings.map(\.name), ["Ajay", "raj"])
        XCTAssertEqual(standings.map(\.net), [500, -500])
        XCTAssertEqual(standings.first { $0.name == "raj" }?.bestNight, 1000)
        XCTAssertEqual(standings.first { $0.name == "raj" }?.worstNight, -1500)
        let totals = League.totals([one, two])
        XCTAssertEqual(totals.nightsSettled, 2)
        XCTAssertEqual(totals.volume, 8000)
        XCTAssertEqual(totals.biggestWin?.amount, 1500)
    }

    func testSummaryText() throws {
        let game = try night([("Raj", 3000), ("Ajay", 1000)])
        let text = League.summaryText(game)
        XCTAssertTrue(text.contains("Test night — settlement"))
        XCTAssertTrue(text.contains("• Raj: in $20, out $30, net +$10"))
        XCTAssertTrue(text.contains("• Ajay → Raj: $10"))
    }
}

@MainActor
final class StoreTests: XCTestCase {
    private func defaults() -> UserDefaults { UserDefaults(suiteName: "poker.tests.\(UUID().uuidString)")! }

    /// A game exactly as the web app writes it, including a bank loan and no `payoffs`.
    private let webGame = """
    {"id":"g1","name":"Friday","createdAt":"2026-11-01T18:00:00.000Z","updatedAt":"2026-11-01T22:00:00.000Z",
     "currency":"₹","defaultBuyIn":150000,"status":"active",
     "players":[{"id":"p1","name":"Raj","title":"Big daddy","character":"c3","seat":1},{"id":"p2","name":"KG","character":"c1","seat":2}],
     "transactions":[{"id":"t1","at":"2026-11-01T18:00:00.000Z","kind":"buy-in","playerId":"p1","amount":150000},
                     {"id":"t2","at":"2026-11-01T18:00:00.000Z","kind":"buy-in","playerId":"p2","amount":150000},
                     {"id":"t3","at":"2026-11-01T19:00:00.000Z","kind":"loan","lenderId":"bank","borrowerId":"p2","amount":50000,"source":"bank","note":"short"}],
     "cashOuts":{}}
    """

    func testReadsAndWritesTheWebFormat() throws {
        let store = PokerStore(defaults: defaults())
        XCTAssertTrue(store.importGame(Data(webGame.utf8)))
        let game = try XCTUnwrap(store.activeGame)
        XCTAssertEqual(game.players.first?.title, "Big daddy")
        XCTAssertEqual(Ledger.totals(game).inPlay, 350_000)
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: store.exportData(game)) as? [String: Any])
        let loan = try XCTUnwrap((json["transactions"] as? [[String: Any]])?.last)
        XCTAssertEqual(loan["kind"] as? String, "loan")
        XCTAssertEqual(loan["lenderId"] as? String, "bank")
        XCTAssertNil(loan["method"], "absent fields stay absent, as the web schema expects")
        XCTAssertEqual(json["status"] as? String, "active")
    }

    /// A settled night with a bank loan, a player loan and a repayment, written where the
    /// web app's import can check it (POKER_EXPORT_DIR, when set).
    func testExportsASettledNightTheWebAppCanOpen() throws {
        var game = try table(["Raj", "Ajay", "Anvay"])
        let (raj, ajay, anvay) = (id(game, "Raj"), id(game, "Ajay"), id(game, "Anvay"))
        try game.loan(from: bankID, to: ajay, amount: 1000, source: .bank, note: "short stack")
        try game.loan(from: raj, to: anvay, amount: 500, source: .stack)
        try game.repay(anvay, to: raj, amount: 200, method: .chips)
        try game.beginCashOut()
        try game.setCashOut(raj, 3000)
        try game.setCashOut(ajay, 1500)
        try game.setCashOut(anvay, 2500)
        try game.finalize()
        try game.markPayoff(game.settlement[0].key, paid: true)
        let data = PokerStore(defaults: defaults()).exportData(game)
        XCTAssertEqual(try JSONDecoder().decode(Game.self, from: data), game, "round-trips natively")
        if let dir = ProcessInfo.processInfo.environment["POKER_EXPORT_DIR"] {
            try data.write(to: URL(fileURLWithPath: dir).appendingPathComponent("native-export.json"))
        }
    }

    func testRejectsAGameThatPointsAtNobody() {
        let store = PokerStore(defaults: defaults())
        let broken = webGame.replacingOccurrences(of: #""borrowerId":"p2""#, with: #""borrowerId":"ghost""#)
        XCTAssertFalse(store.importGame(Data(broken.utf8)))
        XCTAssertNotNil(store.problem)
    }

    func testCarriesOverTheWebViewAppsGames() throws {
        let d = defaults()
        let saved = #"{"state":{"games":{"g1":\#(webGame),"bad":{"id":"bad"}},"activeGameId":"g1"},"version":1}"#
        d.set(saved, forKey: PokerStore.webViewKey)
        let store = PokerStore(defaults: d)
        XCTAssertEqual(store.games.count, 1, "the broken game is skipped, the good one kept")
        XCTAssertEqual(store.activeGame?.name, "Friday")
        XCTAssertNotNil(d.data(forKey: PokerStore.key), "saved in the native format straight away")
        XCTAssertEqual(PokerStore(defaults: d).games.count, 1)
    }

    func testUpdateReportsBrokenRulesAndKeepsTheGame() throws {
        let store = PokerStore(defaults: defaults())
        store.createGame(name: "Night", currency: "$", defaultBuyIn: 100)
        let before = store.activeGame
        XCTAssertFalse(store.update { try $0.start(buyIns: [:]) })
        XCTAssertEqual(store.problem, "At least 2 players are needed")
        XCTAssertEqual(store.activeGame, before)
    }
}
