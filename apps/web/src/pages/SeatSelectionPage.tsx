import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Armchair, ArrowRight, BookmarkCheck, Clock, Sparkles } from 'lucide-react';
import type { RoomDTO, SeatDTO } from '@vmw/contracts';
import { apiClient } from '../api/client';
import { useAuth } from '../state/authStore';

const TIER_LABEL: Record<string, string> = {
  FRONT_ROW: 'Front Row',
  PREMIUM: 'Standard',
  STANDARD: 'Standard',
  BALCONY: 'Balcony Riser',
  VIP: 'VIP',
};

export function SeatSelectionPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const passcode = (location.state as { passcode?: string } | null)?.passcode;
  const [room, setRoom] = useState<RoomDTO | null>(null);
  const [selectedSeat, setSelectedSeat] = useState<SeatDTO | null>(null);
  const [nowMs, setNowMs] = useState(Date.now());
  const [error, setError] = useState<string | null>(null);

  const effectiveUserId = user?.id ?? 'guest-listener';

  useEffect(() => {
    if (!roomId) return;
    apiClient.getRoom(roomId).then(setRoom).catch((e) => setError(e.message));
  }, [roomId]);

  useEffect(() => {
    if (!selectedSeat?.holdExpiresAt) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [selectedSeat?.holdExpiresAt]);

  const handleHoldSeat = async (seat: SeatDTO) => {
    if (!roomId) return;
    setError(null);
    try {
      const updated = await apiClient.holdSeat(roomId, seat.id, effectiveUserId);
      setSelectedSeat(updated);
      setNowMs(Date.now());
      setRoom((prev) =>
        prev
          ? {
              ...prev,
              seats: prev.seats.map((s) =>
                s.id === updated.id
                  ? updated
                  : s.heldByUserId === effectiveUserId && s.state === 'HELD'
                    ? { ...s, state: 'AVAILABLE', heldByUserId: undefined, holdExpiresAt: undefined }
                    : s
              ),
            }
          : prev
      );
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleReserveSeat = async () => {
    if (!roomId || !selectedSeat) return;
    setError(null);
    try {
      const reserved = await apiClient.reserveSeat(roomId, selectedSeat.id, effectiveUserId);
      setSelectedSeat(reserved);
      setRoom((prev) =>
        prev ? { ...prev, seats: prev.seats.map((s) => (s.id === reserved.id ? reserved : s)) } : prev
      );
    } catch (err) {
      setError((err as Error).message);
    }
  };

  if (!room) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12 text-center text-sm text-stone-400">
        Loading 2D Auditorium Seat Map...
      </div>
    );
  }

  const rows = ['A', 'B', 'C', 'D', 'E'];
  const holdRemainingSec =
    selectedSeat?.holdExpiresAt ? Math.max(0, Math.ceil((selectedSeat.holdExpiresAt - nowMs) / 1000)) : 0;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-amber-400">
            <Sparkles className="h-3.5 w-3.5" /> 2D Seat Selection (UX-06)
          </span>
          <h1 className="mt-1 text-2xl font-extrabold text-white">{room.concert.title}</h1>
          <p className="text-sm text-stone-400">
            {room.name} ({room.capacity} seats) • Performer:{' '}
            <span className="font-medium text-amber-300">{room.concert.performerName}</span>
          </p>
        </div>

        <button
          onClick={() =>
            navigate(`/room/${room.id}`, {
              state: { seatId: selectedSeat?.id, passcode },
            })
          }
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 px-5 py-3 text-sm font-bold text-stone-950 shadow-lg shadow-amber-500/20 transition hover:brightness-110"
        >
          {selectedSeat ? `Enter 3D Room (Seat ${selectedSeat.id})` : 'Enter 3D Room (Walk-in)'}
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>

      {/* Hold / Advance Reservation Banner (TBD-04) */}
      {selectedSeat && (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-200">
          <div className="flex items-center gap-2">
            <Armchair className="h-4 w-4 text-amber-400" />
            <span>
              Seat <strong>{selectedSeat.id}</strong> ({TIER_LABEL[selectedSeat.tier] ?? selectedSeat.tier} • Free) is{' '}
              <strong>{selectedSeat.state === 'RESERVED' ? 'Reserved for this concert' : 'temporarily held'}</strong>.
            </span>
          </div>
          <div className="flex items-center gap-3">
            {selectedSeat.state === 'HELD' && holdRemainingSec > 0 && (
              <span className="inline-flex items-center gap-1 font-mono font-semibold text-amber-300">
                <Clock className="h-3.5 w-3.5" />
                {Math.floor(holdRemainingSec / 60)}:{String(holdRemainingSec % 60).padStart(2, '0')}
              </span>
            )}
            {selectedSeat.state !== 'RESERVED' && (
              <button
                onClick={handleReserveSeat}
                className="inline-flex items-center gap-1 rounded-lg bg-amber-500 px-3 py-1 font-bold text-stone-950 hover:bg-amber-400"
              >
                <BookmarkCheck className="h-3.5 w-3.5" /> Confirm Advance Reservation
              </button>
            )}
          </div>
        </div>
      )}

      {/* 2D Auditorium Map */}
      <div className="mt-6 rounded-2xl border border-stone-800/90 bg-stone-900/80 p-6 shadow-xl sm:p-8">
        {/* Stage Arch */}
        <div className="mx-auto mb-8 max-w-md rounded-b-3xl border border-amber-500/30 bg-gradient-to-b from-amber-950/50 to-stone-950/60 py-3 text-center shadow-inner">
          <div className="text-[10px] font-semibold uppercase tracking-[0.25em] text-amber-400/80">Proscenium Stage</div>
          <div className="mt-0.5 text-xs font-bold text-amber-200">{room.concert.performerName.toUpperCase()}</div>
        </div>

        {/* Rows with Central Aisle */}
        <div className="space-y-3.5">
          {rows.map((row) => {
            const rowSeats = room.seats.filter((s) => s.row === row);
            if (rowSeats.length === 0) return null;
            const half = Math.ceil(rowSeats.length / 2);
            const leftSeats = rowSeats.slice(0, half);
            const rightSeats = rowSeats.slice(half);
            const tierName = TIER_LABEL[rowSeats[0].tier] ?? rowSeats[0].tier;

            return (
              <div key={row} className="flex items-center justify-center gap-3">
                <span className="w-24 text-right text-[11px] font-medium text-stone-500">
                  Row {row} • {tierName}
                </span>

                <div className="flex items-center gap-2">
                  {leftSeats.map((seat) => {
                    const isMine = selectedSeat?.id === seat.id || seat.heldByUserId === effectiveUserId;
                    const unavailable =
                      seat.state === 'LOCKED' ||
                      seat.state === 'OCCUPIED' ||
                      ((seat.state === 'HELD' || seat.state === 'RESERVED') && seat.heldByUserId !== effectiveUserId);
                    return (
                      <button
                        key={seat.id}
                        disabled={unavailable}
                        onClick={() => handleHoldSeat(seat)}
                        title={`${seat.id} (${tierName}) — ${seat.state}`}
                        className={`flex h-11 w-12 flex-col items-center justify-center rounded-xl border text-xs font-bold transition ${
                          isMine
                            ? 'border-amber-300 bg-amber-500 text-stone-950 shadow-md shadow-amber-500/25 ring-2 ring-amber-400/40'
                            : unavailable
                              ? 'cursor-not-allowed border-red-900/50 bg-red-950/50 text-red-400/70'
                              : 'border-stone-700 bg-stone-800/90 text-stone-200 hover:border-amber-500/50 hover:bg-stone-700'
                        }`}
                      >
                        <span>{seat.id}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Central Velvet Aisle */}
                <div className="flex h-11 w-8 items-center justify-center border-x border-dashed border-stone-800 text-[9px] uppercase tracking-widest text-stone-600">
                  Aisle
                </div>

                <div className="flex items-center gap-2">
                  {rightSeats.map((seat) => {
                    const isMine = selectedSeat?.id === seat.id || seat.heldByUserId === effectiveUserId;
                    const unavailable =
                      seat.state === 'LOCKED' ||
                      seat.state === 'OCCUPIED' ||
                      ((seat.state === 'HELD' || seat.state === 'RESERVED') && seat.heldByUserId !== effectiveUserId);
                    return (
                      <button
                        key={seat.id}
                        disabled={unavailable}
                        onClick={() => handleHoldSeat(seat)}
                        title={`${seat.id} (${tierName}) — ${seat.state}`}
                        className={`flex h-11 w-12 flex-col items-center justify-center rounded-xl border text-xs font-bold transition ${
                          isMine
                            ? 'border-amber-300 bg-amber-500 text-stone-950 shadow-md shadow-amber-500/25 ring-2 ring-amber-400/40'
                            : unavailable
                              ? 'cursor-not-allowed border-red-900/50 bg-red-950/50 text-red-400/70'
                              : 'border-stone-700 bg-stone-800/90 text-stone-200 hover:border-amber-500/50 hover:bg-stone-700'
                        }`}
                      >
                        <span>{seat.id}</span>
                      </button>
                    );
                  })}
                </div>

                <span className="hidden w-24 sm:block" />
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-5 border-t border-stone-800/80 pt-5 text-xs text-stone-400">
          <span className="flex items-center gap-2">
            <span className="h-3.5 w-3.5 rounded border border-stone-700 bg-stone-800" /> Available
          </span>
          <span className="flex items-center gap-2">
            <span className="h-3.5 w-3.5 rounded border border-amber-300 bg-amber-500" /> Your Held Seat
          </span>
          <span className="flex items-center gap-2">
            <span className="h-3.5 w-3.5 rounded border border-red-900/50 bg-red-950/60" /> Occupied / Held
          </span>
        </div>

        {error && <p className="mt-4 text-center text-xs text-red-400">{error}</p>}
      </div>
    </div>
  );
}
