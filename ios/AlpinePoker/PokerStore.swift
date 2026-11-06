import Foundation
import Observation

/// Every game on this phone, the one open now, and the last thing that went wrong.
@MainActor
@Observable
final class PokerStore {
    private(set) var games: [String: Game]
    private(set) var activeGameID: String?
    /// A broken table rule, shown as an alert.
    var problem: String?
    /// A short confirmation ("Cards in the air"), shown as a toast.
    var toast: String?

    private let defaults: UserDefaults
    static let key = "alpine-poker.native.v1"
    /// Where the earlier web-view version of this app kept its games (Capacitor Preferences).
    static let webViewKey = "CapacitorStorage.poker-ledger/v1"

    private struct Saved: Codable {
        var games: [String: Game]
        var activeGameId: String?
    }

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        if let data = defaults.data(forKey: Self.key), let saved = try? JSONDecoder().decode(Saved.self, from: data) {
            games = saved.games
            activeGameID = saved.activeGameId
        } else if let carried = Self.carryOverFromWebView(defaults) {
            games = carried.games
            activeGameID = carried.activeGameId
            save()
        } else {
            games = [:]
            activeGameID = nil
        }
        if let id = activeGameID, games[id] == nil { activeGameID = nil }
    }

    var activeGame: Game? { activeGameID.flatMap { games[$0] } }

    var gamesNewestFirst: [Game] { games.values.sorted { $0.updatedAt > $1.updatedAt } }

    func open(_ id: String?) {
        activeGameID = id
        save()
    }

    @discardableResult
    func createGame(name: String, currency: String, defaultBuyIn: Cents) -> Bool {
        do {
            let game = try Game.create(name: name, currency: currency, defaultBuyIn: defaultBuyIn)
            games[game.id] = game
            activeGameID = game.id
            save()
            return true
        } catch {
            problem = error.localizedDescription
            return false
        }
    }

    func delete(_ id: String) {
        games[id] = nil
        if activeGameID == id { activeGameID = nil }
        save()
    }

    /// Applies one rule-checked change to the open game. A broken rule leaves the game as it
    /// was and shows why.
    @discardableResult
    func update(_ change: (inout Game) throws -> Void, done: String? = nil) -> Bool {
        guard let id = activeGameID, var game = games[id] else {
            problem = "That game no longer exists"
            return false
        }
        do {
            try change(&game)
            games[id] = game
            save()
            if let done { toast = done }
            return true
        } catch {
            problem = error.localizedDescription
            return false
        }
    }

    // MARK: files

    /// A game as the web app's JSON, so it can be opened there too.
    func exportData(_ game: Game) -> Data {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
        return (try? encoder.encode(game)) ?? Data()
    }

    @discardableResult
    func importGame(_ data: Data) -> Bool {
        guard let game = try? JSONDecoder().decode(Game.self, from: data), Self.isValid(game) else {
            problem = "That file is not a game exported from Alpine Poker"
            return false
        }
        games[game.id] = game
        activeGameID = game.id
        save()
        toast = "Imported “\(game.name)”"
        return true
    }

    // MARK: storage

    private func save() {
        if let data = try? JSONEncoder().encode(Saved(games: games, activeGameId: activeGameID)) {
            defaults.set(data, forKey: Self.key)
        }
    }

    /// The web-view app saved `{"state": {"games": …, "activeGameId": …}, "version": 1}` as
    /// a JSON string. Games that fail to decode are skipped rather than losing the rest.
    private static func carryOverFromWebView(_ defaults: UserDefaults) -> Saved? {
        guard let text = defaults.string(forKey: webViewKey),
              let root = try? JSONSerialization.jsonObject(with: Data(text.utf8)) as? [String: Any],
              let state = root["state"] as? [String: Any],
              let raw = state["games"] as? [String: Any] else { return nil }
        var games: [String: Game] = [:]
        for (id, value) in raw {
            guard let data = try? JSONSerialization.data(withJSONObject: value),
                  let game = try? JSONDecoder().decode(Game.self, from: data),
                  game.id == id, isValid(game) else { continue }
            games[id] = game
        }
        guard !games.isEmpty else { return nil }
        let active = state["activeGameId"] as? String
        return Saved(games: games, activeGameId: active.flatMap { games[$0] != nil ? $0 : nil })
    }

    /// Every transaction points at a player in the game, as the web app's schema requires.
    static func isValid(_ game: Game) -> Bool {
        let ids = Set(game.players.map(\.id))
        guard game.players.count <= Game.maxPlayers, !game.name.isEmpty, (1...3).contains(game.currency.count) else { return false }
        return game.transactions.allSatisfy { t in
            t.amount >= 0 && t.participants.allSatisfy(ids.contains)
                && !(t.kind == .loan && t.isBankLoan && t.source != .bank)
        }
    }
}
