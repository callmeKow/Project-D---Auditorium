import crypto from 'node:crypto';
import type { ReportDTO, UserRole } from '@vmw/contracts';
import { loadSnapshot, saveSnapshot } from '../../infrastructure/persistence.js';
import { recordAnalyticsEvent } from '../analytics/analytics.module.js';

const reports: ReportDTO[] = [];
const mutedUsersByRoom = new Map<string, Set<string>>();
const bannedUsersByRoom = new Map<string, Set<string>>();

function hydrateReports() {
  const snapshot = loadSnapshot();
  if (snapshot?.reports && Array.isArray(snapshot.reports)) {
    reports.push(...(snapshot.reports as ReportDTO[]));
  }
}

hydrateReports();

function persistReports() {
  saveSnapshot({ reports });
}

export function submitReport(params: {
  roomId: string;
  reporterUserId: string;
  targetUserId?: string;
  category: ReportDTO['category'];
  description: string;
}): ReportDTO {
  // Simple AI-assisted priority triage rule (TBD-20: never auto-perm-ban without human oversight)
  const aiPriority: ReportDTO['aiPriority'] =
    params.category === 'COPYRIGHT' || params.category === 'HARASSMENT' ? 'HIGH' : 'MEDIUM';

  const report: ReportDTO = {
    id: `rep-${crypto.randomUUID().slice(0, 8)}`,
    roomId: params.roomId,
    reporterUserId: params.reporterUserId,
    targetUserId: params.targetUserId,
    category: params.category,
    description: params.description.trim(),
    status: 'OPEN',
    aiPriority,
    createdAt: Date.now(),
  };
  reports.unshift(report);
  persistReports();
  recordAnalyticsEvent({ type: 'REPORT_SUBMITTED', userId: params.reporterUserId, roomId: params.roomId });
  return report;
}

export function listReports(): ReportDTO[] {
  return reports;
}

export function resolveReport(reportId: string, actorRoles: UserRole[]): ReportDTO {
  if (!actorRoles.includes('ADMIN') && !actorRoles.includes('HOST')) {
    throw new Error('FORBIDDEN_MODERATION');
  }
  const rep = reports.find((r) => r.id === reportId);
  if (!rep) throw new Error('REPORT_NOT_FOUND');
  rep.status = 'RESOLVED';
  persistReports();
  return rep;
}

export function applyModerationAction(params: {
  roomId: string;
  actorRoles: UserRole[];
  targetUserId: string;
  action: 'MUTE' | 'KICK' | 'BAN';
}): void {
  const isAdmin = params.actorRoles.includes('ADMIN');
  const isHost = params.actorRoles.includes('HOST');
  if (!isAdmin && !isHost) {
    throw new Error('FORBIDDEN_MODERATION');
  }
  // Permanent/platform-level bans require Admin; Host can mute/kick in-room
  if (params.action === 'BAN' && !isAdmin) {
    throw new Error('HOST_CANNOT_BAN_REQUIRES_ADMIN');
  }
  if (params.action === 'MUTE') {
    const set = mutedUsersByRoom.get(params.roomId) ?? new Set();
    set.add(params.targetUserId);
    mutedUsersByRoom.set(params.roomId, set);
  }
  if (params.action === 'BAN') {
    const set = bannedUsersByRoom.get(params.roomId) ?? new Set();
    set.add(params.targetUserId);
    bannedUsersByRoom.set(params.roomId, set);
  }
}

export function isUserMuted(roomId: string, userId: string): boolean {
  return mutedUsersByRoom.get(roomId)?.has(userId) ?? false;
}

export function isUserBanned(roomId: string, userId: string): boolean {
  return bannedUsersByRoom.get(roomId)?.has(userId) ?? false;
}

// TBD-20: AI-assisted profanity/spam filter (never auto-perm-bans)
const BLOCKED_TERMS = ['scam', 'phishing', 'hate', 'spamlink'];

export function filterChatText(rawText: string): { allowed: boolean; text: string; flagged: boolean } {
  let text = rawText.trim().slice(0, 300);
  if (!text) return { allowed: false, text: '', flagged: false };

  let flagged = false;
  for (const term of BLOCKED_TERMS) {
    const regex = new RegExp(`\\b${term}\\b`, 'gi');
    if (regex.test(text)) {
      flagged = true;
      text = text.replace(regex, '***');
    }
  }
  return { allowed: true, text, flagged };
}
