import React, { useState } from 'react';
import type { SessionPlayer } from '../lib/session';
import { formatMoneySigned } from '../lib/money';

interface WinCountTotalBoardProps {
  players: SessionPlayer[];
  scores: Record<string, number>;
  /** Already includes each player's adjustment — this is what they settle. */
  money: Record<string, number>;
  adjustments: Record<string, number>;
  gamesPlayed: Record<string, number>;
  showMoney: boolean;
  onAdjustmentChange: (playerId: string, amount: number) => void;
}

/**
 * Wins and money summed across every game of the session.
 *
 * The Games column is load-bearing, not decoration: without it a player who
 * joined at Game 3 looks like they are simply losing.
 *
 * The Adjust column is the one editable thing on this board. It moves money
 * only — a correction typed here never becomes a win, a round, or anything the
 * per-game boards can see.
 */
const WinCountTotalBoard: React.FC<WinCountTotalBoardProps> = ({
  players,
  scores,
  money,
  adjustments,
  gamesPlayed,
  showMoney,
  onAdjustmentChange,
}) => {
  const sorted = [...players].sort((a, b) => (scores[b.id] ?? 0) - (scores[a.id] ?? 0));
  const cls = `wincount-total${showMoney ? ' has-money' : ''}`;

  return (
    <div className="scoreboard">
      <h3 className="scoreboard-title">Total</h3>
      <div className={`scoreboard-header ${cls}`}>
        <span className="scoreboard-col-player">Player</span>
        <span className="scoreboard-col-score">Wins</span>
        {showMoney && <span className="scoreboard-col-adjust">Adjust</span>}
        {showMoney && <span className="scoreboard-col-money">Money</span>}
        <span className="scoreboard-col-games">Games</span>
      </div>
      <div className="scoreboard-body">
        <table className={`scoreboard-table ${cls}`}>
          <colgroup>
            <col />
            <col />
            {showMoney && <col />}
            {showMoney && <col />}
            <col />
          </colgroup>
          <tbody>
            {sorted.map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td className="scoreboard-value">{scores[p.id] ?? 0}</td>
                {showMoney && (
                  <td className="scoreboard-adjust">
                    <AdjustInput
                      playerName={p.name}
                      value={adjustments[p.id] ?? 0}
                      onCommit={(amount) => onAdjustmentChange(p.id, amount)}
                    />
                  </td>
                )}
                {showMoney && (
                  <td className="scoreboard-value scoreboard-money">
                    {formatMoneySigned(money[p.id] ?? 0)}
                  </td>
                )}
                <td className="scoreboard-games">{gamesPlayed[p.id] ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

interface AdjustInputProps {
  playerName: string;
  value: number;
  onCommit: (amount: number) => void;
}

/**
 * While the field has focus the typed text wins, so a half-finished entry like
 * "-" or "-2" survives long enough to be finished. Only a parseable number is
 * committed upward; on blur the draft is dropped and the stored value shows.
 */
const AdjustInput: React.FC<AdjustInputProps> = ({ playerName, value, onCommit }) => {
  const [draft, setDraft] = useState<string | null>(null);

  return (
    <input
      type="number"
      step={1000}
      className="score-input scoreboard-adjust-input"
      placeholder="0"
      aria-label={`Money adjustment for ${playerName}`}
      value={draft ?? (value === 0 ? '' : String(value))}
      onChange={(e) => {
        const raw = e.target.value;
        setDraft(raw);
        if (raw.trim() === '') onCommit(0);
        else if (Number.isFinite(Number(raw))) onCommit(Number(raw));
      }}
      onBlur={() => setDraft(null)}
    />
  );
};

export default WinCountTotalBoard;
