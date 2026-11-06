import Foundation

/// A rule the table broke. The message is shown to the player as is.
struct GameError: LocalizedError, Equatable {
    let message: String
    init(_ message: String) { self.message = message }
    var errorDescription: String? { message }
}

enum Limits {
    static let playerName = 24
    static let title = 30
    static let gameName = 48
    static let note = 80
}

enum Characters {
    static let all = ["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8"]
    static let names = ["c1": "Shades", "c2": "Visor", "c3": "Crown", "c4": "Whiskers",
                        "c5": "Beanie", "c6": "Bowtie", "c7": "Headphones", "c8": "Bloom"]
}

/// The same rules as the web app's game reducers. Every mutation either leaves a valid game
/// or throws a `GameError` and changes nothing.
extension Game {
    static func create(name: String, currency: String, defaultBuyIn: Cents, at: String = Timestamp.now()) throws -> Game {
        let symbol = Money.normalizeCurrency(currency)
        guard symbol.count <= 3 else { throw GameError("Currency symbol must be 3 characters or fewer") }
        try requirePositive(defaultBuyIn, "Default buy-in")
        let title = name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "Poker night" : name
        return Game(
            id: UUID().uuidString.lowercased(), name: try clean(title, "Game name", Limits.gameName),
            createdAt: at, updatedAt: at, currency: symbol, defaultBuyIn: defaultBuyIn, status: .setup,
            players: [], transactions: [], cashOuts: [:], payoffs: [:]
        )
    }

    mutating func updateSettings(name: String? = nil, currency: String? = nil, defaultBuyIn: Cents? = nil) throws {
        try requireStatus([.setup, .active], "change settings")
        var next = self
        if let name { next.name = try Self.clean(name, "Game name", Limits.gameName) }
        if let currency {
            let symbol = Money.normalizeCurrency(currency)
            guard symbol.count <= 3 else { throw GameError("Currency symbol must be 3 characters or fewer") }
            next.currency = symbol
        }
        if let defaultBuyIn {
            try Self.requirePositive(defaultBuyIn, "Default buy-in")
            next.defaultBuyIn = defaultBuyIn
        }
        self = next
        touch()
    }

    @discardableResult
    mutating func addPlayer(_ name: String, title: String? = nil, character: String? = nil) throws -> Player {
        try requireStatus([.setup, .active], "add players")
        guard players.count < Game.maxPlayers else { throw GameError("A table seats at most \(Game.maxPlayers) players") }
        let clean = try Self.clean(name, "Player name", Limits.playerName)
        if players.contains(where: { $0.name.lowercased() == clean.lowercased() }) {
            throw GameError("\(clean) is already at the table")
        }
        let cleanTitle = try Self.cleanTitle(title)
        let taken = Set(players.map(\.character))
        let pick = character.flatMap { taken.contains($0) ? nil : $0 } ?? nextFreeCharacter()
        let player = Player(id: UUID().uuidString.lowercased(), name: clean, title: cleanTitle,
                            character: pick, seat: (players.map(\.seat).max() ?? 0) + 1)
        players.append(player)
        touch()
        return player
    }

    mutating func updatePlayer(_ id: PlayerID, name: String? = nil, title: String? = nil, character: String? = nil) throws {
        guard var player = player(id) else { throw GameError("That player is not in this game") }
        if let name {
            let clean = try Self.clean(name, "Player name", Limits.playerName)
            if players.contains(where: { $0.id != id && $0.name.lowercased() == clean.lowercased() }) {
                throw GameError("\(clean) is already at the table")
            }
            player.name = clean
        }
        if let title { player.title = try Self.cleanTitle(title) }
        if let character {
            guard Characters.all.contains(character) else { throw GameError("Unknown character") }
            player.character = character
        }
        players = players.map { $0.id == id ? player : $0 }
        touch()
    }

