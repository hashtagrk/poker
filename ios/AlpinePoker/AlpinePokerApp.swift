import SwiftUI

@main
struct AlpinePokerApp: App {
    @State private var store = PokerStore(defaults: AlpinePokerApp.storage)

    /// UI tests launch with `-uiTestFreshStart YES` to play on an empty league.
    private static var storage: UserDefaults {
        UserDefaults.standard.bool(forKey: "uiTestFreshStart")
            ? UserDefaults(suiteName: "ui-test-\(UUID().uuidString)") ?? .standard
            : .standard
    }

    var body: some Scene {
        WindowGroup {
            RootView(store: store)
                .preferredColorScheme(.dark)
                .tint(Palette.gold)
        }
    }
}

/// League home, or the open game at whatever step it has reached.
struct RootView: View {
    @Bindable var store: PokerStore

    var body: some View {
        NavigationStack {
            ZStack {
                FeltBackground()
                if let game = store.activeGame {
                    screen(for: game)
                        .id(game.id + game.status.rawValue)
                        .transition(.opacity)
                } else {
                    HomeView(store: store)
                }
            }
            .animation(.easeInOut(duration: 0.25), value: store.activeGame?.status)
            .animation(.easeInOut(duration: 0.25), value: store.activeGameID)
            .toolbar {
                ToolbarItemGroup(placement: .keyboard) {
                    Spacer()
                    Button("Done") { hideKeyboard() }
                }
            }
        }
        .alert("Not quite", isPresented: Binding(get: { store.problem != nil }, set: { if !$0 { store.problem = nil } })) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(store.problem ?? "")
        }
        .overlay(alignment: .bottom) { toast }
    }

    @ViewBuilder
    private func screen(for game: Game) -> some View {
        switch game.status {
        case .setup: SeatingView(store: store, game: game)
        case .active: TableView(store: store, game: game)
        case .cashOut: CashOutView(store: store, game: game)
        case .settled: SettlementView(store: store, game: game)
        }
    }

    @ViewBuilder
    private var toast: some View {
        if let message = store.toast {
            Text(message)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(Palette.ink)
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
                .background(Capsule().fill(Palette.gold))
                .shadow(radius: 8)
                .padding(.bottom, 24)
                .transition(.move(edge: .bottom).combined(with: .opacity))
                .task(id: message) {
                    try? await Task.sleep(for: .seconds(2))
                    withAnimation { store.toast = nil }
                }
        }
    }
}

@MainActor
func hideKeyboard() {
    UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
}
