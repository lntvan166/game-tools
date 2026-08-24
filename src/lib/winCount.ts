import { resolveMoneyRate } from './money';

export interface Player {
  id: string;
  name: string;
}

export interface WinCountConfig {
  /** Money each loser pays the winner, per round. Raw currency, default 0. */
  betAmount: number;
}

export interface WinCountRound {
  winnerId: string;
  /** Config in force when the round was recorded; edits to config do not repice it. */
  configSnapshot?: WinCountConfig;
}

export interface WinCountGame {
  id: string;
  players: Player[];
  config: WinCountConfig;
  rounds: WinCountRound[];
  createdAt: number;
}

export const MIN_WIN_COUNT_PLAYERS = 2;
export const MAX_WIN_COUNT_PLAYERS = 10;

export const DEFAULT_WIN_COUNT_CONFIG: WinCountConfig = {
  betAmount: 0,
};

const STORAGE_KEY = 'liarbar-card-score-wincount';

function genId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function createWinCountGame(playerNames: string[]): WinCountGame {
  const names = playerNames.slice(0, MAX_WIN_COUNT_PLAYERS);
  return {
    id: genId(),
    players: names.map((name, i) => ({
      id: genId(),
      name: name.trim() || `Player ${i + 1}`,
    })),
    config: { ...DEFAULT_WIN_COUNT_CONFIG },
    rounds: [],
    createdAt: Date.now(),
  };
}

/** Winner scores 1; everyone else scores 0. */
export function calcWinCountRoundPoints(
  round: WinCountRound,
  _config: WinCountConfig,
  playerIds: string[]
): Record<string, number> {
  const points: Record<string, number> = {};
  playerIds.forEach((id) => (points[id] = id === round.winnerId ? 1 : 0));
  return points;
}

/**
 * Winner collects the bet from every other player; each loser pays one bet.
 * Zero-sum by construction: (n-1) * bet in, (n-1) * bet out.
 */
export function calcWinCountRoundMoney(
  round: WinCountRound,
  config: WinCountConfig,
  playerIds: string[]
): Record<string, number> {
  const bet = resolveMoneyRate(round.configSnapshot?.betAmount, config.betAmount);
  const money: Record<string, number> = {};
  playerIds.forEach((id) => (money[id] = 0));

  if (!playerIds.includes(round.winnerId)) return money;

  const losers = playerIds.filter((id) => id !== round.winnerId);
  money[round.winnerId] = losers.length * bet;
  losers.forEach((id) => (money[id] = -bet));
  return money;
}

function sumOverRounds(
  game: WinCountGame,
  calc: (
    round: WinCountRound,
    config: WinCountConfig,
    playerIds: string[]
  ) => Record<string, number>
): Record<string, number> {
  const totals: Record<string, number> = {};
  game.players.forEach((p) => (totals[p.id] = 0));
  const playerIds = game.players.map((p) => p.id);

  game.rounds.forEach((round) => {
    const perRound = calc(round, game.config, playerIds);
    Object.entries(perRound).forEach(([id, v]) => {
      totals[id] = (totals[id] ?? 0) + v;
    });
  });

  return totals;
}

export function calcWinCountTotalScores(game: WinCountGame): Record<string, number> {
  return sumOverRounds(game, calcWinCountRoundPoints);
}

export function calcWinCountTotalMoney(game: WinCountGame): Record<string, number> {
  return sumOverRounds(game, calcWinCountRoundMoney);
}

export function loadWinCountGame(): WinCountGame | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WinCountGame;
    if (!parsed.players?.length || !Array.isArray(parsed.rounds)) return null;
    if (!parsed.config) parsed.config = { ...DEFAULT_WIN_COUNT_CONFIG };
    return parsed;
  } catch {
    return null;
  }
}

export function saveWinCountGame(game: WinCountGame): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(game));
    }
  } catch {
    /* ignore */
  }
}

export function addWinCountRound(game: WinCountGame, round: WinCountRound): WinCountGame {
  return {
    ...game,
    rounds: [...game.rounds, { ...round, configSnapshot: game.config }],
  };
}

export function updateWinCountRound(
  game: WinCountGame,
  roundIndex: number,
  round: WinCountRound
): WinCountGame {
  if (roundIndex < 0 || roundIndex >= game.rounds.length) return game;
  const rounds = [...game.rounds];
  rounds[roundIndex] = { ...round, configSnapshot: game.config };
  return { ...game, rounds };
}

export function removeWinCountRound(game: WinCountGame, roundIndex: number): WinCountGame {
  if (roundIndex < 0 || roundIndex >= game.rounds.length) return game;
  return { ...game, rounds: game.rounds.filter((_, i) => i !== roundIndex) };
}

export function resetWinCountGame(game: WinCountGame): WinCountGame {
  return { ...game, rounds: [], id: genId(), createdAt: Date.now() };
}
