import React, { useState, useEffect, useCallback } from 'react';
import {
  loadGame,
  saveGame,
  createGame,
  resetGame,
  removeRound,
  updateRound,
  calcTotalScores,
  calcRoundPoints,
  migrateRound,
  migrateConfig,
  type TienLenGame,
  type TienLenConfig,
  type RoundResult,
  DEFAULT_CONFIG,
} from '../lib/tienLenScore';
import AddRoundModal from './AddRoundModal';

const TienLenScore: React.FC = () => {
  const [game, setGame] = useState<TienLenGame | null>(() => loadGame());
  const [showConfig, setShowConfig] = useState(false);
  const [showAddRound, setShowAddRound] = useState(false);
  const [showNewGameModal, setShowNewGameModal] = useState(false);
  const [configEdit, setConfigEdit] = useState<TienLenConfig>(DEFAULT_CONFIG);

  useEffect(() => {
    if (game) {
      saveGame(game);
      setConfigEdit(game.config);
    }
  }, [game]);

  const handleNewGame = useCallback((names: string[]) => {
    setGame(createGame(names));
    setShowConfig(true);
  }, []);

  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const confirmResetScores = useCallback(() => {
    if (!game) return;
    setGame(resetGame(game));
    setShowResetConfirm(false);
  }, [game]);

  const handleSaveRound = useCallback((result: RoundResult, editIndex?: number) => {
    if (!game) return;
    if (editIndex !== undefined) {
      setGame(updateRound(game, editIndex, result));
    } else {
      setGame({
        ...game,
        rounds: [...game.rounds, { ...result, configSnapshot: game.config }],
      });
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
    setGame(removeRound(game, roundToDelete));
    setRoundToDelete(null);
    if (selectedRoundIndex !== null) {
      if (selectedRoundIndex === roundToDelete) setSelectedRoundIndex(null);
      else if (selectedRoundIndex > roundToDelete) setSelectedRoundIndex((i) => (i ?? 0) - 1);
    }
  }, [game, roundToDelete, selectedRoundIndex]);

  if (!game) {
    return <NewGameForm onSubmit={handleNewGame} />;
  }

  const handleNewGameFromModal = useCallback((names: string[]) => {
    setGame(createGame(names));
    setShowNewGameModal(false);
    setShowConfig(true);
  }, []);

  const scores = calcTotalScores(game);
  const sortedPlayers = [...game.players].sort((a, b) => (scores[b.id] ?? 0) - (scores[a.id] ?? 0));

  return (
    <div className="tienlen-score">
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
        <RoundHistoryTable
          game={game}
          onRowClick={(idx) => setSelectedRoundIndex(idx)}
          onEdit={(idx) => { setRoundToEdit(idx); setShowAddRound(true); }}
          onRemove={handleRemoveRound}
        />
      )}

      {selectedRoundIndex !== null && game && game.rounds[selectedRoundIndex] && (
        <RoundDetailModal
          round={game.rounds[selectedRoundIndex]}
          roundIndex={selectedRoundIndex}
          players={game.players}
          gameConfig={game.config}
          onClose={() => setSelectedRoundIndex(null)}
        />
      )}

      {showConfig && (
        <ConfigModal
          config={configEdit}
          onChange={setConfigEdit}
          onSave={handleConfigSave}
          onClose={() => setShowConfig(false)}
          playerCount={game.players.length}
        />
      )}

      {showAddRound && (
        <AddRoundModal
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
            <NewGameForm
              onSubmit={handleNewGameFromModal}
              onCancel={() => setShowNewGameModal(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
};

interface NewGameFormProps {
  onSubmit: (names: string[]) => void;
  onCancel?: () => void;
}

const NewGameForm: React.FC<NewGameFormProps> = ({ onSubmit, onCancel }) => {
  const [playerCount, setPlayerCount] = useState(4);
  const [names, setNames] = useState<string[]>(['', '', '', '']);

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

  return (
    <div className="tienlen-new-game">
      {!onCancel && <h3 className="scoreboard-title">New Game</h3>}
      <p className="score-new-game-hint">Enter player names (2–4)</p>
      <div className="score-new-game-player-count">
        <span>Players:</span>
        {[2, 3, 4].map((n) => (
          <button
            key={n}
            type="button"
            className={`score-btn score-btn-secondary score-player-count-btn ${playerCount === n ? 'active' : ''}`}
            onClick={() => handlePlayerCountChange(n)}
          >
            {n}
          </button>
        ))}
      </div>
      <form onSubmit={handleSubmit} className="score-new-game-form">
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

const CATCH_TYPE_LABELS: Record<string, string> = {
  red2: 'Red 2',
  black2: 'Black 2',
  threePairs: 'Three pairs',
  fourPairs: 'Four pairs',
  fourOfKind: 'Four of a kind',
};

interface RoundHistoryTableProps {
  game: TienLenGame;
  onRowClick: (index: number) => void;
  onEdit: (index: number) => void;
  onRemove: (index: number) => void;
}

const RoundHistoryTable: React.FC<RoundHistoryTableProps> = ({ game, onRowClick, onEdit, onRemove }) => {
  const players = game.players;
  const playerIds = players.map((p) => p.id);

  return (
    <div className="score-round-history">
      <h3 className="scoreboard-title">Round history</h3>
      <div className="score-round-table-wrap">
        <table className="score-round-table">
          <thead>
            <tr>
              <th>#</th>
              {players.map((p) => (
                <th key={p.id}>{p.name}</th>
              ))}
              <th className="score-round-table-actions"></th>
            </tr>
          </thead>
          <tbody>
            {[...game.rounds.keys()].reverse().map((idx) => {
              const round = game.rounds[idx];
              const roundConfig = round.configSnapshot ? migrateConfig(round.configSnapshot as unknown as Record<string, unknown>) : game.config;
              const points = calcRoundPoints(migrateRound(round as unknown as Record<string, unknown>), roundConfig, playerIds);
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

interface RoundDetailModalProps {
  round: RoundResult;
  roundIndex: number;
  players: { id: string; name: string }[];
  gameConfig: TienLenConfig;
  onClose: () => void;
}

const RoundDetailModal: React.FC<RoundDetailModalProps> = ({ round, roundIndex, players, gameConfig, onClose }) => {
  const getName = (id: string) => players.find((p) => p.id === id)?.name ?? '?';
  const playerIds = players.map((p) => p.id);
  const roundConfig = round.configSnapshot ? migrateConfig(round.configSnapshot as unknown as Record<string, unknown>) : gameConfig;
  const points = calcRoundPoints(migrateRound(round as unknown as Record<string, unknown>), roundConfig, playerIds);

  const hasSummary = Boolean(
    (round.customPoints && Object.keys(round.customPoints).length > 0) ||
    (round.isToiTrang && round.winnerId) ||
    (round.order.length >= 2) ||
    (round.catch?.length) ||
    (round.last?.length)
  );

  return (
    <div className="score-modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="round-detail-title">
      <div className="score-modal" onClick={(e) => e.stopPropagation()}>
        <h2 id="round-detail-title" className="score-modal-title">Round #{roundIndex + 1} details</h2>
        <div className="score-round-detail-points">
          {playerIds.map((id) => (
            <div key={id} className="score-round-detail-row">
              <span>{getName(id)}</span>
              <span className="scoreboard-value">{(points[id] ?? 0) >= 0 ? '+' : ''}{points[id] ?? 0}</span>
            </div>
          ))}
        </div>
        {hasSummary && (
          <div className="score-round-detail-summary">
            <h3 className="score-config-section-title">Summary</h3>
            <div className="score-round-detail-blocks">
              {round.customPoints && Object.keys(round.customPoints).length > 0 && (
                <div className="score-round-detail-block">
                  <span className="score-round-detail-label">Custom</span>
                </div>
              )}
              {round.isToiTrang && round.winnerId && (
                <div className="score-round-detail-block">
                  <span className="score-round-detail-label">Sweep</span>
                  <span>{getName(round.winnerId)}</span>
                </div>
              )}
              {!round.isToiTrang && round.order.length >= 2 && (
                <div className="score-round-detail-block">
                  <span className="score-round-detail-label">Order</span>
                  <ul className="score-round-detail-list">
                    {round.order.map((id, i) => (
                      <li key={id}>{i + 1}. {getName(id)}</li>
                    ))}
                  </ul>
                  {round.rucCount && round.rucCount > 0 && (
                    <span className="score-round-detail-stuck">{round.rucCount} stuck</span>
                  )}
                </div>
              )}
              {round.catch?.length ? (
                <div className="score-round-detail-block">
                  <span className="score-round-detail-label">Beat</span>
                  <ul className="score-round-detail-list">
                    {round.catch.map((c, i) => {
                      const itemStr = c.items.map((it) => `${it.qty}× ${CATCH_TYPE_LABELS[it.type] ?? it.type}`).join(', ');
                      return (
                        <li key={i}>{getName(c.catcherId)} → {getName(c.victimId)} ({itemStr})</li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}
              {round.last?.length ? (
                <div className="score-round-detail-block">
                  <span className="score-round-detail-label">Hold</span>
                  <ul className="score-round-detail-list">
                    {round.last.map((l, i) => (
                      <li key={i}>{getName(l.playerId)}: {CATCH_TYPE_LABELS[l.type] ?? l.type}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </div>
        )}
        <div className="score-modal-actions">
          <button type="button" className="score-btn score-btn-primary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
};

interface ConfigModalProps {
  config: TienLenConfig;
  onChange: (c: TienLenConfig) => void;
  onSave: () => void;
  onClose: () => void;
  playerCount: number;
}

const ConfigModal: React.FC<ConfigModalProps> = ({ config, onChange, onSave, onClose, playerCount }) => {
  const update = (key: keyof TienLenConfig, value: number) => {
    onChange({ ...config, [key]: value });
  };

  const ConfigLabel = ({ label, keyName }: { label: string; keyName: keyof TienLenConfig }) => (
    <label>
      <span>{label}</span>
      <input type="number" value={config[keyName] as number} onChange={(e) => update(keyName, Number(e.target.value))} className="score-input" />
    </label>
  );

  const winLabels: { label: string; keyName: keyof TienLenConfig }[] = [
    { label: '1st', keyName: 'pointsFirst' },
    { label: '2nd', keyName: 'pointsSecond' },
    ...(playerCount >= 3 ? [{ label: '3rd', keyName: 'pointsThird' as keyof TienLenConfig }] : []),
    ...(playerCount >= 4 ? [{ label: '4th', keyName: 'pointsFourth' as keyof TienLenConfig }] : []),
  ];

  return (
    <div className="score-modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="config-title">
      <div className="score-modal score-config-modal" onClick={(e) => e.stopPropagation()}>
        <h2 id="config-title" className="score-modal-title">Points config</h2>

        <section className="score-config-section">
          <h3 className="score-config-section-title">Win (rankings)</h3>
          <div className="score-config-grid">
            {winLabels.map(({ label, keyName }) => (
              <ConfigLabel key={keyName} label={label} keyName={keyName} />
            ))}
          </div>
        </section>

        <section className="score-config-section">
          <h3 className="score-config-section-title">Catch (beat)</h3>
          <div className="score-config-grid">
            <ConfigLabel label="Red 2" keyName="pointsCatchRed2" />
            <ConfigLabel label="Black 2" keyName="pointsCatchBlack2" />
            <ConfigLabel label="Three pairs" keyName="pointsCatchThreePairs" />
            <ConfigLabel label="Four pairs" keyName="pointsCatchFourPairs" />
            <ConfigLabel label="Four of a kind" keyName="pointsCatchFourOfKind" />
          </div>
        </section>

        <section className="score-config-section">
          <h3 className="score-config-section-title">Last (holding)</h3>
          <div className="score-config-grid">
            <ConfigLabel label="Red 2" keyName="pointsLastRed2" />
            <ConfigLabel label="Black 2" keyName="pointsLastBlack2" />
            <ConfigLabel label="Three pairs" keyName="pointsLastThreePairs" />
            <ConfigLabel label="Four pairs" keyName="pointsLastFourPairs" />
            <ConfigLabel label="Four of a kind" keyName="pointsLastFourOfKind" />
          </div>
        </section>

        <section className="score-config-section">
          <h3 className="score-config-section-title">Special</h3>
          <div className="score-config-grid">
            <ConfigLabel label="Sweep (pts/loser)" keyName="pointsToiTrangPerLoser" />
            <ConfigLabel label="Stuck (pts per person)" keyName="pointsRucPerPerson" />
          </div>
        </section>

        <div className="score-modal-actions">
          <button type="button" className="score-btn score-btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="score-btn score-btn-primary" onClick={onSave}>Save</button>
        </div>
      </div>
    </div>
  );
};

export default TienLenScore;
