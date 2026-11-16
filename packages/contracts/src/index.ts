export type UserRole = 'ADMIN' | 'HOST' | 'ARTIST' | 'AUDIENCE';

export type AvatarPresetId = 'chibi-classic' | 'chibi-acoustic' | 'chibi-synth' | 'chibi-strings';

export type AvatarAnimationState =
  | 'IDLE'
  | 'WALK'
  | 'SIT'
  | 'STAND'
  | 'CLAP'
  | 'CHEER'
  | 'WAVE'
  | 'DANCE'
  | 'AFK'
  | 'PLAY_PIANO'
  | 'PLAY_GUITAR'
  | 'PLAY_VIOLIN'
  | 'PLAY_DRUMS';

export type RoomState = 'DRAFT' | 'OPEN' | 'ACTIVE' | 'LOCKED' | 'CLOSING' | 'CLOSED';

export type ConcertState =
  | 'DRAFT'
  | 'SCHEDULED'
  | 'PREPARING'
  | 'SOUND_CHECK'
  | 'LIVE'
  | 'PAUSED'
  | 'INTERMISSION'
  | 'COMPLETED'
  | 'CANCELLED';

export type SeatState = 'AVAILABLE' | 'HELD' | 'RESERVED' | 'OCCUPIED' | 'LOCKED' | 'RELEASED' | 'EXPIRED';

export type SeatTier = 'FRONT_ROW' | 'VIP' | 'PREMIUM' | 'STANDARD' | 'BALCONY';

export type PerformanceFormat = 'SOLO' | 'DUO' | 'BAND' | 'ORCHESTRA';

export type VenueStyle = 'CHAMBER' | 'CONCERT';

export type AudioInputMode = 'MICROPHONE' | 'AUDIO_INTERFACE' | 'MIDI' | 'VIRTUAL_DAW' | 'PRERECORDED';

export type InstrumentType = 'PIANO' | 'GUITAR' | 'BASS' | 'VIOLIN' | 'CELLO' | 'DRUMS' | 'VOCAL';

export type QualityPreset = 'LOW' | 'MEDIUM' | 'HIGH';

export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  roles: UserRole[];
  avatarPresetId: AvatarPresetId;
  ageConfirmed16Plus: boolean;
  birthDate?: string;
  authProvider: 'EMAIL' | 'GOOGLE' | 'DISCORD';
  createdAt?: number;
}

export interface SeatDTO {
  id: string;
  row: string;
  number: number;
  tier: SeatTier;
  state: SeatState;
  occupiedByUserId?: string;
  heldByUserId?: string;
  holdExpiresAt?: number;
  position: [number, number, number];
}

export type LightingPreset = 'WARM_CHAMBER' | 'SPOTLIGHT_SOLO' | 'DYNAMIC_CONCERT' | 'ENCORE_GOLD';

export interface SetlistItemDTO {
  id: string;
  title: string;
  artistName: string;
  durationSec: number;
  mode: 'LIVE' | 'PRERECORDED';
  lightingPreset: LightingPreset;
  youtubeUrl?: string;
  youtubeVideoId?: string;
}

export interface ConcertDTO {
  id: string;
  roomId: string;
  title: string;
  genre: string;
  format: PerformanceFormat;
  hostUserId: string;
  performerName: string;
  invitedPerformerIds: string[];
  scheduledAt: string;
  state: ConcertState;
  currentSetlistIndex: number;
  setlist: SetlistItemDTO[];
  isSpontaneous: boolean;
  trackPlaying?: boolean;
  trackStartedAtServerMs?: number;
  trackPausedAtSec?: number;
}

export interface RoomDTO {
  id: string;
  code: string;
  name: string;
  roomType: 'SMALL_ROOM' | 'PRIVATE_ROOM';
  venueStyle: VenueStyle;
  capacity: number; // 10-20 Small Room, 10-30 Private Room (TBD-02)
  isPrivate?: boolean;
  state: RoomState;
  memberCount: number;
  seats: SeatDTO[];
  concert: ConcertDTO;
}

export interface ChatMessageDTO {
  id: string;
  roomId: string;
  userId: string;
  displayName: string;
  role: UserRole;
  text: string;
  timestamp: number;
}

export interface ReportDTO {
  id: string;
  roomId: string;
  reporterUserId: string;
  targetUserId?: string;
  category: 'HARASSMENT' | 'SPAM' | 'COPYRIGHT' | 'INAPPROPRIATE_CONTENT';
  description: string;
  status: 'OPEN' | 'TRIAGED' | 'RESOLVED';
  aiPriority: 'LOW' | 'MEDIUM' | 'HIGH';
  createdAt: number;
}

export interface AnalyticsSummaryDTO {
  totalEvents: number;
  roomJoins: number;
  roomJoinFailures: number;
  roomJoinSuccessRate: number;
  concertsStarted: number;
  concertsCompleted: number;
  concertCompletionRate: number;
  d7RetentionRate: number;
  reportsSubmitted: number;
  uniqueUsersJoined: number;
  activeRooms: number;
  connectedClients: number;
}

