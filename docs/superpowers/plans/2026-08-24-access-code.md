# App Access Code Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gate the whole app behind a `XXXX-XXXX` access code whose valid values are configured as SHA-256 hashes in a build-time environment variable.

**Architecture:** A single `AccessGate` component wraps `<App/>` in `main.tsx` and renders either a code form or its children. All logic lives in one pure module, `src/lib/accessCode.ts`, which the gate consumes. What is stored in `localStorage` is the accepted code's *hash*, not a boolean — this makes load-time re-validation a synchronous string comparison (no async, no flash) and makes revocation real, because dropping a hash from the env var ejects everyone who used that code on their next visit.

**Tech Stack:** React 19, TypeScript 5.8, Vite 7, Web Crypto (`crypto.subtle`) in the app, `node:crypto` in the CLI tool, vitest for unit tests, `localStorage` for persistence. The Card Score UI is hand-written CSS in `src/styles/site.css`, not Tailwind.

**Spec:** `docs/superpowers/specs/2026-08-24-access-code-design.md`

## Branch context — read before Task 1

This branch (`feature/access-code`) is cut from `main`. A separate, unrelated feature branch (`feature/win-count-money`, PR #12) also adds vitest but is **not merged**. Therefore:

- **This plan adds vitest itself.** Do not assume a test runner exists — verify with `grep vitest package.json` in Task 1.
- If PR #12 merges before this branch does, rebasing onto `main` will produce a conflict in `package.json` and `package-lock.json` where both sides add the same `vitest` devDependency and the same `test` / `test:watch` scripts. Resolve by keeping one copy of each. This is expected and trivial; it is not a sign that anything went wrong.
- Do not merge, rebase, or cherry-pick from `feature/win-count-money` during implementation. The two features are independent.

## Global Constraints

- **No backend.** Client-side only. No serverless functions, no network calls, no database. `localStorage` is the only persistence.
- **This is a doorbell, not a lock.** The bundle is publicly downloadable and the check runs on the client. Never add code, comments, or docs that describe this as security, and never add a mitigation (rate limiting, obfuscation, key stretching) that would imply a security property the design does not have.
- `verbatimModuleSyntax: true` in `tsconfig.app.json` — every type-only import MUST use `import type { X } from '...'`. A plain `import { X }` for an interface fails the build.
- `strict`, `noUnusedLocals`, `noUnusedParameters` are all on. An unused variable, parameter, or import fails `npm run build`.
- `include: ["src"]` in `tsconfig.app.json` — test files under `src/` are type-checked by `npm run build`. This is intended.
- **Env var name is exactly `VITE_ACCESS_CODE_HASHES`.** Only `VITE_`-prefixed vars are exposed to client code by Vite.
- **Hashes are lowercase SHA-256 hex.** Comparison is case-insensitive on both sides.
- **Storage key is exactly `liarbar-access`.** Existing keys in use, which must not be touched: `liarbar-mode`, `liarbar-muted`, `liarbar-card-score-tienlen`, `liarbar-card-score-host`, `liarbar-deck-hint-dismissed`, `liarbar-poker-hint-dismissed`.
- **No codes configured means no gate.** Absent or empty env var opens the app normally, so `npm run dev` needs no setup and forks are not bricked.
- **Code alphabet is `0123456789ABCDEFGHJKMNPQRSTVWXYZ`** (32 chars, excluding `I`, `L`, `O`, `U`). This governs codes the author *generates*. The app MUST NOT reject characters outside it on input.
- **No rate limiting.** Deliberately omitted; see the spec.
- All `localStorage` access must be wrapped in `try`/`catch` — the codebase's existing pattern (see `src/App.tsx`'s `safeGetItem`), because storage throws in private browsing modes.
- Commit messages follow the repo's existing `feat:` / `fix:` / `docs:` / `test:` prefix convention.

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `src/lib/accessCode.ts` | Create | All access-code logic: normalize, hash, parse env, validate, storage. No React, no DOM beyond `localStorage`/`crypto`. |
| `src/lib/accessCode.test.ts` | Create | Unit tests for the above. |
| `src/vite-env.d.ts` | Modify | Type `VITE_ACCESS_CODE_HASHES` so it is not `any`. |
| `scripts/hash-code.mjs` | Create | CLI: turn codes into hashes for pasting into Vercel. |
| `src/components/AccessGate.tsx` | Create | The gate UI; renders children once unlocked. |
| `src/main.tsx` | Modify | Wrap `<App/>` in `<AccessGate>`. |
| `src/styles/site.css` | Modify | Gate layout styles. |
| `.env.example` | Create | Documents the env var. |
| `README.md` | Modify | Document setup, code generation, and the honest limitations. |
| `package.json` | Modify | vitest devDependency; `test`, `test:watch`, `hash-code` scripts. |

