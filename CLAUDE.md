# CLAUDE.md

## Project

Mario Kart-style 3D racing game with phone controllers connected via WebSocket.

## Key Files

- `src/server.ts` — WebSocket room server (create/join/reconnect rooms, message forwarding)
- `index.html` — Game screen (Three.js renderer, lobby, race logic, HUD)
- `controller.html` — Phone controller (gyroscope steering, drift, item use, room join via QR/code)
- `nginx/default.conf` — Reverse proxy config (static files + `/ws` proxy)
- `docker-compose.yml` — Two services: `ws` (Node) and `web` (Nginx)

## Commands

- `npm run typecheck` — Type-check (must pass before committing)
- `npm run lint` — ESLint (must pass before committing)
- `npm run dev` — Start dev server with hot-reload
- `npm run build` — Compile TypeScript
- `docker compose up --build` — Run full stack locally

## Conventions

- Room codes: 4-char alphanumeric (no ambiguous chars like 0/O, 1/I/L)
- Max 2 players per room + 1 host (game screen)
- WS message flow: host broadcasts to players, player messages forwarded to host with `player` field injected
- ESLint 9 flat config with typescript-eslint
- Unused function args prefixed with `_`

## Color Scheme

- Background: `#0a0a1a`
- Primary accent: amber `#f59e0b`
- Player 1: red `#ef4444`
- Player 2: blue `#3b82f6`
