import React, { useState, useEffect, useCallback } from 'react';
import {
  loadWinCountSession,
  saveWinCountSession,
  createWinCountSession,
  startWinCountGame,
  replaceGame,
  resetWinCountGame,
  removeGame,
  addWinCountRound,
  updateWinCountRound,
  removeWinCountRound,
  calcWinCountTotalScores,
  calcWinCountTotalMoney,
  calcWinCountSessionTotals,
  calcWinCountRoundPoints,
  calcWinCountRoundMoney,
  shouldShowSessionMoney,
  setMoneyAdjustment,
  getGamePlayers,
  DEFAULT_WIN_COUNT_CONFIG,
  MIN_WIN_COUNT_PLAYERS,
  MAX_WIN_COUNT_PLAYERS,
} from '../lib/winCount';
import type { WinCountSession, WinCountGame, WinCountConfig, WinCountRound } from '../lib/winCount';
import { createSessionPlayer } from '../lib/session';
import type { SessionPlayer } from '../lib/session';
import { formatMoney, formatMoneySigned } from '../lib/money';
import AddWinRoundModal from './AddWinRoundModal';
import ScoreViewToggle from './ScoreViewToggle';
import type { ScoreView } from './ScoreViewToggle';
import WinCountGameTabs from './WinCountGameTabs';
import type { WinCountTab } from './WinCountGameTabs';
import WinCountTotalBoard from './WinCountTotalBoard';
import WinCountRosterModal, { WinCountRosterForm } from './WinCountRosterModal';
import type { RosterResult } from './WinCountRosterModal';

