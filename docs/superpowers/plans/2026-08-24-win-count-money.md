# Win Count Mode + Money Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a third Card Score mode (2–10 players, one winner per round, winner scores 1 point) and a money column across all three Card Score modes driven by a configurable per-round rate.

**Architecture:** Each score mode keeps its own pure-logic lib in `src/lib/` and its own component in `src/components/`, following the existing `hostScore.ts` / `HostScore.tsx` pairing. One new shared module, `src/lib/money.ts`, owns money formatting, rate resolution, and the points→money scaling used by the two existing zero-sum modes. Win Count computes money directly instead of scaling, because its points are a win counter rather than a zero-sum transfer.

**Tech Stack:** React 19, TypeScript 5.8, Vite 7, Tailwind 4 (the Card Score UI is hand-written CSS in `src/styles/site.css`, not Tailwind), vitest (added by Task 1), `localStorage` for all persistence.

**Spec:** `docs/superpowers/specs/2026-08-24-card-score-win-mode-design.md`

## Global Constraints

- **No backend.** Everything is client-side and persists to `localStorage`. No network calls.
- **`verbatimModuleSyntax: true`** (`tsconfig.app.json`). Every type-only import MUST use `import type { X } from '...'`. A plain `import { X }` for an interface fails the build.
- **`strict`, `noUnusedLocals`, `noUnusedParameters` are all on.** An unused variable or parameter fails `npm run build`.
- **`include: ["src"]`** in `tsconfig.app.json` — test files under `src/` are type-checked by `npm run build`. This is intended; it catches type errors in tests too.
- **Money amounts are raw currency values, not thousands.** `5000` means five thousand. No hidden multiplier, no currency symbol.
- **Money display format** uses `toLocaleString('en-US')` so the group separator is always a comma (`25000` → `"25,000"`), independent of the viewer's locale.
- **Default rate is `0`** everywhere (`moneyRate` for Tiến lên and Host, `betAmount` for Win Count).
- **Never regress the zero-rate path.** With no rate ever set, all three modes must render exactly as they do today.
- **Win Count player range is 2–10.** Tiến lên (2–4) and Host (2–20) ranges are unchanged.
- **Existing storage keys are unchanged:** `liarbar-card-score-tienlen`, `liarbar-card-score-host`. Win Count adds `liarbar-card-score-wincount`.
- **`git commit` messages** follow the repo's existing `feat:` / `fix:` / `docs:` prefix convention.

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `src/lib/money.ts` | Create | Money formatting, rate resolution, points→money scaling, money-visibility predicate. No game knowledge. |
| `src/lib/money.test.ts` | Create | Unit tests for the above. |
| `src/lib/winCount.ts` | Create | Win Count model, points, money, `localStorage` I/O, round add/edit/remove. |
| `src/lib/winCount.test.ts` | Create | Unit tests for the above. |
| `src/lib/tienLenScore.ts` | Modify | Add optional `moneyRate` to config, passthrough in `migrateConfig`, `calcTotalMoney`. |
| `src/lib/tienLenScore.test.ts` | Create | Money + `migrateConfig` regression tests. |
| `src/lib/hostScore.ts` | Modify | Add optional `moneyRate` to config, `calcHostTotalMoney`. |
| `src/lib/hostScore.test.ts` | Create | Money tests. |
| `src/components/AddWinRoundModal.tsx` | Create | Winner-picker modal (radio grid), used for both add and edit. |
| `src/components/WinCountScore.tsx` | Create | Win Count screen: new-game form, scoreboard, history, detail modal, config modal. |
| `src/components/ScoreTracking.tsx` | Modify | Third sub-tab. |
| `src/components/HostScore.tsx` | Modify | Money column, Points⇄Money toggle, money in detail modal, rate input. |
| `src/components/TienLenScore.tsx` | Modify | Same four money surfaces. |
| `src/styles/site.css` | Modify | Money column, toggle, and winner-grid styles. |
| `package.json` | Modify | `vitest` devDependency + `test` script. |
| `README.md` | Modify | Document the new mode and money. |

Tasks 1–4 are pure logic and fully unit-tested. Tasks 5–7 are UI and verified by `npm run build` plus a scripted browser pass. Task 8 is documentation and a full-app regression sweep.

---

## Task 1: Money module + test runner

**Files:**
- Modify: `package.json`
- Create: `src/lib/money.ts`
- Test: `src/lib/money.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `formatMoney(n: number): string`
  - `formatMoneySigned(n: number): string`
  - `resolveMoneyRate(snapshotRate: number | undefined, currentRate: number | undefined): number`
  - `scalePointsToMoney(points: Record<string, number>, rate: number): Record<string, number>`
  - `shouldShowMoney(currentRate: number | undefined, roundRates: Array<number | undefined>): boolean`

**Why `resolveMoneyRate` exists:** rounds snapshot the config they were recorded under. A round recorded *before* this feature has no `moneyRate` key at all, so it must inherit the current rate — that is what makes "track points all evening, then set a bet and settle up" work. A round recorded *after* this feature always carries an explicit rate, even `0`, so it keeps its own. `undefined` is the load-bearing distinction between those two cases; never default it away at the migration layer.

- [ ] **Step 1: Install vitest and add the test script**

```bash
npm install -D vitest
```

Then edit `package.json` and add a `test` script alongside the existing ones:

```json
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "lint": "eslint .",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
```

No vitest config file is needed. These are pure functions with no DOM, and vitest's defaults already discover `**/*.test.ts`.

- [ ] **Step 2: Verify the runner starts**

Run: `npm test`
Expected: vitest starts and reports `No test files found` (exit code may be non-zero — that is fine at this point, we only need to see vitest itself run).

- [ ] **Step 3: Write the failing tests**

Create `src/lib/money.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  formatMoney,
  formatMoneySigned,
  resolveMoneyRate,
  scalePointsToMoney,
  shouldShowMoney,
} from './money';

describe('formatMoney', () => {
  it('groups thousands with commas', () => {
    expect(formatMoney(25000)).toBe('25,000');
    expect(formatMoney(10000)).toBe('10,000');
    expect(formatMoney(1000000)).toBe('1,000,000');
  });

  it('leaves values under 1000 ungrouped', () => {
    expect(formatMoney(0)).toBe('0');
    expect(formatMoney(999)).toBe('999');
  });

  it('keeps the minus sign on negatives', () => {
    expect(formatMoney(-5000)).toBe('-5,000');
  });

  it('rounds fractional amounts', () => {
    expect(formatMoney(2500.4)).toBe('2,500');
    expect(formatMoney(2500.6)).toBe('2,501');
  });
});

describe('formatMoneySigned', () => {
  it('prefixes a plus on positives', () => {
    expect(formatMoneySigned(25000)).toBe('+25,000');
  });

  it('keeps the minus on negatives without doubling it', () => {
    expect(formatMoneySigned(-5000)).toBe('-5,000');
  });

  it('renders zero without a sign', () => {
    expect(formatMoneySigned(0)).toBe('0');
    expect(formatMoneySigned(-0)).toBe('0');
  });
});

describe('resolveMoneyRate', () => {
  it('prefers the snapshot rate when the round has one', () => {
    expect(resolveMoneyRate(1000, 5000)).toBe(1000);
  });

  it('keeps an explicit snapshot rate of zero', () => {
    expect(resolveMoneyRate(0, 5000)).toBe(0);
  });

  it('falls back to the current rate for legacy rounds with no snapshot rate', () => {
    expect(resolveMoneyRate(undefined, 5000)).toBe(5000);
  });

  it('yields zero when neither is set', () => {
    expect(resolveMoneyRate(undefined, undefined)).toBe(0);
  });
});

describe('scalePointsToMoney', () => {
  it('multiplies every player by the rate', () => {
    expect(scalePointsToMoney({ a: 2, b: -1, c: -1 }, 1000)).toEqual({
      a: 2000,
      b: -1000,
      c: -1000,
    });
  });

  it('preserves the zero sum of a zero-sum point map', () => {
    const money = scalePointsToMoney({ a: 3, b: -2, c: -1 }, 5000);
    expect(Object.values(money).reduce((s, v) => s + v, 0)).toBe(0);
  });

  it('yields all zeros at a rate of zero', () => {
    expect(scalePointsToMoney({ a: 2, b: -2 }, 0)).toEqual({ a: 0, b: 0 });
  });
});

describe('shouldShowMoney', () => {
  it('is false for a game that never had a rate', () => {
    expect(shouldShowMoney(0, [undefined, undefined])).toBe(false);
    expect(shouldShowMoney(undefined, [])).toBe(false);
  });

  it('is true when the current rate is set', () => {
    expect(shouldShowMoney(5000, [])).toBe(true);
  });

  it('stays true when the rate was reset to zero but priced rounds exist', () => {
    expect(shouldShowMoney(0, [5000, 5000])).toBe(true);
  });

  it('is false when every recorded round was explicitly priced at zero', () => {
    expect(shouldShowMoney(0, [0, 0])).toBe(false);
  });

  it('is true when only some recorded rounds were priced', () => {
    expect(shouldShowMoney(0, [0, 5000, undefined])).toBe(true);
  });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Failed to resolve import "./money"`.

- [ ] **Step 5: Write the implementation**

Create `src/lib/money.ts`:

```ts
/**
 * Money helpers shared by all Card Score modes.
 *
 * Amounts are raw currency values, not thousands: 5000 means five thousand.
 * Formatting is pinned to en-US so the group separator is always a comma,
 * regardless of the viewer's locale.
 */

