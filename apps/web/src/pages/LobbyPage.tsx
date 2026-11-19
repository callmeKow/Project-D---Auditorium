import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { KeyRound, PlusCircle, Users, ArrowRight, Sparkles, Lock } from 'lucide-react';
import type { PerformanceFormat, RoomDTO, VenueStyle } from '@vmw/contracts';
import { apiClient } from '../api/client';
import { useAuth } from '../state/authStore';

export function LobbyPage() {
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const [rooms, setRooms] = useState<RoomDTO[]>([]);
  const [lobbyVenueFilter, setLobbyVenueFilter] = useState<'ALL' | VenueStyle>('ALL');
  const [roomCode, setRoomCode] = useState('');
  const [joinPasscode, setJoinPasscode] = useState('');
  const [name, setName] = useState('');
  const [concertTitle, setConcertTitle] = useState('');
  const [genre, setGenre] = useState('Acoustic / Piano');
  const [format, setFormat] = useState<PerformanceFormat>('SOLO');
  const [venueStyle, setVenueStyle] = useState<VenueStyle>('CHAMBER');
  const [capacity, setCapacity] = useState(20);
  const [isPrivate, setIsPrivate] = useState(false);
  const [usePasscode, setUsePasscode] = useState(false);
  const [passcode, setPasscode] = useState('');
  const [joinError, setJoinError] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    apiClient.listRooms().then(setRooms).catch(console.error);
  }, []);

  const handleJoinCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setJoinError(null);
    if (!roomCode.trim()) return;
    try {
      const room = await apiClient.getRoomByCode(roomCode);
      navigate(`/concerts/${room.id}/seats`, { state: { passcode: joinPasscode || undefined } });
    } catch (err) {
      setJoinError((err as Error).message);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    if (!token) {
      navigate('/auth');
      return;
    }
    try {
      const effectivePasscode = usePasscode || isPrivate ? passcode.trim() : undefined;
      const room = await apiClient.createRoom(
        {
          name,
          capacity,
          concertTitle,
          genre,
          format,
          venueStyle,
          isSpontaneous: true,
          isPrivate,
          passcode: effectivePasscode,
        },
        token
      );
      if (room.venueStyle === 'KARAOKE') {
        navigate(`/concerts/${room.id}/seats`, { state: { passcode: effectivePasscode } });
      } else {
        navigate(`/performer/${room.id}/setup`);
      }
    } catch (err) {
      setCreateError((err as Error).message);
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div>
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-amber-400">
          <Sparkles className="h-3.5 w-3.5" /> Small Room Gateway
        </span>
        <h1 className="mt-1 text-2xl font-extrabold text-white sm:text-3xl">Central Lobby</h1>
        <p className="mt-1 text-sm text-stone-400">
          Join an intimate concert via invite code or open a new Small Room (10–20 capacity).
        </p>
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        {/* Join via Room Code + Active Rooms */}
        <div className="rounded-2xl border border-stone-800/90 bg-stone-900/75 p-6 shadow-lg">
          <h2 className="flex items-center gap-2 text-base font-bold text-white">
            <KeyRound className="h-4 w-4 text-amber-400" /> Join via Room Code (MR-05)
          </h2>
          <form onSubmit={handleJoinCode} className="mt-3 space-y-2">
            <div className="flex gap-2">
              <input
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                placeholder="Room Code (e.g. VMW-01)"
                className="flex-1 rounded-xl border border-stone-700 bg-stone-950 px-3.5 py-2.5 font-mono text-sm uppercase text-white placeholder:text-stone-600 focus:border-amber-500/60 focus:outline-none"
              />
              <button className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-bold text-stone-950 transition hover:bg-amber-400">
                Join <ArrowRight className="h-4 w-4" />
              </button>
            </div>
            <input
              value={joinPasscode}
              onChange={(e) => setJoinPasscode(e.target.value)}
              placeholder="Passcode (only if joining Private Room)"
              className="w-full rounded-xl border border-stone-800 bg-stone-950 px-3.5 py-2 text-xs text-white placeholder:text-stone-600 focus:border-amber-500/60 focus:outline-none"
            />
          </form>
          {joinError && <p className="mt-2 text-xs text-red-400">{joinError}</p>}

          <div className="mt-6 flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-400">Active Rooms</h3>
            <span className="text-xs text-stone-500">{rooms.length} open</span>
          </div>

          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {(
              [
                { id: 'ALL', label: 'Tất cả' },
                { id: 'CHAMBER', label: '🎻 Thính phòng' },
                { id: 'CONCERT', label: '🎆 Concert' },
                { id: 'KARAOKE', label: '🎤 Karaoke' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setLobbyVenueFilter(tab.id)}
                className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
                  lobbyVenueFilter === tab.id
                    ? 'border-amber-400 bg-amber-500/20 text-amber-200'
                    : 'border-stone-800 bg-stone-950 text-stone-400 hover:border-stone-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="mt-3 space-y-2.5">
            {rooms
              .filter((r) => lobbyVenueFilter === 'ALL' || r.venueStyle === lobbyVenueFilter)
              .map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between rounded-xl border border-stone-800 bg-stone-950/80 px-4 py-3 transition hover:border-stone-700"
              >
                <div className="min-w-0 pr-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate text-sm font-semibold text-white">{r.name}</span>
                    <span className="rounded bg-stone-800 px-1.5 py-0.5 font-mono text-[10px] text-amber-300">
                      {r.code}
                    </span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                        r.venueStyle === 'CONCERT'
                          ? 'bg-fuchsia-500/20 text-fuchsia-300'
                          : r.venueStyle === 'KARAOKE'
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : 'bg-amber-500/15 text-amber-300'
                      }`}
                    >
                      {r.venueStyle === 'CONCERT'
                        ? 'Concert'
                        : r.venueStyle === 'KARAOKE'
                          ? 'Karaoke'
                          : 'Thính phòng'}
                    </span>
                    {r.hasPasscode && (
                      <span title="Có mật khẩu" className="text-amber-400">
                        <Lock className="h-3 w-3" />
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-stone-400">
                    <span className="truncate">{r.concert.title}</span>
                    <span>•</span>
                    <span className="inline-flex items-center gap-1 font-mono">
                      <Users className="h-3 w-3" /> {r.memberCount}/{r.capacity}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => navigate(`/concerts/${r.id}/seats`)}
                  className="shrink-0 rounded-lg bg-stone-800 px-3.5 py-1.5 text-xs font-semibold text-stone-100 transition hover:bg-amber-500 hover:text-stone-950"
                >
                  Enter
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Create Small Room & Concert */}
        <div className="rounded-2xl border border-stone-800/90 bg-stone-900/75 p-6 shadow-lg">
          <h2 className="flex items-center gap-2 text-base font-bold text-white">
            <PlusCircle className="h-4 w-4 text-amber-400" /> Host a Small Room Concert (SM-01)
          </h2>
          <p className="mt-1 text-xs text-stone-400">
            Create a room and jump straight into Sound Check to configure your microphone, interface, or MIDI.
          </p>

          <form onSubmit={handleCreate} className="mt-4 space-y-3.5">
            <div>
              <label className="block text-xs font-medium text-stone-400">Loại phòng (3 chế độ)</label>
              <div className="mt-1.5 grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setVenueStyle('CHAMBER');
                    setGenre('Classical / Opera / Ballad');
                    if (capacity > 20 && !isPrivate) setCapacity(20);
                  }}
                  className={`rounded-xl border p-2.5 text-left transition ${
                    venueStyle === 'CHAMBER'
                      ? 'border-amber-400 bg-amber-500/15 text-amber-100'
                      : 'border-stone-800 bg-stone-950 text-stone-400 hover:border-stone-700'
                  }`}
                >
                  <div className="text-xs font-bold">🎻 Thính phòng</div>
                  <div className="mt-0.5 text-[10px] opacity-80">Opera, Acoustic, thính phòng</div>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setVenueStyle('CONCERT');
                    setGenre('Pop / Rock / Electronic');
                    if (capacity > 20 && !isPrivate) setCapacity(20);
                  }}
                  className={`rounded-xl border p-2.5 text-left transition ${
                    venueStyle === 'CONCERT'
                      ? 'border-fuchsia-400 bg-fuchsia-500/15 text-fuchsia-100'
                      : 'border-stone-800 bg-stone-950 text-stone-400 hover:border-stone-700'
                  }`}
                >
                  <div className="text-xs font-bold">🎆 Concert</div>
                  <div className="mt-0.5 text-[10px] opacity-80">Sân khấu LED theo nhịp bass</div>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setVenueStyle('KARAOKE');
                    setGenre('Karaoke / Ballad / V-Pop');
                    setFormat('DUO');
                    setCapacity((c) => Math.min(15, Math.max(10, c > 15 ? 12 : c)));
                  }}
                  className={`rounded-xl border p-2.5 text-left transition ${
                    venueStyle === 'KARAOKE'
                      ? 'border-emerald-400 bg-emerald-500/15 text-emerald-100'
                      : 'border-stone-800 bg-stone-950 text-stone-400 hover:border-stone-700'
                  }`}
                >
                  <div className="text-xs font-bold">🎤 Karaoke</div>
                  <div className="mt-0.5 text-[10px] opacity-80">Sofa chữ U, hát & chọn bài tự do</div>
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-stone-400">Auditorium Name</label>
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Dalat Cozy Chamber Hall"
                className="mt-1 w-full rounded-xl border border-stone-700 bg-stone-950 px-3.5 py-2.5 text-sm text-white placeholder:text-stone-600 focus:border-amber-500/60 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-stone-400">Concert Title</label>
              <input
                required
                value={concertTitle}
                onChange={(e) => setConcertTitle(e.target.value)}
                placeholder="e.g. Midnight Acoustic & Piano Session"
                className="mt-1 w-full rounded-xl border border-stone-700 bg-stone-950 px-3.5 py-2.5 text-sm text-white placeholder:text-stone-600 focus:border-amber-500/60 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-stone-400">Genre</label>
                <input
                  value={genre}
                  onChange={(e) => setGenre(e.target.value)}
                  placeholder="Acoustic / Jazz"
                  className="mt-1 w-full rounded-xl border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-white focus:border-amber-500/60 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-400">Performance Format</label>
                <select
                  value={format}
                  onChange={(e) => setFormat(e.target.value as PerformanceFormat)}
                  className="mt-1 w-full rounded-xl border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-white focus:border-amber-500/60 focus:outline-none"
                >
                  <option value="SOLO">Solo</option>
                  <option value="DUO">Duo</option>
                  <option value="BAND">Band</option>
                  <option value="ORCHESTRA">Orchestra</option>
                </select>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between text-xs">
                <label className="font-medium text-stone-400">
                  {venueStyle === 'KARAOKE'
                    ? 'Karaoke Lounge Capacity (10–15 ghế sofa)'
                    : isPrivate
                      ? 'Private Room Capacity (10–30 • TBD-02)'
                      : 'Small Room Capacity (10–20)'}
                </label>
                <span className="font-mono font-semibold text-amber-300">{capacity} seats</span>
              </div>
              <input
                type="range"
                min={10}
                max={venueStyle === 'KARAOKE' ? 15 : isPrivate ? 30 : 20}
                step={venueStyle === 'KARAOKE' ? 1 : 2}
                value={capacity}
                onChange={(e) => setCapacity(Number(e.target.value))}
                className="mt-2 w-full accent-amber-500"
              />
            </div>

            <div className="space-y-2 rounded-xl border border-stone-800 bg-stone-950/70 p-3">
              <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-stone-300">
                <input
                  type="checkbox"
                  checked={usePasscode || isPrivate}
                  onChange={(e) => setUsePasscode(e.target.checked)}
                  className="accent-amber-500"
                />
                Đặt mật khẩu vào phòng (Passcode cho nhóm bạn)
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-stone-400">
                <input
                  type="checkbox"
                  checked={isPrivate}
                  onChange={(e) => {
                    const priv = e.target.checked;
                    setIsPrivate(priv);
                    if (priv) setUsePasscode(true);
                    if (!priv && venueStyle !== 'KARAOKE' && capacity > 20) setCapacity(20);
                  }}
                  className="accent-amber-500"
                />
                Private Invite-Only (Ẩn khỏi Explore công khai)
              </label>
              {(usePasscode || isPrivate) && (
                <input
                  required
                  value={passcode}
                  onChange={(e) => setPasscode(e.target.value)}
                  placeholder="Nhập mật khẩu phòng (VD: 1234)..."
                  className="mt-1 w-full rounded-lg border border-stone-700 bg-stone-900 px-3 py-1.5 text-xs text-white"
                />
              )}
            </div>

            {createError && <p className="text-xs text-red-400">{createError}</p>}

            <button className="mt-2 w-full rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 py-2.5 text-sm font-bold text-stone-950 shadow-md shadow-amber-500/15 transition hover:brightness-110">
              {user
                ? venueStyle === 'KARAOKE'
                  ? 'Tạo Phòng Karaoke & Vào Chọn Ghế'
                  : 'Create Room & Go to Sound Check'
                : 'Sign In to Create Room'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
