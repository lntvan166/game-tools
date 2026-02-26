import React, { useEffect, useRef, useState } from 'react';
import '../styles/site.css';

const totalChambers = 6;
const cardOptions = ['A', 'K', 'Q'];
const DECK_HINT_KEY = 'liarbar-deck-hint-dismissed';

interface GameProps {
  muted: boolean;
}

type CardPhase = 'idle' | 'shuffling' | 'flipping' | 'revealed';

const Game: React.FC<GameProps> = ({ muted }) => {
  const [card, setCard] = useState<string>('A');
  const [phase, setPhase] = useState<CardPhase>('idle');
  const [shuffleValue, setShuffleValue] = useState<string>('?');
  const shuffleInterval = useRef<number | undefined>(undefined);
  const [isFlipping, setIsFlipping] = useState<boolean>(false);
  const [shotsTaken, setShotsTaken] = useState<number>(0);
  const [isGameOver, setIsGameOver] = useState<boolean>(false);
  const bulletPositionRef = useRef<number>(Math.floor(Math.random() * totalChambers));
  const [isSpinning, setIsSpinning] = useState<boolean>(false);
  const [isButtonDisabled, setIsButtonDisabled] = useState<boolean>(false);
  const [splatters, setSplatters] = useState<{ id: number; src: string; style: React.CSSProperties }[]>([]);
  const [hintDismissed, setHintDismissed] = useState<boolean>(() => localStorage.getItem(DECK_HINT_KEY) === '1');

  const cylinderRef = useRef<HTMLDivElement>(null);
  const damageOverlayRef = useRef<HTMLDivElement>(null);
  const bloodContainerRef = useRef<HTMLDivElement>(null);

  const clickSoundRef = useRef<HTMLAudioElement>(null);
  const chimeSoundRef = useRef<HTMLAudioElement>(null);
  const gunshotSoundRef = useRef<HTMLAudioElement>(null);
  const emptyClickSoundRef = useRef<HTMLAudioElement>(null);
  const spinSoundRef = useRef<HTMLAudioElement>(null);

  const remaining = totalChambers - shotsTaken;
  const deathChancePct = remaining > 0 ? (100 / remaining).toFixed(2) : '100';
  const chamberOrder = [0, 5, 1, 4, 2, 3];

  useEffect(() => {
    if (isGameOver) {
      document.body.classList.add('shake-on-death');
      const t = setTimeout(() => document.body.classList.remove('shake-on-death'), 500);
      return () => clearTimeout(t);
    }
  }, [isGameOver]);

  useEffect(() => {
    const overlay = damageOverlayRef.current;
    if (!overlay) return;
    if (isGameOver) {
      overlay.style.display = 'block';
      overlay.classList.remove('beating');
    } else if (remaining === 1) {
      overlay.style.display = 'block';
      overlay.classList.add('beating');
    } else {
      overlay.style.display = 'none';
      overlay.classList.remove('beating');
    }
  }, [isGameOver, remaining]);

  const clearSplatters = () => setSplatters([]);

  const generateSplatters = () => {
    const count = 8 + Math.floor(Math.random() * 2);
    const images = ['splatt1.svg', 'splatt2.svg', 'splatt3.svg'];
    const newSplatters = Array.from({ length: count }, (_, i) => {
      const size = 80 + Math.floor(Math.random() * 120);
      const left = Math.random() * 100;
      const top = Math.random() * 100;
      const rotate = Math.random() * 360;
      const opacity = 0.5 + Math.random() * 0.3;
      const src = images[Math.floor(Math.random() * images.length)];
      return {
        id: i,
        src,
        style: {
          position: 'fixed',
          left: `${left}%`,
          top: `${top}%`,
          width: `${size}px`,
          height: `${size}px`,
          transform: `translate(-50%, -50%) rotate(${rotate}deg)`,
          opacity,
          pointerEvents: 'none',
          filter: 'brightness(0.8)',
        } as React.CSSProperties,
      };
    });
    setSplatters(newSplatters);
  };

  const resetGame = () => {
    setShotsTaken(0);
    setIsGameOver(false);
    setPhase('idle');
    setCard('A');
    bulletPositionRef.current = Math.floor(Math.random() * totalChambers);
    if (bloodContainerRef.current) bloodContainerRef.current.style.display = 'none';
    clearSplatters();
  };

  const play = (ref: React.RefObject<HTMLAudioElement | null>) => {
    if (muted || !ref.current) return;
    ref.current.pause();
    ref.current.currentTime = 0;
    ref.current.play();
  };

  const handleCardClick = () => {
    if (isFlipping) return;
    setIsFlipping(true);
    const options = [...cardOptions];
    setPhase('shuffling');
    setShuffleValue(options[Math.floor(Math.random() * options.length)]);
    shuffleInterval.current = window.setInterval(() => {
      setShuffleValue((_) => options[Math.floor(Math.random() * options.length)]);
    }, 100);
    play(clickSoundRef);
    const flipDuration = 800;
    setTimeout(() => {
      clearInterval(shuffleInterval.current);
      const val = options[Math.floor(Math.random() * options.length)];
      setCard(val);
      setShuffleValue('?');
      setPhase('flipping');
      play(chimeSoundRef);
      setTimeout(() => {
        const utterance = new SpeechSynthesisUtterance(
          val === 'Q' ? 'Queen' : val === 'K' ? 'King' : 'Ace'
        );
        utterance.lang = 'en-US';
        utterance.rate = 0.5;
        if (!muted) window.speechSynthesis.speak(utterance);
      }, 300);
      setTimeout(() => {
        setPhase('revealed');
        setIsFlipping(false);
      }, flipDuration);
    }, 1200);
  };

  const handleFire = () => {
    if (isButtonDisabled) return;
    if (isGameOver) {
      resetGame();
      return;
    }
    play(spinSoundRef);
    setIsSpinning(true);
    setIsButtonDisabled(true);
    setTimeout(() => {
      setIsSpinning(false);
      const currentShots = shotsTaken;
      setShotsTaken(currentShots + 1);
      if (bulletPositionRef.current === currentShots) {
        play(gunshotSoundRef);
        setIsGameOver(true);
        if (bloodContainerRef.current) bloodContainerRef.current.style.display = 'block';
        generateSplatters();
      } else {
        play(emptyClickSoundRef);
      }
      setIsButtonDisabled(false);
    }, 3000);
  };

  const dismissHint = () => {
    setHintDismissed(true);
    localStorage.setItem(DECK_HINT_KEY, '1');
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== ' ' || e.repeat) return;
      const target = document.activeElement as HTMLElement | null;
      if (target?.closest('button') || target?.getAttribute('role') === 'button') return;
      if (isButtonDisabled) return;
      e.preventDefault();
      handleFire();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isButtonDisabled, handleFire]);

  return (
    <>
      <div className="container">
        {!hintDismissed && (
          <div className="deck-hint" role="status">
            <span>Pick a card, then FIRE.</span>
            <button type="button" onClick={dismissHint} aria-label="Dismiss hint">
              OK
            </button>
          </div>
        )}
        <div className="card-container card-container--3d">
          <div
            className={`card ${phase === 'revealed' ? 'selected' : ''}`}
            onClick={handleCardClick}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleCardClick(); } }}
            aria-label={phase === 'revealed' ? 'Pick another card' : 'Pick a card'}
            aria-disabled={isFlipping}
          >
            <div className={`card-inner ${phase === 'flipping' || phase === 'revealed' ? 'card-inner--flipped' : ''}`}>
              <div className="card-face card-face--front">
                {phase === 'shuffling' ? shuffleValue : '?'}
              </div>
              <div className="card-face card-face--back">{card}</div>
            </div>
          </div>
        </div>
        <div className="divider" />
        <div className="deck-gun-block">
          <div className="cylinder-wrap">
            <div className="cylinder-container">
              <div className={`cylinder ${isSpinning ? 'spin' : ''}`} ref={cylinderRef}>
                {chamberOrder.map((i, index) => (
                  <div key={i} className={`chamber ${index < shotsTaken ? 'shot' : ''}`} />
                ))}
                <div className="outer-ring" />
                {['one', 'two', 'three', 'four', 'five', 'six'].map((slot, idx) => (
                  <div key={idx} className={`revolver-slot slot-${slot}`} aria-hidden />
                ))}
              </div>
            </div>
          </div>
          <div className="shot-info deck-shot-info">
            <div className="shot-count">
              <img src="/assets/img/revolver.png" alt="" aria-hidden />
              <span>{shotsTaken}/{totalChambers}</span>
            </div>
            <div className="death-chance" aria-live="polite" aria-atomic="true">
              <img src="/assets/img/skull.png" alt="" aria-hidden />
              <span>{deathChancePct}%</span>
            </div>
          </div>
        </div>
        <div className="deck-actions">
          <button
            type="button"
            disabled={isButtonDisabled}
            onClick={handleFire}
            aria-label={isGameOver ? 'Reset game' : 'Fire'}
            title={isGameOver ? 'Reset game' : 'Fire (Space)'}
          >
            <span>{isGameOver ? 'RESET' : 'FIRE'}</span>
          </button>
        </div>
      </div>
      {isGameOver && (
        <div className="deck-result-overlay" role="status">
          You died
        </div>
      )}
      <audio ref={clickSoundRef} src="/assets/mp3/click.mp3" preload="auto" />
      <audio ref={chimeSoundRef} src="/assets/mp3/chime.mp3" preload="auto" />
      <audio ref={gunshotSoundRef} src="/assets/mp3/gunshot.mp3" preload="auto" />
      <audio ref={emptyClickSoundRef} src="/assets/mp3/empty-gunshot.mp3" preload="auto" />
      <audio ref={spinSoundRef} src="/assets/mp3/revolver-spin.mp3" preload="auto" />
      <div className="damage-warning" ref={damageOverlayRef} aria-hidden />
      <div id="blood-splatter-container" ref={bloodContainerRef} style={{ display: 'none' }} aria-hidden>
        {splatters.map((s) => (
          <img key={s.id} src={`/assets/img/${s.src}`} style={s.style} alt="" aria-hidden />
        ))}
      </div>
    </>
  );
};

export default Game;