/** 25000 -> "25,000". Negatives keep their minus sign. */
export function formatMoney(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

/** 25000 -> "+25,000", -5000 -> "-5,000", 0 -> "0". */
export function formatMoneySigned(n: number): string {
  const rounded = Math.round(n);
  if (rounded === 0) return '0';
  return rounded > 0 ? `+${formatMoney(rounded)}` : formatMoney(rounded);
}

/**
 * Pick the rate a round should be priced at.
 *
 * `undefined` from a snapshot means the round predates the money feature, so
 * it inherits the current rate. An explicit 0 means the round was deliberately
 * recorded unpriced and keeps that. Do not collapse these two cases.
 */
export function resolveMoneyRate(
  snapshotRate: number | undefined,
  currentRate: number | undefined
): number {
  return snapshotRate ?? currentRate ?? 0;
}

/**
 * Money for the zero-sum modes (Tien len, Host), where money is simply the
 * points already computed, times the rate. Win Count does not use this: its
 * points are a win counter, not a transfer.
 */
export function scalePointsToMoney(
  points: Record<string, number>,
  rate: number
): Record<string, number> {
  const money: Record<string, number> = {};
  Object.entries(points).forEach(([id, pts]) => {
    money[id] = pts * rate;
  });
  return money;
}

/**
 * Whether to render money surfaces at all.
 *
 * Not just `currentRate !== 0`: because rounds keep their own snapshot rate,
 * a player can record priced rounds and then set the rate back to 0. Under the
 * simpler rule the money they are owed would vanish from the screen while
 * still being real.
 */
export function shouldShowMoney(
  currentRate: number | undefined,
  roundRates: Array<number | undefined>
): boolean {
  if ((currentRate ?? 0) !== 0) return true;
  return roundRates.some((r) => resolveMoneyRate(r, currentRate) !== 0);
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, all money tests green.

- [ ] **Step 7: Verify the build still passes**

Run: `npm run build`
Expected: exit 0. This confirms the new test file type-checks under `include: ["src"]`.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json src/lib/money.ts src/lib/money.test.ts
git commit -m "feat: add money formatting module and vitest test runner"
```

---

## Task 2: Win Count scoring library

**Files:**
- Create: `src/lib/winCount.ts`
- Test: `src/lib/winCount.test.ts`

**Interfaces:**
- Consumes: `resolveMoneyRate` from `src/lib/money.ts` (Task 1).
- Produces:
  - Types: `Player`, `WinCountConfig`, `WinCountRound`, `WinCountGame`
  - Constants: `DEFAULT_WIN_COUNT_CONFIG`, `MIN_WIN_COUNT_PLAYERS` (2), `MAX_WIN_COUNT_PLAYERS` (10)
  - `createWinCountGame(playerNames: string[]): WinCountGame`
  - `calcWinCountRoundPoints(round, config, playerIds): Record<string, number>`
  - `calcWinCountRoundMoney(round, config, playerIds): Record<string, number>`
  - `calcWinCountTotalScores(game): Record<string, number>`
  - `calcWinCountTotalMoney(game): Record<string, number>`
  - `loadWinCountGame(): WinCountGame | null`
  - `saveWinCountGame(game): void`
  - `addWinCountRound(game, round): WinCountGame`
  - `updateWinCountRound(game, index, round): WinCountGame`
  - `removeWinCountRound(game, index): WinCountGame`
  - `resetWinCountGame(game): WinCountGame`

`Player` is declared locally rather than imported from another lib. `tienLenScore.ts` and `hostScore.ts` each already declare an identical `Player`; keeping the libs free of cross-imports preserves their independence. Hoisting the three into one shared type is a tidy-up worth doing on its own, not as a rider on this change.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/winCount.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  createWinCountGame,
  calcWinCountRoundPoints,
  calcWinCountRoundMoney,
  calcWinCountTotalScores,
  calcWinCountTotalMoney,
  addWinCountRound,
  updateWinCountRound,
  removeWinCountRound,
  resetWinCountGame,
  DEFAULT_WIN_COUNT_CONFIG,
} from './winCount';
import type { WinCountGame } from './winCount';

function gameOf(names: string[], betAmount = 0): WinCountGame {
  const g = createWinCountGame(names);
  return { ...g, config: { betAmount } };
}

describe('createWinCountGame', () => {
  it('creates one player per name with unique ids', () => {
    const g = createWinCountGame(['Nam', 'Linh', 'Huy']);
    expect(g.players.map((p) => p.name)).toEqual(['Nam', 'Linh', 'Huy']);
    expect(new Set(g.players.map((p) => p.id)).size).toBe(3);
  });

  it('falls back to a numbered name for blank input', () => {
    const g = createWinCountGame(['Nam', '  ']);
    expect(g.players[1].name).toBe('Player 2');
  });

  it('clamps to at most 10 players', () => {
    const g = createWinCountGame(Array.from({ length: 14 }, (_, i) => `P${i + 1}`));
    expect(g.players).toHaveLength(10);
  });

  it('starts with no rounds and the default config', () => {
    const g = createWinCountGame(['A', 'B']);
    expect(g.rounds).toEqual([]);
    expect(g.config).toEqual(DEFAULT_WIN_COUNT_CONFIG);
    expect(DEFAULT_WIN_COUNT_CONFIG.betAmount).toBe(0);
  });
});

describe('calcWinCountRoundPoints', () => {
  it('gives the winner 1 and everyone else 0', () => {
    const g = gameOf(['A', 'B', 'C']);
    const ids = g.players.map((p) => p.id);
    const points = calcWinCountRoundPoints({ winnerId: ids[1] }, g.config, ids);
    expect(points).toEqual({ [ids[0]]: 0, [ids[1]]: 1, [ids[2]]: 0 });
  });

  it('gives everyone 0 when the winner is not in the game', () => {
    const g = gameOf(['A', 'B']);
    const ids = g.players.map((p) => p.id);
    const points = calcWinCountRoundPoints({ winnerId: 'ghost' }, g.config, ids);
    expect(points).toEqual({ [ids[0]]: 0, [ids[1]]: 0 });
  });
});

describe('calcWinCountRoundMoney', () => {
  it('pays the winner bet x number of losers, per the spec example', () => {
    const g = gameOf(['A', 'B', 'C', 'D', 'E', 'F'], 5000);
    const ids = g.players.map((p) => p.id);
    const money = calcWinCountRoundMoney({ winnerId: ids[0] }, g.config, ids);
    expect(money[ids[0]]).toBe(25000);
    ids.slice(1).forEach((id) => expect(money[id]).toBe(-5000));
  });

  it('sums to zero', () => {
    const g = gameOf(['A', 'B', 'C', 'D'], 5000);
    const ids = g.players.map((p) => p.id);
    const money = calcWinCountRoundMoney({ winnerId: ids[2] }, g.config, ids);
    expect(Object.values(money).reduce((s, v) => s + v, 0)).toBe(0);
  });

  it('handles the two-player case', () => {
    const g = gameOf(['A', 'B'], 5000);
    const ids = g.players.map((p) => p.id);
    const money = calcWinCountRoundMoney({ winnerId: ids[0] }, g.config, ids);
    expect(money).toEqual({ [ids[0]]: 5000, [ids[1]]: -5000 });
  });

  it('yields all zeros at a bet of zero', () => {
    const g = gameOf(['A', 'B', 'C'], 0);
    const ids = g.players.map((p) => p.id);
    const money = calcWinCountRoundMoney({ winnerId: ids[0] }, g.config, ids);
    expect(Object.values(money).every((v) => v === 0)).toBe(true);
  });

  it('prefers the round snapshot bet over the current config', () => {
    const g = gameOf(['A', 'B', 'C'], 5000);
    const ids = g.players.map((p) => p.id);
    const money = calcWinCountRoundMoney(
      { winnerId: ids[0], configSnapshot: { betAmount: 1000 } },
      g.config,
      ids
    );
    expect(money[ids[0]]).toBe(2000);
    expect(money[ids[1]]).toBe(-1000);
  });
});

describe('totals', () => {
  it('counts total score as rounds won', () => {
    let g = gameOf(['A', 'B', 'C'], 5000);
    const ids = g.players.map((p) => p.id);
    g = addWinCountRound(g, { winnerId: ids[0] });
    g = addWinCountRound(g, { winnerId: ids[0] });
    g = addWinCountRound(g, { winnerId: ids[1] });
    const scores = calcWinCountTotalScores(g);
    expect(scores).toEqual({ [ids[0]]: 2, [ids[1]]: 1, [ids[2]]: 0 });
  });

  it('accumulates money across rounds and stays zero-sum', () => {
    let g = gameOf(['A', 'B', 'C'], 5000);
    const ids = g.players.map((p) => p.id);
    g = addWinCountRound(g, { winnerId: ids[0] });
    g = addWinCountRound(g, { winnerId: ids[1] });
    const money = calcWinCountTotalMoney(g);
    expect(money[ids[0]]).toBe(10000 - 5000);
    expect(money[ids[1]]).toBe(-5000 + 10000);
    expect(money[ids[2]]).toBe(-10000);
    expect(Object.values(money).reduce((s, v) => s + v, 0)).toBe(0);
  });
});

describe('round mutations', () => {
  it('stamps the current config onto an added round', () => {
    const g = addWinCountRound(gameOf(['A', 'B'], 5000), { winnerId: 'x' });
    expect(g.rounds[0].configSnapshot).toEqual({ betAmount: 5000 });
  });

  it('re-stamps the current config when a round is edited', () => {
    let g = addWinCountRound(gameOf(['A', 'B'], 5000), { winnerId: 'x' });
    g = { ...g, config: { betAmount: 1000 } };
    g = updateWinCountRound(g, 0, { winnerId: 'y' });
    expect(g.rounds[0]).toEqual({ winnerId: 'y', configSnapshot: { betAmount: 1000 } });
  });

  it('removes a round by index and leaves others intact', () => {
    let g = gameOf(['A', 'B'], 0);
    g = addWinCountRound(g, { winnerId: 'a' });
    g = addWinCountRound(g, { winnerId: 'b' });
    g = removeWinCountRound(g, 0);
    expect(g.rounds).toHaveLength(1);
    expect(g.rounds[0].winnerId).toBe('b');
  });

  it('ignores an out-of-range index', () => {
    const g = addWinCountRound(gameOf(['A', 'B'], 0), { winnerId: 'a' });
    expect(removeWinCountRound(g, 9).rounds).toHaveLength(1);
    expect(updateWinCountRound(g, -1, { winnerId: 'z' }).rounds[0].winnerId).toBe('a');
  });

  it('clears rounds but keeps players and config on reset', () => {
    let g = gameOf(['A', 'B'], 5000);
    g = addWinCountRound(g, { winnerId: 'a' });
    const reset = resetWinCountGame(g);
    expect(reset.rounds).toEqual([]);
    expect(reset.players).toEqual(g.players);
    expect(reset.config).toEqual({ betAmount: 5000 });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test src/lib/winCount.test.ts`
Expected: FAIL — `Failed to resolve import "./winCount"`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/winCount.ts`:

```ts
import { resolveMoneyRate } from './money';

export interface Player {
  id: string;
  name: string;
}

export interface WinCountConfig {
  /** Money each loser pays the winner, per round. Raw currency, default 0. */
  betAmount: number;
}

export interface WinCountRound {
  winnerId: string;
  /** Config in force when the round was recorded; edits to config do not repice it. */
  configSnapshot?: WinCountConfig;
}

export interface WinCountGame {
  id: string;
  players: Player[];
  config: WinCountConfig;
  rounds: WinCountRound[];
  createdAt: number;
}

export const MIN_WIN_COUNT_PLAYERS = 2;
export const MAX_WIN_COUNT_PLAYERS = 10;

export const DEFAULT_WIN_COUNT_CONFIG: WinCountConfig = {
  betAmount: 0,
};

const STORAGE_KEY = 'liarbar-card-score-wincount';

function genId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function createWinCountGame(playerNames: string[]): WinCountGame {
  const names = playerNames.slice(0, MAX_WIN_COUNT_PLAYERS);
  return {
    id: genId(),
    players: names.map((name, i) => ({
      id: genId(),
      name: name.trim() || `Player ${i + 1}`,
    })),
    config: { ...DEFAULT_WIN_COUNT_CONFIG },
    rounds: [],
    createdAt: Date.now(),
  };
}

/** Winner scores 1; everyone else scores 0. */
export function calcWinCountRoundPoints(
  round: WinCountRound,
  _config: WinCountConfig,
  playerIds: string[]
): Record<string, number> {
  const points: Record<string, number> = {};
  playerIds.forEach((id) => (points[id] = id === round.winnerId ? 1 : 0));
  return points;
}

/**
 * Winner collects the bet from every other player; each loser pays one bet.
 * Zero-sum by construction: (n-1) * bet in, (n-1) * bet out.
 */
export function calcWinCountRoundMoney(
  round: WinCountRound,
  config: WinCountConfig,
  playerIds: string[]
): Record<string, number> {
  const bet = resolveMoneyRate(round.configSnapshot?.betAmount, config.betAmount);
  const money: Record<string, number> = {};
  playerIds.forEach((id) => (money[id] = 0));

  if (!playerIds.includes(round.winnerId)) return money;

  const losers = playerIds.filter((id) => id !== round.winnerId);
  money[round.winnerId] = losers.length * bet;
  losers.forEach((id) => (money[id] = -bet));
  return money;
}

function sumOverRounds(
  game: WinCountGame,
  calc: (
    round: WinCountRound,
    config: WinCountConfig,
    playerIds: string[]
  ) => Record<string, number>
): Record<string, number> {
  const totals: Record<string, number> = {};
  game.players.forEach((p) => (totals[p.id] = 0));
  const playerIds = game.players.map((p) => p.id);

  game.rounds.forEach((round) => {
    const perRound = calc(round, game.config, playerIds);
    Object.entries(perRound).forEach(([id, v]) => {
      totals[id] = (totals[id] ?? 0) + v;
    });
  });

  return totals;
}

export function calcWinCountTotalScores(game: WinCountGame): Record<string, number> {
  return sumOverRounds(game, calcWinCountRoundPoints);
}

export function calcWinCountTotalMoney(game: WinCountGame): Record<string, number> {
  return sumOverRounds(game, calcWinCountRoundMoney);
}

export function loadWinCountGame(): WinCountGame | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WinCountGame;
    if (!parsed.players?.length || !Array.isArray(parsed.rounds)) return null;
    if (!parsed.config) parsed.config = { ...DEFAULT_WIN_COUNT_CONFIG };
    return parsed;
  } catch {
    return null;
  }
}

