# Win Count: multi-game sessions with a total board

**Date:** 2026-09-14
**Status:** Approved design, ready for implementation planning
**Scope:** Win Count mode only. The session layer is built generic so Tien Len
and Host can adopt it later, but neither is touched in this effort.

## Problem

Win Count persists exactly one game under `liarbar-card-score-wincount`. The
roster is fixed at game creation, so any roster change forces "New Game", which
discards players, rounds and money and makes the author retype every name.

Two real cases hit this every session:

- A sixth player arrives. The five existing names must be retyped, and the five
  players' accumulated wins and money are gone.
- A player leaves. Same loss.

The author wants the night to be one session containing Game 1, Game 2, ... —
each game keeping its own board, with a total board summing across all of them.

## Goals

1. A session holds an ordered list of games. Changing the roster starts a new
   game instead of destroying history.
2. Player identity is stable across games, so totals follow a player who joins
   late or sits one out.
3. A Total board sums wins and money across every game in the session.
4. Nothing already typed is ever retyped: names carry forward, the bet carries
   forward.
5. Duplicate player names are rejected at entry.
6. Existing saved games survive as Game 1 of a new session.

## Non-goals

- Applying sessions to Tien Len or Host. The shared module is built for it;
  wiring is a later effort.
- Multi-device sync or any server. Everything stays in `localStorage`.
- Cross-session history. "New Session" discards the old one; there is no
  archive of past nights.
- Deleting a player from a session outright. Unchecking them for a game is the
  supported way to drop someone, and it preserves their totals.

## Decisions taken during brainstorming

| Question | Chosen | Alternative rejected |
|---|---|---|
| Scope | Win Count now, on a generic `lib/session.ts` | All three modes at once |
| Player identity | Session-level roster with stable ids | Match games by name string |
| Bet scope | Session default, inherited by each game, editable per game | One bet for the whole session |
| Navigation | Tab strip `Total \| G1 \| G2 \| ...` | Dropdown picker; pinned total with arrows |
| Storage key | Reuse `liarbar-card-score-wincount`, add `version: 2` | New key alongside the old one |

---

## Architecture

```
src/lib/session.ts              NEW   generic session model + roster + totals + storage
src/lib/session.test.ts         NEW
src/lib/winCount.ts             EDIT  playerIds instead of players; session totals; migration
src/lib/winCount.test.ts        EDIT
src/components/WinCountScore.tsx      EDIT  session state, tab strip wiring
src/components/WinCountGameTabs.tsx   NEW   Total | G1 | G2 strip
src/components/WinCountTotalBoard.tsx NEW   cross-game totals table
src/components/WinCountRosterModal.tsx NEW  pre-filled roster editor
src/styles/site.css             EDIT  tab strip, total board
```

`WinCountScore.tsx` is already 539 lines and this effort adds three surfaces to
it. The three extractions above are part of the work, not an optional cleanup.

### Session model

```ts
export interface SessionPlayer {
  id: string;
  name: string;
}

export interface Session<TGame> {
  id: string;
  version: 2;
  /** Every player who has appeared in any game of this session. */
  players: SessionPlayer[];
  games: TGame[];
  activeGameIndex: number;
  createdAt: number;
}
```

`session.ts` owns, and is tested for:

- `normalizeName`, `isDuplicateName(players, name, excludeId?)` — trimmed,
  case-insensitive comparison.
- `addSessionPlayer`, `renameSessionPlayer` — reject duplicates.
- `startNextGame(session, playerIds, makeGame)` — appends a game and points
  `activeGameIndex` at it.
- `getActiveGame(session)`.
- `sumTotals(perGameTotals[])` — adds per-player maps. A player id missing
  from a map contributes nothing and does not create a zero entry, so the
  Games count can distinguish "played and scored 0" from "did not play".
- `countGamesPlayed(session)`.
- `loadSession(key, migrate)` / `saveSession(key, session)` — the same
  try/catch, `typeof localStorage === 'undefined'` guarded shape the existing
  libs use.

### Win Count changes

`WinCountGame.players: Player[]` becomes `WinCountGame.playerIds: string[]`.
Names live once, on the session, so a rename updates every board at once.

```ts
export interface WinCountSession extends Session<WinCountGame> {
  /** Default bet inherited by each new game. */
  config: WinCountConfig;
}
```

