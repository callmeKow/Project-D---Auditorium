import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import cors from 'cors';
import {
  deleteUserAccount,
  exportUserData,
  getUserByToken,
  loginWithEmail,
  loginWithGoogleIdToken,
  loginWithSocial,
  registerWithEmail,
  rehydrateIdentityFromPersistence,
  updateAvatarPreset,
} from './modules/identity/identity.module.js';
import {
  createSmallRoom,
  getRoomByCode,
  getRoomById,
  listRooms,
  persistRooms,
  rehydrateRoomsFromPersistence,
  setRoomState,
  verifyRoomPasscode,
} from './modules/room/room.module.js';
import { initDatabasePersistence, isDatabaseConnected } from './infrastructure/persistence.js';
import { holdSeat, reserveSeat, toggleSeatLock } from './modules/seating/seating.module.js';
import {
  applyModerationAction,
  listReports,
  resolveReport,
  submitReport,
} from './modules/moderation/moderation.module.js';
import {
  attachRealtimeGateway,
  broadcastToRoom,
  disconnectUserFromRoom,
  getConnectedClientCount,
} from './modules/realtime/realtime.gateway.js';
import { assertAdminOrHost, canControlConcert } from './modules/authorization/authorization.module.js';
import { addSetlistItem, invitePerformerToStage, removeSetlistItem } from './modules/concert/concert.module.js';
import { getAnalyticsSummary } from './modules/analytics/analytics.module.js';

