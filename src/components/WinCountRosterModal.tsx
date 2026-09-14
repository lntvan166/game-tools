import React, { useState } from 'react';
import type { SessionPlayer } from '../lib/session';
import { fillBlankNames, findDuplicateNameIndex, nameKey } from '../lib/session';
import { MIN_WIN_COUNT_PLAYERS, MAX_WIN_COUNT_PLAYERS } from '../lib/winCount';
import { formatMoney, formatMoneySigned } from '../lib/money';

export interface RosterResult {
  existing: Array<{ id: string; playing: boolean }>;
  /** Names for players not yet on the roster, already trimmed and de-blanked. */
  added: string[];
  betAmount: number;
}

interface WinCountRosterFormProps {
  players: SessionPlayer[];
  defaultBet: number;
  submitLabel: string;
  onSubmit: (result: RosterResult) => void;
  onCancel?: () => void;
}

/**
 * Pre-filled roster editor.
 *
 * Existing players arrive checked; unchecking one sits them out of the next
 * game without touching their totals. The bet arrives filled in from the
 * session. Nothing the player already typed is ever typed again — that is the
 * entire reason this component exists.
 */
export const WinCountRosterForm: React.FC<WinCountRosterFormProps> = ({
  players,
  defaultBet,
  submitLabel,
  onSubmit,
  onCancel,
}) => {
  const [playing, setPlaying] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(players.map((p) => [p.id, true]))
  );
  const [added, setAdded] = useState<string[]>(() =>
    players.length === 0 ? ['', '', '', ''] : []
  );
  const [bet, setBet] = useState(defaultBet);

  const checkedExisting = players.filter((p) => playing[p.id]);
  const allNames = [...checkedExisting.map((p) => p.name), ...added];
  const filled = fillBlankNames(allNames);
  const duplicateIndex = findDuplicateNameIndex(filled);
  // Report the spelling already on the roster, not the one just typed: seeing
  // '"linh" is already in this game' next to a row reading "Linh" reads as a bug.
  const duplicateName =
    duplicateIndex === null
      ? null
      : filled.find((n, i) => i < duplicateIndex && nameKey(n) === nameKey(filled[duplicateIndex])) ??
        filled[duplicateIndex];
  const count = filled.length;

  let error: string | null = null;
  if (duplicateName) error = `"${duplicateName}" is already in this game. Names must be unique.`;
  else if (count < MIN_WIN_COUNT_PLAYERS) error = `Need at least ${MIN_WIN_COUNT_PLAYERS} players.`;
  else if (count > MAX_WIN_COUNT_PLAYERS) error = `At most ${MAX_WIN_COUNT_PLAYERS} players.`;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (error) return;
    const addedFilled = filled.slice(checkedExisting.length);
    onSubmit({
      existing: players.map((p) => ({ id: p.id, playing: !!playing[p.id] })),
      added: addedFilled,
      betAmount: bet,
    });
  };

  const winnerTakes = bet * Math.max(0, count - 1);

  return (
    <form onSubmit={handleSubmit} className="score-new-game-form host-new-game-form">
      {players.length > 0 && (
        <div className="wincount-roster-existing">
          <p className="score-new-game-hint">Who is playing?</p>
          {players.map((p) => (
            <label key={p.id} className="wincount-roster-row">
              <input
                type="checkbox"
                checked={!!playing[p.id]}
                onChange={(e) => setPlaying((prev) => ({ ...prev, [p.id]: e.target.checked }))}
              />
              <span>{p.name}</span>
            </label>
          ))}
        </div>
      )}

      {added.map((name, i) => (
        <label key={i} className="score-new-game-label">
          <span>{players.length > 0 ? 'New player' : `Player ${i + 1}`}</span>
          <input
            type="text"
            value={name}
            onChange={(e) =>
              setAdded((prev) => {
                const next = [...prev];
                next[i] = e.target.value;
                return next;
              })
            }
            placeholder={`Player ${checkedExisting.length + i + 1}`}
            maxLength={20}
            className="score-input"
          />
        </label>
      ))}

      <button
        type="button"
        className="score-btn score-btn-secondary wincount-add-player-btn"
        onClick={() => setAdded((prev) => [...prev, ''])}
        disabled={count >= MAX_WIN_COUNT_PLAYERS}
      >
        + Add player
      </button>

      <label className="host-config-label">
        <span>Bet per loser</span>
        <input
          type="number"
          min={0}
          step={1000}
          value={bet}
          onChange={(e) => setBet(Math.max(0, Number(e.target.value) || 0))}
          className="score-input"
        />
      </label>
      <p className="score-config-preview">
        {bet === 0
          ? 'No money tracked. Set a bet to settle up in cash.'
          : `${formatMoney(bet)} → winner of a ${count}-player round gets ${formatMoneySigned(winnerTakes)}`}
      </p>

      {error && <p className="wincount-roster-error">{error}</p>}

      <div className="score-new-game-actions">
        {onCancel && (
          <button type="button" className="score-btn score-btn-secondary" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button type="submit" className="score-btn score-btn-primary" disabled={!!error}>
          {submitLabel}
        </button>
      </div>
    </form>
  );
};

interface WinCountRosterModalProps extends WinCountRosterFormProps {
  title: string;
}

const WinCountRosterModal: React.FC<WinCountRosterModalProps> = ({ title, ...formProps }) => (
  <div
    className="score-modal-overlay"
    onClick={formProps.onCancel}
    role="dialog"
    aria-modal="true"
    aria-labelledby="wincount-roster-title"
  >
    <div className="score-modal" onClick={(e) => e.stopPropagation()}>
      <h2 id="wincount-roster-title" className="score-modal-title">
        {title}
      </h2>
      <WinCountRosterForm {...formProps} />
    </div>
  </div>
);

export default WinCountRosterModal;
