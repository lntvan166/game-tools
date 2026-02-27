import React, { useState, useCallback } from 'react';
import type { HostGame, HostRoundResult, HostPlayerResult } from '../lib/hostScore';

interface AddHostRoundModalProps {
  game: HostGame;
  onSave: (result: HostRoundResult, editIndex?: number) => void;
  onClose: () => void;
  initialRound?: HostRoundResult;
  editIndex?: number;
}

type ResultType = 'win' | 'lose' | 'draw';

const RESULT_LABELS: Record<ResultType, string> = {
  win: 'W',
  lose: 'L',
  draw: 'D',
};

const AddHostRoundModal: React.FC<AddHostRoundModalProps> = ({
  game,
  onSave,
  onClose,
  initialRound,
  editIndex,
}) => {
  const prevHostId = game.rounds.length > 0 ? game.rounds[game.rounds.length - 1].hostId : game.players[0]?.id ?? '';
  const [hostId, setHostId] = useState(initialRound?.hostId ?? prevHostId);
  const [results, setResults] = useState<Record<string, HostPlayerResult>>(() => {
    const init: Record<string, HostPlayerResult> = {};
    game.players.forEach((p) => {
      if (p.id !== (initialRound?.hostId ?? prevHostId)) {
        init[p.id] = initialRound?.results?.[p.id] ?? { result: 'draw', multiplier: 1 };
      }
    });
    return init;
  });
  const [customMultiplierFor, setCustomMultiplierFor] = useState<string | null>(null);

  const nonHostPlayers = game.players.filter((p) => p.id !== hostId);

  const updateResult = useCallback((playerId: string, result: ResultType) => {
    setResults((prev) => ({
      ...prev,
      [playerId]: { ...(prev[playerId] ?? { result: 'draw', multiplier: 1 }), result },
    }));
  }, []);

  const cycleMultiplier = useCallback((playerId: string) => {
    setResults((prev) => {
      const curr = prev[playerId] ?? { result: 'draw', multiplier: 1 };
      const nextMult = curr.multiplier >= 3 ? 1 : curr.multiplier + 1;
      return { ...prev, [playerId]: { ...curr, multiplier: nextMult } };
    });
    setCustomMultiplierFor(null);
  }, []);

  const setCustomMultiplier = useCallback((playerId: string, value: number) => {
    const mult = Math.max(1, Math.min(99, Math.floor(value)));
    setResults((prev) => ({
      ...prev,
      [playerId]: { ...(prev[playerId] ?? { result: 'draw', multiplier: 1 }), multiplier: mult },
    }));
    setCustomMultiplierFor(null);
  }, []);

  const handleHostChange = useCallback((newHostId: string) => {
    setHostId(newHostId);
    setResults((prev) => {
      const next = { ...prev };
      game.players.forEach((p) => {
        if (p.id !== newHostId && !(p.id in next)) {
          next[p.id] = { result: 'draw', multiplier: 1 };
        }
      });
      return next;
    });
  }, [game.players]);

  const handleSubmit = useCallback(() => {
    const roundResults: Record<string, HostPlayerResult> = {};
    nonHostPlayers.forEach((p) => {
      const r = results[p.id];
      if (r) roundResults[p.id] = r;
    });
    onSave(
      { hostId, results: roundResults, configSnapshot: game.config },
      editIndex
    );
  }, [hostId, results, nonHostPlayers, game.config, onSave, editIndex]);

  return (
    <div
      className="score-modal-overlay host-modal-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="host-round-title"
    >
      <div className="score-modal host-modal" onClick={(e) => e.stopPropagation()}>
        <div className="host-modal-header">
          <h2 id="host-round-title" className="score-modal-title">
            {editIndex !== undefined ? 'Edit round' : 'Add round'}
          </h2>
          <label className="host-host-select">
            <span className="host-host-label">Host</span>
            <select
              value={hostId}
              onChange={(e) => handleHostChange(e.target.value)}
              className="score-input host-host-dropdown"
              aria-label="Select host"
            >
              {game.players.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="host-player-list">
          {nonHostPlayers.map((p) => {
            const r = results[p.id] ?? { result: 'draw' as const, multiplier: 1 };
            const showCustom = customMultiplierFor === p.id;
            return (
              <div key={p.id} className="host-player-row">
                <div className="host-player-name" title={p.name}>
                  {p.name.length > 10 ? `${p.name.slice(0, 10)}…` : p.name}
                </div>
                <div className="host-multiplier-cell">
                  {showCustom ? (
                    <input
                      type="number"
                      min={1}
                      max={99}
                      value={r.multiplier}
                      onChange={(e) => setCustomMultiplier(p.id, Number(e.target.value))}
                      onBlur={() => setCustomMultiplierFor(null)}
                      autoFocus
                      className="host-multiplier-input"
                    />
                  ) : (
                    <button
                      type="button"
                      className="host-multiplier-badge"
                      onClick={() => cycleMultiplier(p.id)}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        setCustomMultiplierFor(p.id);
                      }}
                      title="Tap: 1x→2x→3x. Right-click: custom"
                    >
                      {r.multiplier}x
                    </button>
                  )}
                </div>
                <div className="host-result-btns">
                  {(['win', 'lose', 'draw'] as const).map((res) => (
                    <button
                      key={res}
                      type="button"
                      className={`host-result-btn ${r.result === res ? 'active' : ''} ${res}`}
                      onClick={() => updateResult(p.id, res)}
                      aria-pressed={r.result === res}
                    >
                      {RESULT_LABELS[res]}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div className="score-modal-actions host-modal-actions">
          <button type="button" className="score-btn score-btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="score-btn score-btn-primary" onClick={handleSubmit}>
            {editIndex !== undefined ? 'Save' : 'Add Round'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AddHostRoundModal;
