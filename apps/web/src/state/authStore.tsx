import React, { createContext, useContext, useState } from 'react';
import type { AvatarPresetId, UserProfile } from '@vmw/contracts';
import { apiClient } from '../api/client';
import { realtimeStore } from '../realtime/realtimeStore';

interface AuthContextValue {
  user: UserProfile | null;
  token: string | null;
  setSession: (token: string, user: UserProfile) => void;
  logout: () => void;
  updateAvatar: (preset: AvatarPresetId) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const STORAGE_KEY = 'vmw_session_v1';
const GUEST_STORAGE_KEY = 'vmw_guest_identity_v1';
const GUEST_AVATARS: AvatarPresetId[] = ['chibi-classic', 'chibi-acoustic', 'chibi-synth', 'chibi-strings'];

let fallbackGuestIdentity: { id: string; displayName: string; avatarPresetId: AvatarPresetId } | null = null;

/**
 * Returns a unique per-tab/per-session Guest identity so multiple guests in the same room
 * never share `'guest-listener'` and overwrite each other on the realtime server.
 */
export function getGuestIdentity(): { id: string; displayName: string; avatarPresetId: AvatarPresetId } {
  try {
    const raw = sessionStorage.getItem(GUEST_STORAGE_KEY);
    if (raw) return JSON.parse(raw) as { id: string; displayName: string; avatarPresetId: AvatarPresetId };
  } catch {
    // Ignore storage access errors
  }
  if (!fallbackGuestIdentity) {
    const suffix =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID().slice(0, 6)
        : Math.random().toString(36).slice(2, 8);
    const avatarPresetId = GUEST_AVATARS[Math.floor(Math.random() * GUEST_AVATARS.length)];
    fallbackGuestIdentity = {
      id: `guest-${suffix}`,
      displayName: `Guest #${suffix.slice(0, 4).toUpperCase()}`,
      avatarPresetId,
    };
    try {
      sessionStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(fallbackGuestIdentity));
    } catch {
      // Ignore storage access errors
    }
  }
  return fallbackGuestIdentity;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSessionState] = useState<{ token: string | null; user: UserProfile | null }>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch {
      // Ignore invalid storage
    }
    return { token: null, user: null };
  });

  const setSession = (token: string, user: UserProfile) => {
    const next = { token, user };
    setSessionState(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  const logout = () => {
    setSessionState({ token: null, user: null });
    localStorage.removeItem(STORAGE_KEY);
  };

  const updateAvatar = async (preset: AvatarPresetId) => {
    realtimeStore.updateLocalAvatarPreset(preset);
    if (!session.token) return;
    const updated = await apiClient.updateAvatarPreset(preset, session.token);
    setSession(session.token, updated);
  };

  return (
    <AuthContext.Provider value={{ user: session.user, token: session.token, setSession, logout, updateAvatar }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
