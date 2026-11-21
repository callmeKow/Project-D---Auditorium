import fs from 'node:fs';
import path from 'node:path';
import { Pool } from 'pg';

const DATA_DIR = path.resolve(process.cwd(), '.data');
const STATE_FILE = path.join(DATA_DIR, 'vmw-state.json');

export interface PersistedSnapshot {
  users?: unknown[];
  sessions?: Record<string, string>;
  rooms?: unknown[];
  passcodes?: Record<string, string>;
  reports?: unknown[];
}

let pgPool: Pool | null = null;
let memorySnapshot: PersistedSnapshot | null = null;
let dbFlushTimer: NodeJS.Timeout | null = null;
let dbFlushing = false;
let dbFlushPending = false;

export function isPersistenceEnabled(): boolean {
  return !process.env.VITEST && process.env.VMW_DISABLE_PERSISTENCE !== '1';
}

export function isDatabaseConnected(): boolean {
  return pgPool !== null;
}

/**
 * Initializes PostgreSQL (Neon) persistence when DATABASE_URL is configured.
 * Falls back cleanly to local .data/vmw-state.json when DATABASE_URL is absent.
 */
export async function initDatabasePersistence(): Promise<PersistedSnapshot | null> {
  if (!isPersistenceEnabled()) return null;
  const dbUrl = process.env.DATABASE_URL?.trim();
  if (!dbUrl) {
    return loadSnapshot();
  }

  try {
    const pool = new Pool({
      connectionString: dbUrl,
      ssl: { rejectUnauthorized: false },
      max: 5,
      idleTimeoutMillis: 30000,
    });

    await pool.query(`
      CREATE TABLE IF NOT EXISTS vmw_state_snapshots (
        key TEXT PRIMARY KEY,
        payload JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS vmw_users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        display_name TEXT NOT NULL,
        google_sub TEXT UNIQUE,
        auth_provider TEXT NOT NULL DEFAULT 'EMAIL',
        avatar_preset_id TEXT NOT NULL DEFAULT 'chibi-classic',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    const res = await pool.query<{ payload: PersistedSnapshot }>(
      `SELECT payload FROM vmw_state_snapshots WHERE key = 'global' LIMIT 1`
    );

    pgPool = pool;
    if (res.rows[0]?.payload) {
      memorySnapshot = res.rows[0].payload;
      console.log('[VMW DB] Connected to PostgreSQL (Neon) and hydrated persisted state.');
      return memorySnapshot;
    }

    console.log('[VMW DB] Connected to PostgreSQL (Neon) with fresh empty state.');
    return null;
  } catch (err) {
    console.error('[VMW DB] Failed to connect PostgreSQL, falling back to local disk:', (err as Error).message);
    pgPool = null;
    return loadSnapshot();
  }
}

async function flushSnapshotToPostgres(): Promise<void> {
  if (!pgPool || !memorySnapshot) return;
  if (dbFlushing) {
    dbFlushPending = true;
    return;
  }
  dbFlushing = true;
  try {
    const snap = memorySnapshot;
    await pgPool.query(
      `INSERT INTO vmw_state_snapshots (key, payload, updated_at)
       VALUES ('global', $1::jsonb, NOW())
       ON CONFLICT (key) DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()`,
      [JSON.stringify(snap)]
    );

    // Also keep normalized vmw_users table up to date for easy inspection in Neon Console
    if (Array.isArray(snap.users)) {
      for (const raw of snap.users) {
        const u = raw as {
          id?: string;
          email?: string;
          displayName?: string;
          googleSub?: string;
          authProvider?: string;
          avatarPresetId?: string;
        };
        if (!u.id || !u.email) continue;
        await pgPool.query(
          `INSERT INTO vmw_users (id, email, display_name, google_sub, auth_provider, avatar_preset_id)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (id) DO UPDATE SET
             email = EXCLUDED.email,
             display_name = EXCLUDED.display_name,
             google_sub = COALESCE(EXCLUDED.google_sub, vmw_users.google_sub),
             auth_provider = EXCLUDED.auth_provider,
             avatar_preset_id = EXCLUDED.avatar_preset_id`,
          [
            u.id,
            u.email,
            u.displayName ?? 'Music Lover',
            u.googleSub ?? null,
            u.authProvider ?? 'EMAIL',
            u.avatarPresetId ?? 'chibi-classic',
          ]
        );
      }
    }
  } catch (err) {
    console.error('[VMW DB] Async snapshot flush failed:', (err as Error).message);
  } finally {
    dbFlushing = false;
    if (dbFlushPending) {
      dbFlushPending = false;
      void flushSnapshotToPostgres();
    }
  }
}

export function loadSnapshot(): PersistedSnapshot | null {
  if (!isPersistenceEnabled()) return null;
  if (memorySnapshot) return memorySnapshot;
  try {
    if (!fs.existsSync(STATE_FILE)) return null;
    const raw = fs.readFileSync(STATE_FILE, 'utf8');
    memorySnapshot = JSON.parse(raw) as PersistedSnapshot;
    return memorySnapshot;
  } catch {
    return null;
  }
}

export function saveSnapshot(patch: PersistedSnapshot): void {
  if (!isPersistenceEnabled()) return;
  const current = loadSnapshot() ?? {};
  const next: PersistedSnapshot = { ...current, ...patch };
  memorySnapshot = next;

  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(next, null, 2), 'utf8');
  } catch {
    // Non-fatal persistence error on ephemeral disks
  }

  if (pgPool) {
    if (dbFlushTimer) clearTimeout(dbFlushTimer);
    dbFlushTimer = setTimeout(() => {
      dbFlushTimer = null;
      void flushSnapshotToPostgres();
    }, 250);
  }
}
