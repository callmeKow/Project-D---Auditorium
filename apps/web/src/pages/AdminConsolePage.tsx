import { useEffect, useState } from 'react';
import { ShieldAlert, CheckCircle2, Clock, Activity, Users, Radio } from 'lucide-react';
import type { AnalyticsSummaryDTO, ReportDTO } from '@vmw/contracts';
import { apiClient } from '../api/client';
import { useAuth } from '../state/authStore';

export function AdminConsolePage() {
  const { token, user } = useAuth();
  const [reports, setReports] = useState<ReportDTO[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsSummaryDTO | null>(null);
  const [filter, setFilter] = useState<'ALL' | 'OPEN' | 'RESOLVED'>('ALL');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    apiClient
      .listReports(token)
      .then(setReports)
      .catch((e) => setError(e.message));
    apiClient
      .getAnalyticsSummary(token)
      .then(setAnalytics)
      .catch(() => {});
  }, [token]);

  const handleResolve = async (id: string) => {
    if (!token) return;
    const updated = await apiClient.resolveReport(id, token);
    setReports((prev) => prev.map((r) => (r.id === id ? updated : r)));
  };

  if (!user) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12 text-center text-sm text-stone-400">
        Please sign in as Host or Admin to access the Moderation Console.
      </div>
    );
  }

  const visible = reports.filter((r) => filter === 'ALL' || r.status === filter);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-amber-400">
            <ShieldAlert className="h-3.5 w-3.5" /> Safety, Copyright & Telemetry
          </span>
          <h1 className="mt-1 text-2xl font-extrabold text-white">Host & Admin Console</h1>
          <p className="mt-1 text-sm text-stone-400">
            AI-triaged safety/copyright reports (SEC-04, SEC-11) and platform health metrics.
          </p>
        </div>

        <div className="flex gap-1.5 rounded-xl border border-stone-800 bg-stone-900 p-1 text-xs">
          {(['ALL', 'OPEN', 'RESOLVED'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`rounded-lg px-3 py-1.5 font-semibold transition ${
                filter === tab ? 'bg-amber-500 text-stone-950' : 'text-stone-400 hover:text-stone-200'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Platform Telemetry & North Star Summary (TBD-21) */}
      {analytics && (
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <div className="rounded-2xl border border-stone-800 bg-stone-900/70 p-4">
            <div className="flex items-center gap-1.5 text-xs text-stone-400">
              <Radio className="h-3.5 w-3.5 text-emerald-400" /> Live Clients
            </div>
            <div className="mt-1 font-mono text-2xl font-bold text-white">{analytics.connectedClients}</div>
          </div>
          <div className="rounded-2xl border border-stone-800 bg-stone-900/70 p-4">
            <div className="flex items-center gap-1.5 text-xs text-stone-400">
              <Users className="h-3.5 w-3.5 text-amber-400" /> D7 Retention
            </div>
            <div className="mt-1 font-mono text-2xl font-bold text-amber-300">{analytics.d7RetentionRate}%</div>
          </div>
          <div className="rounded-2xl border border-stone-800 bg-stone-900/70 p-4">
            <div className="flex items-center gap-1.5 text-xs text-stone-400">
              <Activity className="h-3.5 w-3.5 text-sky-400" /> Join Success
            </div>
            <div className="mt-1 font-mono text-2xl font-bold text-white">{analytics.roomJoinSuccessRate}%</div>
          </div>
          <div className="rounded-2xl border border-stone-800 bg-stone-900/70 p-4">
            <div className="flex items-center gap-1.5 text-xs text-stone-400">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> Completion
            </div>
            <div className="mt-1 font-mono text-2xl font-bold text-white">{analytics.concertCompletionRate}%</div>
          </div>
          <div className="rounded-2xl border border-stone-800 bg-stone-900/70 p-4">
            <div className="flex items-center gap-1.5 text-xs text-stone-400">
              <Users className="h-3.5 w-3.5 text-stone-400" /> Room Joins
            </div>
            <div className="mt-1 font-mono text-2xl font-bold text-white">{analytics.roomJoins}</div>
          </div>
          <div className="rounded-2xl border border-stone-800 bg-stone-900/70 p-4">
            <div className="flex items-center gap-1.5 text-xs text-stone-400">
              <ShieldAlert className="h-3.5 w-3.5 text-red-400" /> Active Rooms
            </div>
            <div className="mt-1 font-mono text-2xl font-bold text-white">{analytics.activeRooms}</div>
          </div>
        </div>
      )}

      {error && <p className="mt-4 rounded-xl bg-red-950/60 p-3 text-xs text-red-300">{error}</p>}

      <div className="mt-6 space-y-3">
        {visible.length === 0 && (
          <div className="rounded-2xl border border-stone-800 bg-stone-900/60 p-8 text-center text-sm text-stone-500">
            No reports in this view.
          </div>
        )}
        {visible.map((rep) => (
          <div
            key={rep.id}
            className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-stone-800/90 bg-stone-900/80 p-5 shadow"
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-semibold text-amber-300">
                  {rep.category}
                </span>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    rep.aiPriority === 'HIGH' ? 'bg-red-500/20 text-red-300' : 'bg-stone-800 text-stone-300'
                  }`}
                >
                  AI Priority: {rep.aiPriority}
                </span>
                <span className="inline-flex items-center gap-1 text-xs text-stone-400">
                  {rep.status === 'RESOLVED' ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                  ) : (
                    <Clock className="h-3.5 w-3.5 text-amber-400" />
                  )}
                  {rep.status}
                </span>
                <span className="font-mono text-[11px] text-stone-500">
                  Room: {rep.roomId} • {new Date(rep.createdAt).toLocaleTimeString()}
                </span>
              </div>
              <p className="mt-2.5 text-sm text-stone-200">{rep.description}</p>
              {rep.targetUserId && (
                <p className="mt-1 font-mono text-[11px] text-stone-400">Target User: {rep.targetUserId}</p>
              )}
            </div>

            {rep.status !== 'RESOLVED' && (
              <button
                onClick={() => handleResolve(rep.id)}
                className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-emerald-500"
              >
                Mark Resolved
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