Scoring functions keep their current signatures against a single game; they
take `playerIds` from the game rather than deriving them from `game.players`.
`configSnapshot` on a round is unchanged, so history never reprices.

New: `calcSessionTotals(session)` returning `{ scores, money, gamesPlayed }`
keyed by player id, built by summing each game's existing per-game totals
through `sumTotals`.

---

## Behaviour

### Total board

Rows are every player in `session.players`, sorted by total wins descending.

| Player | Wins | Money | Games |
|---|---|---|---|
| Van | 7 | +45,000 | 3 |
| Minh | 4 | -20,000 | 3 |
| Linh | 1 | -5,000 | 1 |

The Games column is required, not decorative: it is what explains a late
joiner's small totals.

A player absent from a game contributes 0 to it and takes no loss from it.
Money therefore stays zero-sum within each game, and the session money column
sums to zero across all players.

The Money column follows the existing `shouldShowMoney` rule, evaluated across
every round of every game in the session: if any round anywhere was priced, the
column shows.

### Navigation

A tab strip sits above the scoreboard: `Total | G1 | G2 | G3`. It scrolls
horizontally past roughly four games and opens on the active game, not on
Total.

Any selected game is fully editable — rounds can be added, edited and deleted
on Game 1 after Game 3 has started, so mistakes are fixable. To make the target
unambiguous the primary button reads `Add Round — G2`, naming the selected
game.

The Total tab shows no Add Round button and no round history.

### Buttons

| Button | Behaviour |
|---|---|
| New Game | Opens the roster editor, pre-filled. Starts Game N+1. Old games kept. |
| Reset Scores | Clears the rounds of the selected game only. Confirm dialog, existing copy adjusted to name the game. |
| New Session | New. Discards every game and all totals. Confirm dialog. |

### Roster editor

Opened by New Game. Lists every session player with a checkbox, all checked by
default. Unchecking a player means they sit out this game; they stay in
`session.players` and keep their totals. `+ Add player` appends an empty name
row. The bet field is pre-filled from the session default.

A game requires at least `MIN_WIN_COUNT_PLAYERS` (2) checked players and allows
at most `MAX_WIN_COUNT_PLAYERS` (10); Start is disabled otherwise with an
inline reason.

### Duplicate names

Rejected on `name.trim().toLowerCase()` collision, in all three places a name
is entered: the new-session form, the roster editor, and rename. The offending
field shows an inline error and submit is disabled.

The check runs *after* blank names are auto-filled to `Player N`, so typing
"Player 2" into slot 1 and leaving slot 2 blank is caught rather than silently
creating two players named "Player 2".

---

## Migration

The current stored value is a bare `WinCountGame`:
`{ id, players: Player[], config, rounds, createdAt }` with no version field.

On load:

1. Blob has a `games` array -> treat as v2, use as is.
2. Blob has `players` and `rounds` -> wrap it. `players` become
   `session.players`; the old game becomes `games[0]` with
   `playerIds = players.map(p => p.id)`; the old `config` becomes the session
   default; `activeGameIndex = 0`.
3. Anything else -> `null`, and the new-session form shows.

The migrated session is written back to the same key, now carrying
`version: 2`. The author's in-progress game survives as Game 1 with its rounds,
players and money intact.

Rolling back to an older build is degraded but not destructive: the old loader
requires a top-level `rounds` array, does not find one, returns `null`, and
shows the new-game form. The v2 data stays in `localStorage` untouched.

---

## Testing

`src/lib/session.test.ts` (new):

- roster add / rename, duplicate rejection including case and whitespace
- `startNextGame` appends and moves `activeGameIndex`
- `sumTotals` across games with disjoint player sets
- absent player contributes no score and no loss
- load/save round trip, and the `localStorage`-unavailable path

`src/lib/winCount.test.ts` (extended):

- scoring against `playerIds` rather than `players`
- `calcSessionTotals` with a player who joins at Game 2 — wins, money and
  `gamesPlayed` all correct
- money sums to zero across the session
- migration: the literal v1 shape in, totals identical out

All 86 existing tests must stay green.

Browser verification before the work is called done: create a session, play
rounds, add a sixth player, confirm the first five keep their totals, uncheck a
player, confirm the Total board and the Games column, reload the page, confirm
persistence.

## Estimated cost

Roughly 3-4 hours: about 1.5h on `session.ts` and its tests, 2h on the UI
including the three extractions, the remainder on browser verification.
