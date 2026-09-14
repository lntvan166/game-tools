/**
 * Generic multi-game session model shared by the Card Score modes.
 *
 * A session owns the roster; games own only player ids. That indirection is
 * what lets a player join at Game 3, sit out Game 4, and still have one row on
 * the total board. Renaming a player updates every board at once.
 *
 * Win Count is the first consumer. Tien Len and Host are expected to follow,
 * so nothing here may know about wins, points or bets.
 */

export interface SessionPlayer {
  id: string;
  name: string;
}

/** The shape every per-mode game must satisfy to live inside a session. */
export interface SessionGame {
  id: string;
  /** Ids into `Session.players`. Membership is per game, not per session. */
  playerIds: string[];
  createdAt: number;
}

export interface Session<TGame extends SessionGame> {
  id: string;
  version: number;
  /** Everyone who has played any game in this session. */
  players: SessionPlayer[];
  games: TGame[];
  activeGameIndex: number;
  createdAt: number;
}

export const SESSION_VERSION = 2;

export function genId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Display form: trimmed. */
export function normalizeName(name: string): string {
  return name.trim();
}

/** Comparison form: trimmed and lowercased. "Van" and " van " are one person. */
export function nameKey(name: string): string {
  return normalizeName(name).toLowerCase();
}

/** Blank entries become `Player N`, 1-based on position. */
export function fillBlankNames(names: string[]): string[] {
  return names.map((n, i) => normalizeName(n) || `Player ${i + 1}`);
}

/**
 * Index of the first name that repeats an earlier one, or null.
 *
 * Call this on the output of `fillBlankNames`, never on raw input: typing
 * "Player 2" into the first row and leaving the second blank produces two
 * players named "Player 2", and checking before the fill would miss it.
 */
export function findDuplicateNameIndex(names: string[]): number | null {
  const seen = new Set<string>();
  for (let i = 0; i < names.length; i++) {
    const key = nameKey(names[i]);
    if (seen.has(key)) return i;
    seen.add(key);
  }
  return null;
}

export function isNameTaken(
  players: SessionPlayer[],
  name: string,
  excludeId?: string
): boolean {
  const key = nameKey(name);
  return players.some((p) => p.id !== excludeId && nameKey(p.name) === key);
}

export function createSessionPlayer(name: string): SessionPlayer {
  return { id: genId(), name: normalizeName(name) };
}

/** Returns the session unchanged if the name is blank or already taken. */
export function renameSessionPlayer<S extends Session<SessionGame>>(
  session: S,
  playerId: string,
  name: string
): S {
  const next = normalizeName(name);
  if (!next) return session;
  if (isNameTaken(session.players, next, playerId)) return session;
  return {
    ...session,
    players: session.players.map((p) => (p.id === playerId ? { ...p, name: next } : p)),
  };
}

export function getActiveGame<TGame extends SessionGame>(
  session: Session<TGame>
): TGame | null {
  return session.games[session.activeGameIndex] ?? null;
}

/**
 * Append a game for `playerIds` and select it. Earlier games are untouched —
 * this is the whole point of the session: a roster change costs a new game,
 * never the old scoreboard.
 */
export function startNextGame<TGame extends SessionGame, S extends Session<TGame>>(
  session: S,
  playerIds: string[],
  makeGame: (base: SessionGame) => TGame
): S {
  const game = makeGame({ id: genId(), playerIds: [...playerIds], createdAt: Date.now() });
  return {
    ...session,
    games: [...session.games, game],
    activeGameIndex: session.games.length,
  };
}

/**
 * Add per-player maps together.
 *
 * A player id absent from a map contributes nothing and creates no entry, so a
 * caller can still tell "played and scored 0" from "did not play" by checking
 * `countGamesPlayed`.
 */
export function sumTotals(maps: Array<Record<string, number>>): Record<string, number> {
  const total: Record<string, number> = {};
  maps.forEach((map) => {
    Object.entries(map).forEach(([id, v]) => {
      total[id] = (total[id] ?? 0) + v;
    });
  });
  return total;
}

/** How many games each session player actually took part in. */
export function countGamesPlayed(session: Session<SessionGame>): Record<string, number> {
  const counts: Record<string, number> = {};
  session.players.forEach((p) => (counts[p.id] = 0));
  session.games.forEach((g) => {
    g.playerIds.forEach((id) => {
      counts[id] = (counts[id] ?? 0) + 1;
    });
  });
  return counts;
}

/**
 * `parse` receives the raw JSON and returns a validated session or null. Per-mode
 * migration lives there, so this function never learns about any mode's shape.
 */
export function loadSession<S>(key: string, parse: (raw: unknown) => S | null): S | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function saveSession<S>(key: string, session: S): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, JSON.stringify(session));
    }
  } catch {
    /* ignore */
  }
}
