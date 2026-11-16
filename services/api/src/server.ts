import http from 'node:http';
import express from 'express';
import cors from 'cors';
import {
  getUserByToken,
  loginWithEmail,
  loginWithSocial,
  registerWithEmail,
  updateAvatarPreset,
} from './modules/identity/identity.module.js';
import { createSmallRoom, getRoomByCode, getRoomById, listRooms } from './modules/room/room.module.js';
import { holdSeat } from './modules/seating/seating.module.js';
import {
  applyModerationAction,
  listReports,
  resolveReport,
  submitReport,
} from './modules/moderation/moderation.module.js';
import { attachRealtimeGateway } from './modules/realtime/realtime.gateway.js';

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'vmw-modular-monolith' });
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
  const room = createSmallRoom({
    ...req.body,
    hostUserId: user.id,
    performerName: req.body.performerName || user.displayName,
  });
  res.status(201).json(room);
});

// 2D Seat Selection Hold
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

// Reports & Moderation
app.get('/reports', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  const user = getUserByToken(token);
  if (!user || (!user.roles.includes('ADMIN') && !user.roles.includes('HOST'))) {
    return res.status(403).json({ error: 'FORBIDDEN' });
  }
  res.json(listReports());
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
    res.json({ ok: true });
  } catch (err) {
    res.status(403).json({ error: (err as Error).message });
  }
});

const PORT = Number(process.env.PORT ?? 4000);
const server = http.createServer(app);
attachRealtimeGateway(server);

server.listen(PORT, () => {
  console.log(`[VMW API] Modular Monolith + Realtime Gateway listening on http://localhost:${PORT}`);
});