const WinCountScore: React.FC = () => {
  const [session, setSession] = useState<WinCountSession | null>(() => loadWinCountSession());
  // Opens on the session's active game, not on Total.
  const [tab, setTab] = useState<WinCountTab>(session?.activeGameIndex ?? 0);
  const [showConfig, setShowConfig] = useState(false);
  const [showAddRound, setShowAddRound] = useState(false);
  const [showRosterModal, setShowRosterModal] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showNewSessionConfirm, setShowNewSessionConfirm] = useState(false);
  const [showRemoveGameConfirm, setShowRemoveGameConfirm] = useState(false);
  const [configEdit, setConfigEdit] = useState<WinCountConfig>(DEFAULT_WIN_COUNT_CONFIG);
  const [roundToDelete, setRoundToDelete] = useState<number | null>(null);
  const [roundToEdit, setRoundToEdit] = useState<number | null>(null);
  const [selectedRoundIndex, setSelectedRoundIndex] = useState<number | null>(null);
  const [historyView, setHistoryView] = useState<ScoreView>('points');

  useEffect(() => {
    if (session) saveWinCountSession(session);
  }, [session]);

  const gameIndex = tab === 'total' ? -1 : tab;
  const game: WinCountGame | null =
    session && gameIndex >= 0 ? session.games[gameIndex] ?? null : null;

  useEffect(() => {
    if (game) setConfigEdit(game.config);
  }, [game]);

  /** Write an edited game back into the session. */
  const putGame = useCallback(
    (next: WinCountGame) => {
      setSession((prev) => (prev ? replaceGame(prev, gameIndex, next) : prev));
    },
    [gameIndex]
  );

  const handleNewSession = useCallback((result: RosterResult) => {
    const base = createWinCountSession(result.added);
    const config = { betAmount: result.betAmount };
    setSession({
      ...base,
      config,
      games: base.games.map((g) => ({ ...g, config })),
    });
    setTab(0);
    setShowRosterModal(false);
  }, []);

  const handleNewGame = useCallback((result: RosterResult) => {
    setSession((prev) => {
      if (!prev) return prev;
      const newPlayers = result.added.map(createSessionPlayer);
      const withPlayers: WinCountSession = {
        ...prev,
        players: [...prev.players, ...newPlayers],
      };
      const playerIds = [
        ...result.existing.filter((e) => e.playing).map((e) => e.id),
        ...newPlayers.map((p) => p.id),
      ];
      const next = startWinCountGame(withPlayers, playerIds, { betAmount: result.betAmount });
      setTab(next.activeGameIndex);
      return next;
    });
    setShowRosterModal(false);
  }, []);

  const handleSaveRound = useCallback(
    (round: WinCountRound) => {
      if (!game) return;
      putGame(
        roundToEdit !== null
          ? updateWinCountRound(game, roundToEdit, round)
          : addWinCountRound(game, round)
      );
      setShowAddRound(false);
      setRoundToEdit(null);
    },
    [game, roundToEdit, putGame]
  );

  const confirmRemoveRound = useCallback(() => {
    if (!game || roundToDelete === null) return;
    putGame(removeWinCountRound(game, roundToDelete));
    if (selectedRoundIndex !== null) {
      if (selectedRoundIndex === roundToDelete) setSelectedRoundIndex(null);
      else if (selectedRoundIndex > roundToDelete) setSelectedRoundIndex((i) => (i ?? 0) - 1);
    }
    setRoundToDelete(null);
  }, [game, roundToDelete, selectedRoundIndex, putGame]);

  const confirmResetScores = useCallback(() => {
    if (!game) return;
    putGame(resetWinCountGame(game));
    setShowResetConfirm(false);
  }, [game, putGame]);

  const confirmRemoveGame = useCallback(() => {
    setSession((prev) => {
      if (!prev || gameIndex < 0) return prev;
      const next = removeGame(prev, gameIndex);
      setTab(next.activeGameIndex);
      return next;
    });
    setShowRemoveGameConfirm(false);
  }, [gameIndex]);

  const handleAdjustmentChange = useCallback((playerId: string, amount: number) => {
    setSession((prev) => (prev ? setMoneyAdjustment(prev, playerId, amount) : prev));
  }, []);

  const confirmNewSession = useCallback(() => {
    setSession(null);
    setTab(0);
    setShowNewSessionConfirm(false);
  }, []);

  if (!session) {
    return (
      <div className="tienlen-new-game">
        <h3 className="scoreboard-title">New Session</h3>
        <p className="score-new-game-hint">
          Enter player names ({MIN_WIN_COUNT_PLAYERS}–{MAX_WIN_COUNT_PLAYERS})
        </p>
        <WinCountRosterForm
          players={[]}
          defaultBet={0}
          submitLabel="Start"
          onSubmit={handleNewSession}
        />
      </div>
    );
  }

  const totals = calcWinCountSessionTotals(session);
  const showMoney = shouldShowSessionMoney(session);
  const gamePlayers: SessionPlayer[] = game ? getGamePlayers(session, game) : [];
  const scores = game ? calcWinCountTotalScores(game) : {};
  const money = game ? calcWinCountTotalMoney(game) : {};
  const sortedPlayers = [...gamePlayers].sort((a, b) => (scores[b.id] ?? 0) - (scores[a.id] ?? 0));
  const gameLabel = gameIndex >= 0 ? `G${gameIndex + 1}` : '';
  // The last game cannot go: a session with no games has no roster and no tabs.
  const canRemoveGame = game !== null && session.games.length > 1;

  return (
    <div className="wincount-score tienlen-score">
      <div className="score-header">
        <button
          type="button"
          className="score-btn score-btn-secondary"
          onClick={() => setShowConfig(true)}
          disabled={!game}
        >
          Config
        </button>
        <button
          type="button"
          className="score-btn score-btn-secondary"
          onClick={() => setShowResetConfirm(true)}
          disabled={!game}
        >
          Reset Scores
        </button>
        <button
          type="button"
          className="score-btn score-btn-secondary"
          onClick={() => setShowRosterModal(true)}
        >
          New Game
        </button>
        <button
          type="button"
          className="score-btn score-btn-secondary"
          onClick={() => setShowRemoveGameConfirm(true)}
          disabled={!canRemoveGame}
        >
          Remove Game
        </button>
        <button
          type="button"
          className="score-btn score-btn-secondary"
          onClick={() => setShowNewSessionConfirm(true)}
        >
          New Session
        </button>
      </div>

      <WinCountGameTabs gameCount={session.games.length} selected={tab} onSelect={setTab} />

      {tab === 'total' ? (
        <WinCountTotalBoard
          players={session.players}
          scores={totals.scores}
          money={totals.money}
          adjustments={session.moneyAdjustments ?? {}}
          gamesPlayed={totals.gamesPlayed}
          showMoney={showMoney}
          onAdjustmentChange={handleAdjustmentChange}
        />
      ) : (
        <div className="scoreboard">
          <h3 className="scoreboard-title">Scoreboard — {gameLabel}</h3>
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
      )}

      {game && (
        <button
          type="button"
          className="score-btn score-btn-primary score-add-round-btn"
          onClick={() => {
            setRoundToEdit(null);
            setShowAddRound(true);
          }}
        >
          Add Round — {gameLabel}
        </button>
      )}

      {game && game.rounds.length > 0 && (
        <WinCountRoundHistoryTable
          game={game}
          players={gamePlayers}
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

      {game && showAddRound && (
        <AddWinRoundModal
          players={gamePlayers}
          initialRound={roundToEdit !== null ? game.rounds[roundToEdit] : null}
          onSave={handleSaveRound}
          onClose={() => {
            setShowAddRound(false);
            setRoundToEdit(null);
          }}
        />
      )}

      {game && selectedRoundIndex !== null && game.rounds[selectedRoundIndex] && (
        <WinCountRoundDetailModal
          round={game.rounds[selectedRoundIndex]}
          roundIndex={selectedRoundIndex}
          players={gamePlayers}
          gameConfig={game.config}
          showMoney={showMoney}
          onClose={() => setSelectedRoundIndex(null)}
        />
      )}

      {game && showConfig && (
        <WinCountConfigModal
          config={configEdit}
          playerCount={gamePlayers.length}
          gameLabel={gameLabel}
          onChange={setConfigEdit}
          onSave={() => {
            putGame({ ...game, config: configEdit });
            setSession((prev) => (prev ? { ...prev, config: configEdit } : prev));
            setShowConfig(false);
          }}
          onClose={() => {
            setConfigEdit(game.config);
            setShowConfig(false);
          }}
        />
      )}

      {game && showResetConfirm && (
        <div className="score-modal-overlay" onClick={() => setShowResetConfirm(false)} role="dialog" aria-modal="true" aria-labelledby="wincount-reset-confirm-title">
          <div className="score-modal" onClick={(e) => e.stopPropagation()}>
            <h2 id="wincount-reset-confirm-title" className="score-modal-title">Reset scores in {gameLabel}?</h2>
            <p className="score-reset-hint">This clears every round in {gameLabel}. Players and config stay.</p>
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

      {game && roundToDelete !== null && (
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

      {canRemoveGame && showRemoveGameConfirm && (
        <RemoveGameConfirmModal
          session={session}
          gameIndex={gameIndex}
          gameLabel={gameLabel}
          onCancel={() => setShowRemoveGameConfirm(false)}
          onConfirm={confirmRemoveGame}
        />
      )}

      {showRosterModal && (
        <WinCountRosterModal
          title="New Game"
          players={session.players}
          defaultBet={session.config.betAmount}
          submitLabel="Start"
          onSubmit={handleNewGame}
          onCancel={() => setShowRosterModal(false)}
        />
      )}

      {showNewSessionConfirm && (
        <div
          className="score-modal-overlay"
          onClick={() => setShowNewSessionConfirm(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="wincount-new-session-title"
        >
          <div className="score-modal" onClick={(e) => e.stopPropagation()}>
            <h2 id="wincount-new-session-title" className="score-modal-title">
              Start a new session?
            </h2>
            <p className="score-reset-hint">
              This deletes all {session.games.length} game
              {session.games.length === 1 ? '' : 's'} and the totals. It cannot be undone.
            </p>
            <div className="score-modal-actions">
              <button
                type="button"
                className="score-btn score-btn-secondary"
                onClick={() => setShowNewSessionConfirm(false)}
              >
                Cancel
              </button>
              <button type="button" className="score-btn score-btn-primary" onClick={confirmNewSession}>
                New Session
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

interface RemoveGameConfirmModalProps {
  session: WinCountSession;
  gameIndex: number;
  gameLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Removing a game can also remove people. Rather than re-deriving that rule
 * here and risking it drifting from the real one, the warning diffs the roster
 * against the session `removeGame` would actually produce.
 */
const RemoveGameConfirmModal: React.FC<RemoveGameConfirmModalProps> = ({
  session,
  gameIndex,
  gameLabel,
  onCancel,
  onConfirm,
}) => {
  const after = removeGame(session, gameIndex);
  const dropped = session.players.filter((p) => !after.players.some((q) => q.id === p.id));
  const roundCount = session.games[gameIndex].rounds.length;
  const isLast = gameIndex === session.games.length - 1;

  return (
    <div
      className="score-modal-overlay"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-labelledby="wincount-remove-game-title"
    >
      <div className="score-modal" onClick={(e) => e.stopPropagation()}>
        <h2 id="wincount-remove-game-title" className="score-modal-title">
          Remove {gameLabel}?
        </h2>
        <p className="score-reset-hint">
          This deletes {gameLabel}&rsquo;s {roundCount} round{roundCount === 1 ? '' : 's'} and its
          money from the totals. It cannot be undone.
        </p>
        {dropped.length > 0 && (
          <p className="score-reset-hint">
            {dropped.map((p) => p.name).join(', ')} played only in {gameLabel} and will drop off the
            board.
          </p>
        )}
        {!isLast && (
          <p className="score-reset-hint">Later games are renumbered.</p>
        )}
        <div className="score-modal-actions">
          <button type="button" className="score-btn score-btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="score-btn score-btn-primary" onClick={onConfirm}>
            Remove
          </button>
        </div>
      </div>
    </div>
  );
};

interface WinCountRoundHistoryTableProps {
  game: WinCountGame;
  players: SessionPlayer[];
  showMoney: boolean;
  historyView: ScoreView;
  onHistoryViewChange: (v: ScoreView) => void;
  onRowClick: (index: number) => void;
  onEdit: (index: number) => void;
  onRemove: (index: number) => void;
}

const WinCountRoundHistoryTable: React.FC<WinCountRoundHistoryTableProps> = ({
  game,
  players,
  showMoney,
  historyView,
  onHistoryViewChange,
  onRowClick,
  onEdit,
  onRemove,
}) => {
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
  players: SessionPlayer[];
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
  gameLabel: string;
  onChange: (c: WinCountConfig) => void;
  onSave: () => void;
  onClose: () => void;
}

const WinCountConfigModal: React.FC<WinCountConfigModalProps> = ({
  config,
  playerCount,
  gameLabel,
  onChange,
  onSave,
  onClose,
}) => {
  const bet = config.betAmount ?? 0;
  const winnerTakes = bet * Math.max(0, playerCount - 1);

  return (
    <div className="score-modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="win-config-title">
      <div className="score-modal score-config-modal" onClick={(e) => e.stopPropagation()}>
        <h2 id="win-config-title" className="score-modal-title">Config — {gameLabel}</h2>
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
