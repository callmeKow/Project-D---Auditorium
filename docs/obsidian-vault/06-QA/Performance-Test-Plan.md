# Performance & Load Test Plan

> **Owner:** [[QA-Agent]] + [[3D-Agent]] + [[Audio-Agent]]  
> **Scale Target:** 100–500 global CCU across multiple concurrent Small Rooms (10–20 capacity each).

## 1. 3D Performance Matrix (Experiment E)
Measure on low-, mid-, and high-tier desktop and mobile devices (`TBD-06`, `TBD-22`, `TBD-23`):
- Initial load time
- Average FPS and 1% low FPS
- Visible avatar count & animation count
- Draw calls, lighting/shadow load, texture memory, CPU/GPU utilization
- Quality-preset transitions

## 2. Load Test Scenarios
- 100–500 global CCU across multiple concurrent Small Rooms
- Varied room occupancy distributions & performer/audience traffic patterns
- Chat/reaction bursts & reconnect storms
- Backend, realtime gateway, and audio transport resource usage

Related: [[Test-Plan]] | [[Development-Roadmap]]
