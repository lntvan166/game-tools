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
  return raw.replace(/[\s‐-―-]/g, '').toUpperCase();
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

/**
 * Whether the app should render unlocked on this load.
 *
 * Re-validates the stored hash against the current valid list, and clears a
 * stored hash that is no longer valid so a stale value does not linger. This
 * is what makes revoking a code eject people who already used it.
 */
export function resolveInitialUnlock(raw?: string): boolean {
  if (!isGateEnabled(raw)) return true;
  const stored = loadStoredHash();
  if (isHashValid(stored, raw)) return true;
  // Stored hash is no longer on the valid list (revoked, or the list changed).
  // Drop it so a stale value does not linger.
  if (stored) clearStoredHash();
  return false;
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
