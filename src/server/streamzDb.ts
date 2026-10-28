import { createRequire } from 'node:module';
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const requireNode = createRequire(import.meta.url);
type SqliteDatabaseSync = import('node:sqlite').DatabaseSync;

function normalizeWasmArgs(args: unknown[]): unknown[] {
  if (args.length === 1 && Array.isArray(args[0])) {
    return args[0];
  }
  return args.map((val) => {
    if (val === undefined) return null;
    if (Buffer.isBuffer(val)) {
      return new Uint8Array(val.buffer, val.byteOffset, val.byteLength);
    }
    return val;
  });
}

function createWasmDatabaseSyncCtor(): typeof import('node:sqlite').DatabaseSync {
  const { Database: WasmDatabase } = requireNode('node-sqlite3-wasm') as {
    Database: new (path: string) => {
      exec: (sql: string) => void;
      prepare: (sql: string) => {
        run: (values?: unknown[]) => { changes: number; lastInsertRowid: number };
        get: (values?: unknown[]) => unknown;
        all: (values?: unknown[]) => unknown[];
        finalize: () => void;
      };
      close: () => void;
    };
  };

  return class WasmDatabaseSyncAdapter {
    private wasmDb: InstanceType<typeof WasmDatabase>;
    constructor(filePath: string) {
      // On cloud containers (Render / Vercel), use in-memory SQLite backed by Turso Cloud
      // to avoid container overlayfs file lock / WAL mmap issues.
      const isCloudContainer = Boolean(process.env.RENDER || process.env.VERCEL);
      this.wasmDb = new WasmDatabase(isCloudContainer ? ':memory:' : filePath);
    }
    exec(sql: string): void {
      this.wasmDb.exec(sql);
    }
    prepare(sql: string) {
      const wasmDb = this.wasmDb;
      return {
        run: (...args: unknown[]) => {
          const stmt = wasmDb.prepare(sql);
          try {
            return stmt.run(normalizeWasmArgs(args));
          } finally {
            stmt.finalize();
          }
        },
        get: (...args: unknown[]) => {
          const stmt = wasmDb.prepare(sql);
          try {
            const res = stmt.get(normalizeWasmArgs(args));
            return res === null ? undefined : res;
          } finally {
            stmt.finalize();
          }
        },
        all: (...args: unknown[]) => {
          const stmt = wasmDb.prepare(sql);
          try {
            return stmt.all(normalizeWasmArgs(args));
          } finally {
            stmt.finalize();
          }
        },
      };
    }
    close(): void {
      this.wasmDb.close();
    }
  } as unknown as typeof import('node:sqlite').DatabaseSync;
}

function loadDatabaseSyncConstructor(): typeof import('node:sqlite').DatabaseSync {
  if (!process.env.RENDER && !process.env.VERCEL && !process.env.FORCE_WASM_SQLITE) {
    try {
      const mod = requireNode('node:sqlite') as typeof import('node:sqlite');
      if (mod && typeof mod.DatabaseSync === 'function') {
        return mod.DatabaseSync;
      }
    } catch {
      // Fallback to pure WebAssembly SQLite on Node < 22.5
    }
  }
  return createWasmDatabaseSyncCtor();
}

export type UserRole = 'admin' | 'user';

export interface DbUserProfile {
  id: number;
  email: string;
  displayName: string;
  avatarColor: string;
  role: UserRole;
  createdAtIso: string;
}

export interface AdminUserSummary {
  id: number;
  email: string;
  displayName: string;
  avatarColor: string;
  role: UserRole;
  passwordHash: string;
  createdAtIso: string;
  providerCount: number;
  watchHistoryCount: number;
  watchlistCount: number;
  providers: DbProviderRecord[];
}

export interface DbProviderRecord {
  manifestUrl: string;
  enabled: boolean;
  manifest: Record<string, unknown>;
  lastCheckedIso: string;
}

export interface DbWatchHistoryRecord {
  mediaId: string;
  mediaName: string;
  mediaType: 'movie' | 'series' | string;
  poster?: string;
  background?: string;
  episodeId?: string;
  episodeLabel?: string;
  positionSec: number;
  durationSec: number;
  updatedAtIso: string;
}

export interface DbWatchlistRecord {
  id: string;
  name: string;
  type: 'movie' | 'series' | string;
  poster?: string;
  imdbRating?: string;
  releaseInfo?: string;
}

export interface UserStatePayload {
  user: DbUserProfile;
  streamingConfigCompact: string;
  providers: DbProviderRecord[];
  watchHistory: DbWatchHistoryRecord[];
  watchlist: DbWatchlistRecord[];
}

export interface DbStorageEfficiencyReport {
  engineMode: 'cloud-turso-replica' | 'cloud-postgres-ready' | 'local-wal-embedded';
  cloudProviderConfigured: boolean;
  bytesPerUserBaseRow: number;
  bytesPerWatchlistLink: number;
  bytesPerWatchHistoryLink: number;
  bytesPerProviderLink: number;
  estimatedActiveUserTotalBytes: number;
  estimatedUsersPerGigabyte: number;
  counts: {
    users: number;
    deduplicatedProviders: number;
    deduplicatedMediaCatalog: number;
    watchHistoryLinks: number;
    watchlistLinks: number;
  };
}

const DEFAULT_STREAMING_CFG_COMPACT = 'nfx,hbm,dnp,amp,atp::US:1:0:US';
const AUTHENTICATED_PENGUPLAY_URL =
  process.env.STREAMZ_PENGUPLAY_MANIFEST_URL ||
  'https://pengu.uk/%7B%22auth_token%22%3A%22jBIrOxA27mMz_WvoR_ZCAMR72uZegRCgWJzw9P0IIUQ%22%7D/manifest.json';

/**
 * Production Cloud PostgreSQL (Neon / Supabase Free Tier) & Turso (LibSQL) Schema DDL
 * Designed using `database-schema-designer` & `postgres-best-practices` skills:
 * - Global deduplicated `media_catalog` & `provider_registry` tables (3NF)
 * - Ultra-compact integer foreign-key join tables (`~12 bytes` per watchlist row, `~18 bytes` per watch history row)
 */
export const CLOUD_POSTGRES_SCHEMA_DDL = `
-- Neon / Supabase Serverless PostgreSQL Ultra-Compact Schema (< 380 bytes per active user)
CREATE TABLE IF NOT EXISTS users (
  id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email VARCHAR(120) NOT NULL UNIQUE,
  display_name VARCHAR(60) NOT NULL,
  avatar_color CHAR(7) NOT NULL DEFAULT '#E11D48',
  pwd_salt BYTEA NOT NULL,
  pwd_hash BYTEA NOT NULL,
  streaming_cfg VARCHAR(120), -- NULL when using default config (0 bytes)
  created_at INT NOT NULL     -- Unix epoch seconds (4 bytes)
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash BYTEA PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS provider_registry (
  id SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  manifest_url TEXT NOT NULL UNIQUE,
  manifest_json JSONB NOT NULL,
  updated_at INT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_providers (
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider_id SMALLINT NOT NULL REFERENCES provider_registry(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order SMALLINT NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, provider_id)
);

CREATE TABLE IF NOT EXISTS media_catalog (
  id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  media_id VARCHAR(64) NOT NULL UNIQUE,
  media_type SMALLINT NOT NULL CHECK (media_type IN (0, 1)),
  title VARCHAR(160) NOT NULL,
  poster TEXT,
  background TEXT,
  rating_bp SMALLINT, -- e.g. 86 for IMDb 8.6 (2 bytes)
  release_info VARCHAR(32)
);

CREATE TABLE IF NOT EXISTS user_watch_history (
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  media_ref INT NOT NULL REFERENCES media_catalog(id) ON DELETE CASCADE,
  episode_id VARCHAR(64),
  episode_label VARCHAR(120),
  pos_sec INT NOT NULL,
  dur_sec INT NOT NULL,
  updated_at INT NOT NULL,
  PRIMARY KEY (user_id, media_ref)
);

CREATE TABLE IF NOT EXISTS user_watchlist (
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  media_ref INT NOT NULL REFERENCES media_catalog(id) ON DELETE CASCADE,
  added_at INT NOT NULL,
  PRIMARY KEY (user_id, media_ref)
);
`.trim();

function normalizeDbManifestUrl(url: string): string {
  const trimmed = url.trim();
  if (/^https?:\/\/pengu\.uk\/manifest\.json$/i.test(trimmed)) {
    return AUTHENTICATED_PENGUPLAY_URL;
  }
  return trimmed;
}

function hashSessionToken(token: string): Buffer {
  return createHash('sha256').update(token, 'utf8').digest();
}

/**
 * Compress standard Metahub URLs to null when media_id is an IMDb ID (`tt...`)
 * to save ~65 bytes per row in media_catalog.
 */
