import Foundation

struct Balance: Equatable {
    var id: String
    /// Positive: should receive money. Negative: owes money.
    var amount: Cents
}

struct Transfer: Equatable, Hashable {
    var from: PlayerID
    var to: PlayerID
    var amount: Cents

    var key: String { "\(from)>\(to)" }
}

enum Settlement {
    /// Above this many non-zero balances the exact search gives way to greedy matching.
    static let exactSearchLimit = 12

    struct Unbalanced: Error, Equatable { let total: Cents }

    /// The minimum number of transfers that settle every balance. Exact for up to twelve
    /// people: split the balances into as many zero-sum groups as possible, then settle each
    /// group of k with k − 1 transfers.
    static func settle(_ balances: [Balance]) throws -> [Transfer] {
        let nonZero = balances.filter { $0.amount != 0 }
        let total = nonZero.reduce(0) { $0 + $1.amount }
        guard total == 0 else { throw Unbalanced(total: total) }
        if nonZero.isEmpty { return [] }
        let groups = nonZero.count <= exactSearchLimit ? zeroSumGroups(nonZero) : [nonZero]
        return groups.flatMap(greedy)
    }

    /// Settles a zero-sum group by matching the largest creditor with the largest debtor.
    static func greedy(_ balances: [Balance]) -> [Transfer] {
        var creditors = balances.filter { $0.amount > 0 }.sorted { $0.amount > $1.amount }
        var debtors = balances.filter { $0.amount < 0 }
            .map { Balance(id: $0.id, amount: -$0.amount) }
            .sorted { $0.amount > $1.amount }
        var transfers: [Transfer] = []
        var c = 0, d = 0
        while c < creditors.count, d < debtors.count {
            let amount = min(creditors[c].amount, debtors[d].amount)
            transfers.append(Transfer(from: debtors[d].id, to: creditors[c].id, amount: amount))
            creditors[c].amount -= amount
            debtors[d].amount -= amount
            if creditors[c].amount == 0 { c += 1 }
            if debtors[d].amount == 0 { d += 1 }
        }
        return transfers
    }

    /// best[mask] = most zero-sum groups from the subset `mask`, built by removing one
    /// element at a time and counting a group whenever what is left sums to zero.
    private static func zeroSumGroups(_ balances: [Balance]) -> [[Balance]] {
        let count = balances.count
        let full = (1 << count) - 1
        var subsetSum = [Cents](repeating: 0, count: full + 1)
        for mask in 1...full {
            let lowest = mask & -mask
            subsetSum[mask] = subsetSum[mask ^ lowest] + balances[lowest.trailingZeroBitCount].amount
        }
        var best = [Int](repeating: 0, count: full + 1)
        var parent = [Int](repeating: -1, count: full + 1)
        for mask in 1...full {
            var bestChild = -1, bestValue = -1
            for index in 0..<count where mask & (1 << index) != 0 {
                let child = mask ^ (1 << index)
                if best[child] > bestValue {
                    bestValue = best[child]
                    bestChild = index
                }
            }
            best[mask] = bestValue + (subsetSum[mask] == 0 ? 1 : 0)
            parent[mask] = bestChild
        }
        var groups: [[Balance]] = []
        var current: [Balance] = []
        var mask = full
        while mask != 0 {
            let index = parent[mask]
            current.append(balances[index])
            mask ^= 1 << index
            if subsetSum[mask] == 0 {
                groups.append(current)
                current = []
            }
        }
        return groups
    }
}
