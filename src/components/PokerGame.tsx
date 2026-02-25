import React, { useCallback, useRef, useState } from 'react';
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

const PokerGame: React.FC = () => {
  const [bulletsCommitted, setBulletsCommitted] = useState(0);
  const [shotResult, setShotResult] = useState<ShotResult>('none');
  const [isResolvingShot, setIsResolvingShot] = useState(false);
  const [isButtonDisabled, setIsButtonDisabled] = useState(false);
  const [splatters, setSplatters] = useState<{ id: number; src: string; style: React.CSSProperties }[]>([]);

  const spinSoundRef = useRef<HTMLAudioElement>(null);
  const gunshotSoundRef = useRef<HTMLAudioElement>(null);
  const emptyClickSoundRef = useRef<HTMLAudioElement>(null);
  const damageOverlayRef = useRef<HTMLDivElement>(null);
  const bloodContainerRef = useRef<HTMLDivElement>(null);

  const openCards = getOpenCardsCount(bulletsCommitted);
  const deathChancePct = bulletsCommitted > 0
    ? (bulletsCommitted === 8 ? '99' : ((bulletsCommitted / TOTAL_CHAMBERS) * 100).toFixed(0))
    : '0';
  const canCall = bulletsCommitted >= 0 && bulletsCommitted <= 4;
  const canFold = bulletsCommitted > 0;
  const canAllIn = bulletsCommitted < 8;

  const resolveShot = useCallback((n: number) => {
    if (n <= 0) return;
    setIsResolvingShot(true);
    setIsButtonDisabled(true);
    if (spinSoundRef.current) {
      spinSoundRef.current.pause();
      spinSoundRef.current.currentTime = 0;
      spinSoundRef.current.play();
    }
    const spinDuration = 2500;
    setTimeout(() => {
      const chambers = Array.from({ length: TOTAL_CHAMBERS }, (_, i) => i);
      const bulletIndices = new Set<number>();
      while (bulletIndices.size < Math.min(n, TOTAL_CHAMBERS)) {
        bulletIndices.add(chambers[Math.floor(Math.random() * chambers.length)]);
      }
      const shotIndex = Math.floor(Math.random() * TOTAL_CHAMBERS);
      const jammed = n === 8 && Math.random() < 0.01;
      const isDead = jammed ? false : bulletIndices.has(shotIndex);
      setShotResult(isDead ? 'dead' : (n === 8 && jammed ? 'god_save' : 'alive'));
      if (isDead) {
        if (gunshotSoundRef.current) {
          gunshotSoundRef.current.pause();
          gunshotSoundRef.current.currentTime = 0;
          gunshotSoundRef.current.play();
        }
        setSplatters(generateSplatters());
        if (bloodContainerRef.current) bloodContainerRef.current.style.display = 'block';
        if (damageOverlayRef.current) {
          damageOverlayRef.current.style.display = 'block';
          damageOverlayRef.current.classList.remove('beating');
        }
      } else if (emptyClickSoundRef.current) {
        emptyClickSoundRef.current.pause();
        emptyClickSoundRef.current.currentTime = 0;
        emptyClickSoundRef.current.play();
      }
      setIsResolvingShot(false);
      // Giữ overlay sống/chết + animation chết + trạng thái round đến khi user bấm Reset (không auto ẩn)
    }, spinDuration);
  }, []);

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

  const chamberOrder = [0, 7, 1, 6, 2, 5, 3, 4];

  return (
    <>
      <div className="poker-container">
        <h1 className="poker-title">Liar&apos;s Bar Poker Mode</h1>

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
                <img
                  src={isOpen ? '/assets/img/card-open.png' : '/assets/img/card-closed.png'}
                  alt={isOpen ? 'Open card' : 'Closed card'}
                  className="poker-card-img"
                />
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
                className={`poker-bullet-icon ${i < bulletsCommitted ? 'committed' : ''}`}
                aria-hidden
              />
            ))}
          </div>
        </div>

        <div className="poker-cylinder-wrap">
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

        <div className="poker-shot-info">
          <span>Death chance: {deathChancePct}%</span>
          {shotResult !== 'none' && (
            <span className={`poker-last-shot poker-last-shot--${shotResult === 'god_save' ? 'alive' : shotResult}`}>
              {shotResult === 'god_save' ? 'GOD SAVE' : shotResult === 'alive' ? 'You survived' : 'You died'}
            </span>
          )}
        </div>

        <div className="poker-actions">
          <button
            type="button"
            className="poker-btn poker-btn-call"
            disabled={!canCall || isButtonDisabled}
            onClick={onCall}
          >
            Call
          </button>
          <button
            type="button"
            className="poker-btn poker-btn-fold"
            disabled={!canFold || isButtonDisabled}
            onClick={onFold}
          >
            Fold
          </button>
          <button
            type="button"
            className="poker-btn poker-btn-allin"
            disabled={!canAllIn || isButtonDisabled}
            onClick={onAllIn}
          >
            All-in
          </button>
        </div>
        <button
          type="button"
          className="poker-btn-reset"
          onClick={onReset}
          disabled={isButtonDisabled && shotResult === 'none'}
        >
          Reset hand
        </button>
      </div>

      <audio ref={spinSoundRef} src="/assets/mp3/revolver-spin.mp3" preload="auto" />
      <audio ref={gunshotSoundRef} src="/assets/mp3/gunshot.mp3" preload="auto" />
      <audio ref={emptyClickSoundRef} src="/assets/mp3/empty-gunshot.mp3" preload="auto" />
      <div className="damage-warning" ref={damageOverlayRef} style={{ display: 'none' }} aria-hidden />
      {shotResult !== 'none' && (
        <div className={`poker-result-overlay poker-result-overlay--${shotResult === 'god_save' ? 'alive' : shotResult}`} role="status">
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