export function saveWinCountGame(game: WinCountGame): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(game));
    }
  } catch {
    /* ignore */
  }
}

export function addWinCountRound(game: WinCountGame, round: WinCountRound): WinCountGame {
  return {
    ...game,
    rounds: [...game.rounds, { ...round, configSnapshot: game.config }],
  };
}

export function updateWinCountRound(
  game: WinCountGame,
  roundIndex: number,
  round: WinCountRound
): WinCountGame {
  if (roundIndex < 0 || roundIndex >= game.rounds.length) return game;
  const rounds = [...game.rounds];
  rounds[roundIndex] = { ...round, configSnapshot: game.config };
  return { ...game, rounds };
}

export function removeWinCountRound(game: WinCountGame, roundIndex: number): WinCountGame {
  if (roundIndex < 0 || roundIndex >= game.rounds.length) return game;
  return { ...game, rounds: game.rounds.filter((_, i) => i !== roundIndex) };
}

export function resetWinCountGame(game: WinCountGame): WinCountGame {
  return { ...game, rounds: [], id: genId(), createdAt: Date.now() };
}
```

Note the `_config` parameter name in `calcWinCountRoundPoints` — it is unused but kept for signature symmetry with `calcWinCountRoundMoney` so `sumOverRounds` can take either. `noUnusedParameters` allows a leading underscore.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test src/lib/winCount.test.ts`
Expected: PASS.

- [ ] **Step 5: Verify the build**

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/lib/winCount.ts src/lib/winCount.test.ts
git commit -m "feat: add Win Count scoring library"
```

---

## Task 3: Money in the Tien len library

**Files:**
- Modify: `src/lib/tienLenScore.ts` (interface at `:3`, `DEFAULT_CONFIG` at `:76`, `migrateConfig` at `:218`; add `calcTotalMoney` after `calcTotalScores` at `:309`)
- Test: `src/lib/tienLenScore.test.ts`

**Interfaces:**
- Consumes: `resolveMoneyRate`, `scalePointsToMoney` from `src/lib/money.ts` (Task 1).
- Produces: `TienLenConfig.moneyRate?: number`; `calcTotalMoney(game: TienLenGame): Record<string, number>`.

**The hazard this task exists to avoid.** `migrateConfig` rebuilds the config field by field from a fixed whitelist, so a `moneyRate` not added there is silently stripped on every load — the rate would appear to save, then vanish on refresh. But it must be added as a *passthrough*, never with a `?? DEFAULT_CONFIG.moneyRate` fallback, because `migrateConfig` is also run over `configSnapshot` at three calculation sites (`tienLenScore.ts:317`, `TienLenScore.tsx:332`, `TienLenScore.tsx:391`). Defaulting it to `0` there would inject `0` into every legacy snapshot at calculation time and permanently break the "set a bet, price the evening's history" behaviour. Both halves of that are covered by tests below.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/tienLenScore.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  createGame,
  migrateConfig,
  calcTotalScores,
  calcTotalMoney,
  DEFAULT_CONFIG,
} from './tienLenScore';
import type { TienLenGame, TienLenConfig, RoundResult } from './tienLenScore';

function fourPlayerGame(moneyRate: number): TienLenGame {
  const g = createGame(['A', 'B', 'C', 'D']);
  return { ...g, config: { ...g.config, moneyRate } };
}

/** A plain finish: order decides points, no catches, no last cards. */
function round(order: string[], snapshot?: TienLenConfig): RoundResult {
  return { order, catch: [], last: [], configSnapshot: snapshot };
}

describe('moneyRate config plumbing', () => {
  it('defaults to 0 on a new game', () => {
    expect(DEFAULT_CONFIG.moneyRate).toBe(0);
    expect(createGame(['A', 'B']).config.moneyRate).toBe(0);
  });

  it('survives migrateConfig instead of being stripped', () => {
    const migrated = migrateConfig({ ...DEFAULT_CONFIG, moneyRate: 5000 } as unknown as Record<string, unknown>);
    expect(migrated.moneyRate).toBe(5000);
  });

  it('leaves moneyRate undefined when the stored config has no such key', () => {
    const legacy = { ...DEFAULT_CONFIG } as Record<string, unknown>;
    delete legacy.moneyRate;
    expect(migrateConfig(legacy).moneyRate).toBeUndefined();
  });

  it('preserves an explicit rate of 0 rather than turning it undefined', () => {
    const migrated = migrateConfig({ ...DEFAULT_CONFIG, moneyRate: 0 } as unknown as Record<string, unknown>);
    expect(migrated.moneyRate).toBe(0);
  });
});

describe('calcTotalMoney', () => {
  it('is points times the rate', () => {
    const g = fourPlayerGame(1000);
    const ids = g.players.map((p) => p.id);
    const game: TienLenGame = { ...g, rounds: [round(ids, { ...g.config })] };

    const scores = calcTotalScores(game);
    const money = calcTotalMoney(game);
    ids.forEach((id) => expect(money[id]).toBe(scores[id] * 1000));
  });

  it('stays zero-sum', () => {
    const g = fourPlayerGame(1000);
    const ids = g.players.map((p) => p.id);
    const game: TienLenGame = { ...g, rounds: [round(ids, { ...g.config })] };
    expect(Object.values(calcTotalMoney(game)).reduce((s, v) => s + v, 0)).toBe(0);
  });

  it('is all zeros when no rate is set', () => {
    const g = fourPlayerGame(0);
    const ids = g.players.map((p) => p.id);
    const game: TienLenGame = { ...g, rounds: [round(ids, { ...g.config })] };
    expect(Object.values(calcTotalMoney(game)).every((v) => v === 0)).toBe(true);
  });

  it('keeps a rate the round was recorded at when the game rate later changes', () => {
    const g = fourPlayerGame(5000);
    const ids = g.players.map((p) => p.id);
    const game: TienLenGame = {
      ...g,
      rounds: [round(ids, { ...g.config, moneyRate: 1000 })],
    };
    const scores = calcTotalScores(game);
    const money = calcTotalMoney(game);
    ids.forEach((id) => expect(money[id]).toBe(scores[id] * 1000));
  });

  it('prices a legacy round with no snapshot rate at the current rate', () => {
    const g = fourPlayerGame(5000);
    const ids = g.players.map((p) => p.id);
    const legacySnapshot = { ...g.config } as Record<string, unknown>;
    delete legacySnapshot.moneyRate;

    const game: TienLenGame = {
      ...g,
      rounds: [round(ids, legacySnapshot as unknown as TienLenConfig)],
    };
    const scores = calcTotalScores(game);
    const money = calcTotalMoney(game);
    ids.forEach((id) => expect(money[id]).toBe(scores[id] * 5000));
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test src/lib/tienLenScore.test.ts`
Expected: FAIL — `calcTotalMoney is not a function` and `moneyRate` assertions failing.

