#!/usr/bin/env node
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, scryptSync } from 'node:crypto';
import path from 'node:path';

const dbPath = path.resolve(process.cwd(), 'data', 'streamz_commercial.sqlite');
const db = new DatabaseSync(dbPath);

function formatHumanDateTime(input) {
  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(trimmed)) return trimmed;
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
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

// Ensure `role` and `password_hash` columns exist locally and are backfilled
const userCols = db.prepare(`PRAGMA table_info(users)`).all();
if (!userCols.some((c) => c.name === 'role')) {
  db.exec(`ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user';`);
}
if (!userCols.some((c) => c.name === 'password_hash')) {
  db.exec(`ALTER TABLE users ADD COLUMN password_hash TEXT NOT NULL DEFAULT '';`);
}
const missingHashRows = db
  .prepare(`SELECT id, pwd_salt, pwd_hash FROM users WHERE password_hash = '' OR password_hash IS NULL`)
  .all();
for (const r of missingHashRows) {
  const saltHex = Buffer.from(r.pwd_salt).toString('hex');
  const hashHex = Buffer.from(r.pwd_hash).toString('hex');
  db.prepare(`UPDATE users SET password_hash = ? WHERE id = ?`).run(
    `scrypt$${saltHex}$${hashHex}`,
    r.id,
  );
}

// Automatically migrate any STRICT tables with INTEGER timestamps to human-readable TEXT ('YYYY-MM-DD HH:MM:SS')
function hasIntCol(tableName, colName) {
  const cols = db.prepare(`PRAGMA table_info('${tableName}')`).all();
  const col = cols.find((c) => c.name === colName);
  return Boolean(col && String(col.type).toUpperCase() === 'INTEGER');
}

