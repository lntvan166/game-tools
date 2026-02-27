import React, { useState, useEffect, useCallback } from 'react';
import {
  loadHostGame,
  saveHostGame,
  createHostGame,
  resetHostGame,
  removeHostRound,
  updateHostRound,
  addHostRound,
  calcHostTotalScores,
  calcHostRoundPoints,
  type HostGame,
  type HostConfig,
  type HostRoundResult,
  DEFAULT_HOST_CONFIG,
} from '../lib/hostScore';
import AddHostRoundModal from './AddHostRoundModal';

const HostScore: React.FC = () => {
  const [game, setGame] = useState<HostGame | null>(() => loadHostGame());
  const [showConfig, setShowConfig] = useState(false);
  const [showAddRound, setShowAddRound] = useState(false);
  const [showNewGameModal, setShowNewGameModal] = useState(false);
  const [configEdit, setConfigEdit] = useState<HostConfig>(DEFAULT_HOST_CONFIG);

  useEffect(() => {
    if (game) {
      saveHostGame(game);
      setConfigEdit(game.config);
    }
  }, [game]);

  const handleNewGame = useCallback((names: string[]) => {
    setGame(createHostGame(names));
    setShowConfig(true);
  }, []);

  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const confirmResetScores = useCallback(() => {
    if (!game) return;
    setGame(resetHostGame(game));
    setShowResetConfirm(false);
  }, [game]);

  const handleSaveRound = useCallback((result: HostRoundResult, editIndex?: number) => {
    if (!game) return;
    if (editIndex !== undefined) {
      setGame(updateHostRound(game, editIndex, result));
    } else {
      setGame(addHostRound(game, result));
    }
    setShowAddRound(false);
    setRoundToEdit(null);
  }, [game]);

  const handleConfigSave = useCallback(() => {
    if (!game) return;
    setGame({ ...game, config: configEdit });
    setShowConfig(false);
  }, [game, configEdit]);

  const [roundToDelete, setRoundToDelete] = useState<number | null>(null);
  const [roundToEdit, setRoundToEdit] = useState<number | null>(null);
  const [selectedRoundIndex, setSelectedRoundIndex] = useState<number | null>(null);

  const handleRemoveRound = useCallback((index: number) => {
    setRoundToDelete(index);
  }, []);

  const confirmRemoveRound = useCallback(() => {
    if (!game || roundToDelete === null) return;
    setGame(removeHostRound(game, roundToDelete));
    setRoundToDelete(null);
    if (selectedRoundIndex !== null) {
      if (selectedRoundIndex === roundToDelete) setSelectedRoundIndex(null);
      else if (selectedRoundIndex > roundToDelete) setSelectedRoundIndex((i) => (i ?? 0) - 1);
    }
  }, [game, roundToDelete, selectedRoundIndex]);

  const handleNewGameFromModal = useCallback((names: string[]) => {
    setGame(createHostGame(names));
    setShowNewGameModal(false);
    setShowConfig(true);
  }, []);

  if (!game) {
    return <HostNewGameForm onSubmit={handleNewGame} />;
  }

  const scores = calcHostTotalScores(game);
  const sortedPlayers = [...game.players].sort((a, b) => (scores[b.id] ?? 0) - (scores[a.id] ?? 0));

  return (
    <div className="host-score tienlen-score">
      <div className="score-header">
        <button type="button" className="score-btn score-btn-secondary" onClick={() => setShowConfig(true)}>
          Config
        </button>
        <button type="button" className="score-btn score-btn-secondary" onClick={() => setShowResetConfirm(true)}>
          Reset Scores
        </button>
        <button type="button" className="score-btn score-btn-secondary" onClick={() => setShowNewGameModal(true)}>
          New Game
        </button>
      </div>

      <div className="scoreboard">
        <h3 className="scoreboard-title">Scoreboard</h3>
        <table className="scoreboard-table">
          <thead>
            <tr>
              <th>Player</th>
              <th>Score</th>
            </tr>
          </thead>
          <tbody>
            {sortedPlayers.map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td className="scoreboard-value">{(scores[p.id] ?? 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button type="button" className="score-btn score-btn-primary score-add-round-btn" onClick={() => { setRoundToEdit(null); setShowAddRound(true); }}>
        Add Round
      </button>

      {game.rounds.length > 0 && (
        <HostRoundHistoryTable
          game={game}
          onRowClick={(idx) => setSelectedRoundIndex(idx)}
          onEdit={(idx) => { setRoundToEdit(idx); setShowAddRound(true); }}
          onRemove={handleRemoveRound}
        />
      )}

      {selectedRoundIndex !== null && game && game.rounds[selectedRoundIndex] && (
        <HostRoundDetailModal
          round={game.rounds[selectedRoundIndex]}
          roundIndex={selectedRoundIndex}
          players={game.players}
          gameConfig={game.config}
          onClose={() => setSelectedRoundIndex(null)}
        />
      )}

      {showConfig && (
        <HostConfigModal
          config={configEdit}
          onChange={setConfigEdit}
          onSave={handleConfigSave}
          onClose={() => setShowConfig(false)}
        />
      )}

      {showAddRound && (
        <AddHostRoundModal
          key={roundToEdit ?? 'add'}
          game={game}
          onSave={handleSaveRound}
          onClose={() => { setShowAddRound(false); setRoundToEdit(null); }}
          initialRound={roundToEdit !== null ? game.rounds[roundToEdit] : undefined}
          editIndex={roundToEdit ?? undefined}
        />
      )}

      {roundToDelete !== null && (
        <div className="score-modal-overlay" onClick={() => setRoundToDelete(null)} role="dialog" aria-modal="true" aria-labelledby="delete-round-title">
          <div className="score-modal" onClick={(e) => e.stopPropagation()}>
            <h2 id="delete-round-title" className="score-modal-title">Delete this round?</h2>
            <div className="score-modal-actions">
              <button type="button" className="score-btn score-btn-secondary" onClick={() => setRoundToDelete(null)}>Cancel</button>
              <button type="button" className="score-btn score-btn-primary" onClick={confirmRemoveRound}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {showResetConfirm && (
        <div className="score-modal-overlay" onClick={() => setShowResetConfirm(false)} role="dialog" aria-modal="true" aria-labelledby="reset-confirm-title">
          <div className="score-modal" onClick={(e) => e.stopPropagation()}>
            <h2 id="reset-confirm-title" className="score-modal-title">Reset scores?</h2>
            <p className="score-reset-hint">Reset all scores. Players and config will be kept.</p>
            <div className="score-modal-actions">
              <button type="button" className="score-btn score-btn-secondary" onClick={() => setShowResetConfirm(false)}>Cancel</button>
              <button type="button" className="score-btn score-btn-primary" onClick={confirmResetScores}>Reset</button>
            </div>
          </div>
        </div>
      )}

      {showNewGameModal && (
        <div className="score-modal-overlay" onClick={() => setShowNewGameModal(false)} role="dialog" aria-modal="true" aria-labelledby="new-game-title">
          <div className="score-modal score-new-game-modal" onClick={(e) => e.stopPropagation()}>
            <h2 id="new-game-title" className="score-modal-title">New Game</h2>
            <HostNewGameForm
              onSubmit={handleNewGameFromModal}
              onCancel={() => setShowNewGameModal(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
};

interface HostNewGameFormProps {
  onSubmit: (names: string[]) => void;
  onCancel?: () => void;
}

const HostNewGameForm: React.FC<HostNewGameFormProps> = ({ onSubmit, onCancel }) => {
  const [playerCount, setPlayerCount] = useState(5);
  const [names, setNames] = useState<string[]>(() => Array(5).fill(''));

  const handleChange = (index: number, value: string) => {
    setNames((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const handlePlayerCountChange = (count: number) => {
    setPlayerCount(count);
    setNames((prev) => {
      const next = [...prev];
      while (next.length < count) next.push('');
      return next.slice(0, count);
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const filled = names.slice(0, playerCount).map((n) => n.trim() || undefined);
    if (filled.every((n) => n)) {
      onSubmit(names.slice(0, playerCount));
    } else {
      const fallback = names.slice(0, playerCount).map((n, i) => n.trim() || `Player ${i + 1}`);
      onSubmit(fallback);
    }
  };

  const countOptions = Array.from({ length: 19 }, (_, i) => i + 2);

  return (
    <div className="tienlen-new-game">
      {!onCancel && <h3 className="scoreboard-title">New Game</h3>}
      <p className="score-new-game-hint">Enter player names (2–20)</p>
      <div className="score-new-game-player-count">
        <span>Players:</span>
        <select
          value={playerCount}
          onChange={(e) => handlePlayerCountChange(Number(e.target.value))}
          className="score-input host-player-count-select"
        >
          {countOptions.map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
      </div>
      <form onSubmit={handleSubmit} className="score-new-game-form host-new-game-form">
        {Array.from({ length: playerCount }, (_, i) => (
          <label key={i} className="score-new-game-label">
            <span>Player {i + 1}</span>
            <input
              type="text"
              value={names[i] ?? ''}
              onChange={(e) => handleChange(i, e.target.value)}
              placeholder={`Player ${i + 1}`}
              maxLength={20}
              className="score-input"
            />
          </label>
        ))}
        <div className="score-new-game-actions">
          {onCancel && (
            <button type="button" className="score-btn score-btn-secondary" onClick={onCancel}>Cancel</button>
          )}
          <button type="submit" className="score-btn score-btn-primary">Start</button>
        </div>
      </form>
    </div>
  );
};

interface HostRoundHistoryTableProps {
  game: HostGame;
  onRowClick: (index: number) => void;
  onEdit: (index: number) => void;
  onRemove: (index: number) => void;
}

const HostRoundHistoryTable: React.FC<HostRoundHistoryTableProps> = ({ game, onRowClick, onEdit, onRemove }) => {
  const players = game.players;
  const playerIds = players.map((p) => p.id);
  const getName = (id: string) => players.find((p) => p.id === id)?.name ?? '?';

  return (
    <div className="score-round-history host-round-history">
      <h3 className="scoreboard-title">Round history</h3>
      <div className="score-round-table-wrap host-round-table-wrap">
        <table className="score-round-table host-round-table">
          <thead>
            <tr>
              <th>#</th>
              <th className="host-col-host">Host</th>
              {players.map((p) => (
                <th key={p.id}>{p.name}</th>
              ))}
              <th className="score-round-table-actions"></th>
            </tr>
          </thead>
          <tbody>
            {[...game.rounds.keys()].reverse().map((idx) => {
              const round = game.rounds[idx];
              const points = calcHostRoundPoints(round, game.config, playerIds);
              return (
                <tr
                  key={idx}
                  className="score-round-table-row"
                  onClick={() => onRowClick(idx)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && onRowClick(idx)}
                >
                  <td className="score-round-num">{idx + 1}</td>
                  <td className="host-col-host host-host-name">{getName(round.hostId)}</td>
                  {playerIds.map((id) => (
                    <td key={id} className="score-round-point">
                      {(points[id] ?? 0) >= 0 ? '+' : ''}{points[id] ?? 0}
                    </td>
                  ))}
                  <td className="score-round-table-actions">
                    <div className="score-round-actions-wrap">
                      <button
                        type="button"
                        className="score-round-edit"
                        onClick={(e) => { e.stopPropagation(); onEdit(idx); }}
                        aria-label="Edit round"
                        title="Edit"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      </button>
                      <button
                        type="button"
                        className="score-round-remove"
                        onClick={(e) => { e.stopPropagation(); onRemove(idx); }}
                        aria-label="Remove round"
                      >
                        ×
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

interface HostRoundDetailModalProps {
  round: HostRoundResult;
  roundIndex: number;
  players: { id: string; name: string }[];
  gameConfig: HostConfig;
  onClose: () => void;
}

const HostRoundDetailModal: React.FC<HostRoundDetailModalProps> = ({ round, roundIndex, players, gameConfig, onClose }) => {
  const getName = (id: string) => players.find((p) => p.id === id)?.name ?? '?';
  const playerIds = players.map((p) => p.id);
  const points = calcHostRoundPoints(round, round.configSnapshot ?? gameConfig, playerIds);

  return (
    <div className="score-modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="host-detail-title">
      <div className="score-modal" onClick={(e) => e.stopPropagation()}>
        <h2 id="host-detail-title" className="score-modal-title">Round #{roundIndex + 1} details</h2>
        <div className="score-round-detail-summary">
          <h3 className="score-config-section-title">Host</h3>
          <p className="score-round-detail-parts">{getName(round.hostId)}</p>
        </div>
        <div className="score-round-detail-points">
          {playerIds.map((id) => (
            <div key={id} className="score-round-detail-row">
              <span>{getName(id)}</span>
              <span className="scoreboard-value">{(points[id] ?? 0) >= 0 ? '+' : ''}{points[id] ?? 0}</span>
            </div>
          ))}
        </div>
        <div className="score-round-detail-summary">
          <h3 className="score-config-section-title">Results</h3>
          <ul className="score-round-detail-list">
            {Object.entries(round.results).map(([playerId, r]) => (
              <li key={playerId}>
                {getName(playerId)}: {r.result === 'win' ? 'Win' : r.result === 'lose' ? 'Lose' : 'Draw'}
                {r.multiplier > 1 && ` (${r.multiplier}x)`}
              </li>
            ))}
          </ul>
        </div>
        <div className="score-modal-actions">
          <button type="button" className="score-btn score-btn-primary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
};

interface HostConfigModalProps {
  config: HostConfig;
  onChange: (c: HostConfig) => void;
  onSave: () => void;
  onClose: () => void;
}

const HostConfigModal: React.FC<HostConfigModalProps> = ({ config, onChange, onSave, onClose }) => {
  return (
    <div className="score-modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="host-config-title">
      <div className="score-modal score-config-modal" onClick={(e) => e.stopPropagation()}>
        <h2 id="host-config-title" className="score-modal-title">Config</h2>
        <section className="score-config-section">
          <h3 className="score-config-section-title">Bet amount</h3>
          <label className="host-config-label">
            <span>Points per bet</span>
            <input
              type="number"
              min={1}
              value={config.betAmount}
              onChange={(e) => onChange({ ...config, betAmount: Math.max(1, Number(e.target.value)) })}
              className="score-input"
            />
          </label>
        </section>
        <div className="score-modal-actions">
          <button type="button" className="score-btn score-btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="score-btn score-btn-primary" onClick={onSave}>Save</button>
        </div>
      </div>
    </div>
  );
};

export default HostScore;
