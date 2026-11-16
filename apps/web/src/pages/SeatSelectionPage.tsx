import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { RoomDTO, SeatDTO } from '@vmw/contracts';
import { apiClient } from '../api/client';
import { useAuth } from '../state/authStore';

export function SeatSelectionPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [room, setRoom] = useState<RoomDTO | null>(null);
  const [selectedSeat, setSelectedSeat] = useState<SeatDTO | null>(null);
  const [error, setError] = useState<string | null>(null);

  const effectiveUserId = user?.id ?? 'guest-listener';

  useEffect(() => {
    if (!roomId) return;
    apiClient.getRoom(roomId).then(setRoom).catch((e) => setError(e.message));
  }, [roomId]);

  const handleHoldSeat = async (seat: SeatDTO) => {
    if (!roomId) return;
    setError(null);
    try {
      const updated = await apiClient.holdSeat(roomId, seat.id, effectiveUserId);
      setSelectedSeat(updated);
      setRoom((prev) =>
        prev ? { ...prev, seats: prev.seats.map((s) => (s.id === updated.id ? updated : s)) } : prev
      );
    } catch (err) {
      setError((err as Error).message);
    }
  };

  if (!room) return <div className="p-8 text-stone-400">Loading 2D seat map...</div>;

  const rows = ['A', 'B', 'C', 'D'];

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">2D Seat Selection (UX-06)</h1>
          <p className="text-sm text-stone-400">
            {room.concert.title} • {room.name} ({room.capacity} seats)
          </p>
        </div>
        <button
          onClick={() =>
            navigate(`/room/${room.id}`, {
              state: { seatId: selectedSeat?.id },
            })
          }
          className="rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-semibold text-stone-950 hover:bg-amber-400"
        >
          {selectedSeat ? `Enter 3D Room (Seat ${selectedSeat.id})` : 'Enter 3D Room (Walk-in)'}
        </button>
      </div>

      <div className="mt-8 rounded-2xl border border-stone-800 bg-stone-900 p-6">
        <div className="mx-auto mb-8 w-2/3 rounded-lg border border-amber-500/30 bg-amber-950/30 py-2 text-center text-xs font-semibold tracking-widest text-amber-300">
          STAGE — {room.concert.performerName.toUpperCase()}
        </div>

        <div className="space-y-3">
          {rows.map((row) => {
            const rowSeats = room.seats.filter((s) => s.row === row);
            if (rowSeats.length === 0) return null;
            return (
              <div key={row} className="flex items-center justify-center gap-2">
                <span className="w-6 text-xs font-bold text-stone-500">{row}</span>
                {rowSeats.map((seat) => {
                  const isMine = selectedSeat?.id === seat.id || seat.heldByUserId === effectiveUserId;
                  const unavailable =
                    seat.state === 'OCCUPIED' || (seat.state === 'HELD' && seat.heldByUserId !== effectiveUserId);
                  return (
                    <button
                      key={seat.id}
                      disabled={unavailable}
                      onClick={() => handleHoldSeat(seat)}
                      title={`${seat.id} (${seat.tier}) - ${seat.state}`}
                      className={`h-10 w-12 rounded-lg text-xs font-semibold transition ${
                        isMine
                          ? 'bg-amber-500 text-stone-950 ring-2 ring-amber-300'
                          : unavailable
                            ? 'cursor-not-allowed bg-red-950/60 text-red-400'
                            : 'bg-stone-800 text-stone-200 hover:bg-stone-700'
                      }`}
                    >
                      {seat.id}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>

        {error && <p className="mt-4 text-center text-xs text-red-400">{error}</p>}
      </div>
    </div>
  );
}
