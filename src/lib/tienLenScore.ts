export type CatchType = 'red2' | 'black2' | 'threePairs' | 'fourPairs' | 'fourOfKind';

export interface TienLenConfig {
  pointsFirst: number;
  pointsSecond: number;
  pointsThird: number;
  pointsFourth: number;
  pointsCatchRed2: number;
  pointsCatchBlack2: number;
  pointsCatchThreePairs: number;
  pointsCatchFourPairs: number;
  pointsCatchFourOfKind: number;
  pointsLastRed2: number;
  pointsLastBlack2: number;
  pointsLastThreePairs: number;
  pointsLastFourPairs: number;
  pointsLastFourOfKind: number;
  pointsToiTrangPerLoser: number;
  pointsRucPerPerson: number;
}

export interface Player {
  id: string;
  name: string;
}

export interface CatchItem {
  type: CatchType;
  qty: number;
}

export interface Catch {
  catcherId: string;
  victimId: string;
  items: CatchItem[];
}

export interface LastWith {
  playerId: string;
  type: CatchType;
}

export interface RoundResult {
  order: string[];
  catch: Catch[];
  last: LastWith[];
  customPoints?: Record<string, number>;
  isToiTrang?: boolean;
  winnerId?: string;
  rucCount?: number;
  /** Config used when round was added; future rounds use this, not current game.config */
  configSnapshot?: TienLenConfig;
}

/** @deprecated Use Catch - backward compat */
export interface Catch2 {
  catcherId: string;
  victimId: string;
  type: 'red' | 'black';
}

/** @deprecated Use LastWith - backward compat */
export interface LastWith2 {
  playerId: string;
  type: 'red' | 'black';
}

export interface TienLenGame {
  id: string;
  players: Player[];
  config: TienLenConfig;
  rounds: RoundResult[];
  createdAt: number;
}

export const DEFAULT_CONFIG: TienLenConfig = {
  pointsFirst: 2,
  pointsSecond: 1,
  pointsThird: -1,
  pointsFourth: -2,
  pointsCatchRed2: 2,
  pointsCatchBlack2: 1,
  pointsCatchThreePairs: 2,
  pointsCatchFourPairs: 2,
  pointsCatchFourOfKind: 2,
  pointsLastRed2: -2,
  pointsLastBlack2: -1,
  pointsLastThreePairs: -2,
  pointsLastFourPairs: -2,
  pointsLastFourOfKind: -2,
  pointsToiTrangPerLoser: 4,
  pointsRucPerPerson: 4,
};

/** Default win points by player count; each set sums to 0 */
export function getDefaultConfigForPlayerCount(playerCount: number): TienLenConfig {
  const n = Math.max(2, Math.min(4, playerCount));
  const base = { ...DEFAULT_CONFIG };
  if (n === 2) {
    base.pointsFirst = 2;
    base.pointsSecond = -2;
    base.pointsThird = 0;
    base.pointsFourth = 0;
  } else if (n === 3) {
    base.pointsFirst = 2;
    base.pointsSecond = 0;
    base.pointsThird = -2;
    base.pointsFourth = 0;
  } else {
    base.pointsFirst = 2;
    base.pointsSecond = 1;
    base.pointsThird = -1;
    base.pointsFourth = -2;
  }
  return base;
}

const STORAGE_KEY = 'liarbar-card-score-tienlen';

function genId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function getCatchPoints(type: CatchType, config: TienLenConfig): number {
  switch (type) {
    case 'red2': return config.pointsCatchRed2;
    case 'black2': return config.pointsCatchBlack2;
    case 'threePairs': return config.pointsCatchThreePairs;
    case 'fourPairs': return config.pointsCatchFourPairs;
    case 'fourOfKind': return config.pointsCatchFourOfKind;
    default: return 0;
  }
}

function getLastPoints(type: CatchType, config: TienLenConfig): number {
  switch (type) {
    case 'red2': return config.pointsLastRed2;
    case 'black2': return config.pointsLastBlack2;
    case 'threePairs': return config.pointsLastThreePairs;
    case 'fourPairs': return config.pointsLastFourPairs;
    case 'fourOfKind': return config.pointsLastFourOfKind;
    default: return 0;
  }
}

