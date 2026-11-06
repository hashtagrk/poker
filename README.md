# Alpine Poker League

A localhost ledger for home poker nights. Seat up to eight players, record buy-ins, rebuys and loans (from the bank or between players) as they happen, count the chips at the end, and get the fewest transfers that settle everyone up.

Everything runs in the browser and is saved in `localStorage`. No accounts, no server, no network calls apart from the two web fonts.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
```

Production build served locally:

```bash
npm run build
npm run start      # http://localhost:4173
```

## How a night works

1. **Seat the table.** Name the night, pick a currency (₹ by default) and a default buy-in. Seat the league regulars with one click (names, titles and characters are prefilled from `src/lib/roster.ts`), or add anyone else by name. Edit titles and characters per seat and confirm per-seat buy-ins.
2. **Table.** Record rebuys and loans as they happen. A loan can come from the bank itself (chips on credit, owed back to the bank) or from another player, who either buys new chips for the borrower or hands over chips from their own stack. Loans can be paid off mid-game in cash or in chips. Late arrivals can be seated mid-game.
3. **Cash out.** Enter each player's final chip value. The total must equal the chips in play; the difference is shown live and can be assigned to one player.
4. **Settled.** See each player's net result with loans netted in, plus the minimum set of transfers. Tick each transfer off as it is paid. Copy a text summary or download the night as JSON.

The league home page keeps all-time standings across settled nights, matched by player name.

## iPhone app

`ios/` is a native SwiftUI app, separate from the web app and built from native controls. It has the same steps (league home, seating, the table, cash-out, settlement) and the same money rules, ported from `src/lib` with its tests.

- Games are saved on the phone. The first launch carries over any games the earlier web-view build saved.
- A game's JSON is the same in both apps: **Export JSON** on the phone's settlement screen can be imported on the web, and a web download can be imported on the phone (home screen → Import).
- Rules live in `ios/AlpinePoker/Model`, unit-tested in `ios/AlpinePokerTests`; `ios/AlpinePokerUITests` plays a whole night.

Needs Xcode 16 or later; runs on iOS 17 and later. The project is generated from `ios/project.yml` with [XcodeGen](https://github.com/yonaskolb/XcodeGen): after adding or renaming files, run `xcodegen generate` in `ios/`.

1. Open `ios/AlpinePoker.xcodeproj` in Xcode.
2. Select the **AlpinePoker** target → **Signing & Capabilities** and choose your Apple ID as the **Team**.
3. Plug in your iPhone, unlock it, tap **Trust**, and pick it as the run destination.
4. On the iPhone, turn on **Settings → Privacy & Security → Developer Mode** (it asks to restart).
5. Press **Run** (⌘R). The first time, approve the developer under **Settings → General → VPN & Device Management**.

With a free Apple ID the app runs for 7 days before it needs reinstalling from Xcode.
Tests: `xcodebuild test -project ios/AlpinePoker.xcodeproj -scheme AlpinePoker -destination 'platform=iOS Simulator,name=iPhone 17'`.
The icon source is `assets/icon-only.png`.

## The money model

Amounts are integer minor units (paise/cents). For each player:

```
net = cashOut − paidIn + lent − borrowed
```

`paidIn` is the cash a player is responsible for at the bank: their own buy-ins, any bank-funded loans they covered, and any cash they paid back to the bank. Chips in play equal cash in the bank plus chips the bank issued on credit, so a night is only settleable when the cash-outs sum to the chips in play. A bank loan counts against the borrower's net, which keeps every night zero-sum between players.

Settlement uses an exact search for up to 12 non-zero balances (partition into the maximum number of zero-sum groups, then greedy inside each group), which yields the true minimum number of transfers for an eight-seat table.

## Project layout

```
src/
├── lib/          pure domain logic: money, ledger math, game reducers, settlement, league standings, zod schema
├── store/        zustand stores (persisted game state, toasts)
├── components/   screens by feature (home, setup, table, cashout, settlement) plus ui primitives
├── hooks/
└── styles/       design tokens and global styles
e2e/              Playwright flows
```

## Scripts

| Script                  | What it does                                             |
| ----------------------- | -------------------------------------------------------- |
| `npm run dev`           | Vite dev server                                          |
| `npm run build`         | Typecheck and production build                           |
| `npm run start`         | Serve the production build                               |
| `npm test`              | Unit tests (Vitest)                                      |
| `npm run test:coverage` | Unit tests with coverage thresholds                      |
| `npm run test:e2e`      | Playwright end-to-end flows against the production build |
| `npm run typecheck`     | `tsc --noEmit`                                           |
| `npm run lint`          | oxlint                                                   |
| `npm run format`        | Prettier                                                 |

## Characters

Player characters live in `src/lib/characters.ts` and render through `CharacterAvatar`. The current eight are placeholders; swap the `Accessory` renderer and the registry entries to ship final artwork without touching the rest of the app.
