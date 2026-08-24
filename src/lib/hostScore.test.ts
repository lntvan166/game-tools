import { describe, it, expect } from 'vitest';
import { createHostGame, calcHostTotalScores } from './hostScore';
import type { HostGame, HostRoundResult } from './hostScore';

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
