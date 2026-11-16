# Master Requirements Register

> **Rule:** Keep Requirement IDs (`PR-*` through `ST-*`) stable. Link every user story, ADR, task, and test case to one or more IDs.

## 5.1 Product & Platform (`PR`)
| ID | Requirement | Status / Priority |
|---|---|---|
| `PR-01` | Combine 3D game, music platform, social world, and live performance platform. | Confirmed / Must-have |
| `PR-02` | Deliver a realistic-feeling virtual concert experience. | Confirmed / Must-have |
| `PR-03` | Support all major music genres. | Confirmed / Must-have |
| `PR-04` | Provide platform-level Admin management. | Confirmed / Must-have |
| `PR-05` | Support multiple room creation models and role-based control. | Confirmed high-level; permissions TBD (`TBD-01`) |
| `PR-06` | Support spontaneous and scheduled performances. | Confirmed / Must-have |

## 5.2 Auditorium & Seating (`AR`)
| ID | Requirement | Status / Priority |
|---|---|---|
| `AR-01` | Central Lobby with independent Auditorium instances. | Confirmed / Must-have |
| `AR-02` | Small Room for 10–20 people as the initial MVP room. | Confirmed / Must-have |
| `AR-03` | VIP Hall. | Confirmed / Future |
| `AR-04` | Private Room. | Confirmed / Future |
| `AR-05` | Hybrid camera with multiple modes. | Confirmed / Must-have |
| `AR-06` | Restrict avatar movement to aisles and seating areas. | Confirmed / Must-have |
| `AR-07` | Combine 2D seating map and manual avatar movement. | Confirmed / Must-have |
| `AR-08` | Support reservation and walk-in seat selection at product level. | Confirmed; MVP details TBD (`TBD-04`) |
| `AR-09` | Seat tiers: Standard, Premium, VIP, Balcony, Front Row. | Confirmed concept; MVP subset TBD (`TBD-05`) |
| `AR-10` | No additional functional areas initially. | Confirmed / Must-have scope constraint |
| `AR-11` | Warm, intimate auditorium atmosphere. | Confirmed / Must-have |
| `AR-12` | Clear, high-quality audio. | Confirmed / Critical NFR |

## 5.3 Character & Animation (`CR`)
| ID | Requirement | Status / Priority |
|---|---|---|
| `CR-01` | Anime Chibi visual style. | Confirmed / Must-have |
| `CR-02` | Multiple preset characters. | Confirmed / Must-have |
| `CR-03` | No full Character Creator initially. | Confirmed / Scope constraint |
| `CR-04` | Preset outfits and characters. | Confirmed / Must-have |
| `CR-05` | Basic audience animation set. | Confirmed / Must-have |
| `CR-06` | Automatic applause at song end. | Confirmed / Must-have |
| `CR-07` | Rhythm/beat-based audience reactions. | Confirmed concept; trigger TBD (`TBD-07`) |
| `CR-08` | No facial expression system required initially. | Confirmed / Scope constraint |
| `CR-09` | Performer can customize outfit and instrument. | Confirmed; exact options TBD |
| `CR-10` | Optimize visible avatar count for FPS. | Confirmed goal; threshold TBD (`TBD-06`) |

## 5.4 Live Music & Instrument Input (`LMR`)
| ID | Requirement | Status / Priority |
|---|---|---|
| `LMR-01` | Support physical instruments, MIDI, DAW, and prerecorded audio. | Confirmed / Must-have |
| `LMR-02` | Support piano, guitar, bass, violin, cello, drums, drum pads, and related devices. | Confirmed / Must-have |
| `LMR-03` | Support microphone, audio interface, MIDI, and virtual audio input. | Confirmed / Must-have |
| `LMR-04` | Synchronize performance animation relatively with actual playing actions. | Confirmed / Critical |
| `LMR-05` | Support Solo, Duo, Band, and Orchestra performance formats. | Confirmed / Must-have |
| `LMR-06` | Allow switching between Live and prerecorded material in the same show. | Confirmed / Must-have |
| `LMR-07` | Performer voice communication. | TBD (`TBD-08`) |
| `LMR-08` | Provide device setup and sound check workflow. | Confirmed / Must-have |
| `LMR-09` | Allow inviting other Performers onto the stage. | Confirmed / Must-have |
| `LMR-10` | Support USB/USB-C-connected equipment where technically compatible. | Confirmed goal; compatibility TBD (`TBD-09`) |

