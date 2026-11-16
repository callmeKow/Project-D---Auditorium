import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { PerformanceFormat, RoomDTO } from '@vmw/contracts';
import { apiClient } from '../api/client';
import { useAuth } from '../state/authStore';

export function LobbyPage() {
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const [rooms, setRooms] = useState<RoomDTO[]>([]);
  const [roomCode, setRoomCode] = useState('');
  const [name, setName] = useState('');
  const [concertTitle, setConcertTitle] = useState('');
  const [genre, setGenre] = useState('Acoustic / Piano');
  const [format, setFormat] = useState<PerformanceFormat>('SOLO');
  const [capacity, setCapacity] = useState(20);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiClient.listRooms().then(setRooms).catch(console.error);
  }, []);

  const handleJoinCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const room = await apiClient.getRoomByCode(roomCode);
      navigate(`/concerts/${room.id}/seats`);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) {
      navigate('/auth');
      return;
    }
    try {
      const room = await apiClient.createRoom(
        { name, capacity, concertTitle, genre, format, isSpontaneous: true },
        token
      );
      navigate(`/performer/${room.id}/setup`);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-2xl font-bold">Central Lobby</h1>
      <p className="text-sm text-stone-400">Join a Small Room by code or host a new live concert.</p>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <div className="rounded-xl border border-stone-800 bg-stone-900 p-5">
          <h2 className="font-semibold">Join via Room Code (MR-05)</h2>
          <form onSubmit={handleJoinCode} className="mt-3 flex gap-2">
            <input
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value)}
              placeholder="e.g. VMW-01"
              className="flex-1 rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm uppercase"
            />
            <button className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-stone-950">Join</button>
          </form>

          <h3 className="mt-6 text-sm font-semibold text-stone-300">Active Small Rooms</h3>
          <div className="mt-2 space-y-2">
            {rooms.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between rounded-lg border border-stone-800 bg-stone-950 px-3 py-2 text-sm"
              >
                <div>
                  <div className="font-medium">{r.name}</div>
                  <div className="text-xs text-stone-400">
                    Code: {r.code} • {r.memberCount}/{r.capacity}
                  </div>
                </div>
                <button
                  onClick={() => navigate(`/concerts/${r.id}/seats`)}
                  className="rounded bg-stone-800 px-3 py-1 text-xs hover:bg-stone-700"
                >
                  Enter
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-stone-800 bg-stone-900 p-5">
          <h2 className="font-semibold">Create Small Room & Concert (SM-01)</h2>
          <form onSubmit={handleCreate} className="mt-3 space-y-3">
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Room Name (e.g. Dalat Cozy Hall)"
              className="w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm"
            />
            <input
              required
              value={concertTitle}
              onChange={(e) => setConcertTitle(e.target.value)}
              placeholder="Concert Title"
              className="w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm"
            />
            <div className="grid grid-cols-3 gap-2">
              <input
                value={genre}
                onChange={(e) => setGenre(e.target.value)}
                placeholder="Genre"
                className="rounded-lg border border-stone-700 bg-stone-950 px-2.5 py-2 text-sm"
              />
              <select
                value={format}
                onChange={(e) => setFormat(e.target.value as PerformanceFormat)}
                className="rounded-lg border border-stone-700 bg-stone-950 px-2 py-2 text-sm"
              >
                <option value="SOLO">Solo</option>
                <option value="DUO">Duo</option>
                <option value="BAND">Band</option>
                <option value="ORCHESTRA">Orchestra</option>
              </select>
              <input
                type="number"
                min={10}
                max={20}
                value={capacity}
                onChange={(e) => setCapacity(Number(e.target.value))}
                className="rounded-lg border border-stone-700 bg-stone-950 px-2.5 py-2 text-sm"
              />
            </div>
            {error && <p className="text-xs text-red-400">{error}</p>}
            <button className="w-full rounded-lg bg-amber-500 py-2 text-sm font-semibold text-stone-950 hover:bg-amber-400">
              {user ? 'Create & Go to Sound Check' : 'Sign In to Create Room'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
