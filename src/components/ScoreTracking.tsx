import React, { useState } from 'react';
import TienLenScore from './TienLenScore';
import HostScore from './HostScore';
import WinCountScore from './WinCountScore';

type ScoreSubMode = 'tienlen' | 'host' | 'wincount';

const ScoreTracking: React.FC = () => {
  const [subMode, setSubMode] = useState<ScoreSubMode>('tienlen');

  return (
    <div className="score-tracking">
      <nav className="score-sub-tabs" aria-label="Card game type">
        <button
          type="button"
          className={`score-sub-tab ${subMode === 'tienlen' ? 'active' : ''}`}
          onClick={() => setSubMode('tienlen')}
          aria-current={subMode === 'tienlen' ? 'true' : undefined}
        >
          Vietnamese 13
        </button>
        <button
          type="button"
          className={`score-sub-tab ${subMode === 'host' ? 'active' : ''}`}
          onClick={() => setSubMode('host')}
          aria-current={subMode === 'host' ? 'true' : undefined}
        >
          Host
        </button>
        <button
          type="button"
          className={`score-sub-tab ${subMode === 'wincount' ? 'active' : ''}`}
          onClick={() => setSubMode('wincount')}
          aria-current={subMode === 'wincount' ? 'true' : undefined}
        >
          Win Count
        </button>
      </nav>
      <div className="score-content">
        {subMode === 'tienlen' && <TienLenScore />}
        {subMode === 'host' && <HostScore />}
        {subMode === 'wincount' && <WinCountScore />}
      </div>
    </div>
  );
};

export default ScoreTracking;
