# Multiplayer Architecture (`PROPOSED`)

> **Confirmed:** Grouped multiplayer synchronization (`TA-04`), Small Room 10–20 (`AR-02`), 100–500 global CCU (`TA-07`).  
> **Investigate:** Exact realtime transport/protocol (Experiment D).

## Proposed Synchronization Groups
| Group | Data | Suggested Handling |
|---|---|---|
| **P0: Room authority** | Membership, permissions, room/concert state | Authoritative server state |
| **P1: Avatar state** | Position, rotation, seat, movement state | Frequent updates, client prediction + remote interpolation |
| **P1: Performance state** | Current setlist item, live/paused/intermission | Reliable ordered events |
| **P1: Audio timing** | Session identity, timing metadata, sync markers | Audio-specific timing path |
| **P2: Animation events** | Instrument actions, claps, cheers, emotes | Event-based, deduplicated |
| **P2: Chat** | Text messages and moderation events | Reliable ordered delivery |
| **P2: Lighting** | Cue changes and transitions | Timestamped/reliable events |
| **P3: Presence cosmetics** | AFK indicator, low-priority visuals | Lower-frequency updates |

## Design Principles
- Server-authoritative room membership, seat ownership, moderation, and concert lifecycle.
- Keep audio media transport separate from ordinary JSON state messages.
- Rate limits & schema validation on all client-sent events.
- Explicit reconnect, stale-session, and sequence/versioning rules.

Related: [[System-Architecture]] | [[Data-Model]] | [[Development-Roadmap]]
