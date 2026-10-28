import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { ChildProcess, spawn } from 'node:child_process';
import type { IncomingMessage, ServerResponse } from 'node:http';
import ffmpegPath from 'ffmpeg-static';
import {
  AdminUserSummary,
  DbProviderRecord,
  DbWatchHistoryRecord,
  DbWatchlistRecord,
  StreamZDatabase,
} from './src/server/streamzDb';
import { globalCache } from './src/server/redisCacheEngine';
import {
  isSafePublicUrl,
  maskScryptPasswordHash,
  SlidingWindowRateLimiter,
} from './src/security/securityGuards';

let dbInstance: StreamZDatabase | null = null;
function getDb(): StreamZDatabase {
  if (!dbInstance) {
    dbInstance = new StreamZDatabase();
  }
  return dbInstance;
}

function readJsonBody<T = Record<string, unknown>>(req: IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk: Buffer) => {
      raw += chunk.toString('utf8');
      if (raw.length > 5 * 1024 * 1024) {
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve((raw ? JSON.parse(raw) : {}) as T);
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(
  res: ServerResponse,
  statusCode: number,
  data: unknown,
  extraHeaders?: Record<string, string>,
): void {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (extraHeaders) {
    for (const [k, v] of Object.entries(extraHeaders)) {
      res.setHeader(k, v);
    }
  }
  res.end(JSON.stringify(data));
}

function extractBearerToken(req: IncomingMessage, parsedUrl?: URL): string | null {
  const auth = req.headers.authorization;
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
    const token = auth.slice(7).trim();
    if (token) return token;
  }
  const urlObj = parsedUrl || new URL(req.url || '', 'http://localhost');
  const queryToken = urlObj.searchParams.get('token')?.trim();
  if (queryToken) {
    return queryToken;
  }
  const cookieHeader = req.headers.cookie;
  if (typeof cookieHeader === 'string' && cookieHeader.includes('streamz_session=')) {
    const match = cookieHeader.match(/(?:^|;\s*)streamz_session=([^;]+)/);
    if (match && match[1]) {
      return decodeURIComponent(match[1].trim());
    }
  }
  return null;
}

function getClientIp(req: IncomingMessage): string {
  return req.socket?.remoteAddress || '127.0.0.1';
}

function redactAdminUser(u: AdminUserSummary): AdminUserSummary {
  return {
    ...u,
    passwordHash: maskScryptPasswordHash(u.passwordHash),
  };
}

function redactAdminUsers(users: AdminUserSummary[]): AdminUserSummary[] {
  return users.map(redactAdminUser);
}

/**
 * Checks whether a target URL is a valid Stremio JSON endpoint and whether it is safe for
 * unauthenticated Discover-page browsing (`/manifest.json` or `/catalog/`).
 */
export function evaluateStremioProxyUrlPolicy(
  rawUrl: string,
  isAuthenticated: boolean,
): { allowed: boolean; statusCode: number; reason: string } {
  if (!rawUrl || !isSafePublicUrl(rawUrl, false)) {
    return {
      allowed: false,
      statusCode: 400,
      reason: 'Invalid or blocked target URL',
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { allowed: false, statusCode: 400, reason: 'Malformed target URL' };
  }

  const pathname = parsed.pathname;
  const isManifest = pathname.endsWith('/manifest.json');
  const isCatalog = pathname.includes('/catalog/') && pathname.endsWith('.json');
  const isMeta = pathname.includes('/meta/') && pathname.endsWith('.json');
  const isStream = pathname.includes('/stream/') && pathname.endsWith('.json');
  const isSubtitles = pathname.includes('/subtitles/') && pathname.endsWith('.json');
  const isAddonCollection =
    parsed.hostname === 'api.strem.io' && pathname.endsWith('/addonscollection.json');

  if (
    !isManifest &&
    !isCatalog &&
    !isMeta &&
    !isStream &&
    !isSubtitles &&
    !isAddonCollection
  ) {
    return {
      allowed: false,
      statusCode: 403,
      reason: 'Blocked non-Stremio resource path on Stremio proxy.',
    };
  }

  // Unauthenticated visitors on the Discover page may only load manifests & public catalogs
  if (!isAuthenticated && !isManifest && !isCatalog) {
    return {
      allowed: false,
      statusCode: 401,
      reason: 'Authentication required to fetch streams, subtitles, or item metadata.',
    };
  }

  return { allowed: true, statusCode: 200, reason: 'OK' };
}

const LANGUAGE_NAMES: Record<string, string> = {
  hin: 'Hindi',
  hi: 'Hindi',
  eng: 'English',
  en: 'English',
  tam: 'Tamil',
  ta: 'Tamil',
  tel: 'Telugu',
  te: 'Telugu',
  mal: 'Malayalam',
  ml: 'Malayalam',
  kan: 'Kannada',
  kn: 'Kannada',
  ben: 'Bengali',
  bn: 'Bengali',
  mar: 'Marathi',
  mr: 'Marathi',
  pan: 'Punjabi',
  pa: 'Punjabi',
  jpn: 'Japanese',
  ja: 'Japanese',
  kor: 'Korean',
  ko: 'Korean',
  spa: 'Spanish',
  es: 'Spanish',
  fre: 'French',
  fra: 'French',
  fr: 'French',
  ger: 'German',
  deu: 'German',
  de: 'German',
  ita: 'Italian',
  it: 'Italian',
  por: 'Portuguese',
  pt: 'Portuguese',
  rus: 'Russian',
  ru: 'Russian',
  chi: 'Chinese',
  zho: 'Chinese',
  zh: 'Chinese',
  ara: 'Arabic',
  ar: 'Arabic',
  tur: 'Turkish',
  tr: 'Turkish',
  tha: 'Thai',
  th: 'Thai',
  ind: 'Indonesian',
  id: 'Indonesian',
  und: 'Original / Default',
};

const resolvedUrlCache = new Map<string, { url: string; expiresAt: number }>();

/**
 * Follows redirects up to 5 hops and unwraps intermediate link-generator pages
 * (such as HubCloud `cryptonewz.online/dl.php?link=https://video-downloads.googleusercontent.com/...`)
 * into the underlying direct media stream URL.
 * Validates every hop against `isSafePublicUrl` to block 302 redirect SSRF attacks.
 */
export async function unwrapMediaStreamUrl(initialUrl: string): Promise<string> {
  if (!isSafePublicUrl(initialUrl, false)) {
    throw new Error('Blocked unsafe stream URL');
  }

  const cached = resolvedUrlCache.get(initialUrl);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.url;
  }

  let current = initialUrl;
  for (let hop = 0; hop < 5; hop++) {
    if (!isSafePublicUrl(current, false)) {
      throw new Error('Blocked unsafe redirect target');
    }

    // Check if current URL itself has a ?link=https://... query parameter
    try {
      const parsedCurrent = new URL(current);
      const embeddedLink =
        parsedCurrent.searchParams.get('link') ||
        parsedCurrent.searchParams.get('url');
      if (embeddedLink && /^https?:\/\//i.test(embeddedLink)) {
        if (!isSafePublicUrl(embeddedLink, false)) {
          throw new Error('Blocked unsafe embedded redirect target');
        }
        current = embeddedLink;
        continue;
      }
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('Blocked unsafe')) {
        throw err;
      }
    }

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 7000);
      const resp = await fetch(current, {
        method: 'GET',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
          Range: 'bytes=0-1',
        },
        redirect: 'manual',
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (resp.status >= 300 && resp.status < 400) {
        const loc = resp.headers.get('location');
        if (!loc) break;
        const nextUrl = new URL(loc, current).toString();
        if (!isSafePublicUrl(nextUrl, false)) {
          throw new Error('Blocked unsafe redirect target');
        }
        const parsedNext = new URL(nextUrl);
        const embedded =
          parsedNext.searchParams.get('link') || parsedNext.searchParams.get('url');
        if (embedded && /^https?:\/\//i.test(embedded)) {
          if (!isSafePublicUrl(embedded, false)) {
            throw new Error('Blocked unsafe redirect target');
          }
          current = embedded;
          break;
        }
        current = nextUrl;
        continue;
      }
      break;
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('Blocked unsafe')) {
        throw err;
      }
      break;
    }
  }

  if (!isSafePublicUrl(current, false)) {
    throw new Error('Blocked unsafe redirect target');
  }

  resolvedUrlCache.set(initialUrl, {
    url: current,
    expiresAt: Date.now() + 5 * 60 * 1000,
  });
  return current;
}