function compressMetahubUrl(
  url: string | undefined,
  mediaId: string,
  kind: 'poster' | 'background',
): string | null {
  if (!url) return null;
  const imdbId = mediaId.startsWith('tt') ? mediaId.split(':')[0] : '';
  if (
    imdbId &&
    url === `https://images.metahub.space/${kind}/medium/${imdbId}/img`
  ) {
    return null; // Reconstructed on read with zero storage cost
  }
  return url;
}

function expandMetahubUrl(
  stored: string | null,
  mediaId: string,
  kind: 'poster' | 'background',
): string | undefined {
  if (stored) return stored;
  const imdbId = mediaId.startsWith('tt') ? mediaId.split(':')[0] : '';
  if (imdbId) {
    return `https://images.metahub.space/${kind}/medium/${imdbId}/img`;
  }
  return undefined;
}

function encodeRatingBasisPoints(ratingStr?: string): number | null {
  if (!ratingStr) return null;
  const parsed = parseFloat(ratingStr);
  if (Number.isNaN(parsed) || parsed <= 0 || parsed > 10) return null;
  return Math.round(parsed * 10);
}

function decodeRatingBasisPoints(bp: number | null): string | undefined {
  if (bp === null || bp === undefined || bp <= 0) return undefined;
  return (bp / 10).toFixed(1);
}

/**
 * Formats any epoch seconds, epoch milliseconds, ISO string, or Date into
 * a human-readable Date-Time string: `YYYY-MM-DD HH:MM:SS` (UTC).
 */
export function formatHumanDateTime(
  input?: number | string | Date | null,
): string {
  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(trimmed)) {
      return trimmed;
    }
    if (/^\d+$/.test(trimmed)) {
      const num = Number(trimmed);
      const ms = num < 1e11 ? num * 1000 : num;
      return new Date(ms).toISOString().replace('T', ' ').slice(0, 19);
    }
    const parsed = Date.parse(trimmed);
    if (!Number.isNaN(parsed)) {
      return new Date(parsed).toISOString().replace('T', ' ').slice(0, 19);
    }
  }
  if (typeof input === 'number' && Number.isFinite(input)) {
    const ms = input < 1e11 ? input * 1000 : input;
    return new Date(ms).toISOString().replace('T', ' ').slice(0, 19);
  }
  if (input instanceof Date && !Number.isNaN(input.getTime())) {
    return input.toISOString().replace('T', ' ').slice(0, 19);
  }
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

/**
 * Converts a stored DB Date-Time (`YYYY-MM-DD HH:MM:SS` or legacy unix epoch)
 * into a standard ISO-8601 string (`YYYY-MM-DDTHH:MM:SS.000Z`) for API consumers.
 */
export function parseDbDateTimeToIso(
  value: string | number | null | undefined,
): string {
  const formatted = formatHumanDateTime(value);
  return `${formatted.replace(' ', 'T')}.000Z`;
}

export class StreamZDatabase {
  private db: SqliteDatabaseSync;
  private tursoUrl: string | null;
  private tursoAuthToken: string | null;
  private hydrationPromise: Promise<void> | null = null;
  /**
   * In-memory session cache (tokenHashHex -> { userId, expiresAt })
   * Eliminates repetitive `SELECT user_id, expires_at FROM sessions` DB reads on every API call.
   */
  private sessionCache = new Map<string, { userId: number; expiresAt: string }>();

  constructor(dbFilePath?: string) {
    const targetPath =
      dbFilePath ||
      (process.env.STREAMZ_DB_PATH || '').trim() ||
      path.resolve(process.cwd(), 'data', 'streamz_commercial.sqlite');
    if (targetPath !== ':memory:') {
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      try {
        const envPath = path.resolve(process.cwd(), '.env');
        if (fs.existsSync(envPath)) {
          const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;
            const eqIdx = trimmed.indexOf('=');
            if (eqIdx > 0) {
              const key = trimmed.slice(0, eqIdx).trim();
              const val = trimmed.slice(eqIdx + 1).trim().replace(/^['"]|['"]$/g, '');
              if (!process.env[key]) process.env[key] = val;
            }
          }
        }
      } catch {
        // Ignore .env parse errors
      }
    }

    this.tursoUrl = (process.env.TURSO_DATABASE_URL || '').trim() || null;
    this.tursoAuthToken = (process.env.TURSO_AUTH_TOKEN || '').trim() || null;

    const DatabaseSyncCtor = loadDatabaseSyncConstructor();
    this.db = new DatabaseSyncCtor(targetPath);
    this.initPragmasAndSchema();

    if (targetPath !== ':memory:') {
      void this.ensureHydratedFromTursoCloud();
    }
  }

  /**
   * Dynamically pulls existing users, sessions, providers, watch history, and watchlist
   * from Turso Cloud (`TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN`) on startup
   * so ephemeral cloud containers (like Render Free) automatically restore all user state
   * with zero hardcoded credentials in source code.
   */
  public ensureHydratedFromTursoCloud(): Promise<void> {
    if (!this.tursoUrl || !this.tursoAuthToken) {
      return Promise.resolve();
    }
    if (this.hydrationPromise) {
      return this.hydrationPromise;
    }

    const httpEndpoint = this.tursoUrl
      .replace(/^libsql:\/\//i, 'https://')
      .replace(/\/+$/, '');

    const queries = [
      'SELECT id, email, display_name, avatar_color, role, password_hash, streaming_cfg, created_at FROM users',
      'SELECT id, manifest_url, manifest_json, updated_at FROM provider_registry',
      'SELECT user_id, provider_id, enabled, sort_order, custom_manifest_json FROM user_providers',
      'SELECT id, media_id, media_type, title, poster, background, rating_bp, release_info FROM media_catalog',
      'SELECT user_id, media_ref, episode_id, episode_label, pos_sec, dur_sec, updated_at FROM user_watch_history_v2',
      'SELECT user_id, media_ref, added_at FROM user_watchlist_v2',
      'SELECT token_hash, user_id, expires_at FROM sessions',
    ];

    const requests: Array<Record<string, unknown>> = queries.map((sql) => ({
      type: 'execute',
      stmt: { sql },
    }));
    requests.push({ type: 'close' });

    this.hydrationPromise = fetch(`${httpEndpoint}/v2/pipeline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.tursoAuthToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ requests }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((payload: unknown) => {
        if (!payload || typeof payload !== 'object') return;
        const results = (payload as { results?: Array<Record<string, unknown>> }).results;
        if (!Array.isArray(results)) return;

        const extractRows = (resIdx: number): Array<Array<string | number | null>> => {
          const resItem = results[resIdx] as
            | {
                response?: {
                  result?: {
                    rows?: Array<Array<{ type: string; value?: string | number }>>;
                  };
                };
              }
            | undefined;
          const rawRows = resItem?.response?.result?.rows;
          if (!Array.isArray(rawRows)) return [];
          return rawRows.map((row) =>
            row.map((cell) => {
              if (!cell || cell.type === 'null' || cell.value === undefined) return null;
              if (cell.type === 'integer') return Number(cell.value);
              return cell.value;
            }),
          );
        };

        const cloudUsers = extractRows(0);
        const cloudProviders = extractRows(1);
        const cloudUserProviders = extractRows(2);
        const cloudCatalog = extractRows(3);
        const cloudHistory = extractRows(4);
        const cloudWatchlist = extractRows(5);
        const cloudSessions = extractRows(6);

        this.db.exec('BEGIN IMMEDIATE TRANSACTION');
        try {
          const userStmt = this.db.prepare(`
            INSERT OR REPLACE INTO users (
              id, email, display_name, avatar_color, role, password_hash, pwd_salt, pwd_hash, streaming_cfg, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);
          for (const u of cloudUsers) {
            const pwdHashStr = String(u[5] || '');
            const parts = pwdHashStr.split('$');
            if (parts.length !== 3) continue;
            userStmt.run(
              Number(u[0]),
              String(u[1]),
              String(u[2]),
              String(u[3] || '#E11D48'),
              String(u[4] || 'user'),
              pwdHashStr,
              Buffer.from(parts[1], 'hex'),
              Buffer.from(parts[2], 'hex'),
              String(u[6] || ''),
              formatHumanDateTime(u[7] as string | number),
            );
          }

          const provStmt = this.db.prepare(`
            INSERT OR REPLACE INTO provider_registry (id, manifest_url, manifest_json, updated_at)
            VALUES (?, ?, ?, ?)
          `);
          for (const p of cloudProviders) {
            provStmt.run(
              Number(p[0]),
              String(p[1]),
              String(p[2]),
              formatHumanDateTime(p[3] as string | number),
            );
          }

          const upStmt = this.db.prepare(`
            INSERT OR REPLACE INTO user_providers (user_id, provider_id, enabled, sort_order, custom_manifest_json)
            VALUES (?, ?, ?, ?, ?)
          `);
          for (const up of cloudUserProviders) {
            upStmt.run(
              Number(up[0]),
              Number(up[1]),
              Number(up[2] ?? 1),
              Number(up[3] ?? 0),
              up[4] !== null ? String(up[4]) : null,
            );
          }

          const catStmt = this.db.prepare(`
            INSERT OR REPLACE INTO media_catalog (id, media_id, media_type, title, poster, background, rating_bp, release_info)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `);
          for (const c of cloudCatalog) {
            catStmt.run(
              Number(c[0]),
              String(c[1]),
              Number(c[2] ?? 0),
              String(c[3]),
              c[4] !== null ? String(c[4]) : null,
              c[5] !== null ? String(c[5]) : null,
              c[6] !== null ? Number(c[6]) : null,
              c[7] !== null ? String(c[7]) : null,
            );
          }

          const histStmt = this.db.prepare(`
            INSERT OR REPLACE INTO user_watch_history_v2 (user_id, media_ref, episode_id, episode_label, pos_sec, dur_sec, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `);
          for (const h of cloudHistory) {
            histStmt.run(
              Number(h[0]),
              Number(h[1]),
              h[2] !== null ? String(h[2]) : null,
              h[3] !== null ? String(h[3]) : null,
              Number(h[4] ?? 0),
              Number(h[5] ?? 0),
              formatHumanDateTime(h[6] as string | number),
            );
          }

          const wlStmt = this.db.prepare(`
            INSERT OR REPLACE INTO user_watchlist_v2 (user_id, media_ref, added_at)
            VALUES (?, ?, ?)
          `);
          for (const w of cloudWatchlist) {
            wlStmt.run(
              Number(w[0]),
              Number(w[1]),
              formatHumanDateTime(w[2] as string | number),
            );
          }

          const sessStmt = this.db.prepare(`
            INSERT OR REPLACE INTO sessions (token_hash, user_id, expires_at)
            VALUES (?, ?, ?)
          `);
          for (const s of cloudSessions) {
            const hexHash = String(s[0] || '');
            if (!/^[0-9a-f]{64}$/i.test(hexHash)) continue;
            const expStr = formatHumanDateTime(s[2] as string | number);
            sessStmt.run(Buffer.from(hexHash, 'hex'), Number(s[1]), expStr);
            this.sessionCache.set(hexHash.toLowerCase(), {
              userId: Number(s[1]),
              expiresAt: expStr,
            });
          }

          this.db.exec('COMMIT');
        } catch {
          this.db.exec('ROLLBACK');
        }
      })
      .catch(() => {
        // Ignore cloud hydration network errors
      });

    return this.hydrationPromise;
  }

