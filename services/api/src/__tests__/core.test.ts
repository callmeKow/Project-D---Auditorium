import http from 'node:http';
import { WebSocket } from 'ws';
import { describe, expect, it } from 'vitest';
import {
  createSmallRoomSeats,
  holdSeat,
  occupySeat,
  reserveSeat,
  sweepExpiredHolds,
  toggleSeatLock,
} from '../modules/seating/seating.module.js';
import {
  deleteUserAccount,
  exportUserData,
  registerWithEmail,
} from '../modules/identity/identity.module.js';
import { applyModerationAction, filterChatText } from '../modules/moderation/moderation.module.js';
import { attachRealtimeGateway, clampAuditoriumPosition } from '../modules/realtime/realtime.gateway.js';
import {
  addSetlistItem,
  extractYouTubeVideoId,
  invitePerformerToStage,
  removeSetlistItem,
  reorderSetlist,
  transitionConcertState,
} from '../modules/concert/concert.module.js';
import { createSmallRoom, verifyRoomPasscode } from '../modules/room/room.module.js';
import { canControlConcert } from '../modules/authorization/authorization.module.js';
import { getAnalyticsSummary, recordAnalyticsEvent } from '../modules/analytics/analytics.module.js';

describe('Virtual Music World Core Domain Rules', () => {
  it('enforces 16+ age policy during registration and supports data export/deletion (SEC-16, SEC-18)', () => {
    expect(() =>
      registerWithEmail({
        email: 'minor@test.vn',
        password: 'password123',
        displayName: 'Minor',
        ageConfirmed16Plus: false,
      })
    ).toThrow(/AGE_POLICY_VIOLATION/);

    const { user } = registerWithEmail({
      email: 'listener@test.vn',
      password: 'password123',
      displayName: 'Test Listener',
      ageConfirmed16Plus: true,
    });

    const exported = exportUserData(user.id);
    expect(exported.profile.email).toBe('listener@test.vn');
    deleteUserAccount(user.id);
    expect(() => exportUserData(user.id)).toThrow(/USER_NOT_FOUND/);
  });

  it('enforces seat hold -> occupy -> expiry state machine (AR-08)', () => {
    const seats = createSmallRoomSeats(20);
    expect(seats).toHaveLength(20);

    const t0 = 1_000_000;
    const held = holdSeat(seats, 'A1', 'u1', t0);
    expect(held.state).toBe('HELD');

    expect(() => holdSeat(seats, 'A1', 'u2', t0 + 1000)).toThrow(/SEAT_HELD_BY_OTHER/);

    // Expire after 2 minutes
    const expired = sweepExpiredHolds(seats, t0 + 125_000);
    expect(expired).toHaveLength(1);
    expect(seats[0].state).toBe('AVAILABLE');

    const { occupied } = occupySeat(seats, 'A1', 'u2');
    expect(occupied.state).toBe('OCCUPIED');
    expect(occupied.occupiedByUserId).toBe('u2');
  });

  it('blocks audience avatars from entering the stage unless invited (AR-06, LMR-09)', () => {
    const clampedAudience = clampAuditoriumPosition([0, 0, -2.5], 'AUDIENCE', false);
    expect(clampedAudience[2]).toBeGreaterThanOrEqual(0.8);

    const clampedArtist = clampAuditoriumPosition([0, 0, -2.5], 'ARTIST', false);
    expect(clampedArtist[2]).toBe(-2.5);

    const clampedInvited = clampAuditoriumPosition([0, 0, -2.0], 'AUDIENCE', true);
    expect(clampedInvited[2]).toBe(-2.0);
  });

  it('prevents Host from issuing platform BAN without Admin role (SEC-07)', () => {
    expect(() =>
      applyModerationAction({
        roomId: 'room-1',
        actorRoles: ['HOST'],
        targetUserId: 'u-bad',
        action: 'BAN',
      })
    ).toThrow(/HOST_CANNOT_BAN_REQUIRES_ADMIN/);
  });

  it('validates concert lifecycle, editable setlist, and performer invites (SM-08, LMR-09)', () => {
    const room = createSmallRoom({
      name: 'Test Chamber',
      capacity: 14,
      concertTitle: 'Acoustic Evening',
      genre: 'Acoustic',
      format: 'DUO',
      hostUserId: 'host-1',
      performerName: 'An',
      isSpontaneous: true,
    });

    expect(room.capacity).toBe(14);
    transitionConcertState(room.concert, 'SOUND_CHECK');
    transitionConcertState(room.concert, 'LIVE');
    expect(room.concert.state).toBe('LIVE');

    const added = addSetlistItem(room.concert, { title: 'Second Song', mode: 'PRERECORDED' });
    expect(room.concert.setlist).toHaveLength(2);

    removeSetlistItem(room.concert, added.id);
    expect(room.concert.setlist).toHaveLength(1);
    expect(() => removeSetlistItem(room.concert, room.concert.setlist[0].id)).toThrow(/SETLIST_CANNOT_BE_EMPTY/);

    invitePerformerToStage(room.concert, 'user-duo-2');
    expect(canControlConcert('user-duo-2', ['AUDIENCE'], room.concert)).toBe(true);
    expect(canControlConcert('stranger', ['AUDIENCE'], room.concert)).toBe(false);
  });

  it('tracks analytics events for joins and completions', () => {
    recordAnalyticsEvent({ type: 'ROOM_JOINED', userId: 'u-analytics-1', roomId: 'room-1' });
    recordAnalyticsEvent({ type: 'CONCERT_COMPLETED', userId: 'host-1', roomId: 'room-1' });
    const summary = getAnalyticsSummary(2, 5);
    expect(summary.roomJoins).toBeGreaterThanOrEqual(1);
    expect(summary.concertsCompleted).toBeGreaterThanOrEqual(1);
    expect(summary.activeRooms).toBe(2);
    expect(summary.connectedClients).toBe(5);
  });

  it('handles WebSocket JOIN_ROOM snapshot and seat occupancy (Exp D)', async () => {
    const server = http.createServer();
    attachRealtimeGateway(server);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 4000;

    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const snapshot = await new Promise<{ type: string; room: { id: string } }>((resolve, reject) => {
      ws.on('open', () => {
        ws.send(
          JSON.stringify({
            type: 'JOIN_ROOM',
            roomId: 'room-saigon-chamber',
            userId: 'ws-test-user',
            displayName: 'WS Tester',
            role: 'AUDIENCE',
            avatarPresetId: 'chibi-classic',
          })
        );
      });
      ws.on('message', (raw) => {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'ROOM_SNAPSHOT') resolve(msg);
      });
      ws.on('error', reject);
    });

    expect(snapshot.type).toBe('ROOM_SNAPSHOT');
    expect(snapshot.room.id).toBe('room-saigon-chamber');
    ws.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('enforces PO TBD decisions: birthDate <16, max 1 room/account, private passcode, reserve/lock seats, AI chat filter', () => {
    const minorYear = new Date().getFullYear() - 14;
    expect(() =>
      registerWithEmail({
        email: 'young@test.vn',
        password: 'password123',
        displayName: 'Too Young',
        ageConfirmed16Plus: true,
        birthDate: `${minorYear}-06-01`,
      })
    ).toThrow(/AGE_POLICY_VIOLATION/);

    // Max 1 active room per account (host-1 already created one in earlier test)
    expect(() =>
      createSmallRoom({
        name: 'Second Room',
        capacity: 15,
        concertTitle: 'Blocked Room',
        genre: 'Pop',
        format: 'SOLO',
        hostUserId: 'host-1',
        performerName: 'An',
        isSpontaneous: true,
      })
    ).toThrow(/ROOM_QUOTA_EXCEEDED/);

    const priv = createSmallRoom({
      name: 'Private VIP Jam',
      capacity: 26,
      concertTitle: 'Secret Session',
      genre: 'Jazz',
      format: 'BAND',
      hostUserId: 'host-private-1',
      performerName: 'Jazz Band',
      isSpontaneous: true,
      isPrivate: true,
      passcode: 'SECRET123',
    });
    expect(priv.roomType).toBe('PRIVATE_ROOM');
    expect(priv.capacity).toBe(26);
    expect(verifyRoomPasscode(priv.id, 'SECRET123')).toBe(true);
    expect(verifyRoomPasscode(priv.id, 'WRONG')).toBe(false);

    const reserved = reserveSeat(priv.seats, 'A1', 'u-res');
    expect(reserved.state).toBe('RESERVED');

    const locked = toggleSeatLock(priv.seats, 'A2');
    expect(locked.state).toBe('LOCKED');
    expect(() => holdSeat(priv.seats, 'A2', 'u-res')).toThrow(/SEAT_LOCKED/);

    const filtered = filterChatText('Check this scam link!');
    expect(filtered.flagged).toBe(true);
    expect(filtered.text).toContain('***');

    expect(extractYouTubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(extractYouTubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s')).toBe('dQw4w9WgXcQ');
    expect(extractYouTubeVideoId('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBeUndefined();
    expect(extractYouTubeVideoId('https://youtu.be/dQw4w9WgXcQ')).toBeUndefined();
    expect(extractYouTubeVideoId('https://www.youtube.com/live/dQw4w9WgXcQ')).toBeUndefined();
    expect(extractYouTubeVideoId('https://invalid.example.com/foo')).toBeUndefined();

    expect(() => addSetlistItem(priv.concert, { youtubeUrl: 'https://www.youtube.com/shorts/dQw4w9WgXcQ' })).toThrow(
      /INVALID_YOUTUBE_URL/
    );
    const ytTrack = addSetlistItem(priv.concert, { youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' });
    expect(ytTrack.youtubeVideoId).toBe('dQw4w9WgXcQ');
    expect(ytTrack.mode).toBe('PRERECORDED');
  });

  it('supports KARAOKE Lounge room with U-shaped seats (10-15), public+passcode, and open controls', () => {
    const ktv = createSmallRoom({
      name: 'Saigon KTV Lounge',
      capacity: 12,
      concertTitle: 'Free Singing Night',
      genre: 'Karaoke / V-Pop',
      format: 'DUO',
      venueStyle: 'KARAOKE',
      hostUserId: 'host-ktv-1',
      performerName: 'Open Mic',
      isSpontaneous: true,
      isPrivate: false,
      passcode: '8888',
    });

    expect(ktv.venueStyle).toBe('KARAOKE');
    expect(ktv.capacity).toBe(12);
    expect(ktv.seats).toHaveLength(12);
    expect(ktv.seats.some((s) => s.row === 'L')).toBe(true);
    expect(ktv.seats.some((s) => s.row === 'C')).toBe(true);
    expect(ktv.seats.some((s) => s.row === 'R')).toBe(true);
    expect(ktv.hasPasscode).toBe(true);
    expect(verifyRoomPasscode(ktv.id, '8888')).toBe(true);
    expect(canControlConcert('random-guest', ['AUDIENCE'], ktv.concert, 'KARAOKE')).toBe(true);

    const s2 = addSetlistItem(ktv.concert, { title: 'Second KTV Track', mode: 'PRERECORDED' });
    const s3 = addSetlistItem(ktv.concert, { title: 'Third KTV Track', mode: 'PRERECORDED' });
    ktv.concert.currentSetlistIndex = 1; // Playing s2
    reorderSetlist(ktv.concert, [s3.id, s2.id, ktv.concert.setlist[0].id]);
    expect(ktv.concert.setlist.map((s) => s.id)).toEqual([s3.id, s2.id, ktv.concert.setlist[2].id]);
    expect(ktv.concert.currentSetlistIndex).toBe(1);
    reorderSetlist(ktv.concert, [s2.id, s3.id, ktv.concert.setlist[2].id]);
    expect(ktv.concert.currentSetlistIndex).toBe(0);
  });
});
