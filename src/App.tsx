import React, { useEffect, useState } from 'react';
import Game from './components/Game';
import PokerGame from './components/PokerGame';

type GameMode = 'roulette' | 'poker';

const App: React.FC = () => {
  const [currentMode, setCurrentMode] = useState<GameMode>('roulette');

  useEffect(() => {
    document.body.classList.add('has-mode-tabs');
    return () => document.body.classList.remove('has-mode-tabs');
  }, []);

  return (
    <>
      <nav className="mode-tabs" aria-label="Game mode">
        <button
          type="button"
          className={`mode-tab ${currentMode === 'roulette' ? 'active' : ''}`}
          onClick={() => setCurrentMode('roulette')}
        >
          Russian Roulette
        </button>
        <button
          type="button"
          className={`mode-tab ${currentMode === 'poker' ? 'active' : ''}`}
          onClick={() => setCurrentMode('poker')}
        >
          Poker Mode
        </button>
      </nav>
      {currentMode === 'roulette' ? <Game /> : <PokerGame />}
    </>
  );
};

export default App;
