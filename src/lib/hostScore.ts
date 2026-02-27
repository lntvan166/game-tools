export interface Player {
  id: string;
  name: string;
}

export interface HostConfig {
  betAmount: number;
}

export interface HostPlayerResult {
  result: 'win' | 'lose' | 'draw';
  multiplier: number;
}

export interface HostRoundResult {
  hostId: string;
  results: Record<string, HostPlayerResult>;
  configSnapshot?: HostConfig;
}

export interface HostGame {
  id: string;
  players: Player[];
  config: HostConfig;
  rounds: HostRoundResult[];
  createdAt: number;
}

const STORAGE_KEY = 'liarbar-card-score-host';

function genId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export const DEFAULT_HOST_CONFIG: HostConfig = {
  betAmount: 1,
};

export function createHostGame(playerNames: string[]): HostGame {
  const count = Math.max(2, playerNames.length);
  const names = playerNames.slice(0, count);
  return {
    id: genId(),
    players: names.map((name, i) => ({
      id: genId(),
      name: name.trim() || `Player ${i + 1}`,
    })),
    config: { ...DEFAULT_HOST_CONFIG },
    rounds: [],
    createdAt: Date.now(),
  };
}

export function calcHostRoundPoints(
  round: HostRoundResult,
  config: HostConfig,
  playerIds: string[]
): Record<string, number> {
  const points: Record<string, number> = {};
  playerIds.forEach((id) => (points[id] = 0));

  const bet = round.configSnapshot?.betAmount ?? config.betAmount;
  const hostId = round.hostId;

  Object.entries(round.results).forEach(([playerId, r]) => {
    if (playerId === hostId) return;
    const amt = bet * r.multiplier;
    if (r.result === 'win') {
      points[playerId] = (points[playerId] ?? 0) + amt;
      points[hostId] = (points[hostId] ?? 0) - amt;
    } else if (r.result === 'lose') {
      points[playerId] = (points[playerId] ?? 0) - amt;
      points[hostId] = (points[hostId] ?? 0) + amt;
    }
  });

  return points;
}

export function calcHostTotalScores(game: HostGame): Record<string, number> {
  const totals: Record<string, number> = {};
  game.players.forEach((p) => (totals[p.id] = 0));
  const playerIds = game.players.map((p) => p.id);

  game.rounds.forEach((round) => {
    const roundPts = calcHostRoundPoints(round, game.config, playerIds);
    Object.entries(roundPts).forEach(([id, pts]) => {
      totals[id] = (totals[id] ?? 0) + pts;
    });
  });

  return totals;
}

export function loadHostGame(): HostGame | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as HostGame;
    if (!parsed.players?.length || !Array.isArray(parsed.rounds)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveHostGame(game: HostGame): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(game));
    }
  } catch {
    /* ignore */
  }
}

export function addHostRound(game: HostGame, result: HostRoundResult): HostGame {
  return {
    ...game,
    rounds: [...game.rounds, { ...result, configSnapshot: game.config }],
  };
}

export function removeHostRound(game: HostGame, roundIndex: number): HostGame {
  if (roundIndex < 0 || roundIndex >= game.rounds.length) return game;
  const rounds = game.rounds.filter((_, i) => i !== roundIndex);
  return { ...game, rounds };
}

export function updateHostRound(
  game: HostGame,
  roundIndex: number,
  result: HostRoundResult
): HostGame {
  if (roundIndex < 0 || roundIndex >= game.rounds.length) return game;
  const rounds = [...game.rounds];
  rounds[roundIndex] = { ...result, configSnapshot: game.config };
  return { ...game, rounds };
}

export function resetHostGame(game: HostGame): HostGame {
  return {
    ...game,
    rounds: [],
    id: genId(),
    createdAt: Date.now(),
  };
}
