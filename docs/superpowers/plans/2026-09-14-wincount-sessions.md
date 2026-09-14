# Win Count Sessions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Win Count from a single saved game into a session of games with a stable player roster, so adding or removing a player starts Game N+1 instead of discarding the scoreboard and the money, and a Total board sums across games.

**Architecture:** A new generic `src/lib/session.ts` owns the roster, the ordered game list, duplicate-name rules, cross-game totals and storage. `src/lib/winCount.ts` keeps all scoring and swaps `game.players` for `game.playerIds`, resolving names through the session. The 539-line `WinCountScore.tsx` is split: a tab strip, a total board and a roster editor become their own components.

**Tech Stack:** React 19, TypeScript 5.8 (strict), Vite 7, Vitest 4 (node environment, no DOM), plain CSS in `src/styles/site.css`, `localStorage` for persistence. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-14-wincount-sessions-design.md`

## Global Constraints

- No new dependencies. `package.json` must be unchanged at the end of this plan.
- Persistence is `localStorage` only. Every access goes through a `try`/`catch` that also guards `typeof localStorage === 'undefined'`, matching the existing libs.
- Storage key stays `liarbar-card-score-wincount`. The stored blob gains `version: 2`.
- `MIN_WIN_COUNT_PLAYERS` is 2 and `MAX_WIN_COUNT_PLAYERS` is 10. A game must have between 2 and 10 players inclusive.
- Duplicate player names are rejected on `name.trim().toLowerCase()` comparison, checked *after* blank names are auto-filled to `Player N`.
- Money stays zero-sum within each game. A player not in a game contributes nothing to it and takes no loss from it.
- Money formatting goes through `formatMoney` / `formatMoneySigned` in `src/lib/money.ts`. Do not call `toLocaleString` directly.
- Round pricing uses the existing `configSnapshot` mechanism. Editing config never reprices recorded rounds.
- There is **no DOM test environment** in this repo (`vite.config.ts` sets no `test.environment`, and neither jsdom nor Testing Library is installed). Tests are for `src/lib/*` only. Component tasks are verified by `npx tsc -b`, `npm run build` and explicit browser checks. Do not add a test environment.
- The baseline is **86 passing tests in 5 files**. That number only goes up.
- `npm run lint` is red on a clean checkout — a pre-existing condition. Do not treat existing lint errors as a regression, and do not fix them here. Only ensure you add no *new* errors in files you touch.
- CSS is dark-theme, mobile-first, written as dense single-line rules in `src/styles/site.css`. Match that style. The app must not scroll horizontally at 400px width.

---

### Task 1: Generic session module

**Files:**
- Create: `src/lib/session.ts`
- Test: `src/lib/session.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `interface SessionPlayer { id: string; name: string }`
  - `interface SessionGame { id: string; playerIds: string[]; createdAt: number }`
  - `interface Session<TGame extends SessionGame> { id: string; version: number; players: SessionPlayer[]; games: TGame[]; activeGameIndex: number; createdAt: number }`
  - `const SESSION_VERSION = 2`
  - `genId(): string`
  - `normalizeName(name: string): string`
  - `nameKey(name: string): string`
  - `fillBlankNames(names: string[]): string[]`
  - `findDuplicateNameIndex(names: string[]): number | null`
  - `isNameTaken(players: SessionPlayer[], name: string, excludeId?: string): boolean`
  - `createSessionPlayer(name: string): SessionPlayer`
  - `renameSessionPlayer<S extends Session<SessionGame>>(session: S, playerId: string, name: string): S`
  - `getActiveGame<TGame extends SessionGame>(session: Session<TGame>): TGame | null`
  - `startNextGame<TGame extends SessionGame, S extends Session<TGame>>(session: S, playerIds: string[], makeGame: (base: SessionGame) => TGame): S`
  - `sumTotals(maps: Array<Record<string, number>>): Record<string, number>`
  - `countGamesPlayed(session: Session<SessionGame>): Record<string, number>`
  - `loadSession<S>(key: string, parse: (raw: unknown) => S | null): S | null`
  - `saveSession<S>(key: string, session: S): void`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/session.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  SESSION_VERSION,
  normalizeName,
  nameKey,
  fillBlankNames,
  findDuplicateNameIndex,
  isNameTaken,
  createSessionPlayer,
  renameSessionPlayer,
  getActiveGame,
  startNextGame,
  sumTotals,
  countGamesPlayed,
  loadSession,
  saveSession,
} from './session';
import type { Session, SessionGame, SessionPlayer } from './session';

interface TestGame extends SessionGame {
  label: string;
}

function sessionOf(names: string[]): Session<TestGame> {
  const players: SessionPlayer[] = names.map(createSessionPlayer);
  return {
    id: 's1',
    version: SESSION_VERSION,
    players,
    games: [{ id: 'g1', playerIds: players.map((p) => p.id), createdAt: 1, label: 'G1' }],
    activeGameIndex: 0,
    createdAt: 1,
  };
}

describe('name helpers', () => {
  it('trims for display and lowercases for comparison', () => {
    expect(normalizeName('  Van  ')).toBe('Van');
    expect(nameKey('  VAN ')).toBe('van');
  });

  it('fills blank names with a positional default', () => {
    expect(fillBlankNames(['Nam', '   ', 'Linh'])).toEqual(['Nam', 'Player 2', 'Linh']);
  });

  it('finds the first duplicate ignoring case and whitespace', () => {
    expect(findDuplicateNameIndex(['Nam', 'Linh', ' nam '])).toBe(2);
    expect(findDuplicateNameIndex(['Nam', 'Linh'])).toBeNull();
  });

  it('catches a typed name colliding with an auto-filled one', () => {
    expect(findDuplicateNameIndex(fillBlankNames(['Player 2', '']))).toBe(1);
  });

  it('reports a name already on the roster, excluding the player being renamed', () => {
    const s = sessionOf(['Nam', 'Linh']);
    expect(isNameTaken(s.players, ' NAM ')).toBe(true);
    expect(isNameTaken(s.players, 'Nam', s.players[0].id)).toBe(false);
    expect(isNameTaken(s.players, 'Huy')).toBe(false);
  });
});

describe('createSessionPlayer', () => {
  it('trims the name and gives every player a distinct id', () => {
    const a = createSessionPlayer('  Nam ');
    const b = createSessionPlayer('Linh');
    expect(a.name).toBe('Nam');
    expect(a.id).not.toBe(b.id);
  });
});

describe('renameSessionPlayer', () => {
  it('renames in place and leaves games untouched', () => {
    const s = sessionOf(['Nam', 'Linh']);
    const next = renameSessionPlayer(s, s.players[0].id, ' Nam Jr ');
    expect(next.players[0].name).toBe('Nam Jr');
    expect(next.games).toEqual(s.games);
  });

  it('refuses a name already taken by someone else', () => {
    const s = sessionOf(['Nam', 'Linh']);
    expect(renameSessionPlayer(s, s.players[0].id, 'linh')).toBe(s);
  });

  it('refuses a blank name', () => {
    const s = sessionOf(['Nam', 'Linh']);
    expect(renameSessionPlayer(s, s.players[0].id, '   ')).toBe(s);
  });
});

describe('startNextGame', () => {
  it('appends a game and makes it active', () => {
    const s = sessionOf(['Nam', 'Linh']);
    const ids = s.players.map((p) => p.id);
    const next = startNextGame(s, ids, (base) => ({ ...base, label: 'G2' }));
    expect(next.games).toHaveLength(2);
    expect(next.activeGameIndex).toBe(1);
    expect(next.games[1].playerIds).toEqual(ids);
    expect(next.games[1].id).not.toBe(next.games[0].id);
  });

  it('leaves earlier games alone', () => {
    const s = sessionOf(['Nam', 'Linh']);
    const next = startNextGame(s, [s.players[0].id], (base) => ({ ...base, label: 'G2' }));
    expect(next.games[0]).toEqual(s.games[0]);
  });
});

describe('getActiveGame', () => {
  it('returns the game at activeGameIndex', () => {
    const s = sessionOf(['Nam']);
    expect(getActiveGame(s)?.id).toBe('g1');
  });

  it('returns null when the index is out of range', () => {
    const s = { ...sessionOf(['Nam']), activeGameIndex: 7 };
    expect(getActiveGame(s)).toBeNull();
  });
});

describe('sumTotals', () => {
  it('adds per-player maps across games', () => {
    expect(sumTotals([{ a: 2, b: 1 }, { a: 3, b: 0 }])).toEqual({ a: 5, b: 1 });
  });

  it('unions disjoint player sets without inventing entries', () => {
    const total = sumTotals([{ a: 1 }, { b: 2 }]);
    expect(total).toEqual({ a: 1, b: 2 });
  });

  it('returns an empty map for no games', () => {
    expect(sumTotals([])).toEqual({});
  });
});

describe('countGamesPlayed', () => {
  it('counts only the games a player appears in', () => {
    const s = sessionOf(['Nam', 'Linh']);
    const [nam, linh] = s.players.map((p) => p.id);
    const withLateJoiner: Session<TestGame> = {
      ...s,
      players: [...s.players, createSessionPlayer('Huy')],
      games: [...s.games, { id: 'g2', playerIds: [nam, linh], createdAt: 2, label: 'G2' }],
    };
    const huy = withLateJoiner.players[2].id;
    const counts = countGamesPlayed(withLateJoiner);
    expect(counts[nam]).toBe(2);
    expect(counts[huy]).toBe(0);
  });
});

describe('storage', () => {
  it('round trips a session through localStorage', () => {
    const s = sessionOf(['Nam']);
    saveSession('test-session-key', s);
    const loaded = loadSession<Session<TestGame>>('test-session-key', (raw) => raw as Session<TestGame>);
    expect(loaded).toEqual(s);
  });

  it('returns null when nothing is stored', () => {
    expect(loadSession('test-missing-key', (raw) => raw as Session<TestGame>)).toBeNull();
  });

  it('returns null rather than throwing on unparseable data', () => {
    localStorage.setItem('test-bad-key', '{not json');
    expect(loadSession('test-bad-key', (raw) => raw as Session<TestGame>)).toBeNull();
  });

  it('returns null when the parser rejects the blob', () => {
    saveSession('test-reject-key', { nope: true });
    expect(loadSession('test-reject-key', () => null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/session.test.ts`
Expected: FAIL — `Failed to resolve import "./session"`.

Note: these tests touch `localStorage`, which does not exist in Vitest's default node environment. If the storage tests fail with `localStorage is not defined` rather than a resolution error, that is expected too — Step 3 adds a minimal in-file stub. Do **not** install jsdom.

- [ ] **Step 3: Add a localStorage stub to the test file**

Insert directly below the imports in `src/lib/session.test.ts`:

```ts
// Vitest runs in the node environment (no DOM). The lib guards on
// `typeof localStorage === 'undefined'`, so exercising the stored path needs a
// stub. Installing jsdom for four assertions is not worth the dependency.
const memoryStore = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => memoryStore.get(k) ?? null,
  setItem: (k: string, v: string) => void memoryStore.set(k, v),
  removeItem: (k: string) => void memoryStore.delete(k),
  clear: () => memoryStore.clear(),
  key: (i: number) => [...memoryStore.keys()][i] ?? null,
  get length() {
    return memoryStore.size;
  },
} as Storage;
```

- [ ] **Step 4: Write the implementation**

Create `src/lib/session.ts`:

```ts
/**
 * Generic multi-game session model shared by the Card Score modes.
 *
 * A session owns the roster; games own only player ids. That indirection is
 * what lets a player join at Game 3, sit out Game 4, and still have one row on
 * the total board. Renaming a player updates every board at once.
 *
 * Win Count is the first consumer. Tien Len and Host are expected to follow,
 * so nothing here may know about wins, points or bets.
 */

