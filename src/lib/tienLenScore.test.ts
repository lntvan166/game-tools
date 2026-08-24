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
