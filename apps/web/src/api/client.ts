import type {
  AnalyticsSummaryDTO,
  AvatarPresetId,
  ConcertDTO,
  LightingPreset,
  PerformanceFormat,
  ReportDTO,
  RoomDTO,
  RoomState,
  SeatDTO,
  SetlistItemDTO,
  UserProfile,
  VenueStyle,
} from '@vmw/contracts';

const API_BASE = (import.meta.env.VITE_API_URL || '/api').replace(/\/+$/, '');

export function resolveMediaUrl(mediaUrl?: string): string | undefined {
  if (!mediaUrl) return undefined;
  if (/^https?:\/\//i.test(mediaUrl)) return mediaUrl;
  return `${API_BASE}${mediaUrl.startsWith('/') ? '' : '/'}${mediaUrl}`;
}

async function request<T>(path: string, options?: RequestInit, token?: string | null): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return data as T;
}

export const apiClient = {
  register(payload: {
    email: string;
    password: string;
    displayName: string;
    ageConfirmed16Plus: boolean;
    birthDate?: string;
    avatarPresetId?: AvatarPresetId;
    role?: 'AUDIENCE' | 'ARTIST';
  }) {
    return request<{ token: string; user: UserProfile }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  login(email: string, password: string) {
    return request<{ token: string; user: UserProfile }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  },

  socialLogin(payload: { provider: 'GOOGLE' | 'DISCORD'; email: string; displayName: string; ageConfirmed16Plus: boolean }) {
    return request<{ token: string; user: UserProfile }>('/auth/social', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  updateAvatarPreset(avatarPresetId: AvatarPresetId, token: string) {
    return request<UserProfile>(
      '/profiles/avatar',
      { method: 'PATCH', body: JSON.stringify({ avatarPresetId }) },
      token
    );
  },

  exportMyData(token: string) {
    return request<{ profile: UserProfile; exportedAt: string; policy: string }>('/users/me/export', undefined, token);
  },

  deleteMyAccount(token: string) {
    return request<{ ok: boolean }>('/users/me', { method: 'DELETE' }, token);
  },

  listRooms() {
    return request<RoomDTO[]>('/rooms');
  },

  getRoom(roomId: string) {
    return request<RoomDTO>(`/rooms/${roomId}`);
  },

  getRoomByCode(code: string) {
    return request<RoomDTO>(`/rooms/code/${encodeURIComponent(code)}`);
  },

  verifyRoomPasscode(roomId: string, passcode: string) {
    return request<{ ok: boolean }>(`/rooms/${roomId}/verify-passcode`, {
      method: 'POST',
      body: JSON.stringify({ passcode }),
    });
  },

  createRoom(
    payload: {
      name: string;
      capacity: number;
      concertTitle: string;
      genre: string;
      format: PerformanceFormat;
      venueStyle?: VenueStyle;
      isSpontaneous: boolean;
      isPrivate?: boolean;
      passcode?: string;
    },
    token: string
  ) {
    return request<RoomDTO>('/rooms', { method: 'POST', body: JSON.stringify(payload) }, token);
  },

  setRoomState(roomId: string, state: RoomState, token: string) {
    return request<RoomDTO>(`/rooms/${roomId}/state`, { method: 'PATCH', body: JSON.stringify({ state }) }, token);
  },

  addSetlistItem(
    roomId: string,
    payload: {
      title?: string;
      artistName?: string;
      durationSec?: number;
      mode?: 'LIVE' | 'PRERECORDED';
      lightingPreset?: LightingPreset;
      youtubeUrl?: string;
    },
    token: string
  ) {
    return request<SetlistItemDTO>(`/rooms/${roomId}/setlist`, { method: 'POST', body: JSON.stringify(payload) }, token);
  },

  async uploadSetlistMedia(
    roomId: string,
    file: File,
    title: string,
    durationSec: number | undefined,
    token: string
  ): Promise<SetlistItemDTO> {
    const res = await fetch(`${API_BASE}/rooms/${roomId}/setlist/upload`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': file.type || 'application/octet-stream',
        'X-File-Name': encodeURIComponent(file.name),
        ...(title.trim() ? { 'X-Track-Title': encodeURIComponent(title.trim()) } : {}),
        ...(durationSec && Number.isFinite(durationSec) ? { 'X-Duration-Sec': String(Math.round(durationSec)) } : {}),
      },
      body: file,
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    return data as SetlistItemDTO;
  },

  removeSetlistItem(roomId: string, itemId: string, token: string) {
    return request<ConcertDTO>(`/rooms/${roomId}/setlist/${itemId}`, { method: 'DELETE' }, token);
  },

  invitePerformer(roomId: string, performerUserId: string, token: string) {
    return request<ConcertDTO>(
      `/rooms/${roomId}/performers/invite`,
      { method: 'POST', body: JSON.stringify({ performerUserId }) },
      token
    );
  },

  holdSeat(roomId: string, seatId: string, userId: string) {
    return request<SeatDTO>(`/rooms/${roomId}/seats/${seatId}/hold`, {
      method: 'POST',
      body: JSON.stringify({ userId }),
    });
  },

  reserveSeat(roomId: string, seatId: string, userId: string) {
    return request<SeatDTO>(`/rooms/${roomId}/seats/${seatId}/reserve`, {
      method: 'POST',
      body: JSON.stringify({ userId }),
    });
  },

  toggleSeatLock(roomId: string, seatId: string, token: string) {
    return request<SeatDTO>(`/rooms/${roomId}/seats/${seatId}/lock`, { method: 'POST' }, token);
  },

  submitReport(payload: {
    roomId: string;
    reporterUserId: string;
    targetUserId?: string;
    category: ReportDTO['category'];
    description: string;
  }) {
    return request<ReportDTO>('/reports', { method: 'POST', body: JSON.stringify(payload) });
  },

  listReports(token: string) {
    return request<ReportDTO[]>('/reports', undefined, token);
  },

  getAnalyticsSummary(token: string) {
    return request<AnalyticsSummaryDTO>('/analytics/summary', undefined, token);
  },

  resolveReport(reportId: string, token: string) {
    return request<ReportDTO>(`/reports/${reportId}/resolve`, { method: 'POST' }, token);
  },

  moderateUser(
    payload: { roomId: string; targetUserId: string; action: 'MUTE' | 'KICK' | 'BAN' },
    token: string
  ) {
    return request<{ ok: boolean }>('/moderation/action', { method: 'POST', body: JSON.stringify(payload) }, token);
  },
};
