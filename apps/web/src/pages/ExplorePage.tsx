import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Calendar, LayoutGrid, Search, Users, Mic2, Radio, Sparkles, Clock, Lock } from 'lucide-react';
import type { RoomDTO, VenueStyle } from '@vmw/contracts';
import { apiClient } from '../api/client';
import { ConcertCalendarView } from '../components/explore/ConcertCalendarView';

const VENUE_STYLE_META: Record<VenueStyle, { label: string; badgeClass: string }> = {
  CHAMBER: {
    label: '🎻 Thính phòng',
    badgeClass: 'bg-amber-500/10 text-amber-300 border border-amber-500/25',
  },
  CONCERT: {
    label: '🎆 Concert Beat-Sync',
    badgeClass: 'bg-fuchsia-500/15 text-fuchsia-300 border border-fuchsia-500/30',
  },
  KARAOKE: {
    label: '🎤 Karaoke',
    badgeClass: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30',
  },
};

const STATE_BADGE: Record<string, string> = {
  LIVE: 'bg-red-500/15 text-red-300 border-red-500/30',
  SOUND_CHECK: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  PREPARING: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  PAUSED: 'bg-stone-700/40 text-stone-300 border-stone-600/40',
  COMPLETED: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
};

export function ExplorePage() {
  const [rooms, setRooms] = useState<RoomDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [formatFilter, setFormatFilter] = useState<string>('ALL');
  const [venueFilter, setVenueFilter] = useState<'ALL' | VenueStyle>('ALL');
  const [view, setView] = useState<'list' | 'calendar'>('list');

  useEffect(() => {
    apiClient
      .listRooms()
      .then(setRooms)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const filtered = rooms.filter((r) => {
    const matchesQuery =
      r.concert.title.toLowerCase().includes(query.toLowerCase()) ||
      r.concert.performerName.toLowerCase().includes(query.toLowerCase()) ||
      r.concert.genre.toLowerCase().includes(query.toLowerCase()) ||
      r.code.toLowerCase().includes(query.toLowerCase());
    const matchesFormat = formatFilter === 'ALL' || r.concert.format === formatFilter;
    const matchesVenue = venueFilter === 'ALL' || r.venueStyle === venueFilter;
    return matchesQuery && matchesFormat && matchesVenue;
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-amber-400">
            <Sparkles className="h-3.5 w-3.5" /> Live & Upcoming
          </span>
          <h1 className="mt-1 text-2xl font-extrabold text-white sm:text-3xl">Explore Concerts</h1>
          <p className="mt-1 text-sm text-stone-400">
            Intimate Small Room concerts (10–20 capacity) • Pick your 2D seat before entering
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-stone-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search artist, genre, code..."
              className="w-56 rounded-xl border border-stone-800 bg-stone-900 py-2 pl-9 pr-3 text-sm text-stone-100 placeholder:text-stone-500 focus:border-amber-500/60 focus:outline-none"
            />
          </div>

          <select
            value={formatFilter}
            onChange={(e) => setFormatFilter(e.target.value)}
            className="rounded-xl border border-stone-800 bg-stone-900 px-3 py-2 text-sm text-stone-200 focus:border-amber-500/60 focus:outline-none"
          >
            <option value="ALL">All Formats</option>
            <option value="SOLO">Solo</option>
            <option value="DUO">Duo</option>
            <option value="BAND">Band</option>
            <option value="ORCHESTRA">Orchestra</option>
          </select>

          <button
            onClick={() => setView(view === 'list' ? 'calendar' : 'list')}
            className="flex items-center gap-1.5 rounded-xl border border-stone-800 bg-stone-900 px-3.5 py-2 text-sm font-medium text-stone-200 transition hover:border-stone-700 hover:bg-stone-800"
          >
            {view === 'list' ? (
              <>
                <Calendar className="h-4 w-4 text-amber-400" /> Calendar View
              </>
            ) : (
              <>
                <LayoutGrid className="h-4 w-4 text-amber-400" /> List View
              </>
            )}
          </button>
        </div>
      </div>

      {/* 3 Room Type Filter Tabs */}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        {(
          [
            { id: 'ALL', label: '✨ Tất cả phòng' },
            { id: 'CHAMBER', label: '🎻 Thính phòng' },
            { id: 'CONCERT', label: '🎆 Concert' },
            { id: 'KARAOKE', label: '🎤 Phòng Karaoke' },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setVenueFilter(tab.id)}
            className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition ${
              venueFilter === tab.id
                ? 'border-amber-400 bg-amber-500/20 text-amber-200'
                : 'border-stone-800 bg-stone-900/80 text-stone-400 hover:border-stone-700 hover:text-stone-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="mt-8 grid gap-5 md:grid-cols-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-52 animate-pulse rounded-2xl border border-stone-800 bg-stone-900/50 p-5" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-stone-800 bg-stone-900/50 p-10 text-center">
          <p className="text-sm text-stone-400">No concerts match your filter. Try clearing the search or visit the Lobby.</p>
        </div>
      ) : view === 'calendar' ? (
        <ConcertCalendarView rooms={filtered} />
      ) : (
        <div className="mt-6 grid gap-5 md:grid-cols-2">
          {filtered.map((room) => {
            const fillPct = Math.min(100, Math.round((room.memberCount / room.capacity) * 100));
            const currentSong = room.concert.setlist[room.concert.currentSetlistIndex];
            const badgeClass = STATE_BADGE[room.concert.state] ?? 'bg-stone-800 text-stone-300 border-stone-700';

            return (
              <div
                key={room.id}
                className="group flex flex-col justify-between rounded-2xl border border-stone-800/90 bg-stone-900/75 p-5 shadow-lg transition hover:border-amber-500/40 hover:bg-stone-900"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${badgeClass}`}>
                        {room.concert.state === 'LIVE' && <Radio className="h-3 w-3 animate-pulse" />}
                        {room.concert.state} • {room.concert.format}
                      </span>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                          (VENUE_STYLE_META[room.venueStyle] ?? VENUE_STYLE_META.CHAMBER).badgeClass
                        }`}
                      >
                        {(VENUE_STYLE_META[room.venueStyle] ?? VENUE_STYLE_META.CHAMBER).label}
                      </span>
                      {room.hasPasscode && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-stone-700 bg-stone-950 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
                          <Lock className="h-2.5 w-2.5" /> Mật khẩu
                        </span>
                      )}
                    </div>
                    <span className="rounded-md bg-stone-950 px-2 py-0.5 font-mono text-xs font-semibold text-stone-300">
                      {room.code}
                    </span>
                  </div>

                  <h2 className="mt-3 text-lg font-bold text-white group-hover:text-amber-200 transition">
                    {room.concert.title}
                  </h2>

                  <p className="mt-1 text-sm text-stone-300">
                    Performer: <span className="font-semibold text-amber-300">{room.concert.performerName}</span> •{' '}
                    <span className="text-stone-400">{room.concert.genre}</span>
                  </p>

                  {currentSong && (
                    <div className="mt-3 rounded-xl border border-stone-800/80 bg-stone-950/70 px-3 py-2 text-xs text-stone-300">
                      <span className="text-stone-500">Now / Next:</span>{' '}
                      <span className="font-medium text-stone-100">{currentSong.title}</span>
                    </div>
                  )}

                  <div className="mt-4">
                    <div className="flex items-center justify-between text-xs text-stone-400">
                      <span>Venue: {room.name}</span>
                      <span className="font-mono">
                        {room.memberCount}/{room.capacity} seats filled
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-stone-800">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-300 transition-all"
                        style={{ width: `${Math.max(4, fillPct)}%` }}
                      />
                    </div>
                  </div>

                  <div className="mt-3 flex items-center gap-1.5 text-xs text-amber-300/90">
                    <Clock className="h-3.5 w-3.5" />
                    Scheduled: {new Date(room.concert.scheduledAt).toLocaleString()}
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap gap-2.5 border-t border-stone-800/70 pt-4">
                  <Link
                    to={`/concerts/${room.id}/seats`}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2.5 text-xs font-bold text-stone-950 transition hover:bg-amber-400"
                  >
                    <Users className="h-3.5 w-3.5" /> Select 2D Seat & Enter
                  </Link>
                  <Link
                    to={`/performer/${room.id}/setup`}
                    className="flex items-center gap-1.5 rounded-xl border border-stone-700 bg-stone-950/70 px-3.5 py-2.5 text-xs font-medium text-stone-200 transition hover:border-stone-600 hover:bg-stone-800"
                  >
                    <Mic2 className="h-3.5 w-3.5 text-amber-400" /> Sound Check
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
