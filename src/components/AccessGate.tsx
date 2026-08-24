import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  isGateEnabled,
  isHashValid,
  hashCode,
  normalizeCode,
  loadStoredHash,
  saveStoredHash,
  clearStoredHash,
} from '../lib/accessCode';

interface AccessGateProps {
  children: React.ReactNode;
}

/** Format keystrokes as XXXX-XXXX: uppercase, dash after the fourth character. */
function formatInput(raw: string): string {
  const stripped = normalizeCode(raw).slice(0, 8);
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