    mutating func removePlayer(_ id: PlayerID) throws {
        try requireStatus([.setup, .active], "remove players")
        guard player(id) != nil else { throw GameError("That player is not in this game") }
        if transactions.contains(where: { $0.participants.contains(id) }) {
            throw GameError("Remove or void their transactions before removing this player")
        }
        players.removeAll { $0.id == id }
        cashOuts[id] = nil
        touch()
    }

    /// Moves to `active`, recording an opening buy-in for every player.
    mutating func start(buyIns: [PlayerID: Cents], at: String = Timestamp.now()) throws {
        try requireStatus([.setup], "start")
        guard players.count >= Game.minPlayers else { throw GameError("At least \(Game.minPlayers) players are needed") }
        var opening: [Transaction] = []
        for player in players {
            guard let amount = buyIns[player.id] else { throw GameError("\(player.name) needs a buy-in amount") }
            try Self.requirePositive(amount, "\(player.name)'s buy-in")
            opening.append(Transaction(id: UUID().uuidString.lowercased(), at: at, kind: .buyIn,
                                       playerId: player.id, amount: amount))
        }
        transactions += opening
        status = .active
        touch(at)
    }

    mutating func buyIn(_ player: PlayerID, amount: Cents, rebuy: Bool = true, note: String? = nil, at: String = Timestamp.now()) throws {
        try requireStatus([.active], "record transactions")
        try Self.requirePositive(amount, "Amount")
        let note = try Self.cleanNote(note)
        guard self.player(player) != nil else { throw GameError("That player is not in this game") }
        transactions.append(Transaction(id: UUID().uuidString.lowercased(), at: at, note: note,
                                        kind: rebuy ? .rebuy : .buyIn, playerId: player, amount: amount))
        touch(at)
    }

    /// `source` is ignored when the bank lends: the bank always issues the chips.
    mutating func loan(from lender: PlayerID, to borrower: PlayerID, amount: Cents, source: Transaction.LoanSource,
                       note: String? = nil, at: String = Timestamp.now()) throws {
        try requireStatus([.active], "record transactions")
        try Self.requirePositive(amount, "Amount")
        let note = try Self.cleanNote(note)
        guard lender != borrower else { throw GameError("A player cannot lend to themselves") }
        let fromBank = lender == bankID
        if !fromBank, player(lender) == nil { throw GameError("That player is not in this game") }
        guard player(borrower) != nil else { throw GameError("That player is not in this game") }
        transactions.append(Transaction(id: UUID().uuidString.lowercased(), at: at, note: note, kind: .loan,
                                        lenderId: lender, borrowerId: borrower, amount: amount,
                                        source: fromBank ? .bank : source))
        touch(at)
    }

    mutating func repay(_ borrower: PlayerID, to lender: PlayerID, amount: Cents, method: Transaction.Method,
                        note: String? = nil, at: String = Timestamp.now()) throws {
        try requireStatus([.active], "record transactions")
        try Self.requirePositive(amount, "Amount")
        let note = try Self.cleanNote(note)
        guard lender != borrower else { throw GameError("A player cannot repay themselves") }
        guard let who = player(borrower) else { throw GameError("That player is not in this game") }
        if lender != bankID, player(lender) == nil { throw GameError("That player is not in this game") }
        let owed = Ledger.owed(self, borrower: borrower, lender: lender)
        guard owed > 0 else { throw GameError("\(who.name) does not owe \(name(of: lender)) anything") }
        guard amount <= owed else {
            throw GameError("\(who.name) only owes \(name(of: lender)) \(Money.format(owed, currency, compact: true))")
        }
        transactions.append(Transaction(id: UUID().uuidString.lowercased(), at: at, note: note, kind: .repayment,
                                        lenderId: lender, borrowerId: borrower, amount: amount, method: method))
        touch(at)
    }

