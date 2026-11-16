import type { SeatDTO, SeatTier } from '@vmw/contracts';

const HOLD_DURATION_MS = 120_000;

export function createSmallRoomSeats(capacity = 20): SeatDTO[] {
  const seats: SeatDTO[] = [];
  const rows = ['A', 'B', 'C', 'D', 'E'];
  const seatsPerRow = capacity <= 20 ? Math.ceil(capacity / 4) : Math.ceil(capacity / rows.length);

  for (let r = 0; r < rows.length && seats.length < capacity; r++) {
    const rowLabel = rows[r];
    // TBD-05: Free positional tiers only (Front Row, Standard, Balcony)
    const tier: SeatTier = r === 0 ? 'FRONT_ROW' : r >= 3 ? 'BALCONY' : 'STANDARD';
    for (let s = 1; s <= seatsPerRow && seats.length < capacity; s++) {
      const half = Math.ceil(seatsPerRow / 2);
      const xOffset = s <= half ? (s - half - 0.6) * 1.35 : (s - half - 0.4) * 1.35;
      const zOffset = 1.5 + r * 1.75;
      const yOffset = r >= 3 ? 0.45 : r * 0.12;

      seats.push({
        id: `${rowLabel}${s}`,
        row: rowLabel,
        number: s,
        tier,
        state: 'AVAILABLE',
        position: [Number(xOffset.toFixed(2)), Number(yOffset.toFixed(2)), Number(zOffset.toFixed(2))],
      });
    }
  }
  return seats;
}

export function sweepExpiredHolds(seats: SeatDTO[], now = Date.now()): SeatDTO[] {
  const changed: SeatDTO[] = [];
  for (const seat of seats) {
    if (seat.state === 'HELD' && seat.holdExpiresAt && seat.holdExpiresAt <= now) {
      seat.state = 'AVAILABLE';
      seat.heldByUserId = undefined;
      seat.holdExpiresAt = undefined;
      changed.push(seat);
    }
  }
  return changed;
}

export function holdSeat(seats: SeatDTO[], seatId: string, userId: string, now = Date.now()): SeatDTO {
  sweepExpiredHolds(seats, now);
  const seat = seats.find((s) => s.id === seatId);
  if (!seat) throw new Error('SEAT_NOT_FOUND');
  if (seat.state === 'LOCKED') throw new Error('SEAT_LOCKED');

  if (seat.state === 'OCCUPIED' && seat.occupiedByUserId !== userId) {
    throw new Error('SEAT_OCCUPIED');
  }
  if (seat.state === 'RESERVED' && seat.heldByUserId !== userId) {
    throw new Error('SEAT_RESERVED_BY_OTHER');
  }
  if (seat.state === 'HELD' && seat.heldByUserId !== userId) {
    throw new Error('SEAT_HELD_BY_OTHER');
  }

  for (const s of seats) {
    if (s.id !== seatId && s.heldByUserId === userId && s.state === 'HELD') {
      s.state = 'AVAILABLE';
      s.heldByUserId = undefined;
      s.holdExpiresAt = undefined;
    }
  }

  seat.state = 'HELD';
  seat.heldByUserId = userId;
  seat.holdExpiresAt = now + HOLD_DURATION_MS;
  return seat;
}

// TBD-04: Advance seat reservation for Scheduled Concerts
export function reserveSeat(seats: SeatDTO[], seatId: string, userId: string, now = Date.now()): SeatDTO {
  sweepExpiredHolds(seats, now);
  const seat = seats.find((s) => s.id === seatId);
  if (!seat) throw new Error('SEAT_NOT_FOUND');
  if (seat.state === 'LOCKED') throw new Error('SEAT_LOCKED');
  if (seat.state === 'OCCUPIED' && seat.occupiedByUserId !== userId) throw new Error('SEAT_OCCUPIED');
  if ((seat.state === 'HELD' || seat.state === 'RESERVED') && seat.heldByUserId !== userId) {
    throw new Error('SEAT_UNAVAILABLE');
  }

  // Release user's previous reservation/hold in the same room
  for (const s of seats) {
    if (s.id !== seatId && s.heldByUserId === userId && (s.state === 'HELD' || s.state === 'RESERVED')) {
      s.state = 'AVAILABLE';
      s.heldByUserId = undefined;
      s.holdExpiresAt = undefined;
    }
  }

  seat.state = 'RESERVED';
  seat.heldByUserId = userId;
  seat.holdExpiresAt = undefined;
  return seat;
}

// TBD-12: Host/Admin can lock or unlock an individual seat
export function toggleSeatLock(seats: SeatDTO[], seatId: string): SeatDTO {
  const seat = seats.find((s) => s.id === seatId);
  if (!seat) throw new Error('SEAT_NOT_FOUND');
  if (seat.state === 'LOCKED') {
    seat.state = 'AVAILABLE';
  } else {
    seat.state = 'LOCKED';
    seat.occupiedByUserId = undefined;
    seat.heldByUserId = undefined;
    seat.holdExpiresAt = undefined;
  }
  return seat;
}

export function occupySeat(seats: SeatDTO[], seatId: string, userId: string): { occupied: SeatDTO; released: SeatDTO[] } {
  sweepExpiredHolds(seats);
  const seat = seats.find((s) => s.id === seatId);
  if (!seat) throw new Error('SEAT_NOT_FOUND');
  if (seat.state === 'LOCKED') throw new Error('SEAT_LOCKED');

  if (seat.state === 'OCCUPIED' && seat.occupiedByUserId !== userId) {
    throw new Error('SEAT_OCCUPIED');
  }
  if ((seat.state === 'HELD' || seat.state === 'RESERVED') && seat.heldByUserId !== userId) {
    throw new Error('SEAT_HELD_BY_OTHER');
  }

  const released = releaseUserSeats(seats, userId, seatId);
  seat.state = 'OCCUPIED';
  seat.occupiedByUserId = userId;
  seat.heldByUserId = undefined;
  seat.holdExpiresAt = undefined;

  return { occupied: seat, released };
}

export function releaseUserSeats(seats: SeatDTO[], userId: string, exceptSeatId?: string): SeatDTO[] {
  const released: SeatDTO[] = [];
  for (const seat of seats) {
    if (seat.id === exceptSeatId) continue;
    if (seat.occupiedByUserId === userId || (seat.state === 'HELD' && seat.heldByUserId === userId)) {
      seat.state = 'AVAILABLE';
      seat.occupiedByUserId = undefined;
      seat.heldByUserId = undefined;
      seat.holdExpiresAt = undefined;
      released.push(seat);
    }
  }
  return released;
}
