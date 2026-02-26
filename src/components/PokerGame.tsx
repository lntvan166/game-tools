import React, { useCallback, useEffect, useRef, useState } from 'react';
import '../styles/site.css';

const TOTAL_CHAMBERS = 8;
const COMMUNITY_CARDS = 5;

type ShotResult = 'none' | 'alive' | 'god_save' | 'dead';

function getStageLabel(bullets: number): string {
  if (bullets === 0) return 'Idle';
  if (bullets === 1) return 'Pre-flop';
  if (bullets === 2) return 'Flop';
  if (bullets === 3) return 'Turn';
  if (bullets === 4) return 'River';
  if (bullets === 5) return 'Showdown';
  if (bullets === 8) return 'All-in showdown';
  return 'Idle';
}

/** Number of community cards revealed (open) for current bullets. */
function getOpenCardsCount(bullets: number): number {
  if (bullets <= 1) return 0;
  if (bullets === 2) return 3;
  if (bullets === 3) return 4;
  return 5; // 4, 5, 8
}

const SPLATTER_IMAGES = ['splatt1.svg', 'splatt2.svg', 'splatt3.svg'];

function generateSplatters(): { id: number; src: string; style: React.CSSProperties }[] {
  const count = 6 + Math.floor(Math.random() * 3);
  return Array.from({ length: count }, (_, i) => {
    const size = 60 + Math.floor(Math.random() * 100);
    return {
      id: i,
      src: SPLATTER_IMAGES[Math.floor(Math.random() * SPLATTER_IMAGES.length)],
      style: {
        position: 'fixed',
        left: `${Math.random() * 100}%`,
        top: `${Math.random() * 100}%`,
        width: `${size}px`,
        height: `${size}px`,
        transform: `translate(-50%, -50%) rotate(${Math.random() * 360}deg)`,
        opacity: 0.4 + Math.random() * 0.3,
        pointerEvents: 'none',
        filter: 'brightness(0.8)',
      } as React.CSSProperties,
    };
  });
}

const POKER_HINT_KEY = 'liarbar-poker-hint-dismissed';

interface PokerGameProps {
  muted: boolean;
}

