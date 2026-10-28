import { describe, expect, it } from 'vitest';
import {
  buildSafeExternalPlayerCommand,
  sanitizeDownloadFilename,
  validateAddonOrStreamUrl,
  verifyArtifactSha256,
} from '../src/security/securityGuards';
import {
  computeAutoSyncDelayMs,
  findActiveCue,
  parseSubtitles,
} from '../src/player/subtitleEngine';
import {
  addonSupportsResource,
  buildStreamingCatalogsManifestUrl,
  DEFAULT_BOOTSTRAP_MANIFEST_URLS,
  DEFAULT_PENGUPLAY_MANIFEST_URL,
  extractStreamQualityInfo,
  normalizeStremioMeta,
  parseStreamingCatalogsConfig,
  ProbedAudioTrack,
  sortAudioTracksByLanguagePriority,
  sortStreamsByDecreasingQuality,
  StremioAddonManifest,
  StremioStreamItem,
  upgradeLegacyDefaultAddonUrl,
} from '../src/addons/stremioProtocol';

describe('streamZ Security Boundaries', () => {
  it('blocks loopback, cloud metadata, and private LAN SSRF targets', () => {
    expect(validateAddonOrStreamUrl('http://127.0.0.1:8080/api').allowed).toBe(false);
    expect(validateAddonOrStreamUrl('https://localhost:3000/manifest.json').allowed).toBe(false);
    expect(validateAddonOrStreamUrl('https://[::1]/manifest.json').allowed).toBe(false);
    expect(validateAddonOrStreamUrl('http://169.254.169.254/latest/meta-data/').allowed).toBe(false);
    expect(validateAddonOrStreamUrl('https://192.168.1.50/manifest.json').allowed).toBe(false);
    expect(validateAddonOrStreamUrl('https://10.0.0.1/manifest.json').allowed).toBe(false);
    expect(validateAddonOrStreamUrl('https://0x7f000001/manifest.json').allowed).toBe(false);
  });

  it('permits verified HTTPS addon endpoints and opt-in LAN media servers', () => {
    const cinemeta = validateAddonOrStreamUrl('https://v3-cinemeta.strem.io/manifest.json');
    expect(cinemeta.allowed).toBe(true);

    const streamingCatalogs = validateAddonOrStreamUrl(
      'https://7a82163c306e-stremio-netflix-catalog-addon.baby-beamup.club/manifest.json',
    );
    expect(streamingCatalogs.allowed).toBe(true);

    const lanBlockedByDefault = validateAddonOrStreamUrl('http://192.168.1.50:8096/Items');
    expect(lanBlockedByDefault.allowed).toBe(false);

    const lanExplicitlyPermitted = validateAddonOrStreamUrl('http://192.168.1.50:8096/Items', {
      requireHttps: false,
      allowExplicitLanMediaServer: true,
    });
    expect(lanExplicitlyPermitted.allowed).toBe(true);
  });

  it('blocks file:// and custom OS protocol handlers in ExternalPlayer launch', () => {
    const fileAttempt = buildSafeExternalPlayerCommand(
      'mpv',
      'file:///System/Applications/Calculator.app',
      'Malicious Stream',
    );
    expect(fileAttempt.allowed).toBe(false);

    const validAttempt = buildSafeExternalPlayerCommand(
      'mpv',
      'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
      'Doctor Sleep',
    );
    expect(validAttempt.allowed).toBe(true);
    expect(validAttempt.argv).toEqual([
      'mpv',
      '--no-config',
      '--force-media-title=Doctor Sleep',
      '--',
      'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
    ]);
  });

  it('neutralizes path traversal and reserved filenames in downloads', () => {
    expect(sanitizeDownloadFilename('../../.ssh/authorized_keys')).toBe('authorized_keys');
    expect(sanitizeDownloadFilename('..\\..\\Windows\\System32\\cmd.exe')).toBe('cmd.exe');
    expect(sanitizeDownloadFilename('CON.txt')).toBe('streamz-media.mp4');
    expect(sanitizeDownloadFilename('Movie_1080p.mp4')).toBe('Movie_1080p.mp4');
  });

  it('verifies artifact SHA-256 digests via WebCrypto', async () => {
    const sample = 'streamZ-release-1.0.0-manifest';
    const first = await verifyArtifactSha256(sample, '0000');
    expect(first.verified).toBe(false);

    const second = await verifyArtifactSha256(sample, first.actualHex);
    expect(second.verified).toBe(true);
  });
});

