import crypto from 'node:crypto';
import type { ConcertDTO, PerformanceFormat, RoomDTO, RoomState, VenueStyle } from '@vmw/contracts';
import { createSmallRoomSeats } from '../seating/seating.module.js';
import { loadSnapshot, saveSnapshot } from '../../infrastructure/persistence.js';

const rooms = new Map<string, RoomDTO>();
const roomPasscodes = new Map<string, string>(); // roomId -> passcode (never leaked in RoomDTO)
const MAX_ACTIVE_ROOMS_PER_USER = 1; // TBD-03 PO Decision

function seedInitialRooms() {
  const snapshot = loadSnapshot();
  if (snapshot?.rooms && Array.isArray(snapshot.rooms) && snapshot.rooms.length > 0) {
    for (const r of snapshot.rooms as RoomDTO[]) {
      r.memberCount = 0; // Reset live socket count on server boot
      r.venueStyle = r.venueStyle ?? 'CHAMBER';
      r.concert.invitedPerformerIds = r.concert.invitedPerformerIds ?? [];
      rooms.set(r.id, r);
    }
    return;
  }

  const room1: RoomDTO = {
    id: 'room-saigon-chamber',
    code: 'VMW-01',
    name: 'Saigon Warm Chamber Hall',
    roomType: 'SMALL_ROOM',
    venueStyle: 'CHAMBER',
    capacity: 20,
    state: 'ACTIVE',
    memberCount: 0,
    seats: createSmallRoomSeats(20),
    concert: {
      id: 'concert-acoustic-night',
      roomId: 'room-saigon-chamber',
      title: 'Đêm Nhạc Thính Phòng & Piano Live',
      genre: 'Classical / Acoustic',
      format: 'SOLO',
      hostUserId: 'user-artist-1',
      performerName: 'Linh Piano',
      invitedPerformerIds: [],
      scheduledAt: new Date(Date.now() + 15 * 60_000).toISOString(),
      state: 'LIVE',
      currentSetlistIndex: 0,
      isSpontaneous: false,
      trackPlaying: true,
      trackStartedAtServerMs: Date.now(),
      trackPausedAtSec: 0,
      setlist: [
        {
          id: 'song-1',
          title: 'River Flows in Saigon (Live Piano)',
          artistName: 'Linh Piano',
          durationSec: 210,
          mode: 'LIVE',
          lightingPreset: 'WARM_CHAMBER',
        },
        {
          id: 'song-2',
          title: 'Nocturne in E-flat (MIDI + Audio)',
          artistName: 'Linh Piano',
          durationSec: 245,
          mode: 'LIVE',
          lightingPreset: 'SPOTLIGHT_SOLO',
        },
        {
          id: 'song-3',
          title: 'Encore: Autumn Rain (Prerecorded Backing)',
          artistName: 'Linh Piano',
          durationSec: 180,
          mode: 'PRERECORDED',
          lightingPreset: 'ENCORE_GOLD',
        },
      ],
    },
  };

  const room2: RoomDTO = {
    id: 'room-indie-jam',
    code: 'VMW-02',
    name: 'Hanoi Live Concert Arena',
    roomType: 'SMALL_ROOM',
    venueStyle: 'CONCERT',
    capacity: 20,
    state: 'OPEN',
    memberCount: 0,
    seats: createSmallRoomSeats(20),
    concert: {
      id: 'concert-indie-jam',
      roomId: 'room-indie-jam',
      title: 'Neon Beat & Band Live Concert Party',
      genre: 'Pop / Rock / Electronic',
      format: 'BAND',
      hostUserId: 'user-artist-1',
      performerName: 'Hanoi Neon Band',
      invitedPerformerIds: [],
      scheduledAt: new Date(Date.now() + 60 * 60_000).toISOString(),
      state: 'LIVE',
      currentSetlistIndex: 0,
      isSpontaneous: true,
      trackPlaying: true,
      trackStartedAtServerMs: Date.now(),
      trackPausedAtSec: 0,
      setlist: [
        {
          id: 'song-2-1',
          title: 'Electric Night (Beat-Synced Stage)',
          artistName: 'Hanoi Neon Band',
          durationSec: 210,
          mode: 'LIVE',
          lightingPreset: 'DYNAMIC_CONCERT',
        },
      ],
    },
  };

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(20, 0, 0, 0);

  const room3: RoomDTO = {
    id: 'room-dalat-strings',
    code: 'VMW-03',
    name: 'Dalat Pine Strings Salon',
    roomType: 'SMALL_ROOM',
    venueStyle: 'CHAMBER',
    capacity: 18,
    state: 'OPEN',
    memberCount: 0,
    seats: createSmallRoomSeats(18),
    concert: {
      id: 'concert-dalat-strings',
      roomId: 'room-dalat-strings',
      title: 'Evening Violin & Chamber Quartet',
      genre: 'Classical / Chamber',
      format: 'ORCHESTRA',
      hostUserId: 'user-artist-1',
      performerName: 'Dalat Chamber Ensemble',
      invitedPerformerIds: [],
      scheduledAt: tomorrow.toISOString(),
      state: 'SCHEDULED',
      currentSetlistIndex: 0,
      isSpontaneous: false,
      setlist: [
        {
          id: 'song-3-1',
          title: 'Four Seasons — Autumn Movement I',
          artistName: 'Dalat Chamber Ensemble',
          durationSec: 270,
          mode: 'LIVE',
          lightingPreset: 'WARM_CHAMBER',
        },
        {
          id: 'song-3-2',
          title: 'Serenade for Strings',
          artistName: 'Dalat Chamber Ensemble',
          durationSec: 240,
          mode: 'LIVE',
          lightingPreset: 'SPOTLIGHT_SOLO',
        },
      ],
    },
  };

  rooms.set(room1.id, room1);
  rooms.set(room2.id, room2);
  rooms.set(room3.id, room3);
}

