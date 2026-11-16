import type { AnalyticsSummaryDTO } from '@vmw/contracts';

export interface AnalyticsEvent {
  type: 'ROOM_JOINED' | 'ROOM_JOIN_FAILED' | 'CONCERT_STARTED' | 'CONCERT_COMPLETED' | 'REPORT_SUBMITTED';
  userId?: string;
  roomId?: string;
  timestamp: number;
}

const events: AnalyticsEvent[] = [];
const userJoinDays = new Map<string, Set<string>>();

export function recordAnalyticsEvent(event: Omit<AnalyticsEvent, 'timestamp'>): void {
  const timestamp = Date.now();
  events.push({ ...event, timestamp });
  if (event.type === 'ROOM_JOINED' && event.userId) {
    const dayKey = new Date(timestamp).toISOString().slice(0, 10);
    const days = userJoinDays.get(event.userId) ?? new Set<string>();
    days.add(dayKey);
    userJoinDays.set(event.userId, days);
  }
  if (events.length > 5000) {
    events.shift();
  }
}

export function getAnalyticsSummary(activeRooms: number, connectedClients: number): AnalyticsSummaryDTO {
  let roomJoins = 0;
  let roomJoinFailures = 0;
  let concertsStarted = 0;
  let concertsCompleted = 0;
  let reportsSubmitted = 0;

  for (const e of events) {
    if (e.type === 'ROOM_JOINED') roomJoins += 1;
    if (e.type === 'ROOM_JOIN_FAILED') roomJoinFailures += 1;
    if (e.type === 'CONCERT_STARTED') concertsStarted += 1;
    if (e.type === 'CONCERT_COMPLETED') concertsCompleted += 1;
    if (e.type === 'REPORT_SUBMITTED') reportsSubmitted += 1;
  }

  const totalAttempts = roomJoins + roomJoinFailures;
  const roomJoinSuccessRate = totalAttempts > 0 ? Math.round((roomJoins / totalAttempts) * 100) : 100;
  const concertCompletionRate =
    concertsStarted > 0 ? Math.min(100, Math.round((concertsCompleted / concertsStarted) * 100)) : 100;

  let returningUsers = 0;
  for (const days of userJoinDays.values()) {
    if (days.size > 1) returningUsers += 1;
  }
  const d7RetentionRate =
    userJoinDays.size > 0 ? Math.round((returningUsers / userJoinDays.size) * 100) : 0;

  return {
    totalEvents: events.length,
    roomJoins,
    roomJoinFailures,
    roomJoinSuccessRate,
    concertsStarted,
    concertsCompleted,
    concertCompletionRate,
    d7RetentionRate,
    reportsSubmitted,
    uniqueUsersJoined: userJoinDays.size,
    activeRooms,
    connectedClients,
  };
}
