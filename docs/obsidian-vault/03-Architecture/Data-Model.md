# Data Model & State Machines (`PROPOSED`)

> **Rules:** Distinguish `Event` (listing) from `Concert` (running session) and `Room` (venue). No raw audio recording or payment/currency entities in MVP.

## Candidate Entities
- **Identity & Access:** `User`, `ExternalIdentity`, `UserRole`, `ConsentRecord`
- **Avatar:** `AvatarPreset`, `UserAvatar`
- **Venue & Seating:** `Room`, `RoomType`, `Seat`, `SeatReservation`, `RoomMembership`
- **Concert & Audio:** `Event`, `Concert`, `PerformerSession`, `InstrumentProfile`, `AudioInputConfiguration`, `Setlist`, `SetlistItem`, `LightingCue`
- **Social & Safety:** `ChatMessage`, `Reaction`, `Report`, `ModerationAction`, `AnalyticsEvent`

## Candidate State Machines

### Room Lifecycle
```text
DRAFT -> OPEN -> ACTIVE -> CLOSING -> CLOSED
              \-> LOCKED
```

### Concert Lifecycle
```text
DRAFT -> SCHEDULED -> PREPARING -> SOUND_CHECK -> LIVE -> INTERMISSION -> LIVE -> COMPLETED
                                                  \-> PAUSED
LIVE / PAUSED -> CANCELLED
```

### Seat Lifecycle
```text
AVAILABLE -> HELD -> RESERVED -> OCCUPIED -> RELEASED
                 \-> EXPIRED
```

Related: [[System-Architecture]] | [[Master-Requirements]] | [[Decision-Backlog]]