export interface SessionPlayer {
  id: string;
  name: string;
}

/** The shape every per-mode game must satisfy to live inside a session. */
export interface SessionGame {
  id: string;
  /** Ids into `Session.players`. Membership is per game, not per session. */
  playerIds: string[];
  createdAt: number;
}

export interface Session<TGame extends SessionGame> {
  id: string;
  version: number;
  /** Everyone who has played any game in this session. */
  players: SessionPlayer[];
  games: TGame[];
  activeGameIndex: number;
  createdAt: number;
}

export const SESSION_VERSION = 2;

export function genId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Display form: trimmed. */
export function normalizeName(name: string): string {
  return name.trim();
}

/** Comparison form: trimmed and lowercased. "Van" and " van " are one person. */
export function nameKey(name: string): string {
  return normalizeName(name).toLowerCase();
}

/** Blank entries become `Player N`, 1-based on position. */
export function fillBlankNames(names: string[]): string[] {
  return names.map((n, i) => normalizeName(n) || `Player ${i + 1}`);
}

/**
 * Index of the first name that repeats an earlier one, or null.
 *
 * Call this on the output of `fillBlankNames`, never on raw input: typing
 * "Player 2" into the first row and leaving the second blank produces two
 * players named "Player 2", and checking before the fill would miss it.
 */
export function findDuplicateNameIndex(names: string[]): number | null {
  const seen = new Set<string>();
  for (let i = 0; i < names.length; i++) {
    const key = nameKey(names[i]);
    if (seen.has(key)) return i;
    seen.add(key);
  }
  return null;
}

export function isNameTaken(
  players: SessionPlayer[],
  name: string,
  excludeId?: string
): boolean {
  const key = nameKey(name);
  return players.some((p) => p.id !== excludeId && nameKey(p.name) === key);
}

export function createSessionPlayer(name: string): SessionPlayer {
  return { id: genId(), name: normalizeName(name) };
}

/** Returns the session unchanged if the name is blank or already taken. */
export function renameSessionPlayer<S extends Session<SessionGame>>(
  session: S,
  playerId: string,
  name: string
): S {
  const next = normalizeName(name);
  if (!next) return session;
  if (isNameTaken(session.players, next, playerId)) return session;
  return {
    ...session,
    players: session.players.map((p) => (p.id === playerId ? { ...p, name: next } : p)),
  };
}

export function getActiveGame<TGame extends SessionGame>(
  session: Session<TGame>
): TGame | null {
  return session.games[session.activeGameIndex] ?? null;
}

/**
 * Append a game for `playerIds` and select it. Earlier games are untouched —
 * this is the whole point of the session: a roster change costs a new game,
 * never the old scoreboard.
 */
export function startNextGame<TGame extends SessionGame, S extends Session<TGame>>(
  session: S,
  playerIds: string[],
  makeGame: (base: SessionGame) => TGame
): S {
  const game = makeGame({ id: genId(), playerIds: [...playerIds], createdAt: Date.now() });
  return {
    ...session,
    games: [...session.games, game],
    activeGameIndex: session.games.length,
  };
}

/**
 * Add per-player maps together.
 *
 * A player id absent from a map contributes nothing and creates no entry, so a
 * caller can still tell "played and scored 0" from "did not play" by checking
 * `countGamesPlayed`.
 */
export function sumTotals(maps: Array<Record<string, number>>): Record<string, number> {
  const total: Record<string, number> = {};
  maps.forEach((map) => {
    Object.entries(map).forEach(([id, v]) => {
      total[id] = (total[id] ?? 0) + v;
    });
  });
  return total;
}

/** How many games each session player actually took part in. */
export function countGamesPlayed(session: Session<SessionGame>): Record<string, number> {
  const counts: Record<string, number> = {};
  session.players.forEach((p) => (counts[p.id] = 0));
  session.games.forEach((g) => {
    g.playerIds.forEach((id) => {
      counts[id] = (counts[id] ?? 0) + 1;
    });
  });
  return counts;
}

/**
 * `parse` receives the raw JSON and returns a validated session or null. Per-mode
 * migration lives there, so this function never learns about any mode's shape.
 */
