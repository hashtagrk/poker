import SwiftUI

/// Amount text that starts at a sensible figure and is checked on submit.
private struct AmountInput {
    var text: String
    var invalid = false

    init(_ cents: Cents) { text = Money.editable(cents) }

    mutating func cents() -> Cents? {
        guard let value = Money.parse(text), value > 0 else { invalid = true; return nil }
        invalid = false
        return value
    }
}

private struct PlayerPicker: View {
    let title: String
    let game: Game
    @Binding var selection: PlayerID
    var excluding: PlayerID?

    var body: some View {
        Picker(title, selection: $selection) {
            ForEach(game.players.filter { $0.id != excluding }) { Text($0.name).tag($0.id) }
        }
    }
}

private struct AmountRow: View {
    let currency: String
    @Binding var input: AmountInput
    var label = "Amount"

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(label)
                Spacer()
                Text(currency).foregroundStyle(.secondary)
                TextField("0", text: $input.text)
                    .keyboardType(.decimalPad)
                    .multilineTextAlignment(.trailing)
                    .monospacedDigit()
                    .frame(maxWidth: 140)
                    .accessibilityLabel(label)
            }
            if input.invalid {
                Text("Enter an amount greater than zero").font(.caption).foregroundStyle(Palette.loss)
            }
        }
    }
}

/// Shared chrome for the table's forms: a title, Cancel, and the confirm button.
private struct SheetFrame<Content: View>: View {
    let title: String
    let confirm: String
    var canConfirm = true
    let onConfirm: () -> Void
    @ViewBuilder var content: Content
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form { content }
                .navigationTitle(title)
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                    ToolbarItem(placement: .confirmationAction) {
                        Button(confirm, action: onConfirm).disabled(!canConfirm).fontWeight(.semibold)
                    }
                    ToolbarItemGroup(placement: .keyboard) {
                        Spacer()
                        Button("Done") { hideKeyboard() }
                    }
                }
        }
        .presentationDetents([.large])
    }
}

struct RebuySheet: View {
    let store: PokerStore
    let game: Game
    @State private var playerID: PlayerID
    @State private var amount: AmountInput
    @State private var note = ""
    @Environment(\.dismiss) private var dismiss

    init(store: PokerStore, game: Game, playerID: PlayerID) {
        self.store = store
        self.game = game
        _playerID = State(initialValue: playerID)
        _amount = State(initialValue: AmountInput(game.defaultBuyIn))
    }

    var body: some View {
        SheetFrame(title: "Rebuy", confirm: "Add rebuy", onConfirm: submit) {
            PlayerPicker(title: "Player", game: game, selection: $playerID)
            AmountRow(currency: game.currency, input: $amount)
            TextField("Note (optional)", text: $note)
        }
    }

    private func submit() {
        guard let cents = amount.cents() else { return }
        if store.update({ try $0.buyIn(playerID, amount: cents, note: note) }) {
            Haptic.tap()
            dismiss()
        }
    }
}

struct LoanSheet: View {
    let store: PokerStore
    let game: Game
    @State private var borrowerID: PlayerID
    @State private var fromBank = true
    @State private var lenderID: PlayerID
    @State private var source = Transaction.LoanSource.bank
    @State private var amount: AmountInput
    @State private var note = ""
    @Environment(\.dismiss) private var dismiss

    init(store: PokerStore, game: Game, borrowerID: PlayerID) {
        self.store = store
        self.game = game
        _borrowerID = State(initialValue: borrowerID)
        _lenderID = State(initialValue: game.players.first { $0.id != borrowerID }?.id ?? "")
        _amount = State(initialValue: AmountInput(game.defaultBuyIn))
    }

    var body: some View {
        SheetFrame(title: "Loan", confirm: "Record loan", onConfirm: submit) {
            Section {
                PlayerPicker(title: "Borrower", game: game, selection: $borrowerID)
                    .onChange(of: borrowerID) { _, borrower in
                        if lenderID == borrower { lenderID = game.players.first { $0.id != borrower }?.id ?? "" }
                    }
            } footer: { Text("Who needs chips") }

            Section {
                Picker("Lender", selection: $fromBank) {
                    Text("The bank").tag(true)
                    Text("Another player").tag(false)
                }
                .pickerStyle(.segmented)
                if !fromBank {
                    PlayerPicker(title: "Lending player", game: game, selection: $lenderID, excluding: borrowerID)
                }
            } header: { Text("Lender") } footer: {
                Text(fromBank ? "The bank issues chips on credit. The borrower owes the bank."
                              : "A player covers them. The borrower owes that player.")
            }

            AmountRow(currency: game.currency, input: $amount)

            if !fromBank {
                Section("How does \(game.name(of: lenderID)) cover it?") {
                    choice("Buys new chips for them", "The lender pays the bank. More money goes in play.", selected: source == .bank) { source = .bank }
                    choice("Hands over chips from their stack", "Chips move across the table. The bank is untouched.", selected: source == .stack) { source = .stack }
                }
            }
            TextField("Note (optional)", text: $note)
        }
    }

    private func submit() {
        guard let cents = amount.cents() else { return }
        let lender = fromBank ? bankID : lenderID
        if store.update({ try $0.loan(from: lender, to: borrowerID, amount: cents, source: source, note: note) }) {
            Haptic.tap()
            dismiss()
        }
    }
}