Tasks 1–2 are pure logic and fully unit-tested. Task 3 is UI, verified by build plus a controller-driven browser pass. Task 4 is documentation and final verification.

---

## Task 1: Access code library

**Files:**
- Modify: `package.json`
- Modify: `src/vite-env.d.ts`
- Create: `src/lib/accessCode.ts`
- Test: `src/lib/accessCode.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `normalizeCode(raw: string): string`
  - `hashCode(code: string): Promise<string>`
  - `getValidHashes(raw?: string): string[]`
  - `isGateEnabled(raw?: string): boolean`
  - `isHashValid(hash: string | null, raw?: string): boolean`
  - `loadStoredHash(): string | null`
  - `saveStoredHash(hash: string): void`
  - `clearStoredHash(): void`

**Note on the optional `raw` parameter.** The spec lists `getValidHashes(raw?)` and `isHashValid(hash)`. This plan gives `isGateEnabled` and `isHashValid` the same optional `raw` parameter, for the same reason: tests pass the raw env string directly instead of mocking `import.meta.env`. Production callers pass nothing and get the env value. This is a refinement of the spec's signatures, not a departure from its behavior.

- [ ] **Step 1: Install vitest and add scripts**

First confirm no test runner exists:

```bash
grep -n "vitest" package.json || echo "no vitest — proceed"
```

Then:

```bash
npm install -D vitest
```

Add to `package.json` scripts, alongside the existing entries:

```json
    "test": "vitest run",
    "test:watch": "vitest",
```

No vitest config file is needed. These are pure functions; vitest's defaults discover `**/*.test.ts` and the default `node` environment provides both `crypto.subtle` (Node 18+ exposes Web Crypto as a global) and, importantly, does NOT provide `localStorage` — which the tests below handle explicitly.

- [ ] **Step 2: Verify the runner starts**

Run: `npm test`
Expected: vitest runs and reports `No test files found`. Exit code may be non-zero; you only need to see vitest itself execute.

- [ ] **Step 3: Type the environment variable**

Replace the contents of `src/vite-env.d.ts` with:

```ts
/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Comma-separated lowercase SHA-256 hex hashes of valid access codes. */
  readonly VITE_ACCESS_CODE_HASHES?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
```

Without this, `import.meta.env.VITE_ACCESS_CODE_HASHES` types as `any` via vite/client's index signature, losing type safety under `strict`.

- [ ] **Step 4: Write the failing tests**

Create `src/lib/accessCode.test.ts`:

```ts
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
```

**About the pinned hash constant in Step 4.** It is the real SHA-256 of the
normalized code `QRTX8M2P` (no dash — `hashCode` normalizes before hashing),
already computed and verified. Do not recompute it, and above all do NOT edit it
to match whatever your implementation happens to produce. If this assertion
fails, your `normalizeCode` or `hashCode` is wrong — fix the code, not the test.
Independently reproducible with:
`node -e "console.log(require('node:crypto').createHash('sha256').update('QRTX8M2P').digest('hex'))"`

- [ ] **Step 5: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Failed to resolve import "./accessCode"`.

- [ ] **Step 6: Write the implementation**

Create `src/lib/accessCode.ts`:

