import Foundation

struct PlayerSummary: Identifiable, Equatable {
    var player: Player
    /// Own money put in through buy-ins and rebuys.
    var buyIns: Cents = 0
    var rebuyCount = 0
    /// Money this player is owed by others.
    var lent: Cents = 0
    /// Money this player owes others, including the bank.
    var borrowed: Cents = 0
    /// The part of `borrowed` owed to the bank for chips it issued on credit.
    var owesBank: Cents = 0
    /// Cash this player is on the hook for at the bank (buy-ins plus bank-funded loans given).
    var paidIn: Cents = 0
    /// Chip value received from the bank or from other stacks.
    var chipsReceived: Cents = 0
    var cashOut: Cents?

    var id: PlayerID { player.id }

    /// cash out − paid in + lent − borrowed. Nil until cashed out.
    var net: Cents? {
        cashOut.map { $0 - paidIn + lent - borrowed }
    }
}

struct GameTotals: Equatable {
    /// Chips in play: cash held by the bank plus chips it issued on credit.
    var inPlay: Cents
    /// Every unpaid loan, whether owed to a player or to the bank.
    var loansOutstanding: Cents
    /// Chips the bank issued on credit that have not been paid back.
    var bankCredit: Cents
    var cashedOut: Cents
    var playersCashedOut: Int
    /// cashedOut − inPlay. Zero when every chip is accounted for.
    var discrepancy: Cents
    var isBalanced: Bool
}

enum Ledger {
    static func summaries(_ game: Game) -> [PlayerSummary] {
        var table: [PlayerID: PlayerSummary] = [:]
        for player in game.players {
            table[player.id] = PlayerSummary(player: player, cashOut: game.cashOuts[player.id])
        }
        for transaction in game.transactions {
            apply(transaction, to: &table)
        }
        return game.players.sorted { $0.seat < $1.seat }.compactMap { table[$0.id] }
    }

    private static func apply(_ t: Transaction, to table: inout [PlayerID: PlayerSummary]) {
        switch t.kind {
        case .buyIn, .rebuy:
            guard let id = t.playerId, var s = table[id] else { return }
            s.buyIns += t.amount
            if t.kind == .rebuy { s.rebuyCount += 1 }
            s.paidIn += t.amount
            s.chipsReceived += t.amount
            table[id] = s

        case .loan where t.isBankLoan:
            // the bank issues chips on credit
            guard let id = t.borrowerId, var s = table[id] else { return }
            s.borrowed += t.amount
            s.owesBank += t.amount
            s.chipsReceived += t.amount
            table[id] = s

        case .repayment where t.isBankLoan:
            // cash back to the bank goes in the bank; chips back leave play
            guard let id = t.borrowerId, var s = table[id] else { return }
            let inChips = t.method == .chips
            s.borrowed -= t.amount
            s.owesBank -= t.amount
            if !inChips { s.paidIn += t.amount }
            if inChips { s.chipsReceived -= t.amount }
            table[id] = s

        case .loan:
            guard let lenderID = t.lenderId, let borrowerID = t.borrowerId,
                  var lender = table[lenderID], var borrower = table[borrowerID] else { return }
            let fromBank = t.source == .bank
            lender.lent += t.amount
            if fromBank { lender.paidIn += t.amount } else { lender.chipsReceived -= t.amount }
            borrower.borrowed += t.amount
            borrower.chipsReceived += t.amount
            table[lenderID] = lender
            table[borrowerID] = borrower

        case .repayment:
            guard let lenderID = t.lenderId, let borrowerID = t.borrowerId,
                  var lender = table[lenderID], var borrower = table[borrowerID] else { return }
            let inChips = t.method == .chips
            lender.lent -= t.amount
            borrower.borrowed -= t.amount
            if inChips {
                lender.chipsReceived += t.amount
                borrower.chipsReceived -= t.amount
            }
            table[lenderID] = lender
            table[borrowerID] = borrower
        }
    }

    static func totals(_ game: Game, _ summaries: [PlayerSummary]? = nil) -> GameTotals {
        let all = summaries ?? self.summaries(game)
        let bankCredit = all.reduce(0) { $0 + $1.owesBank }
        let inPlay = all.reduce(0) { $0 + $1.paidIn } + bankCredit
        let loans = all.reduce(0) { $0 + $1.borrowed }
        let counted = all.filter { $0.cashOut != nil }
        let cashedOut = counted.reduce(0) { $0 + ($1.cashOut ?? 0) }
        let discrepancy = cashedOut - inPlay
        return GameTotals(
            inPlay: inPlay, loansOutstanding: loans, bankCredit: bankCredit,
            cashedOut: cashedOut, playersCashedOut: counted.count, discrepancy: discrepancy,
            isBalanced: counted.count == all.count && discrepancy == 0
        )
    }

    static func debtKey(borrower: PlayerID, lender: PlayerID) -> String { "\(borrower)>\(lender)" }

    /// Outstanding balance per borrower→lender pair, after repayments.
    static func outstandingDebts(_ game: Game) -> [String: Cents] {
        var debts: [String: Cents] = [:]
        for t in game.transactions where t.kind == .loan || t.kind == .repayment {
            guard let borrower = t.borrowerId, let lender = t.lenderId else { continue }
            let key = debtKey(borrower: borrower, lender: lender)
            debts[key, default: 0] += t.kind == .loan ? t.amount : -t.amount
        }
        return debts
    }

    static func owed(_ game: Game, borrower: PlayerID, lender: PlayerID) -> Cents {
        outstandingDebts(game)[debtKey(borrower: borrower, lender: lender)] ?? 0
    }

    /// Ids of each player's first buy-in, which cannot be removed.
    static func openingBuyInIDs(_ game: Game) -> Set<String> {
        var seen = Set<PlayerID>()
        var ids = Set<String>()
        for t in game.transactions where t.isBuyIn {
            guard let player = t.playerId, !seen.contains(player) else { continue }
            seen.insert(player)
            ids.insert(t.id)
        }
        return ids
    }
}
