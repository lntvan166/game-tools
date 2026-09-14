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
function setup(
  names: string[],
  betAmount = 0
): { session: WinCountSession; game: WinCountGame; ids: string[] } {
  const base = createWinCountSession(names);
  const session: WinCountSession = {
    ...base,
    config: { betAmount },
    games: base.games.map((g) => ({ ...g, config: { betAmount } })),
  };
  return { session, game: session.games[0], ids: session.players.map((p) => p.id) };
}

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

describe('calcWinCountRoundPoints', () => {
  it('gives the winner 1 and everyone else 0', () => {
    const { game, ids } = setup(['A', 'B', 'C']);
    const points = calcWinCountRoundPoints({ winnerId: ids[1] }, game.config, ids);
    expect(points).toEqual({ [ids[0]]: 0, [ids[1]]: 1, [ids[2]]: 0 });
  });

  it('gives everyone 0 when the winner is not in the game', () => {
    const { game, ids } = setup(['A', 'B']);
    const points = calcWinCountRoundPoints({ winnerId: 'ghost' }, game.config, ids);
    expect(points).toEqual({ [ids[0]]: 0, [ids[1]]: 0 });
  });
});

describe('calcWinCountRoundMoney', () => {
  it('pays the winner bet x number of losers, per the spec example', () => {
    const { game, ids } = setup(['A', 'B', 'C', 'D', 'E', 'F'], 5000);
    const money = calcWinCountRoundMoney({ winnerId: ids[0] }, game.config, ids);
    expect(money[ids[0]]).toBe(25000);
    ids.slice(1).forEach((id) => expect(money[id]).toBe(-5000));
  });

  it('sums to zero', () => {
    const { game, ids } = setup(['A', 'B', 'C', 'D'], 5000);
    const money = calcWinCountRoundMoney({ winnerId: ids[2] }, game.config, ids);
    expect(Object.values(money).reduce((s, v) => s + v, 0)).toBe(0);
  });

  it('handles the two-player case', () => {
    const { game, ids } = setup(['A', 'B'], 5000);
    const money = calcWinCountRoundMoney({ winnerId: ids[0] }, game.config, ids);
    expect(money).toEqual({ [ids[0]]: 5000, [ids[1]]: -5000 });
  });

  it('yields all zeros at a bet of zero', () => {
    const { game, ids } = setup(['A', 'B', 'C'], 0);
    const money = calcWinCountRoundMoney({ winnerId: ids[0] }, game.config, ids);
    expect(Object.values(money).every((v) => v === 0)).toBe(true);
  });

  it('prefers the round snapshot bet over the current config', () => {
    const { game, ids } = setup(['A', 'B', 'C'], 5000);
    const money = calcWinCountRoundMoney(
      { winnerId: ids[0], configSnapshot: { betAmount: 1000 } },
      game.config,
      ids
    );
    expect(money[ids[0]]).toBe(2000);
    expect(money[ids[1]]).toBe(-1000);
  });
});

describe('totals', () => {
  it('counts total score as rounds won', () => {
    const { game, ids } = setup(['A', 'B', 'C'], 5000);
    let g = addWinCountRound(game, { winnerId: ids[0] });
    g = addWinCountRound(g, { winnerId: ids[0] });
    g = addWinCountRound(g, { winnerId: ids[1] });
    const scores = calcWinCountTotalScores(g);
    expect(scores).toEqual({ [ids[0]]: 2, [ids[1]]: 1, [ids[2]]: 0 });
  });

  it('accumulates money across rounds and stays zero-sum', () => {
    const { game, ids } = setup(['A', 'B', 'C'], 5000);
    let g = addWinCountRound(game, { winnerId: ids[0] });
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
    const { game } = setup(['A', 'B'], 5000);
    const g = addWinCountRound(game, { winnerId: 'x' });
    expect(g.rounds[0].configSnapshot).toEqual({ betAmount: 5000 });
  });

  it('re-stamps the current config when a round is edited', () => {
    const { game } = setup(['A', 'B'], 5000);
    let g = addWinCountRound(game, { winnerId: 'x' });
    g = { ...g, config: { betAmount: 1000 } };
    g = updateWinCountRound(g, 0, { winnerId: 'y' });
    expect(g.rounds[0]).toEqual({ winnerId: 'y', configSnapshot: { betAmount: 1000 } });
  });

  it('removes a round by index and leaves others intact', () => {
    const { game } = setup(['A', 'B'], 0);
    let g = addWinCountRound(game, { winnerId: 'a' });
    g = addWinCountRound(g, { winnerId: 'b' });
    g = removeWinCountRound(g, 0);
    expect(g.rounds).toHaveLength(1);
    expect(g.rounds[0].winnerId).toBe('b');
  });

  it('ignores an out-of-range index', () => {
    const { game } = setup(['A', 'B'], 0);
    const g = addWinCountRound(game, { winnerId: 'a' });
    expect(removeWinCountRound(g, 9).rounds).toHaveLength(1);
    expect(updateWinCountRound(g, -1, { winnerId: 'z' }).rounds[0].winnerId).toBe('a');
  });

  it('clears rounds but keeps players and config on reset', () => {
    const { game, ids } = setup(['A', 'B'], 5000);
    const played = addWinCountRound(game, { winnerId: ids[0] });
    const reset = resetWinCountGame(played);
    expect(reset.rounds).toEqual([]);
    expect(reset.playerIds).toEqual(ids);
    expect(reset.config).toEqual({ betAmount: 5000 });
  });
});

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
    s = {
      ...s,
      config: { betAmount: 0 },
      games: s.games.map((g) => ({ ...g, config: { betAmount: 0 } })),
    };
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
