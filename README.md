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
  - [Access Code (optional)](#access-code-optional)
- [Project Structure](#project-structure)
- [Contributing](#contributing)
- [License](#license)

## Features

- **Liar's Deck** – 6-chamber virtual revolver with Russian Roulette gameplay, sound effects, and visual effects
- **Liar's Poker** – 8-chamber poker-themed variant with community cards and stages (Pre-flop, Flop, Turn, River, Showdown)
- **Card Score** – Vietnamese 13 (Tiến lên) score tracker with:
  - 2–4 players support
  - Configurable points (rankings, catch, hold, sweep, stuck)
  - Round history with edit/delete
  - Zero-sum default scoring per round
- Offline gameplay—no external servers required once loaded
- Responsive React UI with mobile support
- Persistent state (localStorage) for mode, mute, and game data

## Game Modes

| Mode | Description |
|------|-------------|
| **Liar's Deck** | Pick a card, spin the cylinder, and pull the trigger. Russian Roulette with card-based odds. |
| **Liar's Poker** | Poker-themed variant with 8 chambers and community card stages. |
| **Card Score** | Track Vietnamese 13 (Tiến lên) scores with configurable rules. |

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

### Access Code (optional)

The app can be gated behind an invite code. It is disabled by default.

1. Pick a code using the characters `0123456789ABCDEFGHJKMNPQRSTVWXYZ`
   (`I`, `L`, `O`, and `U` are excluded so codes are unambiguous read aloud),
   formatted `XXXX-XXXX`.
2. Hash it:

   ```bash
   npm run hash-code QRTX-8M2P
   ```

3. Set `VITE_ACCESS_CODE_HASHES` to the resulting hash in your Vercel project
   settings. Several codes can be configured at once, comma-separated, so you
   can hand different codes to different groups and revoke one without
   disturbing the others.
4. Redeploy. Vite inlines `VITE_*` at build time, so an environment-variable
   change alone does not take effect.

Leaving the variable unset disables the gate, so `npm run dev` and forks of
this repository work with no setup.

Revoking a code removes access from people who already used it: the app stores
the hash of the code that was accepted and re-checks it against the current
list on every load.

**What this is.** A doorbell, not a lock. This is a static site — the
JavaScript bundle is public and the check runs in the browser, so anyone
willing to open developer tools can bypass it. Anyone can also set the
`localStorage` key by hand, and the hashes are unsalted SHA-256 of an
8-character code drawn from a 32-character alphabet, which is brute-forceable
offline by anyone who extracts them and is willing to spend GPU time. It stops
casual visitors who happen to find the URL; it is not access control. If you
need real restriction, use Vercel's Deployment Protection instead.

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
│   │   └── AddRoundModal.tsx
│   ├── lib/               # Game logic
│   │   └── tienLenScore.ts
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
