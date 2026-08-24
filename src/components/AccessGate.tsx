import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  isHashValid,
  hashCode,
  normalizeCode,
  saveStoredHash,
  resolveInitialUnlock,
} from '../lib/accessCode';

interface AccessGateProps {
  children: React.ReactNode;
}

/** Format keystrokes as XXXX-XXXX: uppercase, dash after the fourth character. */
function formatInput(raw: string): string {
  const stripped = normalizeCode(raw).slice(0, 8);
  return stripped.length > 4 ? `${stripped.slice(0, 4)}-${stripped.slice(4)}` : stripped;
}

const AccessGate: React.FC<AccessGateProps> = ({ children }) => {
  // Lazy initializer, not an effect: this renders the app unlocked on the very
  // first paint for a returning user, with no flash of the gate. See
  // resolveInitialUnlock() in ../lib/accessCode for the revocation behavior.
  const [unlocked, setUnlocked] = useState<boolean>(resolveInitialUnlock);
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