- [ ] **Step 3: Add the config field**

In `src/lib/tienLenScore.ts`, add to the `TienLenConfig` interface (currently starting at `:3`), as the last field:

```ts
  /**
   * Money per point, raw currency. Optional on purpose: `undefined` marks a
   * round recorded before the money feature, which inherits the current rate.
   * See resolveMoneyRate in ./money.
   */
  moneyRate?: number;
```

Add to `DEFAULT_CONFIG` (currently starting at `:76`), as the last entry:

```ts
  moneyRate: 0,
```

- [ ] **Step 4: Add the passthrough to migrateConfig**

In `migrateConfig` (currently at `:218`), add as the last property of the returned object:

```ts
    // Deliberately NOT `?? DEFAULT_CONFIG.moneyRate`. migrateConfig also runs
    // over configSnapshot, and defaulting to 0 there would repice every legacy
    // round at zero forever.
    moneyRate: c.moneyRate,
```

- [ ] **Step 5: Add calcTotalMoney**

Add the import at the top of `src/lib/tienLenScore.ts`:

```ts
import { resolveMoneyRate, scalePointsToMoney } from './money';
```

Then add this function immediately after `calcTotalScores` (which ends at `:325`):

```ts
export function calcTotalMoney(game: TienLenGame): Record<string, number> {
  const totals: Record<string, number> = {};
  game.players.forEach((p) => (totals[p.id] = 0));
  const playerIds = game.players.map((p) => p.id);
  const config = migrateConfig(game.config as unknown as Record<string, unknown>);

  game.rounds.forEach((round) => {
    const migrated = migrateRound(round as unknown as Record<string, unknown>);
    const roundConfig = migrated.configSnapshot
      ? migrateConfig(migrated.configSnapshot as unknown as Record<string, unknown>)
      : config;
    const rate = resolveMoneyRate(roundConfig.moneyRate, config.moneyRate);
    const roundMoney = scalePointsToMoney(
      calcRoundPoints(migrated, roundConfig, playerIds),
      rate
    );
    Object.entries(roundMoney).forEach(([id, amount]) => {
      totals[id] = (totals[id] ?? 0) + amount;
    });
  });

  return totals;
}
```

This mirrors `calcTotalScores` exactly, including its `migrateRound` / `migrateConfig` handling, and differs only in scaling the result by the resolved rate.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm test src/lib/tienLenScore.test.ts`
Expected: PASS.

- [ ] **Step 7: Run the whole suite and the build**

Run: `npm test && npm run build`
Expected: all tests pass, build exits 0.

- [ ] **Step 8: Commit**

```bash
git add src/lib/tienLenScore.ts src/lib/tienLenScore.test.ts
git commit -m "feat: add money rate and total money to Tien len scoring"
```

---

## Task 4: Money in the Host library

**Files:**
- Modify: `src/lib/hostScore.ts` (`HostConfig` at `:6`, `DEFAULT_HOST_CONFIG` at `:34`; add `calcHostTotalMoney` after `calcHostTotalScores` at `:77`)
- Test: `src/lib/hostScore.test.ts`

**Interfaces:**
- Consumes: `resolveMoneyRate`, `scalePointsToMoney` from `src/lib/money.ts` (Task 1).
- Produces: `HostConfig.moneyRate?: number`; `calcHostTotalMoney(game: HostGame): Record<string, number>`.

**Note on the existing `betAmount` field.** `HostConfig.betAmount` already exists and is *points per bet*, not money — its UI label at `HostScore.tsx:434` already reads "Points per bet". It is left exactly as is. `moneyRate` is a separate, new field. Do not rename or repurpose `betAmount`; doing so would silently change the scores of every saved Host game.

`hostScore.ts` has no `migrateConfig` equivalent, so no whitelist hazard here. A stored game simply has `moneyRate === undefined`, which `resolveMoneyRate` handles.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/hostScore.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  createHostGame,
  calcHostTotalScores,
  calcHostTotalMoney,
  addHostRound,
  DEFAULT_HOST_CONFIG,
} from './hostScore';
import type { HostGame, HostRoundResult } from './hostScore';

function hostGame(moneyRate: number): HostGame {
  const g = createHostGame(['Host', 'B', 'C']);
  return { ...g, config: { ...g.config, moneyRate } };
}

/** Host wins against both players at 1x. */
function sweepRound(hostId: string, otherIds: string[]): HostRoundResult {
  const results: HostRoundResult['results'] = {};
  otherIds.forEach((id) => (results[id] = { result: 'lose', multiplier: 1 }));
  return { hostId, results };
}

describe('moneyRate config plumbing', () => {
  it('defaults to 0 and leaves betAmount alone', () => {
    expect(DEFAULT_HOST_CONFIG.moneyRate).toBe(0);
    expect(DEFAULT_HOST_CONFIG.betAmount).toBe(1);
  });
});

describe('calcHostTotalMoney', () => {
  it('is points times the rate', () => {
    const g = hostGame(1000);
    const [hostId, ...others] = g.players.map((p) => p.id);
    const game = addHostRound(g, sweepRound(hostId, others));

    const scores = calcHostTotalScores(game);
    const money = calcHostTotalMoney(game);
    expect(scores[hostId]).toBe(2);
    game.players.forEach((p) => expect(money[p.id]).toBe(scores[p.id] * 1000));
  });

  it('stays zero-sum', () => {
    const g = hostGame(1000);
    const [hostId, ...others] = g.players.map((p) => p.id);
    const game = addHostRound(g, sweepRound(hostId, others));
    expect(Object.values(calcHostTotalMoney(game)).reduce((s, v) => s + v, 0)).toBe(0);
  });

  it('is all zeros when no rate is set', () => {
    const g = hostGame(0);
    const [hostId, ...others] = g.players.map((p) => p.id);
    const game = addHostRound(g, sweepRound(hostId, others));
    expect(Object.values(calcHostTotalMoney(game)).every((v) => v === 0)).toBe(true);
  });

  it('keeps the rate a round was recorded at when the game rate later changes', () => {
    const g = hostGame(1000);
    const [hostId, ...others] = g.players.map((p) => p.id);
    const recorded = addHostRound(g, sweepRound(hostId, others));
    const repriced: HostGame = { ...recorded, config: { ...recorded.config, moneyRate: 9000 } };

    const scores = calcHostTotalScores(repriced);
    const money = calcHostTotalMoney(repriced);
    repriced.players.forEach((p) => expect(money[p.id]).toBe(scores[p.id] * 1000));
  });

  it('prices a legacy round with no snapshot rate at the current rate', () => {
    const g = hostGame(5000);
    const [hostId, ...others] = g.players.map((p) => p.id);
    const legacySnapshot = { betAmount: g.config.betAmount };
    const game: HostGame = {
      ...g,
      rounds: [{ ...sweepRound(hostId, others), configSnapshot: legacySnapshot }],
    };

    const scores = calcHostTotalScores(game);
    const money = calcHostTotalMoney(game);
    game.players.forEach((p) => expect(money[p.id]).toBe(scores[p.id] * 5000));
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test src/lib/hostScore.test.ts`
Expected: FAIL — `calcHostTotalMoney is not a function`.

- [ ] **Step 3: Add the config field**

In `src/lib/hostScore.ts`, add to the `HostConfig` interface (currently at `:6`):

```ts
export interface HostConfig {
  /** Points per bet. Pre-existing; this is points, not money. */
  betAmount: number;
  /**
   * Money per point, raw currency. Optional on purpose: `undefined` marks a
   * round recorded before the money feature, which inherits the current rate.
   */
  moneyRate?: number;
}
```

Add to `DEFAULT_HOST_CONFIG` (currently at `:34`):

```ts
export const DEFAULT_HOST_CONFIG: HostConfig = {
  betAmount: 1,
  moneyRate: 0,
};
```

- [ ] **Step 4: Add calcHostTotalMoney**

Add the import at the top of `src/lib/hostScore.ts`:

```ts
import { resolveMoneyRate, scalePointsToMoney } from './money';
```

Then add this immediately after `calcHostTotalScores` (which ends at `:90`):

```ts
export function calcHostTotalMoney(game: HostGame): Record<string, number> {
  const totals: Record<string, number> = {};
  game.players.forEach((p) => (totals[p.id] = 0));
  const playerIds = game.players.map((p) => p.id);

  game.rounds.forEach((round) => {
    const rate = resolveMoneyRate(round.configSnapshot?.moneyRate, game.config.moneyRate);
    const roundMoney = scalePointsToMoney(
      calcHostRoundPoints(round, game.config, playerIds),
      rate
    );
    Object.entries(roundMoney).forEach(([id, amount]) => {
      totals[id] = (totals[id] ?? 0) + amount;
    });
  });

  return totals;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test src/lib/hostScore.test.ts`
Expected: PASS.

- [ ] **Step 6: Run the whole suite and the build**

Run: `npm test && npm run build`
Expected: all tests pass, build exits 0.

- [ ] **Step 7: Commit**

```bash
git add src/lib/hostScore.ts src/lib/hostScore.test.ts
git commit -m "feat: add money rate and total money to Host scoring"
```

---

## Task 5: Win Count UI

**Files:**
- Create: `src/components/AddWinRoundModal.tsx`
- Create: `src/components/WinCountScore.tsx`
- Modify: `src/components/ScoreTracking.tsx`
- Modify: `src/styles/site.css`

**Interfaces:**
- Consumes: everything exported by `src/lib/winCount.ts` (Task 2); `formatMoneySigned`, `shouldShowMoney` from `src/lib/money.ts` (Task 1).
- Produces: a `WinCountScore` default export mounted as the third Card Score sub-tab.

There are no unit tests in this task — the repo has no DOM test environment and adding one is out of scope. Verification is `npm run build` plus the scripted browser pass in Step 6.

`WinCountScore.tsx` deliberately mirrors the structure of `HostScore.tsx`, which the executor should read first as the reference for how these screens are wired.

- [ ] **Step 1: Create the Add Round modal**

Create `src/components/AddWinRoundModal.tsx`:

