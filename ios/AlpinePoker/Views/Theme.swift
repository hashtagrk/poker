import SwiftUI

extension Color {
    init(hex: UInt32) {
        self.init(.sRGB, red: Double((hex >> 16) & 0xFF) / 255, green: Double((hex >> 8) & 0xFF) / 255,
                  blue: Double(hex & 0xFF) / 255)
    }
}

/// The web app's felt, paper and gold tokens, converted from OKLCH to sRGB.
enum Palette {
    static let felt950 = Color(hex: 0x000903)
    static let felt900 = Color(hex: 0x001409)
    static let felt800 = Color(hex: 0x032415)
    static let felt700 = Color(hex: 0x093421)
    static let felt600 = Color(hex: 0x1B4A34)
    static let paper = Color(hex: 0xF9F3E6)
    static let paper2 = Color(hex: 0xECE4D3)
    static let paper3 = Color(hex: 0xDAD0BB)
    static let ink = Color(hex: 0x261A11)
    static let ink2 = Color(hex: 0x605248)
    static let ink3 = Color(hex: 0x90847A)
    static let gold = Color(hex: 0xEBBD57)
    static let goldDeep = Color(hex: 0xCA8A10)
    static let goldInk = Color(hex: 0x935B00)
    static let win = Color(hex: 0x4FCE74)
    static let winInk = Color(hex: 0x007329)
    static let loss = Color(hex: 0xFF6A65)
    static let lossInk = Color(hex: 0xBE222A)
    static let cream = Color(hex: 0xF4ECD8)

    static func chip(_ character: String) -> Color {
        switch character {
        case "c1": Color(hex: 0xDE3B3D)
        case "c2": Color(hex: 0x007CD9)
        case "c3": Color(hex: 0xE3AE28)
        case "c4": Color(hex: 0x2E9E52)
        case "c5": Color(hex: 0xC1BDB7)
        case "c6": Color(hex: 0x9C51CC)
        case "c7": Color(hex: 0xF07900)
        default: Color(hex: 0xF072B3)
        }
    }

    static func symbol(_ character: String) -> String {
        switch character {
        case "c1": "sunglasses.fill"
        case "c2": "function"
        case "c3": "crown.fill"
        case "c4": "mustache.fill"
        case "c5": "snowflake"
        case "c6": "sparkles"
        case "c7": "headphones"
        default: "camera.macro"
        }
    }
}

extension Font {
    /// Serif headings stand in for the web app's Fraunces.
    static func display(_ size: CGFloat, italic: Bool = false) -> Font {
        let font = Font.system(size: size, weight: .semibold, design: .serif)
        return italic ? font.italic() : font
    }
}

/// A character drawn as a poker chip: the seat colour, a dashed edge, the character's emblem.
struct ChipAvatar: View {
    let character: String
    var size: CGFloat = 36

    var body: some View {
        ZStack {
            Circle().fill(Palette.chip(character))
            Circle()
                .strokeBorder(.white.opacity(0.85), style: StrokeStyle(lineWidth: size * 0.09, dash: [size * 0.16, size * 0.16]))
                .padding(size * 0.04)
            Circle().fill(.black.opacity(0.18)).padding(size * 0.2)
            Image(systemName: Palette.symbol(character))
                .font(.system(size: size * 0.34, weight: .bold))
                .foregroundStyle(.white)
        }
        .frame(width: size, height: size)
        .shadow(color: .black.opacity(0.35), radius: 2, y: 1)
        .accessibilityHidden(true)
    }
}

/// Name with the table nickname underneath.
struct PlayerLabel: View {
    let player: Player
    var size: CGFloat = 36
    var ink = Palette.ink

    var body: some View {
        HStack(spacing: 10) {
            ChipAvatar(character: player.character, size: size)
            VStack(alignment: .leading, spacing: 1) {
                Text(player.name).font(.headline).foregroundStyle(ink).lineLimit(1)
                if let title = player.title {
                    Text(title).font(.caption).italic().foregroundStyle(ink.opacity(0.65)).lineLimit(1)
                }
            }
        }
    }
}

struct MoneyText: View {
    enum Tone { case plain, gold, sign }
    let cents: Cents
    let currency: String
    var tone = Tone.plain
    var signed = false
    var onPaper = true

    var body: some View {
        Text(Money.format(cents, currency, signed: signed, compact: true))
            .monospacedDigit()
            .foregroundStyle(color)
    }

    private var color: Color {
        switch tone {
        case .plain: onPaper ? Palette.ink : Palette.cream
        case .gold: onPaper ? Palette.goldInk : Palette.gold
        case .sign:
            cents > 0 ? (onPaper ? Palette.winInk : Palette.win)
                : cents < 0 ? (onPaper ? Palette.lossInk : Palette.loss)
                : (onPaper ? Palette.ink2 : Palette.cream.opacity(0.7))
        }
    }
}

/// A text field for an amount, with the currency in front and a number pad.
struct MoneyField: View {
    let currency: String
    @Binding var text: String
    var invalid = false
    var label = "Amount"

