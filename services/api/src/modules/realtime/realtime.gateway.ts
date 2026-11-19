import crypto from 'node:crypto';
import type { Server as HttpServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import {
  getAuditoriumFloorY,
  type AvatarTransformPayload,
  type ChatMessageDTO,
  type RealtimeClientMessage,
  type RealtimeServerMessage,
  type UserRole,
} from '@vmw/contracts';
import { getRoomById, persistRooms, verifyRoomPasscode } from '../room/room.module.js';
import { occupySeat, releaseUserSeats } from '../seating/seating.module.js';
import { filterChatText, isUserBanned, isUserMuted } from '../moderation/moderation.module.js';
import { canControlConcert } from '../authorization/authorization.module.js';
import { reorderSetlist, transitionConcertState } from '../concert/concert.module.js';
import { recordAnalyticsEvent } from '../analytics/analytics.module.js';

interface ClientSession {
  ws: WebSocket;
  roomId: string;
  userId: string;
  displayName: string;
  role: UserRole;
  avatar: AvatarTransformPayload;
  lastChatAt: number;
}

const MAX_CHAT_AGE_MS = 24 * 60 * 60 * 1000; // TBD-17: 24h max chat retention
const roomClients = new Map<string, Map<string, ClientSession>>(); // roomId -> userId -> session
const roomChatHistory = new Map<string, ChatMessageDTO[]>();

function pruneExpiredChat(roomId: string): ChatMessageDTO[] {
  const cutoff = Date.now() - MAX_CHAT_AGE_MS;
  const hist = (roomChatHistory.get(roomId) ?? []).filter((m) => m.timestamp >= cutoff);
  roomChatHistory.set(roomId, hist);
  return hist;
}

// Restrict audience movement to aisles/seating area (z >= 0.8, |x| <= 5.5, z <= 8.5) and snap Y to true floor/stage elevation
export function clampAuditoriumPosition(
  pos: [number, number, number],
  role: UserRole,
  stageAccess = false
): [number, number, number] {
  const canStepOnStage = role === 'ARTIST' || role === 'HOST' || role === 'ADMIN' || stageAccess;
  const minZ = canStepOnStage ? -3.2 : 0.8;
  const x = Math.max(-5.5, Math.min(5.5, pos[0]));
  const z = Math.max(minZ, Math.min(8.5, pos[2]));
  const y = getAuditoriumFloorY(x, z);
  return [Number(x.toFixed(3)), Number(y.toFixed(3)), Number(z.toFixed(3))];
}

export function broadcastToRoom(roomId: string, msg: RealtimeServerMessage, exceptUserId?: string) {
  const clients = roomClients.get(roomId);
  if (!clients) return;
  const raw = JSON.stringify(msg);
  for (const [uid, client] of clients.entries()) {
    if (uid === exceptUserId) continue;
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(raw);
    }
  }
}

export function disconnectUserFromRoom(
  roomId: string,
  targetUserId: string,
  action: 'MUTE' | 'KICK' | 'BAN',
  reason: string
) {
  const clients = roomClients.get(roomId);
  if (!clients) return;
  const target = clients.get(targetUserId);
  if (!target) return;

  if (target.ws.readyState === WebSocket.OPEN) {
    target.ws.send(
      JSON.stringify({
        priority: 'P0',
        type: 'MODERATION_ACTION',
        action,
        targetUserId,
        reason,
      } satisfies RealtimeServerMessage)
    );
    if (action === 'KICK' || action === 'BAN') {
      target.ws.close(4004, action);
    }
  }
}

export function getConnectedClientCount(): number {
  let count = 0;
  for (const clients of roomClients.values()) {
    count += clients.size;
  }
  return count;
}