```tsx
import React, { useState } from 'react';
import type { Player, WinCountRound } from '../lib/winCount';

interface AddWinRoundModalProps {
  players: Player[];
  initialRound?: WinCountRound | null;
  onSave: (round: WinCountRound) => void;
  onClose: () => void;
}

const AddWinRoundModal: React.FC<AddWinRoundModalProps> = ({
  players,
  initialRound,
  onSave,
  onClose,
}) => {
  const [winnerId, setWinnerId] = useState<string>(initialRound?.winnerId ?? '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!winnerId) return;
    onSave({ winnerId });
  };

  return (
    <div
      className="score-modal-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="win-round-title"
    >
      <div className="score-modal" onClick={(e) => e.stopPropagation()}>
        <h2 id="win-round-title" className="score-modal-title">
          {initialRound ? 'Edit round' : 'Add round'}
        </h2>
        <form onSubmit={handleSubmit}>
          <fieldset className="win-winner-fieldset">
            <legend className="score-config-section-title">Who won?</legend>
            <div className="win-winner-grid">
              {players.map((p) => (
                <label
                  key={p.id}
                  className={`win-winner-option ${winnerId === p.id ? 'selected' : ''}`}
                >
                  <input
                    type="radio"
                    name="win-winner"
                    value={p.id}
                    checked={winnerId === p.id}
                    onChange={() => setWinnerId(p.id)}
                  />
                  <span>{p.name}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="score-modal-actions">
            <button type="button" className="score-btn score-btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="score-btn score-btn-primary" disabled={!winnerId}>
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddWinRoundModal;
```

- [ ] **Step 2: Create the Win Count screen**

Create `src/components/WinCountScore.tsx`:

```tsx
import React, { useState, useEffect, useCallback } from 'react';
import {
  loadWinCountGame,
  saveWinCountGame,
  createWinCountGame,
  resetWinCountGame,
  addWinCountRound,
  updateWinCountRound,
  removeWinCountRound,
  calcWinCountTotalScores,
  calcWinCountTotalMoney,
  calcWinCountRoundPoints,
  calcWinCountRoundMoney,
  DEFAULT_WIN_COUNT_CONFIG,
  MIN_WIN_COUNT_PLAYERS,
  MAX_WIN_COUNT_PLAYERS,
} from '../lib/winCount';
import type { WinCountGame, WinCountConfig, WinCountRound, Player } from '../lib/winCount';
import { formatMoney, formatMoneySigned, shouldShowMoney } from '../lib/money';
import AddWinRoundModal from './AddWinRoundModal';

type HistoryView = 'points' | 'money';

const WinCountScore: React.FC = () => {
  const [game, setGame] = useState<WinCountGame | null>(() => loadWinCountGame());
  const [showConfig, setShowConfig] = useState(false);
  const [showAddRound, setShowAddRound] = useState(false);
  const [showNewGameModal, setShowNewGameModal] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [configEdit, setConfigEdit] = useState<WinCountConfig>(DEFAULT_WIN_COUNT_CONFIG);
  const [roundToDelete, setRoundToDelete] = useState<number | null>(null);
  const [roundToEdit, setRoundToEdit] = useState<number | null>(null);
  const [selectedRoundIndex, setSelectedRoundIndex] = useState<number | null>(null);
  const [historyView, setHistoryView] = useState<HistoryView>('points');

  useEffect(() => {
    if (game) {
      saveWinCountGame(game);
      setConfigEdit(game.config);
    }
  }, [game]);

  const handleNewGame = useCallback((names: string[]) => {
    setGame(createWinCountGame(names));
    setShowConfig(true);
  }, []);

  const handleNewGameFromModal = useCallback((names: string[]) => {
    setGame(createWinCountGame(names));
    setShowNewGameModal(false);
    setShowConfig(true);
  }, []);

  const handleSaveRound = useCallback(
    (round: WinCountRound) => {
      if (!game) return;
      setGame(roundToEdit !== null ? updateWinCountRound(game, roundToEdit, round) : addWinCountRound(game, round));
      setShowAddRound(false);
      setRoundToEdit(null);
    },
    [game, roundToEdit]
  );

  const confirmRemoveRound = useCallback(() => {
    if (!game || roundToDelete === null) return;
    setGame(removeWinCountRound(game, roundToDelete));
    if (selectedRoundIndex !== null) {
      if (selectedRoundIndex === roundToDelete) setSelectedRoundIndex(null);
      else if (selectedRoundIndex > roundToDelete) setSelectedRoundIndex((i) => (i ?? 0) - 1);
    }
    setRoundToDelete(null);
  }, [game, roundToDelete, selectedRoundIndex]);

  const confirmResetScores = useCallback(() => {
    if (!game) return;
    setGame(resetWinCountGame(game));
    setShowResetConfirm(false);
  }, [game]);

  if (!game) {
    return <WinCountNewGameForm onSubmit={handleNewGame} />;
  }

  const scores = calcWinCountTotalScores(game);
  const money = calcWinCountTotalMoney(game);
  const sortedPlayers = [...game.players].sort((a, b) => (scores[b.id] ?? 0) - (scores[a.id] ?? 0));
  const showMoney = shouldShowMoney(
    game.config.betAmount,
    game.rounds.map((r) => r.configSnapshot?.betAmount)
  );

  return (
    <div className="wincount-score tienlen-score">
      <div className="score-header">
        <button type="button" className="score-btn score-btn-secondary" onClick={() => setShowConfig(true)}>
          Config
        </button>
        <button type="button" className="score-btn score-btn-secondary" onClick={() => setShowResetConfirm(true)}>
          Reset Scores
        </button>
        <button type="button" className="score-btn score-btn-secondary" onClick={() => setShowNewGameModal(true)}>
          New Game
        </button>
      </div>

      <div className="scoreboard">
        <h3 className="scoreboard-title">Scoreboard</h3>
        <div className="scoreboard-header">
          <span className="scoreboard-col-player">Player</span>
          <span className="scoreboard-col-score">Wins</span>
          {showMoney && <span className="scoreboard-col-money">Money</span>}
        </div>
        <div className="scoreboard-body">
          <table className="scoreboard-table">
            <colgroup>
              <col />
              <col />
              {showMoney && <col />}
            </colgroup>
            <tbody>
              {sortedPlayers.map((p) => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td className="scoreboard-value">{scores[p.id] ?? 0}</td>
                  {showMoney && (
                    <td className="scoreboard-value scoreboard-money">
                      {formatMoneySigned(money[p.id] ?? 0)}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <button
        type="button"
        className="score-btn score-btn-primary score-add-round-btn"
        onClick={() => {
          setRoundToEdit(null);
          setShowAddRound(true);
        }}
      >
        Add Round
      </button>

      {game.rounds.length > 0 && (
        <WinCountRoundHistoryTable
          game={game}
          showMoney={showMoney}
          historyView={historyView}
          onHistoryViewChange={setHistoryView}
          onRowClick={setSelectedRoundIndex}
          onEdit={(idx) => {
            setRoundToEdit(idx);
            setShowAddRound(true);
          }}
          onRemove={setRoundToDelete}
        />
      )}

      {showAddRound && (
        <AddWinRoundModal
          players={game.players}
          initialRound={roundToEdit !== null ? game.rounds[roundToEdit] : null}
          onSave={handleSaveRound}
          onClose={() => {
            setShowAddRound(false);
            setRoundToEdit(null);
          }}
        />
      )}

      {selectedRoundIndex !== null && game.rounds[selectedRoundIndex] && (
        <WinCountRoundDetailModal
          round={game.rounds[selectedRoundIndex]}
          roundIndex={selectedRoundIndex}
          players={game.players}
          gameConfig={game.config}
          showMoney={showMoney}
          onClose={() => setSelectedRoundIndex(null)}
        />
      )}

      {showConfig && (
        <WinCountConfigModal
          config={configEdit}
          playerCount={game.players.length}
          onChange={setConfigEdit}
          onSave={() => {
            setGame({ ...game, config: configEdit });
            setShowConfig(false);
          }}
          onClose={() => {
            setConfigEdit(game.config);
            setShowConfig(false);
          }}
        />
      )}

      {showResetConfirm && (
        <div className="score-modal-overlay" onClick={() => setShowResetConfirm(false)} role="dialog" aria-modal="true">
          <div className="score-modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="score-modal-title">Reset scores?</h2>
            <p className="score-round-detail-parts">This clears every round. Players and config stay.</p>
            <div className="score-modal-actions">
              <button type="button" className="score-btn score-btn-secondary" onClick={() => setShowResetConfirm(false)}>
                Cancel
              </button>
              <button type="button" className="score-btn score-btn-primary" onClick={confirmResetScores}>
                Reset
              </button>
            </div>
          </div>
        </div>
      )}

      {roundToDelete !== null && (
        <div className="score-modal-overlay" onClick={() => setRoundToDelete(null)} role="dialog" aria-modal="true">
          <div className="score-modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="score-modal-title">Delete round #{roundToDelete + 1}?</h2>
            <div className="score-modal-actions">
              <button type="button" className="score-btn score-btn-secondary" onClick={() => setRoundToDelete(null)}>
                Cancel
              </button>
              <button type="button" className="score-btn score-btn-primary" onClick={confirmRemoveRound}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {showNewGameModal && (
        <div className="score-modal-overlay" onClick={() => setShowNewGameModal(false)} role="dialog" aria-modal="true">
          <div className="score-modal" onClick={(e) => e.stopPropagation()}>
            <WinCountNewGameForm onSubmit={handleNewGameFromModal} onCancel={() => setShowNewGameModal(false)} />
          </div>
        </div>
      )}
    </div>
  );
};

interface WinCountNewGameFormProps {
  onSubmit: (names: string[]) => void;
  onCancel?: () => void;
}

const WinCountNewGameForm: React.FC<WinCountNewGameFormProps> = ({ onSubmit, onCancel }) => {
  const [playerCount, setPlayerCount] = useState(4);
  const [names, setNames] = useState<string[]>(() => Array(4).fill(''));

  const handlePlayerCountChange = (count: number) => {
    setPlayerCount(count);
    setNames((prev) => {
      const next = [...prev];
      while (next.length < count) next.push('');
      return next.slice(0, count);
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(names.slice(0, playerCount).map((n, i) => n.trim() || `Player ${i + 1}`));
  };

  const countOptions = Array.from(
    { length: MAX_WIN_COUNT_PLAYERS - MIN_WIN_COUNT_PLAYERS + 1 },
    (_, i) => i + MIN_WIN_COUNT_PLAYERS
  );

  return (
    <div className="tienlen-new-game">
      {!onCancel && <h3 className="scoreboard-title">New Game</h3>}
      <p className="score-new-game-hint">
        Enter player names ({MIN_WIN_COUNT_PLAYERS}–{MAX_WIN_COUNT_PLAYERS})
      </p>
      <div className="score-new-game-player-count">
        <span>Players:</span>
        <select
          value={playerCount}
          onChange={(e) => handlePlayerCountChange(Number(e.target.value))}
          className="score-input host-player-count-select"
        >
          {countOptions.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>
      <form onSubmit={handleSubmit} className="score-new-game-form host-new-game-form">
        {Array.from({ length: playerCount }, (_, i) => (
          <label key={i} className="score-new-game-label">
            <span>Player {i + 1}</span>
            <input
              type="text"
              value={names[i] ?? ''}
              onChange={(e) =>
                setNames((prev) => {
                  const next = [...prev];
                  next[i] = e.target.value;
                  return next;
                })
              }
              placeholder={`Player ${i + 1}`}
              maxLength={20}
              className="score-input"
            />
          </label>
        ))}
        <div className="score-new-game-actions">
          {onCancel && (
            <button type="button" className="score-btn score-btn-secondary" onClick={onCancel}>
              Cancel
            </button>
          )}
          <button type="submit" className="score-btn score-btn-primary">
            Start
          </button>
        </div>
      </form>
    </div>
  );
};

interface WinCountRoundHistoryTableProps {
  game: WinCountGame;
  showMoney: boolean;
  historyView: HistoryView;
  onHistoryViewChange: (v: HistoryView) => void;
  onRowClick: (index: number) => void;
  onEdit: (index: number) => void;
  onRemove: (index: number) => void;
}

const WinCountRoundHistoryTable: React.FC<WinCountRoundHistoryTableProps> = ({
  game,
  showMoney,
  historyView,
  onHistoryViewChange,
  onRowClick,
  onEdit,
  onRemove,
}) => {
  const players = game.players;
  const playerIds = players.map((p) => p.id);
  const getName = (id: string) => players.find((p) => p.id === id)?.name ?? '?';
  const viewingMoney = showMoney && historyView === 'money';

  return (
    <div className="score-round-history host-round-history">
      <div className="score-history-head">
        <h3 className="scoreboard-title">Round history</h3>
        {showMoney && (
          <div className="score-view-toggle" role="group" aria-label="History view">
            <button
              type="button"
              className={`score-view-toggle-btn ${historyView === 'points' ? 'active' : ''}`}
              onClick={() => onHistoryViewChange('points')}
              aria-pressed={historyView === 'points'}
            >
              Points
            </button>
            <button
              type="button"
              className={`score-view-toggle-btn ${historyView === 'money' ? 'active' : ''}`}
              onClick={() => onHistoryViewChange('money')}
              aria-pressed={historyView === 'money'}
            >
              Money
            </button>
          </div>
        )}
      </div>
      <div className="score-round-table-wrap host-round-table-wrap">
        <table className="score-round-table host-round-table">
          <thead>
            <tr>
              <th>#</th>
              <th className="host-col-host">Winner</th>
              {players.map((p) => (
                <th key={p.id}>{p.name}</th>
              ))}
              <th className="score-round-table-actions"></th>
            </tr>
          </thead>
          <tbody>
            {[...game.rounds.keys()].reverse().map((idx) => {
              const round = game.rounds[idx];
              const values = viewingMoney
                ? calcWinCountRoundMoney(round, game.config, playerIds)
                : calcWinCountRoundPoints(round, game.config, playerIds);
              return (
                <tr
                  key={idx}
                  className="score-round-table-row"
                  onClick={() => onRowClick(idx)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && onRowClick(idx)}
                >
                  <td className="score-round-num">{idx + 1}</td>
                  <td className="host-col-host host-host-name">{getName(round.winnerId)}</td>
                  {playerIds.map((id) => (
                    <td key={id} className="score-round-point">
                      {viewingMoney
                        ? formatMoneySigned(values[id] ?? 0)
                        : `${(values[id] ?? 0) >= 0 ? '+' : ''}${values[id] ?? 0}`}
                    </td>
                  ))}
                  <td className="score-round-table-actions">
                    <div className="score-round-actions-wrap">
                      <button
                        type="button"
                        className="score-round-edit"
                        onClick={(e) => {
                          e.stopPropagation();
                          onEdit(idx);
                        }}
                        aria-label="Edit round"
                        title="Edit"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      </button>
                      <button
                        type="button"
                        className="score-round-remove"
                        onClick={(e) => {
                          e.stopPropagation();
                          onRemove(idx);
                        }}
                        aria-label="Remove round"
                      >
                        ×
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

interface WinCountRoundDetailModalProps {
  round: WinCountRound;
  roundIndex: number;
  players: Player[];
  gameConfig: WinCountConfig;
  showMoney: boolean;
  onClose: () => void;
}

const WinCountRoundDetailModal: React.FC<WinCountRoundDetailModalProps> = ({
  round,
  roundIndex,
  players,
  gameConfig,
  showMoney,
  onClose,
}) => {
  const playerIds = players.map((p) => p.id);
  const getName = (id: string) => players.find((p) => p.id === id)?.name ?? '?';
  const points = calcWinCountRoundPoints(round, gameConfig, playerIds);
  const money = calcWinCountRoundMoney(round, gameConfig, playerIds);

  return (
    <div className="score-modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="win-detail-title">
      <div className="score-modal" onClick={(e) => e.stopPropagation()}>
        <h2 id="win-detail-title" className="score-modal-title">
          Round #{roundIndex + 1} details
        </h2>
        <div className="score-round-detail-summary">
          <h3 className="score-config-section-title">Winner</h3>
          <p className="score-round-detail-parts">{getName(round.winnerId)}</p>
        </div>
        <div className="score-round-detail-points">
          {playerIds.map((id) => (
            <div key={id} className="score-round-detail-row">
              <span>{getName(id)}</span>
              <span className="scoreboard-value">
                {(points[id] ?? 0) >= 0 ? '+' : ''}
                {points[id] ?? 0}
                {showMoney && (
                  <span className="scoreboard-money"> {formatMoneySigned(money[id] ?? 0)}</span>
                )}
              </span>
            </div>
          ))}
        </div>
        <div className="score-modal-actions">
          <button type="button" className="score-btn score-btn-primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

interface WinCountConfigModalProps {
  config: WinCountConfig;
  playerCount: number;
  onChange: (c: WinCountConfig) => void;
  onSave: () => void;
  onClose: () => void;
}

const WinCountConfigModal: React.FC<WinCountConfigModalProps> = ({
  config,
  playerCount,
  onChange,
  onSave,
  onClose,
}) => {
  const bet = config.betAmount ?? 0;
  const winnerTakes = bet * Math.max(0, playerCount - 1);

  return (
    <div className="score-modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="win-config-title">
      <div className="score-modal score-config-modal" onClick={(e) => e.stopPropagation()}>
        <h2 id="win-config-title" className="score-modal-title">Config</h2>
        <section className="score-config-section">
          <h3 className="score-config-section-title">Money</h3>
          <label className="host-config-label">
            <span>Bet per loser</span>
            <input
              type="number"
              min={0}
              step={1000}
              value={bet}
              onChange={(e) => onChange({ ...config, betAmount: Math.max(0, Number(e.target.value) || 0) })}
              className="score-input"
            />
          </label>
          <p className="score-config-preview">
            {bet === 0
              ? 'No money tracked. Set a bet to settle up in cash.'
              : `${formatMoney(bet)} → winner of a ${playerCount}-player round gets ${formatMoneySigned(winnerTakes)}`}
          </p>
        </section>
        <div className="score-modal-actions">
          <button type="button" className="score-btn score-btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="score-btn score-btn-primary" onClick={onSave}>Save</button>
        </div>
      </div>
    </div>
  );
};

export default WinCountScore;
```

