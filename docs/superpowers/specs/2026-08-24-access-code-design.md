# App access code

**Date:** 2026-08-24
**Status:** Approved design, ready for implementation planning
**Scope:** Part B of a two-part effort. Part A (Win Count score mode + money layer)
shipped separately on `feature/win-count-money` and is unrelated to this work.

## Problem

The app is public at its Vercel URL. Anyone who finds the link can use it. The
author wants friends to need a code to get in.

## What this is, stated plainly

**A doorbell, not a lock.**

This is a static single-page app. The bundle is publicly downloadable, the check
runs on the client, and the author explicitly chose a client-side gate over real
infrastructure. Therefore:

- Anyone can read the JavaScript bundle and skip the check.
- Anyone can set the `localStorage` key by hand.
- Unsalted SHA-256 of an 8-character code drawn from a 32-character alphabet is
  brute-forceable offline (32^8 ≈ 1.1 × 10^12) by anyone who extracts the hashes
  and is willing to spend GPU time.

What it does deliver: it raises the bar from *anyone with the URL* to *anyone
willing to open DevTools*. That was the stated goal. Nothing in this design
should be described to anyone as security.

If real restriction is ever wanted, the answer is Vercel Deployment Protection
or an authenticated origin — not a stronger version of this.

## Goals

1. A `XXXX-XXXX` code gates the whole app.
2. Codes are configurable and revocable without a code change.
3. Revoking a code ejects people who already used it.
4. Zero infrastructure. No backend, no serverless function, no database.
5. The app must remain runnable with no configuration at all (`npm run dev`, forks).

## Non-goals

- Real access control, rate limiting, or brute-force resistance (see above).
- User accounts, identity, roles, or per-user state.
- Any change to the three game modes or their stored data.

## Decisions taken during design

| Question | Chosen | Rejected |
|---|---|---|
| Purpose | Keep casual strangers out | Genuine restriction (needs infra); group identity (different feature) |
| Code source | Short list of hashes, set at build time | One shared code; checksum rule (unrevocable, mintable) |
| Persistence | Indefinite, re-validated every load | Indefinite boolean flag; per-session |
| No config | Gate disabled, app opens | Fail closed; dev/prod split |

---

## Architecture

```
src/lib/accessCode.ts          NEW   pure logic: normalize, hash, validate, storage
src/lib/accessCode.test.ts     NEW   unit tests
src/components/AccessGate.tsx  NEW   the gate UI; renders children once unlocked
src/main.tsx                   EDIT  wrap <App/> in <AccessGate>
scripts/hash-code.mjs          NEW   dev tool: code -> hash
package.json                   EDIT  "hash-code" script
src/styles/site.css            EDIT  gate styles
.env.example                   NEW   documents the env var
README.md                      EDIT  document setup
```

`App.tsx` is deliberately untouched. It already owns mode tabs, mute state, and
document title; adding access control to it would entangle two unrelated
concerns in the one file every future feature edits. Wrapping at `main.tsx`
means the gate is added and removed by one line.

---

## `src/lib/accessCode.ts`

```ts
/** "qrtx 8m2p" and "QRTX-8M2P" both -> "QRTX8M2P" */
export function normalizeCode(raw: string): string

/** SHA-256 of the normalized code, lowercase hex, via Web Crypto. */
export function hashCode(code: string): Promise<string>

/**
 * Valid hashes parsed from `raw`, which defaults to the env var.
 * The parameter exists so tests can drive parsing directly instead of
 * mocking `import.meta.env`; production callers pass nothing.
 */
export function getValidHashes(raw?: string): string[]

/** False when no hashes are configured — the gate is then disabled. */
export function isGateEnabled(): boolean

/** The stored hash, or null. */
export function loadStoredHash(): string | null

export function saveStoredHash(hash: string): void
export function clearStoredHash(): void

/** Synchronous: is this hash currently on the valid list? */
export function isHashValid(hash: string): boolean
```

Storage key: `liarbar-access`. It sits alongside the existing
`liarbar-*` keys and must not collide with them.

### The asymmetry that shapes this

**What gets stored is the accepted code's hash, not a boolean.**

Two consequences, both wanted:

1. **Load is synchronous.** Re-validation is `isHashValid(loadStoredHash())` — a
   string comparison against the list. No hashing, no `await`, no loading state,
   no flash of the gate before the app appears. Hashing happens only on submit.
2. **Revocation is real.** Because the stored hash is re-checked on every load,
   removing a hash from the env var ejects everyone who used that code the next
   time they open the app. A boolean flag could not do this.

### Behavior

On mount:
- `isGateEnabled() === false` → render children. No gate.
- stored hash exists and `isHashValid(it)` → render children.
- otherwise → render the code form.

On submit:
- normalize, hash, compare against `getValidHashes()`.
- match → `saveStoredHash(hash)`, render children.
- no match → show an error, clear the input, stay on the form.

A stored hash that is no longer valid is cleared via `clearStoredHash()` when
detected, so a stale value does not sit in storage indefinitely.

---

## Configuration

