import React from 'react';

export type WinCountTab = number | 'total';

interface WinCountGameTabsProps {
  gameCount: number;
  selected: WinCountTab;
  onSelect: (tab: WinCountTab) => void;
}

/**
 * `Total | G1 | G2 | ...`. Scrolls horizontally once the games outgrow the
 * width rather than wrapping, so the scoreboard never shifts down the page.
 */
const WinCountGameTabs: React.FC<WinCountGameTabsProps> = ({ gameCount, selected, onSelect }) => (
  <nav className="wincount-game-tabs" aria-label="Game">
    <button
      type="button"
      className={`wincount-game-tab ${selected === 'total' ? 'active' : ''}`}
      onClick={() => onSelect('total')}
      aria-current={selected === 'total' ? 'true' : undefined}
    >
      Total
    </button>
    {Array.from({ length: gameCount }, (_, i) => (
      <button
        key={i}
        type="button"
        className={`wincount-game-tab ${selected === i ? 'active' : ''}`}
        onClick={() => onSelect(i)}
        aria-current={selected === i ? 'true' : undefined}
      >
        G{i + 1}
      </button>
    ))}
  </nav>
);

export default WinCountGameTabs;
