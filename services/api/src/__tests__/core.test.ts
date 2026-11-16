import { describe, expect, it } from 'vitest';
import { createSmallRoomSeats, holdSeat, occupySeat, sweepExpiredHolds } from '../modules/seating/seating.module.js';
import { registerWithEmail } from '../modules/identity/identity.module.js';
import { applyModerationAction } from '../modules/moderation/moderation.module.js';
import { clampAuditoriumPosition } from '../modules/realtime/realtime.gateway.js';

describe('Virtual Music World Core Domain Rules', () => {
  it('enforces 16+ age policy during registration (SEC-18)', () => {
    expect(() =>
      registerWithEmail({
        email: 'minor@test.vn',
        password: 'password123',
        displayName: 'Minor',
        ageConfirmed16Plus: false,
      })
    ).toThrow(/AGE_POLICY_VIOLATION/);
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

  it('blocks audience avatars from entering the stage (AR-06)', () => {
    const clampedAudience = clampAuditoriumPosition([0, 0, -2.5], 'AUDIENCE');
    expect(clampedAudience[2]).toBeGreaterThanOrEqual(0.8);

    const clampedArtist = clampAuditoriumPosition([0, 0, -2.5], 'ARTIST');
    expect(clampedArtist[2]).toBe(-2.5);
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
});