- [ ] **Step 3: Add the sub-tab**

In `src/components/ScoreTracking.tsx`, change the union type and add the tab. The file is 38 lines; the three edits are:

```tsx
import WinCountScore from './WinCountScore';

type ScoreSubMode = 'tienlen' | 'host' | 'wincount';
```

Add this button after the "Host" button in the `<nav>`:

```tsx
        <button
          type="button"
          className={`score-sub-tab ${subMode === 'wincount' ? 'active' : ''}`}
          onClick={() => setSubMode('wincount')}
          aria-current={subMode === 'wincount' ? 'true' : undefined}
        >
          Win Count
        </button>
```

And add to the content block:

```tsx
        {subMode === 'wincount' && <WinCountScore />}
```

- [ ] **Step 4: Add the styles**

Append to `src/styles/site.css`:

```css
/* Win Count winner picker */
.win-winner-fieldset{border:none;padding:0;margin:0 0 12px}
.win-winner-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:8px}
@media (min-width:480px){.win-winner-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
.win-winner-option{display:flex;align-items:center;gap:8px;padding:10px;border:1px solid #555;border-radius:4px;background:#2a2a2a;color:#ddd;cursor:pointer;font-size:13px;transition:border-color .15s,color .15s}
.win-winner-option:hover{border-color:#888;color:#fff}
.win-winner-option.selected{border-color:#d3a446;color:#d3a446}
.win-winner-option input{accent-color:#d3a446;flex-shrink:0}
.win-winner-option span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

/* Money column + history view toggle (shared by all three score modes) */
.scoreboard-col-money{text-align:right}
.scoreboard-money{color:#8fbf7f;white-space:nowrap}
.score-history-head{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}
.score-view-toggle{display:inline-flex;border:1px solid #555;border-radius:4px;overflow:hidden}
.score-view-toggle-btn{padding:4px 10px;border:none;background:transparent;color:#aaa;font-family:inherit;font-size:11px;cursor:pointer;transition:background .15s,color .15s}
.score-view-toggle-btn::before,.score-view-toggle-btn::after{display:none !important}
.score-view-toggle-btn:hover{color:#fff}
.score-view-toggle-btn.active{background:#d3a446;color:#1a1a1a}
.score-config-preview{margin:8px 0 0;font-size:11px;color:#aaa;line-height:1.5}
```

