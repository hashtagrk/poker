import SwiftUI
import UniformTypeIdentifiers

/// League home: start a night, reopen a session, and the all-time standings.
struct HomeView: View {
    let store: PokerStore
    @State private var name = ""
    @State private var currency = Money.defaultCurrency
    @State private var buyIn = Money.editable(Money.defaultBuyIn)
    @State private var buyInInvalid = false
    @State private var deleting: Game?
    @State private var importing = false

    var body: some View {
        let games = store.gamesNewestFirst
        let standings = League.standings(games)
        let totals = League.totals(games)
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                header(totals)
                newNight
                if !games.isEmpty { sessions(games) }
                if !standings.isEmpty { standingsCard(standings, currency: games.first?.currency ?? Money.defaultCurrency) }
            }
            .padding(16)
        }
        .scrollDismissesKeyboard(.interactively)
        .navigationTitle("")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { importing = true } label: { Label("Import", systemImage: "square.and.arrow.down") }
            }
        }
        .fileImporter(isPresented: $importing, allowedContentTypes: [.json]) { result in
            guard case let .success(url) = result else { return }
            let scoped = url.startAccessingSecurityScopedResource()
            defer { if scoped { url.stopAccessingSecurityScopedResource() } }
            if let data = try? Data(contentsOf: url) { store.importGame(data) }
        }
        .confirmationDialog("Delete \(deleting?.name ?? "")?", isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } }),
                            titleVisibility: .visible) {
            Button("Delete for good", role: .destructive) {
                if let game = deleting { store.delete(game.id) }
            }
        } message: {
            Text("The night and its ledger are removed from this phone.")
        }
    }

    private func header(_ totals: LeagueTotals) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Eyebrow(text: "Members only · up to eight seats")
            Text("Alpine \(Text("Poker").italic().foregroundStyle(Palette.gold)) League")
                .font(.display(38))
                .foregroundStyle(Palette.cream)
            Text("The league ledger. Log every buy-in, rebuy and loan as it happens, count the chips once, and settle each night with the fewest possible transfers.")
                .font(.subheadline)
                .foregroundStyle(Palette.cream.opacity(0.75))
            HStack {
                Stat(label: "Nights settled", value: "\(totals.nightsSettled)")
                Stat(label: "Across the tables", value: Money.format(totals.volume, Money.defaultCurrency, compact: true), tint: Palette.gold)
            }
            if let best = totals.biggestWin {
                Stat(label: "Biggest night", value: "\(best.name) · \(Money.format(best.amount, Money.defaultCurrency, signed: true, compact: true))")
            }
        }
    }

    private var newNight: some View {
        PaperCard {
            Text("Start a league night").font(.display(22)).foregroundStyle(Palette.ink)
            VStack(alignment: .leading, spacing: 4) {
                Text("Night name").font(.caption.weight(.semibold)).foregroundStyle(Palette.ink2)
                TextField("Night name", text: $name, prompt: Text("Friday at the lodge").foregroundStyle(Palette.ink3))
                    .foregroundStyle(Palette.ink)
                    .padding(.horizontal, 10)
                    .frame(minHeight: 40)
                    .background(RoundedRectangle(cornerRadius: 8).fill(Palette.paper))
                    .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(Palette.paper3))
            }
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Currency").font(.caption.weight(.semibold)).foregroundStyle(Palette.ink2)
                    TextField("Currency", text: $currency, prompt: Text("₹").foregroundStyle(Palette.ink3))
                        .foregroundStyle(Palette.ink)
                        .padding(.horizontal, 10)
                        .frame(width: 70, height: 40)
                        .background(RoundedRectangle(cornerRadius: 8).fill(Palette.paper))
                        .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(Palette.paper3))
                }
                VStack(alignment: .leading, spacing: 4) {
                    Text("Default buy-in").font(.caption.weight(.semibold)).foregroundStyle(Palette.ink2)
                    MoneyField(currency: currency.isEmpty ? Money.defaultCurrency : currency, text: $buyIn,
                               invalid: buyInInvalid, label: "Default buy-in")
                    Text(buyInInvalid ? "Enter a buy-in greater than zero" : "Each seat can override this.")
                        .font(.caption2).foregroundStyle(buyInInvalid ? Palette.lossInk : Palette.ink3)
                }
            }
            Button("Set up the table") {
                guard let cents = Money.parse(buyIn), cents > 0 else { buyInInvalid = true; return }
                buyInInvalid = false
                hideKeyboard()
                let title = name.trimmingCharacters(in: .whitespaces).isEmpty ? "League night" : name
                if store.createGame(name: title, currency: currency, defaultBuyIn: cents) { name = "" }
            }
            .buttonStyle(PrimaryButtonStyle())
        }
    }

    private func sessions(_ games: [Game]) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Eyebrow(text: "Sessions")
            ForEach(games) { game in
                Button { store.open(game.id) } label: { SessionRow(game: game) }
                    .buttonStyle(.plain)
                    .contextMenu {
                        Button("Delete", systemImage: "trash", role: .destructive) { deleting = game }
                    }
                    .accessibilityHint("Opens the night. Press and hold to delete.")
            }
        }
    }

    private func standingsCard(_ standings: [Standing], currency: String) -> some View {
        PaperCard {
            Text("Standings").font(.display(22)).foregroundStyle(Palette.ink)
            ForEach(Array(standings.enumerated()), id: \.element.id) { index, standing in
                HStack(spacing: 10) {
                    Text("\(index + 1)").font(.headline).monospacedDigit().foregroundStyle(index == 0 ? Palette.goldInk : Palette.ink3)
                        .frame(width: 22)
                    ChipAvatar(character: standing.character, size: 34)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(standing.name).font(.headline).foregroundStyle(Palette.ink)
                        Text("\("night".plural(standing.nights)) · best \(Money.format(standing.bestNight, currency, signed: true, compact: true)) · worst \(Money.format(standing.worstNight, currency, signed: true, compact: true))")
                            .font(.caption2).foregroundStyle(Palette.ink2).lineLimit(1).minimumScaleFactor(0.8)
                    }
                    Spacer(minLength: 4)
                    MoneyText(cents: standing.net, currency: currency, tone: .sign, signed: true).font(.headline)
                }
                .accessibilityElement(children: .combine)
                if index < standings.count - 1 { Divider() }
            }
        }
    }
}