export function attachRealtimeGateway(server: HttpServer) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    let session: ClientSession | null = null;

    ws.on('message', (data) => {
      let parsed: RealtimeClientMessage;
      try {
        parsed = JSON.parse(data.toString());
      } catch {
        return;
      }

      if (parsed.type === 'PING') {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({
              priority: 'P1',
              type: 'PONG',
              clientSentAt: parsed.clientSentAt,
              serverTime: Date.now(),
            } satisfies RealtimeServerMessage)
          );
        }
        return;
      }

      if (parsed.type === 'JOIN_ROOM') {
        const room = getRoomById(parsed.roomId);
        if (!room) {
          recordAnalyticsEvent({ type: 'ROOM_JOIN_FAILED', userId: parsed.userId, roomId: parsed.roomId });
          ws.close(4004, 'ROOM_NOT_FOUND');
          return;
        }
        if (isUserBanned(room.id, parsed.userId)) {
          recordAnalyticsEvent({ type: 'ROOM_JOIN_FAILED', userId: parsed.userId, roomId: room.id });
          ws.send(
            JSON.stringify({
              priority: 'P0',
              type: 'MODERATION_ACTION',
              action: 'BAN',
              targetUserId: parsed.userId,
              reason: 'User is banned from this room.',
            } satisfies RealtimeServerMessage)
          );
          ws.close(4004, 'BANNED');
          return;
        }
        if ((room.isPrivate || room.hasPasscode) && parsed.userId !== room.concert.hostUserId && !verifyRoomPasscode(room.id, parsed.passcode)) {
          recordAnalyticsEvent({ type: 'ROOM_JOIN_FAILED', userId: parsed.userId, roomId: room.id });
          ws.close(4006, 'INVALID_PASSCODE');
          return;
        }
        if ((room.state === 'LOCKED' || room.state === 'CLOSED') && parsed.role === 'AUDIENCE') {
          recordAnalyticsEvent({ type: 'ROOM_JOIN_FAILED', userId: parsed.userId, roomId: room.id });
          ws.close(4005, 'ROOM_LOCKED');
          return;
        }

        const clients = roomClients.get(room.id) ?? new Map<string, ClientSession>();
        if (clients.size >= room.capacity && !clients.has(parsed.userId)) {
          recordAnalyticsEvent({ type: 'ROOM_JOIN_FAILED', userId: parsed.userId, roomId: room.id });
          ws.close(4003, 'ROOM_FULL');
          return;
        }
        roomClients.set(room.id, clients);

        const hasStageAccess =
          parsed.role === 'ARTIST' ||
          parsed.role === 'HOST' ||
          parsed.role === 'ADMIN' ||
          parsed.userId === room.concert.hostUserId ||
          room.concert.invitedPerformerIds.includes(parsed.userId);
        const spawnPos: [number, number, number] = hasStageAccess
          ? [0, getAuditoriumFloorY(0, -1.6), -1.6]
          : room.venueStyle === 'KARAOKE'
            ? [0, 0, 1.3]
            : [0, 0, 5.2];

        const avatar: AvatarTransformPayload = {
          userId: parsed.userId,
          displayName: parsed.displayName,
          role: hasStageAccess && parsed.role === 'AUDIENCE' ? 'ARTIST' : parsed.role,
          avatarPresetId: parsed.avatarPresetId,
          position: spawnPos,
          rotationY: hasStageAccess ? 0 : Math.PI,
          animation: 'IDLE',
          seq: 0,
        };

        session = {
          ws,
          roomId: room.id,
          userId: parsed.userId,
          displayName: parsed.displayName,
          role: avatar.role,
          avatar,
          lastChatAt: 0,
        };

        clients.set(parsed.userId, session);
        room.memberCount = clients.size;
        recordAnalyticsEvent({ type: 'ROOM_JOINED', userId: parsed.userId, roomId: room.id });

        const snapshot: RealtimeServerMessage = {
          priority: 'P0',
          type: 'ROOM_SNAPSHOT',
          room,
          avatars: Array.from(clients.values()).map((c) => c.avatar),
          chat: pruneExpiredChat(room.id),
          serverTime: Date.now(),
        };
        ws.send(JSON.stringify(snapshot));
        broadcastToRoom(room.id, { priority: 'P1', type: 'AVATAR_STATE', avatar }, parsed.userId);
        return;
      }

      if (!session) return;
      const room = getRoomById(session.roomId);
      if (!room) return;

      switch (parsed.type) {
        case 'AVATAR_MOVE': {
          if (parsed.seq <= session.avatar.seq && parsed.seq !== 0) return;
          const stageAccess =
            room.venueStyle === 'KARAOKE' ||
            session.userId === room.concert.hostUserId ||
            room.concert.invitedPerformerIds.includes(session.userId);
          session.avatar.position = clampAuditoriumPosition(parsed.position, session.role, stageAccess);
          session.avatar.rotationY = parsed.rotationY;
          session.avatar.animation = parsed.animation;
          session.avatar.seq = parsed.seq;
          broadcastToRoom(
            session.roomId,
            { priority: 'P1', type: 'AVATAR_STATE', avatar: session.avatar },
            session.userId
          );
          break;
        }

        case 'OCCUPY_SEAT': {
          try {
            const { occupied, released } = occupySeat(room.seats, parsed.seatId, session.userId);
            session.avatar.seatId = occupied.id;
            session.avatar.position = occupied.position;
            session.avatar.rotationY =
              room.venueStyle === 'KARAOKE'
                ? occupied.row === 'L'
                  ? Math.PI * 0.65
                  : occupied.row === 'R'
                    ? -Math.PI * 0.65
                    : Math.PI
                : Math.PI;
            session.avatar.animation = 'SIT';
            for (const r of released) {
              broadcastToRoom(session.roomId, { priority: 'P0', type: 'SEAT_UPDATED', seat: r });
            }
            broadcastToRoom(session.roomId, { priority: 'P0', type: 'SEAT_UPDATED', seat: occupied });
            broadcastToRoom(session.roomId, { priority: 'P1', type: 'AVATAR_STATE', avatar: session.avatar });
          } catch {
            // Seat unavailable or locked
          }
          break;
        }

        case 'LEAVE_SEAT': {
          const released = releaseUserSeats(room.seats, session.userId);
          session.avatar.seatId = undefined;
          session.avatar.animation = 'STAND';
          for (const r of released) {
            broadcastToRoom(session.roomId, { priority: 'P0', type: 'SEAT_UPDATED', seat: r });
          }
          broadcastToRoom(session.roomId, { priority: 'P1', type: 'AVATAR_STATE', avatar: session.avatar });
          break;
        }

        case 'CHAT_SEND': {
          const now = Date.now();
          if (isUserMuted(session.roomId, session.userId)) return;
          if (now - session.lastChatAt < 500) return; // Rate limit 2 msgs/sec
          const filtered = filterChatText(parsed.text);
          if (!filtered.allowed) return;
          session.lastChatAt = now;

          const message: ChatMessageDTO = {
            id: `msg-${crypto.randomUUID().slice(0, 8)}`,
            roomId: session.roomId,
            userId: session.userId,
            displayName: session.displayName,
            role: session.role,
            text: filtered.text,
            timestamp: now,
          };
          const hist = pruneExpiredChat(session.roomId);
          hist.push(message);
          if (hist.length > 100) hist.shift();
          roomChatHistory.set(session.roomId, hist);

          broadcastToRoom(session.roomId, { priority: 'P2', type: 'CHAT_MESSAGE', message });
          break;
        }

        case 'REACTION_SEND': {
          if (
            parsed.reaction === 'DANCE' ||
            parsed.reaction === 'DANCE_2' ||
            parsed.reaction === 'DANCE_3' ||
            parsed.reaction === 'DANCE_4' ||
            parsed.reaction === 'DANCE_5'
          ) {
            session.avatar.animation = parsed.reaction;
          }
          broadcastToRoom(session.roomId, {
            priority: 'P2',
            type: 'REACTION',
            userId: session.userId,
            displayName: session.displayName,
            reaction: parsed.reaction,
          });
          break;
        }

        case 'MIDI_EVENT': {
          broadcastToRoom(
            session.roomId,
            { priority: 'P1', type: 'AUDIO_TIMING_MIDI', event: parsed.event },
            session.userId
          );
          break;
        }

        case 'WEBRTC_SIGNAL': {
          const clients = roomClients.get(session.roomId);
          if (!clients) return;
          const channel = parsed.channel ?? 'CONCERT';

          // TBD-08: Private Performer Talkback never leaks to Audience
          if (channel === 'PERFORMER_TALKBACK') {
            const isPerformer =
              session.role === 'ARTIST' ||
              session.userId === room.concert.hostUserId ||
              room.concert.invitedPerformerIds.includes(session.userId);
            if (!isPerformer) return;
          }

          const payload: RealtimeServerMessage = {
            priority: 'P1',
            type: 'WEBRTC_SIGNAL',
            fromUserId: session.userId,
            channel,
            signal: parsed.signal,
          };

          if (parsed.targetUserId) {
            const target = clients.get(parsed.targetUserId);
            if (target && target.ws.readyState === WebSocket.OPEN) {
              if (
                channel === 'PERFORMER_TALKBACK' &&
                target.role !== 'ARTIST' &&
                target.userId !== room.concert.hostUserId &&
                !room.concert.invitedPerformerIds.includes(target.userId)
              ) {
                return;
              }
              target.ws.send(JSON.stringify(payload));
            }
          } else {
            broadcastToRoom(session.roomId, payload, session.userId);
          }
          break;
        }

        case 'SET_LIGHTING_CUE': {
          // Host, Artist, Admin (or any participant in public Karaoke/Chamber mode) can adjust lighting cues
          if (!canControlConcert(session.userId, [session.role], room.concert, room.venueStyle, room.isPrivate)) return;

          const current = room.concert.setlist[room.concert.currentSetlistIndex];
          if (current) {
            current.lightingPreset = parsed.preset;
          }
          broadcastToRoom(session.roomId, { priority: 'P2', type: 'LIGHTING_CUE', preset: parsed.preset });
          broadcastToRoom(session.roomId, { priority: 'P0', type: 'CONCERT_STATE_UPDATED', concert: room.concert });
          if (current) setImmediate(persistRooms);
          break;
        }

        case 'SELECT_SETLIST_ITEM': {
          if (!canControlConcert(session.userId, [session.role], room.concert, room.venueStyle, room.isPrivate)) return;
          if (parsed.index >= 0 && parsed.index < room.concert.setlist.length) {
            room.concert.currentSetlistIndex = parsed.index;
            if (room.concert.state === 'PREPARING' || room.concert.state === 'SOUND_CHECK' || room.concert.state === 'PAUSED') {
              try {
                transitionConcertState(room.concert, 'LIVE');
              } catch {
                // Keep existing state if transition disallowed
              }
            }
            room.concert.trackPlaying = true;
            room.concert.trackStartedAtServerMs = Date.now();
            room.concert.trackPausedAtSec = 0;
            const currentItem = room.concert.setlist[parsed.index];
            broadcastToRoom(session.roomId, { priority: 'P2', type: 'LIGHTING_CUE', preset: currentItem.lightingPreset });
            broadcastToRoom(session.roomId, { priority: 'P0', type: 'CONCERT_STATE_UPDATED', concert: room.concert });
            setImmediate(persistRooms);
          }
          break;
        }

        case 'PERFORMER_CONCERT_CONTROL': {
          if (!canControlConcert(session.userId, [session.role], room.concert, room.venueStyle, room.isPrivate)) {
            return;
          }
          const concert = room.concert;
          try {
            if (parsed.action === 'START_SOUND_CHECK') {
              transitionConcertState(concert, 'SOUND_CHECK');
            }
            if (parsed.action === 'GO_LIVE') {
              transitionConcertState(concert, 'LIVE');
              const resumeOffsetMs = (concert.trackPausedAtSec ?? 0) * 1000;
              concert.trackPlaying = true;
              concert.trackStartedAtServerMs = Date.now() - resumeOffsetMs;
              concert.trackPausedAtSec = 0;
              recordAnalyticsEvent({ type: 'CONCERT_STARTED', userId: session.userId, roomId: session.roomId });
            }
            if (parsed.action === 'PAUSE') {
              if (concert.trackPlaying && concert.trackStartedAtServerMs) {
                concert.trackPausedAtSec = Math.max(0, (Date.now() - concert.trackStartedAtServerMs) / 1000);
              }
              concert.trackPlaying = false;
              transitionConcertState(concert, 'PAUSED');
            }
            if (parsed.action === 'INTERMISSION') {
              if (concert.trackPlaying && concert.trackStartedAtServerMs) {
                concert.trackPausedAtSec = Math.max(0, (Date.now() - concert.trackStartedAtServerMs) / 1000);
              }
              concert.trackPlaying = false;
              transitionConcertState(concert, 'INTERMISSION');
            }
            if (parsed.action === 'COMPLETE') {
              concert.trackPlaying = false;
              concert.trackPausedAtSec = 0;
              transitionConcertState(concert, 'COMPLETED');
              recordAnalyticsEvent({ type: 'CONCERT_COMPLETED', userId: session.userId, roomId: session.roomId });
            }
          } catch {
            // Invalid transition ignored gracefully
          }

          if (parsed.action === 'NEXT_SONG' && concert.setlist.length > 0) {
            if (typeof parsed.expectedIndex === 'number' && parsed.expectedIndex !== concert.currentSetlistIndex) {
              return;
            }
            concert.currentSetlistIndex = (concert.currentSetlistIndex + 1) % concert.setlist.length;
            concert.trackPlaying = true;
            concert.trackStartedAtServerMs = Date.now();
            concert.trackPausedAtSec = 0;
            const currentItem = concert.setlist[concert.currentSetlistIndex];
            broadcastToRoom(session.roomId, { priority: 'P2', type: 'LIGHTING_CUE', preset: currentItem.lightingPreset });
          }
          if (parsed.action === 'TOGGLE_MODE' && concert.setlist[concert.currentSetlistIndex]) {
            const item = concert.setlist[concert.currentSetlistIndex];
            item.mode = item.mode === 'LIVE' ? 'PRERECORDED' : 'LIVE';
          }
          if (parsed.action === 'END_SONG') {
            const item = concert.setlist[concert.currentSetlistIndex];
            const karaokeScore =
              room.venueStyle === 'KARAOKE' ? Math.floor(85 + Math.random() * 16) : undefined;
            broadcastToRoom(session.roomId, {
              priority: 'P2',
              type: 'SONG_ENDED_APPLAUSE',
              setlistItemId: item?.id ?? 'unknown',
              karaokeScore,
            });
          }
          broadcastToRoom(session.roomId, { priority: 'P0', type: 'CONCERT_STATE_UPDATED', concert });
          setImmediate(persistRooms);
          break;
        }

        case 'SET_PLAYBACK_MODE': {
          if (!canControlConcert(session.userId, [session.role], room.concert, room.venueStyle, room.isPrivate)) return;
          room.concert.playbackMode = parsed.mode === 'QUEUE_NEXT' ? 'QUEUE_NEXT' : 'REPEAT_ONE';
          broadcastToRoom(session.roomId, { priority: 'P0', type: 'CONCERT_STATE_UPDATED', concert: room.concert });
          setImmediate(persistRooms);
          break;
        }

        case 'REORDER_SETLIST': {
          if (!canControlConcert(session.userId, [session.role], room.concert, room.venueStyle, room.isPrivate)) return;
          if (Array.isArray(parsed.orderedIds) && parsed.orderedIds.length > 0) {
            reorderSetlist(room.concert, parsed.orderedIds);
            broadcastToRoom(session.roomId, { priority: 'P0', type: 'CONCERT_STATE_UPDATED', concert: room.concert });
            setImmediate(persistRooms);
          }
          break;
        }

        case 'TRANSFER_HOST': {
          // Only Private rooms have a sole Host, and only that Host (or Admin) can transfer it to a present participant
          if (!room.isPrivate) return;
          if (session.userId !== room.concert.hostUserId && session.role !== 'ADMIN') return;
          const clients = roomClients.get(session.roomId);
          const target = clients?.get(parsed.targetUserId);
          if (!target || target.userId === room.concert.hostUserId) return;

          room.concert.hostUserId = target.userId;
          room.concert.performerName = target.displayName;
          broadcastToRoom(session.roomId, { priority: 'P0', type: 'CONCERT_STATE_UPDATED', concert: room.concert });
          broadcastToRoom(session.roomId, {
            priority: 'P2',
            type: 'SYSTEM_NOTICE',
            text: `👑 ${target.displayName} đã được chuyển quyền làm Host duy nhất của phòng.`,
          });
          setImmediate(persistRooms);
          break;
        }
      }
    });

    ws.on('close', () => {
      if (!session) return;
      const clients = roomClients.get(session.roomId);
      // Only remove if this exact WebSocket is still the active session for userId
      if (clients && clients.get(session.userId) === session) {
        clients.delete(session.userId);
        const room = getRoomById(session.roomId);
        if (room) {
          room.memberCount = clients.size;
          const released = releaseUserSeats(room.seats, session.userId);
          for (const seat of released) {
            broadcastToRoom(session.roomId, { priority: 'P0', type: 'SEAT_UPDATED', seat });
          }

          // Unexpected disconnect (crash / network drop): if sole Host of a Private room drops while others remain,
          // auto-handover Host: Priority 1 = Performer (ARTIST / invited performer), Priority 2 = Random Audience
          if (room.isPrivate && session.userId === room.concert.hostUserId && clients.size > 0) {
            const remaining = Array.from(clients.values());
            const performers = remaining.filter(
              (c) => c.role === 'ARTIST' || room.concert.invitedPerformerIds.includes(c.userId)
            );
            const nextHost =
              performers.length > 0
                ? performers[0]
                : remaining[Math.floor(Math.random() * remaining.length)];
            room.concert.hostUserId = nextHost.userId;
            room.concert.performerName = nextHost.displayName;
            persistRooms();
            broadcastToRoom(session.roomId, {
              priority: 'P0',
              type: 'CONCERT_STATE_UPDATED',
              concert: room.concert,
            });
            broadcastToRoom(session.roomId, {
              priority: 'P2',
              type: 'SYSTEM_NOTICE',
              text: `👑 Host cũ bị ngắt kết nối — ${nextHost.displayName} đã tự động trở thành Host duy nhất của phòng.`,
            });
          }

          // TBD-11: Performer disconnect auto-fallback to Prerecorded
          const isPerformer = session.role === 'ARTIST' || session.userId === room.concert.hostUserId;
          if (isPerformer && room.concert.state === 'LIVE') {
            const currentItem = room.concert.setlist[room.concert.currentSetlistIndex];
            if (currentItem && currentItem.mode !== 'PRERECORDED') {
              currentItem.mode = 'PRERECORDED';
              persistRooms();
              broadcastToRoom(session.roomId, {
                priority: 'P0',
                type: 'CONCERT_STATE_UPDATED',
                concert: room.concert,
                fallbackNotice: 'Performer disconnected — switched to Prerecorded fallback (TBD-11).',
              });
            }
          }
        }
        broadcastToRoom(session.roomId, { priority: 'P1', type: 'AVATAR_LEFT', userId: session.userId });
      }
    });
  });

  return wss;
}
