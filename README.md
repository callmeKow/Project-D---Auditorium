# Virtual Music World (VMW)

> **Browser-first 3D multiplayer live music concert platform** — low-latency live performance with reliable audio, Anime Chibi avatar synchronization, and Small Room (10–20 capacity) auditoriums.

## Architecture & Workspace Structure

- **`apps/web`** — React 18 + TypeScript + Vite + Tailwind CSS + Three.js / React Three Fiber (`@react-three/fiber`, `@react-three/drei`)
- **`apps/companion`** — Experiment F Desktop Companion Bridge PoC (`ws://127.0.0.1:49152`, loopback-only)
- **`services/api`** — Modular Monolith backend (`Express` + `ws` Realtime Gateway) with modules:
  - `identity` (Email/Password, Social Login, 16+ age gate, data export & deletion)
  - `authorization` (Server-side RBAC & stage access checks)
  - `room` & `seating` (Small Room 10–20 capacity, 2D seat hold/expiry/occupy)
  - `concert` (Concert lifecycle state machine, editable setlist, performer invites)
  - `moderation` (AI-triaged reports, Mute/Kick/Ban with Host vs Admin split)
  - `analytics` & `realtime` (P0–P2 grouped sync + WebRTC signaling relay)
- **`packages/contracts`** — Shared TypeScript DTOs and P0–P2 realtime message schemas
- **`infrastructure/local`** — Docker Compose baseline (PostgreSQL + Redis) & `.env.example`
- **`docs/obsidian-vault`** — Central project knowledge base (managed via Obsidian)

## Quick Start

```bash
# 1. Install workspace dependencies (requires Node.js 20+)
npm ci

# 2. Run typecheck and unit/integration tests
npm run typecheck
npm test

# 3. Start API (port 4000) + Web App (Vite dev server)
npm run dev
```

### Optional PoC & Load Testing Scripts

```bash
# Start Experiment F Companion Bridge PoC (loopback only)
node apps/companion/bridge.mjs

# Run Phase 4 / Experiment D 100-CCU load test against running API
node tools/scripts/load-test.mjs http://localhost:4000 100
```
