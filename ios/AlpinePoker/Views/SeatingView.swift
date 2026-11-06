import SwiftUI

/// Step 1 of 4: seat everyone and confirm what each is buying in for.
struct SeatingView: View {
    let store: PokerStore
    let game: Game
    @State private var newName = ""
    /// Per-seat buy-in text; a seat with no entry uses the default buy-in.
    @State private var drafts: [PlayerID: String] = [:]
    @State private var editing: Player?
    @State private var settings: SettingsDraft

    init(store: PokerStore, game: Game) {
        self.store = store
        self.game = game
        _settings = State(initialValue: SettingsDraft(game: game))
    }

    private var buyIns: [PlayerID: Cents?] {
        Dictionary(uniqueKeysWithValues: game.players.map { player in
            (player.id, drafts[player.id].map(Money.parse) ?? game.defaultBuyIn)
        })
    }
    private var invalid: Set<PlayerID> {
        Set(buyIns.filter { ($0.value ?? 0) <= 0 }.map(\.key))
    }
    private var total: Cents { buyIns.values.reduce(0) { $0 + ($1 ?? 0) } }
    private var seatsLeft: Int { Game.maxPlayers - game.players.count }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                VStack(alignment: .leading, spacing: 6) {
                    Eyebrow(text: "Step 1 of 4")
                    Text("Seat the table").font(.display(32)).foregroundStyle(Palette.cream)
                    Text("Add everyone playing tonight and confirm what each person is buying in for.")
                        .font(.subheadline).foregroundStyle(Palette.cream.opacity(0.75))
                }
                seats
                settingsCard
            }
            .padding(16)
            .padding(.bottom, 110)
        }
        .scrollDismissesKeyboard(.interactively)
        .safeAreaInset(edge: .bottom) { dealBar }
        .navigationTitle(game.name)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { LeagueButton(store: store) }
        .sheet(item: $editing) { player in
            PlayerEditor(store: store, game: game, player: player)
        }
    }

    private var seats: some View {
        PaperCard {
            HStack {
                Text("Seats").font(.display(22)).foregroundStyle(Palette.ink)
                Spacer()
                Text(seatsLeft == 0 ? "Table is full" : "seat".plural(seatsLeft) + " left")
                    .font(.caption).foregroundStyle(Palette.ink2)
            }
            HStack(spacing: 8) {
                TextField("Player name", text: $newName, prompt: Text("Player name").foregroundStyle(Palette.ink3))
                    .foregroundStyle(Palette.ink)
                    .submitLabel(.done)
                    .onSubmit(addTyped)
                    .padding(.horizontal, 10)
                    .frame(minHeight: 40)
                    .background(RoundedRectangle(cornerRadius: 8).fill(Palette.paper))
                    .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(Palette.paper3))
                Button("Add seat", action: addTyped)
                    .buttonStyle(SmallButtonStyle(filled: true))
                    .disabled(seatsLeft == 0 || newName.trimmingCharacters(in: .whitespaces).isEmpty)
            }
            RegularsPicker(game: game) { member in
                store.update { try $0.addPlayer(member.name, title: member.title, character: member.character) }
                Haptic.tap()
            } seatAll: { members in
                store.update { game in
                    for member in members { try game.addPlayer(member.name, title: member.title, character: member.character) }
                }
                Haptic.tap()
            }
            if game.players.isEmpty {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Nobody seated yet.").font(.headline).foregroundStyle(Palette.ink)
                    Text("Add at least \(Game.minPlayers) players to deal.").font(.subheadline).foregroundStyle(Palette.ink2)
                }
                .padding(.vertical, 8)
            }
            ForEach(game.players) { player in
                seatRow(player)
                if player.id != game.players.last?.id { Divider() }
            }
        }
    }

    private func seatRow(_ player: Player) -> some View {
        HStack(spacing: 8) {
            Text("\(player.seat)").font(.caption.weight(.bold)).monospacedDigit().foregroundStyle(Palette.ink3).frame(width: 16)
            Button { editing = player } label: { PlayerLabel(player: player, size: 34) }
                .buttonStyle(.plain)
                .accessibilityHint("Edit name, title and character")
            Spacer(minLength: 4)
            MoneyField(currency: game.currency,
                       text: Binding(get: { drafts[player.id] ?? Money.editable(game.defaultBuyIn) },
                                     set: { drafts[player.id] = $0 }),
                       invalid: invalid.contains(player.id), label: "\(player.name)'s buy-in")
                .frame(width: 118)
            Button {
                store.update { try $0.removePlayer(player.id) }
            } label: {
                Image(systemName: "xmark.circle.fill").font(.title3).foregroundStyle(Palette.ink3)
                    .frame(width: 32, height: 40)
            }
            .accessibilityLabel("Remove \(player.name)")
        }
    }

    private var settingsCard: some View {
        FeltPanel {
            Text("Table settings").font(.display(20)).foregroundStyle(Palette.cream)
            LabeledField("Game name") {
                TextField("Game name", text: $settings.name)
                    .onSubmit { commit(name: settings.name) }
            }
            HStack(spacing: 12) {
                LabeledField("Currency") {
                    TextField("₹", text: $settings.currency).onSubmit { commit(currency: settings.currency) }
                }
                .frame(width: 90)
                LabeledField("Default buy-in") {
                    TextField("0", text: $settings.buyIn).keyboardType(.decimalPad)
                }
            }
            Button("Save settings") {
                hideKeyboard()
                guard let cents = Money.parse(settings.buyIn), cents > 0 else {
                    store.problem = "Enter a default buy-in greater than zero"
                    return
                }
                if store.update({ try $0.updateSettings(name: settings.name, currency: settings.currency, defaultBuyIn: cents) }, done: "Settings saved") {
                    settings = SettingsDraft(game: store.activeGame ?? game)
                }
            }
            .buttonStyle(PrimaryButtonStyle(prominent: false))
            Text("The default buy-in is used for new seats and rebuys.").font(.caption).foregroundStyle(Palette.cream.opacity(0.6))
        }
    }

    private var dealBar: some View {
        VStack(spacing: 8) {
            HStack {
                Eyebrow(text: "On the table")
                Spacer()
                Text("\(Money.format(total, game.currency, compact: true)) · \("player".plural(game.players.count))")
                    .font(.subheadline.weight(.semibold)).monospacedDigit().foregroundStyle(Palette.cream)
            }
            Button("Deal the cards") {
                hideKeyboard()
                let resolved = buyIns.compactMapValues { $0 }
                store.update({ try $0.start(buyIns: resolved) }, done: "Cards in the air")
                Haptic.success()
            }
            .buttonStyle(PrimaryButtonStyle())
            .disabled(game.players.count < Game.minPlayers || !invalid.isEmpty)
        }
        .padding(.horizontal, 16)
        .padding(.top, 12)
        .padding(.bottom, 4)
        .background(.ultraThinMaterial)
    }

    private func addTyped() {
        let name = newName
        if store.update({ try $0.addPlayer(name) }) { newName = "" }
    }

    private func commit(name: String? = nil, currency: String? = nil) {
        store.update { try $0.updateSettings(name: name, currency: currency) }
    }
}

