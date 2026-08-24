import React from 'react';

export type ScoreView = 'points' | 'money';

interface ScoreViewToggleProps {
  view: ScoreView;
  onChange: (view: ScoreView) => void;
}

const ScoreViewToggle: React.FC<ScoreViewToggleProps> = ({ view, onChange }) => {
  return (
    <div className="score-view-toggle" role="group" aria-label="History view">
      <button
        type="button"
        className={`score-view-toggle-btn ${view === 'points' ? 'active' : ''}`}
        onClick={() => onChange('points')}
        aria-pressed={view === 'points'}
      >
        Points
      </button>
      <button
        type="button"
        className={`score-view-toggle-btn ${view === 'money' ? 'active' : ''}`}
        onClick={() => onChange('money')}
        aria-pressed={view === 'money'}
      >
        Money
      </button>
    </div>
  );
};

export default ScoreViewToggle;
