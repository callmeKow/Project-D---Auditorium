import React, { createContext, useContext, useState } from 'react';
import type { AvatarPresetId, UserProfile } from '@vmw/contracts';
import { apiClient } from '../api/client';

interface AuthContextValue {
  user: UserProfile | null;
  token: string | null;
  setSession: (token: string, user: UserProfile) => void;
  logout: () => void;
  updateAvatar: (preset: AvatarPresetId) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const STORAGE_KEY = 'vmw_session_v1';

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
