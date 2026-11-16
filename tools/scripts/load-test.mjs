/**
 * Phase 4 / Experiment D Multiplayer Load Test Harness
 * Simulates N concurrent users across Small Rooms (10-20 capacity each) targeting 100-500 CCU.
 * Usage: node tools/scripts/load-test.mjs [apiBase=http://localhost:4000] [ccu=100]
 */
import { WebSocket } from 'ws';

const API_BASE = process.argv[2] ?? 'http://localhost:4000';
const TARGET_CCU = Number(process.argv[3] ?? 100);
const ROOM_CAPACITY = 20;

async function main() {
  console.log(`[VMW Load Test] Target CCU: ${TARGET_CCU} against ${API_BASE}`);

  const loginRes = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'linh.piano@vmw.vn', password: 'demo1234' }),
  });
  if (!loginRes.ok) throw new Error(`Login failed: ${loginRes.status}`);
  const { token } = await loginRes.json();

  const roomCount = Math.ceil(TARGET_CCU / ROOM_CAPACITY);
  const roomIds = [];
  for (let i = 0; i < roomCount; i++) {
    const res = await fetch(`${API_BASE}/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        name: `Load Test Small Hall #${i + 1}`,
        capacity: ROOM_CAPACITY,
        concertTitle: `Load Concert #${i + 1}`,
        genre: 'Acoustic',
        format: 'SOLO',
        isSpontaneous: true,
      }),
    });
    const room = await res.json();
    roomIds.push(room.id);
  }

  const wsBase = API_BASE.replace(/^http/, 'ws');
  const sockets = [];
  let joined = 0;
  let errors = 0;
  const startedAt = Date.now();

  for (let i = 0; i < TARGET_CCU; i++) {
    const roomId = roomIds[i % roomIds.length];
    const ws = new WebSocket(`${wsBase}/ws`);
    sockets.push(ws);

    ws.on('open', () => {
      ws.send(
        JSON.stringify({
          type: 'JOIN_ROOM',
          roomId,
          userId: `load-user-${i}`,
          displayName: `Listener ${i}`,
          role: 'AUDIENCE',
          avatarPresetId: 'chibi-classic',
        })
      );
    });

    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'ROOM_SNAPSHOT') {
        joined += 1;
        ws.send(
          JSON.stringify({
            type: 'AVATAR_MOVE',
            position: [(i % 5) - 2, 0, 4.5],
            rotationY: Math.PI,
            animation: 'IDLE',
            seq: 1,
          })
        );
      }
    });

    ws.on('error', () => {
      errors += 1;
    });
  }

  await new Promise((r) => setTimeout(r, 3000));
  const elapsedMs = Date.now() - startedAt;
  console.log(
    `[VMW Load Test] Result: ${joined}/${TARGET_CCU} joined across ${roomIds.length} rooms in ${elapsedMs}ms (errors: ${errors})`
  );

  for (const ws of sockets) ws.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
