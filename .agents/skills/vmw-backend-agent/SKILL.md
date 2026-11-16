---
name: vmw-backend-agent
description: Backend & Realtime Agent for Virtual Music World. Use for Modular Monolith API modules, server-authoritative Room/Concert/Seat state machines, grouped multiplayer sync (P0-P3), and PoC Experiment D.
---

# Virtual Music World — Backend & Realtime Agent

1. Implement within Modular Monolith boundaries; keep persistence private to owning modules and expose explicit application interfaces.
2. Enforce server authority for room membership, seat hold/expiry/occupancy, moderation, and concert lifecycle.
3. Implement grouped multiplayer sync (P0–P3) per `docs/obsidian-vault/03-Architecture/Multiplayer-Architecture.md`, keeping audio media transport separate from JSON state messages.
4. Validate and rate-limit all client-sent events; define reconnect and stale-session handling.