describe('Default Addons & Decreasing Stream Quality Sorting', () => {
  it('pre-configures all 7 requested default Stremio addons', () => {
    expect(DEFAULT_BOOTSTRAP_MANIFEST_URLS).toContain(
      'https://aiometadata.elfhosted.com/stremio/manifest.json',
    );
    expect(DEFAULT_BOOTSTRAP_MANIFEST_URLS).toContain(
      'https://87d6a6ef6b58-webstreamrmbg.baby-beamup.club/manifest.json',
    );
    expect(DEFAULT_BOOTSTRAP_MANIFEST_URLS).toContain(DEFAULT_PENGUPLAY_MANIFEST_URL);
    expect(upgradeLegacyDefaultAddonUrl('https://pengu.uk/manifest.json')).toBe(
      DEFAULT_PENGUPLAY_MANIFEST_URL,
    );
    expect(DEFAULT_BOOTSTRAP_MANIFEST_URLS).toContain(
      'https://st.111477.xyz/config/aHR0cHM6Ly9hLjExMTQ3Ny54eXov/manifest.json',
    );
    expect(DEFAULT_BOOTSTRAP_MANIFEST_URLS).toContain(
      'https://hdhub.thevolecitor.qzz.io/eyJ0b3Jib3giOiJ1bnNldCIsInF1YWxpdGllcyI6IjIxNjBwLDEwODBwLDcyMHAiLCJzb3J0IjoiZGVzYyJ9/manifest.json',
    );
    // Streaming Catalogs addon commented out for now:
    // expect(DEFAULT_BOOTSTRAP_MANIFEST_URLS).toContain(
    //   'https://7a82163c306e-stremio-netflix-catalog-addon.baby-beamup.club/manifest.json',
    // );
    expect(DEFAULT_BOOTSTRAP_MANIFEST_URLS).toContain(
      'https://opensubtitlesv3-pro.dexter21767.com/manifest.json',
    );
  });

  it('parses resolution quality and sorts streams in strictly decreasing order (4K -> 1080p -> 720p -> 480p)', () => {
    const unsorted: StremioStreamItem[] = [
      {
        id: 'promo-1',
        addonId: 'com.stremio.HdHub',
        addonName: 'HdHub',
        name: '🌟 Donation needed.',
        title: 'Support development',
        kind: 'external',
        externalUrl: 'https://ko-fi.com/example',
        ...extractStreamQualityInfo('🌟 Donation needed.', 'Support development'),
      },
      {
        id: '720p-stream',
        addonId: 'com.stremio.HdHub',
        addonName: 'HdHub',
        name: 'HdHub - 720p',
        title: 'Dune.Part.Two.2024.720p.WEB-DL [1.45 GB]',
        kind: 'direct',
        url: 'https://cdn.example.com/dune-720p.mkv',
        ...extractStreamQualityInfo('HdHub - 720p', 'Dune.Part.Two.2024.720p.WEB-DL [1.45 GB]'),
      },
      {
        id: '1080p-small',
        addonId: 'org.111477.stremio',
        addonName: '111477',
        name: '1080p',
        title: 'Dune.Part.Two.2024.1080p.WEBRip [3.60 GB]',
        kind: 'direct',
        url: 'https://cdn.example.com/dune-1080p-small.mkv',
        ...extractStreamQualityInfo('1080p', 'Dune.Part.Two.2024.1080p.WEBRip [3.60 GB]'),
      },
      {
        id: '4k-remux',
        addonId: 'org.111477.stremio',
        addonName: '111477',
        name: '2160p',
        title: 'Dune.Part.Two.2024.2160p.UHD.BluRay.TrueHD.7.1 [73.50 GB]',
        kind: 'direct',
        url: 'https://cdn.example.com/dune-2160p.mkv',
        ...extractStreamQualityInfo(
          '2160p',
          'Dune.Part.Two.2024.2160p.UHD.BluRay.TrueHD.7.1 [73.50 GB]',
        ),
      },
      {
        id: '1080p-large',
        addonId: 'com.stremio.HdHub',
        addonName: 'HdHub',
        name: 'HdHub - 1080p',
        title: 'Dune.Part.Two.2024.1080p.BluRay [21.84 GB]',
        kind: 'direct',
        url: 'https://cdn.example.com/dune-1080p-large.mkv',
        ...extractStreamQualityInfo('HdHub - 1080p', 'Dune.Part.Two.2024.1080p.BluRay [21.84 GB]'),
      },
    ];

    const sorted = sortStreamsByDecreasingQuality(unsorted);
    expect(sorted.map((s) => s.id)).toEqual([
      '4k-remux',
      '1080p-large',
      '1080p-small',
      '720p-stream',
      'promo-1',
    ]);
    expect(sorted[0].qualityBadge).toBe('4K UHD');
    expect(sorted[1].qualityBadge).toBe('1080p FHD');
    expect(sorted[3].qualityBadge).toBe('720p HD');
  });

  it('sorts streams first by quality tier and prioritizes Multi-Audio / Dual-Audio within each quality tier', () => {
    const streams: StremioStreamItem[] = [
      {
        id: '1080p-single-large',
        addonId: 'org.111477.stremio',
        addonName: '111477',
        name: '1080p',
        title: 'The.100.S01E01.1080p.BluRay.x264 [8.50 GB]',
        kind: 'direct',
        url: 'https://cdn.example.com/1080p-single.mkv',
        ...extractStreamQualityInfo('1080p', 'The.100.S01E01.1080p.BluRay.x264 [8.50 GB]'),
      },
      {
        id: '1080p-dual-audio',
        addonId: 'com.stremio.HdHub',
        addonName: 'HdHub',
        name: 'HdHub - 1080p',
        title: 'The.100.S01E01.1080p.WEB-DL.Dual-Audio.Hindi-English [2.10 GB]',
        kind: 'direct',
        url: 'https://cdn.example.com/1080p-dual.mkv',
        ...extractStreamQualityInfo(
          'HdHub - 1080p',
          'The.100.S01E01.1080p.WEB-DL.Dual-Audio.Hindi-English [2.10 GB]',
        ),
      },
      {
        id: '1080p-multi-audio',
        addonId: 'com.stremio.HdHub',
        addonName: 'HdHub',
        name: 'HdHub - 1080p Multi',
        title: 'The.100.S01E01.1080p.BluRay.Multi-Audio [3.40 GB]',
        kind: 'direct',
        url: 'https://cdn.example.com/1080p-multi.mkv',
        ...extractStreamQualityInfo(
          'HdHub - 1080p Multi',
          'The.100.S01E01.1080p.BluRay.Multi-Audio [3.40 GB]',
        ),
      },
      {
        id: '4k-single',
        addonId: 'org.111477.stremio',
        addonName: '111477',
        name: '2160p',
        title: 'The.100.S01E01.2160p.UHD.WEB-DL [14.20 GB]',
        kind: 'direct',
        url: 'https://cdn.example.com/4k-single.mkv',
        ...extractStreamQualityInfo('2160p', 'The.100.S01E01.2160p.UHD.WEB-DL [14.20 GB]'),
      },
      {
        id: '4k-multi-audio',
        addonId: 'com.stremio.HdHub',
        addonName: 'HdHub',
        name: '2160p Multi',
        title: 'The.100.S01E01.2160p.UHD.Multi-Audio.Hin-Eng-Tam [11.00 GB]',
        kind: 'direct',
        url: 'https://cdn.example.com/4k-multi.mkv',
        ...extractStreamQualityInfo(
          '2160p Multi',
          'The.100.S01E01.2160p.UHD.Multi-Audio.Hin-Eng-Tam [11.00 GB]',
        ),
      },
    ];

    const sorted = sortStreamsByDecreasingQuality(streams);
    expect(sorted.map((s) => s.id)).toEqual([
      '4k-multi-audio',
      '4k-single',
      '1080p-multi-audio',
      '1080p-dual-audio',
      '1080p-single-large',
    ]);
    expect(sorted[0].isMultiAudio).toBe(true);
    expect(sorted[0].audioBadge).toBe('Multi-Audio');
    expect(sorted[2].audioBadge).toBe('Multi-Audio');
    expect(sorted[3].audioBadge).toBe('Dual Audio');
  });
});

