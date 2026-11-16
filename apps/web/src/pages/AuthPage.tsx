import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { AvatarPresetId } from '@vmw/contracts';
import { apiClient } from '../api/client';
import { useAuth } from '../state/authStore';

const AVATARS: { id: AvatarPresetId; label: string }[] = [
  { id: 'chibi-classic', label: 'Chibi Classic' },
  { id: 'chibi-acoustic', label: 'Chibi Acoustic' },
  { id: 'chibi-synth', label: 'Chibi Synth' },
  { id: 'chibi-strings', label: 'Chibi Strings' },
];

export function AuthPage() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('linh.piano@vmw.vn');
  const [password, setPassword] = useState('demo1234');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<'AUDIENCE' | 'ARTIST'>('AUDIENCE');
  const [avatarPresetId, setAvatarPresetId] = useState<AvatarPresetId>('chibi-classic');
  const [age16Plus, setAge16Plus] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { setSession } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const res =
        mode === 'login'
          ? await apiClient.login(email, password)
          : await apiClient.register({
              email,
              password,
              displayName,
              ageConfirmed16Plus: age16Plus,
              avatarPresetId,
              role,
            });
      setSession(res.token, res.user);
      navigate('/explore');
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleSocial = async (provider: 'GOOGLE' | 'DISCORD') => {
    setError(null);
    try {
      const res = await apiClient.socialLogin({
        provider,
        email: `${provider.toLowerCase()}.guest@vmw.vn`,
        displayName: `${provider} Listener`,
        ageConfirmed16Plus: age16Plus,
      });
      setSession(res.token, res.user);
      navigate('/explore');
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <div className="rounded-2xl border border-stone-800 bg-stone-900 p-6 shadow-xl">
        <div className="flex gap-2 rounded-lg bg-stone-950 p-1">
          <button
            onClick={() => setMode('login')}
            className={`flex-1 rounded-md py-1.5 text-sm font-medium ${
              mode === 'login' ? 'bg-amber-500 text-stone-950' : 'text-stone-400'
            }`}
          >
            Sign In
          </button>
          <button
            onClick={() => setMode('register')}
            className={`flex-1 rounded-md py-1.5 text-sm font-medium ${
              mode === 'register' ? 'bg-amber-500 text-stone-950' : 'text-stone-400'
            }`}
          >
            Register
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          {mode === 'register' && (
            <>
              <div>
                <label className="block text-xs text-stone-400">Display Name</label>
                <input
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm"
                  placeholder="Minh Listener"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-stone-400">Account Role</label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as 'AUDIENCE' | 'ARTIST')}
                    className="mt-1 w-full rounded-lg border border-stone-700 bg-stone-950 px-2.5 py-2 text-sm"
                  >
                    <option value="AUDIENCE">Audience</option>
                    <option value="ARTIST">Artist / Performer</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-stone-400">Chibi Preset</label>
                  <select
                    value={avatarPresetId}
                    onChange={(e) => setAvatarPresetId(e.target.value as AvatarPresetId)}
                    className="mt-1 w-full rounded-lg border border-stone-700 bg-stone-950 px-2.5 py-2 text-sm"
                  >
                    {AVATARS.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </>
          )}

          <div>
            <label className="block text-xs text-stone-400">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs text-stone-400">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm"
            />
          </div>

          <label className="flex items-start gap-2 text-xs text-stone-300">
            <input
              type="checkbox"
              checked={age16Plus}
              onChange={(e) => setAge16Plus(e.target.checked)}
              className="mt-0.5"
            />
            <span>I confirm that I am at least 16 years old (SEC-18 Age Policy).</span>
          </label>

          {error && <p className="rounded bg-red-950/60 p-2 text-xs text-red-300">{error}</p>}

          <button
            type="submit"
            className="w-full rounded-lg bg-amber-500 py-2.5 text-sm font-semibold text-stone-950 hover:bg-amber-400"
          >
            {mode === 'login' ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        <div className="mt-5 border-t border-stone-800 pt-4">
          <p className="mb-2 text-center text-xs text-stone-400">Or continue with Social Login (SEC-02)</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => handleSocial('GOOGLE')}
              className="rounded-lg border border-stone-700 bg-stone-950 py-2 text-xs font-medium hover:bg-stone-800"
            >
              Google
            </button>
            <button
              type="button"
              onClick={() => handleSocial('DISCORD')}
              className="rounded-lg border border-stone-700 bg-stone-950 py-2 text-xs font-medium hover:bg-stone-800"
            >
              Discord
            </button>
          </div>
          <p className="mt-3 text-[11px] text-stone-500">
            Demo Artist: <code>linh.piano@vmw.vn</code> / <code>demo1234</code> • Admin: <code>admin@vmw.vn</code> /{' '}
            <code>admin1234</code>
          </p>
        </div>
      </div>
    </div>
  );
}
