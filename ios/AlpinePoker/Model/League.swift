import Foundation

struct Standing: Identifiable, Equatable {
    var name: String
    var title: String?
    var character: String
    var nights: Int
    var net: Cents
    var bestNight: Cents
    var worstNight: Cents
    var lastPlayed: String

    var id: String { name.lowercased() }
}

struct LeagueTotals: Equatable {
    var nightsSettled: Int
    /// Money that crossed the tables across every settled night.
    var volume: Cents
    var biggestWin: (name: String, amount: Cents)?

    static func == (a: LeagueTotals, b: LeagueTotals) -> Bool {
        a.nightsSettled == b.nightsSettled && a.volume == b.volume
            && a.biggestWin?.name == b.biggestWin?.name && a.biggestWin?.amount == b.biggestWin?.amount
    }
}

/// A league regular, offered as a one-tap seat.
struct LeagueMember: Identifiable {
    var name: String
    var title: String?
    var character: String
    var id: String { name }

    static let regulars: [LeagueMember] = [
        LeagueMember(name: "Raj", title: "Big daddy", character: "c3"),
        LeagueMember(name: "Porni", title: "Shaky Hands", character: "c6"),
        LeagueMember(name: "KG", title: "F*** it!!", character: "c1"),
        LeagueMember(name: "Anni", title: "Stats king", character: "c2"),
        LeagueMember(name: "Sushanth", title: "Sushi", character: "c8"),
        LeagueMember(name: "Vishnu", character: "c5"),
        LeagueMember(name: "Ganesh", title: "Quints", character: "c4"),
        LeagueMember(name: "Sanjay", title: "Pocket Kings", character: "c7"),
    ]

    func isSeated(in game: Game) -> Bool {
        game.players.contains { $0.name.trimmingCharacters(in: .whitespaces).lowercased() == name.lowercased() }
    }
}

enum League {
    /// All-time standings across settled games, matched by player name (any case).
    static func standings(_ games: [Game]) -> [Standing] {
        let settled = games.filter { $0.status == .settled }.sorted { $0.updatedAt < $1.updatedAt }
        var table: [String: Standing] = [:]
        for game in settled {
            for summary in Ledger.summaries(game) {
                let net = summary.net ?? 0
                let key = summary.player.name.trimmingCharacters(in: .whitespaces).lowercased()
                let previous = table[key]
                table[key] = Standing(
                    name: summary.player.name,
                    title: summary.player.title ?? previous?.title,
                    character: summary.player.character,
                    nights: (previous?.nights ?? 0) + 1,
                    net: (previous?.net ?? 0) + net,
                    bestNight: max(previous?.bestNight ?? net, net),
                    worstNight: min(previous?.worstNight ?? net, net),
                    lastPlayed: game.settledAt ?? game.updatedAt
                )
            }
        }
        return table.values.sorted {
            if $0.net != $1.net { return $0.net > $1.net }
            if $0.nights != $1.nights { return $0.nights > $1.nights }
            return $0.name < $1.name
        }
    }

    static func totals(_ games: [Game]) -> LeagueTotals {
        let settled = games.filter { $0.status == .settled }
        let volume = settled.reduce(0) { sum, game in sum + Ledger.summaries(game).reduce(0) { $0 + $1.paidIn } }
        let best = standings(games).max { $0.bestNight < $1.bestNight }
        return LeagueTotals(
            nightsSettled: settled.count, volume: volume,
            biggestWin: best.flatMap { $0.bestNight > 0 ? ($0.name, $0.bestNight) : nil }
        )
    }

    /// Plain-text summary for pasting into a group chat.
    static func summaryText(_ game: Game) -> String {
        let summaries = Ledger.summaries(game)
        let totals = Ledger.totals(game, summaries)
        let money = { (cents: Cents, signed: Bool) in Money.format(cents, game.currency, signed: signed, compact: true) }
        var lines = ["\(game.name) — settlement",
                     "In play: \(money(totals.inPlay, false)) across \(game.players.count) players", "", "Results"]
        for s in summaries {
            let loans = s.lent != 0 || s.borrowed != 0 ? " (lent \(money(s.lent, false)), borrowed \(money(s.borrowed, false)))" : ""
            lines.append("• \(s.player.name): in \(money(s.paidIn, false)), out \(money(s.cashOut ?? 0, false)), net \(money(s.net ?? 0, true))\(loans)")
        }
        let transfers = game.settlement
        lines += ["", transfers.isEmpty ? "Nobody owes anything." : "Who pays whom"]
        for t in transfers {
            let paid = game.payoffs[t.key] != nil ? " ✓ paid" : ""
            lines.append("• \(game.name(of: t.from)) → \(game.name(of: t.to)): \(money(t.amount, false))\(paid)")
        }
        return lines.joined(separator: "\n")
    }
}
