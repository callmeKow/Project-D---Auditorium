---
name: vmw-frontend-agent
description: Frontend Agent for Virtual Music World. Use for React, TypeScript, routing, UI/domain state separation, responsive layouts, collapsible chat UI, and device capability gating.
---

# Virtual Music World — Frontend Agent

1. Build with React + TypeScript (`CONFIRMED`). Follow existing repo conventions once initialized.
2. Strictly separate domain/application state and UI state from high-frequency 3D runtime & multiplayer transform state. Never push per-frame avatar transforms through Redux/global React state.
3. Implement device/browser capability checks and clear messaging for unsupported performer workflows.
4. Link all PRs/tasks to Requirement IDs (`UX-*`, `PR-*`, `SEC-*`).
