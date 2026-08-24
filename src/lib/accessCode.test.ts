import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  normalizeCode,
  hashCode,
  getValidHashes,
  isGateEnabled,
  isHashValid,
  loadStoredHash,
  saveStoredHash,
  clearStoredHash,
} from './accessCode';

/**
 * The node test environment has no localStorage. Install a minimal in-memory
 * stand-in so the storage functions exercise their real code paths rather than
 * silently taking their `typeof localStorage === 'undefined'` early return.
 */
function installMemoryStorage(): void {
  let store: Record<string, string> = {};
  const mock = {
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => { store[k] = String(v); },
    removeItem: (k: string) => { delete store[k]; },
    clear: () => { store = {}; },
  };
  (globalThis as unknown as { localStorage: unknown }).localStorage = mock;
}

function removeStorage(): void {
  delete (globalThis as unknown as { localStorage?: unknown }).localStorage;
}

describe('normalizeCode', () => {
  it('uppercases', () => {
    expect(normalizeCode('qrtx8m2p')).toBe('QRTX8M2P');
  });

  it('strips dashes and whitespace', () => {
    expect(normalizeCode('QRTX-8M2P')).toBe('QRTX8M2P');
    expect(normalizeCode('  QRTX 8M2P  ')).toBe('QRTX8M2P');
    expect(normalizeCode('qrtx - 8m2p')).toBe('QRTX8M2P');
  });

  it('maps every equivalent spelling to the same canonical form', () => {
    const forms = ['QRTX8M2P', 'QRTX-8M2P', 'qrtx8m2p', 'Qrtx-8M2p', ' qrtx 8m2p '];
    const normalized = forms.map(normalizeCode);
    expect(new Set(normalized).size).toBe(1);
  });

  it('leaves characters outside the generated alphabet alone', () => {
    // The app must not reject them; normalization is not validation.
    expect(normalizeCode('ilou-1234')).toBe('ILOU1234');
  });
});

describe('hashCode', () => {
  it('produces the known SHA-256 of the normalized code', async () => {
    // SHA-256("QRTX8M2P"). Pinning this constant means any future change to the
    // hashing or normalization rules fails loudly here, rather than silently
    // invalidating every stored hash in the wild.
    expect(await hashCode('QRTX-8M2P')).toBe(
      '7bd00dc8f777386e341728fdc8e5b73b5e84116eb1c55e40c409a85fdeb4cacd'
    );
  });

  it('gives equivalent spellings the same hash', async () => {
    const a = await hashCode('QRTX-8M2P');
    const b = await hashCode('  qrtx8m2p ');
    expect(a).toBe(b);
  });

  it('returns lowercase hex of the right length', async () => {
    const h = await hashCode('ABCD-1234');
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it('gives different codes different hashes', async () => {
    expect(await hashCode('ABCD-1234')).not.toBe(await hashCode('ABCD-1235'));
  });
});

describe('getValidHashes', () => {
  it('splits a comma-separated list', () => {
    expect(getValidHashes('aaa,bbb,ccc')).toEqual(['aaa', 'bbb', 'ccc']);
  });

  it('tolerates whitespace around entries', () => {
    expect(getValidHashes(' aaa , bbb ')).toEqual(['aaa', 'bbb']);
  });

  it('ignores empty segments and trailing commas', () => {
    expect(getValidHashes('aaa,,bbb,')).toEqual(['aaa', 'bbb']);
  });

  it('lowercases entries so comparison is case-insensitive', () => {
    expect(getValidHashes('AAA,BbB')).toEqual(['aaa', 'bbb']);
  });

  it('returns an empty array for empty or whitespace-only input', () => {
    expect(getValidHashes('')).toEqual([]);
    expect(getValidHashes('   ')).toEqual([]);
    expect(getValidHashes(',,,')).toEqual([]);
  });
});

describe('isGateEnabled', () => {
  it('is false when nothing is configured', () => {
    expect(isGateEnabled('')).toBe(false);
    expect(isGateEnabled('   ')).toBe(false);
    expect(isGateEnabled(',,')).toBe(false);
  });

  it('is true when at least one hash is configured', () => {
    expect(isGateEnabled('aaa')).toBe(true);
  });
});

describe('isHashValid', () => {
  it('accepts a listed hash', () => {
    expect(isHashValid('bbb', 'aaa,bbb')).toBe(true);
  });

  it('rejects an unlisted hash', () => {
    expect(isHashValid('zzz', 'aaa,bbb')).toBe(false);
  });

  it('rejects null', () => {
    expect(isHashValid(null, 'aaa,bbb')).toBe(false);
  });

  it('compares case-insensitively', () => {
    expect(isHashValid('BBB', 'aaa,bbb')).toBe(true);
  });

  it('rejects everything when no hashes are configured', () => {
    // The gate being disabled is decided by isGateEnabled, not by pretending
    // an arbitrary hash is valid.
    expect(isHashValid('aaa', '')).toBe(false);
  });

  it('REVOCATION: a previously valid hash is rejected once dropped from the list', () => {
    const stored = 'bbb';
    expect(isHashValid(stored, 'aaa,bbb')).toBe(true);
    expect(isHashValid(stored, 'aaa')).toBe(false);
  });
});

describe('storage', () => {
  beforeEach(installMemoryStorage);
  afterEach(removeStorage);

  it('round-trips a hash', () => {
    saveStoredHash('abc123');
    expect(loadStoredHash()).toBe('abc123');
  });

  it('returns null when nothing is stored', () => {
    expect(loadStoredHash()).toBeNull();
  });

  it('clears a stored hash', () => {
    saveStoredHash('abc123');
    clearStoredHash();
    expect(loadStoredHash()).toBeNull();
  });

  it('uses the liarbar-access key and touches no other key', () => {
    localStorage.setItem('liarbar-mode', 'score');
    localStorage.setItem('liarbar-card-score-host', '{}');
    saveStoredHash('abc123');
    expect(localStorage.getItem('liarbar-access')).toBe('abc123');
    expect(localStorage.getItem('liarbar-mode')).toBe('score');
    clearStoredHash();
    expect(localStorage.getItem('liarbar-mode')).toBe('score');
    expect(localStorage.getItem('liarbar-card-score-host')).toBe('{}');
  });
});

describe('storage when localStorage is unavailable', () => {
  beforeEach(removeStorage);

  it('does not throw and reports nothing stored', () => {
    expect(() => saveStoredHash('abc')).not.toThrow();
    expect(() => clearStoredHash()).not.toThrow();
    expect(loadStoredHash()).toBeNull();
  });
});