const PokerGame: React.FC<PokerGameProps> = ({ muted }) => {
  const [bulletsCommitted, setBulletsCommitted] = useState(0);
  const [shotResult, setShotResult] = useState<ShotResult>('none');
  const [isResolvingShot, setIsResolvingShot] = useState(false);
  const [isButtonDisabled, setIsButtonDisabled] = useState(false);
  const [splatters, setSplatters] = useState<{ id: number; src: string; style: React.CSSProperties }[]>([]);
  const [hintDismissed, setHintDismissed] = useState<boolean>(() => localStorage.getItem(POKER_HINT_KEY) === '1');
  const spinSoundRef = useRef<HTMLAudioElement>(null);
  const gunshotSoundRef = useRef<HTMLAudioElement>(null);
  const emptyClickSoundRef = useRef<HTMLAudioElement>(null);
  const damageOverlayRef = useRef<HTMLDivElement>(null);
  const bloodContainerRef = useRef<HTMLDivElement>(null);
  const resetBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (shotResult !== 'none' && resetBtnRef.current) resetBtnRef.current.focus();
  }, [shotResult]);

  useEffect(() => {
    if (shotResult === 'dead') {
      document.body.classList.add('shake-on-death');
      const t = setTimeout(() => document.body.classList.remove('shake-on-death'), 500);
      return () => clearTimeout(t);
    }
  }, [shotResult]);

  useEffect(() => {
    const overlay = damageOverlayRef.current;
    if (!overlay) return;
    if (shotResult === 'dead') {
      overlay.style.display = 'block';
      overlay.classList.remove('beating');
    } else if (bulletsCommitted === 8 && shotResult === 'none') {
      overlay.style.display = 'block';
      overlay.classList.add('beating');
    } else {
      overlay.style.display = 'none';
      overlay.classList.remove('beating');
    }
  }, [bulletsCommitted, shotResult]);

  const play = (ref: React.RefObject<HTMLAudioElement | null>) => {
    if (muted || !ref.current) return;
    ref.current.pause();
    ref.current.currentTime = 0;
    ref.current.play();
  };

  const openCards = getOpenCardsCount(bulletsCommitted);
  const deathChancePct = bulletsCommitted > 0
    ? (bulletsCommitted === 8 ? '95' : ((bulletsCommitted / TOTAL_CHAMBERS) * 100).toFixed(0))
    : '0';
  const canCall = bulletsCommitted >= 0 && bulletsCommitted <= 4;
  const canFold = bulletsCommitted > 0;
  const canAllIn = bulletsCommitted < 8;

  const resolveShot = useCallback((n: number) => {
    if (n <= 0) return;
    setIsResolvingShot(true);
    setIsButtonDisabled(true);
    play(spinSoundRef);
    const spinDuration = 2500;
    setTimeout(() => {
      const chambers = Array.from({ length: TOTAL_CHAMBERS }, (_, i) => i);
      const bulletIndices = new Set<number>();
      while (bulletIndices.size < Math.min(n, TOTAL_CHAMBERS)) {
        bulletIndices.add(chambers[Math.floor(Math.random() * chambers.length)]);
      }
      const shotIndex = Math.floor(Math.random() * TOTAL_CHAMBERS);
      const jammed = n === 8 && Math.random() < 0.05;
      const isDead = jammed ? false : bulletIndices.has(shotIndex);
      setShotResult(isDead ? 'dead' : (n === 8 && jammed ? 'god_save' : 'alive'));
      if (isDead) {
        play(gunshotSoundRef);
        setSplatters(generateSplatters());
        if (bloodContainerRef.current) bloodContainerRef.current.style.display = 'block';
        if (damageOverlayRef.current) {
          damageOverlayRef.current.style.display = 'block';
          damageOverlayRef.current.classList.remove('beating');
        }
      } else {
        play(emptyClickSoundRef);
      }
      setIsResolvingShot(false);
    }, spinDuration);
  }, [muted]);

  const onCall = () => {
    if (!canCall || isButtonDisabled) return;
    if (bulletsCommitted === 0) {
      setBulletsCommitted(1);
    } else if (bulletsCommitted <= 4) {
      setBulletsCommitted(bulletsCommitted + 1);
    }
  };

  const onFold = () => {
    if (!canFold || isButtonDisabled) return;
    resolveShot(bulletsCommitted);
  };

  const onAllIn = () => {
    if (!canAllIn || isButtonDisabled) return;
    setBulletsCommitted(8);
  };

  const onReset = () => {
    if (isButtonDisabled && shotResult === 'none') return;
    setBulletsCommitted(0);
    setShotResult('none');
    setSplatters([]);
    setIsButtonDisabled(false);
    if (bloodContainerRef.current) bloodContainerRef.current.style.display = 'none';
    if (damageOverlayRef.current) damageOverlayRef.current.style.display = 'none';
  };

  const dismissHint = () => {
    setHintDismissed(true);
    localStorage.setItem(POKER_HINT_KEY, '1');
  };

  const chamberOrder = [0, 1, 2, 3, 4, 5, 6, 7];

  const callTitle = !canCall && isButtonDisabled ? 'Wait for shot' : !canCall ? 'Max 4 bullets to Call' : undefined;
  const foldTitle = !canFold && isButtonDisabled ? 'Wait for shot' : !canFold ? 'Need at least 1 bullet to Fold' : undefined;
  const allInTitle = !canAllIn && isButtonDisabled ? 'Wait for shot' : !canAllIn && bulletsCommitted === 8 ? 'Already all-in' : undefined;
  const resetTitle = isButtonDisabled && shotResult === 'none' ? 'No hand to reset' : undefined;

  return (
    <>
      <div className="poker-container">
        {!hintDismissed && (
          <div className="poker-hint" role="status">
            <span>Call = add bullet, Fold = shoot.</span>
            <button type="button" onClick={dismissHint} aria-label="Dismiss hint">
              OK
            </button>
          </div>
        )}
        <div className="poker-stage-label">{getStageLabel(bulletsCommitted)}</div>

        <div className="poker-board-cards">
          {Array.from({ length: COMMUNITY_CARDS }, (_, i) => {
            const isOpen = i < openCards;
            return (
              <div
                key={i}
                className={`poker-card-slot poker-card-slot--${isOpen ? 'open' : 'closed'}`}
                title={isOpen ? 'Open' : 'Closed'}
              >
                <div className={`poker-card-slot-inner ${isOpen ? 'poker-card-slot-inner--flipped' : ''}`}>
                  <div className="poker-card-slot-face poker-card-slot-face--back">
                    <img src="/assets/img/card-closed.png" alt="" className="poker-card-img" aria-hidden />
                  </div>
                  <div className="poker-card-slot-face poker-card-slot-face--front">
                    <img src="/assets/img/card-open.png" alt="" className="poker-card-img" aria-hidden />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="poker-bullet-track">
          <span className="poker-bullets-label">Bullets: {bulletsCommitted}/{TOTAL_CHAMBERS}</span>
          <div className="poker-bullet-dots">
            {Array.from({ length: TOTAL_CHAMBERS }, (_, i) => (
              <img
                key={i}
                src={i < bulletsCommitted ? '/assets/img/bullet-token.png' : '/assets/img/bullet-token-empty.png'}
                alt=""
                className={`poker-bullet-icon ${i < bulletsCommitted ? 'committed' : ''} ${i === bulletsCommitted - 1 && bulletsCommitted > 0 && !isResolvingShot ? 'poker-bullet-icon--next' : ''}`}
                aria-hidden
              />
            ))}
          </div>
        </div>

        <div className={`poker-cylinder-wrap ${bulletsCommitted > 0 && !isResolvingShot ? 'poker-cylinder-wrap--ready' : ''}`}>
          <div className={`poker-cylinder-8 ${isResolvingShot ? 'poker-cylinder-spin' : ''}`}>
            {chamberOrder.map((i, index) => (
              <div
                key={i}
                className={`poker-chamber ${index < bulletsCommitted ? 'poker-chamber--loaded' : ''}`}
                id={`poker-chamber${i}`}
              />
            ))}
            <div className="poker-cylinder-center" />
          </div>
        </div>

        <div className="poker-shot-info" aria-live="polite" aria-atomic="true">
          <div className="death-chance">
            <img src="/assets/img/skull.png" alt="" aria-hidden />
            <span>{deathChancePct}%</span>
          </div>
        </div>

        <div className="poker-actions">
          <button
            type="button"
            className="poker-btn poker-btn-call"
            disabled={!canCall || isButtonDisabled}
            onClick={onCall}
            title={callTitle}
            aria-label={callTitle || 'Call – add one bullet'}
          >
            <span>Call</span>
          </button>
          <button
            type="button"
            className="poker-btn poker-btn-fold"
            disabled={!canFold || isButtonDisabled}
            onClick={onFold}
            title={foldTitle || (bulletsCommitted >= 5 ? 'Fire – shoot' : undefined)}
            aria-label={foldTitle || (bulletsCommitted >= 5 ? 'Fire – shoot' : 'Fold – shoot')}
          >
            <span>{bulletsCommitted >= 5 ? 'Fire' : 'Fold'}</span>
          </button>
          <button
            type="button"
            className="poker-btn poker-btn-allin"
            disabled={!canAllIn || isButtonDisabled}
            onClick={onAllIn}
            title={allInTitle}
            aria-label={allInTitle || 'All-in – 8 bullets'}
          >
            <span>All-in</span>
          </button>
        </div>
        <button
          type="button"
          className={`poker-btn-reset ${shotResult !== 'none' ? 'poker-btn-reset--prominent' : ''}`}
          onClick={onReset}
          disabled={isButtonDisabled && shotResult === 'none'}
          title={resetTitle}
          aria-label={resetTitle || 'Reset hand'}
          ref={resetBtnRef}
        >
          <span>Reset hand</span>
        </button>
      </div>

      <audio ref={spinSoundRef} src="/assets/mp3/revolver-spin.mp3" preload="auto" />
      <audio ref={gunshotSoundRef} src="/assets/mp3/gunshot.mp3" preload="auto" />
      <audio ref={emptyClickSoundRef} src="/assets/mp3/empty-gunshot.mp3" preload="auto" />
      <div className="damage-warning" ref={damageOverlayRef} style={{ display: 'none' }} aria-hidden />
      {shotResult !== 'none' && (
        <div className={`poker-result-overlay poker-result-overlay--${shotResult === 'god_save' ? 'alive' : shotResult}`} role="status" aria-live="polite">
          {shotResult === 'god_save' ? 'GOD SAVE' : shotResult === 'alive' ? 'You survived' : 'You died'}
        </div>
      )}
      <div id="poker-blood-container" ref={bloodContainerRef} style={{ display: 'none' }} aria-hidden>
        {splatters.map((s) => (
          <img key={s.id} src={`/assets/img/${s.src}`} style={s.style} alt="" aria-hidden />
        ))}
      </div>
    </>
  );
};

export default PokerGame;
