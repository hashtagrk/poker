import SwiftUI

/// Step 3 of 4: count every stack. The counts must add up to the chips in play.
struct CashOutView: View {
    let store: PokerStore
    let game: Game
    @State private var drafts: [PlayerID: String]
    @State private var absorber: PlayerID

    init(store: PokerStore, game: Game) {
        self.store = store
        self.game = game
        _drafts = State(initialValue: game.cashOuts.mapValues(Money.editable))
        _absorber = State(initialValue: game.players.first?.id ?? "")
    }

    var body: some View {
        let summaries = Ledger.summaries(game)
        let totals = Ledger.totals(game, summaries)
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                VStack(alignment: .leading, spacing: 6) {
                    Eyebrow(text: "Step 3 of 4")
                    Text("Count the chips").font(.display(32)).foregroundStyle(Palette.cream)
                    Text("Enter what each player is holding. The total has to match the chips in play before you can settle.")
                        .font(.subheadline).foregroundStyle(Palette.cream.opacity(0.75))
                }
                PaperCard {
                    ForEach(summaries) { s in
                        countRow(s)
                        if s.id != summaries.last?.id { Divider() }
                    }
                }
                balance(totals)
            }
            .padding(16)
        }
        .scrollDismissesKeyboard(.interactively)
        .navigationTitle(game.name)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { LeagueButton(store: store) }
    }

    private func countRow(_ s: PlayerSummary) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                PlayerLabel(player: s.player, size: 34)
                Spacer()
                if let net = s.net {
                    MoneyText(cents: net, currency: game.currency, tone: .sign, signed: true).font(.headline)
                } else {
                    Text("—").foregroundStyle(Palette.ink3)
                }
            }
            HStack(alignment: .center, spacing: 8) {
                Text(facts(s)).font(.caption).foregroundStyle(Palette.ink2).frame(maxWidth: .infinity, alignment: .leading)
                MoneyField(currency: game.currency,
                           text: Binding(get: { drafts[s.player.id] ?? "" }, set: { change(s.player.id, $0) }),
                           invalid: isInvalid(s.player.id), label: "\(s.player.name)'s chips")
                    .frame(width: 130)
            }
        }
    }

    private func facts(_ s: PlayerSummary) -> String {
        var parts = ["In \(Money.format(s.paidIn, game.currency, compact: true))"]
        if s.lent > 0 { parts.append("lent \(Money.format(s.lent, game.currency, compact: true))") }
        if s.borrowed > 0 {
            var owes = "owes \(Money.format(s.borrowed, game.currency, compact: true))"
            if s.owesBank > 0 { owes += " (bank \(Money.format(s.owesBank, game.currency, compact: true)))" }
            parts.append(owes)
        }
        return parts.joined(separator: " · ")
    }

    private func isInvalid(_ id: PlayerID) -> Bool {
        guard let text = drafts[id]?.trimmingCharacters(in: .whitespaces), !text.isEmpty else { return false }
        return Money.parse(text) == nil
    }

    private func change(_ id: PlayerID, _ text: String) {
        drafts[id] = text
        let trimmed = text.trimmingCharacters(in: .whitespaces)
        if trimmed.isEmpty {
            store.update { try $0.setCashOut(id, nil) }
        } else if let cents = Money.parse(trimmed) {
            store.update { try $0.setCashOut(id, cents) }
        }
    }

    private func balance(_ totals: GameTotals) -> some View {
        let allCounted = totals.playersCashedOut == game.players.count
        let absorberCanTake = (game.cashOuts[absorber] ?? 0) - totals.discrepancy >= 0
        return FeltPanel {
            row("Chips in play", Money.format(totals.inPlay, game.currency, compact: true), tint: Palette.gold)
            row("Counted (\(totals.playersCashedOut) of \(game.players.count))", Money.format(totals.cashedOut, game.currency, compact: true))
            Divider().overlay(Palette.gold.opacity(0.3))
            row("Difference", Money.format(totals.discrepancy, game.currency, signed: true, compact: true),
                tint: totals.discrepancy == 0 ? Palette.win : Palette.loss, bold: true)

            if totals.isBalanced {
                Label("Every chip is accounted for.", systemImage: "checkmark.seal.fill").foregroundStyle(Palette.win)
            } else if allCounted {
                Text((totals.discrepancy > 0 ? "More chips counted than were issued." : "Some chips are missing.")
                     + " Recount, or assign the difference to one player.")
                    .font(.subheadline).foregroundStyle(Palette.loss)
                HStack {
                    Picker("Assign difference to", selection: $absorber) {
                        ForEach(game.players) { Text($0.name).tag($0.id) }
                    }
                    .tint(Palette.cream)
                    Spacer()
                    Button("Apply") {
                        guard let current = game.cashOuts[absorber] else { return }
                        let adjusted = current - totals.discrepancy
                        guard adjusted >= 0 else { return }
                        store.update { try $0.setCashOut(absorber, adjusted) }
                        drafts[absorber] = Money.editable(adjusted)
                    }
                    .buttonStyle(SmallButtonStyle(filled: true))
                    .disabled(!absorberCanTake)
                }
            } else {
                Text("\("player".plural(game.players.count - totals.playersCashedOut)) still to count.")
                    .font(.subheadline).foregroundStyle(Palette.cream.opacity(0.75))
            }

            Button("Settle up") {
                hideKeyboard()
                if store.update({ try $0.finalize() }, done: "Game settled") { Haptic.success() }
            }
            .buttonStyle(PrimaryButtonStyle())
            .disabled(!totals.isBalanced)
            Button("Back to the table") { store.update { try $0.reopen() } }
                .buttonStyle(PrimaryButtonStyle(prominent: false))
        }
    }

    private func row(_ label: String, _ value: String, tint: Color = Palette.cream, bold: Bool = false) -> some View {
        HStack {
            Text(label).foregroundStyle(Palette.cream.opacity(bold ? 1 : 0.7))
            Spacer()
            Text(value).monospacedDigit().foregroundStyle(tint).fontWeight(bold ? .bold : .semibold)
        }
        .accessibilityElement(children: .combine)
    }
}