struct RepaySheet: View {
    let store: PokerStore
    let game: Game
    @State private var borrowerID: PlayerID
    @State private var lenderID: PlayerID
    @State private var method = Transaction.Method.cash
    @State private var amount: AmountInput
    @State private var note = ""
    @Environment(\.dismiss) private var dismiss

    /// Bank first, then the players: everyone who could be owed.
    private var creditors: [(id: PlayerID, name: String)] {
        [(bankID, "The bank")] + game.players.map { ($0.id, $0.name) }
    }

    init(store: PokerStore, game: Game, borrowerID: PlayerID) {
        self.store = store
        self.game = game
        let debts = Ledger.outstandingDebts(game)
        let creditorIDs = [bankID] + game.players.map(\.id)
        let debtors = game.players.filter { p in creditorIDs.contains { (debts[Ledger.debtKey(borrower: p.id, lender: $0)] ?? 0) > 0 } }
        let borrower = debtors.contains { $0.id == borrowerID } ? borrowerID : (debtors.first?.id ?? "")
        let lender = creditorIDs.first { (debts[Ledger.debtKey(borrower: borrower, lender: $0)] ?? 0) > 0 } ?? ""
        _borrowerID = State(initialValue: borrower)
        _lenderID = State(initialValue: lender)
        _amount = State(initialValue: AmountInput(debts[Ledger.debtKey(borrower: borrower, lender: lender)] ?? 0))
    }

    var body: some View {
        let debts = Ledger.outstandingDebts(game)
        let owes = { (borrower: PlayerID, lender: PlayerID) in debts[Ledger.debtKey(borrower: borrower, lender: lender)] ?? 0 }
        let debtors = game.players.filter { p in creditors.contains { owes(p.id, $0.id) > 0 } }
        let lenders = creditors.filter { owes(borrowerID, $0.id) > 0 }
        let owed = owes(borrowerID, lenderID)
        let toBank = lenderID == bankID
        if debtors.isEmpty {
            SheetFrame(title: "Pay off a loan", confirm: "Close", onConfirm: { dismiss() }) {
                Text("Nobody owes anyone at the table right now.")
            }
        } else {
            SheetFrame(title: "Pay off a loan", confirm: "Record payoff", onConfirm: submit) {
                Section {
                    Picker("Borrower", selection: $borrowerID) {
                        ForEach(debtors) { Text($0.name).tag($0.id) }
                    }
                    .onChange(of: borrowerID) { _, borrower in
                        let first = creditors.first { owes(borrower, $0.id) > 0 }?.id ?? ""
                        lenderID = first
                        amount = AmountInput(owes(borrower, first))
                    }
                    Picker("Lender", selection: $lenderID) {
                        ForEach(lenders, id: \.id) { Text($0.name).tag($0.id) }
                    }
                    .onChange(of: lenderID) { _, lender in amount = AmountInput(owes(borrowerID, lender)) }
                } footer: {
                    if owed > 0 { Text("Outstanding: \(Money.format(owed, game.currency, compact: true))") }
                }
                AmountRow(currency: game.currency, input: $amount)
                Section("How is it being paid?") {
                    choice("Cash, away from the table",
                           toBank ? "The cash goes into the bank. Chips stay where they are." : "Chips stay where they are. The debt is cleared.",
                           selected: method == .cash) { method = .cash }
                    choice("Chips handed back",
                           toBank ? "Chips go back to the bank and leave play." : "Chips move from the borrower's stack to the lender's.",
                           selected: method == .chips) { method = .chips }
                }
                TextField("Note (optional)", text: $note)
            }
        }
    }

    private func submit() {
        guard let cents = amount.cents() else { return }
        if store.update({ try $0.repay(borrowerID, to: lenderID, amount: cents, method: method, note: note) }) {
            Haptic.tap()
            dismiss()
        }
    }
}

struct LateSeatSheet: View {
    let store: PokerStore
    let game: Game
    @State private var name = ""
    @State private var member: LeagueMember?
    @State private var amount: AmountInput
    @Environment(\.dismiss) private var dismiss

    init(store: PokerStore, game: Game) {
        self.store = store
        self.game = game
        _amount = State(initialValue: AmountInput(game.defaultBuyIn))
    }

    var body: some View {
        SheetFrame(title: "Late seat", confirm: "Seat player", canConfirm: !name.trimmingCharacters(in: .whitespaces).isEmpty, onConfirm: submit) {
            Section {
                RegularsPicker(game: game) { picked in
                    member = picked
                    name = picked.name
                }
                TextField("Name", text: $name)
            }
            AmountRow(currency: game.currency, input: $amount, label: "Buy-in")
        }
    }

    private func submit() {
        guard let cents = amount.cents() else { return }
        let profile = member?.name == name.trimmingCharacters(in: .whitespaces) ? member : nil
        let seated = store.update {
            let player = try $0.addPlayer(name, title: profile?.title, character: profile?.character)
            try $0.buyIn(player.id, amount: cents, rebuy: false)
        }
        if seated {
            Haptic.tap()
            dismiss()
        }
    }
}

/// A radio-style option with a hint underneath.
@MainActor
private func choice(_ title: String, _ hint: String, selected: Bool, action: @escaping () -> Void) -> some View {
    Button(action: action) {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: selected ? "largecircle.fill.circle" : "circle")
                .foregroundStyle(selected ? Palette.gold : .secondary)
                .font(.title3)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).foregroundStyle(.primary)
                Text(hint).font(.caption).foregroundStyle(.secondary)
            }
        }
    }
    .buttonStyle(.plain)
    .accessibilityAddTraits(selected ? .isSelected : [])
}