export function persistRooms() {
  saveSnapshot({ rooms: Array.from(rooms.values()) });
}

seedInitialRooms();

export function listRooms(): RoomDTO[] {
  return Array.from(rooms.values()).filter((r) => !r.isPrivate);
}

export function listAllRoomsIncludingPrivate(): RoomDTO[] {
  return Array.from(rooms.values());
}

export function verifyRoomPasscode(roomId: string, passcode?: string): boolean {
  const expected = roomPasscodes.get(roomId);
  if (!expected) return true;
  return (passcode ?? '').trim() === expected;
}

export function getRoomById(roomId: string): RoomDTO | undefined {
  return rooms.get(roomId);
}

export function getRoomByCode(code: string): RoomDTO | undefined {
  const normalized = code.trim().toUpperCase();
  for (const room of rooms.values()) {
    if (room.code.toUpperCase() === normalized) return room;
  }
  return undefined;
}

export function setRoomState(roomId: string, nextState: RoomState): RoomDTO {
  const room = rooms.get(roomId);
  if (!room) throw new Error('ROOM_NOT_FOUND');
  room.state = nextState;
  persistRooms();
  return room;
}

export function createSmallRoom(params: {
  name: string;
  capacity: number;
  concertTitle: string;
  genre: string;
  format: PerformanceFormat;
  venueStyle?: VenueStyle;
  hostUserId: string;
  performerName: string;
  isSpontaneous: boolean;
  isPrivate?: boolean;
  passcode?: string;
}): RoomDTO {
  // TBD-03: Max 1 active room per account
  const activeOwned = Array.from(rooms.values()).filter(
    (r) => r.concert.hostUserId === params.hostUserId && r.state !== 'CLOSED' && r.state !== 'CLOSING'
  );
  if (activeOwned.length >= MAX_ACTIVE_ROOMS_PER_USER) {
    throw new Error('ROOM_QUOTA_EXCEEDED: Each account may host at most 1 active room (TBD-03).');
  }

  const isPrivate = Boolean(params.isPrivate);
  const maxCap = isPrivate ? 30 : 20; // TBD-02: Private Room 10-30, Small Room 10-20
  const clampedCapacity = Math.min(maxCap, Math.max(10, params.capacity || 20));
  const id = `room-${crypto.randomUUID().slice(0, 8)}`;
  const code = `VMW-${Math.floor(10 + Math.random() * 89)}`;

  const venueStyle: VenueStyle = params.venueStyle === 'CONCERT' ? 'CONCERT' : 'CHAMBER';
  const defaultLighting = venueStyle === 'CONCERT' ? 'DYNAMIC_CONCERT' : 'WARM_CHAMBER';

  const concert: ConcertDTO = {
    id: `concert-${crypto.randomUUID().slice(0, 8)}`,
    roomId: id,
    title: params.concertTitle.trim() || (venueStyle === 'CONCERT' ? 'Live Concert Party' : 'Live Chamber Session'),
    genre: params.genre.trim() || (venueStyle === 'CONCERT' ? 'Pop / Electronic' : 'Classical / Ballad'),
    format: params.format,
    hostUserId: params.hostUserId,
    performerName: params.performerName,
    invitedPerformerIds: [],
    scheduledAt: new Date().toISOString(),
    state: 'PREPARING',
    currentSetlistIndex: 0,
    isSpontaneous: params.isSpontaneous,
    setlist: [
      {
        id: `song-${crypto.randomUUID().slice(0, 6)}`,
        title: 'Opening Piece (Live)',
        artistName: params.performerName,
        durationSec: 200,
        mode: 'LIVE',
        lightingPreset: defaultLighting,
      },
    ],
  };

  const room: RoomDTO = {
    id,
    code,
    name: params.name.trim() || (isPrivate ? 'Private Auditorium' : venueStyle === 'CONCERT' ? 'Concert Stage' : 'Chamber Hall'),
    roomType: isPrivate ? 'PRIVATE_ROOM' : 'SMALL_ROOM',
    venueStyle,
    capacity: clampedCapacity,
    isPrivate,
    state: 'OPEN',
    memberCount: 0,
    seats: createSmallRoomSeats(clampedCapacity),
    concert,
  };

  if (isPrivate && params.passcode?.trim()) {
    roomPasscodes.set(room.id, params.passcode.trim());
  }

  rooms.set(room.id, room);
  persistRooms();
  return room;
}
