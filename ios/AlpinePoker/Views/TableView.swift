import SwiftUI

/// Step 2 of 4: the night in progress. Totals, a card per seat, and the ledger.
struct TableView: View {
    let store: PokerStore
    let game: Game
    @State private var sheet: TableSheet?
    @State private var editing: Player?
    @State private var removing: Transaction?
    @State private var confirmingCashOut = false

    var body: some View {
        let summaries = Ledger.summaries(game)
        let totals = Ledger.totals(game, summaries)
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                totalsPanel(totals, summaries)
                ForEach(summaries) { seatCard($0) }
                ledger
            }
            .padding(16)
        }
        .navigationTitle(game.name)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { LeagueButton(store: store) }
        .sheet(item: $sheet) { sheet in
            switch sheet {
            case let .rebuy(player): RebuySheet(store: store, game: game, playerID: player)
            case let .loan(borrower): LoanSheet(store: store, game: game, borrowerID: borrower)
            case let .repay(borrower): RepaySheet(store: store, game: game, borrowerID: borrower)
            case .lateSeat: LateSeatSheet(store: store, game: game)
            }
        }
        .sheet(item: $editing) { PlayerEditor(store: store, game: game, player: $0) }
        .confirmationDialog("Remove this entry?", isPresented: Binding(get: { removing != nil }, set: { if !$0 { removing = nil } }),
                            titleVisibility: .visible) {
            Button("Remove", role: .destructive) {
                if let t = removing { store.update({ try $0.removeTransaction(t.id) }, done: "Transaction removed") }
            }
        }
        .confirmationDialog("Start counting chips?", isPresented: $confirmingCashOut, titleVisibility: .visible) {
            Button("Start counting") { store.update { try $0.beginCashOut() } }
        } message: {
            Text("You can come back to the table from the count if someone plays on.")
        }
    }

    private func totalsPanel(_ totals: GameTotals, _ summaries: [PlayerSummary]) -> some View {
        FeltPanel {
            HStack {
                Stat(label: "In play", value: Money.format(totals.inPlay, game.currency, compact: true), tint: Palette.gold)
                Stat(label: "Loans out", value: Money.format(totals.loansOutstanding, game.currency, compact: true))
            }
            HStack {
                Stat(label: "Rebuys", value: "\(summaries.reduce(0) { $0 + $1.rebuyCount })")
                Stat(label: "Seated", value: "player".plural(game.players.count))
            }
            Grid(horizontalSpacing: 8, verticalSpacing: 8) {
                GridRow {
                    Button("Rebuy") { sheet = .rebuy(game.players.first?.id ?? "") }
                    Button("Loan") { sheet = .loan(game.players.first?.id ?? "") }
                }
                GridRow {
                    Button("Pay off") { sheet = .repay(game.players.first?.id ?? "") }
                        .disabled(totals.loansOutstanding == 0)
                    Button("Late seat") { sheet = .lateSeat }
                        .disabled(game.players.count >= Game.maxPlayers)
                }
            }
            .buttonStyle(PrimaryButtonStyle(prominent: false))
            Button("Cash out") { confirmingCashOut = true }
                .buttonStyle(PrimaryButtonStyle())
        }
    }

    private func seatCard(_ s: PlayerSummary) -> some View {
        PaperCard {
            HStack {
                Button { editing = s.player } label: { PlayerLabel(player: s.player, size: 40) }
                    .buttonStyle(.plain)
                    .accessibilityHint("Edit name, title and character")
                Spacer()
                Text("seat \(s.player.seat)").font(.caption).foregroundStyle(Palette.ink3)
            }
            HStack {
                figure("Paid in", MoneyText(cents: s.paidIn, currency: game.currency))
                figure("Chips", MoneyText(cents: s.chipsReceived, currency: game.currency, tone: .gold))
            }
            let owesPlayers = s.borrowed - s.owesBank
            if s.rebuyCount > 0 || s.lent > 0 || owesPlayers > 0 || s.owesBank > 0 {
                FlowLayout(spacing: 6) {
                    if s.rebuyCount > 0 { Badge(text: "\(s.rebuyCount)× rebuy") }
                    if s.lent > 0 { Badge(text: "Lent \(Money.format(s.lent, game.currency, compact: true))", tone: .win) }
                    if owesPlayers > 0 { Badge(text: "Owes \(Money.format(owesPlayers, game.currency, compact: true))", tone: .loss) }
                    if s.owesBank > 0 { Badge(text: "Owes bank \(Money.format(s.owesBank, game.currency, compact: true))", tone: .loss) }
                }
            }
            HStack(spacing: 8) {
                Button("Rebuy") { sheet = .rebuy(s.player.id) }.buttonStyle(SmallButtonStyle(filled: true))
                Button("Borrow") { sheet = .loan(s.player.id) }.buttonStyle(SmallButtonStyle())
                if s.borrowed > 0 {
                    Button("Pay off \(Money.format(s.borrowed, game.currency, compact: true))") { sheet = .repay(s.player.id) }
                        .buttonStyle(SmallButtonStyle())
                }
            }
        }
        .accessibilityElement(children: .contain)
    }

    private func figure(_ label: String, _ value: MoneyText) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Eyebrow(text: label, color: Palette.ink3)
            value.font(.title3.weight(.semibold))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var ledger: some View {
        let protected = Ledger.openingBuyInIDs(game)
        return FeltPanel {
            HStack {
                Text("Ledger").font(.display(20)).foregroundStyle(Palette.cream)
                Spacer()
                Text(game.transactions.count == 1 ? "1 entry" : "\(game.transactions.count) entries")
                    .font(.caption).foregroundStyle(Palette.cream.opacity(0.6))
            }
            ForEach(game.transactions.reversed()) { t in
                LedgerRow(game: game, transaction: t)
                    .contextMenu {
                        if !protected.contains(t.id) {
                            Button("Remove entry", systemImage: "trash", role: .destructive) { removing = t }
                        }
                    }
            }
            Text("Press and hold an entry to remove it. Opening buy-ins stay.")
                .font(.caption2).foregroundStyle(Palette.cream.opacity(0.5))
        }
    }
}