export function loadSession<S>(key: string, parse: (raw: unknown) => S | null): S | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function saveSession<S>(key: string, session: S): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, JSON.stringify(session));
    }
  } catch {
    /* ignore */
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/lib/session.test.ts`
Expected: PASS, all tests in the file green.

- [ ] **Step 6: Run the whole suite and typecheck**

Run: `npx vitest run && npx tsc -b`
Expected: 86 + new tests pass, `tsc` exits 0 with no output.

- [ ] **Step 7: Commit**

```bash
git add src/lib/session.ts src/lib/session.test.ts
git commit -m "feat: add generic multi-game session model

Session owns the roster and an ordered game list; games hold only
player ids, so a roster change costs a new game rather than the
existing scoreboard. Duplicate names are rejected on a trimmed,
lowercased key, checked after blanks are auto-filled.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Win Count on player ids, session totals, and v1 migration

**Files:**
- Modify: `src/lib/winCount.ts` (whole file)
- Test: `src/lib/winCount.test.ts` (whole file)

**Interfaces:**
- Consumes: everything Task 1 produced.
- Produces:
  - `type Player = SessionPlayer` (re-export, keeps `AddWinRoundModal` compiling)
  - `interface WinCountGame extends SessionGame { config: WinCountConfig; rounds: WinCountRound[] }`
  - `interface WinCountSession extends Session<WinCountGame> { config: WinCountConfig }`
  - `createWinCountSession(names: string[]): WinCountSession`
  - `startWinCountGame(session: WinCountSession, playerIds: string[], config?: WinCountConfig): WinCountSession`
  - `replaceGame(session: WinCountSession, index: number, game: WinCountGame): WinCountSession`
  - `getGamePlayers(session: WinCountSession, game: WinCountGame): SessionPlayer[]`
  - `calcWinCountSessionTotals(session: WinCountSession): { scores: Record<string, number>; money: Record<string, number>; gamesPlayed: Record<string, number> }`
  - `shouldShowSessionMoney(session: WinCountSession): boolean`
  - `parseWinCountSession(raw: unknown): WinCountSession | null`
  - `loadWinCountSession(): WinCountSession | null`
  - `saveWinCountSession(session: WinCountSession): void`
  - unchanged signatures: `calcWinCountRoundPoints`, `calcWinCountRoundMoney`, `calcWinCountTotalScores(game)`, `calcWinCountTotalMoney(game)`, `addWinCountRound`, `updateWinCountRound`, `removeWinCountRound`, `resetWinCountGame`, `DEFAULT_WIN_COUNT_CONFIG`, `MIN_WIN_COUNT_PLAYERS`, `MAX_WIN_COUNT_PLAYERS`

- [ ] **Step 1: Rewrite the existing tests against player ids**

In `src/lib/winCount.test.ts`, the `gameOf` helper currently builds a game with a `players` array. Replace the imports and the helper:

```ts
import { describe, it, expect } from 'vitest';
import {
  createWinCountSession,
  startWinCountGame,
  calcWinCountRoundPoints,
  calcWinCountRoundMoney,
  calcWinCountTotalScores,
  calcWinCountTotalMoney,
  calcWinCountSessionTotals,
  shouldShowSessionMoney,
  getGamePlayers,
  replaceGame,
  parseWinCountSession,
  addWinCountRound,
  updateWinCountRound,
  removeWinCountRound,
  resetWinCountGame,
  DEFAULT_WIN_COUNT_CONFIG,
} from './winCount';
import type { WinCountGame, WinCountSession } from './winCount';

/** A one-game session plus that game, the pair most tests need. */
function setup(names: string[], betAmount = 0): { session: WinCountSession; game: WinCountGame; ids: string[] } {
  const base = createWinCountSession(names);
  const session: WinCountSession = {
    ...base,
    config: { betAmount },
    games: base.games.map((g) => ({ ...g, config: { betAmount } })),
  };
  return { session, game: session.games[0], ids: session.players.map((p) => p.id) };
}

function gameOf(names: string[], betAmount = 0): WinCountGame {
  return setup(names, betAmount).game;
}
```

Then fix every existing assertion that reads `g.players`:

- In `describe('createWinCountGame')` — rename the block to `describe('createWinCountSession')` and rewrite its four tests:

```ts
describe('createWinCountSession', () => {
  it('creates one player per name with unique ids, all in game 1', () => {
    const s = createWinCountSession(['Nam', 'Linh', 'Huy']);
    expect(s.players.map((p) => p.name)).toEqual(['Nam', 'Linh', 'Huy']);
    expect(new Set(s.players.map((p) => p.id)).size).toBe(3);
    expect(s.games).toHaveLength(1);
    expect(s.games[0].playerIds).toEqual(s.players.map((p) => p.id));
    expect(s.activeGameIndex).toBe(0);
  });

  it('falls back to a numbered name for blank input', () => {
    const s = createWinCountSession(['Nam', '  ']);
    expect(s.players[1].name).toBe('Player 2');
  });

  it('clamps to at most 10 players', () => {
    const s = createWinCountSession(Array.from({ length: 14 }, (_, i) => `P${i + 1}`));
    expect(s.players).toHaveLength(10);
    expect(s.games[0].playerIds).toHaveLength(10);
  });

  it('starts with no rounds and the default config', () => {
    const s = createWinCountSession(['A', 'B']);
    expect(s.games[0].rounds).toEqual([]);
    expect(s.games[0].config).toEqual(DEFAULT_WIN_COUNT_CONFIG);
    expect(s.config).toEqual(DEFAULT_WIN_COUNT_CONFIG);
    expect(DEFAULT_WIN_COUNT_CONFIG.betAmount).toBe(0);
  });
});
```

- Everywhere else in the file, replace `const ids = g.players.map((p) => p.id);` with ids from `setup`. For example the first `calcWinCountRoundPoints` test becomes:

```ts
it('gives the winner 1 and everyone else 0', () => {
  const { game, ids } = setup(['A', 'B', 'C']);
  const points = calcWinCountRoundPoints({ winnerId: ids[1] }, game.config, ids);
  expect(points).toEqual({ [ids[0]]: 0, [ids[1]]: 1, [ids[2]]: 0 });
});
```

Apply the same substitution to every test in `calcWinCountRoundPoints`, `calcWinCountRoundMoney`, `totals` and `round mutations`. The assertions themselves do not change — only how `ids` is obtained.

- The last test of `round mutations` asserts `reset.players`; change it to:

```ts
it('clears rounds but keeps players and config on reset', () => {
  const { game, ids } = setup(['A', 'B'], 5000);
  const played = addWinCountRound(game, { winnerId: ids[0] });
  const reset = resetWinCountGame(played);
  expect(reset.rounds).toEqual([]);
  expect(reset.playerIds).toEqual(ids);
  expect(reset.config).toEqual({ betAmount: 5000 });
});
```

- [ ] **Step 2: Add the new session-level tests**

Append to `src/lib/winCount.test.ts`:

```ts
describe('startWinCountGame', () => {
  it('inherits the session bet into the new game', () => {
    const { session, ids } = setup(['A', 'B'], 5000);
    const next = startWinCountGame(session, ids);
    expect(next.games[1].config).toEqual({ betAmount: 5000 });
    expect(next.activeGameIndex).toBe(1);
  });

  it('accepts an explicit config that overrides the session default', () => {
    const { session, ids } = setup(['A', 'B'], 5000);
    const next = startWinCountGame(session, ids, { betAmount: 10000 });
    expect(next.games[1].config).toEqual({ betAmount: 10000 });
    expect(next.config).toEqual({ betAmount: 10000 });
  });

  it('can start a game with a subset of the roster', () => {
    const { session, ids } = setup(['A', 'B', 'C'], 0);
    const next = startWinCountGame(session, [ids[0], ids[1]]);
    expect(next.games[1].playerIds).toEqual([ids[0], ids[1]]);
    expect(next.players).toHaveLength(3);
  });
});

describe('calcWinCountSessionTotals', () => {
  it('sums wins and money across games for a player in both', () => {
    const { session, ids } = setup(['A', 'B'], 5000);
    let s = replaceGame(session, 0, addWinCountRound(session.games[0], { winnerId: ids[0] }));
    s = startWinCountGame(s, ids);
    s = replaceGame(s, 1, addWinCountRound(s.games[1], { winnerId: ids[0] }));
    const { scores, money, gamesPlayed } = calcWinCountSessionTotals(s);
    expect(scores[ids[0]]).toBe(2);
    expect(money[ids[0]]).toBe(10000);
    expect(money[ids[1]]).toBe(-10000);
    expect(gamesPlayed[ids[0]]).toBe(2);
  });

  it('gives a late joiner totals from their games only', () => {
    const { session, ids } = setup(['A', 'B'], 5000);
    let s = replaceGame(session, 0, addWinCountRound(session.games[0], { winnerId: ids[0] }));
    const huy = { id: 'huy', name: 'Huy' };
    s = { ...s, players: [...s.players, huy] };
    s = startWinCountGame(s, [...ids, huy.id]);
    s = replaceGame(s, 1, addWinCountRound(s.games[1], { winnerId: huy.id }));

    const { scores, money, gamesPlayed } = calcWinCountSessionTotals(s);
    expect(scores[huy.id]).toBe(1);
    expect(gamesPlayed[huy.id]).toBe(1);
    // Huy took no loss from game 1, which he did not play.
    expect(money[huy.id]).toBe(10000);
    expect(scores[ids[0]]).toBe(1);
    expect(gamesPlayed[ids[0]]).toBe(2);
  });

  it('stays zero-sum across the whole session', () => {
    const { session, ids } = setup(['A', 'B', 'C'], 5000);
    let s = replaceGame(session, 0, addWinCountRound(session.games[0], { winnerId: ids[2] }));
    s = startWinCountGame(s, [ids[0], ids[1]]);
    s = replaceGame(s, 1, addWinCountRound(s.games[1], { winnerId: ids[1] }));
    const { money } = calcWinCountSessionTotals(s);
    expect(Object.values(money).reduce((sum, v) => sum + v, 0)).toBe(0);
  });

  it('scores a player who played and won nothing as 0, not absent', () => {
    const { session, ids } = setup(['A', 'B'], 0);
    const s = replaceGame(session, 0, addWinCountRound(session.games[0], { winnerId: ids[0] }));
    const { scores, gamesPlayed } = calcWinCountSessionTotals(s);
    expect(scores[ids[1]]).toBe(0);
    expect(gamesPlayed[ids[1]]).toBe(1);
  });
});

describe('shouldShowSessionMoney', () => {
  it('is false when nothing anywhere is priced', () => {
    const { session, ids } = setup(['A', 'B'], 0);
    const s = replaceGame(session, 0, addWinCountRound(session.games[0], { winnerId: ids[0] }));
    expect(shouldShowSessionMoney(s)).toBe(false);
  });

  it('is true when any round in any game was priced, even after the bet returns to 0', () => {
    const { session, ids } = setup(['A', 'B'], 5000);
    let s = replaceGame(session, 0, addWinCountRound(session.games[0], { winnerId: ids[0] }));
    s = { ...s, config: { betAmount: 0 }, games: s.games.map((g) => ({ ...g, config: { betAmount: 0 } })) };
    expect(shouldShowSessionMoney(s)).toBe(true);
  });
});

describe('getGamePlayers', () => {
  it('resolves ids to roster players in game order and drops unknown ids', () => {
    const { session, ids } = setup(['A', 'B', 'C']);
    const game = { ...session.games[0], playerIds: [ids[2], ids[0], 'ghost'] };
    expect(getGamePlayers(session, game).map((p) => p.name)).toEqual(['C', 'A']);
  });
});

describe('parseWinCountSession', () => {
  it('migrates a v1 single game into game 1 of a session', () => {
    const v1 = {
      id: 'old',
      players: [
        { id: 'p1', name: 'Nam' },
        { id: 'p2', name: 'Linh' },
      ],
      config: { betAmount: 5000 },
      rounds: [{ winnerId: 'p1', configSnapshot: { betAmount: 5000 } }],
      createdAt: 111,
    };
    const s = parseWinCountSession(v1);
    expect(s).not.toBeNull();
    expect(s!.version).toBe(2);
    expect(s!.players).toEqual(v1.players);
    expect(s!.games).toHaveLength(1);
    expect(s!.games[0].playerIds).toEqual(['p1', 'p2']);
    expect(s!.games[0].rounds).toEqual(v1.rounds);
    expect(s!.config).toEqual({ betAmount: 5000 });
    expect(s!.activeGameIndex).toBe(0);
  });

  it('preserves v1 totals exactly through the migration', () => {
    const v1 = {
      id: 'old',
      players: [
        { id: 'p1', name: 'Nam' },
        { id: 'p2', name: 'Linh' },
      ],
      config: { betAmount: 5000 },
      rounds: [{ winnerId: 'p1' }, { winnerId: 'p2' }, { winnerId: 'p1' }],
      createdAt: 111,
    };
    const s = parseWinCountSession(v1)!;
    const { scores, money } = calcWinCountSessionTotals(s);
    expect(scores).toEqual({ p1: 2, p2: 1 });
    expect(money).toEqual({ p1: 5000, p2: -5000 });
  });

  it('gives a v1 game without a config the default one', () => {
    const s = parseWinCountSession({
      id: 'old',
      players: [{ id: 'p1', name: 'Nam' }],
      rounds: [],
      createdAt: 1,
    })!;
    expect(s.config).toEqual(DEFAULT_WIN_COUNT_CONFIG);
    expect(s.games[0].config).toEqual(DEFAULT_WIN_COUNT_CONFIG);
  });

  it('passes a v2 session through unchanged', () => {
    const { session } = setup(['A', 'B'], 5000);
    expect(parseWinCountSession(JSON.parse(JSON.stringify(session)))).toEqual(session);
  });

  it('rejects junk', () => {
    expect(parseWinCountSession(null)).toBeNull();
    expect(parseWinCountSession({})).toBeNull();
    expect(parseWinCountSession({ players: [], games: [] })).toBeNull();
    expect(parseWinCountSession('nope')).toBeNull();
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/lib/winCount.test.ts`
Expected: FAIL — `createWinCountSession is not exported by ./winCount` and friends.

- [ ] **Step 4: Rewrite `src/lib/winCount.ts`**

Replace the top of the file (imports through `createWinCountGame`) with:

```ts
import { resolveMoneyRate, shouldShowMoney } from './money';
import {
  SESSION_VERSION,
  createSessionPlayer,
  genId,
  startNextGame,
  sumTotals,
  countGamesPlayed,
  loadSession,
  saveSession,
} from './session';
import type { Session, SessionGame, SessionPlayer } from './session';

/** Win Count's name for a roster entry. Identity lives on the session. */
export type Player = SessionPlayer;

export interface WinCountConfig {
  /** Money each loser pays the winner, per round. Raw currency, default 0. */
  betAmount: number;
}

export interface WinCountRound {
  winnerId: string;
  /** Config in force when the round was recorded; edits to config do not reprice it. */
  configSnapshot?: WinCountConfig;
}

export interface WinCountGame extends SessionGame {
  config: WinCountConfig;
  rounds: WinCountRound[];
}

export interface WinCountSession extends Session<WinCountGame> {
  /** Bet a newly started game inherits. Each game may then diverge. */
  config: WinCountConfig;
}

export const MIN_WIN_COUNT_PLAYERS = 2;
export const MAX_WIN_COUNT_PLAYERS = 10;

export const DEFAULT_WIN_COUNT_CONFIG: WinCountConfig = {
  betAmount: 0,
};

const STORAGE_KEY = 'liarbar-card-score-wincount';

export function createWinCountSession(playerNames: string[]): WinCountSession {
  const names = playerNames.slice(0, MAX_WIN_COUNT_PLAYERS);
  const players = names.map((name, i) => createSessionPlayer(name.trim() || `Player ${i + 1}`));
  const now = Date.now();
  return {
    id: genId(),
    version: SESSION_VERSION,
    players,
    games: [
      {
        id: genId(),
        playerIds: players.map((p) => p.id),
        config: { ...DEFAULT_WIN_COUNT_CONFIG },
        rounds: [],
        createdAt: now,
      },
    ],
    activeGameIndex: 0,
    createdAt: now,
  };
}

/**
 * Start Game N+1 for `playerIds`. The new game inherits the session bet unless
 * `config` overrides it, and an override also becomes the session default so the
 * next game does not have to be retyped either.
 */
export function startWinCountGame(
  session: WinCountSession,
  playerIds: string[],
  config?: WinCountConfig
): WinCountSession {
  const nextConfig = { ...(config ?? session.config) };
  const withGame = startNextGame<WinCountGame, WinCountSession>(session, playerIds, (base) => ({
    ...base,
    config: nextConfig,
    rounds: [],
  }));
  return { ...withGame, config: nextConfig };
}

/** Put an edited game back into the session without disturbing the others. */
export function replaceGame(
  session: WinCountSession,
  index: number,
  game: WinCountGame
): WinCountSession {
  if (index < 0 || index >= session.games.length) return session;
  return { ...session, games: session.games.map((g, i) => (i === index ? game : g)) };
}

/** Roster entries for a game, in the game's own player order. */
export function getGamePlayers(session: WinCountSession, game: WinCountGame): SessionPlayer[] {
  return game.playerIds
    .map((id) => session.players.find((p) => p.id === id))
    .filter((p): p is SessionPlayer => p !== undefined);
}
```

Keep `calcWinCountRoundPoints` and `calcWinCountRoundMoney` exactly as they are — they already take `playerIds` explicitly.

Change `sumOverRounds` to read ids off the game:

```ts
function sumOverRounds(
  game: WinCountGame,
  calc: (
    round: WinCountRound,
    config: WinCountConfig,
    playerIds: string[]
  ) => Record<string, number>
): Record<string, number> {
  const totals: Record<string, number> = {};
  const playerIds = game.playerIds;
  playerIds.forEach((id) => (totals[id] = 0));

  game.rounds.forEach((round) => {
    const perRound = calc(round, game.config, playerIds);
    Object.entries(perRound).forEach(([id, v]) => {
      totals[id] = (totals[id] ?? 0) + v;
    });
  });

  return totals;
}
```

`calcWinCountTotalScores` and `calcWinCountTotalMoney` keep their bodies.

Replace `loadWinCountGame` / `saveWinCountGame` with the session pair, and add the totals and money helpers:

```ts
export function calcWinCountSessionTotals(session: WinCountSession): {
  scores: Record<string, number>;
  money: Record<string, number>;
  gamesPlayed: Record<string, number>;
} {
  return {
    scores: sumTotals(session.games.map(calcWinCountTotalScores)),
    money: sumTotals(session.games.map(calcWinCountTotalMoney)),
    gamesPlayed: countGamesPlayed(session),
  };
}

/**
 * Money surfaces show if any round of any game was ever priced — the
 * per-game rule from `money.ts`, widened to the session, so a bet set back to
 * zero cannot hide money that is still owed.
 */
export function shouldShowSessionMoney(session: WinCountSession): boolean {
  return session.games.some((g) =>
    shouldShowMoney(
      g.config.betAmount,
      g.rounds.map((r) => r.configSnapshot?.betAmount)
    )
  );
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

/**
 * Validate a v2 session, or migrate the v1 single-game blob into one.
 *
 * v1 was a bare game: `{ id, players, config, rounds, createdAt }`. It becomes
 * Game 1 of a session whose roster is the old player list, so an in-progress
 * game survives the upgrade with its rounds and money intact.
 */
export function parseWinCountSession(raw: unknown): WinCountSession | null {
  if (!isRecord(raw)) return null;
  const players = raw.players;
  if (!Array.isArray(players) || players.length === 0) return null;

  if (Array.isArray(raw.games)) {
    if (raw.games.length === 0) return null;
    const games = raw.games as WinCountGame[];
    if (games.some((g) => !Array.isArray(g?.playerIds) || !Array.isArray(g?.rounds))) return null;
    const activeGameIndex =
      typeof raw.activeGameIndex === 'number' &&
      raw.activeGameIndex >= 0 &&
      raw.activeGameIndex < games.length
        ? raw.activeGameIndex
        : games.length - 1;
    return {
      id: typeof raw.id === 'string' ? raw.id : genId(),
      version: SESSION_VERSION,
      players: players as SessionPlayer[],
      games: games.map((g) => ({ ...g, config: g.config ?? { ...DEFAULT_WIN_COUNT_CONFIG } })),
      activeGameIndex,
      createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : Date.now(),
    };
  }

  // v1: a bare game.
  if (!Array.isArray(raw.rounds)) return null;
  const config = isRecord(raw.config)
    ? ({ betAmount: Number(raw.config.betAmount) || 0 } as WinCountConfig)
    : { ...DEFAULT_WIN_COUNT_CONFIG };
  const createdAt = typeof raw.createdAt === 'number' ? raw.createdAt : Date.now();
  return {
    id: genId(),
    version: SESSION_VERSION,
    players: players as SessionPlayer[],
    games: [
      {
        id: typeof raw.id === 'string' ? raw.id : genId(),
        playerIds: (players as SessionPlayer[]).map((p) => p.id),
        config,
        rounds: raw.rounds as WinCountRound[],
        createdAt,
      },
    ],
    activeGameIndex: 0,
    createdAt,
  };
}

export function loadWinCountSession(): WinCountSession | null {
  return loadSession<WinCountSession>(STORAGE_KEY, parseWinCountSession);
}

export function saveWinCountSession(session: WinCountSession): void {
  saveSession(STORAGE_KEY, session);
}
```

Finally, `resetWinCountGame` keeps its body but now preserves `playerIds` implicitly through the spread — no change needed. Delete `createWinCountGame`, `loadWinCountGame` and `saveWinCountGame`; nothing will reference them after Task 5.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/lib/winCount.test.ts`
Expected: PASS.

Note: `WinCountScore.tsx` will now fail to typecheck because it still imports the deleted functions. That is expected until Task 5. Do not run `tsc -b` at this step.

- [ ] **Step 6: Run the lib suite**

Run: `npx vitest run`
Expected: PASS, total above 86.

- [ ] **Step 7: Commit**

```bash
git add src/lib/winCount.ts src/lib/winCount.test.ts
git commit -m "feat: put Win Count on the session model

Games hold playerIds instead of their own player objects, so names
resolve through the session roster. Adds session totals with a
games-played count, session-wide money visibility, and migration of
the v1 single-game blob into Game 1.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Tab strip and total board components

**Files:**
- Create: `src/components/WinCountGameTabs.tsx`
- Create: `src/components/WinCountTotalBoard.tsx`
- Modify: `src/styles/site.css` (append near the existing `.scoreboard-*` rules, around line 236)

**Interfaces:**
- Consumes: `SessionPlayer` from `src/lib/session`, `formatMoneySigned` from `src/lib/money`.
- Produces:
  - `type WinCountTab = number | 'total'`
  - `WinCountGameTabs` — props `{ gameCount: number; selected: WinCountTab; onSelect: (tab: WinCountTab) => void }`
  - `WinCountTotalBoard` — props `{ players: SessionPlayer[]; scores: Record<string, number>; money: Record<string, number>; gamesPlayed: Record<string, number>; showMoney: boolean }`

There is no DOM test environment, so these are verified by typecheck, build, and the browser checks in Task 5.

- [ ] **Step 1: Create the tab strip**

Create `src/components/WinCountGameTabs.tsx`:

```tsx
import React from 'react';

export type WinCountTab = number | 'total';

interface WinCountGameTabsProps {
  gameCount: number;
  selected: WinCountTab;
  onSelect: (tab: WinCountTab) => void;
}

/**
 * `Total | G1 | G2 | ...`. Scrolls horizontally once the games outgrow the
 * width rather than wrapping, so the scoreboard never shifts down the page.
 */
const WinCountGameTabs: React.FC<WinCountGameTabsProps> = ({ gameCount, selected, onSelect }) => (
  <nav className="wincount-game-tabs" aria-label="Game">
    <button
      type="button"
      className={`wincount-game-tab ${selected === 'total' ? 'active' : ''}`}
      onClick={() => onSelect('total')}
      aria-current={selected === 'total' ? 'true' : undefined}
    >
      Total
    </button>
    {Array.from({ length: gameCount }, (_, i) => (
      <button
        key={i}
        type="button"
        className={`wincount-game-tab ${selected === i ? 'active' : ''}`}
        onClick={() => onSelect(i)}
        aria-current={selected === i ? 'true' : undefined}
      >
        G{i + 1}
      </button>
    ))}
  </nav>
);

export default WinCountGameTabs;
```

- [ ] **Step 2: Create the total board**

Create `src/components/WinCountTotalBoard.tsx`:

```tsx
import React from 'react';
import type { SessionPlayer } from '../lib/session';
import { formatMoneySigned } from '../lib/money';

interface WinCountTotalBoardProps {
  players: SessionPlayer[];
  scores: Record<string, number>;
  money: Record<string, number>;
  gamesPlayed: Record<string, number>;
  showMoney: boolean;
}

/**
 * Wins and money summed across every game of the session.
 *
 * The Games column is load-bearing, not decoration: without it a player who
 * joined at Game 3 looks like they are simply losing.
 */
const WinCountTotalBoard: React.FC<WinCountTotalBoardProps> = ({
  players,
  scores,
  money,
  gamesPlayed,
  showMoney,
}) => {
  const sorted = [...players].sort((a, b) => (scores[b.id] ?? 0) - (scores[a.id] ?? 0));

  return (
    <div className="scoreboard">
      <h3 className="scoreboard-title">Total</h3>
      <div className={`scoreboard-header wincount-total${showMoney ? ' has-money' : ''}`}>
        <span className="scoreboard-col-player">Player</span>
        <span className="scoreboard-col-score">Wins</span>
        {showMoney && <span className="scoreboard-col-money">Money</span>}
        <span className="scoreboard-col-games">Games</span>
      </div>
      <div className="scoreboard-body">
        <table className={`scoreboard-table wincount-total${showMoney ? ' has-money' : ''}`}>
          <colgroup>
            <col />
            <col />
            {showMoney && <col />}
            <col />
          </colgroup>
          <tbody>
            {sorted.map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td className="scoreboard-value">{scores[p.id] ?? 0}</td>
                {showMoney && (
                  <td className="scoreboard-value scoreboard-money">
                    {formatMoneySigned(money[p.id] ?? 0)}
                  </td>
                )}
                <td className="scoreboard-games">{gamesPlayed[p.id] ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default WinCountTotalBoard;
```

- [ ] **Step 3: Add the CSS**

Append to `src/styles/site.css`, immediately after the `.scoreboard-value` rule (currently line 236):

```css
.wincount-game-tabs{display:flex;gap:4px;overflow-x:auto;margin-bottom:8px;padding-bottom:2px;flex-shrink:0;-webkit-overflow-scrolling:touch;scrollbar-width:none}
.wincount-game-tabs::-webkit-scrollbar{display:none}
.wincount-game-tab{flex:0 0 auto;padding:5px 10px;border:1px solid #555;border-radius:12px;background:transparent;color:#aaa;font-family:inherit;font-size:11px;cursor:pointer;white-space:nowrap;transition:color .2s,background .2s,border-color .2s}
.wincount-game-tab::before,.wincount-game-tab::after{display:none !important}
.wincount-game-tab:hover{color:#fff}
.wincount-game-tab.active{color:#1a1a1a;background:#d3a446;border-color:#d3a446;font-weight:700}
@media (min-width:480px){.wincount-game-tab{padding:6px 12px;font-size:13px}}
.scoreboard-col-games{text-align:left}
.scoreboard-games{color:#aaa}
.scoreboard-header.wincount-total{grid-template-columns:1fr 48px 50px}
.scoreboard-header.wincount-total.has-money{grid-template-columns:1fr 44px 78px 46px}
@media (min-width:480px){.scoreboard-header.wincount-total{grid-template-columns:1fr 64px 64px}.scoreboard-header.wincount-total.has-money{grid-template-columns:1fr 56px 96px 56px}}
.scoreboard-table.wincount-total col:nth-child(2){width:48px}
.scoreboard-table.wincount-total col:nth-child(3){width:50px}
.scoreboard-table.wincount-total.has-money col:nth-child(2){width:44px}
.scoreboard-table.wincount-total.has-money col:nth-child(3){width:78px}
.scoreboard-table.wincount-total.has-money col:nth-child(4){width:46px}
@media (min-width:480px){.scoreboard-table.wincount-total col:nth-child(2){width:64px}.scoreboard-table.wincount-total col:nth-child(3){width:64px}.scoreboard-table.wincount-total.has-money col:nth-child(2){width:56px}.scoreboard-table.wincount-total.has-money col:nth-child(3){width:96px}.scoreboard-table.wincount-total.has-money col:nth-child(4){width:56px}}
```

The narrow widths are deliberate. A four-column header at 400px is exactly what wrapped the header when the Money column was added, so the total board's columns are set independently of the three-column `.scoreboard-table` defaults rather than inheriting them.

- [ ] **Step 4: Typecheck the new components in isolation**

Run: `npx tsc --noEmit --jsx react-jsx --esModuleInterop --moduleResolution bundler --module esnext --target es2020 --strict src/components/WinCountGameTabs.tsx src/components/WinCountTotalBoard.tsx`
Expected: exits 0. (A full `tsc -b` still fails on `WinCountScore.tsx` until Task 5.)

- [ ] **Step 5: Commit**

```bash
git add src/components/WinCountGameTabs.tsx src/components/WinCountTotalBoard.tsx src/styles/site.css
git commit -m "feat: add Win Count game tab strip and total board

Total | G1 | G2 strip scrolls sideways instead of wrapping. The total
board carries its own column widths rather than inheriting the
three-column scoreboard defaults, which is what wrapped the header the
last time a fourth column appeared.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Roster editor

**Files:**
- Create: `src/components/WinCountRosterModal.tsx`

**Interfaces:**
- Consumes: `SessionPlayer`, `fillBlankNames`, `findDuplicateNameIndex`, `normalizeName` from `src/lib/session`; `MIN_WIN_COUNT_PLAYERS`, `MAX_WIN_COUNT_PLAYERS` from `src/lib/winCount`; `formatMoney`, `formatMoneySigned` from `src/lib/money`.
- Produces:
  - `interface RosterResult { existing: Array<{ id: string; playing: boolean }>; added: string[]; betAmount: number }`
  - named export `WinCountRosterForm` — props `{ players: SessionPlayer[]; defaultBet: number; submitLabel: string; onSubmit: (r: RosterResult) => void; onCancel?: () => void }`
  - default export `WinCountRosterModal` — the same props plus `title: string`, wrapped in the app's modal chrome

This replaces the inline `WinCountNewGameForm` currently living inside `WinCountScore.tsx`; Task 5 deletes that.

- [ ] **Step 1: Create the component**

Create `src/components/WinCountRosterModal.tsx`:

```tsx
import React, { useState } from 'react';
import type { SessionPlayer } from '../lib/session';
import { fillBlankNames, findDuplicateNameIndex, normalizeName } from '../lib/session';
import { MIN_WIN_COUNT_PLAYERS, MAX_WIN_COUNT_PLAYERS } from '../lib/winCount';
import { formatMoney, formatMoneySigned } from '../lib/money';

export interface RosterResult {
  existing: Array<{ id: string; playing: boolean }>;
  /** Names for players not yet on the roster, already trimmed and de-blanked. */
  added: string[];
  betAmount: number;
}

interface WinCountRosterFormProps {
  players: SessionPlayer[];
  defaultBet: number;
  submitLabel: string;
  onSubmit: (result: RosterResult) => void;
  onCancel?: () => void;
}

/**
 * Pre-filled roster editor.
 *
 * Existing players arrive checked; unchecking one sits them out of the next
 * game without touching their totals. The bet arrives filled in from the
 * session. Nothing the player already typed is ever typed again — that is the
 * entire reason this component exists.
 */
export const WinCountRosterForm: React.FC<WinCountRosterFormProps> = ({
  players,
  defaultBet,
  submitLabel,
  onSubmit,
  onCancel,
}) => {
  const [playing, setPlaying] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(players.map((p) => [p.id, true]))
  );
  const [added, setAdded] = useState<string[]>(() =>
    players.length === 0 ? ['', '', '', ''] : []
  );
  const [bet, setBet] = useState(defaultBet);

  const checkedExisting = players.filter((p) => playing[p.id]);
  const allNames = [...checkedExisting.map((p) => p.name), ...added];
  const filled = fillBlankNames(allNames);
  const duplicateIndex = findDuplicateNameIndex(filled);
  const duplicateName = duplicateIndex === null ? null : filled[duplicateIndex];
  const count = filled.length;

  let error: string | null = null;
  if (duplicateName) error = `"${duplicateName}" is already in this game. Names must be unique.`;
  else if (count < MIN_WIN_COUNT_PLAYERS) error = `Need at least ${MIN_WIN_COUNT_PLAYERS} players.`;
  else if (count > MAX_WIN_COUNT_PLAYERS) error = `At most ${MAX_WIN_COUNT_PLAYERS} players.`;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (error) return;
    const addedFilled = filled.slice(checkedExisting.length);
    onSubmit({
      existing: players.map((p) => ({ id: p.id, playing: !!playing[p.id] })),
      added: addedFilled,
      betAmount: bet,
    });
  };

  const winnerTakes = bet * Math.max(0, count - 1);

  return (
    <form onSubmit={handleSubmit} className="score-new-game-form host-new-game-form">
      {players.length > 0 && (
        <div className="wincount-roster-existing">
          <p className="score-new-game-hint">Who is playing?</p>
          {players.map((p) => (
            <label key={p.id} className="wincount-roster-row">
              <input
                type="checkbox"
                checked={!!playing[p.id]}
                onChange={(e) => setPlaying((prev) => ({ ...prev, [p.id]: e.target.checked }))}
              />
              <span>{p.name}</span>
            </label>
          ))}
        </div>
      )}

      {added.map((name, i) => (
        <label key={i} className="score-new-game-label">
          <span>{players.length > 0 ? 'New player' : `Player ${i + 1}`}</span>
          <input
            type="text"
            value={name}
            onChange={(e) =>
              setAdded((prev) => {
                const next = [...prev];
                next[i] = e.target.value;
                return next;
              })
            }
            placeholder={`Player ${checkedExisting.length + i + 1}`}
            maxLength={20}
            className="score-input"
          />
        </label>
      ))}

      <button
        type="button"
        className="score-btn score-btn-secondary wincount-add-player-btn"
        onClick={() => setAdded((prev) => [...prev, ''])}
        disabled={count >= MAX_WIN_COUNT_PLAYERS}
      >
        + Add player
      </button>

      <label className="host-config-label">
        <span>Bet per loser</span>
        <input
          type="number"
          min={0}
          step={1000}
          value={bet}
          onChange={(e) => setBet(Math.max(0, Number(e.target.value) || 0))}
          className="score-input"
        />
      </label>
      <p className="score-config-preview">
        {bet === 0
          ? 'No money tracked. Set a bet to settle up in cash.'
          : `${formatMoney(bet)} → winner of a ${count}-player round gets ${formatMoneySigned(winnerTakes)}`}
      </p>

      {error && <p className="wincount-roster-error">{error}</p>}

      <div className="score-new-game-actions">
        {onCancel && (
          <button type="button" className="score-btn score-btn-secondary" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button type="submit" className="score-btn score-btn-primary" disabled={!!error}>
          {submitLabel}
        </button>
      </div>
    </form>
  );
};

interface WinCountRosterModalProps extends WinCountRosterFormProps {
  title: string;
}

const WinCountRosterModal: React.FC<WinCountRosterModalProps> = ({ title, ...formProps }) => (
  <div
    className="score-modal-overlay"
    onClick={formProps.onCancel}
    role="dialog"
    aria-modal="true"
    aria-labelledby="wincount-roster-title"
  >
    <div className="score-modal" onClick={(e) => e.stopPropagation()}>
      <h2 id="wincount-roster-title" className="score-modal-title">
        {title}
      </h2>
      <WinCountRosterForm {...formProps} />
    </div>
  </div>
);

export default WinCountRosterModal;
```

Note `normalizeName` is imported for the added-names path; if your final code does not call it, drop it from the import to avoid a new lint error.

- [ ] **Step 2: Add the roster CSS**

Append to `src/styles/site.css`, after the block added in Task 3:

```css
.wincount-roster-existing{display:flex;flex-direction:column;gap:4px;margin-bottom:8px}
.wincount-roster-row{display:flex;align-items:center;gap:8px;font-size:12px;color:#fff;cursor:pointer}
.wincount-roster-row input[type=checkbox]{width:16px;height:16px;accent-color:#d3a446;flex-shrink:0}
.wincount-add-player-btn{align-self:flex-start;font-size:11px;padding:4px 8px}
.wincount-roster-error{color:#d97a7a;font-size:11px;margin:4px 0 0}
@media (min-width:480px){.wincount-roster-row{font-size:13px}.wincount-roster-error{font-size:12px}}
```

- [ ] **Step 3: Typecheck the component**

Run: `npx tsc --noEmit --jsx react-jsx --esModuleInterop --moduleResolution bundler --module esnext --target es2020 --strict src/components/WinCountRosterModal.tsx`
Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add src/components/WinCountRosterModal.tsx src/styles/site.css
git commit -m "feat: add pre-filled Win Count roster editor

Existing players arrive checked; unchecking sits them out of the next
game without touching their totals. Duplicate names and out-of-range
player counts block submit with an inline reason.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Wire WinCountScore to the session, then verify in a browser

**Files:**
- Modify: `src/components/WinCountScore.tsx` (whole file)
- Modify: `README.md:24-28` and the file tree around `README.md:141` and `README.md:150`

**Interfaces:**
- Consumes: everything from Tasks 1–4.
- Produces: no new exports. `WinCountScore` stays the default export consumed by `ScoreTracking.tsx`.

- [ ] **Step 1: Replace the component's state and derived values**

In `src/components/WinCountScore.tsx`, replace the imports and the top of the component with:

```tsx
import React, { useState, useEffect, useCallback } from 'react';
import {
  loadWinCountSession,
  saveWinCountSession,
  createWinCountSession,
  startWinCountGame,
  replaceGame,
  resetWinCountGame,
  addWinCountRound,
  updateWinCountRound,
  removeWinCountRound,
  calcWinCountTotalScores,
  calcWinCountTotalMoney,
  calcWinCountSessionTotals,
  calcWinCountRoundPoints,
  calcWinCountRoundMoney,
  shouldShowSessionMoney,
  getGamePlayers,
  DEFAULT_WIN_COUNT_CONFIG,
} from '../lib/winCount';
import type { WinCountSession, WinCountGame, WinCountConfig, WinCountRound } from '../lib/winCount';
import { createSessionPlayer } from '../lib/session';
import type { SessionPlayer } from '../lib/session';
import { formatMoney, formatMoneySigned } from '../lib/money';
import AddWinRoundModal from './AddWinRoundModal';
import ScoreViewToggle from './ScoreViewToggle';
import type { ScoreView } from './ScoreViewToggle';
import WinCountGameTabs from './WinCountGameTabs';
import type { WinCountTab } from './WinCountGameTabs';
import WinCountTotalBoard from './WinCountTotalBoard';
import WinCountRosterModal, { WinCountRosterForm } from './WinCountRosterModal';
import type { RosterResult } from './WinCountRosterModal';

const WinCountScore: React.FC = () => {
  const [session, setSession] = useState<WinCountSession | null>(() => loadWinCountSession());
  const [tab, setTab] = useState<WinCountTab>(() => 0);
  const [showConfig, setShowConfig] = useState(false);
  const [showAddRound, setShowAddRound] = useState(false);
  const [showRosterModal, setShowRosterModal] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showNewSessionConfirm, setShowNewSessionConfirm] = useState(false);
  const [configEdit, setConfigEdit] = useState<WinCountConfig>(DEFAULT_WIN_COUNT_CONFIG);
  const [roundToDelete, setRoundToDelete] = useState<number | null>(null);
  const [roundToEdit, setRoundToEdit] = useState<number | null>(null);
  const [selectedRoundIndex, setSelectedRoundIndex] = useState<number | null>(null);
  const [historyView, setHistoryView] = useState<ScoreView>('points');

  // Open on the active game, not on Total.
  useEffect(() => {
    if (session) setTab(session.activeGameIndex);
    // Only on first load of a session; later tab changes are the user's.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id]);

  useEffect(() => {
    if (session) saveWinCountSession(session);
  }, [session]);

  const gameIndex = tab === 'total' ? -1 : tab;
  const game: WinCountGame | null =
    session && gameIndex >= 0 ? session.games[gameIndex] ?? null : null;

  useEffect(() => {
    if (game) setConfigEdit(game.config);
  }, [game]);

  /** Write an edited game back into the session. */
  const putGame = useCallback(
    (next: WinCountGame) => {
      setSession((prev) => (prev ? replaceGame(prev, gameIndex, next) : prev));
    },
    [gameIndex]
  );
```

- [ ] **Step 2: Replace the handlers**

Replace `handleNewGame`, `handleNewGameFromModal`, `handleSaveRound`, `confirmRemoveRound` and `confirmResetScores` with:

```tsx
  const handleNewSession = useCallback((result: RosterResult) => {
    const base = createWinCountSession(result.added);
    const config = { betAmount: result.betAmount };
    setSession({
      ...base,
      config,
      games: base.games.map((g) => ({ ...g, config })),
    });
    setTab(0);
    setShowRosterModal(false);
  }, []);

  const handleNewGame = useCallback(
    (result: RosterResult) => {
      setSession((prev) => {
        if (!prev) return prev;
        const newPlayers = result.added.map(createSessionPlayer);
        const withPlayers: WinCountSession = {
          ...prev,
          players: [...prev.players, ...newPlayers],
        };
        const playerIds = [
          ...result.existing.filter((e) => e.playing).map((e) => e.id),
          ...newPlayers.map((p) => p.id),
        ];
        const next = startWinCountGame(withPlayers, playerIds, { betAmount: result.betAmount });
        setTab(next.activeGameIndex);
        return next;
      });
      setShowRosterModal(false);
    },
    []
  );

  const handleSaveRound = useCallback(
    (round: WinCountRound) => {
      if (!game) return;
      putGame(
        roundToEdit !== null
          ? updateWinCountRound(game, roundToEdit, round)
          : addWinCountRound(game, round)
      );
      setShowAddRound(false);
      setRoundToEdit(null);
    },
    [game, roundToEdit, putGame]
  );

  const confirmRemoveRound = useCallback(() => {
    if (!game || roundToDelete === null) return;
    putGame(removeWinCountRound(game, roundToDelete));
    if (selectedRoundIndex !== null) {
      if (selectedRoundIndex === roundToDelete) setSelectedRoundIndex(null);
      else if (selectedRoundIndex > roundToDelete) setSelectedRoundIndex((i) => (i ?? 0) - 1);
    }
    setRoundToDelete(null);
  }, [game, roundToDelete, selectedRoundIndex, putGame]);

  const confirmResetScores = useCallback(() => {
    if (!game) return;
    putGame(resetWinCountGame(game));
    setShowResetConfirm(false);
  }, [game, putGame]);

  const confirmNewSession = useCallback(() => {
    setSession(null);
    setTab(0);
    setShowNewSessionConfirm(false);
  }, []);
```

- [ ] **Step 3: Replace the render**

Replace the empty-state early return and the returned JSX header/scoreboard block with:

```tsx
  if (!session) {
    return (
      <div className="tienlen-new-game">
        <h3 className="scoreboard-title">New Session</h3>
        <p className="score-new-game-hint">
          Enter player names ({MIN_WIN_COUNT_PLAYERS}–{MAX_WIN_COUNT_PLAYERS})
        </p>
        <WinCountRosterForm
          players={[]}
          defaultBet={0}
          submitLabel="Start"
          onSubmit={handleNewSession}
        />
      </div>
    );
  }

  const totals = calcWinCountSessionTotals(session);
  const showMoney = shouldShowSessionMoney(session);
  const gamePlayers: SessionPlayer[] = game ? getGamePlayers(session, game) : [];
  const scores = game ? calcWinCountTotalScores(game) : {};
  const money = game ? calcWinCountTotalMoney(game) : {};
  const sortedPlayers = [...gamePlayers].sort((a, b) => (scores[b.id] ?? 0) - (scores[a.id] ?? 0));
  const gameLabel = gameIndex >= 0 ? `G${gameIndex + 1}` : '';

  return (
    <div className="wincount-score tienlen-score">
      <div className="score-header">
        <button
          type="button"
          className="score-btn score-btn-secondary"
          onClick={() => setShowConfig(true)}
          disabled={!game}
        >
          Config
        </button>
        <button
          type="button"
          className="score-btn score-btn-secondary"
          onClick={() => setShowResetConfirm(true)}
          disabled={!game}
        >
          Reset Scores
        </button>
        <button
          type="button"
          className="score-btn score-btn-secondary"
          onClick={() => setShowRosterModal(true)}
        >
          New Game
        </button>
        <button
          type="button"
          className="score-btn score-btn-secondary"
          onClick={() => setShowNewSessionConfirm(true)}
        >
          New Session
        </button>
      </div>

      <WinCountGameTabs gameCount={session.games.length} selected={tab} onSelect={setTab} />

      {tab === 'total' ? (
        <WinCountTotalBoard
          players={session.players}
          scores={totals.scores}
          money={totals.money}
          gamesPlayed={totals.gamesPlayed}
          showMoney={showMoney}
        />
      ) : (
        <>
          {/* the existing .scoreboard block, unchanged except that it maps
              sortedPlayers (resolved from the session) instead of game.players */}
        </>
      )}
```

Keep the existing scoreboard markup verbatim inside that fragment — it already maps `sortedPlayers` and reads `scores` / `money`, all of which are now defined above.

Then guard the game-only surfaces. The Add Round button becomes:

```tsx
      {game && (
        <button
          type="button"
          className="score-btn score-btn-primary score-add-round-btn"
          onClick={() => {
            setRoundToEdit(null);
            setShowAddRound(true);
          }}
        >
          Add Round — {gameLabel}
        </button>
      )}
```

The round history, the add-round modal, the round detail modal, the config modal, the reset confirm and the delete confirm all render only when `game` is non-null. Change each `{game.rounds.length > 0 && (` style guard to `{game && game.rounds.length > 0 && (`, and pass `players={gamePlayers}` where those children currently receive `game.players`.

Add the roster modal and the new-session confirm:

```tsx
      {showRosterModal && (
        <WinCountRosterModal
          title="New Game"
          players={session.players}
          defaultBet={session.config.betAmount}
          submitLabel="Start"
          onSubmit={handleNewGame}
          onCancel={() => setShowRosterModal(false)}
        />
      )}

      {showNewSessionConfirm && (
        <div
          className="score-modal-overlay"
          onClick={() => setShowNewSessionConfirm(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="wincount-new-session-title"
        >
          <div className="score-modal" onClick={(e) => e.stopPropagation()}>
            <h2 id="wincount-new-session-title" className="score-modal-title">
              Start a new session?
            </h2>
            <p className="score-reset-hint">
              This deletes all {session.games.length} game
              {session.games.length === 1 ? '' : 's'} and the totals. It cannot be undone.
            </p>
            <div className="score-modal-actions">
              <button
                type="button"
                className="score-btn score-btn-secondary"
                onClick={() => setShowNewSessionConfirm(false)}
              >
                Cancel
              </button>
              <button type="button" className="score-btn score-btn-primary" onClick={confirmNewSession}>
                New Session
              </button>
            </div>
          </div>
        </div>
      )}
```

Update the reset confirm copy to name the game: `Reset scores in {gameLabel}?` and `This clears every round in {gameLabel}. Players and config stay.`

Config save writes both the game and the session default so the next game inherits it:

```tsx
          onSave={() => {
            if (!game) return;
            putGame({ ...game, config: configEdit });
            setSession((prev) => (prev ? { ...prev, config: configEdit } : prev));
            setShowConfig(false);
          }}
```

`WinCountConfigModal` takes `playerCount={gamePlayers.length}`.

Delete `WinCountNewGameForm` entirely — `WinCountRosterForm` replaces it. Remove the now-unused `MIN_WIN_COUNT_PLAYERS` / `MAX_WIN_COUNT_PLAYERS` imports only if nothing else in the file uses them; the empty-state hint above still does.

`WinCountRoundHistoryTable` and `WinCountRoundDetailModal` currently read `game.players`. Change both to take a `players: SessionPlayer[]` prop and pass `gamePlayers`.

- [ ] **Step 4: Typecheck and build**

Run: `npx tsc -b && npm run build`
Expected: both exit 0. Fix any error before continuing — the whole repo must compile now.

- [ ] **Step 5: Run the full test suite**

Run: `npx vitest run`
Expected: PASS, count above 86, zero failures.

- [ ] **Step 6: Verify in a browser at phone width**

Run `npm run dev`, open the app, unlock the access gate, go to **Card Score → Win Count**, and set the viewport to 400px wide. Walk this exact script:

1. Start a session with 5 players and a bet of 5000. Confirm the bet preview reads `5,000 → winner of a 5-player round gets +20,000`.
2. Record 3 rounds with different winners. Confirm the scoreboard and money update and that the header does **not** wrap.
3. Press **New Game**. Confirm all 5 names are pre-filled and checked and the bet shows 5000 without retyping.
4. Add a 6th player, press Start. Confirm the tab strip now shows `Total | G1 | G2` and G2 is selected.
5. Record 2 rounds in G2. Open the **Total** tab. Confirm the first 5 players' wins and money include G1, the 6th player shows `Games = 1`, and the money column sums to zero across all rows.
6. Press **New Game**, uncheck one player, Start. Confirm G3 excludes them and their Total row keeps its earlier numbers with `Games = 2`.
7. Try to add a player with a name already in the list. Confirm the inline error appears and Start is disabled.
8. Tap **G1**. Confirm its scoreboard is its own, the button reads `Add Round — G1`, and editing a G1 round updates only G1 and the Total.
9. Reload the page. Confirm the session, all games, the selected game and all totals survive.
10. Confirm no horizontal scrollbar on the page at 400px.

Record the result of each step. If any step fails, fix it and re-run the whole script.

- [ ] **Step 7: Verify the v1 migration against real data**

In the browser console, before loading the page, seed the old shape:

```js
localStorage.setItem('liarbar-card-score-wincount', JSON.stringify({
  id: 'old', createdAt: 1,
  players: [{id:'p1',name:'Nam'},{id:'p2',name:'Linh'},{id:'p3',name:'Huy'}],
  config: { betAmount: 5000 },
  rounds: [{winnerId:'p1'},{winnerId:'p2'},{winnerId:'p1'}],
}));
```

Reload. Expected: one session, one game `G1`, Nam 2 wins / +15,000, Linh 1 win / 0, Huy 0 wins / −15,000, and the Total tab agreeing with G1. Then press New Game and confirm the three names are pre-filled.

- [ ] **Step 8: Update the README**

At `README.md:27`, extend the Win Count bullet:

```markdown
  - *Win Count* – 2–10 players, one winner per round scoring 1 point; generic enough for most trick-taking games. Games are grouped into a session: changing the roster starts Game 2, Game 3, … each with its own scoreboard, plus a Total board summing wins and money across them
```

In the file tree, add the new files next to their siblings:

```
│   │   ├── WinCountGameTabs.tsx
│   │   ├── WinCountRosterModal.tsx
│   │   ├── WinCountScore.tsx
│   │   ├── WinCountTotalBoard.tsx
```

and

```
│   │   ├── session.ts
│   │   └── winCount.ts
```

- [ ] **Step 9: Confirm no new lint errors**

Run: `npm run lint 2>&1 | tail -30`
Expected: the pre-existing failures only. Compare against `git stash`-ing your changes if unsure. Do not fix pre-existing errors here.

- [ ] **Step 10: Commit**

```bash
git add src/components/WinCountScore.tsx README.md
git commit -m "feat: Win Count games are now a session with a total board

New Game carries the roster and the bet forward and starts Game N+1
instead of wiping the scoreboard. A tab strip switches between Total
and each game; New Session is the explicit way to throw it all away.
Existing saved games migrate to Game 1.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| Session model, roster, totals helpers | 1 |
| `playerIds`, session totals, Games count, money visibility | 2 |
| Migration from v1 | 2 (logic + tests), 5 step 7 (real data) |
| Total board, Games column | 3 |
| Tab strip, opens on active game | 3, 5 |
| Any game fully editable, `Add Round — G2` label | 5 |
| New Game / Reset Scores / New Session | 5 |
| Roster editor, pre-filled, checkboxes, bet inherited | 4 |
| Duplicate names in all three entry points | 1 (rule), 4 (new session + new game), 5 (rename is not exposed in the UI — see gap below) |
| Component split | 3, 4, 5 |
| 400px layout, no horizontal scroll | 3 (CSS), 5 step 6 |

**Gap found and accepted:** the spec mentions rename as a third place duplicate names are entered, but no task exposes a rename UI — the current app has never had one, and adding it is scope the author did not ask for. `renameSessionPlayer` is built and tested in Task 1 so the rule is enforced the moment a rename surface appears. Flag this to the author at execution time rather than silently adding a rename button.

**Placeholder scan:** clean. Every code step carries real code. The one prose-only instruction — "keep the existing scoreboard markup verbatim" in Task 5 Step 3 — refers to code already in the repo rather than code to invent.

**Type consistency:** `SessionPlayer` is the single player type throughout; `Player` in `winCount.ts` is an alias so `AddWinRoundModal` keeps compiling. `WinCountTab` is defined in Task 3 and consumed in Task 5. `RosterResult` is defined in Task 4 and consumed in Task 5. `replaceGame` and `putGame` are distinct on purpose: the former is the pure lib function, the latter the component's bound wrapper.