```ts
/**
 * Access-code logic for the app gate.
 *
 * This is a doorbell, not a lock: the bundle is public and the check runs on
 * the client, so anyone willing to open DevTools can bypass it. It exists to
 * stop casual visitors who happen to find the URL. Do not add key stretching,
 * rate limiting, or obfuscation here — they would imply a security property
 * this design does not have. See docs/superpowers/specs/2026-08-24-access-code-design.md
 */

const STORAGE_KEY = 'liarbar-access';

/** Canonical form of a code: uppercase, no dashes, no whitespace. */
export function normalizeCode(raw: string): string {
  return raw.replace(/[\s-]/g, '').toUpperCase();
}

/** SHA-256 of the normalized code, as lowercase hex. */
export async function hashCode(code: string): Promise<string> {
  const bytes = new TextEncoder().encode(normalizeCode(code));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function configuredHashes(): string {
  return import.meta.env.VITE_ACCESS_CODE_HASHES ?? '';
}

/**
 * Valid hashes parsed from `raw`, defaulting to the env var.
 *
 * The parameter exists so tests can drive parsing directly rather than mocking
 * `import.meta.env`; production callers pass nothing.
 */
export function getValidHashes(raw: string = configuredHashes()): string[] {
  return raw
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter((h) => h.length > 0);
}

/** False when no hashes are configured, which disables the gate entirely. */
export function isGateEnabled(raw?: string): boolean {
  return getValidHashes(raw).length > 0;
}

/** Synchronous: is this hash on the current valid list? */
export function isHashValid(hash: string | null, raw?: string): boolean {
  if (!hash) return false;
  return getValidHashes(raw).includes(hash.toLowerCase());
}

export function loadStoredHash(): string | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function saveStoredHash(hash: string): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, hash);
  } catch {
    /* ignore */
  }
}

export function clearStoredHash(): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

// Fail-open is deliberate: no configuration means no gate, so `npm run dev` and
// forks work with no setup. The cost is that a forgotten env var in production
// silently disables the gate, so make it audible. This runs at module scope
// rather than in a component effect because module bodies execute once per page
// load, whereas an effect fires twice under StrictMode and again on remount.
if (import.meta.env.PROD && !isGateEnabled()) {
  console.warn(
    '[access] VITE_ACCESS_CODE_HASHES is not configured — the access gate is disabled.'
  );
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, all access-code tests green.

- [ ] **Step 8: Verify the build**

Run: `npm run build`
Expected: exit 0. This confirms the new test file and the `ImportMetaEnv` declaration both type-check.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json src/vite-env.d.ts src/lib/accessCode.ts src/lib/accessCode.test.ts
git commit -m "feat: add access code library and vitest test runner"
```

---

## Task 2: Hash generation CLI

**Files:**
- Create: `scripts/hash-code.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: nothing at runtime. It MUST reproduce `normalizeCode`'s rules exactly.
- Produces: a `npm run hash-code` command. Nothing imports it.

Without this tool the feature is unusable — there would be no way to turn a code into the hash the env var needs. It is plain Node using `node:crypto` rather than Web Crypto, because it runs outside the browser.

**The correctness requirement that matters:** the hash this prints must equal the hash `hashCode()` computes for the same input, or configured codes will never match. Step 3 verifies exactly that rather than assuming it.

- [ ] **Step 1: Write the script**

Create `scripts/hash-code.mjs`:

```js
#!/usr/bin/env node
/**
 * Turn access codes into the SHA-256 hashes that VITE_ACCESS_CODE_HASHES wants.
 *
 *   npm run hash-code QRTX-8M2P
 *   npm run hash-code QRTX-8M2P KJ9D-LP4W
 *
 * Normalization here MUST match normalizeCode() in src/lib/accessCode.ts, or
 * codes configured from this output will never match what the app computes.
 */
import { createHash } from 'node:crypto';

/** Mirror of normalizeCode() in src/lib/accessCode.ts. */
function normalizeCode(raw) {
  return raw.replace(/[\s-]/g, '').toUpperCase();
}

function hashCode(raw) {
  return createHash('sha256').update(normalizeCode(raw)).digest('hex');
}

const codes = process.argv.slice(2);

if (codes.length === 0) {
  console.error('Usage: npm run hash-code <CODE> [CODE...]');
  console.error('Example: npm run hash-code QRTX-8M2P');
  process.exit(1);
}

