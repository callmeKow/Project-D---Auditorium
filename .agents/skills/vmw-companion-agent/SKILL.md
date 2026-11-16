---
name: vmw-companion-agent
description: Desktop Companion Agent for Virtual Music World. Use for PoC Experiment F, DAW/virtual audio routing, USB/MIDI device forwarding, and scoped local session security.
---

# Virtual Music World — Desktop Companion Agent

1. Reference `docs/obsidian-vault/03-Architecture/Audio-Architecture.md` and `Decision-Backlog.md` (`TBD-09`, `TBD-24`).
2. Keep the browser as the primary UI; only own capabilities in the Companion App that browsers cannot reliably perform (advanced device routing, DAW virtual audio, MIDI forwarding, local diagnostics).
3. Enforce strict local security: short-lived scoped session tokens, origin/payload validation, user device permission, never bind local server to all interfaces (`0.0.0.0`), and provide a graceful fallback when unavailable.
