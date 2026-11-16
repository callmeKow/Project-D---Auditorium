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

export type SeatState = 'AVAILABLE' | 'HELD' | 'RESERVED' | 'OCCUPIED' | 'RELEASED' | 'EXPIRED';

export type SeatTier = 'FRONT_ROW' | 'VIP' | 'PREMIUM' | 'STANDARD' | 'BALCONY';

export type PerformanceFormat = 'SOLO' | 'DUO' | 'BAND' | 'ORCHESTRA';

export type AudioInputMode = 'MICROPHONE' | 'AUDIO_INTERFACE' | 'MIDI' | 'VIRTUAL_DAW' | 'PRERECORDED';

export type InstrumentType = 'PIANO' | 'GUITAR' | 'BASS' | 'VIOLIN' | 'CELLO' | 'DRUMS' | 'VOCAL';

export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  roles: UserRole[];
  avatarPresetId: AvatarPresetId;
  ageConfirmed16Plus: boolean;
  authProvider: 'EMAIL' | 'GOOGLE' | 'DISCORD';
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

export interface SetlistItemDTO {
  id: string;
  title: string;
  artistName: string;
  durationSec: number;
  mode: 'LIVE' | 'PRERECORDED';
  lightingPreset: 'WARM_CHAMBER' | 'SPOTLIGHT_SOLO' | 'DYNAMIC_CONCERT' | 'ENCORE_GOLD';
}

export interface ConcertDTO {
  id: string;
  roomId: string;
  title: string;
  genre: string;
  format: PerformanceFormat;
  hostUserId: string;
  performerName: string;
  scheduledAt: string;
  state: ConcertState;
  currentSetlistIndex: number;
  setlist: SetlistItemDTO[];
  isSpontaneous: boolean;
}

export interface RoomDTO {
  id: string;
  code: string;
  name: string;
  roomType: 'SMALL_ROOM';
  capacity: number; // 10-20 for Small Room MVP
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

export type RealtimeServerMessage =
  | { priority: 'P0'; type: 'ROOM_SNAPSHOT'; room: RoomDTO; avatars: AvatarTransformPayload[]; chat: ChatMessageDTO[] }
  | { priority: 'P0'; type: 'SEAT_UPDATED'; seat: SeatDTO }
  | { priority: 'P0'; type: 'CONCERT_STATE_UPDATED'; concert: ConcertDTO }
  | { priority: 'P0'; type: 'MODERATION_ACTION'; action: 'MUTE' | 'KICK' | 'BAN'; targetUserId: string; reason: string }
  | { priority: 'P1'; type: 'AVATAR_STATE'; avatar: AvatarTransformPayload }
  | { priority: 'P1'; type: 'AVATAR_LEFT'; userId: string }
  | { priority: 'P1'; type: 'AUDIO_TIMING_MIDI'; event: MidiNoteEventPayload }
  | { priority: 'P1'; type: 'WEBRTC_SIGNAL'; fromUserId: string; signal: unknown }
  | { priority: 'P2'; type: 'CHAT_MESSAGE'; message: ChatMessageDTO }
  | { priority: 'P2'; type: 'REACTION'; userId: string; reaction: 'CLAP' | 'CHEER' | 'WAVE' | 'DANCE' }
  | { priority: 'P2'; type: 'SONG_ENDED_APPLAUSE'; setlistItemId: string }
  | { priority: 'P2'; type: 'LIGHTING_CUE'; preset: SetlistItemDTO['lightingPreset'] };

export type RealtimeClientMessage =
  | { type: 'JOIN_ROOM'; roomId: string; userId: string; displayName: string; role: UserRole; avatarPresetId: AvatarPresetId }
  | { type: 'AVATAR_MOVE'; position: [number, number, number]; rotationY: number; animation: AvatarAnimationState; seq: number }
  | { type: 'OCCUPY_SEAT'; seatId: string }
  | { type: 'LEAVE_SEAT' }
  | { type: 'CHAT_SEND'; text: string }
  | { type: 'REACTION_SEND'; reaction: 'CLAP' | 'CHEER' | 'WAVE' | 'DANCE' }
  | { type: 'MIDI_EVENT'; event: MidiNoteEventPayload }
  | { type: 'WEBRTC_SIGNAL'; targetUserId?: string; signal: unknown }
  | { type: 'PERFORMER_CONCERT_CONTROL'; action: 'START_SOUND_CHECK' | 'GO_LIVE' | 'PAUSE' | 'INTERMISSION' | 'NEXT_SONG' | 'END_SONG' | 'COMPLETE' | 'TOGGLE_MODE' };
