import Foundation

/// Integer minor units (paise/cents). Never a float.
typealias Cents = Int

enum Money {
    static let defaultCurrency = "₹"
    static let defaultBuyIn: Cents = 150_000

    private static let aliases: [String: String] = [
        "INR": "₹", "RS": "₹", "RS.": "₹", "RUPEE": "₹", "RUPEES": "₹",
        "USD": "$", "EUR": "€", "GBP": "£", "JPY": "¥",
    ]

    /// Parses a typed amount ("20", "20.5", "1,250.75", "₹40") into cents. Nil for anything
    /// that is not a non-negative amount with at most two decimals.
    static func parse(_ input: String) -> Cents? {
        var cleaned = input.trimmingCharacters(in: .whitespacesAndNewlines)
            .filter { $0 != "," && !$0.isWhitespace }
        // drop a leading currency symbol or code
        while let first = cleaned.first, !(first.isASCII && (first.isNumber || first == "." || first == "-")) {
            cleaned.removeFirst()
        }
        guard !cleaned.isEmpty, cleaned != "." else { return nil }
        let parts = cleaned.split(separator: ".", omittingEmptySubsequences: false)
        guard parts.count <= 2 else { return nil }
        let whole = String(parts[0])
        let fraction = parts.count == 2 ? String(parts[1]) : ""
        guard whole.allSatisfy({ $0.isASCII && $0.isNumber }),
              fraction.allSatisfy({ $0.isASCII && $0.isNumber }),
              fraction.count <= 2 else { return nil }
        guard let wholeValue = Int(whole.isEmpty ? "0" : whole),
              let fractionValue = Int(fraction.padding(toLength: 2, withPad: "0", startingAt: 0)) else { return nil }
        let (cents, overflow) = wholeValue.multipliedReportingOverflow(by: 100)
        guard !overflow, cents <= Int(Int32.max) * 100 else { return nil }
        return cents + fractionValue
    }

    /// The text a money field starts with: "1500", or "20.5" for part units.
    static func editable(_ cents: Cents) -> String {
        if cents % 100 == 0 { return String(cents / 100) }
        var text = String(format: "%d.%02d", cents / 100, cents % 100)
        if text.hasSuffix("0") { text.removeLast() }
        return text
    }

    /// Maps typed currency codes ("INR", "Rs") to their symbol; empty means the default.
    static func normalizeCurrency(_ input: String) -> String {
        let trimmed = input.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty { return defaultCurrency }
        return aliases[trimmed.uppercased()] ?? trimmed
    }

    /// Formats cents as currency. Rupees group in lakhs (1,00,000); negatives use a true minus.
    static func format(_ cents: Cents, _ currency: String, signed: Bool = false, compact: Bool = false) -> String {
        let magnitude = abs(cents)
        let whole = magnitude / 100
        let fraction = magnitude % 100
        let wholeText = group(whole, indian: usesIndianGrouping(currency))
        let body = compact && fraction == 0 ? wholeText : "\(wholeText).\(String(format: "%02d", fraction))"
        let sign = cents < 0 ? "−" : (signed && cents > 0 ? "+" : "")
        return "\(sign)\(currency)\(body)"
    }

    private static func usesIndianGrouping(_ currency: String) -> Bool {
        currency == "₹" || ["INR", "RS"].contains(currency.uppercased())
    }

    private static func group(_ value: Int, indian: Bool) -> String {
        let digits = Array(String(value))
        guard digits.count > 3 else { return String(digits) }
        var groups = [String(digits.suffix(3))]
        var rest = Array(digits.dropLast(3))
        let size = indian ? 2 : 3
        while !rest.isEmpty {
            groups.insert(String(rest.suffix(size)), at: 0)
            rest = Array(rest.dropLast(size))
        }
        return groups.joined(separator: ",")
    }
}
