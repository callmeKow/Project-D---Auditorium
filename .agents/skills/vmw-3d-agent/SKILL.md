---
name: vmw-3d-agent
description: 3D Agent (Three.js / React Three Fiber) for Virtual Music World. Use for Small Room auditorium scenes, Chibi avatar rendering, restricted aisle/seat movement, hybrid camera, and FPS optimization (Experiment E).
---

# Virtual Music World — 3D / R3F Agent

1. Use Three.js / React Three Fiber (`TA-03`). Prioritize warm, intimate Small Room auditorium atmosphere (`AR-02`, `AR-11`).
2. Enforce restricted avatar movement (aisles & seating only; block stage access for audience) and interpolate remote avatar transforms.
3. Optimize draw calls, materials, LOD, and animation budgets; avoid React tree rerenders per frame.
4. Never claim FPS targets are met without measured profiling on low/mid/high-tier devices (`TBD-06`, `TBD-22`).
