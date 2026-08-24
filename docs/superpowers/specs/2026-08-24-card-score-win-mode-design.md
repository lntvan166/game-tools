# Card Score: Win Count mode + money layer

**Date:** 2026-08-24
**Status:** Approved design, ready for implementation planning
**Scope:** Part A of a two-part effort. Part B (app access code `xxxx-xxxx`) is
deliberately excluded and gets its own spec.

## Problem

The Card Score tab supports two scoring systems: Vietnamese 13 (Tiến lên) and
Host. Neither fits the common case of a card game where a round simply has one
winner — the player wanted this for "Cắt Tê" but the mode is intentionally
generic and unnamed after any specific game.

Separately, the tab tracks points only. Players settle up in cash after a
session and currently do that math by hand.

## Goals

1. A third scoring mode: 2–10 players, one winner per round, winner scores 1 point.
2. A money column across all three Card Score modes, driven by a configurable rate.
3. No regression for existing saved games or for players who do not play for money.

## Non-goals

- Access control / login. Separate spec.
- Any refactor of the Tiến lên or Host round-entry modals.
- Multi-device sync. Everything stays in `localStorage`.

## Decisions taken on the author's behalf

The author approved the design with three questions outstanding and asked to
proceed. These are the defaults chosen; each is cheap to reverse during
implementation.

| Question | Chosen | Reversal cost |
|---|---|---|
| Name of the new mode | **Win Count** | Rename a component, a lib, a tab label, and a storage key. |
| Money in round history | **Points ⇄ Money toggle** above the table | Swap the toggle for two column groups. |
| Test runner | **Add vitest** | Delete the config and the test files. |

---

## Architecture

Follows the existing per-mode structure rather than abstracting across modes.
Each mode keeps its own lib (pure functions, `localStorage` I/O) and its own
component (UI, React state). One new shared module holds only what is genuinely
shared: money formatting.

```
src/lib/money.ts          NEW   formatMoney, formatMoneySigned
src/lib/winCount.ts       NEW   Win Count model + points + money
src/lib/tienLenScore.ts   EDIT  + moneyRate config field, + money calcs
src/lib/hostScore.ts      EDIT  + moneyRate config field, + money calcs
src/components/WinCountScore.tsx   NEW
src/components/AddWinRoundModal.tsx NEW
src/components/ScoreTracking.tsx   EDIT  third sub-tab
src/components/TienLenScore.tsx    EDIT  money column, toggle, config input
src/components/HostScore.tsx       EDIT  money column, toggle, config input
src/styles/site.css                EDIT  money column + toggle styles
```

### Why not a generic `ScoreMode` interface

