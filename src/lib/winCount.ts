import { resolveMoneyRate, shouldShowMoney } from './money';
import {
  SESSION_VERSION,
  createSessionPlayer,
  genId,
  startNextGame,
  sumTotals,
  countGamesPlayed,
  loadSession,
  saveSession,
} from './session';
import type { Session, SessionGame, SessionPlayer } from './session';

/** Win Count's name for a roster entry. Identity lives on the session. */
export type Player = SessionPlayer;

export interface WinCountConfig {
  /** Money each loser pays the winner, per round. Raw currency, default 0. */
  betAmount: number;
}

export interface WinCountRound {
  winnerId: string;
  /** Config in force when the round was recorded; edits to config do not reprice it. */
  configSnapshot?: WinCountConfig;
}

export interface WinCountGame extends SessionGame {
  config: WinCountConfig;
  rounds: WinCountRound[];
}

export interface WinCountSession extends Session<WinCountGame> {
  /** Bet a newly started game inherits. Each game may then diverge. */
  config: WinCountConfig;
}

export const MIN_WIN_COUNT_PLAYERS = 2;
export const MAX_WIN_COUNT_PLAYERS = 10;

export const DEFAULT_WIN_COUNT_CONFIG: WinCountConfig = {
  betAmount: 0,
};

const STORAGE_KEY = 'liarbar-card-score-wincount';

export function createWinCountSession(playerNames: string[]): WinCountSession {
  const names = playerNames.slice(0, MAX_WIN_COUNT_PLAYERS);
  const players = names.map((name, i) => createSessionPlayer(name.trim() || `Player ${i + 1}`));
  const now = Date.now();
  return {
    id: genId(),
    version: SESSION_VERSION,
    players,
    games: [
      {
        id: genId(),
        playerIds: players.map((p) => p.id),
        config: { ...DEFAULT_WIN_COUNT_CONFIG },
        rounds: [],
        createdAt: now,
      },
    ],
    activeGameIndex: 0,
    createdAt: now,
    config: { ...DEFAULT_WIN_COUNT_CONFIG },
  };
}

/**
 * Start Game N+1 for `playerIds`. The new game inherits the session bet unless
 * `config` overrides it, and an override also becomes the session default so the
 * next game does not have to be retyped either.
 */
export function startWinCountGame(
  session: WinCountSession,
  playerIds: string[],
  config?: WinCountConfig
): WinCountSession {
  const nextConfig = { ...(config ?? session.config) };
  const withGame = startNextGame<WinCountGame, WinCountSession>(session, playerIds, (base) => ({
    ...base,
    config: nextConfig,
    rounds: [],
  }));
  return { ...withGame, config: nextConfig };
}

/** Put an edited game back into the session without disturbing the others. */
export function replaceGame(
  session: WinCountSession,
  index: number,
  game: WinCountGame
): WinCountSession {
  if (index < 0 || index >= session.games.length) return session;
  return { ...session, games: session.games.map((g, i) => (i === index ? game : g)) };
}

/** Roster entries for a game, in the game's own player order. */
export function getGamePlayers(session: WinCountSession, game: WinCountGame): SessionPlayer[] {
  return game.playerIds
    .map((id) => session.players.find((p) => p.id === id))
    .filter((p): p is SessionPlayer => p !== undefined);
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

/**
 * Shared round-traversal scaffold for calcWinCountTotalScores and
 * calcWinCountTotalMoney. Both must walk rounds identically, so the
 * traversal lives in one place: `calc` receives each round, the game
 * config, and playerIds, and returns that round's per-player contribution
 * to the total.
 *
 * This is intentionally parallel to `sumOverRounds` in `hostScore.ts` — a
 * fix to one likely applies to the other too.
 */
function sumOverRounds(
  game: WinCountGame,
  calc: (
    round: WinCountRound,
    config: WinCountConfig,
    playerIds: string[]
  ) => Record<string, number>
): Record<string, number> {
  const totals: Record<string, number> = {};
  const playerIds = game.playerIds;
  playerIds.forEach((id) => (totals[id] = 0));

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

export function calcWinCountSessionTotals(session: WinCountSession): {
  scores: Record<string, number>;
  money: Record<string, number>;
  gamesPlayed: Record<string, number>;
} {
  return {
    scores: sumTotals(session.games.map(calcWinCountTotalScores)),
    money: sumTotals(session.games.map(calcWinCountTotalMoney)),
    gamesPlayed: countGamesPlayed(session),
  };
}

/**
 * Money surfaces show if any round of any game was ever priced — the
 * per-game rule from `money.ts`, widened to the session, so a bet set back to
 * zero cannot hide money that is still owed.
 */
export function shouldShowSessionMoney(session: WinCountSession): boolean {
  return session.games.some((g) =>
    shouldShowMoney(
      g.config.betAmount,
      g.rounds.map((r) => r.configSnapshot?.betAmount)
    )
  );
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

/**
 * Validate a v2 session, or migrate the v1 single-game blob into one.
 *
 * v1 was a bare game: `{ id, players, config, rounds, createdAt }`. It becomes
 * Game 1 of a session whose roster is the old player list, so an in-progress
 * game survives the upgrade with its rounds and money intact.
 */
export function parseWinCountSession(raw: unknown): WinCountSession | null {
  if (!isRecord(raw)) return null;
  const players = raw.players;
  if (!Array.isArray(players) || players.length === 0) return null;

  if (Array.isArray(raw.games)) {
    if (raw.games.length === 0) return null;
    const games = raw.games as WinCountGame[];
    if (games.some((g) => !Array.isArray(g?.playerIds) || !Array.isArray(g?.rounds))) return null;
    const activeGameIndex =
      typeof raw.activeGameIndex === 'number' &&
      raw.activeGameIndex >= 0 &&
      raw.activeGameIndex < games.length
        ? raw.activeGameIndex
        : games.length - 1;
    return {
      id: typeof raw.id === 'string' ? raw.id : genId(),
      version: SESSION_VERSION,
      players: players as SessionPlayer[],
      games: games.map((g) => ({ ...g, config: g.config ?? { ...DEFAULT_WIN_COUNT_CONFIG } })),
      activeGameIndex,
      createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : Date.now(),
      config: isRecord(raw.config)
        ? { betAmount: Number(raw.config.betAmount) || 0 }
        : { ...DEFAULT_WIN_COUNT_CONFIG },
    };
  }

  // v1: a bare game.
  if (!Array.isArray(raw.rounds)) return null;
  const config = isRecord(raw.config)
    ? ({ betAmount: Number(raw.config.betAmount) || 0 } as WinCountConfig)
    : { ...DEFAULT_WIN_COUNT_CONFIG };
  const createdAt = typeof raw.createdAt === 'number' ? raw.createdAt : Date.now();
  return {
    id: genId(),
    version: SESSION_VERSION,
    players: players as SessionPlayer[],
    games: [
      {
        id: typeof raw.id === 'string' ? raw.id : genId(),
        playerIds: (players as SessionPlayer[]).map((p) => p.id),
        config,
        rounds: raw.rounds as WinCountRound[],
        createdAt,
      },
    ],
    activeGameIndex: 0,
    createdAt,
    config,
  };
}

export function loadWinCountSession(): WinCountSession | null {
  return loadSession<WinCountSession>(STORAGE_KEY, parseWinCountSession);
}

export function saveWinCountSession(session: WinCountSession): void {
  saveSession(STORAGE_KEY, session);
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
