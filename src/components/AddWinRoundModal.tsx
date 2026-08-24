import React, { useState } from 'react';
import type { Player, WinCountRound } from '../lib/winCount';

interface AddWinRoundModalProps {
  players: Player[];
  initialRound?: WinCountRound | null;
  onSave: (round: WinCountRound) => void;
  onClose: () => void;
}

const AddWinRoundModal: React.FC<AddWinRoundModalProps> = ({
  players,
  initialRound,
  onSave,
  onClose,
}) => {
  const [winnerId, setWinnerId] = useState<string>(initialRound?.winnerId ?? '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!winnerId) return;
    onSave({ winnerId });
  };

  return (
    <div
      className="score-modal-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="win-round-title"
    >
      <div className="score-modal" onClick={(e) => e.stopPropagation()}>
        <h2 id="win-round-title" className="score-modal-title">
          {initialRound ? 'Edit round' : 'Add round'}
        </h2>
        <form onSubmit={handleSubmit}>
          <fieldset className="win-winner-fieldset">
            <legend className="score-config-section-title">Who won?</legend>
            <div className="win-winner-grid">
              {players.map((p) => (
                <label
                  key={p.id}
                  className={`win-winner-option ${winnerId === p.id ? 'selected' : ''}`}
                >
                  <input
                    type="radio"
                    name="win-winner"
                    value={p.id}
                    checked={winnerId === p.id}
                    onChange={() => setWinnerId(p.id)}
                  />
                  <span>{p.name}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="score-modal-actions">
            <button type="button" className="score-btn score-btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="score-btn score-btn-primary" disabled={!winnerId}>
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddWinRoundModal;