The money colour `#8fbf7f` is chosen to sit alongside the existing `#d3a446` accent without competing with it. Negative amounts inherit it too — the sign carries the meaning, matching how the points columns already work.

- [ ] **Step 5: Verify the build and lint**

Run: `npm run build && npm run lint`
Expected: both exit 0.

- [ ] **Step 6: Verify in the browser**

Run: `npm run dev`, open http://localhost:5173, go to the **Card Score** tab.

**Round pricing in this mode.** Win Count is brand new, so every round it will
ever record carries an explicit `betAmount` snapshot — including `0`. That means
setting a bet does **not** retroactively price rounds already recorded, unlike
the legacy-round case in Tiến lên and Host. This is the same rule that already
governs points: a round keeps the config it was played under. The config modal
opens automatically on new game precisely so the bet gets set before play. The
checks below verify that behaviour rather than assuming retroactive pricing.

**Part A — no money**

1. A third sub-tab **Win Count** appears after "Host".
2. It opens on the New Game form; the player select offers 2 through 10 only.
3. Start a 6-player game. The Config modal opens automatically. Leave the bet at `0` and Cancel.
4. The scoreboard lists all six players with 0 wins and **no Money column**.
5. Add Round opens a radio grid of six names. Save is disabled until one is picked.
6. Pick a winner and save. The scoreboard shows 1 win for them; the history shows one row and **no Points ⇄ Money toggle**.

**Part B — money set before play**

7. Open Config and set **Bet per loser** to `5000`. The preview reads `5,000 → winner of a 6-player round gets +25,000`. Save.
8. The Money column appears, because the current rate is non-zero. The round from step 6 was recorded at a bet of `0`, so every player still reads `0` for it — confirm that, it is the snapshot rule working, not a bug.
9. Add a second round with a different winner. The scoreboard now shows that winner at `+25,000` and the other five at `-5,000`.
10. The **Points ⇄ Money** toggle now appears above the history. Switching to Money shows comma-formatted signed amounts (round 1 all `0`, round 2 `+25,000` / `-5,000`); switching back shows points.
11. Click a history row: the detail modal shows the winner and per-player points with money beside them.

**Part C — editing, persistence, and no regressions**

12. Edit round 2 via the pencil icon: the modal opens with the existing winner preselected; changing it moves the win and the money to the new winner.
13. Delete a round via ×; confirm the dialog, and that the row and its money go.
14. Set the bet back to `0`. The Money column must **stay visible**, because a priced round still exists.
15. Reload the page: players, rounds, and bet all persist.
16. Reset Scores clears rounds but keeps the players and the bet. With no rounds left and a bet of `0`, the Money column disappears again.
17. Switch to the Vietnamese 13 and Host sub-tabs and confirm they are visually unchanged (they gain money surfaces in Tasks 6 and 7, not this one).

Fix anything that fails before committing.

- [ ] **Step 7: Commit**

```bash
git add src/components/AddWinRoundModal.tsx src/components/WinCountScore.tsx src/components/ScoreTracking.tsx src/styles/site.css
git commit -m "feat: add Win Count score mode UI"
```

---

## Task 6: Money UI in Host mode

**Files:**
- Modify: `src/components/HostScore.tsx` (scoreboard at `:101-121`, history table at `~:300-365`, detail modal at `~:370-415`, config modal at `~:420-450`)

**Interfaces:**
- Consumes: `calcHostTotalMoney` (Task 4); `formatMoney`, `formatMoneySigned`, `shouldShowMoney`, `resolveMoneyRate`, `scalePointsToMoney` from `src/lib/money.ts` (Task 1).
- Produces: nothing consumed by later tasks.

Read `src/components/WinCountScore.tsx` (Task 5) first — the four money surfaces here are the same shapes and reuse the same CSS classes added in Task 5 Step 4.

- [ ] **Step 1: Add the imports**

At the top of `src/components/HostScore.tsx`, add `calcHostTotalMoney` to the existing `../lib/hostScore` import list, then add:

```tsx
import { formatMoney, formatMoneySigned, shouldShowMoney, resolveMoneyRate, scalePointsToMoney } from '../lib/money';
```

- [ ] **Step 2: Add the history view state**

Inside `HostScore`, alongside the other `useState` calls:

```tsx
  const [historyView, setHistoryView] = useState<'points' | 'money'>('points');
```

- [ ] **Step 3: Compute money and visibility**

Just below the existing `const scores = calcHostTotalScores(game);`:

```tsx
  const money = calcHostTotalMoney(game);
  const showMoney = shouldShowMoney(
    game.config.moneyRate,
    game.rounds.map((r) => r.configSnapshot?.moneyRate)
  );
```

- [ ] **Step 4: Add the scoreboard money column**

Replace the scoreboard header, colgroup, and row cells so they match this shape:

```tsx
        <div className="scoreboard-header">
          <span className="scoreboard-col-player">Player</span>
          <span className="scoreboard-col-score">Score</span>
          {showMoney && <span className="scoreboard-col-money">Money</span>}
        </div>
        <div className="scoreboard-body">
          <table className="scoreboard-table">
            <colgroup><col /><col />{showMoney && <col />}</colgroup>
            <tbody>
              {sortedPlayers.map((p) => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td className="scoreboard-value">{scores[p.id] ?? 0}</td>
                  {showMoney && (
                    <td className="scoreboard-value scoreboard-money">
                      {formatMoneySigned(money[p.id] ?? 0)}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
```

- [ ] **Step 5: Pass the toggle props to the history table**

Change the `<HostRoundHistoryTable ... />` call site to also pass:

```tsx
          showMoney={showMoney}
          historyView={historyView}
          onHistoryViewChange={setHistoryView}
```

Then extend `HostRoundHistoryTableProps`:

```tsx
interface HostRoundHistoryTableProps {
  game: HostGame;
  showMoney: boolean;
  historyView: 'points' | 'money';
  onHistoryViewChange: (v: 'points' | 'money') => void;
  onRowClick: (index: number) => void;
  onEdit: (index: number) => void;
  onRemove: (index: number) => void;
}
```

and its destructured parameter list to match.

- [ ] **Step 6: Render the toggle and the money cells**

In `HostRoundHistoryTable`, replace the bare `<h3 className="scoreboard-title">Round history</h3>` with:

```tsx
      <div className="score-history-head">
        <h3 className="scoreboard-title">Round history</h3>
        {showMoney && (
          <div className="score-view-toggle" role="group" aria-label="History view">
            <button
              type="button"
              className={`score-view-toggle-btn ${historyView === 'points' ? 'active' : ''}`}
              onClick={() => onHistoryViewChange('points')}
              aria-pressed={historyView === 'points'}
            >
              Points
            </button>
            <button
              type="button"
              className={`score-view-toggle-btn ${historyView === 'money' ? 'active' : ''}`}
              onClick={() => onHistoryViewChange('money')}
              aria-pressed={historyView === 'money'}
            >
              Money
            </button>
          </div>
        )}
      </div>
```

Then inside the row map, after the existing `const points = calcHostRoundPoints(round, game.config, playerIds);`, add:

```tsx
              const viewingMoney = showMoney && historyView === 'money';
              const values = viewingMoney
                ? scalePointsToMoney(
                    points,
                    resolveMoneyRate(round.configSnapshot?.moneyRate, game.config.moneyRate)
                  )
                : points;
```

and change the per-player cell to:

```tsx
                  {playerIds.map((id) => (
                    <td key={id} className="score-round-point">
                      {viewingMoney
                        ? formatMoneySigned(values[id] ?? 0)
                        : `${(values[id] ?? 0) >= 0 ? '+' : ''}${values[id] ?? 0}`}
                    </td>
                  ))}
```

- [ ] **Step 7: Add money to the detail modal**

`HostRoundDetailModal` already computes `points`. Add `showMoney: boolean` to `HostRoundDetailModalProps` and its destructured params, pass `showMoney={showMoney}` at the call site, then add below the existing `points` line:

```tsx
  const money = scalePointsToMoney(
    points,
    resolveMoneyRate(round.configSnapshot?.moneyRate, gameConfig.moneyRate)
  );
```

and extend the per-player row's value span:

```tsx
              <span className="scoreboard-value">
                {(points[id] ?? 0) >= 0 ? '+' : ''}
                {points[id] ?? 0}
                {showMoney && (
                  <span className="scoreboard-money"> {formatMoneySigned(money[id] ?? 0)}</span>
                )}
              </span>
```

- [ ] **Step 8: Add the rate input to the config modal**

In `HostConfigModal`, add a second section after the existing "Bet amount" section:

```tsx
        <section className="score-config-section">
          <h3 className="score-config-section-title">Money</h3>
          <label className="host-config-label">
            <span>Money per point</span>
            <input
              type="number"
              min={0}
              step={1000}
              value={config.moneyRate ?? 0}
              onChange={(e) => onChange({ ...config, moneyRate: Math.max(0, Number(e.target.value) || 0) })}
              className="score-input"
            />
          </label>
          <p className="score-config-preview">
            {(config.moneyRate ?? 0) === 0
              ? 'No money tracked. Set a rate to settle up in cash.'
              : `${formatMoney(config.moneyRate ?? 0)} per point → a +3 round pays ${formatMoneySigned((config.moneyRate ?? 0) * 3)}`}
          </p>
        </section>
```

`config.moneyRate ?? 0` on `value` is required — a game saved before this change has `moneyRate === undefined`, and passing `undefined` to a controlled input makes React switch it to uncontrolled and log a warning.

- [ ] **Step 9: Verify the build and lint**

Run: `npm run build && npm run lint`
Expected: both exit 0.

- [ ] **Step 10: Verify in the browser**

Run `npm run dev`, go to Card Score → Host.

1. An existing Host game (or a new one) shows **no** Money column and **no** toggle while the rate is 0.
2. Config now has a "Money per point" input below "Points per bet". Set it to `1000`; the preview reads `1,000 per point → a +3 round pays +3,000`.
3. The Money column appears. For a player on +2 points it reads `+2,000`.
4. **This is the retroactive-pricing behaviour** — rounds recorded before the rate was set now price at the current rate. Confirm the history's Money view is non-zero for them.
5. Add a new round. Change the rate to `5000`. The new round keeps 1,000; only rounds added after the change use 5,000.
6. Set the rate back to `0`. The Money column must **stay visible** because priced rounds exist.
7. Toggle Points ⇄ Money above the history; both render correctly.
8. Open a round's detail modal: points and money both appear.
9. Reload; everything persists.