`VITE_ACCESS_CODE_HASHES` — comma-separated lowercase SHA-256 hex strings.

```
VITE_ACCESS_CODE_HASHES=a3f5...,9c21...,ff08...
```

Set in Vercel's project environment variables. Absent or empty means the gate is
disabled and the app opens normally — so `npm run dev` needs no setup and forks
of this MIT-licensed repo are not bricked.

Parsing must tolerate whitespace around entries and ignore empty segments, so a
trailing comma or a copy-paste with spaces does not silently produce a hash that
can never match.

**Vite inlines `VITE_*` at build time.** Changing codes therefore requires a
redeploy, not merely an env-var edit. On Vercel that is one action, but it is a
real constraint and belongs in the README.

### Fail-open risk and its mitigation

The chosen behavior means a forgotten env var in production silently disables
the gate. Mitigation: when `import.meta.env.PROD` is true and no hashes are
configured, `console.warn` that the gate is disabled.

It fires from module scope in `accessCode.ts`, not from a component effect —
module bodies execute once per page load, whereas `AccessGate`'s effect would
fire twice under `StrictMode` and could fire again on remount. It cannot prevent
the mistake but makes it visible rather than silent.

### `scripts/hash-code.mjs`

Without a way to produce hashes the feature is unusable, so a small dev tool
ships with it:

```
$ npm run hash-code QRTX-8M2P
QRTX-8M2P  ->  a3f5e9...
```

Plain Node, uses `node:crypto`, normalizes its input with the same rules as the
app so the hash it prints is guaranteed to match what the app computes. It
accepts several codes at once and prints one line each. It never writes files
and never touches the env.

---

## Code format

`XXXX-XXXX` — eight characters, displayed with a dash after the fourth.

Alphabet: `0123456789ABCDEFGHJKMNPQRSTVWXYZ` — 32 characters, excluding `I`, `L`,
`O`, and `U` so codes are unambiguous when read aloud at a table. This alphabet
governs codes the author *generates*; the app does not reject characters outside
it on input, because a rejected-character error would leak information about the
code space for no benefit.

Input handling:
- case-insensitive, auto-uppercased as typed
- dash inserted automatically after the fourth character
- whitespace and dashes stripped before hashing
- input capped at 9 characters, the length of a formatted code including its dash

### No rate limiting

Deliberately omitted. On a client-side gate it is theater — the attacker
controls the client, and anyone scripting guesses would bypass the check rather
than guess through it. Including it would imply a security property this design
does not have.

---

## UX and error states

The gate is a centered, full-screen panel reusing the existing
`.score-modal` / `.score-btn` / `.score-input` class vocabulary from
`src/styles/site.css`, so it reads as part of the app rather than bolted on.

| State | Behavior |
|---|---|
| Empty input | Submit disabled |
| Wrong code | Inline error, input cleared and refocused, gate stays |
| Valid code | App renders immediately |
| Previously unlocked | App renders, no gate shown, no flash |
| Code revoked since last visit | Gate reappears; stored hash cleared |
| No codes configured | App renders; gate never mounts |

The error message says only that the code is not valid. It does not distinguish
"wrong" from "revoked" — the distinction is not useful to a legitimate user and
telling the difference is information a stranger has no reason to receive.

Accessibility: the form has a labeled input and the error is announced via
`role="alert"`. The input is focused on mount so a returning user whose code was
revoked can type immediately.

---

## Testing

`src/lib/accessCode.test.ts`, with vitest (already in the project from the
Win Count work):

- **Normalization** — lowercase input, spaces, dashes, and mixed forms all
  normalize to the same canonical string; `"qrtx 8m2p"`, `"QRTX-8M2P"`, and
  `"Qrtx8m2p"` produce identical hashes.
- **Hashing** — a known code hashes to a known constant, pinning the algorithm
  so a future change that would invalidate everyone's stored hash fails loudly.
- **Env parsing** — comma-separated values parse; whitespace tolerated; trailing
  commas and empty segments ignored; unset yields an empty array.
- **`isGateEnabled`** — false for unset and for empty-after-parsing.
- **`isHashValid`** — true for a listed hash, false for an unlisted one.
- **Revocation** — a stored hash absent from the current list is rejected. This
  is the test that pins the feature's most distinctive behavior.
- **Storage round-trip** — save then load returns the same value; clear removes it.

The component is verified by `npm run build` plus a browser pass: gate appears
with codes configured, correct code admits, wrong code rejects, reload does not
re-prompt, removing the hash re-prompts, and no codes configured means no gate.

Tests must not depend on a real `import.meta.env` value. `getValidHashes(raw?)`
takes the raw string as an optional parameter for exactly this reason, so every
parsing test passes its input directly and no test mocks the module system.

## Risks

- **Fail-open misconfiguration.** Accepted deliberately; mitigated by the
  production console warning. The alternative bricks dev and forks.
- **Changing codes requires a redeploy.** Inherent to build-time inlining;
  documented rather than engineered around, since the alternative is a backend.
- **Someone mistakes this for security.** Mitigated by stating it plainly here
  and in the README.
