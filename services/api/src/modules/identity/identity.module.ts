import crypto from 'node:crypto';
import type { AvatarPresetId, UserProfile, UserRole } from '@vmw/contracts';
import { loadSnapshot, saveSnapshot } from '../../infrastructure/persistence.js';

interface StoredUser extends UserProfile {
  passwordHash?: string;
}

const users = new Map<string, StoredUser>();
const sessions = new Map<string, string>(); // token -> userId
const SESSION_SECRET = process.env.VMW_SESSION_SECRET ?? 'vmw-dev-session-secret-v1';

function hashPassword(pw: string): string {
  return crypto.createHash('sha256').update(pw).digest('hex');
}

function issueToken(userId: string): string {
  const nonce = crypto.randomUUID().slice(0, 8);
  const payload = Buffer.from(`${userId}:${nonce}`).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  const token = `${payload}.${sig}`;
  sessions.set(token, userId);
  saveSnapshot({ sessions: Object.fromEntries(sessions.entries()) });
  return token;
}

function verifyTokenUserId(token: string): string | null {
  const mapped = sessions.get(token);
  if (mapped) return mapped;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  if (sig !== expected) return null;
  const decoded = Buffer.from(payload, 'base64url').toString('utf8');
  const [userId] = decoded.split(':');
  return userId || null;
}

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
      createdAt: Date.now(),
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
      createdAt: Date.now(),
      passwordHash: hashPassword('admin1234'),
    },
  ];

  const snapshot = loadSnapshot();
  if (snapshot?.sessions && typeof snapshot.sessions === 'object') {
    for (const [tok, uid] of Object.entries(snapshot.sessions)) {
      sessions.set(tok, uid);
    }
  }
  if (snapshot?.users && Array.isArray(snapshot.users) && snapshot.users.length > 0) {
    for (const u of snapshot.users as StoredUser[]) {
      users.set(u.id, u);
    }
    return;
  }

  for (const u of demoUsers) {
    users.set(u.id, u);
  }
}

function persistUsers() {
  saveSnapshot({ users: Array.from(users.values()) });
}

seedDefaultUsers();

function isAtLeast16YearsOld(birthDate?: string): boolean {
  if (!birthDate) return true; // Optional if checkbox only, validated when provided
  const dob = new Date(birthDate);
  if (Number.isNaN(dob.getTime())) return false;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) {
    age -= 1;
  }
  return age >= 16;
}

export function registerWithEmail(params: {
  email: string;
  password: string;
  displayName: string;
  ageConfirmed16Plus: boolean;
  birthDate?: string;
  avatarPresetId?: AvatarPresetId;
  role?: 'AUDIENCE' | 'ARTIST';
}): { token: string; user: UserProfile } {
  if (!params.ageConfirmed16Plus || !isAtLeast16YearsOld(params.birthDate)) {
    throw new Error('AGE_POLICY_VIOLATION: Users must confirm they are 16+ (SEC-18, TBD-18).');
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
    birthDate: params.birthDate,
    authProvider: 'EMAIL',
    createdAt: Date.now(),
    passwordHash: hashPassword(params.password),
  };
  users.set(user.id, user);
  persistUsers();
  const token = issueToken(user.id);
  return { token, user: stripSecrets(user) };
}

export function loginWithEmail(email: string, password: string): { token: string; user: UserProfile } {
  const normalizedEmail = email.trim().toLowerCase();
  for (const user of users.values()) {
    if (user.email === normalizedEmail && user.passwordHash === hashPassword(password)) {
      const token = issueToken(user.id);
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
      const token = issueToken(user.id);
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
    createdAt: Date.now(),
  };
  users.set(user.id, user);
  persistUsers();
  const token = issueToken(user.id);
  return { token, user: stripSecrets(user) };
}

export function updateAvatarPreset(userId: string, avatarPresetId: AvatarPresetId): UserProfile {
  const user = users.get(userId);
  if (!user) throw new Error('USER_NOT_FOUND');
  user.avatarPresetId = avatarPresetId;
  persistUsers();
  return stripSecrets(user);
}

export function getUserByToken(token?: string): UserProfile | null {
  if (!token) return null;
  const userId = verifyTokenUserId(token);
  if (!userId) return null;
  const user = users.get(userId);
  return user ? stripSecrets(user) : null;
}

export function exportUserData(userId: string): { profile: UserProfile; exportedAt: string; policy: string } {
  const user = users.get(userId);
  if (!user) throw new Error('USER_NOT_FOUND');
  return {
    profile: stripSecrets(user),
    exportedAt: new Date().toISOString(),
    policy: 'Virtual Music World MVP Data Portability Export (SEC-16)',
  };
}

export function deleteUserAccount(userId: string): void {
  if (!users.has(userId)) throw new Error('USER_NOT_FOUND');
  users.delete(userId);
  for (const [token, uid] of sessions.entries()) {
    if (uid === userId) sessions.delete(token);
  }
  persistUsers();
}

function stripSecrets(user: StoredUser): UserProfile {
  const { passwordHash: _ignored, ...profile } = user;
  return profile;
}
