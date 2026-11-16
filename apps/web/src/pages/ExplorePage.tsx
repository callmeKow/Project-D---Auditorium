import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Calendar, Search, Users, Mic2 } from 'lucide-react';
import type { RoomDTO } from '@vmw/contracts';
import { apiClient } from '../api/client';

export function ExplorePage() {
  const [rooms, setRooms] = useState<RoomDTO[]>([]);
  const [query, setQuery] = useState('');
  const [view, setView] = useState<'list' | 'calendar'>('list');

  useEffect(() => {
    apiClient.listRooms().then(setRooms).catch(console.error);
  }, []);

  const filtered = rooms.filter(
    (r) =>
      r.concert.title.toLowerCase().includes(query.toLowerCase()) ||
      r.concert.performerName.toLowerCase().includes(query.toLowerCase()) ||
      r.concert.genre.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Explore Concerts</h1>
          <p className="text-sm text-stone-400">Free Small Room concerts (10–20 capacity) • Select a 2D seat to enter</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-stone-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search artist, genre, title..."
              className="rounded-lg border border-stone-700 bg-stone-900 py-2 pl-9 pr-3 text-sm"
            />
          </div>
          <button
            onClick={() => setView(view === 'list' ? 'calendar' : 'list')}
            className="flex items-center gap-1.5 rounded-lg border border-stone-700 bg-stone-900 px-3 py-2 text-sm hover:bg-stone-800"
          >
            <Calendar className="h-4 w-4 text-amber-400" />
            {view === 'list' ? 'Calendar View' : 'List View'}
          </button>
        </div>
      </div>

      <div className="mt-6 grid gap-5 md:grid-cols-2">
        {filtered.map((room) => (
          <div
            key={room.id}
            className="flex flex-col justify-between rounded-xl border border-stone-800 bg-stone-900/80 p-5"
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-semibold text-amber-300">
                  {room.concert.state} • {room.concert.format}
                </span>
                <span className="text-xs text-stone-400">Code: {room.code}</span>
              </div>
              <h2 className="mt-3 text-lg font-bold text-white">{room.concert.title}</h2>
              <p className="mt-1 text-sm text-stone-300">
                Performer: <span className="font-medium text-amber-300">{room.concert.performerName}</span> •{' '}
                {room.concert.genre}
              </p>
              <p className="mt-1 text-xs text-stone-400">
                Venue: {room.name} ({room.memberCount}/{room.capacity} present)
                {view === 'calendar' && ` • Scheduled: ${new Date(room.concert.scheduledAt).toLocaleString()}`}
              </p>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <Link
                to={`/concerts/${room.id}/seats`}
                className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-4 py-2 text-xs font-semibold text-stone-950 hover:bg-amber-400"
              >
                <Users className="h-3.5 w-3.5" /> Select 2D Seat & Enter
              </Link>
              <Link
                to={`/performer/${room.id}/setup`}
                className="flex items-center gap-1.5 rounded-lg border border-stone-700 px-3 py-2 text-xs hover:bg-stone-800"
              >
                <Mic2 className="h-3.5 w-3.5" /> Performer Sound Check
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