/**
 * Fetches JSON from an upstream Stremio addon while validating every HTTP redirect hop
 * against `isSafePublicUrl` to prevent 302 redirect SSRF attacks.
 */
async function safeUpstreamJsonFetch(targetUrl: string): Promise<unknown> {
  let currentUrl = targetUrl;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 11000);

  try {
    for (let hop = 0; hop < 4; hop++) {
      if (!isSafePublicUrl(currentUrl, false)) {
        throw new Error('Blocked unsafe redirect target');
      }
      const upstream = await fetch(currentUrl, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'StreamZ/2.0 (High-Speed Cache Proxy)',
        },
        redirect: 'manual',
        signal: controller.signal,
      });

      if (upstream.status >= 300 && upstream.status < 400) {
        const loc = upstream.headers.get('location');
        if (!loc) {
          throw new Error(`Upstream redirect missing Location header`);
        }
        const nextUrl = new URL(loc, currentUrl).toString();
        if (!isSafePublicUrl(nextUrl, false)) {
          throw new Error('Blocked unsafe redirect target');
        }
        currentUrl = nextUrl;
        continue;
      }

      if (!upstream.ok) {
        throw new Error(`Upstream HTTP ${upstream.status}`);
      }
      return await upstream.json();
    }
    throw new Error('Too many upstream redirects');
  } finally {
    clearTimeout(timer);
  }
}

