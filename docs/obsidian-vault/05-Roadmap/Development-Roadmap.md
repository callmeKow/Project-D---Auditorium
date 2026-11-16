# Development Roadmap & Technical PoC Plan

## Phases (Blueprint Section 15)
- **Phase 0 — Repository & Product Foundation:** Workspace audit, Obsidian KB, `AGENTS.md`, specialist agents, PRD skeleton, Decision Backlog.
- **Phase 1 — Critical Technical Proofs of Concept (Experiments A–F):** Validate audio, MIDI sync, multiplayer, 3D FPS, and Companion App before full build.
- **Phase 2 — Core Platform:** Auth, profiles/Chibi presets, discovery, Lobby, Small Room, 2D seat map, basic R3F auditorium, Modular Monolith skeleton.
- **Phase 3 — Complete Concert Experience:** Performer setup/sound check, audio/MIDI inputs, live/prerecorded switch, setlist/lighting, chat/reactions, reconnects.
- **Phase 4 — Safety, Compatibility, QA & Scale:** RBAC, moderation, 16+ & copyright workflows, device matrix, 100–500 CCU load tests, monitoring.
- **Phase 5 — Public Launch:** Production deploy, incident response, ops guides, analytics, rollback plan.

## Phase 1 Technical Experiments (Blueprint Section 18)
| Exp | Focus | Key Acceptance Questions |
|---|---|---|
| **A** | Browser Audio | Mic/device capture, input level, clipping, local monitoring across target browsers. |
| **B** | Performer-to-Audience Audio | 1-to-many audio delivery, end-to-end latency, jitter, packet loss, reconnect. |
| **C** | MIDI-to-Animation | MIDI note-on/off/velocity capture, timestamping, audio-animation sync drift. |
| **D** | Multiplayer Room | Small group presence, avatar pos/seat/anim sync, chat/reactions, stale state & reconnect. |
| **E** | 3D Performance | Representative Small Room + target Chibi avatars; profile CPU/GPU/FPS/draw calls/memory. |
| **F** | Companion App Feasibility | Identify exact OS/browser gaps; prototype missing routing/DAW/MIDI forwarding & local auth. |

Related: [[Task-Backlog]] | [[Audio-Architecture]] | [[Performance-Test-Plan]]
