import React, { useState, useEffect, useCallback } from 'react';
import {
  loadWinCountGame,
  saveWinCountGame,
  createWinCountGame,
  resetWinCountGame,
  addWinCountRound,
  updateWinCountRound,
  removeWinCountRound,
  calcWinCountTotalScores,
  calcWinCountTotalMoney,
  calcWinCountRoundPoints,
  calcWinCountRoundMoney,
  DEFAULT_WIN_COUNT_CONFIG,
  MIN_WIN_COUNT_PLAYERS,
  MAX_WIN_COUNT_PLAYERS,
} from '../lib/winCount';
import type { WinCountGame, WinCountConfig, WinCountRound, Player } from '../lib/winCount';
import { formatMoney, formatMoneySigned, shouldShowMoney } from '../lib/money';
import AddWinRoundModal from './AddWinRoundModal';
import ScoreViewToggle from './ScoreViewToggle';
import type { ScoreView } from './ScoreViewToggle';

const WinCountScore: React.FC = () => {
  const [game, setGame] = useState<WinCountGame | null>(() => loadWinCountGame());
  const [showConfig, setShowConfig] = useState(false);
  const [showAddRound, setShowAddRound] = useState(false);
  const [showNewGameModal, setShowNewGameModal] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [configEdit, setConfigEdit] = useState<WinCountConfig>(DEFAULT_WIN_COUNT_CONFIG);
  const [roundToDelete, setRoundToDelete] = useState<number | null>(null);
  const [roundToEdit, setRoundToEdit] = useState<number | null>(null);
  const [selectedRoundIndex, setSelectedRoundIndex] = useState<number | null>(null);
  const [historyView, setHistoryView] = useState<ScoreView>('points');

  useEffect(() => {
    if (game) {
      saveWinCountGame(game);
      setConfigEdit(game.config);
    }
  }, [game]);

  const handleNewGame = useCallback((names: string[]) => {
    setGame(createWinCountGame(names));
    setShowConfig(true);
  }, []);

  const handleNewGameFromModal = useCallback((names: string[]) => {
    setGame(createWinCountGame(names));
    setShowNewGameModal(false);
    setShowConfig(true);
  }, []);

  const handleSaveRound = useCallback(
    (round: WinCountRound) => {
      if (!game) return;
      setGame(roundToEdit !== null ? updateWinCountRound(game, roundToEdit, round) : addWinCountRound(game, round));
      setShowAddRound(false);
      setRoundToEdit(null);
    },
    [game, roundToEdit]
  );

  const confirmRemoveRound = useCallback(() => {
    if (!game || roundToDelete === null) return;
    setGame(removeWinCountRound(game, roundToDelete));
    if (selectedRoundIndex !== null) {
      if (selectedRoundIndex === roundToDelete) setSelectedRoundIndex(null);
      else if (selectedRoundIndex > roundToDelete) setSelectedRoundIndex((i) => (i ?? 0) - 1);
    }
    setRoundToDelete(null);
  }, [game, roundToDelete, selectedRoundIndex]);

  const confirmResetScores = useCallback(() => {
    if (!game) return;
    setGame(resetWinCountGame(game));
    setShowResetConfirm(false);
  }, [game]);

  if (!game) {
    return <WinCountNewGameForm onSubmit={handleNewGame} />;
  }

  const scores = calcWinCountTotalScores(game);
  const money = calcWinCountTotalMoney(game);
  const sortedPlayers = [...game.players].sort((a, b) => (scores[b.id] ?? 0) - (scores[a.id] ?? 0));
  const showMoney = shouldShowMoney(
    game.config.betAmount,
    game.rounds.map((r) => r.configSnapshot?.betAmount)
  );

  return (
    <div className="wincount-score tienlen-score">
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
        <div className={`scoreboard-header${showMoney ? ' has-money' : ''}`}>
          <span className="scoreboard-col-player">Player</span>
          <span className="scoreboard-col-score">Wins</span>
          {showMoney && <span className="scoreboard-col-money">Money</span>}
        </div>
        <div className="scoreboard-body">
          <table className="scoreboard-table">
            <colgroup>
              <col />
              <col />
              {showMoney && <col />}
            </colgroup>
            <tbody>
              {sortedPlayers.map((p) => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td className="scoreboard-value">{scores[p.id] ?? 0}</td>
                  {showMoney && (
                    <td className="scoreboard-value scoreboard-money">
                      {formatMoneySigned(money[p.id] ?? 0)}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <button
        type="button"
        className="score-btn score-btn-primary score-add-round-btn"
        onClick={() => {
          setRoundToEdit(null);
          setShowAddRound(true);
        }}
      >
        Add Round
      </button>

      {game.rounds.length > 0 && (
        <WinCountRoundHistoryTable
          game={game}
          showMoney={showMoney}
          historyView={historyView}
          onHistoryViewChange={setHistoryView}
          onRowClick={setSelectedRoundIndex}
          onEdit={(idx) => {
            setRoundToEdit(idx);
            setShowAddRound(true);
          }}
          onRemove={setRoundToDelete}
        />
      )}

      {showAddRound && (
        <AddWinRoundModal
          players={game.players}
          initialRound={roundToEdit !== null ? game.rounds[roundToEdit] : null}
          onSave={handleSaveRound}
          onClose={() => {
            setShowAddRound(false);
            setRoundToEdit(null);
          }}
        />
      )}

      {selectedRoundIndex !== null && game.rounds[selectedRoundIndex] && (
        <WinCountRoundDetailModal
          round={game.rounds[selectedRoundIndex]}
          roundIndex={selectedRoundIndex}
          players={game.players}
          gameConfig={game.config}
          showMoney={showMoney}
          onClose={() => setSelectedRoundIndex(null)}
        />
      )}

      {showConfig && (
        <WinCountConfigModal
          config={configEdit}
          playerCount={game.players.length}
          onChange={setConfigEdit}
          onSave={() => {
            setGame({ ...game, config: configEdit });
            setShowConfig(false);
          }}
          onClose={() => {
            setConfigEdit(game.config);
            setShowConfig(false);
          }}
        />
      )}

      {showResetConfirm && (
        <div className="score-modal-overlay" onClick={() => setShowResetConfirm(false)} role="dialog" aria-modal="true" aria-labelledby="wincount-reset-confirm-title">
          <div className="score-modal" onClick={(e) => e.stopPropagation()}>
            <h2 id="wincount-reset-confirm-title" className="score-modal-title">Reset scores?</h2>
            <p className="score-reset-hint">This clears every round. Players and config stay.</p>
            <div className="score-modal-actions">
              <button type="button" className="score-btn score-btn-secondary" onClick={() => setShowResetConfirm(false)}>
                Cancel
              </button>
              <button type="button" className="score-btn score-btn-primary" onClick={confirmResetScores}>
                Reset
              </button>
            </div>
          </div>
        </div>
      )}

      {roundToDelete !== null && (
        <div className="score-modal-overlay" onClick={() => setRoundToDelete(null)} role="dialog" aria-modal="true" aria-labelledby="wincount-delete-round-title">
          <div className="score-modal" onClick={(e) => e.stopPropagation()}>
            <h2 id="wincount-delete-round-title" className="score-modal-title">Delete round #{roundToDelete + 1}?</h2>
            <div className="score-modal-actions">
              <button type="button" className="score-btn score-btn-secondary" onClick={() => setRoundToDelete(null)}>
                Cancel
              </button>
              <button type="button" className="score-btn score-btn-primary" onClick={confirmRemoveRound}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {showNewGameModal && (
        <div className="score-modal-overlay" onClick={() => setShowNewGameModal(false)} role="dialog" aria-modal="true" aria-labelledby="wincount-new-game-title">
          <div className="score-modal" onClick={(e) => e.stopPropagation()}>
            <h2 id="wincount-new-game-title" className="score-modal-title">New Game</h2>
            <WinCountNewGameForm onSubmit={handleNewGameFromModal} onCancel={() => setShowNewGameModal(false)} />
          </div>
        </div>
      )}
    </div>
  );
};

interface WinCountNewGameFormProps {
  onSubmit: (names: string[]) => void;
  onCancel?: () => void;
}

const WinCountNewGameForm: React.FC<WinCountNewGameFormProps> = ({ onSubmit, onCancel }) => {
  const [playerCount, setPlayerCount] = useState(4);
  const [names, setNames] = useState<string[]>(() => Array(4).fill(''));

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
    onSubmit(names.slice(0, playerCount).map((n, i) => n.trim() || `Player ${i + 1}`));
  };

  const countOptions = Array.from(
    { length: MAX_WIN_COUNT_PLAYERS - MIN_WIN_COUNT_PLAYERS + 1 },
    (_, i) => i + MIN_WIN_COUNT_PLAYERS
  );

  return (
    <div className="tienlen-new-game">
      {!onCancel && <h3 className="scoreboard-title">New Game</h3>}
      <p className="score-new-game-hint">
        Enter player names ({MIN_WIN_COUNT_PLAYERS}–{MAX_WIN_COUNT_PLAYERS})
      </p>
      <div className="score-new-game-player-count">
        <span>Players:</span>
        <select
          value={playerCount}
          onChange={(e) => handlePlayerCountChange(Number(e.target.value))}
          className="score-input host-player-count-select"
        >
          {countOptions.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
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
              onChange={(e) =>
                setNames((prev) => {
                  const next = [...prev];
                  next[i] = e.target.value;
                  return next;
                })
              }
              placeholder={`Player ${i + 1}`}
              maxLength={20}
              className="score-input"
            />
          </label>
        ))}
        <div className="score-new-game-actions">
          {onCancel && (
            <button type="button" className="score-btn score-btn-secondary" onClick={onCancel}>
              Cancel
            </button>
          )}
          <button type="submit" className="score-btn score-btn-primary">
            Start
          </button>
        </div>
      </form>
    </div>
  );
};

interface WinCountRoundHistoryTableProps {
  game: WinCountGame;
  showMoney: boolean;
  historyView: ScoreView;
  onHistoryViewChange: (v: ScoreView) => void;
  onRowClick: (index: number) => void;
  onEdit: (index: number) => void;
  onRemove: (index: number) => void;
}

const WinCountRoundHistoryTable: React.FC<WinCountRoundHistoryTableProps> = ({
  game,
  showMoney,
  historyView,
  onHistoryViewChange,
  onRowClick,
  onEdit,
  onRemove,
}) => {
  const players = game.players;
  const playerIds = players.map((p) => p.id);
  const getName = (id: string) => players.find((p) => p.id === id)?.name ?? '?';
  const viewingMoney = showMoney && historyView === 'money';

  return (
    <div className="score-round-history host-round-history">
      <div className="score-history-head">
        <h3 className="scoreboard-title">Round history</h3>
        {showMoney && <ScoreViewToggle view={historyView} onChange={onHistoryViewChange} />}
      </div>
      <div className="score-round-table-wrap host-round-table-wrap">
        <table className="score-round-table host-round-table">
          <thead>
            <tr>
              <th>#</th>
              <th className="host-col-host">Winner</th>
              {players.map((p) => (
                <th key={p.id}>{p.name}</th>
              ))}
              <th className="score-round-table-actions"></th>
            </tr>
          </thead>
          <tbody>
            {[...game.rounds.keys()].reverse().map((idx) => {
              const round = game.rounds[idx];
              const values = viewingMoney
                ? calcWinCountRoundMoney(round, game.config, playerIds)
                : calcWinCountRoundPoints(round, game.config, playerIds);
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
                  <td className="host-col-host host-host-name">{getName(round.winnerId)}</td>
                  {playerIds.map((id) => (
                    <td key={id} className="score-round-point">
                      {viewingMoney
                        ? formatMoneySigned(values[id] ?? 0)
                        : `${(values[id] ?? 0) >= 0 ? '+' : ''}${values[id] ?? 0}`}
                    </td>
                  ))}
                  <td className="score-round-table-actions">
                    <div className="score-round-actions-wrap">
                      <button
                        type="button"
                        className="score-round-edit"
                        onClick={(e) => {
                          e.stopPropagation();
                          onEdit(idx);
                        }}
                        aria-label="Edit round"
                        title="Edit"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      </button>
                      <button
                        type="button"
                        className="score-round-remove"
                        onClick={(e) => {
                          e.stopPropagation();
                          onRemove(idx);
                        }}
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

interface WinCountRoundDetailModalProps {
  round: WinCountRound;
  roundIndex: number;
  players: Player[];
  gameConfig: WinCountConfig;
  showMoney: boolean;
  onClose: () => void;
}

const WinCountRoundDetailModal: React.FC<WinCountRoundDetailModalProps> = ({
  round,
  roundIndex,
  players,
  gameConfig,
  showMoney,
  onClose,
}) => {
  const playerIds = players.map((p) => p.id);
  const getName = (id: string) => players.find((p) => p.id === id)?.name ?? '?';
  const points = calcWinCountRoundPoints(round, gameConfig, playerIds);
  const money = calcWinCountRoundMoney(round, gameConfig, playerIds);

  return (
    <div className="score-modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="win-detail-title">
      <div className="score-modal" onClick={(e) => e.stopPropagation()}>
        <h2 id="win-detail-title" className="score-modal-title">
          Round #{roundIndex + 1} details
        </h2>
        <div className="score-round-detail-summary">
          <h3 className="score-config-section-title">Winner</h3>
          <p className="score-round-detail-parts">{getName(round.winnerId)}</p>
        </div>
        <div className="score-round-detail-points">
          {playerIds.map((id) => (
            <div key={id} className="score-round-detail-row">
              <span>{getName(id)}</span>
              <span className="scoreboard-value">
                {(points[id] ?? 0) >= 0 ? '+' : ''}
                {points[id] ?? 0}
                {showMoney && (
                  <span className="scoreboard-money"> {formatMoneySigned(money[id] ?? 0)}</span>
                )}
              </span>
            </div>
          ))}
        </div>
        <div className="score-modal-actions">
          <button type="button" className="score-btn score-btn-primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

interface WinCountConfigModalProps {
  config: WinCountConfig;
  playerCount: number;
  onChange: (c: WinCountConfig) => void;
  onSave: () => void;
  onClose: () => void;
}

const WinCountConfigModal: React.FC<WinCountConfigModalProps> = ({
  config,
  playerCount,
  onChange,
  onSave,
  onClose,
}) => {
  const bet = config.betAmount ?? 0;
  const winnerTakes = bet * Math.max(0, playerCount - 1);

  return (
    <div className="score-modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="win-config-title">
      <div className="score-modal score-config-modal" onClick={(e) => e.stopPropagation()}>
        <h2 id="win-config-title" className="score-modal-title">Config</h2>
        <section className="score-config-section">
          <h3 className="score-config-section-title">Money</h3>
          <label className="host-config-label">
            <span>Bet per loser</span>
            <input
              type="number"
              min={0}
              step={1000}
              value={bet}
              onChange={(e) => onChange({ ...config, betAmount: Math.max(0, Number(e.target.value) || 0) })}
              className="score-input"
            />
          </label>
          <p className="score-config-preview">
            {bet === 0
              ? 'No money tracked. Set a bet to settle up in cash.'
              : `${formatMoney(bet)} → winner of a ${playerCount}-player round gets ${formatMoneySigned(winnerTakes)}`}
          </p>
        </section>
        <div className="score-modal-actions">
          <button type="button" className="score-btn score-btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="score-btn score-btn-primary" onClick={onSave}>Save</button>
        </div>
      </div>
    </div>
  );
};

export default WinCountScore;