export interface ProbedAudioTrack {
  audioIndex: number;
  streamIndex: number;
  langCode: string;
  langName: string;
  codec: string;
  channels: string;
  title?: string;
  label: string;
}

export interface MediaProbeResult {
  resolvedUrl: string;
  durationSec: number;
  videoCodec: string;
  audioTracks: ProbedAudioTrack[];
}

function parseFfmpegProbeOutput(stderr: string, resolvedUrl: string): MediaProbeResult {
  let durationSec = 0;
  const durMatch = stderr.match(/Duration:\s*(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)/);
  if (durMatch) {
    durationSec =
      Number(durMatch[1]) * 3600 +
      Number(durMatch[2]) * 60 +
      Number(durMatch[3]);
  }

  let videoCodec = 'h264';
  const vidMatch = stderr.match(/Stream #0:\d+[^\n]*Video:\s*([a-zA-Z0-9_]+)/);
  if (vidMatch) {
    videoCodec = vidMatch[1].toLowerCase();
  }

  const audioTracks: ProbedAudioTrack[] = [];
  const lines = stderr.split('\n');
  let currentAudio: ProbedAudioTrack | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const streamMatch = line.match(
      /Stream #0:(\d+)(?:\(([a-zA-Z0-9_-]+)\))?[^\n]*Audio:\s*([a-zA-Z0-9_]+)(?:[^,]*,\s*\d+\s*Hz,\s*([^,]+))?/,
    );
    if (streamMatch) {
      const streamIndex = Number(streamMatch[1]);
      const rawLang = (streamMatch[2] || 'und').toLowerCase();
      const codec = (streamMatch[3] || 'audio').toUpperCase();
      const channels = (streamMatch[4] || 'stereo').trim();
      const langName =
        LANGUAGE_NAMES[rawLang] || rawLang.toUpperCase();
      const audioIndex = audioTracks.length;

      currentAudio = {
        audioIndex,
        streamIndex,
        langCode: rawLang,
        langName,
        codec,
        channels,
        label: `${langName} (${codec} ${channels})`,
      };
      audioTracks.push(currentAudio);
      continue;
    }

    // Stop attaching metadata if another Stream # starts
    if (/^\s*Stream #0:/.test(line)) {
      currentAudio = null;
      continue;
    }

    if (currentAudio) {
      const titleMatch = line.match(/^\s*title\s*:\s*(.+)$/i);
      if (titleMatch) {
        const cleanTitle = titleMatch[1].trim();
        if (cleanTitle && !cleanTitle.toLowerCase().includes('hdhub4u')) {
          currentAudio.title = cleanTitle;
          currentAudio.label = `${currentAudio.langName} — ${cleanTitle} (${currentAudio.codec})`;
        }
      }
    }
  }

  // Sort probed audio tracks: English first (priority 0), then Hindi (priority 1), then any other language (priority 2)
  // while preserving each track's true FFmpeg `audioIndex` for `-map 0:a:${audioIndex}`
  const getLangPriority = (t: ProbedAudioTrack): number => {
    const code = (t.langCode || '').toLowerCase();
    const text = `${t.langName} ${t.title || ''} ${t.label}`.toLowerCase();
    if (code === 'eng' || code === 'en' || /\b(english|eng)\b/i.test(text)) return 0;
    if (code === 'hin' || code === 'hi' || /\b(hindi|hin)\b/i.test(text)) return 1;
    return 2;
  };
  audioTracks.sort((a, b) => {
    const pA = getLangPriority(a);
    const pB = getLangPriority(b);
    if (pA !== pB) return pA - pB;
    return a.audioIndex - b.audioIndex;
  });

  return {
    resolvedUrl,
    durationSec,
    videoCodec,
    audioTracks,
  };
}

export interface MiddlewareContainer {
  use: (
    route: string,
    handler: (req: IncomingMessage, res: ServerResponse, next?: () => void) => void | Promise<void>,
  ) => void;
}

const MAX_ACTIVE_STREAMS_PER_USER = 2;

