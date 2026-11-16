import crypto from 'node:crypto';
import type { AvatarPresetId, UserProfile, UserRole } from '@vmw/contracts';

interface StoredUser extends UserProfile {
  passwordHash?: string;
}

const users = new Map<string, StoredUser>();
const sessions = new Map<string, string>(); // token -> userId

// Seed demo accounts for immediate testing (Admin, Artist/Performer, Audience)
function seedDefaultUsers() {
  const demoUsers: StoredUser[] = [
    {
      id: 'user-artist-1',
      email: 'linh.piano@vmw.vn',
      displayName: 'Linh Piano',
      roles: ['ARTIST', 'HOST', 'AUDIENCE'],
      avatarPresetId: 'chibi-classic',
      ageConfirmed16Plus: true,
      authProvider: 'EMAIL',
      passwordHash: hashPassword('demo1234'),
    },
    {
      id: 'user-admin-1',
      email: 'admin@vmw.vn',
      displayName: 'VMW Admin',
      roles: ['ADMIN', 'HOST', 'AUDIENCE'],
      avatarPresetId: 'chibi-synth',
      ageConfirmed16Plus: true,
      authProvider: 'EMAIL',
      passwordHash: hashPassword('admin1234'),
    },
  ];
  for (const u of demoUsers) {
    users.set(u.id, u);
  }
}

function hashPassword(pw: string): string {
  return crypto.createHash('sha256').update(pw).digest('hex');
}

seedDefaultUsers();

export function registerWithEmail(params: {
  email: string;
  password: string;
  displayName: string;
  ageConfirmed16Plus: boolean;
  avatarPresetId?: AvatarPresetId;
  role?: 'AUDIENCE' | 'ARTIST';
}): { token: string; user: UserProfile } {
  if (!params.ageConfirmed16Plus) {
    throw new Error('AGE_POLICY_VIOLATION: Users must confirm they are 16+ (SEC-18).');
  }
  const normalizedEmail = params.email.trim().toLowerCase();
  for (const existing of users.values()) {
    if (existing.email === normalizedEmail) {
      throw new Error('EMAIL_EXISTS');
    }
  }
  const roles: UserRole[] = params.role === 'ARTIST' ? ['ARTIST', 'HOST', 'AUDIENCE'] : ['AUDIENCE'];
  const user: StoredUser = {
    id: `user-${crypto.randomUUID().slice(0, 8)}`,
    email: normalizedEmail,
    displayName: params.displayName.trim() || 'Music Lover',
    roles,
    avatarPresetId: params.avatarPresetId ?? 'chibi-classic',
    ageConfirmed16Plus: true,
    authProvider: 'EMAIL',
    passwordHash: hashPassword(params.password),
  };
  users.set(user.id, user);
  const token = crypto.randomUUID();
  sessions.set(token, user.id);
  return { token, user: stripSecrets(user) };
}

export function loginWithEmail(email: string, password: string): { token: string; user: UserProfile } {
  const normalizedEmail = email.trim().toLowerCase();
  for (const user of users.values()) {
    if (user.email === normalizedEmail && user.passwordHash === hashPassword(password)) {
      const token = crypto.randomUUID();
      sessions.set(token, user.id);
      return { token, user: stripSecrets(user) };
    }
  }
  throw new Error('INVALID_CREDENTIALS');
}

export function loginWithSocial(params: {
  provider: 'GOOGLE' | 'DISCORD';
  email: string;
  displayName: string;
  ageConfirmed16Plus: boolean;
}): { token: string; user: UserProfile } {
  if (!params.ageConfirmed16Plus) {
    throw new Error('AGE_POLICY_VIOLATION: Users must confirm they are 16+ (SEC-18).');
  }
  const normalizedEmail = params.email.trim().toLowerCase();
  for (const user of users.values()) {
    if (user.email === normalizedEmail) {
      const token = crypto.randomUUID();
      sessions.set(token, user.id);
      return { token, user: stripSecrets(user) };
    }
  }
  const user: StoredUser = {
    id: `user-${crypto.randomUUID().slice(0, 8)}`,
    email: normalizedEmail,
    displayName: params.displayName,
    roles: ['AUDIENCE'],
    avatarPresetId: 'chibi-acoustic',
    ageConfirmed16Plus: true,
    authProvider: params.provider,
  };
  users.set(user.id, user);
  const token = crypto.randomUUID();
  sessions.set(token, user.id);
  return { token, user: stripSecrets(user) };
}

export function updateAvatarPreset(userId: string, avatarPresetId: AvatarPresetId): UserProfile {
  const user = users.get(userId);
  if (!user) throw new Error('USER_NOT_FOUND');
  user.avatarPresetId = avatarPresetId;
  return stripSecrets(user);
}

export function getUserByToken(token?: string): UserProfile | null {
  if (!token) return null;
  const userId = sessions.get(token);
  if (!userId) return null;
  const user = users.get(userId);
  return user ? stripSecrets(user) : null;
}

function stripSecrets(user: StoredUser): UserProfile {
  const { passwordHash: _ignored, ...profile } = user;
  return profile;
}