private struct SettingsDraft {
    var name: String
    var currency: String
    var buyIn: String

    init(game: Game) {
        name = game.name
        currency = game.currency
        buyIn = Money.editable(game.defaultBuyIn)
    }
}

/// A small label over a field on the felt.
struct LabeledField<Field: View>: View {
    let label: String
    @ViewBuilder var field: Field

    init(_ label: String, @ViewBuilder field: () -> Field) {
        self.label = label
        self.field = field()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label).font(.caption.weight(.semibold)).foregroundStyle(Palette.cream.opacity(0.7))
            field
                .foregroundStyle(Palette.cream)
                .padding(.horizontal, 10)
                .frame(minHeight: 40)
                .background(RoundedRectangle(cornerRadius: 8).fill(Palette.felt800))
                .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(Palette.gold.opacity(0.25)))
        }
    }
}

/// The league regulars not yet seated, one tap each.
struct RegularsPicker: View {
    let game: Game
    let seat: (LeagueMember) -> Void
    var seatAll: (([LeagueMember]) -> Void)?

    var body: some View {
        let available = LeagueMember.regulars.filter { !$0.isSeated(in: game) }
        let seatsLeft = Game.maxPlayers - game.players.count
        if !available.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Eyebrow(text: "League regulars", color: Palette.goldInk)
                    Spacer()
                    if let seatAll, seatsLeft > 0, available.count > 1 {
                        Button(available.count <= seatsLeft ? "Seat everyone" : "Seat next \(seatsLeft)") {
                            seatAll(Array(available.prefix(seatsLeft)))
                        }
                        .font(.caption.weight(.semibold))
                    }
                }
                FlowLayout(spacing: 6) {
                    ForEach(available) { member in
                        Button { seat(member) } label: {
                            HStack(spacing: 6) {
                                ChipAvatar(character: member.character, size: 22)
                                VStack(alignment: .leading, spacing: 0) {
                                    Text(member.name).font(.subheadline.weight(.semibold)).foregroundStyle(Palette.ink)
                                    if let title = member.title {
                                        Text(title).font(.caption2).italic().foregroundStyle(Palette.ink2)
                                    }
                                }
                                Image(systemName: "plus").font(.caption.weight(.bold)).foregroundStyle(Palette.goldInk)
                            }
                            .padding(.leading, 4).padding(.trailing, 10).padding(.vertical, 4)
                            .background(Capsule().fill(Palette.paper2))
                        }
                        .buttonStyle(.plain)
                        .disabled(seatsLeft == 0)
                        .accessibilityLabel(member.title.map { "Seat \(member.name), \($0)" } ?? "Seat \(member.name)")
                    }
                }
            }
        }
    }
}