export function registerStreamzApiMiddlewares(
  middlewares: MiddlewareContainer,
  customDb?: StreamZDatabase,
  customRateLimiter?: SlidingWindowRateLimiter,
): void {
  const activeDb = () => customDb || getDb();
  const authLimiter = customRateLimiter || new SlidingWindowRateLimiter(5, 60_000);
  const activeUserFfmpegStreams = new Map<number, Set<ChildProcess>>();

  // 0. Commercial-Grade SQLite WAL User Auth, Password Change & Admin RBAC Endpoints
  middlewares.use('/api/auth/register', async (req, res) => {
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'Method not allowed' });
      return;
    }
    try {
      const token = extractBearerToken(req);
      const callerId = activeDb().resolveUserIdFromToken(token);
      if (!callerId || !activeDb().isUserAdmin(callerId)) {
        sendJson(res, 403, {
          error: 'Only an administrator can create new user accounts.',
        });
        return;
      }
      const body = await readJsonBody<{
        email?: string;
        password?: string;
        displayName?: string;
        avatarColor?: string;
        role?: 'admin' | 'user';
      }>(req);
      const createdUser = activeDb().adminCreateUser(callerId, {
        email: body.email || '',
        password: body.password || '',
        displayName: body.displayName || '',
        role: body.role,
        avatarColor: body.avatarColor,
      });
      sendJson(res, 200, { user: redactAdminUser(createdUser) });
    } catch (err) {
      sendJson(res, 400, {
        error: err instanceof Error ? err.message : 'User creation failed',
      });
    }
  });

  middlewares.use('/api/auth/change-password', async (req, res) => {
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'Method not allowed' });
      return;
    }
    const token = extractBearerToken(req);
    const userId = activeDb().resolveUserIdFromToken(token);
    if (!userId) {
      sendJson(res, 401, { error: 'Unauthorized' });
      return;
    }
    const rateKey = `pwd:${getClientIp(req)}:${userId}`;
    const rateCheck = authLimiter.check(rateKey);
    if (!rateCheck.allowed) {
      sendJson(
        res,
        429,
        {
          error: `Too many failed password attempts. Please wait ${rateCheck.retryAfterSec}s before trying again.`,
        },
        { 'Retry-After': String(rateCheck.retryAfterSec) },
      );
      return;
    }

    try {
      const body = await readJsonBody<{
        currentPassword?: string;
        newPassword?: string;
      }>(req);
      activeDb().changeUserPassword({
        userId,
        currentPassword: body.currentPassword || '',
        newPassword: body.newPassword || '',
        retainToken: token,
      });
      authLimiter.reset(rateKey);
      sendJson(res, 200, { ok: true, message: 'Password updated successfully.' });
    } catch (err) {
      authLimiter.recordFailure(rateKey);
      sendJson(res, 400, {
        error: err instanceof Error ? err.message : 'Failed to change password.',
      });
    }
  });

  middlewares.use('/api/admin/users', async (req, res) => {
    const token = extractBearerToken(req);
    const adminId = activeDb().resolveUserIdFromToken(token);
    if (!adminId) {
      sendJson(res, 401, { error: 'Unauthorized: Please sign in.' });
      return;
    }
    if (!activeDb().isUserAdmin(adminId)) {
      sendJson(res, 403, {
        error: 'Forbidden: Administrator access required.',
      });
      return;
    }

    try {
      if (req.method === 'GET') {
        sendJson(res, 200, {
          users: redactAdminUsers(activeDb().adminListUsers(adminId)),
          diagnostics: activeDb().getStorageEfficiencyReport(),
        });
        return;
      }

      if (req.method === 'POST') {
        const body = await readJsonBody<{
          email?: string;
          password?: string;
          displayName?: string;
          role?: 'admin' | 'user';
          avatarColor?: string;
        }>(req);
        const created = activeDb().adminCreateUser(adminId, {
          email: body.email || '',
          password: body.password || '',
          displayName: body.displayName || '',
          role: body.role,
          avatarColor: body.avatarColor,
        });
        sendJson(res, 200, {
          user: redactAdminUser(created),
          users: redactAdminUsers(activeDb().adminListUsers(adminId)),
        });
        return;
      }

      if (req.method === 'PUT') {
        const body = await readJsonBody<{
          targetUserId?: number;
          email?: string;
          displayName?: string;
          role?: 'admin' | 'user';
          avatarColor?: string;
          newPassword?: string;
        }>(req);
        if (!body.targetUserId) {
          sendJson(res, 400, { error: 'Missing targetUserId' });
          return;
        }
        const updated = activeDb().adminUpdateUser(adminId, Number(body.targetUserId), {
          email: body.email,
          displayName: body.displayName,
          role: body.role,
          avatarColor: body.avatarColor,
          newPassword: body.newPassword,
        });
        sendJson(res, 200, {
          user: redactAdminUser(updated),
          users: redactAdminUsers(activeDb().adminListUsers(adminId)),
        });
        return;
      }

      if (req.method === 'DELETE') {
        const urlObj = new URL(req.url || '', 'http://localhost');
        const targetId = Number(urlObj.searchParams.get('id') || 0);
        if (!targetId) {
          sendJson(res, 400, { error: 'Missing user id parameter' });
          return;
        }
        activeDb().adminDeleteUser(adminId, targetId);
        sendJson(res, 200, {
          ok: true,
          users: redactAdminUsers(activeDb().adminListUsers(adminId)),
        });
        return;
      }

      sendJson(res, 405, { error: 'Method not allowed' });
    } catch (err) {
      sendJson(res, 400, {
        error: err instanceof Error ? err.message : 'Admin operation failed',
      });
    }
  });

  middlewares.use('/api/admin/user-providers', async (req, res) => {
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'Method not allowed' });
      return;
    }
    const token = extractBearerToken(req);
    const adminId = activeDb().resolveUserIdFromToken(token);
    if (!adminId) {
      sendJson(res, 401, { error: 'Unauthorized: Please sign in.' });
      return;
    }
    if (!activeDb().isUserAdmin(adminId)) {
      sendJson(res, 403, { error: 'Forbidden: Administrator access required.' });
      return;
    }
    try {
      const body = await readJsonBody<{
        targetUserId?: number;
        providers?: DbProviderRecord[];
      }>(req);
      if (!body.targetUserId) {
        sendJson(res, 400, { error: 'Missing targetUserId' });
        return;
      }
      activeDb().syncUserProviders(
        Number(body.targetUserId),
        Array.isArray(body.providers) ? body.providers : [],
      );
      sendJson(res, 200, {
        ok: true,
        users: redactAdminUsers(activeDb().adminListUsers(adminId)),
      });
    } catch (err) {
      sendJson(res, 400, {
        error: err instanceof Error ? err.message : 'Failed to update user providers',
      });
    }
  });

  middlewares.use('/api/auth/login', async (req, res) => {
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'Method not allowed' });
      return;
    }
    let rateKey = `login:${getClientIp(req)}`;
    try {
      const body = await readJsonBody<{ email?: string; password?: string }>(req);
      const cleanEmail = (body.email || '').trim().toLowerCase();
      rateKey = `login:${getClientIp(req)}:${cleanEmail}`;

      const rateCheck = authLimiter.check(rateKey);
      if (!rateCheck.allowed) {
        sendJson(
          res,
          429,
          {
            error: `Too many failed sign-in attempts. Please wait ${rateCheck.retryAfterSec}s before trying again.`,
          },
          { 'Retry-After': String(rateCheck.retryAfterSec) },
        );
        return;
      }

      const result = activeDb().loginUser({
        email: cleanEmail,
        password: body.password || '',
      });
      authLimiter.reset(rateKey);
      sendJson(res, 200, result, {
        'Set-Cookie': `streamz_session=${encodeURIComponent(result.token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=2592000`,
      });
    } catch (err) {
      authLimiter.recordFailure(rateKey);
      sendJson(res, 401, {
        error: err instanceof Error ? err.message : 'Login failed',
      });
    }
  });

  middlewares.use('/api/auth/logout', async (req, res) => {
    const token = extractBearerToken(req);
    if (token) {
      activeDb().revokeSession(token);
    }
    sendJson(
      res,
      200,
      { ok: true },
      {
        'Set-Cookie': 'streamz_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0',
      },
    );
  });

  middlewares.use('/api/user/state', async (req, res) => {
    const token = extractBearerToken(req);
    const userId = activeDb().resolveUserIdFromToken(token);
    if (!userId) {
      sendJson(res, 401, { error: 'Unauthorized' });
      return;
    }
    try {
      const state = activeDb().getUserState(userId);
      sendJson(res, 200, state);
    } catch (err) {
      sendJson(res, 404, {
        error: err instanceof Error ? err.message : 'User state not found',
      });
    }
  });

  middlewares.use('/api/user/providers', async (req, res) => {
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'Method not allowed' });
      return;
    }
    const token = extractBearerToken(req);
    const userId = activeDb().resolveUserIdFromToken(token);
    if (!userId) {
      sendJson(res, 401, { error: 'Unauthorized' });
      return;
    }
    try {
      const body = await readJsonBody<{
        providers?: DbProviderRecord[];
        streamingConfigCompact?: string;
      }>(req);
      activeDb().syncUserProviders(
        userId,
        Array.isArray(body.providers) ? body.providers : [],
        body.streamingConfigCompact,
      );
      sendJson(res, 200, { ok: true });
    } catch (err) {
      sendJson(res, 500, {
        error: err instanceof Error ? err.message : 'Failed to sync providers',
      });
    }
  });

  middlewares.use('/api/user/watch-history', async (req, res) => {
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'Method not allowed' });
      return;
    }
    const token = extractBearerToken(req);
    const userId = activeDb().resolveUserIdFromToken(token);
    if (!userId) {
      sendJson(res, 401, { error: 'Unauthorized' });
      return;
    }
    try {
      const body = await readJsonBody<{
        action?: 'upsert' | 'delete' | 'clear';
        entry?: DbWatchHistoryRecord;
        mediaId?: string;
      }>(req);

      if (body.action === 'upsert' && body.entry) {
        activeDb().upsertWatchHistoryItem(userId, body.entry);
      } else if (body.action === 'delete' && body.mediaId) {
        activeDb().deleteWatchHistoryItem(userId, body.mediaId);
      } else if (body.action === 'clear') {
        activeDb().clearWatchHistory(userId);
      }
      sendJson(res, 200, { ok: true });
    } catch (err) {
      sendJson(res, 500, {
        error: err instanceof Error ? err.message : 'Failed to update watch history',
      });
    }
  });

  middlewares.use('/api/user/watchlist', async (req, res) => {
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'Method not allowed' });
      return;
    }
    const token = extractBearerToken(req);
    const userId = activeDb().resolveUserIdFromToken(token);
    if (!userId) {
      sendJson(res, 401, { error: 'Unauthorized' });
      return;
    }
    try {
      const body = await readJsonBody<{ watchlist?: DbWatchlistRecord[] }>(req);
      activeDb().syncUserWatchlist(
        userId,
        Array.isArray(body.watchlist) ? body.watchlist : [],
      );
      sendJson(res, 200, { ok: true });
    } catch (err) {
      sendJson(res, 500, {
        error: err instanceof Error ? err.message : 'Failed to sync watchlist',
      });
    }
  });

  // Protected Admin-Only DB Diagnostics Endpoint
  middlewares.use('/api/db/diagnostics', (req, res) => {
    const token = extractBearerToken(req);
    const callerId = activeDb().resolveUserIdFromToken(token);
    if (!callerId) {
      sendJson(res, 401, { error: 'Unauthorized: Sign in required.' });
      return;
    }
    if (!activeDb().isUserAdmin(callerId)) {
      sendJson(res, 403, { error: 'Forbidden: Administrator access required.' });
      return;
    }
    try {
      const report = activeDb().getStorageEfficiencyReport();
      sendJson(res, 200, report);
    } catch (err) {
      sendJson(res, 500, {
        error: err instanceof Error ? err.message : 'Failed to read DB diagnostics',
      });
    }
  });

  // 1. Resolve stremio-addons.net page slugs (Requires Authenticated User)
  middlewares.use('/api/resolve-stremio-addon', async (req, res) => {
    const urlObj = new URL(req.url || '', 'http://localhost');
    const token = extractBearerToken(req, urlObj);
    const userId = activeDb().resolveUserIdFromToken(token);
    if (!userId) {
      sendJson(res, 401, { error: 'Authentication required to resolve addons.' });
      return;
    }

    try {
      const slug = (urlObj.searchParams.get('slug') || '')
        .trim()
        .replace(/[^a-zA-Z0-9_-]/g, '');

      if (!slug) {
        sendJson(res, 400, { error: 'Missing slug parameter' });
        return;
      }

      const pageResp = await fetch(
        `https://stremio-addons.net/addons/${encodeURIComponent(slug)}`,
        {
          headers: {
            'User-Agent': 'streamZ/1.0 (Declarative Stremio Addon Resolver)',
            Accept: 'text/html',
          },
          redirect: 'manual',
        },
      );

      if (!pageResp.ok) {
        sendJson(res, pageResp.status, { error: `Upstream returned ${pageResp.status}` });
        return;
      }

      const html = await pageResp.text();
      const match = html.match(/https:\/\/[^"\\]+\/manifest\.json/i);
      if (match && match[0] && isSafePublicUrl(match[0], true)) {
        sendJson(res, 200, { manifestUrl: match[0] });
        return;
      }

      sendJson(res, 404, { error: 'No safe manifestUrl found on addon page' });
    } catch (err) {
      sendJson(res, 500, {
        error: err instanceof Error ? err.message : 'Resolver error',
      });
    }
  });

  // 1a. High-Speed Redis + L1 LRU Stremio JSON Cache Proxy (SSRF + Auth Policy Hardened)
  middlewares.use('/api/stremio-proxy', async (req, res) => {
    try {
      const urlObj = new URL(req.url || '', 'http://localhost');
      const targetUrl = (urlObj.searchParams.get('url') || '').trim();
      const token = extractBearerToken(req, urlObj);
      const userId = activeDb().resolveUserIdFromToken(token);

      const policy = evaluateStremioProxyUrlPolicy(targetUrl, Boolean(userId));
      if (!policy.allowed) {
        sendJson(res, policy.statusCode, { error: policy.reason });
        return;
      }

      // Determine optimal TTL based on Stremio resource type
      let ttlSec = 900; // 15 min default for catalogs
      if (targetUrl.endsWith('/manifest.json')) {
        ttlSec = 3600; // 1 hour for manifests
      } else if (targetUrl.includes('/meta/')) {
        ttlSec = 1800; // 30 min for metadata
      } else if (targetUrl.includes('/stream/') || targetUrl.includes('/subtitles/')) {
        ttlSec = 600; // 10 min for streams & subtitles
      }

      const { data, cacheStatus } = await globalCache.getOrFetch<unknown>(
        `stremio:${targetUrl}`,
        ttlSec,
        () => safeUpstreamJsonFetch(targetUrl),
      );

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Cache', cacheStatus);
      res.setHeader('Cache-Control', `public, max-age=${ttlSec}`);
      res.end(JSON.stringify(data));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upstream fetch error';
      const status = msg.startsWith('Blocked unsafe') ? 400 : 502;
      sendJson(res, status, { error: msg });
    }
  });

  // 2. Probe media stream for duration and embedded multi-language audio tracks (Requires Auth)
  middlewares.use('/api/media-probe', async (req, res) => {
    try {
      const urlObj = new URL(req.url || '', 'http://localhost');
      const token = extractBearerToken(req, urlObj);
      const userId = activeDb().resolveUserIdFromToken(token);
      if (!userId) {
        sendJson(res, 401, { error: 'Authentication required to probe media streams.' });
        return;
      }

      const rawStreamUrl = (urlObj.searchParams.get('url') || '').trim();
      if (!rawStreamUrl || !isSafePublicUrl(rawStreamUrl, false)) {
        sendJson(res, 400, { error: 'Invalid or blocked stream URL' });
        return;
      }

      if (!ffmpegPath) {
        sendJson(res, 500, { error: 'ffmpeg-static binary unavailable' });
        return;
      }

      const { data, cacheStatus } = await globalCache.getOrFetch<MediaProbeResult>(
        `probe:${rawStreamUrl}`,
        1800,
        async () => {
          const resolvedUrl = await unwrapMediaStreamUrl(rawStreamUrl);
          return await new Promise<MediaProbeResult>((resolve) => {
            const proc = spawn(
              ffmpegPath!,
              [
                '-hide_banner',
                '-protocol_whitelist',
                'http,https,tcp,tls,crypto',
                '-user_agent',
                'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
                '-analyzeduration',
                '1800000',
                '-probesize',
                '2000000',
                '-i',
                resolvedUrl,
              ],
              { stdio: ['ignore', 'ignore', 'pipe'] },
            );

            let stderr = '';
            const killTimer = setTimeout(() => {
              proc.kill('SIGKILL');
            }, 9000);

            proc.stderr.on('data', (chunk: Buffer) => {
              stderr += chunk.toString('utf8');
            });

            proc.on('close', () => {
              clearTimeout(killTimer);
              resolve(parseFfmpegProbeOutput(stderr, resolvedUrl));
            });
          });
        },
      );

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Cache', cacheStatus);
      res.end(JSON.stringify(data));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Probe failed';
      const status = msg.startsWith('Blocked unsafe') ? 400 : 500;
      sendJson(res, status, { error: msg });
    }
  });

  // 3. Live FFmpeg Low-Latency Remux & Multi-Language Audio Transcode Stream (Requires Auth & Per-User Concurrency Cap)
  middlewares.use('/api/media-stream', async (req, res) => {
    try {
      const urlObj = new URL(req.url || '', 'http://localhost');
      const token = extractBearerToken(req, urlObj);
      const userId = activeDb().resolveUserIdFromToken(token);
      if (!userId) {
        sendJson(res, 401, { error: 'Authentication required to stream media.' });
        return;
      }

      const rawStreamUrl = (urlObj.searchParams.get('url') || '').trim();
      const audioTrack = Math.max(
        0,
        parseInt(urlObj.searchParams.get('audioTrack') || '0', 10) || 0,
      );
      const startSec = Math.max(
        0,
        parseFloat(urlObj.searchParams.get('start') || '0') || 0,
      );

      if (!rawStreamUrl || !isSafePublicUrl(rawStreamUrl, false) || !ffmpegPath) {
        sendJson(res, 400, { error: 'Invalid or blocked stream request' });
        return;
      }

      const resolvedUrl = await unwrapMediaStreamUrl(rawStreamUrl);

      // Enforce per-user concurrent FFmpeg process limit (evict oldest process if exceeding limit)
      let userProcs = activeUserFfmpegStreams.get(userId);
      if (!userProcs) {
        userProcs = new Set<ChildProcess>();
        activeUserFfmpegStreams.set(userId, userProcs);
      }
      while (userProcs.size >= MAX_ACTIVE_STREAMS_PER_USER) {
        const oldest = userProcs.values().next().value;
        if (!oldest) break;
        userProcs.delete(oldest);
        if (!oldest.killed) {
          oldest.kill('SIGKILL');
        }
      }

      const args: string[] = [
        '-hide_banner',
        '-loglevel',
        'error',
        '-protocol_whitelist',
        'http,https,tcp,tls,crypto',
        '-fflags',
        '+genpts+igndts+discardcorrupt',
        '-analyzeduration',
        '1200000',
        '-probesize',
        '1500000',
        '-user_agent',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        '-reconnect',
        '1',
        '-reconnect_streamed',
        '1',
        '-reconnect_delay_max',
        '4',
      ];

      if (startSec > 0) {
        args.push('-noaccurate_seek', '-ss', String(startSec));
      }

      args.push(
        '-i',
        resolvedUrl,
        '-map',
        '0:v:0',
        '-map',
        `0:a:${audioTrack}?`,
        '-c:v',
        'copy',
        '-c:a',
        'aac',
        '-ac',
        '2',
        '-b:a',
        '192k',
        '-af',
        'aresample=async=1:first_pts=0',
        '-avoid_negative_ts',
        'make_zero',
        '-muxdelay',
        '0',
        '-muxpreload',
        '0',
        '-max_muxing_queue_size',
        '1024',
        '-flush_packets',
        '1',
        '-cluster_size_limit',
        '512k',
        '-cluster_time_limit',
        '250',
        '-f',
        'matroska',
        'pipe:1',
      );

      res.statusCode = 200;
      res.setHeader('Content-Type', 'video/x-matroska');
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');

      // Restrict CORS to trusted frontend origins (localhost, Vercel, Railway, Render, or configured FRONTEND_ORIGIN)
      const reqOrigin = req.headers.origin;
      const configuredOrigin = (process.env.FRONTEND_ORIGIN || '').trim();
      if (
        typeof reqOrigin === 'string' &&
        (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(reqOrigin) ||
          /^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(reqOrigin) ||
          /^https:\/\/[a-z0-9-]+\.up\.railway\.app$/i.test(reqOrigin) ||
          /^https:\/\/[a-z0-9-]+\.onrender\.com$/i.test(reqOrigin) ||
          reqOrigin.includes('ngrok-free.dev') ||
          (configuredOrigin && reqOrigin === configuredOrigin))
      ) {
        res.setHeader('Access-Control-Allow-Origin', reqOrigin);
        res.setHeader('Vary', 'Origin');
      }

      const ffmpegProc = spawn(ffmpegPath, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      userProcs.add(ffmpegProc);

      ffmpegProc.stdout.pipe(res);

      const cleanup = () => {
        userProcs?.delete(ffmpegProc);
        if (!ffmpegProc.killed) {
          ffmpegProc.kill('SIGKILL');
        }
      };

      req.on('close', cleanup);
      res.on('close', cleanup);
      ffmpegProc.on('error', cleanup);
      ffmpegProc.on('close', cleanup);
    } catch (err) {
      if (!res.headersSent) {
        const msg = err instanceof Error ? err.message : 'Stream pipeline error';
        const status = msg.startsWith('Blocked unsafe') ? 400 : 500;
        sendJson(res, status, { error: msg });
      }
    }
  });
}

function streamzMediaEnginePlugin(): Plugin {
  return {
    name: 'streamz-media-engine',
    configureServer(server) {
      registerStreamzApiMiddlewares(server.middlewares);
    },
    configurePreviewServer(server) {
      registerStreamzApiMiddlewares(server.middlewares);
    },
  };
}

export default defineConfig({
  plugins: [react(), streamzMediaEnginePlugin()],
  server: {
    port: 5173,
    strictPort: false,
    allowedHosts: true,
  },
  preview: {
    port: Number(process.env.PORT) || 4173,
    host: '0.0.0.0',
    allowedHosts: true,
  },
});