Considered and rejected. The three Add-Round modals are structurally different
(`AddRoundModal.tsx` is 378 lines of ranking / catch / last-card entry;
Win Count's is a radio grid). A shared interface would leak immediately, and the
refactor would put ~1,400 lines of working code at risk for no user-visible
gain.

---

## Win Count mode

### Model

```ts
// src/lib/winCount.ts
export interface WinCountConfig {
  betAmount: number;   // money each loser pays the winner per round; default 0
}

export interface WinCountRound {
  winnerId: string;
  configSnapshot?: WinCountConfig;
}

export interface Player {
  id: string;
  name: string;
}

export interface WinCountGame {
  id: string;
  players: Player[];       // 2–10
  config: WinCountConfig;
  rounds: WinCountRound[];
  createdAt: number;
}
```

`Player` is declared locally rather than imported. `tienLenScore.ts` and
`hostScore.ts` each already declare an identical `Player`, and keeping the libs
free of cross-imports preserves their independence. Hoisting the three into one
shared type is a tidy-up worth doing on its own, not as a rider on this change.

Storage key: `liarbar-card-score-wincount`.

### Scoring

For a round with `n` players in the game:

- **Points** — winner `+1`, every other player `0`. Total score is rounds won.
- **Money** — winner `+(n − 1) × bet`, every other player `−bet`.

Money is zero-sum by construction: `(n − 1) × bet − (n − 1) × bet = 0`.

Worked example, 6 players, `betAmount = 5000`: the winner gains `25,000`, the
five losers lose `5,000` each.

`n` is the number of players in the game, taken at calculation time. Player
rosters are fixed at game creation, so this is stable across a session.

### Exported functions

Mirrors `hostScore.ts` so the component code reads the same way:

```ts
createWinCountGame(playerNames: string[]): WinCountGame
calcWinCountRoundPoints(round, config, playerIds): Record<string, number>
calcWinCountRoundMoney(round, config, playerIds): Record<string, number>
calcWinCountTotalScores(game): Record<string, number>
calcWinCountTotalMoney(game): Record<string, number>
loadWinCountGame(): WinCountGame | null
saveWinCountGame(game): void
addWinCountRound(game, round): WinCountGame
updateWinCountRound(game, index, round): WinCountGame
removeWinCountRound(game, index): WinCountGame
resetWinCountGame(game): WinCountGame
```

`add`/`update` stamp `configSnapshot: game.config` exactly as `addHostRound`
does today.

### UI

Reuses the Host layout and its existing CSS classes throughout.

- **New game form** — player count select (2–10) plus name inputs. Same shape as
  `HostNewGameForm`, narrower range.
- **Scoreboard** — Player / Score / Money, sorted by score descending. The
  money column follows the shared visibility predicate defined under
  [When money surfaces are shown](#when-money-surfaces-are-shown), reading
  `betAmount` in place of `moneyRate`.
- **Add Round modal** (`AddWinRoundModal.tsx`) — a radio grid of player names,
  one tap to pick the winner, Save. Reused for editing, pre-selected with the
  existing winner.
- **Round history table** — one row per round, newest first, matching
  `HostRoundHistoryTable` including the edit and delete buttons.
- **Round detail modal** — winner name plus per-player points and money.
- **Config modal** — a single bet input with a live preview line
  (`5000 → winner of a 6-player round gets +25,000`).

---

## Money layer

### `src/lib/money.ts`

```ts
export function formatMoney(n: number): string        // 25000 -> "25,000"
export function formatMoneySigned(n: number): string  // -5000 -> "-5,000"
                                                      //  25000 -> "+25,000"
```

Grouping uses `Number.prototype.toLocaleString('en-US')` so the separator is a
comma regardless of the viewer's locale, matching the requested `10,000` format.
`formatMoneySigned(0)` returns `"0"` with no sign.

Amounts are raw currency values, not thousands. Entering `5000` means five
thousand. There is no hidden multiplier and no currency symbol.

### Rate configuration

`moneyRate: number` (default `0`) is added to `TienLenConfig` and to
`HostConfig`. Win Count uses its `betAmount` field for the same role.

For Tiến lên and Host, money is a straight multiple of the points already
computed:

```
money[playerId] = points[playerId] × rate
```

This is correct for both because both are already zero-sum point systems, so
scaling preserves the zero sum. Win Count is the exception — its points are a
win counter rather than a zero-sum transfer — which is why it computes money
directly rather than by scaling points, and why money lives per-mode instead of
in one shared multiply.

### Backward compatibility

Two hazards, both found by reading the current code.

**1. `migrateConfig` whitelists keys.** `src/lib/tienLenScore.ts:218` rebuilds
the config field by field from a fixed list. A `moneyRate` not added to that
list is silently stripped on every load, so the rate would appear to save and
then vanish on refresh. `moneyRate: c.moneyRate ?? DEFAULT_CONFIG.moneyRate`
must be added there. `hostScore.ts` has no migrate function; `loadHostGame`
gets the same `?? 0` defaulting inline.

**2. Legacy rounds have no `moneyRate` in their snapshot.** `migrateRound`
(`src/lib/tienLenScore.ts:146`) passes `configSnapshot` through untouched and
must continue to — running `migrateConfig` over the snapshot would inject
`moneyRate: 0` into every historical round and destroy the distinction below.

All money reads therefore use:

```ts
const rate = round.configSnapshot?.moneyRate ?? config.moneyRate ?? 0;
```

Which produces the intended behaviour:

- A round recorded **before** this feature has no `moneyRate` key in its
  snapshot, so it falls through to the current config. Setting a rate on an
  existing game prices its whole history, which is what someone who has been
  tracking points all evening and then decides to settle up expects.
- A round recorded **after** this feature always carries an explicit
  `moneyRate`, even `0`, so it keeps its own rate. Changing the rate mid-game
  affects only future rounds — consistent with how `configSnapshot` already
  governs points.

### Where money is displayed

| Surface | Treatment |
|---|---|
| Scoreboard | Money column beside Score. |
| Round history table | A Points ⇄ Money toggle above the table switches what the per-player cells show. |
| Round detail modal | Points and money shown together, side by side. |
| Config modal | Rate input with a live worked-example preview. Always visible. |

The history table toggles rather than showing both because with 10 players it
already carries 10 player columns plus `#` and actions; doubling that is
unreadable on a phone. The toggle is component-local state and defaults to
Points.

### When money surfaces are shown

Every money surface except the config input is governed by one predicate:

```ts
const showMoney = config.moneyRate !== 0
  || game.rounds.some((r) => (r.configSnapshot?.moneyRate ?? config.moneyRate ?? 0) !== 0);
```

Not simply `config.moneyRate !== 0`. Because post-feature rounds keep their own
snapshot rate, a player can record ten priced rounds and then set the rate back
to `0` — under the simpler rule the money they are owed would disappear from
the screen while still being real. The predicate above keeps it visible.

For a game that has never had a rate set, `showMoney` is `false` and every money
surface is absent, so the UI is what it is today for anyone not playing for
money.

---

## Testing

The repository currently has no test runner and no test files. The money and
points functions are pure functions over plain objects, and a silent error in
them costs real money at the table, so they are worth covering.

Add `vitest` as a dev dependency with a `npm test` script and no environment
config (these are pure functions; no DOM needed).

Cases to cover:

- **Win Count points** — winner gets 1, others 0; totals equal rounds won.
- **Win Count money** — 6 players at `5000` gives winner `+25,000` and each
  loser `−5,000`; the round sums to zero.
- **Win Count edge** — 2 players; a `betAmount` of `0` yields all zeros.
- **Tiến lên / Host money** — money equals points times rate; each round sums
  to zero.
- **Snapshot precedence** — a round whose snapshot carries `moneyRate: 1000`
  keeps `1000` after the game config changes to `5000`.
- **Legacy fallback** — a round whose snapshot has no `moneyRate` key is priced
  at the current config rate.
- **`migrateConfig` round-trip** — a config carrying `moneyRate` survives
  `migrateConfig` unchanged. This is the regression test for hazard 1.
- **Formatting** — `25000 → "25,000"`, `−5000 → "-5,000"`, `0 → "0"`.

UI is verified manually in the browser: create a game in each of the three
modes, add rounds, set a rate, toggle the history view, edit and delete a round,
and reload to confirm persistence.

## Risks

- **Regression in two working modes.** Tiến lên and Host are edited, not just
  extended. Mitigated by keeping every money surface behind a non-zero rate, so
  the default path through both components is unchanged.
- **Table width on mobile.** 10 players plus `#` and actions is at the width
  budget. The existing `.host-round-table-wrap` already scrolls horizontally and
  Win Count reuses it.