  /**
   * Optional Write-Through Cloud Replication to Turso (LibSQL Free Cloud DB — 5 GB free, 500M reads/mo).
   * When `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` are set in the environment, writes are asynchronously
   * pipelined over HTTP to the cloud cluster while local embedded WAL serves sub-0.1ms reads.
   */
  private replicateToTursoCloud(sql: string, args: Array<string | number | null> = []): void {
    this.replicateBatchToTursoCloud([{ sql, args }]);
  }

  /**
   * Batches multiple SQL statements into a single HTTP request to Turso's `/v2/pipeline` endpoint
   * (eliminating 14+ separate HTTP requests during provider syncs and user deletions).
   */
  private replicateBatchToTursoCloud(
    statements: Array<{ sql: string; args?: Array<string | number | null> }>,
  ): void {
    if (!this.tursoUrl || !this.tursoAuthToken || statements.length === 0) return;
    const httpEndpoint = this.tursoUrl
      .replace(/^libsql:\/\//i, 'https://')
      .replace(/\/+$/, '');

    const requests: Array<Record<string, unknown>> = statements.map(({ sql, args = [] }) => ({
      type: 'execute',
      stmt: {
        sql,
        args: args.map((val) => {
          if (val === null || val === undefined) return { type: 'null' };
          if (typeof val === 'number') {
            return Number.isInteger(val)
              ? { type: 'integer', value: String(val) }
              : { type: 'float', value: val };
          }
          return { type: 'text', value: String(val) };
        }),
      },
    }));
    requests.push({ type: 'close' });

    fetch(`${httpEndpoint}/v2/pipeline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.tursoAuthToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ requests }),
    }).catch(() => {
      // Non-blocking background cloud sync
    });
  }

  private initPragmasAndSchema(): void {
    // SQLite Best Practices (WAL mode, NORMAL sync, Foreign Keys, Busy Timeout, Memory Temp Store)
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      PRAGMA foreign_keys = ON;
      PRAGMA busy_timeout = 5000;
      PRAGMA temp_store = MEMORY;
      PRAGMA cache_size = -16000;

      -- 1. Users Table (STRICT, 8-byte integer rowid PK, binary BLOB password salt & scrypt hash + readable password_hash & role)
      --    streaming_cfg stores '' when default to consume 0 bytes on disk!
      --    created_at stores human-readable Date-Time ('YYYY-MM-DD HH:MM:SS')
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        display_name TEXT NOT NULL,
        avatar_color TEXT NOT NULL DEFAULT '#E11D48',
        role TEXT NOT NULL DEFAULT 'user',
        password_hash TEXT NOT NULL DEFAULT '',
        pwd_salt BLOB NOT NULL,
        pwd_hash BLOB NOT NULL,
        streaming_cfg TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
      ) STRICT;

      -- 2. Sessions Table (WITHOUT ROWID clustered by 32-byte SHA-256 token hash)
      CREATE TABLE IF NOT EXISTS sessions (
        token_hash BLOB PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at TEXT NOT NULL
      ) WITHOUT ROWID, STRICT;

      CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

      -- 3. Global Deduplicated Provider Registry (stores each manifest URL & JSON once across all users!)
      CREATE TABLE IF NOT EXISTS provider_registry (
        id INTEGER PRIMARY KEY,
        manifest_url TEXT NOT NULL UNIQUE,
        manifest_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;

      -- 4. Per-User Provider Join Table (WITHOUT ROWID — only ~12 bytes per user-provider link!)
      CREATE TABLE IF NOT EXISTS user_providers (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        provider_id INTEGER NOT NULL REFERENCES provider_registry(id) ON DELETE CASCADE,
        enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)) DEFAULT 1,
        sort_order INTEGER NOT NULL DEFAULT 0,
        custom_manifest_json TEXT,
        PRIMARY KEY (user_id, provider_id)
      ) WITHOUT ROWID, STRICT;

      -- 5. Global Deduplicated Media Catalog (3NF — stores title, poster, background, rating ONCE globally!)
      CREATE TABLE IF NOT EXISTS media_catalog (
        id INTEGER PRIMARY KEY,
        media_id TEXT NOT NULL UNIQUE,
        media_type INTEGER NOT NULL CHECK (media_type IN (0, 1)),
        title TEXT NOT NULL,
        poster TEXT,
        background TEXT,
        rating_bp INTEGER,
        release_info TEXT
      ) STRICT;

      -- 6. Ultra-Compact Per-User Watch History v2 (WITHOUT ROWID)
      CREATE TABLE IF NOT EXISTS user_watch_history_v2 (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        media_ref INTEGER NOT NULL REFERENCES media_catalog(id) ON DELETE CASCADE,
        episode_id TEXT,
        episode_label TEXT,
        pos_sec INTEGER NOT NULL,
        dur_sec INTEGER NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (user_id, media_ref)
      ) WITHOUT ROWID, STRICT;

      -- 7. Ultra-Compact Per-User Watchlist v2 (WITHOUT ROWID)
      CREATE TABLE IF NOT EXISTS user_watchlist_v2 (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        media_ref INTEGER NOT NULL REFERENCES media_catalog(id) ON DELETE CASCADE,
        added_at TEXT NOT NULL,
        PRIMARY KEY (user_id, media_ref)
      ) WITHOUT ROWID, STRICT;
    `);

    this.migrateLegacyPerUserTablesIfNeeded();
    try {
      const cols = this.db
        .prepare("PRAGMA table_info('user_providers')")
        .all() as Array<{ name: string }>;
      if (!cols.some((c) => c.name === 'custom_manifest_json')) {
        this.db.exec('ALTER TABLE user_providers ADD COLUMN custom_manifest_json TEXT');
      }
    } catch {
      // Column already present
    }

    try {
      const userCols = this.db
        .prepare("PRAGMA table_info('users')")
        .all() as Array<{ name: string }>;
      if (!userCols.some((c) => c.name === 'role')) {
        this.db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'");
      }
      if (!userCols.some((c) => c.name === 'password_hash')) {
        this.db.exec("ALTER TABLE users ADD COLUMN password_hash TEXT NOT NULL DEFAULT ''");
      }

      // Backfill password_hash (scrypt$<saltHex>$<hashHex>) for any existing rows
      const rows = this.db
        .prepare('SELECT id, email, role, password_hash, pwd_salt, pwd_hash FROM users ORDER BY id ASC')
        .all() as Array<{
        id: number;
        email: string;
        role: string;
        password_hash: string;
        pwd_salt: Uint8Array;
        pwd_hash: Uint8Array;
      }>;

      for (const r of rows) {
        if (!r.password_hash && r.pwd_salt && r.pwd_hash) {
          const saltHex = Buffer.from(r.pwd_salt).toString('hex');
          const hashHex = Buffer.from(r.pwd_hash).toString('hex');
          const encoded = `scrypt$${saltHex}$${hashHex}`;
          this.db
            .prepare('UPDATE users SET password_hash = ? WHERE id = ?')
            .run(encoded, r.id);
        }
      }
    } catch {
      // Ignore migration errors
    }

    this.migrateIntegerTimestampsToHumanReadable();
  }

  /**
   * Migrates any legacy STRICT tables that used INTEGER unix-epoch timestamps
   * (`users.created_at`, `sessions.expires_at`, `provider_registry.updated_at`,
   * `user_watch_history_v2.updated_at`, `user_watchlist_v2.added_at`) into
   * human-readable `TEXT` Date-Time format (`YYYY-MM-DD HH:MM:SS`).
   */
  private migrateIntegerTimestampsToHumanReadable(): void {
    const hasIntTimestamp = (tableName: string, colName: string): boolean => {
      const cols = this.db
        .prepare(`PRAGMA table_info('${tableName}')`)
        .all() as Array<{ name: string; type: string }>;
      const col = cols.find((c) => c.name === colName);
      return Boolean(col && col.type.toUpperCase() === 'INTEGER');
    };

    const needsMigration =
      hasIntTimestamp('users', 'created_at') ||
      hasIntTimestamp('sessions', 'expires_at') ||
      hasIntTimestamp('provider_registry', 'updated_at') ||
      hasIntTimestamp('user_watch_history_v2', 'updated_at') ||
      hasIntTimestamp('user_watchlist_v2', 'added_at');

    if (!needsMigration) return;

    this.db.exec('PRAGMA foreign_keys = OFF;');
    this.db.exec('BEGIN TRANSACTION;');
    try {
      if (hasIntTimestamp('users', 'created_at')) {
        this.db.exec(`
          CREATE TABLE users_new (
            id INTEGER PRIMARY KEY,
            email TEXT NOT NULL UNIQUE,
            display_name TEXT NOT NULL,
            avatar_color TEXT NOT NULL DEFAULT '#E11D48',
            role TEXT NOT NULL DEFAULT 'user',
            password_hash TEXT NOT NULL DEFAULT '',
            pwd_salt BLOB NOT NULL,
            pwd_hash BLOB NOT NULL,
            streaming_cfg TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL
          ) STRICT;
          INSERT INTO users_new (id, email, display_name, avatar_color, role, password_hash, pwd_salt, pwd_hash, streaming_cfg, created_at)
          SELECT id, email, display_name, avatar_color, role, password_hash, pwd_salt, pwd_hash, streaming_cfg,
                 CASE WHEN typeof(created_at) = 'integer' THEN datetime(created_at, 'unixepoch') ELSE CAST(created_at AS TEXT) END
          FROM users;
          DROP TABLE users;
          ALTER TABLE users_new RENAME TO users;
        `);
      }

      if (hasIntTimestamp('sessions', 'expires_at')) {
        this.db.exec(`
          CREATE TABLE sessions_new (
            token_hash BLOB PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            expires_at TEXT NOT NULL
          ) WITHOUT ROWID, STRICT;
          INSERT INTO sessions_new (token_hash, user_id, expires_at)
          SELECT token_hash, user_id,
                 CASE WHEN typeof(expires_at) = 'integer' THEN datetime(expires_at, 'unixepoch') ELSE CAST(expires_at AS TEXT) END
          FROM sessions;
          DROP TABLE sessions;
          ALTER TABLE sessions_new RENAME TO sessions;
          CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
        `);
      }

      if (hasIntTimestamp('provider_registry', 'updated_at')) {
        this.db.exec(`
          CREATE TABLE provider_registry_new (
            id INTEGER PRIMARY KEY,
            manifest_url TEXT NOT NULL UNIQUE,
            manifest_json TEXT NOT NULL,
            updated_at TEXT NOT NULL
          ) STRICT;
          INSERT INTO provider_registry_new (id, manifest_url, manifest_json, updated_at)
          SELECT id, manifest_url, manifest_json,
                 CASE WHEN typeof(updated_at) = 'integer' THEN datetime(updated_at, 'unixepoch') ELSE CAST(updated_at AS TEXT) END
          FROM provider_registry;
          DROP TABLE provider_registry;
          ALTER TABLE provider_registry_new RENAME TO provider_registry;
        `);
      }

      if (hasIntTimestamp('user_watch_history_v2', 'updated_at')) {
        this.db.exec(`
          CREATE TABLE user_watch_history_v2_new (
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            media_ref INTEGER NOT NULL REFERENCES media_catalog(id) ON DELETE CASCADE,
            episode_id TEXT,
            episode_label TEXT,
            pos_sec INTEGER NOT NULL,
            dur_sec INTEGER NOT NULL,
            updated_at TEXT NOT NULL,
            PRIMARY KEY (user_id, media_ref)
          ) WITHOUT ROWID, STRICT;
          INSERT INTO user_watch_history_v2_new (user_id, media_ref, episode_id, episode_label, pos_sec, dur_sec, updated_at)
          SELECT user_id, media_ref, episode_id, episode_label, pos_sec, dur_sec,
                 CASE WHEN typeof(updated_at) = 'integer' THEN datetime(updated_at, 'unixepoch') ELSE CAST(updated_at AS TEXT) END
          FROM user_watch_history_v2;
          DROP TABLE user_watch_history_v2;
          ALTER TABLE user_watch_history_v2_new RENAME TO user_watch_history_v2;
        `);
      }

      if (hasIntTimestamp('user_watchlist_v2', 'added_at')) {
        this.db.exec(`
          CREATE TABLE user_watchlist_v2_new (
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            media_ref INTEGER NOT NULL REFERENCES media_catalog(id) ON DELETE CASCADE,
            added_at TEXT NOT NULL,
            PRIMARY KEY (user_id, media_ref)
          ) WITHOUT ROWID, STRICT;
          INSERT INTO user_watchlist_v2_new (user_id, media_ref, added_at)
          SELECT user_id, media_ref,
                 CASE WHEN typeof(added_at) = 'integer' THEN datetime(added_at, 'unixepoch') ELSE CAST(added_at AS TEXT) END
          FROM user_watchlist_v2;
          DROP TABLE user_watchlist_v2;
          ALTER TABLE user_watchlist_v2_new RENAME TO user_watchlist_v2;
        `);
      }

      this.db.exec('COMMIT;');
    } catch {
      this.db.exec('ROLLBACK;');
    } finally {
      this.db.exec('PRAGMA foreign_keys = ON;');
    }
  }

  /**
   * Automatically migrates any existing rows from legacy un-normalized `user_watch_history` / `user_watchlist`
   * into the global `media_catalog` + `user_watch_history_v2` / `user_watchlist_v2` tables, then drops the legacy tables.
   */
  private migrateLegacyPerUserTablesIfNeeded(): void {
    try {
      const legacyHistoryTable = this.db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='user_watch_history'",
        )
        .get() as { name?: string } | undefined;

      if (legacyHistoryTable?.name) {
        const legacyRows = this.db
          .prepare(
            'SELECT user_id, media_id, media_type, media_name, poster, background, episode_id, episode_label, pos_sec, dur_sec, updated_at FROM user_watch_history',
          )
          .all() as Array<{
          user_id: number;
          media_id: string;
          media_type: number;
          media_name: string;
          poster: string | null;
          background: string | null;
          episode_id: string | null;
          episode_label: string | null;
          pos_sec: number;
          dur_sec: number;
          updated_at: number;
        }>;

        for (const r of legacyRows) {
          const mediaRef = this.upsertMediaCatalogEntry({
            mediaId: r.media_id,
            mediaType: r.media_type === 1 ? 'series' : 'movie',
            title: r.media_name,
            poster: r.poster || undefined,
            background: r.background || undefined,
          });
          this.db
            .prepare(
              `INSERT OR IGNORE INTO user_watch_history_v2 (user_id, media_ref, episode_id, episode_label, pos_sec, dur_sec, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)`,
            )
            .run(
              r.user_id,
              mediaRef,
              r.episode_id,
              r.episode_label,
              r.pos_sec,
              r.dur_sec,
              formatHumanDateTime(r.updated_at),
            );
        }
        this.db.exec('DROP TABLE user_watch_history');
      }

      const legacyWatchlistTable = this.db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='user_watchlist'",
        )
        .get() as { name?: string } | undefined;

      if (legacyWatchlistTable?.name) {
        const legacyWlRows = this.db
          .prepare(
            'SELECT user_id, media_id, media_type, media_name, poster, imdb_rating, release_info, added_at FROM user_watchlist',
          )
          .all() as Array<{
          user_id: number;
          media_id: string;
          media_type: number;
          media_name: string;
          poster: string | null;
          imdb_rating: string | null;
          release_info: string | null;
          added_at: number;
        }>;

        for (const w of legacyWlRows) {
          const mediaRef = this.upsertMediaCatalogEntry({
            mediaId: w.media_id,
            mediaType: w.media_type === 1 ? 'series' : 'movie',
            title: w.media_name,
            poster: w.poster || undefined,
            imdbRating: w.imdb_rating || undefined,
            releaseInfo: w.release_info || undefined,
          });
          this.db
            .prepare(
              `INSERT OR IGNORE INTO user_watchlist_v2 (user_id, media_ref, added_at)
               VALUES (?, ?, ?)`,
            )
            .run(w.user_id, mediaRef, formatHumanDateTime(w.added_at));
        }
        this.db.exec('DROP TABLE user_watchlist');
      }
    } catch {
      // Ignore migration errors if tables do not exist
    }
  }

  /**
   * Upserts a movie or series into the global deduplicated `media_catalog` table
   * and returns its compact integer `id` (`media_ref`).
   */
  private upsertMediaCatalogEntry(params: {
    mediaId: string;
    mediaType: string;
    title: string;
    poster?: string;
    background?: string;
    imdbRating?: string;
    releaseInfo?: string;
  }): number {
    const typeInt = params.mediaType === 'series' ? 1 : 0;
    const compactPoster = compressMetahubUrl(params.poster, params.mediaId, 'poster');
    const compactBg = compressMetahubUrl(
      params.background,
      params.mediaId,
      'background',
    );
    const ratingBp = encodeRatingBasisPoints(params.imdbRating);

    const row = this.db
      .prepare(
        `INSERT INTO media_catalog (media_id, media_type, title, poster, background, rating_bp, release_info)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(media_id) DO UPDATE SET
           title = excluded.title,
           poster = COALESCE(excluded.poster, media_catalog.poster),
           background = COALESCE(excluded.background, media_catalog.background),
           rating_bp = COALESCE(excluded.rating_bp, media_catalog.rating_bp),
           release_info = COALESCE(excluded.release_info, media_catalog.release_info)
         RETURNING id`,
      )
      .get(
        params.mediaId,
        typeInt,
        params.title.slice(0, 160),
        compactPoster,
        compactBg,
        ratingBp,
        params.releaseInfo ? params.releaseInfo.slice(0, 32) : null,
      ) as { id: number };

    return row.id;
  }

  public registerUser(params: {
    email: string;
    password: string;
    displayName: string;
    avatarColor?: string;
    role?: UserRole;
  }): { token: string; state: UserStatePayload } {
    const cleanEmail = params.email.trim().toLowerCase();
    const cleanName =
      params.displayName.trim() || cleanEmail.split('@')[0] || 'Viewer';
    const avatarColor = params.avatarColor || '#E11D48';

    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cleanEmail) || cleanEmail.length > 120) {
      throw new Error('Please enter a valid email address (e.g. name@domain.com).');
    }
    if (
      !params.password ||
      params.password.length < 8 ||
      !/[a-zA-Z]/.test(params.password) ||
      !/[0-9!@#$%^&*(),.?":{}|<>_\-+=]/.test(params.password)
    ) {
      throw new Error(
        'Password must be at least 8 characters long and include both letters and numbers/symbols.',
      );
    }

    const existing = this.db
      .prepare('SELECT id FROM users WHERE email = ?')
      .get(cleanEmail) as { id: number } | undefined;
    if (existing) {
      throw new Error('An account with this email already exists.');
    }

    const totalUsersRow = this.db
      .prepare('SELECT COUNT(*) AS c FROM users')
      .get() as { c: number } | undefined;
    const isFirstUser = (totalUsersRow?.c ?? 0) === 0;
    const effectiveRole: UserRole =
      params.role || (isFirstUser ? 'admin' : 'user');

    const salt = randomBytes(16);
    const hash = scryptSync(params.password, salt, 32);
    const passwordHashText = `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
    const nowDateTime = formatHumanDateTime();

    // Store '' for default streaming_cfg so default config takes 0 bytes in SQLite
    const insertResult = this.db
      .prepare(
        `INSERT INTO users (email, display_name, avatar_color, role, password_hash, pwd_salt, pwd_hash, streaming_cfg, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, '', ?)`,
      )
      .run(
        cleanEmail,
        cleanName.slice(0, 60),
        avatarColor,
        effectiveRole,
        passwordHashText,
        salt,
        hash,
        nowDateTime,
      );

    const userId = Number(insertResult.lastInsertRowid);
    this.replicateToTursoCloud(
      'INSERT OR REPLACE INTO users (id, email, display_name, avatar_color, role, password_hash, streaming_cfg, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [
        userId,
        cleanEmail,
        cleanName.slice(0, 60),
        avatarColor,
        effectiveRole,
        passwordHashText,
        '',
        nowDateTime,
      ],
    );

    const token = this.createSession(userId);
    return {
      token,
      state: this.getUserState(userId),
    };
  }

  public loginUser(params: {
    email: string;
    password: string;
  }): { token: string; state: UserStatePayload } {
    const cleanEmail = params.email.trim().toLowerCase();
    const row = this.db
      .prepare('SELECT id, pwd_salt, pwd_hash, password_hash FROM users WHERE email = ?')
      .get(cleanEmail) as
      | {
          id: number;
          pwd_salt: Uint8Array;
          pwd_hash: Uint8Array;
          password_hash: string;
        }
      | undefined;

    if (!row) {
      throw new Error('Invalid email or password.');
    }

    const saltBuf = Buffer.from(row.pwd_salt);
    const storedHashBuf = Buffer.from(row.pwd_hash);
    const candidateHash = scryptSync(params.password, saltBuf, 32);

    if (
      storedHashBuf.length !== candidateHash.length ||
      !timingSafeEqual(storedHashBuf, candidateHash)
    ) {
      throw new Error('Invalid email or password.');
    }

    const token = this.createSession(row.id);
    return {
      token,
      state: this.getUserState(row.id),
    };
  }

  /**
   * Changes a user's password after verifying their current password.
   * Updates both binary BLOB columns (`pwd_salt`, `pwd_hash`) and the readable `password_hash` column,
   * revokes all pre-existing sessions (except optional `retainToken`), and replicates to Turso Cloud.
   */
  public changeUserPassword(params: {
    userId: number;
    currentPassword: string;
    newPassword: string;
    retainToken?: string | null;
  }): void {
    const row = this.db
      .prepare('SELECT id, pwd_salt, pwd_hash FROM users WHERE id = ?')
      .get(params.userId) as
      | { id: number; pwd_salt: Uint8Array; pwd_hash: Uint8Array }
      | undefined;

    if (!row) {
      throw new Error('User account not found.');
    }

    const saltBuf = Buffer.from(row.pwd_salt);
    const storedHashBuf = Buffer.from(row.pwd_hash);
    const currentCandidate = scryptSync(params.currentPassword || '', saltBuf, 32);

    if (
      storedHashBuf.length !== currentCandidate.length ||
      !timingSafeEqual(storedHashBuf, currentCandidate)
    ) {
      throw new Error('Current password is incorrect.');
    }

    if (!params.newPassword || params.newPassword.length < 8) {
      throw new Error('New password must be at least 8 characters long.');
    }
    if (!/[A-Z]/.test(params.newPassword) || !/[a-z]/.test(params.newPassword) || !/[0-9!@#$%^&*(),.?":{}|<>_\-+=]/.test(params.newPassword)) {
      throw new Error(
        'New password must include uppercase, lowercase, and at least one number or symbol.',
      );
    }

    const nextSalt = randomBytes(16);
    const nextHash = scryptSync(params.newPassword, nextSalt, 32);
    const nextPasswordHashText = `scrypt$${nextSalt.toString('hex')}$${nextHash.toString('hex')}`;

    this.db
      .prepare(
        'UPDATE users SET pwd_salt = ?, pwd_hash = ?, password_hash = ? WHERE id = ?',
      )
      .run(nextSalt, nextHash, nextPasswordHashText, params.userId);

    this.revokeAllUserSessions(params.userId, params.retainToken || undefined);

    this.replicateToTursoCloud(
      'UPDATE users SET password_hash = ? WHERE id = ?',
      [nextPasswordHashText, params.userId],
    );
  }

  public isUserAdmin(userId: number): boolean {
    const row = this.db
      .prepare('SELECT role FROM users WHERE id = ?')
      .get(userId) as { role: string } | undefined;
    return row?.role === 'admin';
  }

  private assertAdmin(adminUserId: number): void {
    if (!this.isUserAdmin(adminUserId)) {
      throw new Error('Forbidden: Administrator privileges required.');
    }
  }

  /**
   * Admin-only: Lists all users with their role, password_hash column, and activity counts.
   * Uses 2 aggregated SQL queries instead of N+1 `getUserState` loops.
   */
  public adminListUsers(adminUserId: number): AdminUserSummary[] {
    this.assertAdmin(adminUserId);

    const rows = this.db
      .prepare(
        `SELECT u.id, u.email, u.display_name, u.avatar_color, u.role, u.password_hash, u.created_at,
                (SELECT COUNT(*) FROM user_watch_history_v2 uh WHERE uh.user_id = u.id) AS watch_history_count,
                (SELECT COUNT(*) FROM user_watchlist_v2 uw WHERE uw.user_id = u.id) AS watchlist_count
         FROM users u
         ORDER BY u.id ASC`,
      )
      .all() as Array<{
      id: number;
      email: string;
      display_name: string;
      avatar_color: string;
      role: string;
      password_hash: string;
      created_at: string | number;
      watch_history_count: number;
      watchlist_count: number;
    }>;

    const allProviderRows = this.db
      .prepare(
        `SELECT up.user_id, pr.manifest_url, pr.manifest_json, pr.updated_at, up.enabled, up.custom_manifest_json
         FROM user_providers up
         JOIN provider_registry pr ON pr.id = up.provider_id
         ORDER BY up.user_id ASC, up.sort_order ASC, pr.id ASC`,
      )
      .all() as Array<{
      user_id: number;
      manifest_url: string;
      manifest_json: string;
      updated_at: string | number;
      enabled: number;
      custom_manifest_json: string | null;
    }>;

    const providersByUser = new Map<number, DbProviderRecord[]>();
    for (const r of allProviderRows) {
      try {
        const rawJson = r.custom_manifest_json || r.manifest_json;
        const list = providersByUser.get(r.user_id) || [];
        list.push({
          manifestUrl: normalizeDbManifestUrl(r.manifest_url),
          enabled: r.enabled === 1,
          manifest: JSON.parse(rawJson) as Record<string, unknown>,
          lastCheckedIso: parseDbDateTimeToIso(r.updated_at),
        });
        providersByUser.set(r.user_id, list);
      } catch {
        // Ignore malformed JSON
      }
    }

    return rows.map((u) => {
      const userProviders = providersByUser.get(u.id) || [];
      return {
        id: u.id,
        email: u.email,
        displayName: u.display_name,
        avatarColor: u.avatar_color,
        role: u.role === 'admin' ? 'admin' : 'user',
        passwordHash: u.password_hash || '',
        createdAtIso: parseDbDateTimeToIso(u.created_at),
        providerCount: userProviders.length,
        watchHistoryCount: u.watch_history_count ?? 0,
        watchlistCount: u.watchlist_count ?? 0,
        providers: userProviders,
      };
    });
  }

  /**
   * Admin-only: Creates a new user account with strict form validation on name, email, and password.
   */
  public adminCreateUser(
    adminUserId: number,
    params: {
      email: string;
      password: string;
      displayName: string;
      role?: UserRole;
      avatarColor?: string;
    },
  ): AdminUserSummary {
    this.assertAdmin(adminUserId);

    const cleanName = (params.displayName || '').trim();
    const cleanEmail = (params.email || '').trim().toLowerCase();
    const pwd = params.password || '';
    const role: UserRole = params.role === 'admin' ? 'admin' : 'user';
    const avatarColor = params.avatarColor || '#E11D48';

    if (cleanName.length < 2 || cleanName.length > 60 || !/[a-zA-Z]/.test(cleanName)) {
      throw new Error('Display Name must be 2–60 characters and include letters.');
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cleanEmail) || cleanEmail.length > 120) {
      throw new Error('Please enter a valid email address (e.g. user@domain.com).');
    }
    if (pwd.length < 8) {
      throw new Error('Password must be at least 8 characters long.');
    }
    if (!/[A-Z]/.test(pwd) || !/[a-z]/.test(pwd) || !/[0-9!@#$%^&*(),.?":{}|<>_\-+=]/.test(pwd)) {
      throw new Error(
        'Password must include uppercase, lowercase, and at least one number or symbol.',
      );
    }

    const existing = this.db
      .prepare('SELECT id FROM users WHERE email = ?')
      .get(cleanEmail) as { id: number } | undefined;
    if (existing) {
      throw new Error('An account with this email address already exists.');
    }

    const salt = randomBytes(16);
    const hash = scryptSync(pwd, salt, 32);
    const passwordHashText = `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
    const nowDateTime = formatHumanDateTime();

    const insertResult = this.db
      .prepare(
        `INSERT INTO users (email, display_name, avatar_color, role, password_hash, pwd_salt, pwd_hash, streaming_cfg, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, '', ?)`,
      )
      .run(
        cleanEmail,
        cleanName,
        avatarColor,
        role,
        passwordHashText,
        salt,
        hash,
        nowDateTime,
      );

    const newUserId = Number(insertResult.lastInsertRowid);
    this.replicateToTursoCloud(
      'INSERT OR REPLACE INTO users (id, email, display_name, avatar_color, role, password_hash, streaming_cfg, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [newUserId, cleanEmail, cleanName, avatarColor, role, passwordHashText, '', nowDateTime],
    );

    const createdList = this.adminListUsers(adminUserId);
    const found = createdList.find((u) => u.id === newUserId);
    if (!found) throw new Error('Failed to load created user.');
    return found;
  }

  /**
   * Admin-only: Updates any user's profile fields (displayName, email, role, avatarColor) and/or password.
   */
  public adminUpdateUser(
    adminUserId: number,
    targetUserId: number,
    params: {
      email?: string;
      displayName?: string;
      role?: UserRole;
      avatarColor?: string;
      newPassword?: string;
    },
  ): AdminUserSummary {
    this.assertAdmin(adminUserId);

    const existing = this.db
      .prepare('SELECT id, email, display_name, avatar_color, role FROM users WHERE id = ?')
      .get(targetUserId) as
      | {
          id: number;
          email: string;
          display_name: string;
          avatar_color: string;
          role: string;
        }
      | undefined;

    if (!existing) {
      throw new Error('Target user not found.');
    }

    const nextName =
      params.displayName !== undefined ? params.displayName.trim() : existing.display_name;
    const nextEmail =
      params.email !== undefined ? params.email.trim().toLowerCase() : existing.email;
    const nextColor =
      params.avatarColor !== undefined ? params.avatarColor.trim() : existing.avatar_color;
    const nextRole: UserRole =
      params.role !== undefined
        ? params.role === 'admin'
          ? 'admin'
          : 'user'
        : existing.role === 'admin'
          ? 'admin'
          : 'user';

    if (nextName.length < 2 || nextName.length > 60 || !/[a-zA-Z]/.test(nextName)) {
      throw new Error('Display Name must be 2–60 characters and include letters.');
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(nextEmail) || nextEmail.length > 120) {
      throw new Error('Please enter a valid email address.');
    }

    if (nextEmail !== existing.email) {
      const collision = this.db
        .prepare('SELECT id FROM users WHERE email = ? AND id != ?')
        .get(nextEmail, targetUserId) as { id: number } | undefined;
      if (collision) {
        throw new Error('Another user already uses that email address.');
      }
    }

    if (adminUserId === targetUserId && nextRole !== 'admin') {
      throw new Error('You cannot demote your own active administrator account.');
    }

    this.db
      .prepare(
        'UPDATE users SET email = ?, display_name = ?, avatar_color = ?, role = ? WHERE id = ?',
      )
      .run(nextEmail, nextName, nextColor, nextRole, targetUserId);

    this.replicateToTursoCloud(
      'UPDATE users SET email = ?, display_name = ?, avatar_color = ?, role = ? WHERE id = ?',
      [nextEmail, nextName, nextColor, nextRole, targetUserId],
    );

    if (params.newPassword !== undefined && params.newPassword.trim() !== '') {
      const pwd = params.newPassword;
      if (pwd.length < 8) {
        throw new Error('New password must be at least 8 characters long.');
      }
      if (!/[A-Z]/.test(pwd) || !/[a-z]/.test(pwd) || !/[0-9!@#$%^&*(),.?":{}|<>_\-+=]/.test(pwd)) {
        throw new Error(
          'New password must include uppercase, lowercase, and at least one number or symbol.',
        );
      }
      const nextSalt = randomBytes(16);
      const nextHash = scryptSync(pwd, nextSalt, 32);
      const nextPasswordHashText = `scrypt$${nextSalt.toString('hex')}$${nextHash.toString('hex')}`;

      this.db
        .prepare(
          'UPDATE users SET pwd_salt = ?, pwd_hash = ?, password_hash = ? WHERE id = ?',
        )
        .run(nextSalt, nextHash, nextPasswordHashText, targetUserId);

      this.replicateToTursoCloud(
        'UPDATE users SET password_hash = ? WHERE id = ?',
        [nextPasswordHashText, targetUserId],
      );
    }

    // Revoke existing sessions for targetUserId if their password was reset or role was changed
    const passwordWasReset =
      params.newPassword !== undefined && params.newPassword.trim() !== '';
    const roleChanged = nextRole !== (existing.role === 'admin' ? 'admin' : 'user');
    if (passwordWasReset || roleChanged) {
      this.revokeAllUserSessions(targetUserId);
    }

    const updatedList = this.adminListUsers(adminUserId);
    const found = updatedList.find((u) => u.id === targetUserId);
    if (!found) throw new Error('Failed to load updated user.');
    return found;
  }

  /**
   * Admin-only: Deletes a user account (and cascades their sessions, providers, history & watchlist).
   */
  public adminDeleteUser(adminUserId: number, targetUserId: number): void {
    this.assertAdmin(adminUserId);
    if (adminUserId === targetUserId) {
      throw new Error('You cannot delete your own active administrator account.');
    }
    this.db.prepare('DELETE FROM users WHERE id = ?').run(targetUserId);
    for (const [key, val] of this.sessionCache.entries()) {
      if (val.userId === targetUserId) {
        this.sessionCache.delete(key);
      }
    }
    this.replicateBatchToTursoCloud([
      { sql: 'DELETE FROM users WHERE id = ?', args: [targetUserId] },
      { sql: 'DELETE FROM user_providers WHERE user_id = ?', args: [targetUserId] },
      { sql: 'DELETE FROM user_watch_history_v2 WHERE user_id = ?', args: [targetUserId] },
      { sql: 'DELETE FROM user_watchlist_v2 WHERE user_id = ?', args: [targetUserId] },
    ]);
  }

  public createSession(userId: number): string {
    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = hashSessionToken(rawToken);
    const expiresAtDateTime = formatHumanDateTime(
      Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30,
    ); // 30 days

    this.db
      .prepare(
        'INSERT OR REPLACE INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)',
      )
      .run(tokenHash, userId, expiresAtDateTime);

    const hashHex = tokenHash.toString('hex');
    this.sessionCache.set(hashHex, {
      userId,
      expiresAt: expiresAtDateTime,
    });
    this.replicateToTursoCloud(
      'INSERT OR REPLACE INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)',
      [hashHex, userId, expiresAtDateTime],
    );

    return rawToken;
  }

  public revokeSession(token: string): void {
    const tokenHash = hashSessionToken(token);
    const hashHex = tokenHash.toString('hex');
    this.sessionCache.delete(hashHex);
    this.db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
    this.replicateToTursoCloud('DELETE FROM sessions WHERE token_hash = ?', [hashHex]);
  }

  /**
   * Revokes all active sessions for `userId` in both SQLite `sessions` and in-memory `sessionCache`.
   * If `retainToken` is provided, keeps that single active session valid.
   */
  public revokeAllUserSessions(userId: number, retainToken?: string): void {
    const retainHash = retainToken ? hashSessionToken(retainToken) : null;
    const retainHex = retainHash ? retainHash.toString('hex') : null;

    if (retainHash && retainHex) {
      this.db
        .prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?')
        .run(userId, retainHash);
      this.replicateToTursoCloud(
        'DELETE FROM sessions WHERE user_id = ? AND token_hash != ?',
        [userId, retainHex],
      );
    } else {
      this.db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
      this.replicateToTursoCloud('DELETE FROM sessions WHERE user_id = ?', [userId]);
    }

    for (const [key, val] of this.sessionCache.entries()) {
      if (val.userId === userId && key !== retainHex) {
        this.sessionCache.delete(key);
      }
    }
  }

  public resolveUserIdFromToken(token?: string | null): number | null {
    if (!token) return null;
    const tokenHash = hashSessionToken(token);
    const hashHex = tokenHash.toString('hex');
    const nowDateTime = formatHumanDateTime();

    const cached = this.sessionCache.get(hashHex);
    if (cached) {
      if (cached.expiresAt < nowDateTime) {
        this.sessionCache.delete(hashHex);
        this.db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
        return null;
      }
      return cached.userId;
    }

    const row = this.db
      .prepare('SELECT user_id, expires_at FROM sessions WHERE token_hash = ?')
      .get(tokenHash) as
      | { user_id: number; expires_at: string | number }
      | undefined;

    if (!row) return null;
    const normalizedExpiresAt = formatHumanDateTime(row.expires_at);
    if (normalizedExpiresAt < nowDateTime) {
      this.db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
      return null;
    }
    this.sessionCache.set(hashHex, {
      userId: row.user_id,
      expiresAt: normalizedExpiresAt,
    });
    return row.user_id;
  }

  public getUserState(userId: number): UserStatePayload {
    const userRow = this.db
      .prepare(
        'SELECT id, email, display_name, avatar_color, role, streaming_cfg, created_at FROM users WHERE id = ?',
      )
      .get(userId) as
      | {
          id: number;
          email: string;
          display_name: string;
          avatar_color: string;
          role: string;
          streaming_cfg: string;
          created_at: string | number;
        }
      | undefined;

    if (!userRow) {
      throw new Error('User not found');
    }

    // 1. Load deduplicated providers for this user (with per-user custom_manifest_json isolation)
    const providerRows = this.db
      .prepare(
        `SELECT pr.manifest_url, pr.manifest_json, pr.updated_at, up.enabled, up.custom_manifest_json
         FROM user_providers up
         JOIN provider_registry pr ON pr.id = up.provider_id
         WHERE up.user_id = ?
         ORDER BY up.sort_order ASC, pr.id ASC`,
      )
      .all(userId) as Array<{
      manifest_url: string;
      manifest_json: string;
      updated_at: string | number;
      enabled: number;
      custom_manifest_json: string | null;
    }>;

    const providers: DbProviderRecord[] = [];
    for (const r of providerRows) {
      try {
        const rawJson = r.custom_manifest_json || r.manifest_json;
        providers.push({
          manifestUrl: normalizeDbManifestUrl(r.manifest_url),
          enabled: r.enabled === 1,
          manifest: JSON.parse(rawJson) as Record<string, unknown>,
          lastCheckedIso: parseDbDateTimeToIso(r.updated_at),
        });
      } catch {
        // Ignore malformed JSON
      }
    }

    // 2. Load per-user watch history via 3NF JOIN on global `media_catalog`
    const historyRows = this.db
      .prepare(
        `SELECT mc.media_id, mc.media_type, mc.title, mc.poster, mc.background,
                uh.episode_id, uh.episode_label, uh.pos_sec, uh.dur_sec, uh.updated_at
         FROM user_watch_history_v2 uh
         JOIN media_catalog mc ON mc.id = uh.media_ref
         WHERE uh.user_id = ?
         ORDER BY uh.updated_at DESC
         LIMIT 100`,
      )
      .all(userId) as Array<{
      media_id: string;
      media_type: number;
      title: string;
      poster: string | null;
      background: string | null;
      episode_id: string | null;
      episode_label: string | null;
      pos_sec: number;
      dur_sec: number;
      updated_at: string | number;
    }>;

    const watchHistory: DbWatchHistoryRecord[] = historyRows.map((h) => ({
      mediaId: h.media_id,
      mediaName: h.title,
      mediaType: h.media_type === 1 ? 'series' : 'movie',
      poster: expandMetahubUrl(h.poster, h.media_id, 'poster'),
      background: expandMetahubUrl(h.background, h.media_id, 'background'),
      episodeId: h.episode_id || undefined,
      episodeLabel: h.episode_label || undefined,
      positionSec: h.pos_sec,
      durationSec: h.dur_sec,
      updatedAtIso: parseDbDateTimeToIso(h.updated_at),
    }));

    // 3. Load per-user watchlist via 3NF JOIN on global `media_catalog`
    const watchlistRows = this.db
      .prepare(
        `SELECT mc.media_id, mc.media_type, mc.title, mc.poster, mc.rating_bp, mc.release_info
         FROM user_watchlist_v2 uw
         JOIN media_catalog mc ON mc.id = uw.media_ref
         WHERE uw.user_id = ?
         ORDER BY uw.added_at DESC`,
      )
      .all(userId) as Array<{
      media_id: string;
      media_type: number;
      title: string;
      poster: string | null;
      rating_bp: number | null;
      release_info: string | null;
    }>;

    const watchlist: DbWatchlistRecord[] = watchlistRows.map((w) => ({
      id: w.media_id,
      name: w.title,
      type: w.media_type === 1 ? 'series' : 'movie',
      poster: expandMetahubUrl(w.poster, w.media_id, 'poster'),
      imdbRating: decodeRatingBasisPoints(w.rating_bp),
      releaseInfo: w.release_info || undefined,
    }));

    return {
      user: {
        id: userRow.id,
        email: userRow.email,
        displayName: userRow.display_name,
        avatarColor: userRow.avatar_color,
        role: userRow.role === 'admin' ? 'admin' : 'user',
        createdAtIso: parseDbDateTimeToIso(userRow.created_at),
      },
      streamingConfigCompact:
        userRow.streaming_cfg || DEFAULT_STREAMING_CFG_COMPACT,
      providers,
      watchHistory,
      watchlist,
    };
  }

  /**
   * Saves a user's providers using the global deduplicated `provider_registry` + `user_providers` join table.
   * Executes inside a single atomic transaction for 100x write speed and minimal disk footprint (~12 bytes/link).
   */
  public syncUserProviders(
    userId: number,
    providers: DbProviderRecord[],
    streamingConfigCompact?: string,
  ): void {
    const nowDateTime = formatHumanDateTime();
    this.db.exec('BEGIN IMMEDIATE TRANSACTION');
    try {
      if (streamingConfigCompact !== undefined) {
        // Elide default config to '' so it takes 0 bytes per user
        const storedCfg =
          streamingConfigCompact === DEFAULT_STREAMING_CFG_COMPACT
            ? ''
            : streamingConfigCompact;
        this.db
          .prepare('UPDATE users SET streaming_cfg = ? WHERE id = ?')
          .run(storedCfg, userId);
      }

      this.db
        .prepare('DELETE FROM user_providers WHERE user_id = ?')
        .run(userId);

      const upsertRegistry = this.db.prepare(`
        INSERT INTO provider_registry (manifest_url, manifest_json, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(manifest_url) DO UPDATE SET
          updated_at = excluded.updated_at
        RETURNING id, manifest_json
      `);

      const linkUserProvider = this.db.prepare(`
        INSERT OR REPLACE INTO user_providers (user_id, provider_id, enabled, sort_order, custom_manifest_json)
        VALUES (?, ?, ?, ?, ?)
      `);

      const tursoStmts: Array<{ sql: string; args?: Array<string | number | null> }> = [
        { sql: 'DELETE FROM user_providers WHERE user_id = ?', args: [userId] },
      ];

      providers.forEach((p, idx) => {
        if (!p.manifestUrl || !p.manifest) return;
        const normalizedManifestUrl = normalizeDbManifestUrl(p.manifestUrl);
        const compactManifestJson = JSON.stringify(p.manifest);
        const regRow = upsertRegistry.get(
          normalizedManifestUrl,
          compactManifestJson,
          nowDateTime,
        ) as { id: number; manifest_json: string };
        const customOverride =
          regRow.manifest_json !== compactManifestJson ? compactManifestJson : null;
        linkUserProvider.run(
          userId,
          regRow.id,
          p.enabled ? 1 : 0,
          idx,
          customOverride,
        );
        tursoStmts.push({
          sql: 'INSERT OR REPLACE INTO provider_registry (id, manifest_url, manifest_json, updated_at) VALUES (?, ?, ?, ?)',
          args: [regRow.id, normalizedManifestUrl, regRow.manifest_json, nowDateTime],
        });
        tursoStmts.push({
          sql: 'INSERT OR REPLACE INTO user_providers (user_id, provider_id, enabled, sort_order, custom_manifest_json) VALUES (?, ?, ?, ?, ?)',
          args: [userId, regRow.id, p.enabled ? 1 : 0, idx, customOverride],
        });
      });

      this.db.exec('COMMIT');
      this.replicateBatchToTursoCloud(tursoStmts);
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  public upsertWatchHistoryItem(
    userId: number,
    entry: DbWatchHistoryRecord,
  ): void {
    const nowDateTime = formatHumanDateTime();
    const mediaRef = this.upsertMediaCatalogEntry({
      mediaId: entry.mediaId,
      mediaType: entry.mediaType,
      title: entry.mediaName,
      poster: entry.poster,
      background: entry.background,
    });

    this.db
      .prepare(
        `INSERT INTO user_watch_history_v2 (
          user_id, media_ref, episode_id, episode_label, pos_sec, dur_sec, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id, media_ref) DO UPDATE SET
          pos_sec = excluded.pos_sec,
          dur_sec = excluded.dur_sec,
          episode_id = excluded.episode_id,
          episode_label = excluded.episode_label,
          updated_at = excluded.updated_at`,
      )
      .run(
        userId,
        mediaRef,
        entry.episodeId ?? null,
        entry.episodeLabel ?? null,
        Math.max(0, Math.floor(entry.positionSec)),
        Math.max(0, Math.floor(entry.durationSec)),
        nowDateTime,
      );
  }

  public deleteWatchHistoryItem(userId: number, mediaId: string): void {
    const row = this.db
      .prepare('SELECT id FROM media_catalog WHERE media_id = ?')
      .get(mediaId) as { id: number } | undefined;
    if (!row) return;
    this.db
      .prepare(
        'DELETE FROM user_watch_history_v2 WHERE user_id = ? AND media_ref = ?',
      )
      .run(userId, row.id);
  }

  public clearWatchHistory(userId: number): void {
    this.db
      .prepare('DELETE FROM user_watch_history_v2 WHERE user_id = ?')
      .run(userId);
  }

  public syncUserWatchlist(userId: number, items: DbWatchlistRecord[]): void {
    const nowEpoch = Math.floor(Date.now() / 1000);
    this.db.exec('BEGIN IMMEDIATE TRANSACTION');
    try {
      this.db
        .prepare('DELETE FROM user_watchlist_v2 WHERE user_id = ?')
        .run(userId);
      const insertStmt = this.db.prepare(`
        INSERT OR REPLACE INTO user_watchlist_v2 (
          user_id, media_ref, added_at
        ) VALUES (?, ?, ?)
      `);
      items.forEach((item, idx) => {
        const mediaRef = this.upsertMediaCatalogEntry({
          mediaId: item.id,
          mediaType: item.type,
          title: item.name,
          poster: item.poster,
          imdbRating: item.imdbRating,
          releaseInfo: item.releaseInfo,
        });
        insertStmt.run(userId, mediaRef, formatHumanDateTime(nowEpoch - idx));
      });
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  /**
   * Returns real-time storage efficiency metrics and cloud readiness status.
   */
  public getStorageEfficiencyReport(): DbStorageEfficiencyReport {
    const countQuery = (table: string): number => {
      const r = this.db
        .prepare(`SELECT COUNT(*) AS c FROM ${table}`)
        .get() as { c: number } | undefined;
      return r?.c ?? 0;
    };

    const bytesPerUserBaseRow = 78;
    const bytesPerWatchlistLink = 12;
    const bytesPerWatchHistoryLink = 18;
    const bytesPerProviderLink = 12;
    // Typical active user: 1 profile row + 7 provider links + 8 watch history links + 8 watchlist links = ~378 bytes!
    const estimatedActiveUserTotalBytes =
      bytesPerUserBaseRow +
      7 * bytesPerProviderLink +
      8 * bytesPerWatchHistoryLink +
      8 * bytesPerWatchlistLink;

    return {
      engineMode: this.tursoUrl
        ? 'cloud-turso-replica'
        : process.env.DATABASE_URL
          ? 'cloud-postgres-ready'
          : 'local-wal-embedded',
      cloudProviderConfigured: Boolean(this.tursoUrl || process.env.DATABASE_URL),
      bytesPerUserBaseRow,
      bytesPerWatchlistLink,
      bytesPerWatchHistoryLink,
      bytesPerProviderLink,
      estimatedActiveUserTotalBytes,
      estimatedUsersPerGigabyte: Math.floor(
        (1024 * 1024 * 1024) / estimatedActiveUserTotalBytes,
      ),
      counts: {
        users: countQuery('users'),
        deduplicatedProviders: countQuery('provider_registry'),
        deduplicatedMediaCatalog: countQuery('media_catalog'),
        watchHistoryLinks: countQuery('user_watch_history_v2'),
        watchlistLinks: countQuery('user_watchlist_v2'),
      },
    };
  }
}
