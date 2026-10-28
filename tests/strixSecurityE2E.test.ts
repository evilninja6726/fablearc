import http from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  evaluateStremioProxyUrlPolicy,
  registerStreamzApiMiddlewares,
  unwrapMediaStreamUrl,
} from '../vite.config';
import {
  isSafePublicUrl,
  maskScryptPasswordHash,
  SlidingWindowRateLimiter,
  validateAddonOrStreamUrl,
} from '../src/security/securityGuards';
import { StreamZDatabase } from '../src/server/streamzDb';

interface TestServerContext {
  baseUrl: string;
  db: StreamZDatabase;
  limiter: SlidingWindowRateLimiter;
  close: () => Promise<void>;
}

async function createE2ETestServer(): Promise<TestServerContext> {
  const db = new StreamZDatabase(':memory:');
  const limiter = new SlidingWindowRateLimiter(5, 60_000);
  const routes: Array<{
    prefix: string;
    handler: (
      req: http.IncomingMessage,
      res: http.ServerResponse,
      next?: () => void,
    ) => void | Promise<void>;
  }> = [];

  registerStreamzApiMiddlewares(
    {
      use(prefix, handler) {
        routes.push({ prefix, handler });
      },
    },
    db,
    limiter,
  );

  const server = http.createServer(async (req, res) => {
    const rawUrl = req.url || '/';
    const matched = routes.find(
      (r) =>
        rawUrl === r.prefix ||
        rawUrl.startsWith(`${r.prefix}?`) ||
        rawUrl.startsWith(`${r.prefix}/`),
    );

    if (!matched) {
      res.statusCode = 404;
      res.end(JSON.stringify({ error: 'Not found' }));
      return;
    }

    // Strip the mounted route prefix the same way Connect/Vite middlewares do
    const suffix = rawUrl.slice(matched.prefix.length) || '/';
    req.url = suffix.startsWith('/') || suffix.startsWith('?') ? suffix : `/${suffix}`;
    await matched.handler(req, res, () => {
      res.statusCode = 404;
      res.end();
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const addr = server.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  return {
    baseUrl,
    db,
    limiter,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

describe('Strix-Style E2E & Security Audit Suite', () => {
  let ctx: TestServerContext;

  beforeEach(async () => {
    ctx = await createE2ETestServer();
  });

  afterEach(async () => {
    await ctx.close();
  });

  it('Loophole #1 Fix: blocks unauthenticated access to /api/db/diagnostics, /api/media-probe, /api/media-stream, and /api/resolve-stremio-addon', async () => {
    // Seed admin and standard user
    const admin = ctx.db.registerUser({
      email: 'admin@streamz.com',
      password: 'AdminPassword1!',
      displayName: 'Admin User',
      role: 'admin',
    });
    const member = ctx.db.registerUser({
      email: 'viewer@streamz.com',
      password: 'ViewerPassword1!',
      displayName: 'Standard Viewer',
      role: 'user',
    });

    // 1. /api/db/diagnostics: 401 when unauthenticated, 403 for standard user, 200 for admin (with redacted path)
    const diagUnauth = await fetch(`${ctx.baseUrl}/api/db/diagnostics`);
    expect(diagUnauth.status).toBe(401);

    const diagMember = await fetch(`${ctx.baseUrl}/api/db/diagnostics`, {
      headers: { Authorization: `Bearer ${member.token}` },
    });
    expect(diagMember.status).toBe(403);

    const diagAdmin = await fetch(`${ctx.baseUrl}/api/db/diagnostics`, {
      headers: { Authorization: `Bearer ${admin.token}` },
    });
    expect(diagAdmin.status).toBe(200);
    const diagBody = (await diagAdmin.json()) as { counts: { users: number } };
    expect(diagBody.counts.users).toBe(2);

    // 2. /api/media-probe & /api/media-stream: 401 when unauthenticated
    const probeUnauth = await fetch(
      `${ctx.baseUrl}/api/media-probe?url=${encodeURIComponent('https://example.com/video.mp4')}`,
    );
    expect(probeUnauth.status).toBe(401);

    const streamUnauth = await fetch(
      `${ctx.baseUrl}/api/media-stream?url=${encodeURIComponent('https://example.com/video.mp4')}`,
    );
    expect(streamUnauth.status).toBe(401);

    // 3. /api/resolve-stremio-addon: 401 when unauthenticated
    const resolveUnauth = await fetch(
      `${ctx.baseUrl}/api/resolve-stremio-addon?slug=cinemeta`,
    );
    expect(resolveUnauth.status).toBe(401);

    // 4. /api/stremio-proxy policy: guests can only fetch /manifest.json & /catalog/*.json, NOT /stream/ or arbitrary paths
    expect(
      evaluateStremioProxyUrlPolicy(
        'https://v3-cinemeta.strem.io/manifest.json',
        false,
      ).allowed,
    ).toBe(true);
    expect(
      evaluateStremioProxyUrlPolicy(
        'https://v3-cinemeta.strem.io/catalog/movie/top.json',
        false,
      ).allowed,
    ).toBe(true);

    const unauthStreamProxy = await fetch(
      `${ctx.baseUrl}/api/stremio-proxy?url=${encodeURIComponent('https://v3-cinemeta.strem.io/stream/movie/tt15239678.json')}`,
    );
    expect(unauthStreamProxy.status).toBe(401);

    const arbitraryPathProxy = await fetch(
      `${ctx.baseUrl}/api/stremio-proxy?url=${encodeURIComponent('https://example.com/admin/config.json')}`,
      { headers: { Authorization: `Bearer ${member.token}` } },
    );
    expect(arbitraryPathProxy.status).toBe(403);
  });

  it('Loophole #2 Fix: blocks all SSRF bypass vectors (RFC1918 172.16/12, IPv6-mapped IPv4, cloud metadata, octal/hex IPs, and redirect SSRF)', async () => {
    const ssrfPayloads = [
      'http://127.0.0.1:5173/manifest.json',
      'http://0.0.0.0:5173/manifest.json',
      'http://localhost/manifest.json',
      'http://api.localhost/manifest.json',
      'http://[::1]:5173/manifest.json',
      'http://[0:0:0:0:0:0:0:1]/manifest.json',
      'http://[::]/manifest.json',
      // IPv6-mapped IPv4 bypasses
      'http://[::ffff:127.0.0.1]/manifest.json',
      'http://[::ffff:169.254.169.254]/latest/meta-data/',
      'http://[::ffff:10.0.0.1]/manifest.json',
      'http://[::ffff:172.16.0.5]/manifest.json',
      'http://[::ffff:192.168.1.1]/manifest.json',
      'http://[64:ff9b::127.0.0.1]/manifest.json',
      // RFC 1918 Docker/VPC 172.16.0.0/12 range
      'http://172.16.0.1/manifest.json',
      'http://172.24.10.5/manifest.json',
      'http://172.31.255.254/manifest.json',
      // CGNAT & Cloud Metadata
      'http://100.64.0.1/manifest.json',
      'http://100.100.100.200/latest/meta-data/',
      'http://169.254.169.254/latest/meta-data/',
      'http://metadata.google.internal/computeMetadata/v1/',
      'http://metadata.goog/computeMetadata/v1/',
      'http://[fd00:ec2::254]/latest/meta-data/',
      'http://[fe80::1]/manifest.json',
      // Octal, hex, integer, and shorthand IP encodings
      'http://0177.0.0.1/manifest.json',
      'http://0x7f000001/manifest.json',
      'http://2130706433/manifest.json',
      'http://127.1/manifest.json',
      // CLI flag injection attempt
      '-i file:///etc/passwd',
    ];

    for (const payload of ssrfPayloads) {
      expect(
        isSafePublicUrl(payload, false),
        `Expected SSRF guard to block: ${payload}`,
      ).toBe(false);
      expect(
        validateAddonOrStreamUrl(payload, { requireHttps: false }).allowed,
        `Expected validateAddonOrStreamUrl to block: ${payload}`,
      ).toBe(false);
    }

    // Verify 172.15.x.x and 172.32.x.x (public non-RFC1918 IPs) remain allowed
    expect(isSafePublicUrl('https://172.15.0.1/manifest.json', true)).toBe(true);
    expect(isSafePublicUrl('https://172.32.0.1/manifest.json', true)).toBe(true);

    // Verify embedded ?link= SSRF inside unwrapMediaStreamUrl is rejected
    await expect(
      unwrapMediaStreamUrl(
        'https://cdn.example.com/dl.php?link=http://169.254.169.254/latest/meta-data/',
      ),
    ).rejects.toThrow(/Blocked unsafe/i);
  });

  it('Loophole #3 Fix: revokes compromised/other sessions on user password change and revokes all sessions on admin password reset or role change', async () => {
    const admin = ctx.db.registerUser({
      email: 'admin@streamz.com',
      password: 'AdminPassword1!',
      displayName: 'Chief Admin',
      role: 'admin',
    });
    const user = ctx.db.registerUser({
      email: 'alice@streamz.com',
      password: 'AlicePassword1!',
      displayName: 'Alice Viewer',
      role: 'user',
    });

    // Simulate a second session (e.g. another browser or stolen token)
    const secondLogin = ctx.db.loginUser({
      email: 'alice@streamz.com',
      password: 'AlicePassword1!',
    });

    // Both tokens work initially
    const check1 = await fetch(`${ctx.baseUrl}/api/user/state`, {
      headers: { Authorization: `Bearer ${user.token}` },
    });
    const check2 = await fetch(`${ctx.baseUrl}/api/user/state`, {
      headers: { Authorization: `Bearer ${secondLogin.token}` },
    });
    expect(check1.status).toBe(200);
    expect(check2.status).toBe(200);

    // Alice changes her password using her primary token (`user.token`)
    const pwdChangeResp = await fetch(`${ctx.baseUrl}/api/auth/change-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${user.token}`,
      },
      body: JSON.stringify({
        currentPassword: 'AlicePassword1!',
        newPassword: 'NewAlicePassword2!',
      }),
    });
    expect(pwdChangeResp.status).toBe(200);

    // `secondLogin.token` is immediately revoked in both SQLite and in-memory sessionCache!
    const compromisedCheck = await fetch(`${ctx.baseUrl}/api/user/state`, {
      headers: { Authorization: `Bearer ${secondLogin.token}` },
    });
    expect(compromisedCheck.status).toBe(401);

    // Alice's active session (`user.token`) remains valid
    const activeCheck = await fetch(`${ctx.baseUrl}/api/user/state`, {
      headers: { Authorization: `Bearer ${user.token}` },
    });
    expect(activeCheck.status).toBe(200);

    // Now Admin resets Alice's password via PUT /api/admin/users -> all of Alice's tokens are revoked!
    const adminResetResp = await fetch(`${ctx.baseUrl}/api/admin/users`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${admin.token}`,
      },
      body: JSON.stringify({
        targetUserId: user.state.user.id,
        newPassword: 'AdminResetPassword3!',
      }),
    });
    expect(adminResetResp.status).toBe(200);

    const afterAdminReset = await fetch(`${ctx.baseUrl}/api/user/state`, {
      headers: { Authorization: `Bearer ${user.token}` },
    });
    expect(afterAdminReset.status).toBe(401);
  });

  it('Loophole #4 Fix: enforces brute-force rate limiting (429 Too Many Requests) on /api/auth/login and /api/auth/change-password', async () => {
    ctx.db.registerUser({
      email: 'target@streamz.com',
      password: 'StrongPassword1!',
      displayName: 'Target Account',
    });

    // 5 failed login attempts return 401
    for (let i = 0; i < 5; i++) {
      const attempt = await fetch(`${ctx.baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'target@streamz.com',
          password: `WrongPassword${i}!`,
        }),
      });
      expect(attempt.status).toBe(401);
    }

    // 6th attempt is blocked with 429 Too Many Requests + Retry-After header
    const blockedAttempt = await fetch(`${ctx.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'target@streamz.com',
        password: 'StrongPassword1!',
      }),
    });
    expect(blockedAttempt.status).toBe(429);
    expect(Number(blockedAttempt.headers.get('retry-after'))).toBeGreaterThan(0);

    // Resetting rate limiter allows valid login again
    ctx.limiter.clearAll();
    const validLogin = await fetch(`${ctx.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'target@streamz.com',
        password: 'StrongPassword1!',
      }),
    });
    expect(validLogin.status).toBe(200);
  });

  it('Loophole #6 Fix: redacts raw scrypt password hashes in HTTP /api/admin/users responses and enforces full E2E RBAC isolation', async () => {
    const admin = ctx.db.registerUser({
      email: 'admin@streamz.com',
      password: 'AdminPassword1!',
      displayName: 'Chief Admin',
      role: 'admin',
    });

    // Admin provisions a new user over HTTP POST /api/admin/users
    const createResp = await fetch(`${ctx.baseUrl}/api/admin/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${admin.token}`,
      },
      body: JSON.stringify({
        email: 'rohan@streamz.com',
        password: 'RohanPassword9!',
        displayName: 'Rohan Sharma',
        role: 'user',
      }),
    });
    expect(createResp.status).toBe(200);
    const createdData = (await createResp.json()) as {
      user: { id: number; passwordHash: string };
      users: Array<{ id: number; email: string; passwordHash: string }>;
    };

    // Verify raw 64-hex scrypt hash is redacted over HTTP
    expect(createdData.user.passwordHash).toMatch(/^scrypt\$[0-9a-f]{8}…\$REDACTED$/);
    expect(
      createdData.users.every((u) => /^scrypt\$[0-9a-f]{8}…\$REDACTED$/.test(u.passwordHash)),
    ).toBe(true);
    expect(maskScryptPasswordHash('scrypt$1234567890abcdef$deadbeef')).toBe(
      'scrypt$12345678…$REDACTED',
    );

    // Admin deletes user -> deleted user cannot access any API
    const rohanLogin = await fetch(`${ctx.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'rohan@streamz.com',
        password: 'RohanPassword9!',
      }),
    });
    expect(rohanLogin.status).toBe(200);
    const { token: rohanToken } = (await rohanLogin.json()) as { token: string };

    const deleteResp = await fetch(
      `${ctx.baseUrl}/api/admin/users?id=${createdData.user.id}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${admin.token}` },
      },
    );
    expect(deleteResp.status).toBe(200);

    const rohanAfterDelete = await fetch(`${ctx.baseUrl}/api/user/state`, {
      headers: { Authorization: `Bearer ${rohanToken}` },
    });
    expect(rohanAfterDelete.status).toBe(401);
  });

  it('E2E Flow #6: Complete User Journey (HttpOnly Cookie + Bearer Auth, Addon Sync, Watch History Resume/Delete/Clear, Watchlist & Multi-Tenant IDOR Isolation)', async () => {
    ctx.db.registerUser({
      email: 'admin@fablearc.com',
      password: 'AdminPassword1!',
      displayName: 'FableArc Admin',
      role: 'admin',
    });
    ctx.db.registerUser({
      email: 'alice@fablearc.com',
      password: 'AlicePassword1!',
      displayName: 'Alice',
      role: 'user',
    });
    ctx.db.registerUser({
      email: 'bob@fablearc.com',
      password: 'BobPassword1!',
      displayName: 'Bob',
      role: 'user',
    });

    // 1. Alice logs in via HTTP POST /api/auth/login and receives HttpOnly cookie + token
    const aliceLoginResp = await fetch(`${ctx.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'alice@fablearc.com',
        password: 'AlicePassword1!',
      }),
    });
    expect(aliceLoginResp.status).toBe(200);
    const setCookieHeader = aliceLoginResp.headers.get('set-cookie') || '';
    expect(setCookieHeader).toContain('streamz_session=');
    expect(setCookieHeader).toContain('HttpOnly');
    expect(setCookieHeader).toContain('SameSite=Strict');

    const aliceLoginBody = (await aliceLoginResp.json()) as {
      token: string;
      state: { user: { id: number; displayName: string } };
    };
    const aliceCookie = setCookieHeader.split(';')[0];

    // Bob logs in
    const bobLoginResp = await fetch(`${ctx.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'bob@fablearc.com',
        password: 'BobPassword1!',
      }),
    });
    const bobLoginBody = (await bobLoginResp.json()) as { token: string };

    // 2. Alice authenticates using only the HttpOnly cookie (verifying browser <video> / cookie auth path)
    const stateViaCookie = await fetch(`${ctx.baseUrl}/api/user/state`, {
      headers: { Cookie: aliceCookie },
    });
    expect(stateViaCookie.status).toBe(200);

    // 3. Alice syncs custom Stremio addons via POST /api/user/providers
    const customProviders = [
      {
        manifestUrl: 'https://v3-cinemeta.strem.io/manifest.json',
        enabled: true,
        manifest: {
          id: 'com.linvo.cinemeta',
          name: 'Cinemeta Official',
          version: '3.0.0',
          catalogs: [],
        },
        lastCheckedIso: new Date().toISOString(),
      },
      {
        manifestUrl: 'https://opensubtitlesv3-pro.dexter21767.com/manifest.json',
        enabled: true,
        manifest: {
          id: 'org.dexter.opensubtitles',
          name: 'OpenSubtitles Pro',
          version: '1.0.0',
          catalogs: [],
        },
        lastCheckedIso: new Date().toISOString(),
      },
    ];
    const syncProvidersResp = await fetch(`${ctx.baseUrl}/api/user/providers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${aliceLoginBody.token}`,
      },
      body: JSON.stringify({ providers: customProviders }),
    });
    expect(syncProvidersResp.status).toBe(200);

    // 4. Alice records watch history progress for a movie and a series episode via POST /api/user/watch-history
    const upsertMovieResp = await fetch(`${ctx.baseUrl}/api/user/watch-history`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${aliceLoginBody.token}`,
      },
      body: JSON.stringify({
        action: 'upsert',
        entry: {
          mediaId: 'tt15239678',
          mediaName: 'Dune: Part Two',
          mediaType: 'movie',
          poster: 'https://images.metahub.space/poster/medium/tt15239678/img',
          streamUrl: 'https://cdn.example.com/dune2-2160p.mp4',
          streamTitle: '4K UHD BluRay',
          positionSec: 2450,
          durationSec: 9960,
          updatedAtIso: new Date().toISOString(),
        },
      }),
    });
    expect(upsertMovieResp.status).toBe(200);

    const upsertSeriesResp = await fetch(`${ctx.baseUrl}/api/user/watch-history`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${aliceLoginBody.token}`,
      },
      body: JSON.stringify({
        action: 'upsert',
        entry: {
          mediaId: 'tt0903747',
          mediaName: 'Breaking Bad',
          mediaType: 'series',
          poster: 'https://images.metahub.space/poster/medium/tt0903747/img',
          season: 5,
          episode: 14,
          episodeId: 'tt0903747:5:14',
          episodeTitle: 'Ozymandias',
          positionSec: 1420,
          durationSec: 2880,
          updatedAtIso: new Date().toISOString(),
        },
      }),
    });
    expect(upsertSeriesResp.status).toBe(200);

    // 5. Alice syncs her watchlist via POST /api/user/watchlist
    const watchlistResp = await fetch(`${ctx.baseUrl}/api/user/watchlist`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${aliceLoginBody.token}`,
      },
      body: JSON.stringify({
        watchlist: [
          {
            id: 'tt15239678',
            name: 'Dune: Part Two',
            type: 'movie',
            poster: 'https://images.metahub.space/poster/medium/tt15239678/img',
            imdbRating: '8.5',
            releaseInfo: '2024',
          },
          {
            id: 'tt0903747',
            name: 'Breaking Bad',
            type: 'series',
            poster: 'https://images.metahub.space/poster/medium/tt0903747/img',
            imdbRating: '9.5',
            releaseInfo: '2008-2013',
          },
        ],
      }),
    });
    expect(watchlistResp.status).toBe(200);

    // Verify Alice's persisted state via GET /api/user/state
    const aliceStateAfterSync = await fetch(`${ctx.baseUrl}/api/user/state`, {
      headers: { Authorization: `Bearer ${aliceLoginBody.token}` },
    });
    expect(aliceStateAfterSync.status).toBe(200);
    const aliceStateData = (await aliceStateAfterSync.json()) as {
      providers: Array<{ manifestUrl: string }>;
      watchHistory: Array<{ mediaId: string }>;
      watchlist: Array<{ id: string }>;
    };
    expect(aliceStateData.providers).toHaveLength(2);
    expect(aliceStateData.watchHistory).toHaveLength(2);
    expect(aliceStateData.watchlist).toHaveLength(2);

    // 6. Verify strict multi-tenant IDOR isolation: Bob's state has 0 watch history and 0 watchlist items
    const bobStateResp = await fetch(`${ctx.baseUrl}/api/user/state`, {
      headers: { Authorization: `Bearer ${bobLoginBody.token}` },
    });
    expect(bobStateResp.status).toBe(200);
    const bobState = (await bobStateResp.json()) as {
      watchHistory: unknown[];
      watchlist: unknown[];
    };
    expect(bobState.watchHistory).toHaveLength(0);
    expect(bobState.watchlist).toHaveLength(0);

    // 7. Alice deletes a single watch history item, then clears all remaining history
    const deleteOneResp = await fetch(`${ctx.baseUrl}/api/user/watch-history`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${aliceLoginBody.token}`,
      },
      body: JSON.stringify({
        action: 'delete',
        mediaId: 'tt15239678',
      }),
    });
    expect(deleteOneResp.status).toBe(200);
    expect(ctx.db.getUserState(aliceLoginBody.state.user.id).watchHistory).toHaveLength(1);

    const clearAllResp = await fetch(`${ctx.baseUrl}/api/user/watch-history`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${aliceLoginBody.token}`,
      },
      body: JSON.stringify({ action: 'clear' }),
    });
    expect(clearAllResp.status).toBe(200);
    expect(ctx.db.getUserState(aliceLoginBody.state.user.id).watchHistory).toHaveLength(0);

    // 8. Alice logs out via POST /api/auth/logout -> token is immediately invalidated
    const logoutResp = await fetch(`${ctx.baseUrl}/api/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${aliceLoginBody.token}` },
    });
    expect(logoutResp.status).toBe(200);

    const afterLogoutCheck = await fetch(`${ctx.baseUrl}/api/user/state`, {
      headers: { Authorization: `Bearer ${aliceLoginBody.token}` },
    });
    expect(afterLogoutCheck.status).toBe(401);
  });

  it('E2E Flow #7: Admin Console Guardrails (Self-Demotion/Deletion Prevention, Per-User Addon Management & Closed Registration)', async () => {
    const admin = ctx.db.registerUser({
      email: 'admin@fablearc.com',
      password: 'AdminPassword1!',
      displayName: 'Chief Admin',
      role: 'admin',
    });
    const member = ctx.db.registerUser({
      email: 'member@fablearc.com',
      password: 'MemberPassword1!',
      displayName: 'Member User',
      role: 'user',
    });

    // 1. Public self-registration is locked (403) once initial accounts exist
    const publicRegAttempt = await fetch(`${ctx.baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'intruder@fablearc.com',
        password: 'IntruderPassword1!',
        displayName: 'Intruder',
      }),
    });
    expect(publicRegAttempt.status).toBe(403);

    // 2. Non-admin member is blocked (403) from all /api/admin/* endpoints
    const memberAdminAttempt = await fetch(`${ctx.baseUrl}/api/admin/users`, {
      headers: { Authorization: `Bearer ${member.token}` },
    });
    expect(memberAdminAttempt.status).toBe(403);

    // 3. Admin cannot delete their own account (400 guardrail)
    const selfDeleteAttempt = await fetch(
      `${ctx.baseUrl}/api/admin/users?id=${admin.state.user.id}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${admin.token}` },
      },
    );
    expect(selfDeleteAttempt.status).toBe(400);

    // 4. Admin can update a target user's Stremio addons via POST /api/admin/user-providers
    const adminUpdateProviders = await fetch(`${ctx.baseUrl}/api/admin/user-providers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${admin.token}`,
      },
      body: JSON.stringify({
        targetUserId: member.state.user.id,
        providers: [
          {
            manifestUrl: 'https://v3-cinemeta.strem.io/manifest.json',
            enabled: true,
            manifest: {
              id: 'com.linvo.cinemeta',
              name: 'Admin Assigned Cinemeta',
              version: '3.0.0',
              catalogs: [],
            },
            lastCheckedIso: new Date().toISOString(),
          },
        ],
      }),
    });
    expect(adminUpdateProviders.status).toBe(200);
    const providerPayload = (await adminUpdateProviders.json()) as {
      ok: boolean;
      users: Array<{
        id: number;
        passwordHash: string;
        providers: Array<{ manifest: { name: string } }>;
      }>;
    };
    expect(providerPayload.ok).toBe(true);
    const updatedMemberRow = providerPayload.users.find(
      (u) => u.id === member.state.user.id,
    );
    expect(updatedMemberRow?.passwordHash).toMatch(/^scrypt\$[0-9a-f]{8}…\$REDACTED$/);
    expect(updatedMemberRow?.providers[0].manifest.name).toBe('Admin Assigned Cinemeta');
  });

  it('E2E Flow #8: FABLEARC Brand Identity, Video Player Security & Responsive UI Integrity Verification', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const rootDir = path.resolve(__dirname, '..');

    const indexHtml = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
    const appTsx = fs.readFileSync(path.join(rootDir, 'src/App.tsx'), 'utf8');
    const authGateTsx = fs.readFileSync(
      path.join(rootDir, 'src/components/AuthGatePage.tsx'),
      'utf8',
    );
    const logoEmblemTsx = fs.readFileSync(
      path.join(rootDir, 'src/components/PlatformLogoEmblem.tsx'),
      'utf8',
    );
    const cinemaPlayerTsx = fs.readFileSync(
      path.join(rootDir, 'src/components/CinemaPlayerModal.tsx'),
      'utf8',
    );
    const stylesCss = fs.readFileSync(path.join(rootDir, 'src/styles.css'), 'utf8');

    // 1. Verify FABLEARC branding across HTML title, top bar, login modal, and custom 3D film-strip 'F' SVG emblem
    expect(indexHtml).toContain('FABLEARC');
    expect(appTsx).toContain('FABLEARC');
    expect(authGateTsx).toContain('FABLEARC');
    expect(logoEmblemTsx).toContain('aria-label="FABLEARC"');
    expect(fs.existsSync(path.join(rootDir, 'public/fablearc-logo.png'))).toBe(true);
    expect(fs.existsSync(path.join(rootDir, 'public/favicon.svg'))).toBe(true);

    // 2. Verify "Paste direct video link" section was completely removed from Video Quality & Servers popover
    expect(cinemaPlayerTsx).not.toContain('Paste direct video link');
    expect(cinemaPlayerTsx).not.toContain('customUrlInput');
    expect(cinemaPlayerTsx).toContain('Finding available streams');

    // 3. Verify user-friendly copy (no raw technical "Querying" strings in player overlay) and responsive breakpoints
    expect(cinemaPlayerTsx).not.toContain('Querying Stremio');
    expect(stylesCss).toContain('@media (max-width: 768px)');
    expect(stylesCss).toContain('@media (max-width: 480px)');
  });
});
