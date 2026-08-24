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

describe('calcHostTotalScores regression (hardcoded expected values)', () => {
  // Guards the shared round-traversal scaffold used by both calcHostTotalScores
  // and calcHostTotalMoney. Expected values below are computed by hand from the
  // round data, not derived by calling calcHostRoundPoints or any other
  // function under test - if the shared scaffold were subtly wrong, a test
  // that derived both sides from the same traversal would not catch it.
  it('sums points across multiple rounds, including a round with a differing configSnapshot', () => {
    const g = createHostGame(['Host', 'B', 'C']);
    const game: HostGame = { ...g, config: { ...g.config, betAmount: 2 } };
    const [hostId, bId, cId] = game.players.map((p) => p.id);

    // Round 1: configSnapshot.betAmount=5, differs from game.config.betAmount=2.
    // b wins with multiplier 2: amt=5*2=10 -> b:+10, host:-10
    // c loses with multiplier 1: amt=5*1=5 -> c:-5, host:+5
    // -> host: -10+5=-5, b:+10, c:-5
    const round1: HostRoundResult = {
      hostId,
      results: {
        [bId]: { result: 'win', multiplier: 2 },
        [cId]: { result: 'lose', multiplier: 1 },
      },
      configSnapshot: { ...game.config, betAmount: 5 },
    };

    // Round 2: no configSnapshot, falls back to game.config.betAmount=2.
    // b loses with multiplier 3: amt=2*3=6 -> b:-6, host:+6
    // c wins with multiplier 1: amt=2*1=2 -> c:+2, host:-2
    // -> host: +6-2=+4, b:-6, c:+2
    const round2: HostRoundResult = {
      hostId,
      results: {
        [bId]: { result: 'lose', multiplier: 3 },
        [cId]: { result: 'win', multiplier: 1 },
      },
    };

    // Round 3: configSnapshot.betAmount=2, matches game.config. Includes a
    // draw (no point effect) to exercise the non-win/lose branch.
    // b draws with multiplier 5: no effect -> b:0
    // c wins with multiplier 2: amt=2*2=4 -> c:+4, host:-4
    // -> host: -4, b:0, c:+4
    const round3: HostRoundResult = {
      hostId,
      results: {
        [bId]: { result: 'draw', multiplier: 5 },
        [cId]: { result: 'win', multiplier: 2 },
      },
      configSnapshot: { ...game.config, betAmount: 2 },
    };

    // Totals: host: -5+4-4=-5, b: 10-6+0=4, c: -5+2+4=1 (sums to 0).
    const finalGame: HostGame = { ...game, rounds: [round1, round2, round3] };
    const scores = calcHostTotalScores(finalGame);

    expect(scores[hostId]).toBe(-5);
    expect(scores[bId]).toBe(4);
    expect(scores[cId]).toBe(1);
  });
});

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