    mutating func removeTransaction(_ id: String) throws {
        try requireStatus([.active], "remove transactions")
        guard transactions.contains(where: { $0.id == id }) else { throw GameError("That transaction no longer exists") }
        if Ledger.openingBuyInIDs(self).contains(id) {
            throw GameError("The opening buy-in cannot be removed; remove the player instead")
        }
        var next = self
        next.transactions.removeAll { $0.id == id }
        if Ledger.outstandingDebts(next).values.contains(where: { $0 < 0 }) {
            throw GameError("Remove the repayment of this loan first")
        }
        self = next
        touch()
    }

    mutating func beginCashOut() throws {
        try requireStatus([.active], "cash out")
        status = .cashOut
        touch()
    }

    mutating func setCashOut(_ player: PlayerID, _ amount: Cents?) throws {
        try requireStatus([.cashOut], "enter cash-outs")
        guard self.player(player) != nil else { throw GameError("That player is not in this game") }
        if let amount, amount < 0 { throw GameError("Cash-out cannot be negative") }
        cashOuts[player] = amount
        touch()
    }

    mutating func finalize(at: String = Timestamp.now()) throws {
        try requireStatus([.cashOut], "finalize")
        let totals = Ledger.totals(self)
        guard totals.playersCashedOut == players.count else {
            throw GameError("Every player needs a cash-out amount before settling")
        }
        guard totals.discrepancy == 0 else {
            throw GameError("Cash-outs must add up to the chips in play before settling")
        }
        status = .settled
        settledAt = at
        touch(at)
    }

    mutating func reopen() throws {
        try requireStatus([.cashOut, .settled], "reopen")
        status = status == .settled ? .cashOut : .active
        settledAt = nil
        payoffs = [:]
        touch()
    }

    mutating func markPayoff(_ key: String, paid: Bool, at: String = Timestamp.now()) throws {
        try requireStatus([.settled], "mark payoffs")
        guard settlement.contains(where: { $0.key == key }) else {
            throw GameError("That transfer is not part of this settlement")
        }
        payoffs[key] = paid ? at : nil
        touch(at)
    }

    /// Transfers that settle a finished game; empty until every cash-out is in and balanced.
    var settlement: [Transfer] {
        let summaries = Ledger.summaries(self)
        guard Ledger.totals(self, summaries).isBalanced else { return [] }
        return (try? Settlement.settle(summaries.map { Balance(id: $0.player.id, amount: $0.net ?? 0) })) ?? []
    }

    // MARK: helpers

    private func nextFreeCharacter() -> String {
        let taken = Set(players.map(\.character))
        return Characters.all.first { !taken.contains($0) } ?? Characters.all[players.count % Characters.all.count]
    }

    private mutating func touch(_ at: String = Timestamp.now()) { updatedAt = at }

    private func requireStatus(_ allowed: [GameStatus], _ action: String) throws {
        guard allowed.contains(status) else { throw GameError("Cannot \(action) while the game is \(status.rawValue)") }
    }

    private static func requirePositive(_ amount: Cents, _ label: String) throws {
        guard amount > 0 else { throw GameError("\(label) must be greater than zero") }
    }

    private static func clean(_ text: String, _ label: String, _ limit: Int) throws -> String {
        let collapsed = text.split(whereSeparator: \.isWhitespace).joined(separator: " ")
        guard !collapsed.isEmpty else { throw GameError("\(label) is required") }
        guard collapsed.count <= limit else { throw GameError("\(label) must be \(limit) characters or fewer") }
        return collapsed
    }

    private static func cleanTitle(_ title: String?) throws -> String? {
        guard let title else { return nil }
        let collapsed = title.split(whereSeparator: \.isWhitespace).joined(separator: " ")
        guard collapsed.count <= Limits.title else { throw GameError("Titles must be \(Limits.title) characters or fewer") }
        return collapsed.isEmpty ? nil : collapsed
    }

    private static func cleanNote(_ note: String?) throws -> String? {
        let trimmed = note?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if trimmed.isEmpty { return nil }
        guard trimmed.count <= Limits.note else { throw GameError("Notes must be \(Limits.note) characters or fewer") }
        return trimmed
    }
}