describe('Streaming Catalogs (pw.ers.netflix-catalog) & Stremio Protocol Engine', () => {
  it('encodes and decodes Streaming Catalogs Base64 service configuration URLs', () => {
    const customConfig = {
      providers: ['nfx', 'hbm', 'dnp', 'amp', 'atp', 'jhs', 'cru'],
      rpdbKey: 't0-free-rpdb',
      countryCode: 'IN',
      netflixTop10Global: true,
      netflixTop10Country: true,
      netflixTop10CountryCode: 'IN',
    };

    const builtUrl = buildStreamingCatalogsManifestUrl(customConfig);
    expect(builtUrl).toContain(
      'https://7a82163c306e-stremio-netflix-catalog-addon.baby-beamup.club/',
    );
    expect(builtUrl.endsWith('/manifest.json')).toBe(true);

    const parsedBack = parseStreamingCatalogsConfig(builtUrl);
    expect(parsedBack).toEqual(customConfig);
  });

  it('normalizes Streaming Catalogs metas (genre array, trailers, JustWatch/Metahub posters)', () => {
    const rawNetflixItem = {
      imdb_id: 'tt5606664',
      name: 'Doctor Sleep',
      type: 'movie',
      year: '2019',
      imdbRating: '7.3',
      genre: ['Drama', 'Fantasy', 'Horror'],
      director: ['Mike Flanagan'],
      cast: ['Ewan McGregor', 'Rebecca Ferguson'],
      poster: 'https://images.justwatch.com/poster/154016932/s332/img',
      background: 'https://images.metahub.space/background/medium/tt5606664/img',
      trailers: [{ source: '6u8ggerDcwg', type: 'Trailer' }],
    };

    const normalized = normalizeStremioMeta(rawNetflixItem, {
      addonId: 'pw.ers.netflix-catalog',
      addonName: 'Streaming Catalogs',
      catalogId: 'nfx',
      catalogName: 'Netflix — Movies',
    });

    expect(normalized).not.toBeNull();
    expect(normalized?.id).toBe('tt5606664');
    expect(normalized?.imdbId).toBe('tt5606664');
    expect(normalized?.genres).toEqual(['Drama', 'Fantasy', 'Horror']);
    expect(normalized?.trailers).toEqual([{ source: '6u8ggerDcwg', type: 'Trailer' }]);
    expect(normalized?.sourceCatalogId).toBe('nfx');
  });

  it('evaluates string and object resource descriptors with idPrefixes', () => {
    const manifest: StremioAddonManifest = {
      id: 'pw.ers.netflix-catalog',
      version: '1.1.1',
      name: 'Streaming Catalogs',
      description: 'Trending movies and series',
      resources: [
        'catalog',
        { name: 'meta', types: ['movie', 'series'], idPrefixes: ['tt'] },
      ],
      types: ['movie', 'series'],
      idPrefixes: ['tt'],
      catalogs: [{ id: 'nfx', type: 'movie', name: 'Netflix' }],
    };

    expect(addonSupportsResource(manifest, 'catalog', 'movie')).toBe(true);
    expect(addonSupportsResource(manifest, 'meta', 'series', 'tt17491088')).toBe(true);
    expect(addonSupportsResource(manifest, 'meta', 'series', 'kitsu:123')).toBe(false);
    expect(addonSupportsResource(manifest, 'stream', 'movie', 'tt5606664')).toBe(false);
  });
});

