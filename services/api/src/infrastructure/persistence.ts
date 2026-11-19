import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = path.resolve(process.cwd(), '.data');
const STATE_FILE = path.join(DATA_DIR, 'vmw-state.json');

export interface PersistedSnapshot {
  users?: unknown[];
  sessions?: Record<string, string>;
  rooms?: unknown[];
  passcodes?: Record<string, string>;
  reports?: unknown[];
}

export function isPersistenceEnabled(): boolean {
  return !process.env.VITEST && process.env.VMW_DISABLE_PERSISTENCE !== '1';
}

export function loadSnapshot(): PersistedSnapshot | null {
  if (!isPersistenceEnabled()) return null;
  try {
    if (!fs.existsSync(STATE_FILE)) return null;
    const raw = fs.readFileSync(STATE_FILE, 'utf8');
    return JSON.parse(raw) as PersistedSnapshot;
  } catch {
    return null;
  }
}

export function saveSnapshot(patch: PersistedSnapshot): void {
  if (!isPersistenceEnabled()) return;
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const current = loadSnapshot() ?? {};
    const next: PersistedSnapshot = { ...current, ...patch };
    fs.writeFileSync(STATE_FILE, JSON.stringify(next, null, 2), 'utf8');
  } catch {
    // Non-fatal persistence error in dev
  }
}
