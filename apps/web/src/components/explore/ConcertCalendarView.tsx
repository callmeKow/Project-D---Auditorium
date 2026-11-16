import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Clock, Mic2, Radio, Users, X, MapPin } from 'lucide-react';
import type { RoomDTO } from '@vmw/contracts';

type CalendarScale = 'week' | 'month';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const HOURS = Array.from({ length: 16 }, (_, i) => i + 8); // 08:00 .. 23:00

const EVENT_COLORS: Record<string, string> = {
  LIVE: 'border-red-500/60 bg-red-500/20 text-red-200 hover:bg-red-500/30',
  SOUND_CHECK: 'border-amber-500/60 bg-amber-500/20 text-amber-200 hover:bg-amber-500/30',
  SCHEDULED: 'border-sky-500/60 bg-sky-500/20 text-sky-200 hover:bg-sky-500/30',
  PREPARING: 'border-indigo-500/60 bg-indigo-500/20 text-indigo-200 hover:bg-indigo-500/30',
  COMPLETED: 'border-emerald-500/50 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25',
};

function startOfWeekMonday(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay(); // 0=Sun..6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function formatHourLabel(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`;
}

export function ConcertCalendarView({ rooms }: { rooms: RoomDTO[] }) {
  const [scale, setScale] = useState<CalendarScale>('week');
  const [cursorDate, setCursorDate] = useState<Date>(() => new Date());
  const [selectedRoom, setSelectedRoom] = useState<RoomDTO | null>(null);

  const today = useMemo(() => new Date(), []);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, { room: RoomDTO; start: Date; durationMin: number }[]>();
    for (const room of rooms) {
      const start = new Date(room.concert.scheduledAt);
      const key = `${start.getFullYear()}-${start.getMonth()}-${start.getDate()}`;
      const totalSec = room.concert.setlist.reduce((acc, s) => acc + s.durationSec, 0);
      const durationMin = Math.max(45, Math.min(180, Math.round(totalSec / 60) || 60));
      const list = map.get(key) ?? [];
      list.push({ room, start, durationMin });
      map.set(key, list);
    }
    return map;
  }, [rooms]);

  const weekDays = useMemo(() => {
    const monday = startOfWeekMonday(cursorDate);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return d;
    });
  }, [cursorDate]);

  const monthCells = useMemo(() => {
    const firstOfMonth = new Date(cursorDate.getFullYear(), cursorDate.getMonth(), 1);
    const gridStart = startOfWeekMonday(firstOfMonth);
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + i);
      return d;
    });
  }, [cursorDate]);

  const handleNavigate = (dir: -1 | 1) => {
    const next = new Date(cursorDate);
    if (scale === 'week') {
      next.setDate(next.getDate() + dir * 7);
    } else {
      next.setMonth(next.getMonth() + dir);
    }
    setCursorDate(next);
  };

  const headerTitle =
    scale === 'month'
      ? cursorDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
      : `${weekDays[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${weekDays[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;

  const nowMinutes = today.getHours() * 60 + today.getMinutes();
  const nowTopPx = ((nowMinutes - 8 * 60) / 60) * 52;

  return (
    <div className="mt-6 overflow-hidden rounded-2xl border border-stone-800/90 bg-stone-900/80 shadow-2xl">
      {/* Google Calendar-style Top Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-800 bg-stone-950/70 px-4 py-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCursorDate(new Date())}
            className="rounded-lg border border-stone-700 bg-stone-900 px-3 py-1.5 text-xs font-semibold text-stone-200 transition hover:bg-stone-800"
          >
            Today
          </button>
          <div className="flex items-center">
            <button
              onClick={() => handleNavigate(-1)}
              className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-800 hover:text-white"
              aria-label="Previous"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => handleNavigate(1)}
              className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-800 hover:text-white"
              aria-label="Next"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <h2 className="ml-1 text-base font-bold text-white">{headerTitle}</h2>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex rounded-xl border border-stone-800 bg-stone-900 p-0.5 text-xs">
            <button
              onClick={() => setScale('week')}
              className={`rounded-lg px-3 py-1 font-semibold transition ${
                scale === 'week' ? 'bg-amber-500 text-stone-950' : 'text-stone-400 hover:text-stone-200'
              }`}
            >
              Week
            </button>
            <button
              onClick={() => setScale('month')}
              className={`rounded-lg px-3 py-1 font-semibold transition ${
                scale === 'month' ? 'bg-amber-500 text-stone-950' : 'text-stone-400 hover:text-stone-200'
              }`}
            >
              Month
            </button>
          </div>
        </div>
      </div>

      {/* WEEK VIEW (Time-grid like Google Calendar) */}
      {scale === 'week' && (
        <div className="overflow-x-auto">
          <div className="min-w-[760px]">
            {/* Day Column Headers */}
            <div className="grid grid-cols-[64px_repeat(7,1fr)] border-b border-stone-800 bg-stone-950/40">
              <div className="py-2.5 text-center font-mono text-[10px] text-stone-500">GMT+7</div>
              {weekDays.map((day, idx) => {
                const isToday = isSameDay(day, today);
                return (
                  <div key={idx} className="border-l border-stone-800/80 py-2 text-center">
                    <div className={`text-[11px] font-semibold ${isToday ? 'text-amber-400' : 'text-stone-400'}`}>
                      {WEEKDAYS[idx]}
                    </div>
                    <div
                      className={`mx-auto mt-1 flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                        isToday ? 'bg-amber-500 text-stone-950' : 'text-stone-200'
                      }`}
                    >
                      {day.getDate()}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Hourly Time Grid */}
            <div className="relative grid max-h-[560px] grid-cols-[64px_repeat(7,1fr)] overflow-y-auto">
              {/* Time Gutter */}
              <div className="bg-stone-950/30">
                {HOURS.map((h) => (
                  <div
                    key={h}
                    className="h-[52px] border-b border-stone-800/50 pr-2 pt-1 text-right font-mono text-[10px] text-stone-500"
                  >
                    {formatHourLabel(h)}
                  </div>
                ))}
              </div>

              {/* 7 Day Columns */}
              {weekDays.map((day, colIdx) => {
                const key = `${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`;
                const dayEvents = eventsByDay.get(key) ?? [];
                const isToday = isSameDay(day, today);

                return (
                  <div key={colIdx} className="relative border-l border-stone-800/80">
                    {HOURS.map((h) => (
                      <div key={h} className="h-[52px] border-b border-stone-800/40" />
                    ))}

                    {/* Current time red/amber line */}
                    {isToday && nowTopPx >= 0 && nowTopPx <= HOURS.length * 52 && (
                      <div
                        className="pointer-events-none absolute left-0 right-0 z-10 flex items-center"
                        style={{ top: `${nowTopPx}px` }}
                      >
                        <span className="-ml-1 h-2 w-2 rounded-full bg-red-500" />
                        <div className="h-[1.5px] flex-1 bg-red-500/80" />
                      </div>
                    )}

                    {/* Scheduled Concert Event Blocks */}
                    {dayEvents.map(({ room, start, durationMin }, evIdx) => {
                      const startHour = start.getHours() + start.getMinutes() / 60;
                      const clampedStart = Math.max(8, Math.min(23, startHour));
                      const topPx = (clampedStart - 8) * 52 + 2;
                      const heightPx = Math.max(38, (durationMin / 60) * 52 - 4);
                      const colorClass = EVENT_COLORS[room.concert.state] ?? EVENT_COLORS.PREPARING;

                      return (
                        <button
                          key={room.id}
                          onClick={() => setSelectedRoom(room)}
                          style={{
                            top: `${topPx}px`,
                            height: `${heightPx}px`,
                            left: `${4 + (evIdx % 2) * 4}px`,
                            right: '4px',
                          }}
                          className={`absolute z-20 flex flex-col overflow-hidden rounded-lg border px-2 py-1 text-left shadow-md transition ${colorClass}`}
                        >
                          <div className="flex items-center gap-1 text-[10px] font-bold">
                            {room.concert.state === 'LIVE' && (
                              <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-red-400" />
                            )}
                            <span className="truncate">{room.concert.title}</span>
                          </div>
                          <div className="truncate font-mono text-[9px] opacity-85">
                            {start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {room.concert.performerName}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* MONTH VIEW (7-column classic Google Calendar grid) */}
      {scale === 'month' && (
        <div>
          <div className="grid grid-cols-7 border-b border-stone-800 bg-stone-950/40">
            {WEEKDAYS.map((d) => (
              <div key={d} className="py-2 text-center text-[11px] font-semibold text-stone-400">
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {monthCells.map((day, idx) => {
              const inMonth = day.getMonth() === cursorDate.getMonth();
              const isToday = isSameDay(day, today);
              const key = `${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`;
              const dayEvents = eventsByDay.get(key) ?? [];

              return (
                <div
                  key={idx}
                  className={`min-h-[106px] border-b border-r border-stone-800/70 p-1.5 ${
                    inMonth ? 'bg-stone-900/40' : 'bg-stone-950/50 opacity-50'
                  }`}
                >
                  <div className="flex justify-end">
                    <span
                      className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${
                        isToday ? 'bg-amber-500 text-stone-950' : 'text-stone-300'
                      }`}
                    >
                      {day.getDate()}
                    </span>
                  </div>

                  <div className="mt-1 space-y-1">
                    {dayEvents.map(({ room, start }) => {
                      const colorClass = EVENT_COLORS[room.concert.state] ?? EVENT_COLORS.PREPARING;
                      return (
                        <button
                          key={room.id}
                          onClick={() => setSelectedRoom(room)}
                          className={`flex w-full items-center gap-1 truncate rounded-md border px-1.5 py-0.5 text-left text-[10px] font-semibold transition ${colorClass}`}
                        >
                          {room.concert.state === 'LIVE' && (
                            <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-red-400" />
                          )}
                          <span className="font-mono text-[9px] opacity-80">
                            {start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          <span className="truncate">{room.concert.title}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Google Calendar-style Event Quick-Details Modal */}
      {selectedRoom && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={() => setSelectedRoom(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl border border-stone-700 bg-stone-900 p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-amber-300">
                  {selectedRoom.concert.state === 'LIVE' && <Radio className="h-3 w-3 animate-pulse text-red-400" />}
                  {selectedRoom.concert.state} • {selectedRoom.concert.format}
                </span>
                <h3 className="mt-2 text-lg font-bold text-white">{selectedRoom.concert.title}</h3>
              </div>
              <button
                onClick={() => setSelectedRoom(null)}
                className="rounded-lg p-1 text-stone-400 hover:bg-stone-800 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-2.5 text-xs text-stone-300">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-amber-400" />
                <span>{new Date(selectedRoom.concert.scheduledAt).toLocaleString()}</span>
              </div>
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-amber-400" />
                <span>
                  {selectedRoom.name} • Code: <strong className="font-mono text-amber-300">{selectedRoom.code}</strong>
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-amber-400" />
                <span>
                  Performer: <strong className="text-white">{selectedRoom.concert.performerName}</strong> (
                  {selectedRoom.memberCount}/{selectedRoom.capacity} seated)
                </span>
              </div>
            </div>

            <div className="mt-6 flex gap-2.5">
              <Link
                to={`/concerts/${selectedRoom.id}/seats`}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2.5 text-xs font-bold text-stone-950 hover:bg-amber-400"
              >
                <Users className="h-3.5 w-3.5" /> Select 2D Seat & Enter
              </Link>
              <Link
                to={`/performer/${selectedRoom.id}/setup`}
                className="flex items-center gap-1.5 rounded-xl border border-stone-700 bg-stone-950 px-3.5 py-2.5 text-xs font-semibold text-stone-200 hover:bg-stone-800"
              >
                <Mic2 className="h-3.5 w-3.5 text-amber-400" /> Sound Check
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