- [ ] **Step 11: Commit**

```bash
git add src/components/HostScore.tsx
git commit -m "feat: show money column and history toggle in Host mode"
```

---

## Task 7: Money UI in Vietnamese 13 mode

**Files:**
- Modify: `src/components/TienLenScore.tsx` (scoreboard at `:111-130`, history table at `~:315-360`, detail modal at `~:385-415`, `ConfigModal` at `:484`)

**Interfaces:**
- Consumes: `calcTotalMoney` (Task 3); `formatMoney`, `formatMoneySigned`, `shouldShowMoney`, `resolveMoneyRate`, `scalePointsToMoney` from `src/lib/money.ts` (Task 1).
- Produces: nothing consumed by later tasks.

Structurally identical to Task 6. The one difference: this file resolves each round's config through `migrateConfig` at `:332` and `:391`, so the rate is read off that already-migrated `roundConfig` rather than off `round.configSnapshot` directly.

- [ ] **Step 1: Add the imports**

Add `calcTotalMoney` to the existing `../lib/tienLenScore` import list, then:

```tsx
import { formatMoney, formatMoneySigned, shouldShowMoney, resolveMoneyRate, scalePointsToMoney } from '../lib/money';
```

- [ ] **Step 2: Add state and computed values**

Alongside the other `useState` calls:

```tsx
  const [historyView, setHistoryView] = useState<'points' | 'money'>('points');
```

Below the existing `const scores = calcTotalScores(game);`:

```tsx
  const money = calcTotalMoney(game);
  const showMoney = shouldShowMoney(
    game.config.moneyRate,
    game.rounds.map((r) => r.configSnapshot?.moneyRate)
  );
```

- [ ] **Step 3: Add the scoreboard money column**

Replace the scoreboard header, colgroup, and row cells to match:

```tsx
        <div className="scoreboard-header">
          <span className="scoreboard-col-player">Player</span>
          <span className="scoreboard-col-score">Score</span>
          {showMoney && <span className="scoreboard-col-money">Money</span>}
        </div>
        <div className="scoreboard-body">
          <table className="scoreboard-table">
            <colgroup><col /><col />{showMoney && <col />}</colgroup>
            <tbody>
              {sortedPlayers.map((p) => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td className="scoreboard-value">{scores[p.id] ?? 0}</td>
                  {showMoney && (
                    <td className="scoreboard-value scoreboard-money">
                      {formatMoneySigned(money[p.id] ?? 0)}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
```

- [ ] **Step 4: Wire the toggle into the history table**

Add `showMoney`, `historyView`, and `onHistoryViewChange` to the history table component's props interface, destructured params, and call site — exactly as in Task 6 Step 5.

Replace its `<h3 className="scoreboard-title">Round history</h3>` with the same `.score-history-head` block from Task 6 Step 6 (repeated here so this task stands alone):

```tsx
      <div className="score-history-head">
        <h3 className="scoreboard-title">Round history</h3>
        {showMoney && (
          <div className="score-view-toggle" role="group" aria-label="History view">
            <button
              type="button"
              className={`score-view-toggle-btn ${historyView === 'points' ? 'active' : ''}`}
              onClick={() => onHistoryViewChange('points')}
              aria-pressed={historyView === 'points'}
            >
              Points
            </button>
            <button
              type="button"
              className={`score-view-toggle-btn ${historyView === 'money' ? 'active' : ''}`}
              onClick={() => onHistoryViewChange('money')}
              aria-pressed={historyView === 'money'}
            >
              Money
            </button>
          </div>
        )}
      </div>
```

- [ ] **Step 5: Render money in the history cells**

At `:332-333` the code already builds `roundConfig` and `points`. Add immediately after:

```tsx
              const viewingMoney = showMoney && historyView === 'money';
              const values = viewingMoney
                ? scalePointsToMoney(
                    points,
                    resolveMoneyRate(roundConfig.moneyRate, game.config.moneyRate)
                  )
                : points;
```

and change the per-player cell to:

```tsx
                  {playerIds.map((id) => (
                    <td key={id} className="score-round-point">
                      {viewingMoney
                        ? formatMoneySigned(values[id] ?? 0)
                        : `${(values[id] ?? 0) >= 0 ? '+' : ''}${values[id] ?? 0}`}
                    </td>
                  ))}
```

- [ ] **Step 6: Add money to the detail modal**

The detail modal builds `roundConfig` and `points` at `:391-392`. Add `showMoney: boolean` to its props interface and destructured params, pass `showMoney={showMoney}` at the call site, then add:

```tsx
  const money = scalePointsToMoney(
    points,
    resolveMoneyRate(roundConfig.moneyRate, gameConfig.moneyRate)
  );
```

and extend the per-player value span at `~:410`:

```tsx
              <span className="scoreboard-value">
                {(points[id] ?? 0) >= 0 ? '+' : ''}
                {points[id] ?? 0}
                {showMoney && (
                  <span className="scoreboard-money"> {formatMoneySigned(money[id] ?? 0)}</span>
                )}
              </span>
```

- [ ] **Step 7: Add the rate input to ConfigModal**

`ConfigModal` (at `:484`) has sections "Win (rankings)", "Catch (beat)", "Last (holding)", "Special". Add a "Money" section after "Special":

```tsx
        <section className="score-config-section">
          <h3 className="score-config-section-title">Money</h3>
          <label className="host-config-label">
            <span>Money per point</span>
            <input
              type="number"
              min={0}
              step={1000}
              value={config.moneyRate ?? 0}
              onChange={(e) => onChange({ ...config, moneyRate: Math.max(0, Number(e.target.value) || 0) })}
              className="score-input"
            />
          </label>
          <p className="score-config-preview">
            {(config.moneyRate ?? 0) === 0
              ? 'No money tracked. Set a rate to settle up in cash.'
              : `${formatMoney(config.moneyRate ?? 0)} per point → a +2 round pays ${formatMoneySigned((config.moneyRate ?? 0) * 2)}`}
          </p>
        </section>
```

Note this section sets `moneyRate` directly via `onChange({ ...config, moneyRate })` rather than through the file's existing `set(key, value)` helper at `:485`, because that helper is typed for the numeric point fields.

- [ ] **Step 8: Verify the build and lint**

Run: `npm run build && npm run lint`
Expected: both exit 0.

- [ ] **Step 9: Verify in the browser**

Run `npm run dev`, go to Card Score → Vietnamese 13. Run the same nine checks as Task 6 Step 10, substituting "a +2 round pays +2,000" for the preview text.

Additionally, and specifically for this mode:

10. **`migrateConfig` regression check.** Set the rate to `5000`, save, then **reload the page** and reopen Config. The rate must still read `5,000`. If it reads `0`, `moneyRate` is being stripped by `migrateConfig` — go back to Task 3 Step 4.

- [ ] **Step 10: Commit**

```bash
git add src/components/TienLenScore.tsx
git commit -m "feat: show money column and history toggle in Vietnamese 13 mode"
```

---

## Task 8: Documentation and full regression sweep

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: the finished feature.
- Produces: nothing.

- [ ] **Step 1: Update the README feature list**

In `README.md`, replace the `- **Card Score** – ...` bullet and its sub-list under **Features** with:

```markdown
- **Card Score** – score tracker with three modes:
  - *Vietnamese 13 (Tiến lên)* – 2–4 players, configurable points (rankings, catch, hold, sweep, stuck), zero-sum per round
  - *Host* – 2–20 players, one host per round, win/lose/draw with multipliers
  - *Win Count* – 2–10 players, one winner per round scoring 1 point; generic enough for most trick-taking games
  - Optional money tracking in every mode: set a rate and the app settles up in cash
  - Round history with edit/delete and a Points ⇄ Money view toggle
```

- [ ] **Step 2: Update the game mode table**

Change the **Card Score** row of the table under **Game Modes** to:

```markdown
| **Card Score** | Track scores for Vietnamese 13, Host, or any one-winner-per-round game, with optional cash settlement. |
```

- [ ] **Step 3: Update the project structure block**

In the `Project Structure` code block, extend the `components/` and `lib/` listings:

```
│   ├── components/        # React components
│   │   ├── Game.tsx       # Liar's Deck
│   │   ├── PokerGame.tsx  # Liar's Poker
│   │   ├── ScoreTracking.tsx
│   │   ├── TienLenScore.tsx
│   │   ├── HostScore.tsx
│   │   ├── WinCountScore.tsx
│   │   ├── AddRoundModal.tsx
│   │   ├── AddHostRoundModal.tsx
│   │   └── AddWinRoundModal.tsx
│   ├── lib/               # Game logic (unit-tested with vitest)
│   │   ├── money.ts
│   │   ├── tienLenScore.ts
│   │   ├── hostScore.ts
│   │   └── winCount.ts
```

- [ ] **Step 4: Document the test command**

Add after the `### Build` section:

```markdown
### Tests

```bash
npm test
```

Unit tests cover the scoring and money logic in `src/lib/`.
```

- [ ] **Step 5: Run the full verification sweep**

```bash
npm test && npm run build && npm run lint
```

Expected: all tests pass, build exits 0, lint exits 0.

Then `npm run dev` and confirm across the whole app:

1. **Liar's Deck** and **Liar's Poker** tabs still work — they were untouched, this is a smoke check that nothing global broke.
2. All three Card Score sub-tabs load.
3. With no rates set anywhere, all three score modes look exactly as they did before this feature.
4. In each of the three modes: set a rate, add rounds, toggle Points ⇄ Money, open a detail modal, edit a round, delete a round, reload.
5. Resize to a narrow (~375px) viewport. In Win Count with 10 players, the history table scrolls horizontally rather than overflowing the page.

- [ ] **Step 6: Commit**

```bash
git add README.md
git commit -m "docs: document Win Count mode and money tracking"
```

---

## Out of Scope

The app access code (`xxxx-xxxx`) is **not** part of this plan. It is an independent concern with its own hard constraint — this app is fully client-side, so any code checked in the browser is readable from the JS bundle — and gets its own brainstorm and spec.
