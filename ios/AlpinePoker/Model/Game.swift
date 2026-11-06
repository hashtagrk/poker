import Foundation

/// The JSON shape matches the web app's exactly, so games move between the two (export
/// from one, import in the other) and the earlier app's saved games carry over.

typealias PlayerID = String

/// Stands in for a player id when the bank itself is the lender.
let bankID = "bank"

enum GameStatus: String, Codable {
    case setup
    case active
    case cashOut = "cash-out"
    case settled

    var label: String {
        switch self {
        case .setup: "Seating"
        case .active: "In progress"
        case .cashOut: "Counting chips"
        case .settled: "Settled"
        }
    }
}

struct Player: Codable, Identifiable, Equatable, Hashable {
    var id: PlayerID
    var name: String
    /// Optional table nickname, e.g. "The Shark".
    var title: String?
    /// One of the eight characters, "c1"..."c8".
    var character: String
    var seat: Int
}

struct Transaction: Codable, Identifiable, Equatable {
    enum Kind: String, Codable {
        case buyIn = "buy-in"
        case rebuy
        case loan
        case repayment
    }

    /// How a player lender covers a loan: paying the bank for new chips, or from their stack.
    enum LoanSource: String, Codable { case bank, stack }
    /// How a loan is paid back during the game.
    enum Method: String, Codable { case cash, chips }

    var id: String
    /// ISO 8601 timestamp.
    var at: String
    var note: String?
    var kind: Kind
    /// Buy-ins and rebuys.
    var playerId: PlayerID?
    /// Loans and repayments; `bankID` when the bank lent the chips.
    var lenderId: PlayerID?
    var borrowerId: PlayerID?
    var amount: Cents
    var source: LoanSource?
    var method: Method?

    var isBuyIn: Bool { kind == .buyIn || kind == .rebuy }
    var isBankLoan: Bool { lenderId == bankID }

    /// Every player the transaction touches. The bank is not a player.
    var participants: [PlayerID] {
        if isBuyIn { return [playerId].compactMap { $0 } }
        return [lenderId, borrowerId].compactMap { $0 }.filter { $0 != bankID }
    }
}

struct Game: Codable, Identifiable, Equatable {
    static let maxPlayers = 8
    static let minPlayers = 2

    var id: String
    var name: String
    var createdAt: String
    var updatedAt: String
    var settledAt: String?
    var currency: String
    var defaultBuyIn: Cents
    var status: GameStatus
    var players: [Player]
    var transactions: [Transaction]
    /// Final chip value per player, once entered during cash-out.
    var cashOuts: [PlayerID: Cents]
    /// Settlement transfers that have been paid: transfer key → ISO timestamp.
    var payoffs: [String: String]

    func player(_ id: PlayerID) -> Player? { players.first { $0.id == id } }

    func name(of id: PlayerID) -> String {
        if id == bankID { return "the bank" }
        return player(id)?.name ?? "Unknown player"
    }

    init(id: String, name: String, createdAt: String, updatedAt: String, settledAt: String? = nil,
         currency: String, defaultBuyIn: Cents, status: GameStatus, players: [Player],
         transactions: [Transaction], cashOuts: [PlayerID: Cents], payoffs: [String: String]) {
        self.id = id
        self.name = name
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.settledAt = settledAt
        self.currency = currency
        self.defaultBuyIn = defaultBuyIn
        self.status = status
        self.players = players
        self.transactions = transactions
        self.cashOuts = cashOuts
        self.payoffs = payoffs
    }

    // `payoffs` came later in the web app; older files leave it out
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        name = try c.decode(String.self, forKey: .name)
        createdAt = try c.decode(String.self, forKey: .createdAt)
        updatedAt = try c.decode(String.self, forKey: .updatedAt)
        settledAt = try c.decodeIfPresent(String.self, forKey: .settledAt)
        currency = try c.decode(String.self, forKey: .currency)
        defaultBuyIn = try c.decode(Cents.self, forKey: .defaultBuyIn)
        status = try c.decode(GameStatus.self, forKey: .status)
        players = try c.decode([Player].self, forKey: .players)
        transactions = try c.decode([Transaction].self, forKey: .transactions)
        cashOuts = try c.decode([PlayerID: Cents].self, forKey: .cashOuts)
        payoffs = try c.decodeIfPresent([String: String].self, forKey: .payoffs) ?? [:]
    }
}

enum Timestamp {
    private static let style = Date.ISO8601FormatStyle(includingFractionalSeconds: true, timeZone: .gmt)

    /// "2026-11-06T10:00:00.000Z", the same form the web app writes.
    static func now() -> String { Date.now.formatted(style) }

    static func date(_ text: String) -> Date? {
        (try? style.parse(text)) ?? (try? Date.ISO8601FormatStyle().parse(text))
    }
}
