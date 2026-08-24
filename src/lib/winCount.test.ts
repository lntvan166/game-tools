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
