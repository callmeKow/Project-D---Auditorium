# Test Plan (Functional, Audio, Multiplayer)

> **Owner:** [[QA-Agent]]  
> **Rule:** Never report numeric latency or FPS targets as met without measured evidence from PoC/test runs (`TBD-22`).

## 1. Functional Test Areas
- Registration/login (Email/Password + Social Login) & 16+ age policy
- Concert discovery (list, calendar, search, featured)
- 2D seat selection, hold expiry, and room entry/exit
- Restricted avatar movement (aisles/seating only; stage blocked for audience)
- Performer setup, device selection, sound check, live/prerecorded switching
- Setlist & lighting cue synchronization
- Collapsible chat, reactions, invite/room codes
- Host/Admin moderation (mute, kick, temp/perm ban) & reports
- Concert completion and recovery

## 2. Audio Test Matrix
- Device enumeration/selection (mic, audio interface, MIDI, virtual DAW audio)
- Solo/Duo/Band/Orchestra multi-performer flows & live↔prerecorded switching
- Latency, jitter, packet loss, audio dropout, device disconnect, browser tab suspension/resume

## 3. Multiplayer Test Matrix
- Room join/leave, concurrent avatar movement, seat contention
- Chat load & reaction bursts, Host moderation enforcement
- Reconnect, duplicate/stale message handling, cross-client state consistency

Related: [[Performance-Test-Plan]] | [[Release-Checklist]]
