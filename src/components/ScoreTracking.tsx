import React, { useState } from 'react';
import TienLenScore from './TienLenScore';

type ScoreSubMode = 'tienlen';

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
      </nav>
      <div className="score-content">
        {subMode === 'tienlen' && <TienLenScore />}
      </div>
    </div>
  );
};

export default ScoreTracking;
