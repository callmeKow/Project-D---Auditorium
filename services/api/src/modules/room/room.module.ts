import crypto from 'node:crypto';
import type { ConcertDTO, PerformanceFormat, RoomDTO } from '@vmw/contracts';
import { createSmallRoomSeats } from '../seating/seating.module.js';

const rooms = new Map<string, RoomDTO>();

function seedInitialRooms() {
  const room1: RoomDTO = {
    id: 'room-saigon-chamber',
    code: 'VMW-01',
    name: 'Saigon Warm Chamber Hall',
    roomType: 'SMALL_ROOM',
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
      scheduledAt: new Date(Date.now() + 15 * 60_000).toISOString(),
      state: 'LIVE',
      currentSetlistIndex: 0,
      isSpontaneous: false,
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
    name: 'Hanoi Indie Acoustic Lounge',
    roomType: 'SMALL_ROOM',
    capacity: 16,
    state: 'OPEN',
    memberCount: 0,
    seats: createSmallRoomSeats(16),
    concert: {
      id: 'concert-indie-jam',
      roomId: 'room-indie-jam',
      title: 'Guitar & Cello Duo Session',
      genre: 'Acoustic / Jazz',
      format: 'DUO',
      hostUserId: 'user-artist-1',
      performerName: 'Minh Guitar & An Cello',
      scheduledAt: new Date(Date.now() + 60 * 60_000).toISOString(),
      state: 'SOUND_CHECK',
      currentSetlistIndex: 0,
      isSpontaneous: true,
      setlist: [
        {
          id: 'song-2-1',
          title: 'Bossa Nova Evening',
          artistName: 'Minh & An',
          durationSec: 195,
          mode: 'LIVE',
          lightingPreset: 'DYNAMIC_CONCERT',
        },
      ],
    },
  };

  rooms.set(room1.id, room1);
  rooms.set(room2.id, room2);
}

seedInitialRooms();

export function listRooms(): RoomDTO[] {
  return Array.from(rooms.values());
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

export function createSmallRoom(params: {
  name: string;
  capacity: number;
  concertTitle: string;
  genre: string;
  format: PerformanceFormat;
  hostUserId: string;
  performerName: string;
  isSpontaneous: boolean;
}): RoomDTO {
  const clampedCapacity = Math.min(20, Math.max(10, params.capacity || 20)); // Small Room MVP: 10-20
  const id = `room-${crypto.randomUUID().slice(0, 8)}`;
  const code = `VMW-${Math.floor(10 + Math.random() * 89)}`;

  const concert: ConcertDTO = {
    id: `concert-${crypto.randomUUID().slice(0, 8)}`,
    roomId: id,
    title: params.concertTitle.trim() || 'Live Chamber Session',
    genre: params.genre.trim() || 'Acoustic',
    format: params.format,
    hostUserId: params.hostUserId,
    performerName: params.performerName,
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
        lightingPreset: 'WARM_CHAMBER',
      },
    ],
  };

  const room: RoomDTO = {
    id,
    code,
    name: params.name.trim() || 'Small Auditorium',
    roomType: 'SMALL_ROOM',
    capacity: clampedCapacity,
    state: 'OPEN',
    memberCount: 0,
    seats: createSmallRoomSeats(clampedCapacity),
    concert,
  };

  rooms.set(room.id, room);
  return room;
}