// Grouped Multiplayer Sync Protocol (P0 - P3)
export type SyncPriority = 'P0' | 'P1' | 'P2' | 'P3';

export interface AvatarTransformPayload {
  userId: string;
  displayName: string;
  role: UserRole;
  avatarPresetId: AvatarPresetId;
  position: [number, number, number];
  rotationY: number;
  animation: AvatarAnimationState;
  seatId?: string;
  seq: number;
}

export interface MidiNoteEventPayload {
  userId: string;
  instrument: InstrumentType;
  note: number;
  velocity: number;
  isNoteOn: boolean;
  clientTimestampMs: number;
}

export type ReactionType = 'CLAP' | 'CHEER' | 'WAVE' | 'DANCE' | 'FLOWER';

export type RealtimeServerMessage =
  | {
      priority: 'P0';
      type: 'ROOM_SNAPSHOT';
      room: RoomDTO;
      avatars: AvatarTransformPayload[];
      chat: ChatMessageDTO[];
      serverTime?: number;
    }
  | { priority: 'P0'; type: 'ROOM_STATE_UPDATED'; roomState: RoomState }
  | { priority: 'P0'; type: 'SEAT_UPDATED'; seat: SeatDTO }
  | { priority: 'P0'; type: 'CONCERT_STATE_UPDATED'; concert: ConcertDTO; fallbackNotice?: string }
  | { priority: 'P0'; type: 'MODERATION_ACTION'; action: 'MUTE' | 'KICK' | 'BAN'; targetUserId: string; reason: string }
  | { priority: 'P1'; type: 'AVATAR_STATE'; avatar: AvatarTransformPayload }
  | { priority: 'P1'; type: 'AVATAR_LEFT'; userId: string }
  | { priority: 'P1'; type: 'AUDIO_TIMING_MIDI'; event: MidiNoteEventPayload }
  | { priority: 'P1'; type: 'WEBRTC_SIGNAL'; fromUserId: string; channel?: 'CONCERT' | 'PERFORMER_TALKBACK'; signal: unknown }
  | { priority: 'P1'; type: 'PONG'; clientSentAt: number; serverTime: number }
  | { priority: 'P2'; type: 'CHAT_MESSAGE'; message: ChatMessageDTO }
  | { priority: 'P2'; type: 'REACTION'; userId: string; displayName?: string; reaction: ReactionType }
  | { priority: 'P2'; type: 'SONG_ENDED_APPLAUSE'; setlistItemId: string }
  | { priority: 'P2'; type: 'LIGHTING_CUE'; preset: LightingPreset };

export type RealtimeClientMessage =
  | { type: 'JOIN_ROOM'; roomId: string; userId: string; displayName: string; role: UserRole; avatarPresetId: AvatarPresetId; passcode?: string }
  | { type: 'AVATAR_MOVE'; position: [number, number, number]; rotationY: number; animation: AvatarAnimationState; seq: number }
  | { type: 'OCCUPY_SEAT'; seatId: string }
  | { type: 'LEAVE_SEAT' }
  | { type: 'CHAT_SEND'; text: string }
  | { type: 'REACTION_SEND'; reaction: ReactionType }
  | { type: 'MIDI_EVENT'; event: MidiNoteEventPayload }
  | { type: 'WEBRTC_SIGNAL'; targetUserId?: string; channel?: 'CONCERT' | 'PERFORMER_TALKBACK'; signal: unknown }
  | {
      type: 'PERFORMER_CONCERT_CONTROL';
      action: 'START_SOUND_CHECK' | 'GO_LIVE' | 'PAUSE' | 'INTERMISSION' | 'NEXT_SONG' | 'END_SONG' | 'COMPLETE' | 'TOGGLE_MODE';
    }
  | { type: 'SELECT_SETLIST_ITEM'; index: number }
  | { type: 'SET_LIGHTING_CUE'; preset: LightingPreset }
  | { type: 'PING'; clientSentAt: number };

/**
 * Strictly extracts a YouTube video ID only from regular watch URLs
 * (e.g. https://www.youtube.com/watch?v=...), rejecting Shorts, Live, Embed, and shortened links.
 */
export function extractStandardYouTubeVideoId(rawUrl?: string): string | undefined {
  if (!rawUrl) return undefined;
  const trimmed = rawUrl.trim();
  if (!trimmed) return undefined;
  const normalized = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const u = new URL(normalized);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return undefined;
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    if (host !== 'youtube.com' && host !== 'm.youtube.com') return undefined;
    if (u.pathname !== '/watch') return undefined;
    const v = u.searchParams.get('v')?.trim();
    return v && /^[a-zA-Z0-9_-]{6,15}$/.test(v) ? v : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Returns the floor elevation at (x, z): 0.44 on the raised stage platform, 0 on the main floor.
 */
export function getAuditoriumFloorY(x: number, z: number): number {
  return Math.abs(x) <= 5.6 && z >= -4.5 && z <= 0.1 ? 0.44 : 0;
}