/// Back to the league home, leaving the game where it is.
struct LeagueButton: ToolbarContent {
    let store: PokerStore

    var body: some ToolbarContent {
        ToolbarItem(placement: .topBarLeading) {
            Button { store.open(nil) } label: { Label("League", systemImage: "chevron.left").labelStyle(.titleAndIcon) }
        }
    }
}

/// Name, nickname and character for one player.
struct PlayerEditor: View {
    let store: PokerStore
    let game: Game
    let player: Player
    @Environment(\.dismiss) private var dismiss
    @State private var name: String
    @State private var title: String
    @State private var character: String

    init(store: PokerStore, game: Game, player: Player) {
        self.store = store
        self.game = game
        self.player = player
        _name = State(initialValue: player.name)
        _title = State(initialValue: player.title ?? "")
        _character = State(initialValue: player.character)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Name") {
                    TextField("Name", text: $name)
                    TextField("Table nickname (optional)", text: $title)
                }
                Section("Character") {
                    LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 4), spacing: 12) {
                        ForEach(Characters.all, id: \.self) { id in
                            Button { character = id } label: {
                                VStack(spacing: 4) {
                                    ChipAvatar(character: id, size: 46)
                                        .overlay(Circle().strokeBorder(Palette.gold, lineWidth: character == id ? 3 : 0).padding(-4))
                                    Text(Characters.names[id] ?? id).font(.caption2)
                                }
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel(Characters.names[id] ?? id)
                            .accessibilityAddTraits(character == id ? .isSelected : [])
                        }
                    }
                    .padding(.vertical, 6)
                }
            }
            .navigationTitle("Edit player")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        if store.update({ try $0.updatePlayer(player.id, name: name, title: title, character: character) }) { dismiss() }
                    }
                }
            }
        }
        .presentationDetents([.medium, .large])
    }
}
