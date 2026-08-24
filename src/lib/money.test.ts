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
