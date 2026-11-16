# Project Goals & Metrics

## Launch Direction (CONFIRMED)
- **Primary Market:** Vietnam first (international expansion is `FUTURE`).
- **Launch Mode:** Public Launch (after internal prototypes, testing, and readiness gates).
- **Scale Target:** 100–500 concurrent users (global CCU; Small Room capacity is 10–20 per room).
- **Mandatory Launch Quality Gates:** Audio quality, 3D FPS, multiplayer stability, and security.

## North Star Metric (CONFIRMED direction; formula PROPOSED)
**Audience Retention** — the rate at which audience members return to attend another concert.

Proposed initial definition (pending analytics event & cohort finalization — see `TBD-21`):
```text
D7 Audience Retention = Unique audience users who attend another concert within 7 days / Unique audience users in the eligible first-attendance cohort
```

## Supporting Metrics
- **Product:** D1/D7/D30 audience retention, completed concerts, average audience per concert, performer repeat-hosting rate, concert completion rate, room join success rate.
- **Technical:** Average FPS & 1% low FPS by device tier, audio end-to-end latency, jitter & packet loss, audio dropout rate, audio reconnect success, avatar sync error, room join latency/failure rate, multiplayer disconnect/reconnect rate.
- **Operational & Safety:** Reports by category, time to first moderation action, time to resolution, false-positive/false-negative moderation rates, live-concert incidents.

Related: [[Product-Vision]] | [[Performance-Test-Plan]] | [[Decision-Backlog]]
