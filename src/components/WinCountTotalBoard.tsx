import React from 'react';
import type { SessionPlayer } from '../lib/session';
import { formatMoneySigned } from '../lib/money';

interface WinCountTotalBoardProps {
  players: SessionPlayer[];
  scores: Record<string, number>;
  money: Record<string, number>;
  gamesPlayed: Record<string, number>;
  showMoney: boolean;
}

/**
 * Wins and money summed across every game of the session.
 *
 * The Games column is load-bearing, not decoration: without it a player who
 * joined at Game 3 looks like they are simply losing.
 */
const WinCountTotalBoard: React.FC<WinCountTotalBoardProps> = ({
  players,
  scores,
  money,
  gamesPlayed,
  showMoney,
}) => {
  const sorted = [...players].sort((a, b) => (scores[b.id] ?? 0) - (scores[a.id] ?? 0));

  return (
    <div className="scoreboard">
      <h3 className="scoreboard-title">Total</h3>
      <div className={`scoreboard-header wincount-total${showMoney ? ' has-money' : ''}`}>
        <span className="scoreboard-col-player">Player</span>
        <span className="scoreboard-col-score">Wins</span>
        {showMoney && <span className="scoreboard-col-money">Money</span>}
        <span className="scoreboard-col-games">Games</span>
      </div>
      <div className="scoreboard-body">
        <table className={`scoreboard-table wincount-total${showMoney ? ' has-money' : ''}`}>
          <colgroup>
            <col />
            <col />
            {showMoney && <col />}
            <col />
          </colgroup>
          <tbody>
            {sorted.map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td className="scoreboard-value">{scores[p.id] ?? 0}</td>
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

export default WinCountTotalBoard;
