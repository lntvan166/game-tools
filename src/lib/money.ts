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
    money[id] = pts * rate || 0;
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