for (const code of codes) {
  console.log(`${code}  ->  ${hashCode(code)}`);
}

if (codes.length > 1) {
  console.log('\nComma-separated, for VITE_ACCESS_CODE_HASHES:');
  console.log(codes.map(hashCode).join(','));
}
```

- [ ] **Step 2: Add the npm script**

Add to `package.json` scripts:

```json
    "hash-code": "node scripts/hash-code.mjs",
```

- [ ] **Step 3: Verify the tool agrees with the app's hashing**

This is the step that matters. Run the tool:

```bash
npm run hash-code QRTX-8M2P
```

Compare its hash against the pinned constant in the `hashCode` test in `src/lib/accessCode.test.ts` (Task 1, Step 4). **They must be identical.** If they differ, the two normalization rules have diverged — fix the script, not the test.

Also confirm the usage error path:

```bash
npm run hash-code
```
Expected: the usage message, exit code 1.

And the multi-code path:

```bash
npm run hash-code QRTX-8M2P KJ9D-LP4W
```
Expected: two `code -> hash` lines, then a comma-separated line with both hashes and no spaces.

- [ ] **Step 4: Confirm nothing else broke**

Run: `npm test && npm run build`
Expected: tests pass, build exits 0.

- [ ] **Step 5: Commit**

```bash
git add scripts/hash-code.mjs package.json
git commit -m "feat: add hash-code CLI for generating access code hashes"
```

---

## Task 3: The gate component

**Files:**
- Create: `src/components/AccessGate.tsx`
- Modify: `src/main.tsx`
- Modify: `src/styles/site.css`

**Interfaces:**
- Consumes: `isGateEnabled`, `isHashValid`, `hashCode`, `loadStoredHash`, `saveStoredHash`, `clearStoredHash` from `src/lib/accessCode.ts` (Task 1). NOT `getValidHashes` — importing it unused would fail `noUnusedLocals`.
- Produces: a default-exported `AccessGate` component taking `{ children: React.ReactNode }`. Nothing later imports it.

**Verification note.** You have no browser and cannot see a rendered page. Do NOT run `npm run dev` and do NOT claim any visual verification. Your gates are `npm run build` and `npm test`, plus a static walkthrough (Step 6). A controller-driven browser pass follows separately. Honest "needs human eyes" is the correct answer for anything visual.

- [ ] **Step 1: Write the component**

Create `src/components/AccessGate.tsx`:

```tsx
import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  isGateEnabled,
  isHashValid,
  hashCode,
  loadStoredHash,
  saveStoredHash,
  clearStoredHash,
} from '../lib/accessCode';

interface AccessGateProps {
  children: React.ReactNode;
}

/** Format keystrokes as XXXX-XXXX: uppercase, dash after the fourth character. */
function formatInput(raw: string): string {
  const stripped = raw.replace(/[\s-]/g, '').toUpperCase().slice(0, 8);
  return stripped.length > 4 ? `${stripped.slice(0, 4)}-${stripped.slice(4)}` : stripped;
}

/**
 * Decide once, synchronously, whether the app is already unlocked.
 *
 * This runs as lazy useState initial state rather than in an effect so the app
 * renders unlocked on the very first paint — no flash of the gate for a
 * returning user. It is synchronous because what we store is the accepted
 * code's hash, so re-validation is a string comparison, not a hash computation.
 */
function initiallyUnlocked(): boolean {
  if (!isGateEnabled()) return true;
  const stored = loadStoredHash();
  if (isHashValid(stored)) return true;
  // Stored hash is no longer on the valid list (revoked, or the list changed).
  // Drop it so a stale value does not linger.
  if (stored) clearStoredHash();
  return false;
}

