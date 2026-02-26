import React, { useEffect, useState } from 'react';
import Game from './components/Game';
import PokerGame from './components/PokerGame';

type GameMode = 'roulette' | 'poker';

const MUTE_KEY = 'liarbar-muted';

const App: React.FC = () => {
  const [currentMode, setCurrentMode] = useState<GameMode>('roulette');
  const [muted, setMuted] = useState<boolean>(() => localStorage.getItem(MUTE_KEY) === '1');

  useEffect(() => {
    document.body.classList.add('has-mode-tabs');
    return () => document.body.classList.remove('has-mode-tabs');
  }, []);

  useEffect(() => {
    document.title = currentMode === 'roulette' ? "Liar's Bar – Deck" : "Liar's Bar – Poker";
  }, [currentMode]);

  useEffect(() => {
    localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
  }, [muted]);

  return (
    <>
      <nav className="mode-tabs" aria-label="Game mode">
        <button
          type="button"
          className={`mode-tab ${currentMode === 'roulette' ? 'active' : ''}`}
          onClick={() => setCurrentMode('roulette')}
          aria-current={currentMode === 'roulette' ? 'true' : undefined}
        >
          Deck Mode
        </button>
        <button
          type="button"
          className={`mode-tab ${currentMode === 'poker' ? 'active' : ''}`}
          onClick={() => setCurrentMode('poker')}
          aria-current={currentMode === 'poker' ? 'true' : undefined}
        >
          Poker Mode
        </button>
      </nav>
      <button
        type="button"
        className={`deck-mute-btn ${muted ? 'muted' : ''}`}
        onClick={() => setMuted((m) => !m)}
        aria-label={muted ? 'Unmute sound' : 'Mute sound'}
        title={muted ? 'Unmute' : 'Mute'}
      >
        {muted ? '\u{1F507}' : '\u{1F50A}'}
      </button>
      <div className="mode-content">
        <div key={currentMode} className="mode-content-inner">
          {currentMode === 'roulette' ? <Game muted={muted} /> : <PokerGame muted={muted} />}
        </div>
      </div>
      <footer className="app-credit" role="contentinfo">
        Developed by irok
      </footer>
    </>
  );
};

export default App;