enum TableSheet: Identifiable {
    case rebuy(PlayerID)
    case loan(PlayerID)
    case repay(PlayerID)
    case lateSeat

    var id: String {
        switch self {
        case let .rebuy(p): "rebuy-\(p)"
        case let .loan(p): "loan-\(p)"
        case let .repay(p): "repay-\(p)"
        case .lateSeat: "late-seat"
        }
    }
}

struct LedgerRow: View {
    let game: Game
    let transaction: Transaction

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Text(glyph)
                .font(.headline)
                .frame(width: 28, height: 28)
                .foregroundStyle(Palette.ink)
                .background(Circle().fill(tint))
            VStack(alignment: .leading, spacing: 2) {
                Text(describe).font(.subheadline).foregroundStyle(Palette.cream)
                Text(meta).font(.caption).foregroundStyle(Palette.cream.opacity(0.55))
            }
            Spacer(minLength: 4)
            MoneyText(cents: transaction.amount, currency: game.currency,
                      tone: transaction.kind == .loan || transaction.kind == .repayment ? .gold : .plain, onPaper: false)
                .font(.subheadline.weight(.semibold))
        }
        .accessibilityElement(children: .combine)
    }

    private var glyph: String {
        switch transaction.kind {
        case .buyIn: "♠"
        case .rebuy: "+"
        case .loan: "⇄"
        case .repayment: "↩"
        }
    }

    private var tint: Color {
        switch transaction.kind {
        case .buyIn: Palette.paper2
        case .rebuy: Palette.gold
        case .loan: Palette.chip("c2").opacity(0.8)
        case .repayment: Palette.win
        }
    }

    private var describe: AttributedString {
        let t = transaction
        func bold(_ id: PlayerID?) -> AttributedString {
            var text = AttributedString(game.name(of: id ?? ""))
            text.font = .subheadline.weight(.semibold)
            return text
        }
        switch t.kind {
        case .buyIn: return bold(t.playerId) + AttributedString(" bought in")
        case .rebuy: return bold(t.playerId) + AttributedString(" rebought")
        case .loan where t.isBankLoan: return bold(t.borrowerId) + AttributedString(" borrowed from the bank")
        case .loan:
            return bold(t.lenderId) + AttributedString(" lent ") + bold(t.borrowerId)
                + AttributedString(t.source == .bank ? " · paid the bank" : " · handed over chips")
        case .repayment:
            return bold(t.borrowerId) + AttributedString(" repaid ") + bold(t.lenderId)
                + AttributedString(t.method == .cash ? " · in cash" : " · in chips")
        }
    }

    private var meta: String {
        let time = Timestamp.date(transaction.at)?.formatted(date: .omitted, time: .shortened) ?? ""
        return [time, transaction.note].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ")
    }
}
