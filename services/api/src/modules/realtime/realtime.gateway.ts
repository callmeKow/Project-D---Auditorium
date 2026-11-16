import crypto from 'node:crypto';
import type { Server as HttpServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import type {
  AvatarTransformPayload,
  ChatMessageDTO,
  RealtimeClientMessage,
  RealtimeServerMessage,
  UserRole,
} from '@vmw/contracts';
import { getRoomById } from '../room/room.module.js';
import { occupySeat, releaseUserSeats } from '../seating/seating.module.js';
import { isUserBanned, isUserMuted } from '../moderation/moderation.module.js';

interface ClientSession {
  ws: WebSocket;
  roomId: string;
  userId: string;
  displayName: string;
  role: UserRole;
  avatar: AvatarTransformPayload;
  lastChatAt: number;
}

const roomClients = new Map<string, Map<string, ClientSession>>(); // roomId -> userId -> session
const roomChatHistory = new Map<string, ChatMessageDTO[]>();

// Restrict audience movement to aisles/seating area (z >= 0.8, |x| <= 5.5, z <= 8.5)
export function clampAuditoriumPosition(
  pos: [number, number, number],
  role: UserRole
): [number, number, number] {
  const minZ = role === 'ARTIST' ? -3.2 : 0.8; // Audience cannot step onto the stage (z < 0.8)
  const x = Math.max(-5.5, Math.min(5.5, pos[0]));
  const y = Math.max(0, Math.min(1.5, pos[1]));
  const z = Math.max(minZ, Math.min(8.5, pos[2]));
  return [Number(x.toFixed(3)), Number(y.toFixed(3)), Number(z.toFixed(3))];
}

function broadcast(roomId: string, msg: RealtimeServerMessage, exceptUserId?: string) {
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

      if (parsed.type === 'JOIN_ROOM') {
        const room = getRoomById(parsed.roomId);
        if (!room) return;
        if (isUserBanned(room.id, parsed.userId)) {
          ws.send(
            JSON.stringify({
              priority: 'P0',
              type: 'MODERATION_ACTION',
              action: 'BAN',
              targetUserId: parsed.userId,
              reason: 'User is banned from this room.',
            } satisfies RealtimeServerMessage)
          );
          ws.close();
          return;
        }

        const clients = roomClients.get(room.id) ?? new Map<string, ClientSession>();
        if (clients.size >= room.capacity && !clients.has(parsed.userId)) {
          ws.close(4003, 'ROOM_FULL');
          return;
        }
        roomClients.set(room.id, clients);

        const spawnPos: [number, number, number] =
          parsed.role === 'ARTIST' ? [0, 0.35, -1.6] : [0, 0, 5.2];

        const avatar: AvatarTransformPayload = {
          userId: parsed.userId,
          displayName: parsed.displayName,
          role: parsed.role,
          avatarPresetId: parsed.avatarPresetId,
          position: spawnPos,
          rotationY: parsed.role === 'ARTIST' ? 0 : Math.PI,
          animation: 'IDLE',
          seq: 0,
        };

        session = {
          ws,
          roomId: room.id,
          userId: parsed.userId,
          displayName: parsed.displayName,
          role: parsed.role,
          avatar,
          lastChatAt: 0,
        };

        clients.set(parsed.userId, session);
        room.memberCount = clients.size;

        const snapshot: RealtimeServerMessage = {
          priority: 'P0',
          type: 'ROOM_SNAPSHOT',
          room,
          avatars: Array.from(clients.values()).map((c) => c.avatar),
          chat: roomChatHistory.get(room.id) ?? [],
        };
        ws.send(JSON.stringify(snapshot));
        broadcast(room.id, { priority: 'P1', type: 'AVATAR_STATE', avatar }, parsed.userId);
        return;
      }

      if (!session) return;
      const room = getRoomById(session.roomId);
      if (!room) return;

      switch (parsed.type) {
        case 'AVATAR_MOVE': {
          if (parsed.seq <= session.avatar.seq && parsed.seq !== 0) return; // Drop stale packet
          session.avatar.position = clampAuditoriumPosition(parsed.position, session.role);
          session.avatar.rotationY = parsed.rotationY;
          session.avatar.animation = parsed.animation;
          session.avatar.seq = parsed.seq;
          broadcast(
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
            session.avatar.rotationY = Math.PI;
            session.avatar.animation = 'SIT';
            for (const r of released) {
              broadcast(session.roomId, { priority: 'P0', type: 'SEAT_UPDATED', seat: r });
            }
            broadcast(session.roomId, { priority: 'P0', type: 'SEAT_UPDATED', seat: occupied });
            broadcast(session.roomId, { priority: 'P1', type: 'AVATAR_STATE', avatar: session.avatar });
          } catch {
            // Seat unavailable
          }
          break;
        }

        case 'LEAVE_SEAT': {
          const released = releaseUserSeats(room.seats, session.userId);
          session.avatar.seatId = undefined;
          session.avatar.animation = 'STAND';
          for (const r of released) {
            broadcast(session.roomId, { priority: 'P0', type: 'SEAT_UPDATED', seat: r });
          }
          broadcast(session.roomId, { priority: 'P1', type: 'AVATAR_STATE', avatar: session.avatar });
          break;
        }

        case 'CHAT_SEND': {
          const now = Date.now();
          if (isUserMuted(session.roomId, session.userId)) return;
          if (now - session.lastChatAt < 500) return; // Rate limit 2 msgs/sec
          const text = parsed.text.trim().slice(0, 300);
          if (!text) return;
          session.lastChatAt = now;

          const message: ChatMessageDTO = {
            id: `msg-${crypto.randomUUID().slice(0, 8)}`,
            roomId: session.roomId,
            userId: session.userId,
            displayName: session.displayName,
            role: session.role,
            text,
            timestamp: now,
          };
          const hist = roomChatHistory.get(session.roomId) ?? [];
          hist.push(message);
          if (hist.length > 100) hist.shift();
          roomChatHistory.set(session.roomId, hist);

          broadcast(session.roomId, { priority: 'P2', type: 'CHAT_MESSAGE', message });
          break;
        }

        case 'REACTION_SEND': {
          broadcast(session.roomId, {
            priority: 'P2',
            type: 'REACTION',
            userId: session.userId,
            reaction: parsed.reaction,
          });
          break;
        }

        case 'MIDI_EVENT': {
          broadcast(
            session.roomId,
            { priority: 'P1', type: 'AUDIO_TIMING_MIDI', event: parsed.event },
            session.userId
          );
          break;
        }

        case 'WEBRTC_SIGNAL': {
          const clients = roomClients.get(session.roomId);
          if (!clients) return;
          const payload: RealtimeServerMessage = {
            priority: 'P1',
            type: 'WEBRTC_SIGNAL',
            fromUserId: session.userId,
            signal: parsed.signal,
          };
          if (parsed.targetUserId) {
            const target = clients.get(parsed.targetUserId);
            if (target && target.ws.readyState === WebSocket.OPEN) {
              target.ws.send(JSON.stringify(payload));
            }
          } else {
            broadcast(session.roomId, payload, session.userId);
          }
          break;
        }

        case 'PERFORMER_CONCERT_CONTROL': {
          if (session.role !== 'ARTIST' && session.role !== 'HOST' && session.role !== 'ADMIN') {
            return; // Server-side RBAC
          }
          const concert = room.concert;
          if (parsed.action === 'START_SOUND_CHECK') concert.state = 'SOUND_CHECK';
          if (parsed.action === 'GO_LIVE') concert.state = 'LIVE';
          if (parsed.action === 'PAUSE') concert.state = 'PAUSED';
          if (parsed.action === 'INTERMISSION') concert.state = 'INTERMISSION';
          if (parsed.action === 'COMPLETE') concert.state = 'COMPLETED';
          if (parsed.action === 'NEXT_SONG' && concert.setlist.length > 0) {
            concert.currentSetlistIndex = (concert.currentSetlistIndex + 1) % concert.setlist.length;
            const currentItem = concert.setlist[concert.currentSetlistIndex];
            broadcast(session.roomId, { priority: 'P2', type: 'LIGHTING_CUE', preset: currentItem.lightingPreset });
          }
          if (parsed.action === 'TOGGLE_MODE' && concert.setlist[concert.currentSetlistIndex]) {
            const item = concert.setlist[concert.currentSetlistIndex];
            item.mode = item.mode === 'LIVE' ? 'PRERECORDED' : 'LIVE';
          }
          if (parsed.action === 'END_SONG') {
            const item = concert.setlist[concert.currentSetlistIndex];
            broadcast(session.roomId, {
              priority: 'P2',
              type: 'SONG_ENDED_APPLAUSE',
              setlistItemId: item?.id ?? 'unknown',
            });
          }
          broadcast(session.roomId, { priority: 'P0', type: 'CONCERT_STATE_UPDATED', concert });
          break;
        }
      }
    });

    ws.on('close', () => {
      if (!session) return;
      const clients = roomClients.get(session.roomId);
      if (clients) {
        clients.delete(session.userId);
        const room = getRoomById(session.roomId);
        if (room) {
          room.memberCount = clients.size;
          const released = releaseUserSeats(room.seats, session.userId);
          for (const seat of released) {
            broadcast(session.roomId, { priority: 'P0', type: 'SEAT_UPDATED', seat });
          }
        }
      }
      broadcast(session.roomId, { priority: 'P1', type: 'AVATAR_LEFT', userId: session.userId });
    });
  });

  return wss;
}
