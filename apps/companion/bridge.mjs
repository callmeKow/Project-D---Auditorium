/**
 * Experiment F — Desktop Companion Bridge PoC (Loopback-only)
 * Security: binds strictly to 127.0.0.1:49152 per Blueprint Section 8.2.
 * Provides OS/DAW/virtual audio bridge availability status to the browser app.
 */
import os from 'node:os';
import { WebSocketServer } from 'ws';

const HOST = '127.0.0.1';
const PORT = 49152;

const wss = new WebSocketServer({ host: HOST, port: PORT });

wss.on('connection', (ws, req) => {
  const origin = req.headers.origin ?? '';
  if (origin && !origin.startsWith('http://localhost') && !origin.startsWith('http://127.0.0.1')) {
    ws.close(4003, 'ORIGIN_NOT_ALLOWED');
    return;
  }

  ws.send(
    JSON.stringify({
      type: 'COMPANION_HELLO',
      version: '0.1.0-poc',
      platform: os.platform(),
      arch: os.arch(),
      capabilities: {
        virtualAudioRouting: true,
        usbMidiForwarding: true,
        lowLatencyDriverHint: os.platform() === 'win32' ? 'WASAPI/ASIO' : 'CoreAudio/JACK',
      },
    })
  );
});

console.log(`[VMW Companion PoC] Listening on ws://${HOST}:${PORT} (loopback only)`);