export function createApp() {
  const app = express();
  const corsOrigin = process.env.CORS_ORIGIN?.trim();
  app.use(
    cors(
      corsOrigin && corsOrigin !== '*'
        ? { origin: corsOrigin.split(',').map((o) => o.trim()), credentials: true }
        : undefined
    )
  );
  app.use(express.json());
  const uploadsDir = path.resolve(process.cwd(), 'data', 'uploads');
  fs.mkdirSync(uploadsDir, { recursive: true });
  app.use('/media', express.static(uploadsDir));

  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'vmw-modular-monolith',
      uptimeSec: Math.round(process.uptime()),
      activeRooms: listRooms().length,
      connectedClients: getConnectedClientCount(),
      databaseConnected: isDatabaseConnected(),
    });
  });

  app.get('/metrics', (_req, res) => {
    res.json(getAnalyticsSummary(listRooms().length, getConnectedClientCount()));
  });

  // Identity & Auth
  app.post('/auth/register', (req, res) => {
    try {
      const result = registerWithEmail(req.body);
      res.status(201).json(result);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/auth/login', (req, res) => {
    try {
      const result = loginWithEmail(req.body.email, req.body.password);
      res.json(result);
    } catch (err) {
      res.status(401).json({ error: (err as Error).message });
    }
  });

  app.post('/auth/social', (req, res) => {
    try {
      const result = loginWithSocial(req.body);
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/auth/google', async (req, res) => {
    try {
      const result = await loginWithGoogleIdToken({
        idToken: String(req.body?.idToken ?? ''),
        ageConfirmed16Plus: Boolean(req.body?.ageConfirmed16Plus ?? true),
      });
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.patch('/profiles/avatar', (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    const user = getUserByToken(token);
    if (!user) return res.status(401).json({ error: 'UNAUTHORIZED' });
    try {
      const updated = updateAvatarPreset(user.id, req.body.avatarPresetId);
      res.json(updated);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  // User Data Management (SEC-16 / SEC-17)
  app.get('/users/me/export', (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    const user = getUserByToken(token);
    if (!user) return res.status(401).json({ error: 'UNAUTHORIZED' });
    res.json(exportUserData(user.id));
  });

  app.delete('/users/me', (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    const user = getUserByToken(token);
    if (!user) return res.status(401).json({ error: 'UNAUTHORIZED' });
    deleteUserAccount(user.id);
    res.json({ ok: true });
  });

  // Rooms & Concerts
  app.get('/rooms', (_req, res) => {
    res.json(listRooms());
  });

  app.get('/rooms/code/:code', (req, res) => {
    const room = getRoomByCode(req.params.code);
    if (!room) return res.status(404).json({ error: 'ROOM_NOT_FOUND' });
    res.json(room);
  });

  app.get('/rooms/:roomId', (req, res) => {
    const room = getRoomById(req.params.roomId);
    if (!room) return res.status(404).json({ error: 'ROOM_NOT_FOUND' });
    res.json(room);
  });

  app.post('/rooms', (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    const user = getUserByToken(token);
    if (!user) return res.status(401).json({ error: 'UNAUTHORIZED' });
    try {
      const room = createSmallRoom({
        ...req.body,
        hostUserId: user.id,
        performerName: req.body.performerName || user.displayName,
      });
      res.status(201).json(room);
    } catch (err) {
      res.status(409).json({ error: (err as Error).message });
    }
  });

  app.patch('/rooms/:roomId/state', (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    const user = getUserByToken(token);
    if (!user) return res.status(401).json({ error: 'UNAUTHORIZED' });
    const room = getRoomById(req.params.roomId);
    if (!room) return res.status(404).json({ error: 'ROOM_NOT_FOUND' });
    if (!canControlConcert(user.id, user.roles, room.concert)) {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }
    const updated = setRoomState(room.id, req.body.state);
    broadcastToRoom(room.id, { priority: 'P0', type: 'ROOM_STATE_UPDATED', roomState: updated.state });
    res.json(updated);
  });

  app.post('/rooms/:roomId/verify-passcode', (req, res) => {
    const room = getRoomById(req.params.roomId);
    if (!room) return res.status(404).json({ error: 'ROOM_NOT_FOUND' });
    if (!verifyRoomPasscode(room.id, req.body?.passcode)) {
      return res.status(403).json({ error: 'INVALID_PASSCODE' });
    }
    res.json({ ok: true });
  });

  // Editable Setlist (SM-08) & Performer Invites (LMR-09)
  app.post('/rooms/:roomId/setlist', (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    const user = getUserByToken(token);
    if (!user) return res.status(401).json({ error: 'UNAUTHORIZED' });
    const room = getRoomById(req.params.roomId);
    if (!room) return res.status(404).json({ error: 'ROOM_NOT_FOUND' });
    if (!canControlConcert(user.id, user.roles, room.concert, room.venueStyle, room.isPrivate)) {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }
    try {
      const item = addSetlistItem(room.concert, req.body);
      persistRooms();
      broadcastToRoom(room.id, { priority: 'P0', type: 'CONCERT_STATE_UPDATED', concert: room.concert });
      res.status(201).json(item);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  const ALLOWED_MEDIA_EXTS = new Set(['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac', '.mp4', '.webm', '.mov']);
  const VIDEO_MEDIA_EXTS = new Set(['.mp4', '.webm', '.mov']);

  app.post(
    '/rooms/:roomId/setlist/upload',
    express.raw({ type: ['audio/*', 'video/*', 'application/octet-stream'], limit: '80mb' }),
    (req, res) => {
      const token = req.headers.authorization?.replace('Bearer ', '');
      const user = getUserByToken(token);
      if (!user) return res.status(401).json({ error: 'UNAUTHORIZED' });
      const room = getRoomById(req.params.roomId);
      if (!room) return res.status(404).json({ error: 'ROOM_NOT_FOUND' });
      if (!canControlConcert(user.id, user.roles, room.concert, room.venueStyle, room.isPrivate)) {
        return res.status(403).json({ error: 'FORBIDDEN' });
      }
      const buf = req.body as Buffer;
      if (!Buffer.isBuffer(buf) || buf.length === 0) {
        return res.status(400).json({ error: 'EMPTY_MEDIA_FILE' });
      }
      const rawName = decodeURIComponent(String(req.headers['x-file-name'] || 'track.mp3'));
      const ext = path.extname(rawName).toLowerCase();
      if (!ALLOWED_MEDIA_EXTS.has(ext)) {
        return res.status(400).json({ error: 'UNSUPPORTED_MEDIA_FORMAT' });
      }
      const savedName = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}${ext}`;
      fs.writeFileSync(path.join(uploadsDir, savedName), buf);

      const rawTitle = decodeURIComponent(String(req.headers['x-track-title'] || '')).trim();
      const baseTitle = path.basename(rawName, ext).trim() || 'Uploaded Track';
      const rawDur = Number(req.headers['x-duration-sec']);
      const durationSec = Number.isFinite(rawDur) && rawDur > 5 ? Math.round(rawDur) : 210;
      const mediaType = VIDEO_MEDIA_EXTS.has(ext) ? 'VIDEO' : 'AUDIO';

      try {
        const item = addSetlistItem(room.concert, {
          title: rawTitle || baseTitle,
          artistName: user.displayName,
          durationSec,
          mode: 'PRERECORDED',
          mediaUrl: `/media/${savedName}`,
          mediaType,
        });
        persistRooms();
        broadcastToRoom(room.id, { priority: 'P0', type: 'CONCERT_STATE_UPDATED', concert: room.concert });
        res.status(201).json(item);
      } catch (err) {
        res.status(400).json({ error: (err as Error).message });
      }
    }
  );

  app.delete('/rooms/:roomId/setlist/:itemId', (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    const user = getUserByToken(token);
    if (!user) return res.status(401).json({ error: 'UNAUTHORIZED' });
    const room = getRoomById(req.params.roomId);
    if (!room) return res.status(404).json({ error: 'ROOM_NOT_FOUND' });
    if (!canControlConcert(user.id, user.roles, room.concert, room.venueStyle, room.isPrivate)) {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }
    try {
      const concert = removeSetlistItem(room.concert, req.params.itemId);
      persistRooms();
      broadcastToRoom(room.id, { priority: 'P0', type: 'CONCERT_STATE_UPDATED', concert });
      res.json(concert);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/rooms/:roomId/performers/invite', (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    const user = getUserByToken(token);
    if (!user) return res.status(401).json({ error: 'UNAUTHORIZED' });
    const room = getRoomById(req.params.roomId);
    if (!room) return res.status(404).json({ error: 'ROOM_NOT_FOUND' });
    if (!canControlConcert(user.id, user.roles, room.concert)) {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }
    try {
      const concert = invitePerformerToStage(room.concert, req.body.performerUserId);
      persistRooms();
      broadcastToRoom(room.id, { priority: 'P0', type: 'CONCERT_STATE_UPDATED', concert });
      res.json(concert);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  // 2D Seat Selection Hold, Advance Reservation (TBD-04) & Host Lock (TBD-12)
  app.post('/rooms/:roomId/seats/:seatId/hold', (req, res) => {
    const room = getRoomById(req.params.roomId);
    if (!room) return res.status(404).json({ error: 'ROOM_NOT_FOUND' });
    const userId = req.body.userId;
    if (!userId) return res.status(400).json({ error: 'MISSING_USER_ID' });
    try {
      const seat = holdSeat(room.seats, req.params.seatId, userId);
      res.json(seat);
    } catch (err) {
      res.status(409).json({ error: (err as Error).message });
    }
  });

  app.post('/rooms/:roomId/seats/:seatId/reserve', (req, res) => {
    const room = getRoomById(req.params.roomId);
    if (!room) return res.status(404).json({ error: 'ROOM_NOT_FOUND' });
    const userId = req.body.userId;
    if (!userId) return res.status(400).json({ error: 'MISSING_USER_ID' });
    try {
      const seat = reserveSeat(room.seats, req.params.seatId, userId);
      persistRooms();
      broadcastToRoom(room.id, { priority: 'P0', type: 'SEAT_UPDATED', seat });
      res.json(seat);
    } catch (err) {
      res.status(409).json({ error: (err as Error).message });
    }
  });

  app.post('/rooms/:roomId/seats/:seatId/lock', (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    const user = getUserByToken(token);
    if (!user) return res.status(401).json({ error: 'UNAUTHORIZED' });
    const room = getRoomById(req.params.roomId);
    if (!room) return res.status(404).json({ error: 'ROOM_NOT_FOUND' });
    const canLockSeat = room.isPrivate
      ? user.roles.includes('ADMIN') || room.concert.hostUserId === user.id
      : user.roles.includes('ADMIN') || user.roles.includes('HOST') || room.concert.hostUserId === user.id;
    if (!canLockSeat) {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }
    try {
      const seat = toggleSeatLock(room.seats, req.params.seatId);
      persistRooms();
      broadcastToRoom(room.id, { priority: 'P0', type: 'SEAT_UPDATED', seat });
      res.json(seat);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  // Reports, Moderation & Analytics
  app.get('/reports', (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    const user = getUserByToken(token);
    try {
      assertAdminOrHost(user);
      res.json(listReports());
    } catch (err) {
      const code = (err as Error).message === 'UNAUTHORIZED' ? 401 : 403;
      res.status(code).json({ error: (err as Error).message });
    }
  });

  app.get('/analytics/summary', (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    const user = getUserByToken(token);
    try {
      assertAdminOrHost(user);
      res.json(getAnalyticsSummary(listRooms().length, getConnectedClientCount()));
    } catch (err) {
      const code = (err as Error).message === 'UNAUTHORIZED' ? 401 : 403;
      res.status(code).json({ error: (err as Error).message });
    }
  });

  app.post('/reports', (req, res) => {
    const report = submitReport(req.body);
    res.status(201).json(report);
  });

  app.post('/reports/:reportId/resolve', (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    const user = getUserByToken(token);
    if (!user) return res.status(401).json({ error: 'UNAUTHORIZED' });
    try {
      res.json(resolveReport(req.params.reportId, user.roles));
    } catch (err) {
      res.status(403).json({ error: (err as Error).message });
    }
  });

  app.post('/moderation/action', (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    const user = getUserByToken(token);
    if (!user) return res.status(401).json({ error: 'UNAUTHORIZED' });
    try {
      applyModerationAction({
        roomId: req.body.roomId,
        actorRoles: user.roles,
        targetUserId: req.body.targetUserId,
        action: req.body.action,
      });
      disconnectUserFromRoom(
        req.body.roomId,
        req.body.targetUserId,
        req.body.action,
        `Action issued by ${user.displayName}`
      );
      res.json({ ok: true });
    } catch (err) {
      res.status(403).json({ error: (err as Error).message });
    }
  });

  return app;
}

if (!process.env.VITEST) {
  const PORT = Number(process.env.PORT ?? 4000);
  void (async () => {
    await initDatabasePersistence();
    rehydrateIdentityFromPersistence();
    rehydrateRoomsFromPersistence();

    const app = createApp();
    const server = http.createServer(app);
    attachRealtimeGateway(server);

    server.listen(PORT, () => {
      console.log(`[VMW API] Modular Monolith + Realtime Gateway listening on http://localhost:${PORT}`);
    });
  })();
}