describe('Subtitle & Non-AI AutoSync Engine', () => {
  const sampleVtt = `WEBVTT

00:00:02.000 --> 00:00:05.000
[radio static]
Check the telemetry on the Oude Kerk relay.
`;

  it('parses WebVTT cues, strips SDH when toggled, and computes AutoSync delay', () => {
    const cues = parseSubtitles(sampleVtt);
    expect(cues).toHaveLength(1);
    expect(cues[0].startMs).toBe(2000);

    const withSdh = findActiveCue(cues, 3000, 0, false);
    expect(withSdh).toContain('[radio static]');

    const strippedSdh = findActiveCue(cues, 3000, 0, true);
    expect(strippedSdh).toBe('Check the telemetry on the Oude Kerk relay.');

    const delayMs = computeAutoSyncDelayMs(2000, 4500);
    expect(delayMs).toBe(2500);
    expect(findActiveCue(cues, 4500, delayMs, true)).toBe(
      'Check the telemetry on the Oude Kerk relay.',
    );
  });
});

describe('Commercial SQLite WAL Database (Per-User Auth, Watch History & Deduplicated Providers)', () => {
  it('isolates watch history, watchlist, and deduplicated providers per user account', async () => {
    const { StreamZDatabase } = await import('../src/server/streamzDb');
    const db = new StreamZDatabase(':memory:');

    // Register two distinct users
    const userA = db.registerUser({
      email: 'alice@streamz.app',
      password: 'password123',
      displayName: 'Alice',
      avatarColor: '#06B6D4',
    });
    const userB = db.registerUser({
      email: 'bob@streamz.app',
      password: 'password456',
      displayName: 'Bob',
      avatarColor: '#F43F5E',
    });

    expect(userA.state.user.displayName).toBe('Alice');
    expect(userB.state.user.displayName).toBe('Bob');

    // Sync providers for User A and User B (sharing a common manifest URL to test global registry deduplication)
    const sharedProvider = {
      manifestUrl: 'https://pengu.uk/%7B%22auth_token%22%3A%22jBIrOxA27mMz_WvoR_ZCAMR72uZegRCgWJzw9P0IIUQ%22%7D/manifest.json',
      enabled: true,
      manifest: { id: 'org.pengu', name: 'PenguPlay', version: '1.0.0', catalogs: [] },
      lastCheckedIso: new Date().toISOString(),
    };
    const aliceOnlyProvider = {
      manifestUrl: 'https://v3-cinemeta.strem.io/manifest.json',
      enabled: true,
      manifest: { id: 'com.linvo.cinemeta', name: 'Cinemeta', version: '3.0.0', catalogs: [] },
      lastCheckedIso: new Date().toISOString(),
    };

    db.syncUserProviders(userA.state.user.id, [sharedProvider, aliceOnlyProvider]);
    db.syncUserProviders(userB.state.user.id, [sharedProvider]);

    // Add watch history to User A
    db.upsertWatchHistoryItem(userA.state.user.id, {
      mediaId: 'tt15239678',
      mediaName: 'Dune: Part Two',
      mediaType: 'movie',
      poster: 'https://images.metahub.space/poster/medium/tt15239678/img',
      positionSec: 1840,
      durationSec: 9960,
      updatedAtIso: new Date().toISOString(),
    });

    const stateA = db.getUserState(userA.state.user.id);
    const stateB = db.getUserState(userB.state.user.id);

    expect(stateA.providers).toHaveLength(2);
    expect(stateB.providers).toHaveLength(1);
    expect(stateA.watchHistory).toHaveLength(1);
    expect(stateA.watchHistory[0].positionSec).toBe(1840);
    // Metahub URL is reconstructed automatically after being stored as NULL to save bytes
    expect(stateA.watchHistory[0].poster).toBe(
      'https://images.metahub.space/poster/medium/tt15239678/img',
    );
    expect(stateB.watchHistory).toHaveLength(0);

    // Delete single item and clear watch history
    db.deleteWatchHistoryItem(userA.state.user.id, 'tt15239678');
    expect(db.getUserState(userA.state.user.id).watchHistory).toHaveLength(0);

    // Verify 3NF global catalog deduplication & ultra-compact per-user storage report
    const report = db.getStorageEfficiencyReport();
    expect(report.counts.users).toBe(2);
    expect(report.counts.deduplicatedProviders).toBe(2);
    expect(report.counts.deduplicatedMediaCatalog).toBe(1);
    expect(report.estimatedActiveUserTotalBytes).toBeLessThan(450);

    // Verify editing an existing addon for User A (both custom URL and custom display name) never affects User B
    const aliceEditedProvider = {
      manifestUrl: 'https://pengu.uk/%7B%22auth_token%22%3A%22alice_private_token_999%22%7D/manifest.json',
      enabled: true,
      manifest: { id: 'org.pengu', name: 'Alice Custom PenguPlay', version: '1.0.0', catalogs: [] },
      lastCheckedIso: new Date().toISOString(),
    };
    const aliceRenamedSharedUrlProvider = {
      manifestUrl: sharedProvider.manifestUrl,
      enabled: true,
      manifest: { id: 'org.pengu.shared', name: 'Alice Renamed Shared URL', version: '1.0.0', catalogs: [] },
      lastCheckedIso: new Date().toISOString(),
    };

    db.syncUserProviders(userA.state.user.id, [
      aliceEditedProvider,
      aliceRenamedSharedUrlProvider,
      aliceOnlyProvider,
    ]);

    const afterEditA = db.getUserState(userA.state.user.id);
    const afterEditB = db.getUserState(userB.state.user.id);

    expect(afterEditA.providers[0].manifestUrl).toContain('alice_private_token_999');
    expect((afterEditA.providers[0].manifest as { name: string }).name).toBe(
      'Alice Custom PenguPlay',
    );
    expect((afterEditA.providers[1].manifest as { name: string }).name).toBe(
      'Alice Renamed Shared URL',
    );

    // User B's provider URL and manifest name are 100% unchanged!
    expect(afterEditB.providers).toHaveLength(1);
    expect(afterEditB.providers[0].manifestUrl).toBe(sharedProvider.manifestUrl);
    expect((afterEditB.providers[0].manifest as { name: string }).name).toBe('PenguPlay');
  });

  it('orders multi-audio tracks with priority to English first, then Hindi, then any other language', () => {
    const rawTracks: ProbedAudioTrack[] = [
      {
        audioIndex: 0,
        streamIndex: 1,
        langCode: 'tam',
        langName: 'Tamil',
        codec: 'EAC3',
        channels: '5.1',
        label: 'Tamil (EAC3 5.1)',
      },
      {
        audioIndex: 1,
        streamIndex: 2,
        langCode: 'hin',
        langName: 'Hindi',
        codec: 'EAC3',
        channels: '5.1',
        label: 'Hindi (EAC3 5.1)',
      },
      {
        audioIndex: 2,
        streamIndex: 3,
        langCode: 'jpn',
        langName: 'Japanese',
        codec: 'AAC',
        channels: 'stereo',
        label: 'Japanese (AAC stereo)',
      },
      {
        audioIndex: 3,
        streamIndex: 4,
        langCode: 'eng',
        langName: 'English',
        codec: 'EAC3',
        channels: '5.1',
        label: 'English (EAC3 5.1)',
      },
    ];

    const sorted = sortAudioTracksByLanguagePriority(rawTracks);
    expect(sorted.map((t) => t.langCode)).toEqual(['eng', 'hin', 'tam', 'jpn']);
    // Preserves true FFmpeg stream audioIndex so `-map 0:a:${audioIndex}` maps the exact track
    expect(sorted[0].audioIndex).toBe(3);
    expect(sorted[1].audioIndex).toBe(1);
  });

  it('coalesces concurrent requests (Single-Flight) and caches JSON payloads via StreamZCacheEngine', async () => {
    const { StreamZCacheEngine } = await import('../src/server/redisCacheEngine');
    const cache = new StreamZCacheEngine(100);
    let upstreamCallCount = 0;

    const fetcher = async () => {
      upstreamCallCount += 1;
      await new Promise((r) => setTimeout(r, 15));
      return JSON.stringify({ metas: [{ id: 'tt15239678', name: 'Dune: Part Two' }] });
    };

    const [r1, r2, r3] = await Promise.all([
      cache.getOrFetch('sz:test:dune', 60, fetcher),
      cache.getOrFetch('sz:test:dune', 60, fetcher),
      cache.getOrFetch('sz:test:dune', 60, fetcher),
    ]);

    expect(upstreamCallCount).toBe(1);
    expect(r1.data).toBe(r2.data);
    expect(r2.data).toBe(r3.data);

    const cachedAgain = await cache.getOrFetch('sz:test:dune', 60, fetcher);
    expect(upstreamCallCount).toBe(1);
    expect(cachedAgain.cacheStatus).toBe('HIT-L1');
    expect(JSON.parse(cachedAgain.data).metas[0].name).toBe('Dune: Part Two');
  });

  it('enforces RBAC admin user provisioning, password_hash column storage, and changeUserPassword verification', async () => {
    const { StreamZDatabase } = await import('../src/server/streamzDb');
    const db = new StreamZDatabase(':memory:');

    // First user registered automatically becomes admin
    const adminReg = db.registerUser({
      email: 'admin@streamz.cinema',
      password: 'AdminPassword1!',
      displayName: 'Chief Admin',
    });
    const adminId = adminReg.state.user.id;
    expect(adminReg.state.user.role).toBe('admin');
    expect(db.isUserAdmin(adminId)).toBe(true);

    // Admin creates a new member with strict validation
    const createdMember = db.adminCreateUser(adminId, {
      email: 'member@streamz.cinema',
      password: 'MemberPassword9!',
      displayName: 'Elena Vance',
      role: 'user',
    });
    expect(createdMember.role).toBe('user');
    expect(createdMember.passwordHash).toMatch(/^scrypt\$[0-9a-f]+\$[0-9a-f]+$/);
    expect(db.isUserAdmin(createdMember.id)).toBe(false);

    // Non-admin user is blocked from creating users
    expect(() =>
      db.adminCreateUser(createdMember.id, {
        email: 'unauth@streamz.cinema',
        password: 'ValidPassword9!',
        displayName: 'Unauthorized User',
      }),
    ).toThrow(/administrator privileges required/i);

    // Validation blocks weak passwords or invalid names
    expect(() =>
      db.adminCreateUser(adminId, {
        email: 'bad@streamz.cinema',
        password: 'weak',
        displayName: 'Valid Name',
      }),
    ).toThrow(/at least 8 characters/i);

    // Member can change their own password via changeUserPassword
    expect(() =>
      db.changeUserPassword({
        userId: createdMember.id,
        currentPassword: 'WrongCurrentPassword1!',
        newPassword: 'UpdatedPassword2!',
      }),
    ).toThrow(/current password is incorrect/i);

    db.changeUserPassword({
      userId: createdMember.id,
      currentPassword: 'MemberPassword9!',
      newPassword: 'UpdatedPassword2!',
    });

    // Old password fails, new password succeeds
    expect(() =>
      db.loginUser({
        email: 'member@streamz.cinema',
        password: 'MemberPassword9!',
      }),
    ).toThrow(/invalid email or password/i);

    const relogin = db.loginUser({
      email: 'member@streamz.cinema',
      password: 'UpdatedPassword2!',
    });
    expect(relogin.state.user.displayName).toBe('Elena Vance');

    // Admin can update user role, name, and password directly via adminUpdateUser
    const promoted = db.adminUpdateUser(adminId, createdMember.id, {
      displayName: 'Elena Vance (Lead)',
      role: 'admin',
      newPassword: 'AdminSetPassword3!',
    });
    expect(promoted.role).toBe('admin');
    expect(promoted.displayName).toBe('Elena Vance (Lead)');

    const adminList = db.adminListUsers(adminId);
    expect(adminList).toHaveLength(2);
    expect(adminList.every((u) => u.passwordHash.startsWith('scrypt$'))).toBe(true);
  });
});