export function migrateRound(round: Record<string, unknown>): RoundResult {
  const r = round as Record<string, unknown>;
  const order = (r.order as string[]) ?? [];
  let catchList: Catch[] = [];
  let lastList: LastWith[] = [];

  if (Array.isArray(r.catch) && r.catch.length > 0) {
    const migrated: Catch[] = [];
    (r.catch as Array<Record<string, unknown>>).forEach((c) => {
      const cc = c as Record<string, unknown>;
      if (Array.isArray(cc.items) && cc.victimId) {
        migrated.push(cc as unknown as Catch);
        return;
      }
      if (Array.isArray(cc.victims)) {
        const victims = cc.victims as Array<{ victimId: string; type: string }>;
        const byVictim = new Map<string, CatchItem[]>();
        victims.forEach((v) => {
          const vid = v.victimId || 'unknown';
          const t = (v.type === 'red' ? 'red2' : v.type === 'black' ? 'black2' : v.type) as CatchType;
          const arr = byVictim.get(vid) ?? [];
          const ex = arr.find((i) => i.type === t);
          if (ex) ex.qty++; else arr.push({ type: t, qty: 1 });
          byVictim.set(vid, arr);
        });
        byVictim.forEach((items, victimId) => {
          if (victimId !== 'unknown' && items.length > 0) {
            migrated.push({ catcherId: cc.catcherId as string, victimId, items });
          }
        });
        return;
      }
      if (cc.victimId) {
        migrated.push({
          catcherId: cc.catcherId as string,
          victimId: cc.victimId as string,
          items: [{ type: (cc.type === 'red' ? 'red2' : 'black2') as CatchType, qty: 1 }],
        });
      }
    });
    catchList = migrated;
  } else if (Array.isArray(r.catch2)) {
    const oldCatch = r.catch2 as Array<{ catcherId: string; victimId: string; type: string }>;
    catchList = oldCatch.map((c) => ({
      catcherId: c.catcherId,
      victimId: c.victimId,
      items: [{ type: (c.type === 'red' ? 'red2' : 'black2') as CatchType, qty: 1 }],
    }));
  }

  if (Array.isArray(r.last) && r.last.length > 0) {
    lastList = r.last as LastWith[];
  } else if (Array.isArray(r.lastWith2)) {
    const oldLast = r.lastWith2 as Array<{ playerId: string; type: string }>;
    lastList = oldLast.map((l) => ({
      playerId: l.playerId,
      type: (l.type === 'red' ? 'red2' : 'black2') as CatchType,
    }));
  }

  return {
    order,
    catch: catchList,
    last: lastList,
    customPoints: r.customPoints as Record<string, number> | undefined,
    isToiTrang: r.isToiTrang as boolean | undefined,
    winnerId: r.winnerId as string | undefined,
    rucCount: r.rucCount as number | undefined,
    configSnapshot: r.configSnapshot as TienLenConfig | undefined,
  };
}

export function migrateConfig(config: Record<string, unknown>): TienLenConfig {
  const c = config as Record<string, number>;
  return {
    pointsFirst: c.pointsFirst ?? DEFAULT_CONFIG.pointsFirst,
    pointsSecond: c.pointsSecond ?? DEFAULT_CONFIG.pointsSecond,
    pointsThird: c.pointsThird ?? DEFAULT_CONFIG.pointsThird,
    pointsFourth: c.pointsFourth ?? DEFAULT_CONFIG.pointsFourth,
    pointsCatchRed2: c.pointsCatchRed2 ?? DEFAULT_CONFIG.pointsCatchRed2,
    pointsCatchBlack2: c.pointsCatchBlack2 ?? DEFAULT_CONFIG.pointsCatchBlack2,
    pointsCatchThreePairs: c.pointsCatchThreePairs ?? DEFAULT_CONFIG.pointsCatchThreePairs,
    pointsCatchFourPairs: c.pointsCatchFourPairs ?? DEFAULT_CONFIG.pointsCatchFourPairs,
    pointsCatchFourOfKind: c.pointsCatchFourOfKind ?? DEFAULT_CONFIG.pointsCatchFourOfKind,
    pointsLastRed2: c.pointsLastRed2 ?? DEFAULT_CONFIG.pointsLastRed2,
    pointsLastBlack2: c.pointsLastBlack2 ?? DEFAULT_CONFIG.pointsLastBlack2,
    pointsLastThreePairs: c.pointsLastThreePairs ?? DEFAULT_CONFIG.pointsLastThreePairs,
    pointsLastFourPairs: c.pointsLastFourPairs ?? DEFAULT_CONFIG.pointsLastFourPairs,
    pointsLastFourOfKind: c.pointsLastFourOfKind ?? DEFAULT_CONFIG.pointsLastFourOfKind,
    pointsToiTrangPerLoser: c.pointsToiTrangPerLoser ?? DEFAULT_CONFIG.pointsToiTrangPerLoser,
    pointsRucPerPerson: c.pointsRucPerPerson ?? c.pointsRuc1 ?? DEFAULT_CONFIG.pointsRucPerPerson,
  };
}