## 5.5 Multiplayer & Social (`MR`)
| ID | Requirement | Status / Priority |
|---|---|---|
| `MR-01` | Capacity depends on room type. | Confirmed |
| `MR-02` | Livestream-style text chat beside the concert. | Confirmed / Must-have |
| `MR-03` | No voice chat in the Auditorium. | Confirmed / Must-have |
| `MR-04` | Donation/Gift concept for Performers. | Confirmed direction; financial gifts Future (`TBD-16`) |
| `MR-05` | Invite and room-code joining. | Confirmed / Must-have |
| `MR-06` | Avatar interactions within movement constraints. | Confirmed / Must-have |
| `MR-07` | Stronger interactions mainly during song breaks. | Confirmed / Must-have |
| `MR-08` | Full social network is deferred. | Confirmed / Future |

## 5.6 Stage, Event & Performance Management (`SM`)
| ID | Requirement | Status / Priority |
|---|---|---|
| `SM-01` | All users can create rooms within account limits. | Confirmed; limits TBD (`TBD-03`) |
| `SM-02` | Support spontaneous and scheduled events. | Confirmed / Must-have |
| `SM-03` | Free, ticketed, and private access models as product direction. | Confirmed; MVP is free |
| `SM-04` | Admin, Host, Artist/Performer roles. | Confirmed / Must-have |
| `SM-05` | Fixed stage design initially. | Confirmed / Must-have |
| `SM-06` | Stage customization later. | Future |
| `SM-07` | Lighting scripts per song. | Confirmed / Must-have |
| `SM-08` | Prepared setlist editable during performance. | Confirmed / Must-have |
| `SM-09` | Admin-managed recording/replay in the future. | Future; no MVP recording |

## 5.7 Economy & Monetization (`EC`)
| ID | Requirement | Status / Priority |
|---|---|---|
| `EC-01` | No currency system initially. | Confirmed / Must-have constraint |
| `EC-02` | Multiple donation/gift forms as a future direction. | Confirmed direction; MVP scope TBD (`TBD-16`) |
| `EC-03` | Concerts free initially. | Confirmed / Must-have |
| `EC-04` | No Artist monetization initially. | Confirmed / Must-have constraint |
| `EC-05` | Platform revenue model undecided. | Confirmed / TBD |
| `EC-06` | No Premium Account initially. | Confirmed / Must-have constraint |
| `EC-07` | Future store categories (avatar, outfit, instrument, effects, decoration). | Future |
| `EC-08` | No income/expense system initially. | Confirmed / Must-have constraint |

## 5.8 UI/UX (`UX`)
| ID | Requirement | Status / Priority |
|---|---|---|
| `UX-01` | Landing page introduces platform, artists, and featured concerts. | Confirmed / Must-have |
| `UX-02` | Minimal Lobby focused on rooms and events. | Confirmed / Must-have |
| `UX-03` | Minimal Auditorium UI prioritizing stage and avatars. | Confirmed / Must-have |
| `UX-04` | Toggle/collapse chat panel. | Confirmed / Must-have |
| `UX-05` | Concert discovery through list, calendar, search, and featured content. | Confirmed; MVP subset TBD |
| `UX-06` | 2D seat selection before entering the 3D room. | Confirmed / Must-have |
| `UX-07` | Professional music-platform UI direction. | Confirmed / Must-have |
| `UX-08` | Dynamic concert stage style. | Confirmed / Must-have |
| `UX-09` | Warm, intimate chamber/classical auditorium style. | Confirmed direction; MVP template scope TBD |

