# Open Decisions / Decision Backlog (`TBD-01` .. `TBD-24`)

> **Governance:** Agents MUST NOT invent decisions for `TBD` items. Escalate to Product Owner via [[BA-Agent]] or [[Agent-Manager]] for approval.

| ID | Topic | Decision Required | Linked Reqs | Suggested Owner | Status |
|---|---|---|---|---|---|
| `TBD-01` | Room permissions | Which roles can create each room/event type? | `PR-05`, `SM-01` | BA + Security | `TBD` |
| `TBD-02` | VIP vs Private | Access, capacity, privacy, and customization differences. | `AR-03`, `AR-04` | BA | `TBD` (Future) |
| `TBD-03` | Room limits | Rooms per account, concurrent rooms, duration, and capacity. | `SM-01`, `AR-02` | BA + Architect | `TBD` |
| `TBD-04` | Seat reservation | Hold duration, expiry, confirmation, and abandoned seat behavior. | `AR-08` | BA + Backend | `TBD` |
| `TBD-05` | Seat tiers | Which tiers are in MVP and what practical differences they provide. | `AR-09` | BA + Product/UX | `TBD` |
| `TBD-06` | Avatar limits | Maximum visible avatars by device tier and room. | `CR-10`, `TA-08` | 3D + QA (PoC Exp E) | `INVESTIGATE` |
| `TBD-07` | Rhythm reaction | Audio analysis, MIDI events, manual cues, or simplified timing. | `CR-07` | Audio + 3D | `TBD` |
| `TBD-08` | Performer voice | Whether private performer communication is needed. | `LMR-07` | BA + Audio | `TBD` |
| `TBD-09` | Device compatibility | Browser vs Companion App support per device and OS. | `LMR-10`, `ST-02` | Audio + Companion (PoC Exp F) | `INVESTIGATE` |
| `TBD-10` | Audio architecture | Transport, routing, monitoring, synchronization, fallback. | `TA-05`, `TA-09`, `TA-10` | Audio + Architect (PoC Exp A/B/C) | `INVESTIGATE` |
| `TBD-11` | Performer disconnect | Pause, fallback playback, rejoin, or end-event behavior. | `LMR-06`, `TA-09` | BA + Audio + Backend | `TBD` |
| `TBD-12` | Host permissions | Lock seats, mute, kick, pause, stop, and event moderation. | `SEC-07`, `SM-04` | BA + Security | `TBD` |
| `TBD-13` | Artist verification | Eligibility and verification for public performances. | `SM-04`, `PR-05` | BA + Security | `TBD` |
| `TBD-14` | Lighting authority | Who creates, approves, and changes scripts live? | `SM-07` | BA + UX | `TBD` |
| `TBD-15` | Recording future | Capture format, consent, retention, and replay model. | `SM-09`, `SEC-13` | Architect | `FUTURE` |
| `TBD-16` | Gift MVP | Whether any non-financial gift/reaction presentation exists in MVP. | `MR-04`, `EC-02` | BA + UX | `TBD` |
| `TBD-17` | Data lifecycle | Retention, export, account deletion, and legal exceptions. | `SEC-14`..`SEC-17` | Security + BA | `TBD` |
| `TBD-18` | Age policy | Age declaration/verification and protections for 16–17-year-old users. | `SEC-18`, `SEC-19` | Security + Legal | `TBD` |
| `TBD-19` | Copyright workflow | License evidence, complaint review, takedown, repeat infringement. | `SEC-09`..`SEC-11` | Security + Legal | `TBD` |
| `TBD-20` | AI moderation | Which actions may be automatic and which require Admin review? | `SEC-04` | Security + Moderation | `TBD` |
| `TBD-21` | Release metrics | Exact retention definition and launch thresholds. | `BM-07`, `ST-07` | BA + PO | `TBD` |
| `TBD-22` | Performance thresholds | FPS, latency, jitter, dropout, and recovery targets. | `TA-08`..`TA-10` | QA + Audio + 3D (PoC) | `INVESTIGATE` |
| `TBD-23` | Mobile scope | Audience features and 3D quality expectations on mobile. | `ST-02`, `UX-03` | UX + 3D + QA | `TBD` |
| `TBD-24` | Companion App | Supported OS, packaging, device access, update, and security model. | `TA-02`, `TA-05` | Companion + Security (Exp F) | `INVESTIGATE` |

Related: [[Master-Requirements]] | [[Development-Roadmap]]