if (
  hasIntCol('users', 'created_at') ||
  hasIntCol('sessions', 'expires_at') ||
  hasIntCol('provider_registry', 'updated_at') ||
  hasIntCol('user_watch_history_v2', 'updated_at') ||
  hasIntCol('user_watchlist_v2', 'added_at')
) {
  db.exec('PRAGMA foreign_keys = OFF; BEGIN TRANSACTION;');
  try {
    if (hasIntCol('users', 'created_at')) {
      db.exec(`
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
    if (hasIntCol('sessions', 'expires_at')) {
      db.exec(`
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
    if (hasIntCol('provider_registry', 'updated_at')) {
      db.exec(`
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
    if (hasIntCol('user_watch_history_v2', 'updated_at')) {
      db.exec(`
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
    if (hasIntCol('user_watchlist_v2', 'added_at')) {
      db.exec(`
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
    db.exec('COMMIT;');
  } catch {
    db.exec('ROLLBACK;');
  } finally {
    db.exec('PRAGMA foreign_keys = ON;');
  }
}

// Load .env if present
import fs from 'node:fs';
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

const [, , cmd, ...args] = process.argv;

function parseFlags(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const [k, v] = arg.slice(2).split('=');
      flags[k] = v !== undefined ? v : argv[++i];
    }
  }
  return flags;
}

if (!cmd || cmd === 'list') {
  const users = db
    .prepare(
      `SELECT id, email, display_name, role, substr(password_hash, 1, 28) || '...' AS password_hash_preview, created_at
       FROM users
       ORDER BY id ASC`,
    )
    .all();
  console.log(`\nStreamZ SQLite DB: ${dbPath}`);
  console.table(users);
  console.log(
    `Usage examples:\n` +
      `  npm run db:users -- list\n` +
      `  npm run db:users -- update --email=user@example.com --name="New Name" --role=admin --password="NewPassword123!"\n` +
      `  npm run db:users -- sync-turso\n` +
      `  sqlite3 "${dbPath}" "SELECT id, email, display_name, role, created_at FROM users;"\n`,
  );
  process.exit(0);
}

if (cmd === 'create') {
  const flags = parseFlags(args);
  const email = (flags.email || '').trim().toLowerCase();
  const displayName = (flags.name || '').trim();
  const password = String(flags.password || '');
  const role = flags.role === 'admin' ? 'admin' : 'user';
  const color = (flags.color || '#E11D48').trim();

  if (!email || !displayName || !password) {
    console.error('Usage: npm run db:users -- create --email=<email> --name="<name>" --password="<password>" [--role=admin|user]');
    process.exit(1);
  }

  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 32);
  const passwordHashText = `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
  const nowDateTime = formatHumanDateTime();

  db.prepare(
    `INSERT INTO users (email, display_name, avatar_color, role, password_hash, pwd_salt, pwd_hash, streaming_cfg, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, '', ?)
     ON CONFLICT(email) DO UPDATE SET
       display_name = excluded.display_name,
       avatar_color = excluded.avatar_color,
       role = excluded.role,
       password_hash = excluded.password_hash,
       pwd_salt = excluded.pwd_salt,
       pwd_hash = excluded.pwd_hash`,
  ).run(email, displayName, color, role, passwordHashText, salt, hash, nowDateTime);

  const created = db
    .prepare(
      `SELECT id, email, display_name, role, substr(password_hash, 1, 28) || '...' AS password_hash_preview, created_at
       FROM users WHERE email = ?`,
    )
    .get(email);
  console.log('Created/updated user successfully:');
  console.table([created]);
  process.exit(0);
}

if (cmd === 'update') {
  const flags = parseFlags(args);
  const targetEmail = (flags.email || '').trim().toLowerCase();
  const targetId = flags.id ? Number(flags.id) : null;

  const user = targetId
    ? db.prepare('SELECT id, email, display_name FROM users WHERE id = ?').get(targetId)
    : db.prepare('SELECT id, email, display_name FROM users WHERE email = ?').get(targetEmail);

  if (!user) {
    console.error('User not found. Pass --email=<email> or --id=<id>.');
    process.exit(1);
  }

  if (flags.name) {
    db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(
      String(flags.name).trim(),
      user.id,
    );
  }
  if (flags.newEmail) {
    db.prepare('UPDATE users SET email = ? WHERE id = ?').run(
      String(flags.newEmail).trim().toLowerCase(),
      user.id,
    );
  }
  if (flags.color) {
    db.prepare('UPDATE users SET avatar_color = ? WHERE id = ?').run(
      String(flags.color).trim(),
      user.id,
    );
  }
  if (flags.role === 'admin' || flags.role === 'user') {
    db.prepare('UPDATE users SET role = ? WHERE id = ?').run(flags.role, user.id);
  }
  if (flags.password) {
    const salt = randomBytes(16);
    const hash = scryptSync(String(flags.password), salt, 32);
    const passwordHashText = `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
    db.prepare('UPDATE users SET pwd_salt = ?, pwd_hash = ?, password_hash = ? WHERE id = ?').run(
      salt,
      hash,
      passwordHashText,
      user.id,
    );
  }

  const updated = db
    .prepare(
      `SELECT id, email, display_name, role, substr(password_hash, 1, 28) || '...' AS password_hash_preview, created_at
       FROM users WHERE id = ?`,
    )
    .get(user.id);
  console.log('Updated user successfully:');
  console.table([updated]);
  process.exit(0);
}

if (cmd === 'sync-turso') {
  const tursoUrl = (process.env.TURSO_DATABASE_URL || '').trim();
  const tursoToken = (process.env.TURSO_AUTH_TOKEN || '').trim();
  if (!tursoUrl || !tursoToken) {
    console.error(
      'Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN in .env!\n' +
        '1. Create a free DB at https://app.turso.tech\n' +
        '2. Copy the Database URL and Generate Token into .env\n' +
        '3. Re-run: npm run db:users -- sync-turso',
    );
    process.exit(1);
  }

  const httpEndpoint = tursoUrl.replace(/^libsql:\/\//i, 'https://').replace(/\/+$/, '');
  const executeBatch = async (statements, ignoreErrors = false) => {
    const requests = statements.map(({ sql, args = [] }) => ({
      type: 'execute',
      stmt: {
        sql,
        args: args.map((v) =>
          v === null || v === undefined
            ? { type: 'null' }
            : typeof v === 'number'
              ? { type: 'integer', value: String(v) }
              : { type: 'text', value: String(v) },
        ),
      },
    }));
    requests.push({ type: 'close' });
    const resp = await fetch(`${httpEndpoint}/v2/pipeline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tursoToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ requests }),
    });
    if (!resp.ok && !ignoreErrors) {
      throw new Error(`Turso HTTP ${resp.status}: ${await resp.text()}`);
    }
  };

  // Recreate Turso Cloud tables with TEXT NOT NULL human-readable Date-Time columns
  await executeBatch(
    [
      { sql: 'DROP TABLE IF EXISTS user_watchlist_v2' },
      { sql: 'DROP TABLE IF EXISTS user_watch_history_v2' },
      { sql: 'DROP TABLE IF EXISTS user_providers' },
      { sql: 'DROP TABLE IF EXISTS sessions' },
      { sql: 'DROP TABLE IF EXISTS provider_registry' },
      { sql: 'DROP TABLE IF EXISTS media_catalog' },
      { sql: 'DROP TABLE IF EXISTS users' },
    ],
    true,
  );

  await executeBatch([
    {
      sql: `CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        display_name TEXT NOT NULL,
        avatar_color TEXT NOT NULL DEFAULT '#E11D48',
        role TEXT NOT NULL DEFAULT 'user',
        password_hash TEXT NOT NULL DEFAULT '',
        streaming_cfg TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
      )`,
    },
    {
      sql: `CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        expires_at TEXT NOT NULL
      )`,
    },
    {
      sql: `CREATE TABLE IF NOT EXISTS provider_registry (
        id INTEGER PRIMARY KEY,
        manifest_url TEXT NOT NULL UNIQUE,
        manifest_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
    },
    {
      sql: `CREATE TABLE IF NOT EXISTS user_providers (
        user_id INTEGER NOT NULL,
        provider_id INTEGER NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        sort_order INTEGER NOT NULL DEFAULT 0,
        custom_manifest_json TEXT,
        PRIMARY KEY (user_id, provider_id)
      )`,
    },
    {
      sql: `CREATE TABLE IF NOT EXISTS media_catalog (
        id INTEGER PRIMARY KEY,
        media_id TEXT NOT NULL UNIQUE,
        media_type INTEGER NOT NULL,
        title TEXT NOT NULL,
        poster TEXT,
        background TEXT,
        rating_bp INTEGER,
        release_info TEXT
      )`,
    },
    {
      sql: `CREATE TABLE IF NOT EXISTS user_watch_history_v2 (
        user_id INTEGER NOT NULL,
        media_ref INTEGER NOT NULL,
        episode_id TEXT,
        episode_label TEXT,
        pos_sec INTEGER NOT NULL,
        dur_sec INTEGER NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (user_id, media_ref)
      )`,
    },
    {
      sql: `CREATE TABLE IF NOT EXISTS user_watchlist_v2 (
        user_id INTEGER NOT NULL,
        media_ref INTEGER NOT NULL,
        added_at TEXT NOT NULL,
        PRIMARY KEY (user_id, media_ref)
      )`,
    },
  ]);

  const users = db
    .prepare(
      'SELECT id, email, display_name, avatar_color, role, password_hash, streaming_cfg, created_at FROM users',
    )
    .all();
  const sessions = db
    .prepare('SELECT hex(token_hash) AS token_hash_hex, user_id, expires_at FROM sessions')
    .all();
  const providers = db
    .prepare('SELECT id, manifest_url, manifest_json, updated_at FROM provider_registry')
    .all();
  const userProviders = db
    .prepare('SELECT user_id, provider_id, enabled, sort_order, custom_manifest_json FROM user_providers')
    .all();
  const mediaCatalog = db
    .prepare('SELECT id, media_id, media_type, title, poster, background, rating_bp, release_info FROM media_catalog')
    .all();
  const watchHistory = db
    .prepare('SELECT user_id, media_ref, episode_id, episode_label, pos_sec, dur_sec, updated_at FROM user_watch_history_v2')
    .all();
  const watchlist = db
    .prepare('SELECT user_id, media_ref, added_at FROM user_watchlist_v2')
    .all();

  const syncStmts = [
    ...users.map((u) => ({
      sql: 'INSERT OR REPLACE INTO users (id, email, display_name, avatar_color, role, password_hash, streaming_cfg, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      args: [
        u.id,
        u.email,
        u.display_name,
        u.avatar_color,
        u.role || 'user',
        u.password_hash || '',
        u.streaming_cfg,
        formatHumanDateTime(u.created_at),
      ],
    })),
    ...sessions.map((s) => ({
      sql: 'INSERT OR REPLACE INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)',
      args: [s.token_hash_hex, s.user_id, formatHumanDateTime(s.expires_at)],
    })),
    ...providers.map((p) => ({
      sql: 'INSERT OR REPLACE INTO provider_registry (id, manifest_url, manifest_json, updated_at) VALUES (?, ?, ?, ?)',
      args: [p.id, p.manifest_url, p.manifest_json, formatHumanDateTime(p.updated_at)],
    })),
    ...userProviders.map((up) => ({
      sql: 'INSERT OR REPLACE INTO user_providers (user_id, provider_id, enabled, sort_order, custom_manifest_json) VALUES (?, ?, ?, ?, ?)',
      args: [up.user_id, up.provider_id, up.enabled, up.sort_order, up.custom_manifest_json],
    })),
    ...mediaCatalog.map((m) => ({
      sql: 'INSERT OR REPLACE INTO media_catalog (id, media_id, media_type, title, poster, background, rating_bp, release_info) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      args: [m.id, m.media_id, m.media_type, m.title, m.poster, m.background, m.rating_bp, m.release_info],
    })),
    ...watchHistory.map((h) => ({
      sql: 'INSERT OR REPLACE INTO user_watch_history_v2 (user_id, media_ref, episode_id, episode_label, pos_sec, dur_sec, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      args: [
        h.user_id,
        h.media_ref,
        h.episode_id,
        h.episode_label,
        h.pos_sec,
        h.dur_sec,
        formatHumanDateTime(h.updated_at),
      ],
    })),
    ...watchlist.map((w) => ({
      sql: 'INSERT OR REPLACE INTO user_watchlist_v2 (user_id, media_ref, added_at) VALUES (?, ?, ?)',
      args: [w.user_id, w.media_ref, formatHumanDateTime(w.added_at)],
    })),
  ];

  if (syncStmts.length > 0) {
    await executeBatch(syncStmts);
  }
  console.log(
    `Synced ${users.length} users, ${sessions.length} sessions, ${providers.length} providers, ${mediaCatalog.length} media items, ${watchHistory.length} watch history rows, and ${watchlist.length} watchlist rows to Turso Cloud (${tursoUrl})!`,
  );
  process.exit(0);
}
