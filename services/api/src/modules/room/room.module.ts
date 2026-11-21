import crypto from 'node:crypto';
import type { ConcertDTO, PerformanceFormat, RoomDTO, RoomState, VenueStyle } from '@vmw/contracts';
import { createKaraokeLoungeSeats, createSmallRoomSeats } from '../seating/seating.module.js';
import { loadSnapshot, saveSnapshot } from '../../infrastructure/persistence.js';

const rooms = new Map<string, RoomDTO>();
const roomPasscodes = new Map<string, string>(); // roomId -> passcode (never leaked in RoomDTO)
const roomCreators = new Map<string, string>(); // roomId -> creator userId (for TBD-03 quota even when public room has no Host)
const MAX_ACTIVE_ROOMS_PER_USER = 1; // TBD-03 PO Decision

function createSeededChamberRoom(): RoomDTO {
  return {
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
      hostUserId: '', // Public Chamber room requires no Host
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
}

function createSeededConcertRoom(): RoomDTO {
  return {
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
}

function createSeededKaraokeRoom(): RoomDTO {
  return {
    id: 'room-saigon-ktv',
    code: 'VMW-04',
    name: 'Saigon Neon Karaoke Lounge',
    roomType: 'SMALL_ROOM',
    venueStyle: 'KARAOKE',
    capacity: 12,
    state: 'OPEN',
    memberCount: 0,
    seats: createKaraokeLoungeSeats(12),
    concert: {
      id: 'concert-saigon-ktv',
      roomId: 'room-saigon-ktv',
      title: 'Hát Cho Nhau Nghe • Đêm Nhạc Tự Do Karaoke',
      genre: 'Karaoke / Ballad / V-Pop',
      format: 'DUO',
      hostUserId: '', // Public Karaoke room requires no Host
      performerName: 'Cả Phòng Hát Tự Do',
      invitedPerformerIds: [],
      scheduledAt: new Date().toISOString(),
      state: 'PREPARING',
      currentSetlistIndex: 0,
      isSpontaneous: true,
      trackPlaying: false,
      trackStartedAtServerMs: undefined,
      trackPausedAtSec: 0,
      setlist: [
        {
          id: 'song-ktv-1',
          title: 'Khúc Hát Mở Màn Karaoke (Tự thêm link YouTube ở tab Playlist)',
          artistName: 'Mở Tự Do',
          durationSec: 240,
          mode: 'LIVE',
          lightingPreset: 'KTV_PARTY',
        },
        {
          id: 'song-ktv-2',
          title: 'Song Ca Acoustic Ballad (Thử Echo & Reverb)',
          artistName: 'Mở Tự Do',
          durationSec: 220,
          mode: 'PRERECORDED',
          lightingPreset: 'WARM_CHAMBER',
        },
      ],
    },
  };
}

function seedInitialRooms() {
  const snapshot = loadSnapshot();
  if (snapshot?.passcodes && typeof snapshot.passcodes === 'object') {
    for (const [rid, code] of Object.entries(snapshot.passcodes)) {
      if (typeof code === 'string' && code.trim()) {
        roomPasscodes.set(rid, code.trim());
      }
    }
  }

  let hydratedFromSnapshot = false;
  if (snapshot?.rooms && Array.isArray(snapshot.rooms) && snapshot.rooms.length > 0) {
    hydratedFromSnapshot = true;
    for (const r of snapshot.rooms as RoomDTO[]) {
      r.memberCount = 0; // Reset live socket count on server boot
      r.venueStyle = r.venueStyle ?? 'CHAMBER';
      r.hasPasscode = Boolean(roomPasscodes.has(r.id) || r.hasPasscode);
      r.concert.invitedPerformerIds = r.concert.invitedPerformerIds ?? [];
      if (r.id === 'room-saigon-ktv') {
        r.name = r.name.replace(/\bKTV\b/g, 'Karaoke');
        r.concert.title = r.concert.title.replace(/\bKTV\b/g, 'Karaoke');
        for (const s of r.concert.setlist) {
          s.title = s.title.replace(/\bKTV\b/g, 'Karaoke');
        }
      }
      rooms.set(r.id, r);
    }
  }

  let addedMissing = false;
  if (!hydratedFromSnapshot) {
    const room1 = createSeededChamberRoom();
    const room2 = createSeededConcertRoom();

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

  const all = Array.from(rooms.values());
  if (!all.some((r) => r.venueStyle === 'CHAMBER')) {
    const r = createSeededChamberRoom();
    rooms.set(r.id, r);
    addedMissing = true;
  }
  if (!all.some((r) => r.venueStyle === 'CONCERT')) {
    const r = createSeededConcertRoom();
    rooms.set(r.id, r);
    addedMissing = true;
  }
  if (!all.some((r) => r.venueStyle === 'KARAOKE')) {
    const r = createSeededKaraokeRoom();
    rooms.set(r.id, r);
    addedMissing = true;
  }

  if (hydratedFromSnapshot && addedMissing) {
    persistRooms();
  }
}

export function persistRooms() {
  saveSnapshot({
    rooms: Array.from(rooms.values()),
    passcodes: Object.fromEntries(roomPasscodes.entries()),
  });
}

export function rehydrateRoomsFromPersistence() {
  rooms.clear();
  roomPasscodes.clear();
  seedInitialRooms();
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
    (r) =>
      (r.concert.hostUserId === params.hostUserId || roomCreators.get(r.id) === params.hostUserId) &&
      r.state !== 'CLOSED' &&
      r.state !== 'CLOSING'
  );
  if (activeOwned.length >= MAX_ACTIVE_ROOMS_PER_USER) {
    throw new Error('ROOM_QUOTA_EXCEEDED: Each account may host at most 1 active room (TBD-03).');
  }

  const isPrivate = Boolean(params.isPrivate);
  const cleanPasscode = params.passcode?.trim() ?? '';
  const hasPasscode = cleanPasscode.length > 0;
  const venueStyle: VenueStyle =
    params.venueStyle === 'CONCERT' ? 'CONCERT' : params.venueStyle === 'KARAOKE' ? 'KARAOKE' : 'CHAMBER';
  const isKaraoke = venueStyle === 'KARAOKE';

  const maxCap = isKaraoke ? 15 : isPrivate ? 30 : 20; // TBD-02: Private 10-30, Small Room 10-20, Karaoke 10-15
  const clampedCapacity = Math.min(maxCap, Math.max(10, params.capacity || (isKaraoke ? 12 : 20)));
  const id = `room-${crypto.randomUUID().slice(0, 8)}`;
  const code = `VMW-${Math.floor(10 + Math.random() * 89)}`;

  const defaultLighting =
    venueStyle === 'CONCERT' ? 'DYNAMIC_CONCERT' : isKaraoke ? 'KTV_PARTY' : 'WARM_CHAMBER';
  // Public Karaoke & Public Chamber rooms have no Host; Private rooms (and Concert) assign creator as sole Host
  const requiresHost = isPrivate || venueStyle === 'CONCERT';

  const concert: ConcertDTO = {
    id: `concert-${crypto.randomUUID().slice(0, 8)}`,
    roomId: id,
    title:
      params.concertTitle.trim() ||
      (venueStyle === 'CONCERT'
        ? 'Live Concert Party'
        : isKaraoke
          ? 'Hát Cho Nhau Nghe • Karaoke Tự Do'
          : 'Live Chamber Session'),
    genre:
      params.genre.trim() ||
      (venueStyle === 'CONCERT'
        ? 'Pop / Electronic'
        : isKaraoke
          ? 'Karaoke / Ballad / V-Pop'
          : 'Classical / Ballad'),
    format: params.format,
    hostUserId: requiresHost ? params.hostUserId : '',
    performerName: params.performerName,
    invitedPerformerIds: [],
    scheduledAt: new Date().toISOString(),
    state: 'PREPARING',
    currentSetlistIndex: 0,
    isSpontaneous: params.isSpontaneous,
    trackPlaying: false,
    trackStartedAtServerMs: undefined,
    trackPausedAtSec: 0,
    setlist: [
      {
        id: `song-${crypto.randomUUID().slice(0, 6)}`,
        title: isKaraoke ? 'Khúc Hát Mở Màn Karaoke (Tự chọn bài YouTube)' : 'Opening Piece (Live)',
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
    name:
      params.name.trim() ||
      (isPrivate
        ? isKaraoke
          ? 'Private Karaoke Lounge'
          : 'Private Auditorium'
        : venueStyle === 'CONCERT'
          ? 'Concert Stage'
          : isKaraoke
            ? 'Neon Karaoke Lounge'
            : 'Chamber Hall'),
    roomType: isPrivate ? 'PRIVATE_ROOM' : 'SMALL_ROOM',
    venueStyle,
    capacity: clampedCapacity,
    isPrivate,
    hasPasscode,
    state: 'OPEN',
    memberCount: 0,
    seats: isKaraoke ? createKaraokeLoungeSeats(clampedCapacity) : createSmallRoomSeats(clampedCapacity),
    concert,
  };

  if (hasPasscode) {
    roomPasscodes.set(room.id, cleanPasscode);
  }

  rooms.set(room.id, room);
  roomCreators.set(room.id, params.hostUserId);
  persistRooms();
  return room;
}