export function createGame(playerNames: string[]): TienLenGame {
  const count = Math.max(2, Math.min(4, playerNames.length));
  const names = playerNames.slice(0, count);
  return {
    id: genId(),
    players: names.map((name, i) => ({ id: genId(), name: name.trim() || `Player ${i + 1}` })),
    config: getDefaultConfigForPlayerCount(count),
    rounds: [],
    createdAt: Date.now(),
  };
}

export function calcRoundPoints(
  round: RoundResult,
  config: TienLenConfig,
  playerIds: string[]
): Record<string, number> {
  const points: Record<string, number> = {};
  playerIds.forEach((id) => (points[id] = 0));

  if (round.customPoints && Object.keys(round.customPoints).length > 0) {
    playerIds.forEach((id) => {
      points[id] = round.customPoints![id] ?? 0;
    });
    return points;
  }

  const rucCount = round.rucCount ?? 0;
  const isSweep = rucCount > 0 && rucCount === playerIds.length - 1;
  const winnerId = round.isToiTrang ? round.winnerId : isSweep ? round.order[0] : undefined;
  if (winnerId && (round.isToiTrang || isSweep)) {
    const pts = config.pointsToiTrangPerLoser;
    const losers = playerIds.filter((id) => id !== winnerId);
    points[winnerId] = losers.length * pts;
    losers.forEach((id) => (points[id] = -pts));
    return points;
  }

  const rucPts = rucCount * (config.pointsRucPerPerson ?? 1);

  const [first, second, third, fourth] = round.order;
  if (first) points[first] = (points[first] ?? 0) + config.pointsFirst;
  if (second) points[second] = (points[second] ?? 0) + config.pointsSecond;
  if (third) points[third] = (points[third] ?? 0) + config.pointsThird;
  if (fourth) points[fourth] = (points[fourth] ?? 0) + config.pointsFourth;

  if (rucCount > 0 && round.order.length >= rucCount) {
    const rucIds = round.order.slice(-rucCount);
    rucIds.forEach((id) => {
      points[id] = (points[id] ?? 0) - rucPts;
    });
  }

  round.catch.forEach((c) => {
    c.items.forEach((item) => {
      const pts = getCatchPoints(item.type, config) * item.qty;
      points[c.catcherId] = (points[c.catcherId] ?? 0) + pts;
      points[c.victimId] = (points[c.victimId] ?? 0) - pts;
    });
  });

  round.last.forEach((l) => {
    const pts = getLastPoints(l.type, config);
    points[l.playerId] = (points[l.playerId] ?? 0) + pts;
  });

  return points;
}

export function calcTotalScores(game: TienLenGame): Record<string, number> {
  const totals: Record<string, number> = {};
  game.players.forEach((p) => (totals[p.id] = 0));
  const playerIds = game.players.map((p) => p.id);
  const config = migrateConfig(game.config as unknown as Record<string, unknown>);

  game.rounds.forEach((round) => {
    const migrated = migrateRound(round as unknown as Record<string, unknown>);
    const roundConfig = migrated.configSnapshot ? migrateConfig(migrated.configSnapshot as unknown as Record<string, unknown>) : config;
    const roundPts = calcRoundPoints(migrated, roundConfig, playerIds);
    Object.entries(roundPts).forEach(([id, pts]) => {
      totals[id] = (totals[id] ?? 0) + pts;
    });
  });

  return totals;
}

export function loadGame(): TienLenGame | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TienLenGame;
    if (!parsed.players?.length || !Array.isArray(parsed.rounds)) return null;
    parsed.config = migrateConfig(parsed.config as unknown as Record<string, unknown>);
    parsed.rounds = parsed.rounds.map((r) => migrateRound(r as unknown as Record<string, unknown>));
    return parsed;
  } catch {
    return null;
  }
}

export function saveGame(game: TienLenGame): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(game));
}

export function resetGame(game: TienLenGame): TienLenGame {
  return { ...game, rounds: [], id: genId(), createdAt: Date.now() };
}

export function removeRound(game: TienLenGame, roundIndex: number): TienLenGame {
  if (roundIndex < 0 || roundIndex >= game.rounds.length) return game;
  const rounds = game.rounds.filter((_, i) => i !== roundIndex);
  return { ...game, rounds };
}

export function updateRound(game: TienLenGame, roundIndex: number, result: RoundResult): TienLenGame {
  if (roundIndex < 0 || roundIndex >= game.rounds.length) return game;
  const rounds = [...game.rounds];
  rounds[roundIndex] = { ...result, configSnapshot: game.config };
  return { ...game, rounds };
}
