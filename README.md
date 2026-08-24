# Game Tools

A web-based tool to support the Liar's Bar game mode from the Steam title "Liar's Bar". This offline-capable application provides three game modes: Liar's Deck (Russian Roulette), Liar's Poker, and Card Score Tracker for Vietnamese 13 (Tiến lên).

## Table of Contents

- [Features](#features)
- [Game Modes](#game-modes)
- [Demo](#demo)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Running Locally](#running-locally)
- [Project Structure](#project-structure)
- [Contributing](#contributing)
- [License](#license)

## Features

- **Liar's Deck** – 6-chamber virtual revolver with Russian Roulette gameplay, sound effects, and visual effects
- **Liar's Poker** – 8-chamber poker-themed variant with community cards and stages (Pre-flop, Flop, Turn, River, Showdown)
- **Card Score** – score tracker with three modes:
  - *Vietnamese 13 (Tiến lên)* – 2–4 players, configurable points (rankings, catch, hold, sweep, stuck), zero-sum per round
  - *Host* – 2–20 players, one host per round, win/lose/draw with multipliers
  - *Win Count* – 2–10 players, one winner per round scoring 1 point; generic enough for most trick-taking games
  - Optional money tracking in every mode: set a rate and the app settles up in cash
  - Round history with edit/delete and a Points ⇄ Money view toggle
- Offline gameplay—no external servers required once loaded
- Responsive React UI with mobile support
- Persistent state (localStorage) for mode, mute, and game data

## Game Modes

| Mode | Description |
|------|-------------|
| **Liar's Deck** | Pick a card, spin the cylinder, and pull the trigger. Russian Roulette with card-based odds. |
| **Liar's Poker** | Poker-themed variant with 8 chambers and community card stages. |
| **Card Score** | Track scores for Vietnamese 13, Host, or any one-winner-per-round game, with optional cash settlement. |

## Demo

Live demo: [liarbar-app.vercel.app](https://liarbar-app.vercel.app)

## Tech Stack

- React 19 + TypeScript
- Vite for fast builds and development server
- Tailwind CSS for styling
- Deployed on Vercel

## Getting Started

### Prerequisites

- Node.js >= 16.x
- npm or yarn

### Installation

```bash
git clone https://github.com/lntvan166/game-tools.git
cd game-tools
npm install
```

### Running Locally

```bash
npm run dev
```

Open http://localhost:5173 in your browser.

### Build

```bash
npm run build
```

Output is in the `dist/` directory.

### Tests

```bash
npm test
```

Unit tests cover the scoring and money logic in `src/lib/`.

## Project Structure

```
game-tools/
├── public/                # Static assets (images, sounds)
│   └── assets/img/
├── src/
│   ├── components/        # React components
│   │   ├── Game.tsx       # Liar's Deck
│   │   ├── PokerGame.tsx  # Liar's Poker
│   │   ├── ScoreTracking.tsx
│   │   ├── TienLenScore.tsx
│   │   ├── HostScore.tsx
│   │   ├── WinCountScore.tsx
│   │   ├── ScoreViewToggle.tsx
│   │   ├── AddRoundModal.tsx
│   │   ├── AddHostRoundModal.tsx
│   │   └── AddWinRoundModal.tsx
│   ├── lib/               # Game logic (unit-tested with vitest)
│   │   ├── money.ts
│   │   ├── tienLenScore.ts
│   │   ├── hostScore.ts
│   │   └── winCount.ts
│   ├── styles/
│   ├── App.tsx
│   ├── main.tsx
│   └── ErrorBoundary.tsx
├── vercel.json
├── package.json
└── vite.config.ts
```

## Contributing

Contributions are welcome!

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/YourFeature`)
3. Commit your changes (`git commit -m 'Add YourFeature'`)
4. Push to the branch (`git push origin feature/YourFeature`)
5. Open a Pull Request

## License

Distributed under the MIT License.
