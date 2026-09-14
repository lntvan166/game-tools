import { describe, it, expect } from 'vitest';
import {
  SESSION_VERSION,
  normalizeName,
  nameKey,
  fillBlankNames,
  findDuplicateNameIndex,
  isNameTaken,
  createSessionPlayer,
  renameSessionPlayer,
  getActiveGame,
  startNextGame,
  sumTotals,
  countGamesPlayed,
  loadSession,
  saveSession,
} from './session';
import type { Session, SessionGame, SessionPlayer } from './session';

// Vitest runs in the node environment (no DOM). The lib guards on
// `typeof localStorage === 'undefined'`, so exercising the stored path needs a
// stub. Installing jsdom for four assertions is not worth the dependency.
const memoryStore = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => memoryStore.get(k) ?? null,
  setItem: (k: string, v: string) => void memoryStore.set(k, v),
  removeItem: (k: string) => void memoryStore.delete(k),
  clear: () => memoryStore.clear(),
  key: (i: number) => [...memoryStore.keys()][i] ?? null,
  get length() {
    return memoryStore.size;
  },
} as Storage;

interface TestGame extends SessionGame {
  label: string;
}

function sessionOf(names: string[]): Session<TestGame> {
  const players: SessionPlayer[] = names.map(createSessionPlayer);
  return {
    id: 's1',
    version: SESSION_VERSION,
    players,
    games: [{ id: 'g1', playerIds: players.map((p) => p.id), createdAt: 1, label: 'G1' }],
    activeGameIndex: 0,
    createdAt: 1,
  };
}

describe('name helpers', () => {
  it('trims for display and lowercases for comparison', () => {
    expect(normalizeName('  Van  ')).toBe('Van');
    expect(nameKey('  VAN ')).toBe('van');
  });

  it('fills blank names with a positional default', () => {
    expect(fillBlankNames(['Nam', '   ', 'Linh'])).toEqual(['Nam', 'Player 2', 'Linh']);
  });

  it('finds the first duplicate ignoring case and whitespace', () => {
    expect(findDuplicateNameIndex(['Nam', 'Linh', ' nam '])).toBe(2);
    expect(findDuplicateNameIndex(['Nam', 'Linh'])).toBeNull();
  });

  it('catches a typed name colliding with an auto-filled one', () => {
    expect(findDuplicateNameIndex(fillBlankNames(['Player 2', '']))).toBe(1);
  });

  it('reports a name already on the roster, excluding the player being renamed', () => {
    const s = sessionOf(['Nam', 'Linh']);
    expect(isNameTaken(s.players, ' NAM ')).toBe(true);
    expect(isNameTaken(s.players, 'Nam', s.players[0].id)).toBe(false);
    expect(isNameTaken(s.players, 'Huy')).toBe(false);
  });
});

describe('createSessionPlayer', () => {
  it('trims the name and gives every player a distinct id', () => {
    const a = createSessionPlayer('  Nam ');
    const b = createSessionPlayer('Linh');
    expect(a.name).toBe('Nam');
    expect(a.id).not.toBe(b.id);
  });
});

describe('renameSessionPlayer', () => {
  it('renames in place and leaves games untouched', () => {
    const s = sessionOf(['Nam', 'Linh']);
    const next = renameSessionPlayer(s, s.players[0].id, ' Nam Jr ');
    expect(next.players[0].name).toBe('Nam Jr');
    expect(next.games).toEqual(s.games);
  });

  it('refuses a name already taken by someone else', () => {
    const s = sessionOf(['Nam', 'Linh']);
    expect(renameSessionPlayer(s, s.players[0].id, 'linh')).toBe(s);
  });

  it('refuses a blank name', () => {
    const s = sessionOf(['Nam', 'Linh']);
    expect(renameSessionPlayer(s, s.players[0].id, '   ')).toBe(s);
  });
});

describe('startNextGame', () => {
  it('appends a game and makes it active', () => {
    const s = sessionOf(['Nam', 'Linh']);
    const ids = s.players.map((p) => p.id);
    const next = startNextGame(s, ids, (base) => ({ ...base, label: 'G2' }));
    expect(next.games).toHaveLength(2);
    expect(next.activeGameIndex).toBe(1);
    expect(next.games[1].playerIds).toEqual(ids);
    expect(next.games[1].id).not.toBe(next.games[0].id);
  });

  it('leaves earlier games alone', () => {
    const s = sessionOf(['Nam', 'Linh']);
    const next = startNextGame(s, [s.players[0].id], (base) => ({ ...base, label: 'G2' }));
    expect(next.games[0]).toEqual(s.games[0]);
  });
});

describe('getActiveGame', () => {
  it('returns the game at activeGameIndex', () => {
    const s = sessionOf(['Nam']);
    expect(getActiveGame(s)?.id).toBe('g1');
  });

  it('returns null when the index is out of range', () => {
    const s = { ...sessionOf(['Nam']), activeGameIndex: 7 };
    expect(getActiveGame(s)).toBeNull();
  });
});

describe('sumTotals', () => {
  it('adds per-player maps across games', () => {
    expect(sumTotals([{ a: 2, b: 1 }, { a: 3, b: 0 }])).toEqual({ a: 5, b: 1 });
  });

  it('unions disjoint player sets without inventing entries', () => {
    const total = sumTotals([{ a: 1 }, { b: 2 }]);
    expect(total).toEqual({ a: 1, b: 2 });
  });

  it('returns an empty map for no games', () => {
    expect(sumTotals([])).toEqual({});
  });
});

describe('countGamesPlayed', () => {
  it('counts only the games a player appears in', () => {
    const s = sessionOf(['Nam', 'Linh']);
    const [nam, linh] = s.players.map((p) => p.id);
    const withLateJoiner: Session<TestGame> = {
      ...s,
      players: [...s.players, createSessionPlayer('Huy')],
      games: [...s.games, { id: 'g2', playerIds: [nam, linh], createdAt: 2, label: 'G2' }],
    };
    const huy = withLateJoiner.players[2].id;
    const counts = countGamesPlayed(withLateJoiner);
    expect(counts[nam]).toBe(2);
    expect(counts[huy]).toBe(0);
  });
});

describe('storage', () => {
  it('round trips a session through localStorage', () => {
    const s = sessionOf(['Nam']);
    saveSession('test-session-key', s);
    const loaded = loadSession<Session<TestGame>>('test-session-key', (raw) => raw as Session<TestGame>);
    expect(loaded).toEqual(s);
  });

  it('returns null when nothing is stored', () => {
    expect(loadSession('test-missing-key', (raw) => raw as Session<TestGame>)).toBeNull();
  });

  it('returns null rather than throwing on unparseable data', () => {
    localStorage.setItem('test-bad-key', '{not json');
    expect(loadSession('test-bad-key', (raw) => raw as Session<TestGame>)).toBeNull();
  });

  it('returns null when the parser rejects the blob', () => {
    saveSession('test-reject-key', { nope: true });
    expect(loadSession('test-reject-key', () => null)).toBeNull();
  });
});
