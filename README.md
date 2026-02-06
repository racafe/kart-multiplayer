# Kart Game

A Mario Kart-style 3D racing game where players use their phones as controllers via WebSocket.

Open the game on a TV or laptop, scan the QR code with your phone, and race.

## Architecture

```
┌─────────────┐   WebSocket   ┌──────────────┐   WebSocket   ┌────────────────┐
│  Controller  │◄─────────────►│   WS Server  │◄─────────────►│  Game Screen   │
│  (phone)     │               │  (Node.js)   │               │  (browser/TV)  │
└─────────────┘               └──────────────┘               └────────────────┘
```

- **Game Screen** (`index.html`) — Renders the 3D race with Three.js. Hosts the room and displays lobby + race.
- **Controller** (`controller.html`) — Phone UI with gyroscope steering, drift button, and item use. Joins a room via QR code or 4-character code.
- **WS Server** (`src/server.ts`) — Room management and message forwarding. Host broadcasts game state to players; player inputs are relayed to host.
- **Nginx** — Serves static files and reverse-proxies `/ws` to the WebSocket server.

## Features

- Room-based multiplayer (4-char code, QR join)
- 3D track with Three.js
- Phone gyroscope steering
- Drift mechanic with boost reward
- AI opponents with rubber-banding
- Countdown, lap tracking, and race finish flow
- HUD with positions, lap counter, and minimap
- Boost pads on track

## Quick Start

### Docker (recommended)

```bash
docker compose up --build
```

Open `http://localhost:8080` on your computer and `http://localhost:8080/controller.html` on your phone (or scan the QR code shown on screen).

To use a different port:

```bash
WEB_PORT=3000 docker compose up --build
```

### Local Development

```bash
npm install
npm run dev
```

The WebSocket server starts on port 3000. Serve `index.html` and `controller.html` with any static file server (or use the Docker setup for the full stack).

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start WS server with hot-reload (tsx) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm run start` | Run compiled server |
| `npm run typecheck` | Type-check without emitting |
| `npm run lint` | Lint `src/` with ESLint |

## Tech Stack

- **Server:** Node.js, TypeScript, `ws` library
- **Frontend:** Vanilla HTML/JS, Three.js (CDN)
- **Infra:** Docker Compose, Nginx reverse proxy
