import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Music, ShieldCheck } from 'lucide-react';
import type { AvatarPresetId } from '@vmw/contracts';
import { apiClient } from '../api/client';
import { useAuth } from '../state/authStore';
import { CHIBI_PRESET_CATALOG, ChibiPresetAvatarSvg } from '../components/ChibiPresetPreview';

export function AuthPage() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('linh.piano@vmw.vn');
  const [password, setPassword] = useState('demo1234');
  const [displayName, setDisplayName] = useState('');
  const [birthDate, setBirthDate] = useState('2002-01-01');
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
              birthDate,
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
    <div className="mx-auto max-w-md px-4 py-10">
      <div className="rounded-2xl border border-stone-800/90 bg-stone-900/90 p-6 shadow-2xl">
        <div className="mb-5 flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/15 text-amber-400">
            <Music className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">
              {mode === 'login' ? 'Welcome Back' : 'Join Virtual Music World'}
            </h1>
            <p className="text-xs text-stone-400">Sign in to reserve seats, perform live, or chat</p>
          </div>
        </div>

        <div className="flex gap-1.5 rounded-xl bg-stone-950 p-1">
          <button
            type="button"
            onClick={() => setMode('login')}
            className={`flex-1 rounded-lg py-2 text-xs font-semibold transition ${
              mode === 'login' ? 'bg-amber-500 text-stone-950 shadow' : 'text-stone-400 hover:text-stone-200'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => setMode('register')}
            className={`flex-1 rounded-lg py-2 text-xs font-semibold transition ${
              mode === 'register' ? 'bg-amber-500 text-stone-950 shadow' : 'text-stone-400 hover:text-stone-200'
            }`}
          >
            Register
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          {mode === 'register' && (
            <>
              <div>
                <label className="block text-xs font-medium text-stone-400">Display Name</label>
                <input
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-stone-700 bg-stone-950 px-3.5 py-2.5 text-sm text-white focus:border-amber-500/60 focus:outline-none"
                  placeholder="Minh Listener"
                />
              </div>

                <div>
                  <label className="block text-xs font-medium text-stone-400">Date of Birth (16+ Policy • TBD-18)</label>
                  <input
                    type="date"
                    required
                    value={birthDate}
                    onChange={(e) => setBirthDate(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-white focus:border-amber-500/60 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-stone-400">Account Role</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as 'AUDIENCE' | 'ARTIST')}
                  className="mt-1 w-full rounded-xl border border-stone-700 bg-stone-950 px-3 py-2.5 text-sm text-white focus:border-amber-500/60 focus:outline-none"
                >
                  <option value="AUDIENCE">Audience Listener</option>
                  <option value="ARTIST">Artist / Performer</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-stone-400">Chọn Outfit Chibi Mặc Định (2 Nam • 2 Nữ)</label>
                <div className="mt-1.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {CHIBI_PRESET_CATALOG.map((a) => (
                    <button
                      type="button"
                      key={a.id}
                      onClick={() => setAvatarPresetId(a.id)}
                      className={`flex flex-col items-center gap-1 rounded-xl border p-2 text-[11px] font-medium transition ${
                        avatarPresetId === a.id
                          ? 'border-amber-400 bg-amber-500/15 text-amber-200'
                          : 'border-stone-800 bg-stone-950 text-stone-400 hover:border-stone-700'
                      }`}
                    >
                      <span
                        className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${
                          a.gender === 'NAM' ? 'bg-sky-500/20 text-sky-300' : 'bg-pink-500/20 text-pink-300'
                        }`}
                      >
                        {a.gender === 'NAM' ? '👦 Nam' : '👧 Nữ'}
                      </span>
                      <ChibiPresetAvatarSvg presetId={a.id} className="h-14 w-14" />
                      <span className="font-bold text-stone-100">{a.name}</span>
                      <span className="text-[9px] text-stone-400">{a.outfitTitle}</span>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          <div>
            <label className="block text-xs font-medium text-stone-400">
              {mode === 'login' ? 'Tài khoản hoặc Email' : 'Email'}
            </label>
            <input
              type={mode === 'login' ? 'text' : 'email'}
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={mode === 'login' ? 'linh.piano@vmw.vn hoặc Admin' : 'you@example.com'}
              className="mt-1 w-full rounded-xl border border-stone-700 bg-stone-950 px-3.5 py-2.5 text-sm text-white focus:border-amber-500/60 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-stone-400">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-xl border border-stone-700 bg-stone-950 px-3.5 py-2.5 text-sm text-white focus:border-amber-500/60 focus:outline-none"
            />
          </div>

          <label className="flex items-start gap-2.5 rounded-xl border border-stone-800 bg-stone-950/60 p-3 text-xs text-stone-300">
            <input
              type="checkbox"
              checked={age16Plus}
              onChange={(e) => setAge16Plus(e.target.checked)}
              className="mt-0.5 accent-amber-500"
            />
            <span className="leading-relaxed">
              <ShieldCheck className="mr-1 inline h-3.5 w-3.5 text-emerald-400" />
              I confirm that I am at least <strong>16 years old</strong> (SEC-18 Age Policy).
            </span>
          </label>

          {error && <p className="rounded-xl bg-red-950/60 p-2.5 text-xs text-red-300">{error}</p>}

          <button
            type="submit"
            className="w-full rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 py-2.5 text-sm font-bold text-stone-950 shadow-md shadow-amber-500/15 transition hover:brightness-110"
          >
            {mode === 'login' ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        <div className="mt-5 border-t border-stone-800 pt-4">
          <p className="mb-2.5 text-center text-xs text-stone-400">Or continue with Social Login (SEC-02)</p>
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => handleSocial('GOOGLE')}
              className="rounded-xl border border-stone-700 bg-stone-950 py-2 text-xs font-semibold text-stone-200 transition hover:bg-stone-800"
            >
              Google
            </button>
            <button
              type="button"
              onClick={() => handleSocial('DISCORD')}
              className="rounded-xl border border-stone-700 bg-stone-950 py-2 text-xs font-semibold text-stone-200 transition hover:bg-stone-800"
            >
              Discord
            </button>
          </div>

          {mode === 'login' && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-stone-950/80 p-2.5 text-[11px] text-stone-400">
              <span>Quick Demo:</span>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setEmail('linh.piano@vmw.vn');
                    setPassword('demo1234');
                  }}
                  className="rounded bg-stone-800 px-2 py-1 text-amber-300 hover:bg-stone-700"
                >
                  Artist
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
