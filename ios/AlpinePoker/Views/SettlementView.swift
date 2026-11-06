import SwiftUI
import UIKit

/// Step 4 of 4: results, and the fewest transfers that square everyone up.
struct SettlementView: View {
    let store: PokerStore
    let game: Game
    @State private var exportURL: URL?

    var body: some View {
        let summaries = Ledger.summaries(game).sorted { ($0.net ?? 0) > ($1.net ?? 0) }
        let totals = Ledger.totals(game, summaries)
        let transfers = game.settlement
        let paid = transfers.filter { game.payoffs[$0.key] != nil }.count
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                hero(summaries, totals)
                results(summaries, totals)
                transfersPanel(transfers, paid: paid)
                actions
            }
            .padding(16)
        }
        .navigationTitle(game.name)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { LeagueButton(store: store) }
        .task(id: game.updatedAt) { exportURL = writeExport() }
    }

    private func hero(_ summaries: [PlayerSummary], _ totals: GameTotals) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Eyebrow(text: "Settled " + (game.settledAt.flatMap(Timestamp.date)?.formatted(date: .abbreviated, time: .shortened) ?? ""))
            Group {
                if summaries.allSatisfy({ ($0.net ?? 0) == 0 }) {
                    Text("Everyone walks away \(Text("even").italic().foregroundStyle(Palette.gold)).")
                } else if let leader = summaries.first {
                    Text("\(Text(leader.player.name).italic().foregroundStyle(Palette.gold)) takes the night.")
                }
            }
            .font(.display(32))
            .foregroundStyle(Palette.cream)
            Text("\(Money.format(totals.inPlay, game.currency, compact: true)) changed hands across \(game.players.count) players and \(game.transactions.count) ledger entries.")
                .font(.subheadline).foregroundStyle(Palette.cream.opacity(0.75))
        }
    }

    private func results(_ summaries: [PlayerSummary], _ totals: GameTotals) -> some View {
        PaperCard {
            ForEach(summaries) { s in
                HStack {
                    PlayerLabel(player: s.player, size: 34)
                    Spacer()
                    VStack(alignment: .trailing, spacing: 2) {
                        MoneyText(cents: s.net ?? 0, currency: game.currency, tone: .sign, signed: true).font(.headline)
                        Text(line(s)).font(.caption2).foregroundStyle(Palette.ink2).monospacedDigit()
                    }
                }
                .accessibilityElement(children: .combine)
                if s.id != summaries.last?.id { Divider() }
            }
            Divider()
            HStack {
                Text("Table").font(.subheadline.weight(.semibold)).foregroundStyle(Palette.ink)
                Spacer()
                Text("in \(Money.format(totals.inPlay, game.currency, compact: true)) · out \(Money.format(totals.cashedOut, game.currency, compact: true))")
                    .font(.caption).monospacedDigit().foregroundStyle(Palette.ink2)
            }
        }
    }

    private func line(_ s: PlayerSummary) -> String {
        var parts = ["in \(Money.format(s.paidIn, game.currency, compact: true))",
                     "out \(Money.format(s.cashOut ?? 0, game.currency, compact: true))"]
        let loans = s.lent - s.borrowed
        if loans != 0 { parts.append("loans \(Money.format(loans, game.currency, signed: true, compact: true))") }
        return parts.joined(separator: " · ")
    }

    private func transfersPanel(_ transfers: [Transfer], paid: Int) -> some View {
        FeltPanel {
            HStack {
                Text("Who pays whom").font(.display(20)).foregroundStyle(Palette.cream)
                Spacer()
                if !transfers.isEmpty {
                    Badge(text: paid == transfers.count ? "All squared up" : "\(paid) of \(transfers.count) paid",
                          tone: paid == transfers.count ? .win : .gold)
                }
            }
            if transfers.isEmpty {
                Text("Nobody owes anything. Rare night.").foregroundStyle(Palette.cream.opacity(0.75))
            }
            ForEach(transfers, id: \.key) { transfer in
                transferRow(transfer)
            }
            Text("\(transfers.count) transfer\(transfers.count == 1 ? " is" : "s is") the fewest possible for this table. Loans are already netted in. Tick each one off as the money changes hands.")
                .font(.caption).foregroundStyle(Palette.cream.opacity(0.6))
        }
    }

    private func transferRow(_ transfer: Transfer) -> some View {
        let paidAt = game.payoffs[transfer.key]
        let from = game.player(transfer.from)
        let to = game.player(transfer.to)
        return Button {
            store.update { try $0.markPayoff(transfer.key, paid: paidAt == nil) }
            Haptic.tap()
        } label: {
            HStack(spacing: 8) {
                if let from { ChipAvatar(character: from.character, size: 30) }
                Image(systemName: "arrow.right").font(.caption.weight(.bold)).foregroundStyle(Palette.gold)
                if let to { ChipAvatar(character: to.character, size: 30) }
                VStack(alignment: .leading, spacing: 1) {
                    Text("\(game.name(of: transfer.from)) pays \(game.name(of: transfer.to))")
                        .font(.subheadline.weight(.semibold)).foregroundStyle(Palette.cream)
                        .strikethrough(paidAt != nil, color: Palette.cream.opacity(0.6))
                    Text(paidAt.flatMap(Timestamp.date).map { "Paid \($0.formatted(date: .omitted, time: .shortened))" } ?? "Tap when paid")
                        .font(.caption).foregroundStyle(Palette.cream.opacity(0.6))
                }
                Spacer(minLength: 4)
                MoneyText(cents: transfer.amount, currency: game.currency, tone: .gold, onPaper: false).font(.headline)
                Image(systemName: paidAt != nil ? "checkmark.circle.fill" : "circle")
                    .font(.title2).foregroundStyle(paidAt != nil ? Palette.win : Palette.cream.opacity(0.5))
            }
            .padding(10)
            .background(RoundedRectangle(cornerRadius: 12).fill(Palette.felt800.opacity(paidAt != nil ? 0.5 : 1)))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(game.name(of: transfer.from)) pays \(game.name(of: transfer.to)) \(Money.format(transfer.amount, game.currency, compact: true))")
        .accessibilityValue(paidAt != nil ? "Paid" : "Not paid")
        .accessibilityHint("Marks it as \(paidAt != nil ? "not paid" : "paid")")
    }

    private var actions: some View {
        VStack(spacing: 10) {
            Button("Copy summary") {
                UIPasteboard.general.string = League.summaryText(game)
                store.toast = "Summary copied"
                Haptic.success()
            }
            .buttonStyle(PrimaryButtonStyle())
            HStack(spacing: 10) {
                ShareLink(item: League.summaryText(game)) { Text("Share") }
                    .buttonStyle(PrimaryButtonStyle(prominent: false))
                if let exportURL {
                    ShareLink(item: exportURL) { Text("Export JSON") }
                        .buttonStyle(PrimaryButtonStyle(prominent: false))
                }
            }
            HStack(spacing: 10) {
                Button("Reopen cash-out") { store.update { try $0.reopen() } }
                    .buttonStyle(PrimaryButtonStyle(prominent: false))
                Button("League home") { store.open(nil) }
                    .buttonStyle(PrimaryButtonStyle(prominent: false))
            }
        }
    }

    /// The game as a .json file the web app can import.
    private func writeExport() -> URL? {
        let slug = String(game.name.lowercased().map { $0.isLetter || $0.isNumber ? $0 : "-" })
            .split(separator: "-").joined(separator: "-")
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("\(slug.isEmpty ? "poker-night" : slug).json")
        do {
            try store.exportData(game).write(to: url, options: .atomic)
            return url
        } catch {
            return nil
        }
    }
}