    var body: some View {
        HStack(spacing: 4) {
            Text(currency).foregroundStyle(Palette.ink2)
            TextField(label, text: $text, prompt: Text("0").foregroundStyle(Palette.ink3))
                .keyboardType(.decimalPad)
                .monospacedDigit()
                .foregroundStyle(Palette.ink)
                .accessibilityLabel(label)
        }
        .padding(.horizontal, 10)
        .frame(minHeight: 40)
        .background(RoundedRectangle(cornerRadius: 8).fill(Palette.paper))
        .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(invalid ? Palette.lossInk : Palette.paper3, lineWidth: invalid ? 2 : 1))
    }
}

struct Eyebrow: View {
    let text: String
    var color = Palette.gold

    var body: some View {
        Text(text.uppercased())
            .font(.caption.weight(.semibold))
            .tracking(1.4)
            .foregroundStyle(color)
    }
}

struct Badge: View {
    enum Tone { case neutral, win, loss, gold }
    let text: String
    var tone = Tone.neutral

    var body: some View {
        Text(text)
            .font(.caption.weight(.semibold))
            .monospacedDigit()
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .foregroundStyle(foreground)
            .background(Capsule().fill(background))
    }

    private var foreground: Color {
        switch tone {
        case .neutral: Palette.ink2
        case .win: Palette.winInk
        case .loss: Palette.lossInk
        case .gold: Palette.ink
        }
    }

    private var background: Color {
        switch tone {
        case .neutral: Palette.paper2
        case .win: Palette.win.opacity(0.22)
        case .loss: Palette.loss.opacity(0.2)
        case .gold: Palette.gold
        }
    }
}

/// Cream card on the felt.
struct PaperCard<Content: View>: View {
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 12) { content }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: 16).fill(Palette.paper))
            .shadow(color: .black.opacity(0.3), radius: 10, y: 4)
    }
}

/// Darker felt panel for totals and actions.
struct FeltPanel<Content: View>: View {
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 12) { content }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: 16).fill(Palette.felt700))
            .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(Palette.gold.opacity(0.25)))
    }
}

struct Stat: View {
    let label: String
    let value: String
    var tint = Palette.cream

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Eyebrow(text: label, color: Palette.cream.opacity(0.6))
            Text(value).font(.title3.weight(.semibold)).monospacedDigit().foregroundStyle(tint)
                .lineLimit(1).minimumScaleFactor(0.6)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }
}

struct PrimaryButtonStyle: ButtonStyle {
    var prominent = true
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headline)
            .foregroundStyle(prominent ? Palette.ink : Palette.cream)
            .frame(maxWidth: .infinity, minHeight: 48)
            .background(RoundedRectangle(cornerRadius: 12).fill(prominent ? Palette.gold : Palette.felt600))
            .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(prominent ? .clear : Palette.gold.opacity(0.35)))
            .opacity(isEnabled ? 1 : 0.4)
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
            .animation(.easeOut(duration: 0.1), value: configuration.isPressed)
    }
}

struct SmallButtonStyle: ButtonStyle {
    var filled = false
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(filled ? Palette.ink : Palette.goldInk)
            .padding(.horizontal, 12)
            .frame(minHeight: 36)
            .background(Capsule().fill(filled ? Palette.gold : Palette.paper2))
            .opacity(isEnabled ? 1 : 0.4)
            .scaleEffect(configuration.isPressed ? 0.96 : 1)
    }
}

/// Lays chips out left to right, wrapping onto new lines.
struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let rows = arrange(width: proposal.width ?? .infinity, subviews: subviews)
        return CGSize(width: proposal.width ?? rows.map(\.width).max() ?? 0, height: rows.last.map { $0.y + $0.height } ?? 0)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        for row in arrange(width: bounds.width, subviews: subviews) {
            var x = bounds.minX
            for index in row.items {
                let size = subviews[index].sizeThatFits(.unspecified)
                subviews[index].place(at: CGPoint(x: x, y: bounds.minY + row.y), proposal: ProposedViewSize(size))
                x += size.width + spacing
            }
        }
    }

    private struct Row { var items: [Int] = []; var y: CGFloat = 0; var width: CGFloat = 0; var height: CGFloat = 0 }

    private func arrange(width: CGFloat, subviews: Subviews) -> [Row] {
        var rows = [Row()]
        for index in subviews.indices {
            let size = subviews[index].sizeThatFits(.unspecified)
            if !rows[rows.count - 1].items.isEmpty, rows[rows.count - 1].width + spacing + size.width > width {
                let last = rows[rows.count - 1]
                rows.append(Row(y: last.y + last.height + spacing))
            }
            rows[rows.count - 1].width += (rows[rows.count - 1].items.isEmpty ? 0 : spacing) + size.width
            rows[rows.count - 1].height = max(rows[rows.count - 1].height, size.height)
            rows[rows.count - 1].items.append(index)
        }
        return rows
    }
}

/// The felt background every screen sits on.
struct FeltBackground: View {
    var body: some View {
        RadialGradient(colors: [Palette.felt700, Palette.felt800, Palette.felt950],
                       center: UnitPoint(x: 0.5, y: 0), startRadius: 10, endRadius: 800)
            .ignoresSafeArea()
    }
}

@MainActor
enum Haptic {
    static func tap() { UIImpactFeedbackGenerator(style: .light).impactOccurred() }
    static func success() { UINotificationFeedbackGenerator().notificationOccurred(.success) }
}

extension String {
    func plural(_ count: Int) -> String { "\(count) \(self)\(count == 1 ? "" : "s")" }
}