const AccessGate: React.FC<AccessGateProps> = ({ children }) => {
  const [unlocked, setUnlocked] = useState<boolean>(initiallyUnlocked);
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!unlocked) inputRef.current?.focus();
  }, [unlocked]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!value || checking) return;
      setChecking(true);
      setError('');
      try {
        const hash = await hashCode(value);
        if (isHashValid(hash)) {
          saveStoredHash(hash);
          setUnlocked(true);
          return;
        }
        // One message for both wrong and revoked codes: the difference is not
        // useful to a legitimate user and not owed to a stranger.
        setError('That code is not valid.');
        setValue('');
        inputRef.current?.focus();
      } catch {
        setError('Could not check the code. Please try again.');
      } finally {
        setChecking(false);
      }
    },
    [value, checking]
  );

  if (unlocked) return <>{children}</>;

  return (
    <div className="access-gate">
      <form className="access-gate-panel score-modal" onSubmit={handleSubmit}>
        <h1 className="score-modal-title access-gate-title">Enter access code</h1>
        <p className="access-gate-hint">This app is invite only. Ask for a code to get in.</p>
        <label className="access-gate-label" htmlFor="access-code-input">
          <span className="access-gate-label-text">Access code</span>
          <input
            id="access-code-input"
            ref={inputRef}
            className="score-input access-gate-input"
            type="text"
            inputMode="text"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder="XXXX-XXXX"
            maxLength={9}
            value={value}
            onChange={(e) => { setValue(formatInput(e.target.value)); setError(''); }}
          />
        </label>
        {error && (
          <p className="access-gate-error" role="alert">
            {error}
          </p>
        )}
        <div className="score-modal-actions access-gate-actions">
          <button
            type="submit"
            className="score-btn score-btn-primary"
            disabled={!value || checking}
          >
            {checking ? 'Checking...' : 'Enter'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default AccessGate;
```

**Why `useState(initiallyUnlocked)` and not an effect.** Passing the function as lazy initial state runs it once, before first paint. An effect would render the gate first and then hide it, producing a visible flash for every returning user on every load.

- [ ] **Step 2: Wire it into the entry point**

Modify `src/main.tsx` to wrap `<App/>`:

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import './styles/site.css'
import { ErrorBoundary } from './ErrorBoundary'
import AccessGate from './components/AccessGate'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <AccessGate>
        <App />
      </AccessGate>
    </ErrorBoundary>
  </StrictMode>,
)
```

`AccessGate` goes INSIDE `ErrorBoundary` so a crash in the gate is caught rather than taking down the page.

- [ ] **Step 3: Add the styles**

Append to `src/styles/site.css`, following the file's terse one-rule-per-line style:

```css
/* Access gate */
.access-gate{position:fixed;inset:0;z-index:100;display:flex;align-items:center;justify-content:center;padding:20px;background:#1a1a1a}
.access-gate-panel{max-width:360px;width:100%}
.access-gate-title{text-align:center}
.access-gate-hint{margin:0 0 20px;color:#aaa;font-size:13px;line-height:1.5;text-align:center}
.access-gate-label{display:block;margin-bottom:12px}
.access-gate-label-text{display:block;margin-bottom:6px;font-size:12px;color:#888}
.access-gate-input{width:100%;text-align:center;letter-spacing:.18em;font-size:18px}
.access-gate-error{margin:0;color:#d36a46;font-size:13px;text-align:center}
.access-gate-actions{justify-content:center}
.score-btn:disabled{opacity:.4;cursor:not-allowed}
```

The `.score-btn:disabled` rule is needed because the stylesheet's only existing `:disabled` rule is scoped to `.score-order-buttons button:disabled` — without it, the Enter button looks fully enabled while inert.

- [ ] **Step 4: Verify the build**

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 5: Verify tests still pass**

Run: `npm test`
Expected: all Task 1 tests still green. This task adds no tests.

- [ ] **Step 6: Static walkthrough**

You cannot run the browser checks. Instead, produce a table in your report mapping each behavior below to the specific line(s) of your code that implement it, or state plainly that it needs human eyes:

1. No codes configured → app renders, gate never mounts
2. Codes configured, nothing stored → gate renders
3. Valid code entered → app renders and the hash is stored
4. Wrong code → inline error, input cleared, gate stays
5. Previously unlocked → app renders on first paint with no flash
6. Code revoked since last visit → gate reappears and the stale hash is cleared
7. Submit disabled while the input is empty
8. Input formats as `XXXX-XXXX` and caps at 9 characters
9. Error is announced to assistive tech
10. Input is focused when the gate appears

- [ ] **Step 7: Commit**

```bash
git add src/components/AccessGate.tsx src/main.tsx src/styles/site.css
git commit -m "feat: gate the app behind an access code"
```

---

## Task 4: Configuration docs and final verification

**Files:**
- Create: `.env.example`
- Modify: `README.md`

**Interfaces:**
- Consumes: the finished feature.
- Produces: nothing.

- [ ] **Step 1: Create the env example**

Create `.env.example`:

```bash
# Access code gate.
#
# Comma-separated lowercase SHA-256 hashes of valid access codes.
# Generate them with:  npm run hash-code QRTX-8M2P
#
# Leave unset or empty to disable the gate entirely — the app then opens
# normally, which is what you want for local development and for forks.
#
# NOTE: Vite inlines VITE_* variables at build time, so changing this value
# requires a redeploy, not just an environment-variable edit.
VITE_ACCESS_CODE_HASHES=
```

Do NOT create a real `.env` file, and do not commit one.

`.gitignore` currently contains `*.local` (line 13), which covers Vite's
`.env.local` but does NOT cover a bare `.env`. Add an explicit `.env` line to
`.gitignore` so a real code file cannot be committed by accident. Leave
`.env.example` tracked — it contains no secrets, only the empty variable and its
documentation.

- [ ] **Step 2: Document it in the README**

Add a section to `README.md` after the **Running Locally** section:

```markdown
### Access Code (optional)

The app can be gated behind an invite code. It is disabled by default.

1. Pick a code using the characters `0123456789ABCDEFGHJKMNPQRSTVWXYZ`
   (`I`, `L`, `O`, and `U` are excluded so codes are unambiguous read aloud),
   formatted `XXXX-XXXX`.
2. Hash it:

   ```bash
   npm run hash-code QRTX-8M2P
   ```

3. Set `VITE_ACCESS_CODE_HASHES` to the resulting hash in your Vercel project
   settings. Several codes can be configured at once, comma-separated, so you
   can hand different codes to different groups and revoke one without
   disturbing the others.
4. Redeploy. Vite inlines `VITE_*` at build time, so an environment-variable
   change alone does not take effect.

Leaving the variable unset disables the gate, so `npm run dev` and forks of
this repository work with no setup.

Revoking a code removes access from people who already used it: the app stores
the hash of the code that was accepted and re-checks it against the current
list on every load.

**What this is.** A doorbell, not a lock. This is a static site — the
JavaScript bundle is public and the check runs in the browser, so anyone
willing to open developer tools can bypass it. It stops casual visitors who
happen to find the URL; it is not access control. If you need real
restriction, use Vercel's Deployment Protection instead.
```

- [ ] **Step 3: Run the full verification sweep**

```bash
npm test && npm run build
```
Expected: all tests pass, build exits 0.

```bash
npm run lint
```
Expected: `npm run lint` fails on this repo for PRE-EXISTING reasons unrelated to this work — 1 error (`'_' is defined but never used` at `Game.tsx:132`) and 2 react-hooks warnings (`Game.tsx:158`, `PokerGame.tsx:143`). Your gate is **no NEW problems beyond that baseline**. Do not fix the pre-existing ones; they are in the roulette mode and unrelated to this feature.

- [ ] **Step 4: Verify the gate is genuinely inert by default**

```bash
grep -rn "VITE_ACCESS_CODE_HASHES" dist/assets/*.js | head -1 || echo "not inlined (no codes configured) — correct"
```

With no `.env` present, the built bundle should contain an empty string where the env var was inlined, and the gate should be disabled. Confirm no `.env` file exists in the repo root and that `.env` is gitignored.

- [ ] **Step 5: Commit**

```bash
git add .env.example README.md .gitignore
git commit -m "docs: document the access code gate"
```

---

## Out of Scope

- Any change to the three Card Score modes, the roulette mode, or the poker mode.
- Real access control, rate limiting, key stretching, or brute-force resistance — see the spec's "What this is, stated plainly".
- User accounts, identity, or per-user state.
- Fixing the pre-existing lint problems in `Game.tsx` / `PokerGame.tsx`.