private struct SessionRow: View {
    let game: Game

    var body: some View {
        let totals = Ledger.totals(game)
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 8) {
                Text(game.name).font(.display(19)).foregroundStyle(Palette.cream).lineLimit(1)
                HStack(spacing: -8) {
                    ForEach(game.players) { ChipAvatar(character: $0.character, size: 26) }
                }
                Text(details(totals)).font(.caption).foregroundStyle(Palette.cream.opacity(0.7))
            }
            Spacer()
            Text(game.status.label)
                .font(.caption.weight(.semibold))
                .padding(.horizontal, 8).padding(.vertical, 3)
                .foregroundStyle(game.status == .settled ? Palette.winInk : Palette.ink)
                .background(Capsule().fill(game.status == .settled ? Palette.win.opacity(0.85) : game.status == .active ? Palette.gold : Palette.paper2))
        }
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 14).fill(Palette.felt700))
        .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(Palette.gold.opacity(0.2)))
        .contentShape(RoundedRectangle(cornerRadius: 14))
    }

    private func details(_ totals: GameTotals) -> String {
        var parts = ["player".plural(game.players.count)]
        if totals.inPlay > 0 { parts.append("\(Money.format(totals.inPlay, game.currency, compact: true)) on the table") }
        if let date = Timestamp.date(game.updatedAt) { parts.append(date.formatted(date: .abbreviated, time: .shortened)) }
        return parts.joined(separator: " · ")
    }
}
