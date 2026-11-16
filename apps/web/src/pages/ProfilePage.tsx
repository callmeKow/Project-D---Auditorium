import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, Trash2, ShieldCheck, Sparkles } from 'lucide-react';
import type { AvatarPresetId } from '@vmw/contracts';
import { apiClient } from '../api/client';
import { useAuth } from '../state/authStore';

const AVATAR_PRESETS: { id: AvatarPresetId; name: string; body: string; accent: string }[] = [
  { id: 'chibi-classic', name: 'Chibi Classic', body: '#1e293b', accent: '#f59e0b' },
  { id: 'chibi-acoustic', name: 'Chibi Acoustic', body: '#78350f', accent: '#fbbf24' },
  { id: 'chibi-synth', name: 'Chibi Synth', body: '#312e81', accent: '#38bdf8' },
  { id: 'chibi-strings', name: 'Chibi Strings', body: '#7f1d1d', accent: '#fda4af' },
];

export function ProfilePage() {
  const { user, token, updateAvatar, logout } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!user || !token) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12 text-center text-sm text-stone-400">
        Please sign in to manage your profile and privacy settings.
      </div>
    );
  }

  const handleExport = async () => {
    const data = await apiClient.exportMyData(token);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vmw-profile-${user.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setStatus('Personal data exported as JSON (SEC-16).');
  };

  const handleDelete = async () => {
    await apiClient.deleteMyAccount(token);
    logout();
    navigate('/');
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-extrabold text-white">Profile, Avatar & Privacy (SEC-14..18)</h1>
      <p className="mt-1 text-sm text-stone-400">Manage your Chibi preset, consent record, and personal data.</p>

      <div className="mt-6 space-y-6">
        <div className="rounded-2xl border border-stone-800 bg-stone-900/80 p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-lg font-bold text-white">{user.displayName}</div>
              <div className="text-xs text-stone-400">
                {user.email} • Provider: {user.authProvider} • Roles: {user.roles.join(', ')}
              </div>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-300">
              <ShieldCheck className="h-3.5 w-3.5" /> 16+ Age Confirmed
            </span>
          </div>

          <h2 className="mt-6 flex items-center gap-1.5 text-sm font-bold text-white">
            <Sparkles className="h-4 w-4 text-amber-400" /> Chibi Avatar Preset
          </h2>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {AVATAR_PRESETS.map((p) => (
              <button
                key={p.id}
                onClick={() => updateAvatar(p.id)}
                className={`flex flex-col items-start rounded-xl border p-3 text-left transition ${
                  user.avatarPresetId === p.id
                    ? 'border-amber-400 bg-amber-500/10'
                    : 'border-stone-800 bg-stone-950 hover:border-stone-700'
                }`}
              >
                <div className="flex gap-1.5">
                  <span className="h-4 w-4 rounded-full" style={{ backgroundColor: p.body }} />
                  <span className="h-4 w-4 rounded-full" style={{ backgroundColor: p.accent }} />
                </div>
                <span className="mt-2 text-xs font-semibold text-stone-100">{p.name}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-stone-800 bg-stone-900/80 p-6">
          <h2 className="text-sm font-bold text-white">Data Portability & Account Deletion (SEC-16 / SEC-17)</h2>
          <p className="mt-1 text-xs text-stone-400">
            Virtual Music World stores minimal account data and does not record live audio in MVP.
          </p>

          <div className="mt-4 flex flex-wrap gap-3">
            <button
              onClick={handleExport}
              className="inline-flex items-center gap-2 rounded-xl border border-stone-700 bg-stone-950 px-4 py-2 text-xs font-semibold text-stone-200 hover:bg-stone-800"
            >
              <Download className="h-4 w-4 text-amber-400" /> Export My Data (JSON)
            </button>

            {!confirmDelete ? (
              <button
                onClick={() => setConfirmDelete(true)}
                className="inline-flex items-center gap-2 rounded-xl border border-red-900/60 bg-red-950/40 px-4 py-2 text-xs font-semibold text-red-300 hover:bg-red-950"
              >
                <Trash2 className="h-4 w-4" /> Delete Account
              </button>
            ) : (
              <button
                onClick={handleDelete}
                className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white hover:bg-red-500"
              >
                Confirm Permanent Account Deletion
              </button>
            )}
          </div>
          {status && <p className="mt-3 text-xs text-emerald-400">{status}</p>}
        </div>
      </div>
    </div>
  );
}
