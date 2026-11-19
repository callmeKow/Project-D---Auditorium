import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Music, LogOut, Shield, Compass, DoorOpen, Sparkles, X, Check } from 'lucide-react';
import type { AvatarPresetId } from '@vmw/contracts';
import { useAuth } from '../state/authStore';
import { CHIBI_PRESET_CATALOG, ChibiPresetAvatarSvg } from './ChibiPresetPreview';

const AVATAR_PRESETS = CHIBI_PRESET_CATALOG;

export function Navbar() {
  const { user, logout, updateAvatar } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [avatarModalOpen, setAvatarModalOpen] = useState(false);
  const [savingAvatar, setSavingAvatar] = useState(false);

  // Hide global top Navbar whenever inside any 3D music/karaoke room
  if (location.pathname.startsWith('/room/')) {
    return null;
  }

  const isActive = (path: string) =>
    location.pathname === path
      ? 'text-amber-300 bg-amber-500/10 border-amber-500/30'
      : 'text-stone-300 border-transparent hover:text-amber-200 hover:bg-stone-900';

  const handleSelectAvatar = async (presetId: AvatarPresetId) => {
    setSavingAvatar(true);
    try {
      await updateAvatar(presetId);
      setAvatarModalOpen(false);
    } finally {
      setSavingAvatar(false);
    }
  };

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-stone-800/80 bg-stone-950/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-2.5">
          <Link to="/" className="group flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-amber-400 to-amber-600 text-stone-950 shadow-md shadow-amber-500/20 transition group-hover:scale-105">
              <Music className="h-4 w-4" />
            </div>
            <div className="leading-tight">
              <span className="block text-sm font-extrabold tracking-tight text-white">Virtual Music World</span>
              <span className="hidden text-[10px] font-medium text-amber-400/80 sm:block">3D Live Auditorium</span>
            </div>
          </Link>

          <nav className="flex items-center gap-1.5 text-xs font-medium sm:gap-2.5 sm:text-sm">
            <Link
              to="/explore"
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 transition ${isActive('/explore')}`}
            >
              <Compass className="h-4 w-4" />
              <span className="hidden sm:inline">Explore</span>
            </Link>
            <Link
              to="/lobby"
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 transition ${isActive('/lobby')}`}
            >
              <DoorOpen className="h-4 w-4" />
              <span className="hidden sm:inline">Lobby</span>
            </Link>
            {(user?.roles.includes('ADMIN') || user?.roles.includes('HOST')) && (
              <Link
                to="/admin"
                className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 transition ${isActive('/admin')}`}
              >
                <Shield className="h-4 w-4" />
                <span className="hidden sm:inline">Console</span>
              </Link>
            )}

            <div className="ml-1 h-5 w-px bg-stone-800" />

            {user ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setAvatarModalOpen(true)}
                  title="Change Chibi Avatar Preset"
                  className="flex items-center gap-2 rounded-full border border-stone-700/80 bg-stone-900/90 px-3 py-1 text-xs text-stone-200 transition hover:border-amber-500/50 hover:bg-stone-800"
                >
                  <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                  <span className="max-w-[110px] truncate font-semibold">{user.displayName}</span>
                  <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300">
                    {user.roles[0]}
                  </span>
                </button>
                <button
                  onClick={() => {
                    logout();
                    navigate('/');
                  }}
                  title="Sign Out"
                  className="flex items-center gap-1 rounded-lg border border-stone-800 bg-stone-900/60 px-2.5 py-1.5 text-xs text-stone-400 transition hover:border-stone-700 hover:bg-stone-800 hover:text-stone-100"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span className="hidden md:inline">Sign Out</span>
                </button>
              </div>
            ) : (
              <Link
                to="/auth"
                className="rounded-lg bg-gradient-to-r from-amber-500 to-amber-400 px-4 py-1.5 text-xs font-bold text-stone-950 shadow-sm shadow-amber-500/20 transition hover:brightness-110"
              >
                Sign In
              </Link>
            )}
          </nav>
        </div>
      </header>

      {/* Chibi Avatar Preset Switcher Modal */}
      {avatarModalOpen && user && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-2xl border border-stone-800 bg-stone-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white">Chọn Outfit Chibi Mặc Định (2 Nam • 2 Nữ)</h3>
                <p className="text-xs text-stone-400">Áp dụng tức thì trong phòng 3D</p>
              </div>
              <button
                onClick={() => setAvatarModalOpen(false)}
                className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-800 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              {AVATAR_PRESETS.map((preset) => {
                const selected = user.avatarPresetId === preset.id;
                return (
                  <button
                    key={preset.id}
                    disabled={savingAvatar}
                    onClick={() => handleSelectAvatar(preset.id)}
                    className={`flex flex-col items-center rounded-xl border p-3 text-center transition ${
                      selected
                        ? 'border-amber-400 bg-amber-500/15 ring-1 ring-amber-400/50'
                        : 'border-stone-800 bg-stone-950/70 hover:border-stone-700 hover:bg-stone-950'
                    }`}
                  >
                    <div className="flex w-full items-center justify-between">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          preset.gender === 'NAM'
                            ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                            : 'bg-pink-500/20 text-pink-300 border border-pink-500/30'
                        }`}
                      >
                        {preset.genderLabel}
                      </span>
                      {selected && <Check className="h-4 w-4 text-amber-400" />}
                    </div>
                    <ChibiPresetAvatarSvg presetId={preset.id} className="my-1 h-20 w-20" />
                    <span className="text-xs font-bold text-white">{preset.name}</span>
                    <span className="text-[11px] font-semibold text-amber-300">{preset.outfitTitle}</span>
                    <span className="mt-0.5 text-[10px] text-stone-400">{preset.desc}</span>
                  </button>
                );
              })}
            </div>
            <div className="mt-4 flex items-center justify-between border-t border-stone-800 pt-3 text-xs">
              <span className="text-stone-400">Need data export or privacy settings?</span>
              <Link
                to="/profile"
                onClick={() => setAvatarModalOpen(false)}
                className="font-semibold text-amber-400 hover:underline"
              >
                Open Profile & Privacy →
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
