import type { AvatarPresetId, PerformanceFormat, ReportDTO, RoomDTO, SeatDTO, UserProfile } from '@vmw/contracts';

const API_BASE = '/api';

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

  listRooms() {
    return request<RoomDTO[]>('/rooms');
  },

  getRoom(roomId: string) {
    return request<RoomDTO>(`/rooms/${roomId}`);
  },

  getRoomByCode(code: string) {
    return request<RoomDTO>(`/rooms/code/${encodeURIComponent(code)}`);
  },

  createRoom(
    payload: {
      name: string;
      capacity: number;
      concertTitle: string;
      genre: string;
      format: PerformanceFormat;
      isSpontaneous: boolean;
    },
    token: string
  ) {
    return request<RoomDTO>('/rooms', { method: 'POST', body: JSON.stringify(payload) }, token);
  },

  holdSeat(roomId: string, seatId: string, userId: string) {
    return request<SeatDTO>(`/rooms/${roomId}/seats/${seatId}/hold`, {
      method: 'POST',
      body: JSON.stringify({ userId }),
    });
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
