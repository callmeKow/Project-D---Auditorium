import { useEffect, useState } from 'react';
import type { ReportDTO } from '@vmw/contracts';
import { apiClient } from '../api/client';
import { useAuth } from '../state/authStore';

export function AdminConsolePage() {
  const { token, user } = useAuth();
  const [reports, setReports] = useState<ReportDTO[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    apiClient
      .listReports(token)
      .then(setReports)
      .catch((e) => setError(e.message));
  }, [token]);

  const handleResolve = async (id: string) => {
    if (!token) return;
    const updated = await apiClient.resolveReport(id, token);
    setReports((prev) => prev.map((r) => (r.id === id ? updated : r)));
  };

  if (!user) return <div className="p-8 text-stone-400">Please sign in as Host or Admin.</div>;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-2xl font-bold">Host & Admin Moderation Console</h1>
      <p className="text-sm text-stone-400">
        AI-triaged safety and copyright reports (`SEC-04`, `SEC-11`). Permanent bans require Admin review.
      </p>

      {error && <p className="mt-4 rounded bg-red-950/60 p-3 text-xs text-red-300">{error}</p>}

      <div className="mt-6 space-y-3">
        {reports.length === 0 && <p className="text-sm text-stone-500">No open reports.</p>}
        {reports.map((rep) => (
          <div
            key={rep.id}
            className="flex items-center justify-between rounded-xl border border-stone-800 bg-stone-900 p-4"
          >
            <div>
              <div className="flex items-center gap-2">
                <span className="rounded bg-amber-500/20 px-2 py-0.5 text-xs font-semibold text-amber-300">
                  {rep.category}
                </span>
                <span className="rounded bg-stone-800 px-2 py-0.5 text-xs">AI Priority: {rep.aiPriority}</span>
                <span className="text-xs text-stone-400">Status: {rep.status}</span>
              </div>
              <p className="mt-2 text-sm text-stone-200">{rep.description}</p>
            </div>
            {rep.status !== 'RESOLVED' && (
              <button
                onClick={() => handleResolve(rep.id)}
                className="rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white"
              >
                Resolve
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