## 5.9 Technical Architecture & Performance (`TA`)
| ID | Requirement | Status / Priority |
|---|---|---|
| `TA-01` | Browser-first platform. | Confirmed / Must-have |
| `TA-02` | Desktop Companion App for advanced workflows. | Confirmed direction; implementation TBD (`TBD-24`) |
| `TA-03` | Three.js / React Three Fiber. | Selected direction |
| `TA-04` | Grouped multiplayer synchronization. | Confirmed / Must-have |
| `TA-05` | Browser Audio plus Companion App as appropriate. | Confirmed direction |
| `TA-06` | Modular Monolith backend initially. | Confirmed direction |
| `TA-07` | 100–500 CCU target. | Confirmed / Launch target |
| `TA-08` | Stable FPS, reduced lag, optimized resources. | Confirmed / Critical NFR |
| `TA-09` | Avoid audio drop/skip. | Confirmed / Critical NFR |
| `TA-10` | Audio-animation synchronization. | Confirmed / Critical NFR |

## 5.10 AI-First Development (`AI`)
| ID | Requirement | Status / Priority |
|---|---|---|
| `AI-01`..`AI-10` | Maximize AI automation, multi-tool ecosystem, Agent Manager + specialist agents, shared context, Obsidian KB, AI asset pipeline, AI-assisted QA, PO as PO/Tech Lead/Reviewer, clarify before decomposing, auto-decompose after approval. | Confirmed |

## 5.11 Security, Privacy & Legal (`SEC`)
| ID | Requirement | Status / Priority |
|---|---|---|
| `SEC-01` | Email/Password authentication. | Confirmed / Must-have |
| `SEC-02` | Social Login. | Confirmed / Must-have |
| `SEC-03` | Account/session security controls. | TBD |
| `SEC-04` | AI + Admin + community-report moderation. | Confirmed / Must-have |
| `SEC-05` | User reporting. | Confirmed / Must-have |
| `SEC-06` | Mute, Kick, temporary Ban, permanent Ban. | Confirmed / Must-have |
| `SEC-07` | Admin/Host permission split. | Confirmed high-level; matrix TBD (`TBD-12`) |
| `SEC-08` | Report intake, review, and resolution workflow. | TBD |
| `SEC-09` | Music usage rules. | Confirmed / Must-have |
| `SEC-10` | License declaration/verification where required. | TBD (`TBD-19`) |
| `SEC-11` | Copyright complaint handling. | Confirmed / Must-have |
| `SEC-12` | No Recording/Replay in initial release. | Confirmed / Must-have constraint |
| `SEC-13` | Architecture may support future Recording/Replay. | Future |
| `SEC-14`..`SEC-16` | Clear data purpose, consent mechanisms, user data-management. | Confirmed / Must-have |
| `SEC-17` | Data retention and deletion policy. | TBD (`TBD-17`) |
| `SEC-18` | Minimum target age 16+. | Confirmed / Must-have |
| `SEC-19` | Age-policy enforcement and minor protection. | TBD (`TBD-18`) |

## 5.12 Business & Roadmap (`BM`, `ST`)
| ID | Requirement | Status / Priority |
|---|---|---|
| `BM-01`..`BM-08` | Target all user groups, Vietnam-first, Public Launch, end-to-end MVP, low-latency differentiator, no growth strategy yet, multi-metric success, revenue undecided. | Confirmed |
| `ST-01`..`ST-08` | Must/Should/Future prioritization, broad device support + Companion App, Small Room first, all confirmed inputs, 4 launch quality gates, 100–500 CCU, Audience Retention North Star, maximize AI ops. | Confirmed |

Related: [[Discovery-Rounds-01-13]] | [[Decision-Backlog]] | [[System-Architecture]]
