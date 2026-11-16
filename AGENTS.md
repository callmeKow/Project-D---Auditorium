# Virtual Music World — AI Engineering Manager & Workspace Rules

You are working on **Virtual Music World**, a browser-first 3D multiplayer live music concert platform.
**Core Differentiator:** Low-latency live music performance with reliable audio, animation, and multiplayer synchronization.

## 1. Central Knowledge Base (Obsidian)
- **Vault Location:** `docs/obsidian-vault/`
- **Entry Point:** `docs/obsidian-vault/00-Project-Overview/README.md`
- **Master Requirements:** `docs/obsidian-vault/01-Discovery/Master-Requirements.md` (`PR-*` through `ST-*`)
- **Open Decisions:** `docs/obsidian-vault/01-Discovery/Decision-Backlog.md` (`TBD-01` through `TBD-24`)
- Agents must keep requirement IDs stable, link tasks/ADRs to requirement IDs, and update relevant Obsidian notes after approved changes. Never silently rewrite historical discovery decisions.

## 2. Decision Label Governance
Always respect and preserve these labels:
- `CONFIRMED`: Explicitly selected by the Product Owner. Treat as a binding constraint.
- `PROPOSED`: Recommended architecture/approach. Validate before treating as binding.
- `INVESTIGATE`: Requires research, benchmark, or PoC.
- `TBD`: Unresolved Product Owner or operational decision. **Do not invent decisions.**
- `FUTURE`: Intentionally deferred beyond MVP.

## 3. MVP Scope Guardrails
- **In Scope (MVP):**
  - Browser-first web app (React + TypeScript + Three.js / React Three Fiber).
  - Central Lobby + **Small Room** Auditorium (10–20 capacity) first.
  - 2D seat selection before entering 3D room; avatar movement restricted to aisles/seating areas.
  - Anime Chibi preset avatars & basic animations (no full character creator, no facial expressions).
  - Live + prerecorded audio, physical instruments, MIDI, DAW/virtual audio, microphone, audio interface; sound check workflow; Solo/Duo/Band/Orchestra.
  - Collapsible livestream-style text chat (no voice chat in Auditorium).
  - Email/Password + Social Login; 16+ age policy; AI + Host + Admin moderation; copyright complaint workflow.
  - Modular Monolith backend; 100–500 global CCU launch target.
- **Explicitly Out of Scope for MVP (Do NOT introduce):**
  - Payments, virtual currency, paid tickets, monetized gifts, artist payouts, or premium accounts.
  - Recording or Replay.
  - VIP Hall, Private Room, stage customization, full social graph (friend lists, parties, follows).
  - Premature microservices.

## 4. Technical & Quality Rules
- **State Separation:** Keep UI/domain state separate from high-frequency 3D runtime & multiplayer transform state. Never push per-frame avatar transforms through a general React global store (e.g., Redux Toolkit).
- **Audio Isolation:** Keep live audio media transport separate from ordinary JSON state messages. Distinguish performer monitoring latency from audience delivery latency, and MIDI event streams from audio waveform streams.
- **Server Authority:** Room membership, seat ownership/expiry, moderation, and concert lifecycle must be enforced server-side.
- **Evidence First:** Do not claim latency, FPS, or CCU targets are met without measured PoC/test evidence.
- **No Broad Scaffolding:** Do not install large dependency sets or rewrite the repository without an approved task plan.

## 5. Human Approval Gates
Require explicit Product Owner approval before:
1. Changing confirmed product scope or requirements.
2. Architecture changes with broad impact or converting `PROPOSED`/`TBD` into `CONFIRMED`.
3. Security, privacy, age-policy, or copyright/legal policy decisions.
4. Database migrations with material data impact.
5. External services or infrastructure choices with meaningful cost.
6. Production deployment, release, or destructive repository operations.

## 6. Specialist Agent Skills
Specialist role playbooks are defined in `.agents/skills/vmw-*/SKILL.md` and documented in `docs/obsidian-vault/07-AI-Agents/`.
- One agent owns a task at a time; define explicit API/data contracts before parallel work.
- Every task must follow the template in `docs/obsidian-vault/05-Roadmap/Task-Backlog.md` and meet DoR/DoD in `docs/obsidian-vault/06-QA/Release-Checklist.md`.
