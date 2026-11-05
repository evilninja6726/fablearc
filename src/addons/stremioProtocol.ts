import { validateAddonOrStreamUrl } from '../security/securityGuards';

export interface StremioResourceDescriptor {
  name: string;
  types?: string[];
  idPrefixes?: string[];
}

export interface StremioCatalogExtra {
  name: string;
  isRequired?: boolean;
  options?: string[];
  optionsLimit?: number;
}

export interface StremioCatalogDefinition {
  type: string;
  id: string;
  name?: string;
  genres?: string[];
  extra?: StremioCatalogExtra[];
  extraSupported?: string[];
  extraRequired?: string[];
}

export interface StremioAddonManifest {
  id: string;
  version: string;
  name: string;
  description: string;
  logo?: string;
  background?: string;
  resources: Array<string | StremioResourceDescriptor>;
  types: string[];
  idPrefixes?: string[];
  catalogs: StremioCatalogDefinition[];
  behaviorHints?: {
    configurable?: boolean;
    configurationRequired?: boolean;
    adult?: boolean;
    p2p?: boolean;
  };
}

export interface InstalledAddon {
  manifestUrl: string;
  enabled: boolean;
  manifest: StremioAddonManifest;
  lastCheckedIso: string;
}

export interface StremioTrailer {
  source: string;
  type?: string;
  title?: string;
}

export interface StremioEpisodeVideo {
  id: string;
  season: number;
  episode: number;
  name: string;
  overview: string;
  thumbnail?: string;
  released?: string;
}

export interface StremioMediaItem {
  id: string;
  imdbId?: string;
  type: 'movie' | 'series' | string;
  name: string;
  poster?: string;
  background?: string;
  logo?: string;
  description?: string;
  releaseInfo?: string;
  year?: string;
  runtime?: string;
  imdbRating?: string;
  genres: string[];
  cast: string[];
  director: string[];
  writer: string[];
  country?: string;
  awards?: string;
  trailers: StremioTrailer[];
  videos: StremioEpisodeVideo[];
  sourceAddonId?: string;
  sourceAddonName?: string;
  sourceCatalogId?: string;
  sourceCatalogName?: string;
}

export interface StremioStreamItem {
  id: string;
  addonId: string;
  addonName: string;
  name: string;
  title: string;
  kind: 'direct' | 'youtube' | 'external' | 'magnet';
  url?: string;
  ytId?: string;
  externalUrl?: string;
  infoHash?: string;
  fileIdx?: number;
  filename?: string;
  trackers?: string[];
  seeders?: number;
  isHls?: boolean;
  qualityScore?: number;
  qualityBadge?: string;
  isMultiAudio?: boolean;
  audioScore?: number;
  audioBadge?: string;
  sizeBytes?: number;
  sizeLabel?: string;
  isPromo?: boolean;
  isTopResponsive?: boolean;
  ttfbMs?: number;
  speedMbps?: number;
  responsivenessScore?: number;
  serverStatusBadge?: string;
  unreachable?: boolean;
  resolvedDirectUrl?: string;
}

export interface StremioSubtitleTrack {
  id: string;
  addonId: string;
  addonName: string;
  lang: string;
  url: string;
  label: string;
}

export interface CommunityAddonDirectoryEntry {
  transportUrl: string;
  manifest: StremioAddonManifest;
}

export interface StreamQualityInfo {
  qualityScore: number;
  qualityBadge: string;
  isMultiAudio: boolean;
  audioScore: number;
  audioBadge?: string;
  sizeBytes: number;
  sizeLabel?: string;
  isPromo: boolean;
}

/**
 * Extracts resolution quality score, multi-audio priority score, human-readable badges, and file size from Stremio stream metadata.
 * Used to sort streams in strictly decreasing order of quality first, then multi-audio priority within each quality tier.
 */
export function isDiscordOrPromoSpam(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    lower.includes('discord') ||
    lower.includes('t.me/') ||
    lower.includes('telegram') ||
    lower.includes('donation needed') ||
    lower.includes('pengu.uk/donate') ||
    lower.includes('support the project') ||
    lower.includes('you must sign in') ||
    lower.includes('you must login') ||
    lower.includes('authentication is missing') ||
    lower.includes('/signin.mp4') ||
    lower.includes('configure addon') ||
    lower.includes('webBLOCKS') ||
    /(?:^|[\s[\]()_.-])sample-[a-z0-9]/i.test(text) ||
    /\.(apk|exe|msi|dmg|bat|sh)(\?|$|\|)/i.test(lower)
  );
}

export function stripDiscordText(text?: string): string {
  if (!text) return '';
  return text
    .replace(/https?:\/\/(?:www\.)?(?:discord\.gg|discord\.com|discordapp\.com)\/[^\s)]+/gi, '')
    .replace(/[^.!?\n]*\bdiscord\b[^.!?\n]*[.!?]?/gi, '')
    .trim();
}

const STREAM_LANGUAGE_PATTERNS: RegExp[] = [
  /\b(eng(?:lish)?)\b|🇬🇧|🇺🇸/i,
  /\b(hin(?:di)?)\b|🇮🇳/i,
  /\b(tam(?:il)?)\b/i,
  /\b(tel(?:ugu)?)\b/i,
  /\b(mal(?:ayalam)?)\b/i,
  /\b(kan(?:nada)?)\b/i,
  /\b(spa(?:nish)?|latino|castellano)\b|🇪🇸|🇲🇽/i,
  /\b(fre(?:nch)?|vf|vff|truefrench)\b|🇫🇷/i,
  /\b(ger(?:man)?|deutsch)\b|🇩🇪/i,
  /\b(ita(?:lian)?)\b|🇮🇹/i,
  /\b(por(?:tuguese)?|pt-br|dublado)\b|🇵🇹|🇧🇷/i,
  /\b(rus(?:sian)?)\b|🇷🇺/i,
  /\b(jap(?:anese)?|jpn)\b|🇯🇵/i,
  /\b(kor(?:ean)?)\b|🇰🇷/i,
];

export function extractStreamQualityInfo(
  name: string,
  title: string,
  extraDescription = '',
): StreamQualityInfo {
  const combined = `${name} ${title} ${extraDescription}`;
  const isPromo = isDiscordOrPromoSpam(combined);

  let qualityScore = 0;
  let qualityBadge = 'HD';
  // Strip "DS4K" (Downscaled from 4K to 1080p/720p) before checking for 4K so 1080p.DS4K is never mislabeled as 4K UHD
  const isDownscaled4k = /\bds4k\b/i.test(combined);
  const resText = combined.replace(/\bds4k\b/gi, '');

  if (isDownscaled4k && /\b(1080p|fhd|full\s*hd)\b/i.test(resText)) {
    qualityScore = 1080;
    qualityBadge = '1080p FHD';
  } else if (isDownscaled4k && /\b(720p)\b/i.test(resText)) {
    qualityScore = 720;
    qualityBadge = '720p HD';
  } else if (/\b(2160p|4k|uhd)\b/i.test(resText)) {
    qualityScore = 2160;
    qualityBadge = '4K UHD';
  } else if (/\b(1440p|2k|qhd)\b/i.test(resText)) {
    qualityScore = 1440;
    qualityBadge = '1440p QHD';
  } else if (/\b(1080p|fhd|full\s*hd)\b/i.test(resText)) {
    qualityScore = 1080;
    qualityBadge = '1080p FHD';
  } else if (/\b(720p|hd)\b/i.test(resText)) {
    qualityScore = 720;
    qualityBadge = '720p HD';
  } else if (/\b(576p|480p|sd|dvdrip)\b/i.test(resText)) {
    qualityScore = 480;
    qualityBadge = '480p SD';
  } else if (/\b(360p|240p|cam|ts)\b/i.test(resText)) {
    qualityScore = 360;
    qualityBadge = '360p';
  } else if (/\b(bluray|remux|web-dl|webrip)\b/i.test(resText)) {
    qualityScore = 900;
    qualityBadge = 'HD Remux';
  }

  let isMultiAudio = false;
  let audioScore = 0;
  let audioBadge: string | undefined;

  if (
    /\b(multi[\s._-]*audio|multi[\s._-]*lang(?:uage)?s?|multi[\s._-]*dub(?:bed)?|multi[\s._-]*track)\b|\[multi\]|\(multi\)/i.test(
      combined,
    )
  ) {
    isMultiAudio = true;
    audioScore = 2;
    audioBadge = 'Multi-Audio';
  } else if (
    /\b(dual[\s._-]*audio|dual[\s._-]*lang(?:uage)?)\b|\[dual\]|\(dual\)|\b(hin(?:di)?\s*[+&/|-]\s*eng(?:lish)?|eng(?:lish)?\s*[+&/|-]\s*hin(?:di)?)\b/i.test(
      combined,
    )
  ) {
    isMultiAudio = true;
    audioScore = 1;
    audioBadge = 'Dual Audio';
  }

  let matchedLangCount = 0;
  for (const pattern of STREAM_LANGUAGE_PATTERNS) {
    if (pattern.test(combined)) {
      matchedLangCount += 1;
    }
  }
  if (matchedLangCount >= 3 && audioScore < 2) {
    isMultiAudio = true;
    audioScore = 2;
    audioBadge = 'Multi-Audio';
  } else if (matchedLangCount === 2 && audioScore < 1) {
    isMultiAudio = true;
    audioScore = 1;
    audioBadge = 'Dual Audio';
  }

  let sizeBytes = 0;
  let sizeLabel: string | undefined;
  const sizeMatch = combined.match(/(\d+(?:\.\d+)?)\s*(GB|GiB|MB|MiB)\b/i);
  if (sizeMatch) {
    const val = parseFloat(sizeMatch[1]);
    const unit = sizeMatch[2].toUpperCase();
    if (!Number.isNaN(val)) {
      if (unit.startsWith('G')) {
        sizeBytes = Math.round(val * 1024 * 1024 * 1024);
        sizeLabel = `${val.toFixed(val >= 10 ? 1 : 2)} GB`;
      } else {
        sizeBytes = Math.round(val * 1024 * 1024);
        sizeLabel = `${Math.round(val)} MB`;
      }
    }
  } else {
    const bitrateMatch = combined.match(/(\d+(?:\.\d+)?)\s*Mbps\b/i);
    if (bitrateMatch) {
      const mbps = parseFloat(bitrateMatch[1]);
      if (!Number.isNaN(mbps) && mbps > 0) {
        sizeBytes = Math.round(((mbps * 1_000_000) / 8) * 7200);
      }
    }
  }

  return {
    qualityScore,
    qualityBadge,
    isMultiAudio,
    audioScore,
    audioBadge,
    sizeBytes,
    sizeLabel,
    isPromo,
  };
}

/**
 * Sorts Stremio streams first by quality, then by multi-audio priority:
 * 1. Non-promotional playable streams first (direct -> magnet -> youtube -> external)
 * 2. Decreasing resolution qualityScore (2160p/4K -> 1440p -> 1080p -> 720p -> 480p -> 360p)
 * 3. Multi-Audio / Dual-Audio priority within the same resolution tier (Multi-Audio -> Dual Audio -> Single Audio)
 * 4. Decreasing file size / bitrate within the same resolution & audio tier
 */
export function sortStreamsByDecreasingQuality(
  streams: StremioStreamItem[],
): StremioStreamItem[] {
  const kindPriority: Record<StremioStreamItem['kind'], number> = {
    direct: 0,
    magnet: 1,
    youtube: 2,
    external: 3,
  };

  const getBrowserStreamCompatibilityScore = (s: StremioStreamItem): number => {
    const urlLower = (s.url || '').toLowerCase();
    const metaLower = `${s.name} ${s.title} ${urlLower}`.toLowerCase();
    let score = 0;

    // 1. Strongly prefer verified direct HTTP Range CDNs with CORS by actual URL host (PixelDrain, 111477, BunnyCDN, FSLDownload)
    if (urlLower.includes('pixeldrain.dev') || urlLower.includes('pixeldrain.com')) {
      score += 65;
    } else if (
      urlLower.includes('111477.xyz') ||
      urlLower.includes('b-cdn.net') ||
      urlLower.includes('fsldownload') ||
      urlLower.includes('fsl-v2')
    ) {
      score += 50;
    } else if (
      urlLower.includes('hubcloud.ist') ||
      urlLower.includes('rohitkiskk.workers.dev') ||
      urlLower.includes('/resolve/cj/')
    ) {
      score -= 80;
    } else if (urlLower.includes('.workers.dev')) {
      score -= 25;
    } else if (urlLower.includes('.r2.cloudflarestorage.com')) {
      score -= 15;
    }

    // 2. Penalize Dolby Vision (DV / DoVi) streams that fail native HTML5 <video> decode in browsers
    if (
      /\b(dv|dolby[\s._-]*vision|dovi)\b/i.test(metaLower) &&
      !/\b(hdr10|hdr)\b/i.test(metaLower)
    ) {
      score -= 40;
    } else if (/\b(dv|dolby[\s._-]*vision|dovi)\b/i.test(metaLower)) {
      score -= 20;
    }

    // 3. Prefer streamable file sizes (1 GB – 22 GB) over massive 35–70 GB BluRay Remuxes
    const gb = (s.sizeBytes ?? 0) / (1024 * 1024 * 1024);
    if (gb >= 1.0 && gb <= 22.0) {
      score += 15;
    } else if (gb > 30.0) {
      score -= 30;
    }

    // 4. Reward universal browser-native codecs (H.264 / AAC / Opus / MP4) that play with 0ms native decode
    if (/\b(x264|h\.?264|avc)\b/i.test(metaLower)) {
      score += 20;
    }
    if (/\b(aac|opus|mp4)\b/i.test(metaLower)) {
      score += 15;
    }

    return score;
  };

  return [...streams].sort((a, b) => {
    const promoA = a.isPromo ? 1 : 0;
    const promoB = b.isPromo ? 1 : 0;
    if (promoA !== promoB) return promoA - promoB;

    // Group playable video streams (direct) above external links
    const kindDiff = kindPriority[a.kind] - kindPriority[b.kind];
    if (kindDiff !== 0) return kindDiff;

    // 1. Strictly decreasing quality score (4K 2160 -> 1440 -> 1080 -> 720 -> 480 -> 360)
    // Never allow a 1080p stream to be sorted above a 4K stream
    const scoreA = a.qualityScore ?? 0;
    const scoreB = b.qualityScore ?? 0;
    if (scoreB !== scoreA) return scoreB - scoreA;

    // 1b. Within the same quality tier, keep reachable/untested streams above confirmed Offline streams
    const unreachA = a.unreachable ? 1 : 0;
    const unreachB = b.unreachable ? 1 : 0;
    if (unreachA !== unreachB) return unreachA - unreachB;

    // 1c. Within the same quality tier, prioritize benchmarked top-responsive server first
    const topA = a.isTopResponsive ? 1 : 0;
    const topB = b.isTopResponsive ? 1 : 0;
    if (topB !== topA) return topB - topA;

    // 2. Priority to Multi-Audio / Dual-Audio over Single-Audio within the same quality tier
    const hasMultiA = (a.audioScore ?? (a.isMultiAudio ? 1 : 0)) > 0 ? 1 : 0;
    const hasMultiB = (b.audioScore ?? (b.isMultiAudio ? 1 : 0)) > 0 ? 1 : 0;
    if (hasMultiB !== hasMultiA) return hasMultiB - hasMultiA;

    // 2b. For direct streams in the same quality + multi-audio tier, prefer verified CORS-enabled CDNs (PixelDrain, 111477, BunnyCDN)
    if (a.kind === 'direct' && b.kind === 'direct') {
      const compatA = getBrowserStreamCompatibilityScore(a);
      const compatB = getBrowserStreamCompatibilityScore(b);
      if (compatB !== compatA) return compatB - compatA;
    }

    // 2c. Sub-sort Multi-Audio (3+ langs) above Dual-Audio (2 langs) when on the same CDN tier
    const audioA = a.audioScore ?? (a.isMultiAudio ? 1 : 0);
    const audioB = b.audioScore ?? (b.isMultiAudio ? 1 : 0);
    if (audioB !== audioA) return audioB - audioA;

    // 2d. For P2P magnet streams in the same quality + audio tier, prioritize healthy swarms (seeders)
    if (a.kind === 'magnet' && b.kind === 'magnet') {
      const seedsA = a.seeders ?? 0;
      const seedsB = b.seeders ?? 0;
      const healthyA = seedsA >= 5 ? 1 : 0;
      const healthyB = seedsB >= 5 ? 1 : 0;
      if (healthyB !== healthyA) return healthyB - healthyA;
      if (seedsB !== seedsA) return seedsB - seedsA;
    }

    // 3. Decreasing file size / bitrate
    const sizeA = a.sizeBytes ?? 0;
    const sizeB = b.sizeBytes ?? 0;
    if (sizeB !== sizeA) return sizeB - sizeA;

    return 0;
  });
}

/**
 * Default BitTorrent & WebTorrent trackers (from Nuvio P2pStreamingEngine + WebSocket WebRTC trackers)
 * used to enrich `infoHash` magnet URIs so P2P engines (WebTor, local Stremio 127.0.0.1:11470, native clients)
 * discover peers immediately.
 */
export const DEFAULT_P2P_TRACKERS: string[] = [
  'udp://tracker.opentrackr.org:1337/announce',
  'udp://open.demonii.com:1337/announce',
  'udp://open.stealth.si:80/announce',
  'udp://tracker.torrent.eu.org:451/announce',
  'udp://tracker.qu.ax:6969/announce',
  'udp://tracker.tryhackx.org:6969/announce',
  'udp://tracker.nyaa.vc:6969/announce',
  'udp://tracker.gmi.gd:6969/announce',
  'udp://tracker.ducks.party:1984/announce',
  'udp://zer0day.ch:1337/announce',
  'udp://tracker.publictracker.xyz:6969/announce',
  'http://tracker.renfei.net:8080/announce',
  'wss://tracker.openwebtorrent.com',
  'wss://tracker.btorrent.xyz',
  'wss://tracker.webtorrent.dev',
];

export function buildP2pMagnetUri(
  infoHash: string,
  displayName?: string,
  extraTrackers: string[] = [],
): string {
  const canonicalHash = infoHash.trim().toLowerCase();
  const dnParam = displayName ? `&dn=${encodeURIComponent(displayName)}` : '';
  const allTrackers = Array.from(
    new Set([...extraTrackers, ...DEFAULT_P2P_TRACKERS].map((t) => t.trim()).filter(Boolean)),
  );
  const trParams = allTrackers
    .slice(0, 20)
    .map((tr) => `&tr=${encodeURIComponent(tr)}`)
    .join('');
  return `magnet:?xt=urn:btih:${canonicalHash}${dnParam}${trParams}`;
}

/**
 * Streaming Catalogs (pw.ers.netflix-catalog) provider definitions & URL configurator
 * Reverse-engineered from https://7a82163c306e-stremio-netflix-catalog-addon.baby-beamup.club/configure
 */
export interface StreamingServiceOption {
  id: string;
  name: string;
  shortTag: string;
  accentColor: string;
}

export const STREAMING_CATALOG_SERVICES: StreamingServiceOption[] = [
  { id: 'nfx', name: 'Netflix', shortTag: 'NFX', accentColor: '#E50914' },
  { id: 'hbm', name: 'HBO Max', shortTag: 'MAX', accentColor: '#991EEB' },
  { id: 'dnp', name: 'Disney+', shortTag: 'DNP', accentColor: '#0063E5' },
  { id: 'amp', name: 'Prime Video', shortTag: 'AMP', accentColor: '#00A8E1' },
  { id: 'atp', name: 'Apple TV+', shortTag: 'ATP', accentColor: '#A2AAAD' },
  { id: 'pmp', name: 'Paramount+', shortTag: 'PMP', accentColor: '#0064FF' },
  { id: 'pcp', name: 'Peacock Premium', shortTag: 'PCP', accentColor: '#F5A623' },
  { id: 'hlu', name: 'Hulu', shortTag: 'HLU', accentColor: '#1CE783' },
  { id: 'cru', name: 'Crunchyroll', shortTag: 'CRU', accentColor: '#F47521' },
  { id: 'jhs', name: 'JioHotstar', shortTag: 'JHS', accentColor: '#1F80E0' },
  { id: 'zee', name: 'Zee5', shortTag: 'ZEE', accentColor: '#8230C6' },
  { id: 'sonyliv', name: 'Sony Liv', shortTag: 'LIV', accentColor: '#FA6400' },
  { id: 'mbi', name: 'Mubi', shortTag: 'MBI', accentColor: '#0055FF' },
  { id: 'dpe', name: 'Discovery+', shortTag: 'DPE', accentColor: '#2175D9' },
  { id: 'stz', name: 'Starz', shortTag: 'STZ', accentColor: '#00B2A9' },
  { id: 'bbc', name: 'BBC iPlayer', shortTag: 'BBC', accentColor: '#FF4C98' },
  { id: 'itv', name: 'ITVX', shortTag: 'ITV', accentColor: '#D8FF00' },
  { id: 'al4', name: 'Channel 4', shortTag: 'CH4', accentColor: '#40E0D0' },
  { id: 'crc', name: 'Criterion Channel', shortTag: 'CRC', accentColor: '#EAE6DF' },
  { id: 'shd', name: 'Shudder', shortTag: 'SHD', accentColor: '#C91B1B' },
  { id: 'bbo', name: 'BritBox', shortTag: 'BBO', accentColor: '#00A3E0' },
  { id: 'act', name: 'Acorn TV', shortTag: 'ACT', accentColor: '#81B29A' },
  { id: 'cts', name: 'Curiosity Stream', shortTag: 'CTS', accentColor: '#E5A93C' },
  { id: 'mgl', name: 'MagellanTV', shortTag: 'MGL', accentColor: '#3B82F6' },
  { id: 'nfk', name: 'Netflix Kids', shortTag: 'NFK', accentColor: '#F87171' },
  { id: 'vik', name: 'Rakuten Viki', shortTag: 'VIK', accentColor: '#0095FF' },
  { id: 'iqi', name: 'iQIYI', shortTag: 'IQI', accentColor: '#00CC4C' },
  { id: 'hay', name: 'Hayu', shortTag: 'HAY', accentColor: '#FF5A79' },
  { id: 'clv', name: 'Clarovideo', shortTag: 'CLV', accentColor: '#EF4444' },
  { id: 'gop', name: 'Globoplay', shortTag: 'GOP', accentColor: '#FB923C' },
  { id: 'nlz', name: 'NLZIET', shortTag: 'NLZ', accentColor: '#38BDF8' },
  { id: 'vil', name: 'Videoland', shortTag: 'VIL', accentColor: '#F43F5E' },
  { id: 'sst', name: 'SkyShowtime', shortTag: 'SST', accentColor: '#818CF8' },
  { id: 'cpd', name: 'Canal+', shortTag: 'CPD', accentColor: '#FBBF24' },
  { id: 'sgo', name: 'Sky Go', shortTag: 'SGO', accentColor: '#60A5FA' },
  { id: 'mp9', name: 'Movistar+', shortTag: 'MOV', accentColor: '#34D399' },
  { id: 'sha', name: 'Shahid VIP', shortTag: 'SHA', accentColor: '#10B981' },
];

export const STREAMING_CATALOG_COUNTRIES: Array<{ code: string; name: string }> = [
  { code: 'US', name: 'United States' },
  { code: 'IN', name: 'India' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'CA', name: 'Canada' },
  { code: 'AU', name: 'Australia' },
  { code: 'DE', name: 'Germany' },
  { code: 'FR', name: 'France' },
  { code: 'BR', name: 'Brazil' },
  { code: 'ES', name: 'Spain' },
  { code: 'IT', name: 'Italy' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'SE', name: 'Sweden' },
  { code: 'JP', name: 'Japan' },
  { code: 'KR', name: 'South Korea' },
  { code: 'MX', name: 'Mexico' },
  { code: 'AR', name: 'Argentina' },
  { code: 'SG', name: 'Singapore' },
  { code: 'AE', name: 'United Arab Emirates' },
  { code: 'ZA', name: 'South Africa' },
];

export interface StreamingCatalogsConfig {
  providers: string[];
  rpdbKey: string;
  countryCode: string;
  netflixTop10Global: boolean;
  netflixTop10Country: boolean;
  netflixTop10CountryCode: string;
}

export const DEFAULT_STREAMING_CATALOGS_CONFIG: StreamingCatalogsConfig = {
  providers: ['nfx', 'hbm', 'dnp', 'amp', 'atp'],
  rpdbKey: '',
  countryCode: 'US',
  netflixTop10Global: true,
  netflixTop10Country: false,
  netflixTop10CountryCode: 'US',
};

export const STREAMING_CATALOGS_PRIMARY_ORIGIN =
  'https://7a82163c306e-stremio-netflix-catalog-addon.baby-beamup.club';

export const STREAMING_CATALOGS_BACKUP_ORIGIN = 'https://catalog.ers.pw';

/**
 * Decodes an existing Streaming Catalogs manifest URL if it contains a Base64 configuration segment.
 */
export function parseStreamingCatalogsConfig(manifestUrl: string): StreamingCatalogsConfig {
  try {
    const parsed = new URL(manifestUrl);
    const segments = parsed.pathname.split('/').filter(Boolean);
    if (segments.length >= 2 && segments[segments.length - 1] === 'manifest.json') {
      const encoded = decodeURIComponent(segments[segments.length - 2]);
      const decoded = atob(encoded);
      const [
        providersRaw = '',
        rpdbKey = '',
        countryCode = 'US',
        _timeStamp = '',
        top10GlobalRaw = '0',
        top10CountryRaw = '0',
        top10CountryCode = 'US',
      ] = decoded.split(':');

      const providers = providersRaw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      if (providers.length > 0 || top10GlobalRaw === '1' || top10CountryRaw === '1') {
        return {
          providers: providers.length > 0 ? providers : ['nfx', 'hbm', 'dnp', 'amp', 'atp'],
          rpdbKey,
          countryCode: countryCode || 'US',
          netflixTop10Global: top10GlobalRaw === '1',
          netflixTop10Country: top10CountryRaw === '1',
          netflixTop10CountryCode: top10CountryCode || countryCode || 'US',
        };
      }
    }
  } catch {
    // Fall back to default config
  }
  return { ...DEFAULT_STREAMING_CATALOGS_CONFIG };
}

/**
 * Builds the exact Base64-configured manifest URL expected by Streaming Catalogs (pw.ers.netflix-catalog).
 */
export function buildStreamingCatalogsManifestUrl(
  config: StreamingCatalogsConfig,
  existingManifestUrl?: string,
): string {
  let origin = STREAMING_CATALOGS_PRIMARY_ORIGIN;
  if (existingManifestUrl) {
    try {
      const parsed = new URL(existingManifestUrl);
      if (
        parsed.origin.includes('baby-beamup.club') ||
        parsed.origin.includes('catalog.ers.pw')
      ) {
        origin = parsed.origin;
      }
    } catch {
      // Keep default origin
    }
  }

  const parts = [
    config.providers.join(','),
    config.rpdbKey.trim(),
    config.countryCode || 'US',
    String(Date.now()),
    config.netflixTop10Global ? '1' : '0',
    config.netflixTop10Country ? '1' : '0',
    config.netflixTop10Country ? config.netflixTop10CountryCode || config.countryCode || 'US' : '',
  ];

  const base64Payload = btoa(parts.join(':'));
  return `${origin}/${encodeURIComponent(base64Payload)}/manifest.json`;
}

function slugifyAddonName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const CLIENT_AUTH_TOKEN_STORAGE_KEY = 'streamz_auth_token_v1';

export function getClientAuthToken(): string | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem(CLIENT_AUTH_TOKEN_STORAGE_KEY);
    }
  } catch {
    // Ignore storage access errors
  }
  return null;
}

/**
 * Resolves user input URLs into a concrete Stremio `/manifest.json` URL:
 * - Converts `stremio://` scheme to `https://`
 * - Resolves `https://stremio-addons.net/addons/<slug>` directory URLs via local Vite resolver or Stremio's official addonscollection.json
 * - Appends `/manifest.json` when omitted
 */
export async function resolveAddonInputUrl(rawInput: string): Promise<string> {
  const trimmed = rawInput.trim().replace(/^stremio:\/\//i, 'https://');
  if (!trimmed) {
    throw new Error('Enter a Stremio addon manifest URL or stremio-addons.net link.');
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error('Malformed URL syntax. Use https://.../manifest.json or stremio://...');
  }

  // Handle stremio-addons.net directory links (e.g. https://stremio-addons.net/addons/streaming-catalogs)
  if (
    parsed.hostname === 'stremio-addons.net' ||
    parsed.hostname === 'www.stremio-addons.net'
  ) {
    const pathParts = parsed.pathname.split('/').filter(Boolean);
    const addonSlug =
      pathParts[0] === 'addons' && pathParts[1] ? pathParts[1].toLowerCase() : '';

    if (!addonSlug) {
      throw new Error(
        'https://stremio-addons.net is an addon directory website, not a manifest endpoint. Paste a specific addon page like https://stremio-addons.net/addons/streaming-catalogs or its manifest.json URL.',
      );
    }

    // 1. Try local Vite dev/preview server resolver first if available
    try {
      const authToken = getClientAuthToken();
      const backendOrigin = getCloudBackendOrigin();
      const localResp = await fetch(
        `${backendOrigin}/api/resolve-stremio-addon?slug=${encodeURIComponent(addonSlug)}`,
        {
          headers: authToken ? { Authorization: `Bearer ${authToken}` } : undefined,
        },
      );
      if (localResp.ok) {
        const data = (await localResp.json()) as { manifestUrl?: string };
        if (data.manifestUrl) {
          return data.manifestUrl;
        }
      }
    } catch {
      // Fall through to official Stremio collection API
    }

    // 2. Resolve against Stremio's official CORS-enabled community addon collection
    const collectionResp = await fetch('https://api.strem.io/addonscollection.json', {
      headers: { Accept: 'application/json' },
    });
    if (collectionResp.ok) {
      const list = (await collectionResp.json()) as CommunityAddonDirectoryEntry[];
      const matched = list.find((entry) => {
        if (!entry?.manifest?.name) return false;
        const nameSlug = slugifyAddonName(entry.manifest.name);
        const idSlug = slugifyAddonName(entry.manifest.id || '');
        return (
          nameSlug === addonSlug ||
          idSlug === addonSlug ||
          nameSlug.includes(addonSlug) ||
          addonSlug.includes(nameSlug)
        );
      });
      if (matched?.transportUrl) {
        return normalizeManifestUrl(matched.transportUrl);
      }
    }

    throw new Error(
      `Could not automatically resolve stremio-addons.net slug "${addonSlug}". Copy the manifest.json URL from the addon page.`,
    );
  }

  return normalizeManifestUrl(trimmed);
}

export function normalizeManifestUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim().replace(/^stremio:\/\//i, 'https://');
  if (trimmed.endsWith('/manifest.json')) {
    return trimmed;
  }
  return `${trimmed.replace(/\/+$/, '')}/manifest.json`;
}

/**
 * Checks whether an addon manifest supports a given resource ('catalog' | 'meta' | 'stream' | 'subtitles'),
 * media type ('movie' | 'series'), and optional item ID prefix ('tt', etc.).
 */
export function addonSupportsResource(
  manifest: StremioAddonManifest,
  resourceName: 'catalog' | 'meta' | 'stream' | 'subtitles',
  mediaType?: string,
  itemId?: string,
): boolean {
  const resources = Array.isArray(manifest.resources) ? manifest.resources : [];

  for (const res of resources) {
    if (typeof res === 'string') {
      if (res !== resourceName) continue;
      if (
        mediaType &&
        Array.isArray(manifest.types) &&
        manifest.types.length > 0 &&
        !manifest.types.includes(mediaType)
      ) {
        continue;
      }
      if (
        itemId &&
        Array.isArray(manifest.idPrefixes) &&
        manifest.idPrefixes.length > 0 &&
        !manifest.idPrefixes.some((prefix) => itemId.startsWith(prefix))
      ) {
        continue;
      }
      return true;
    } else if (res && typeof res === 'object' && res.name === resourceName) {
      const allowedTypes = res.types ?? manifest.types ?? [];
      if (mediaType && allowedTypes.length > 0 && !allowedTypes.includes(mediaType)) {
        continue;
      }
      const allowedPrefixes = res.idPrefixes ?? manifest.idPrefixes ?? [];
      if (
        itemId &&
        allowedPrefixes.length > 0 &&
        !allowedPrefixes.some((prefix) => itemId.startsWith(prefix))
      ) {
        continue;
      }
      return true;
    }
  }

  return false;
}

/**
 * Normalizes a raw Stremio meta object (from `/catalog/...` or `/meta/...`) into `StremioMediaItem`.
 */
export function normalizeStremioMeta(
  raw: Record<string, unknown>,
  context?: {
    addonId?: string;
    addonName?: string;
    catalogId?: string;
    catalogName?: string;
    fallbackType?: string;
  },
): StremioMediaItem | null {
  const id =
    (typeof raw.id === 'string' && raw.id) ||
    (typeof raw.imdb_id === 'string' && raw.imdb_id) ||
    '';
  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  if (!id || !name || isDiscordOrPromoSpam(name)) return null;

  const imdbId =
    typeof raw.imdb_id === 'string'
      ? raw.imdb_id
      : id.startsWith('tt')
        ? id.split(':')[0]
        : undefined;

  const type =
    typeof raw.type === 'string' && raw.type
      ? raw.type
      : context?.fallbackType || 'movie';

  const genresRaw = Array.isArray(raw.genres)
    ? raw.genres
    : Array.isArray(raw.genre)
      ? raw.genre
      : [];
  const genres = genresRaw.filter((g): g is string => typeof g === 'string' && Boolean(g.trim()));

  const cast = Array.isArray(raw.cast)
    ? raw.cast.filter((c): c is string => typeof c === 'string')
    : [];

  const director = Array.isArray(raw.director)
    ? raw.director.filter((d): d is string => typeof d === 'string')
    : typeof raw.director === 'string' && raw.director
      ? [raw.director]
      : [];

  const writer = Array.isArray(raw.writer)
    ? raw.writer.filter((w): w is string => typeof w === 'string')
    : typeof raw.writer === 'string' && raw.writer
      ? [raw.writer]
      : [];

  const trailers: StremioTrailer[] = [];
  if (Array.isArray(raw.trailers)) {
    for (const t of raw.trailers) {
      if (t && typeof t === 'object' && typeof (t as { source?: unknown }).source === 'string') {
        trailers.push({
          source: (t as { source: string }).source,
          type: typeof (t as { type?: unknown }).type === 'string' ? (t as { type: string }).type : 'Trailer',
        });
      }
    }
  }
  if (Array.isArray(raw.trailerStreams)) {
    for (const ts of raw.trailerStreams) {
      if (ts && typeof ts === 'object' && typeof (ts as { ytId?: unknown }).ytId === 'string') {
        const ytId = (ts as { ytId: string }).ytId;
        if (!trailers.some((existing) => existing.source === ytId)) {
          trailers.push({
            source: ytId,
            title:
              typeof (ts as { title?: unknown }).title === 'string'
                ? (ts as { title: string }).title
                : name,
            type: 'Trailer',
          });
        }
      }
    }
  }

  const videos: StremioEpisodeVideo[] = [];
  if (Array.isArray(raw.videos)) {
    for (const v of raw.videos) {
      if (!v || typeof v !== 'object') continue;
      const vObj = v as Record<string, unknown>;
      const vidId = typeof vObj.id === 'string' ? vObj.id : '';
      const season =
        typeof vObj.season === 'number'
          ? vObj.season
          : Number(vObj.season ?? 0);
      const episode =
        typeof vObj.episode === 'number'
          ? vObj.episode
          : typeof vObj.number === 'number'
            ? vObj.number
            : Number(vObj.episode ?? vObj.number ?? 0);

      if (!vidId || Number.isNaN(season) || season <= 0) continue;

      videos.push({
        id: vidId,
        season,
        episode: Number.isNaN(episode) ? 1 : episode,
        name:
          typeof vObj.name === 'string' && vObj.name
            ? vObj.name
            : typeof vObj.title === 'string' && vObj.title
              ? vObj.title
              : `Episode ${episode}`,
        overview:
          typeof vObj.overview === 'string' && vObj.overview
            ? vObj.overview
            : typeof vObj.description === 'string' && vObj.description
              ? vObj.description
              : '',
        thumbnail: typeof vObj.thumbnail === 'string' ? vObj.thumbnail : undefined,
        released: typeof vObj.released === 'string' ? vObj.released : undefined,
      });
    }
  }

  videos.sort((a, b) => a.season - b.season || a.episode - b.episode);

  const poster =
    typeof raw.poster === 'string' && raw.poster
      ? raw.poster
      : imdbId
        ? `https://images.metahub.space/poster/medium/${imdbId}/img`
        : undefined;

  const background =
    typeof raw.background === 'string' && raw.background
      ? raw.background
      : imdbId
        ? `https://images.metahub.space/background/medium/${imdbId}/img`
        : poster;

  const logo =
    typeof raw.logo === 'string' && raw.logo
      ? raw.logo
      : imdbId
        ? `https://images.metahub.space/logo/medium/${imdbId}/img`
        : undefined;

  const releaseInfo =
    typeof raw.releaseInfo === 'string' && raw.releaseInfo
      ? raw.releaseInfo
      : typeof raw.year === 'string' || typeof raw.year === 'number'
        ? String(raw.year)
        : undefined;

  return {
    id,
    imdbId,
    type,
    name,
    poster,
    background,
    logo,
    description: typeof raw.description === 'string' ? raw.description : undefined,
    releaseInfo,
    year: typeof raw.year === 'string' || typeof raw.year === 'number' ? String(raw.year) : releaseInfo,
    runtime: typeof raw.runtime === 'string' ? raw.runtime : undefined,
    imdbRating:
      typeof raw.imdbRating === 'string' || typeof raw.imdbRating === 'number'
        ? String(raw.imdbRating)
        : undefined,
    genres,
    cast,
    director,
    writer,
    country: typeof raw.country === 'string' ? raw.country : undefined,
    awards: typeof raw.awards === 'string' ? raw.awards : undefined,
    trailers,
    videos,
    sourceAddonId: context?.addonId,
    sourceAddonName: context?.addonName,
    sourceCatalogId: context?.catalogId,
    sourceCatalogName: context?.catalogName,
  };
}

/**
 * Client-side L1 LRU JSON Cache + Single-Flight Request Coalescing
 * Eliminates duplicate Stremio manifest, catalog, meta, stream, and subtitle calls.
 */
interface ClientCacheEntry {
  data: unknown;
  expiresAt: number;
}

const CLIENT_JSON_CACHE = new Map<string, ClientCacheEntry>();
const CLIENT_INFLIGHT = new Map<string, Promise<unknown>>();
const MAX_CLIENT_CACHE_ENTRIES = 600;

export function getCloudBackendOrigin(): string {
  const envOrigin = (
    ((import.meta as unknown as { env?: Record<string, string> }).env
      ?.VITE_BACKEND_ORIGIN || '')
  )
    .trim()
    .replace(/\/+$/, '');
  if (envOrigin) return envOrigin;
  if (
    typeof window !== 'undefined' &&
    window.location?.hostname?.endsWith('.vercel.app') &&
    !(globalThis as Record<string, unknown>).__vitest_worker__
  ) {
    return 'https://fablearc-backend.onrender.com';
  }
  return '';
}

export function buildApiUrl(path: string): string {
  return `${getCloudBackendOrigin()}${path}`;
}

function isDirectCorsFastPathUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    // pengu.uk and st.111477.xyz do not send Access-Control-Allow-Origin headers on /stream/ and must use /api/stremio-proxy
    if (
      host === 'pengu.uk' ||
      host.endsWith('.pengu.uk') ||
      host === 'st.111477.xyz' ||
      host.endsWith('.111477.xyz')
    ) {
      return false;
    }
    // Public CORS-enabled catalog, metadata, subtitle & stream addons (including CNCVerse Bridge, Torrentio, HDHub4u, OpenSubtitles & AIOLists)
    // resolve directly from the browser with 0 Bytes of Render bandwidth and bypass datacenter IP blocks!
    if (
      host === 'v3-cinemeta.strem.io' ||
      host === 'cncverse.dpdns.org' ||
      host.endsWith('.dpdns.org') ||
      host === 'torrentio.strem.fun' ||
      host.endsWith('.strem.fun') ||
      host === 'hdhub.thevolecitor.qzz.io' ||
      host === 'opensubtitlesv3-pro.dexter21767.com' ||
      host === 'opensubtitles-v3.strem.io' ||
      host === 'aiometadata.elfhosted.com' ||
      host.endsWith('.baby-beamup.club') ||
      parsed.pathname.includes('/catalog/') ||
      parsed.pathname.endsWith('/manifest.json')
    ) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

async function cachedJsonFetch<T = unknown>(
  url: string,
  ttlMs: number,
  signal?: AbortSignal,
): Promise<T> {
  const now = Date.now();
  const hit = CLIENT_JSON_CACHE.get(url);
  if (hit && hit.expiresAt > now) {
    return hit.data as T;
  }

  const withSignalRace = (basePromise: Promise<T>): Promise<T> => {
    if (!signal) return basePromise;
    if (signal.aborted) {
      return Promise.reject(new Error('Request aborted'));
    }
    return new Promise<T>((resolve, reject) => {
      const onAbort = () => {
        signal.removeEventListener('abort', onAbort);
        reject(new Error('Request aborted'));
      };
      signal.addEventListener('abort', onAbort, { once: true });
      basePromise.then(
        (val) => {
          signal.removeEventListener('abort', onAbort);
          resolve(val);
        },
        (err) => {
          signal.removeEventListener('abort', onAbort);
          reject(err);
        },
      );
    });
  };

  const existing = CLIENT_INFLIGHT.get(url);
  if (existing) {
    return withSignalRace(existing as Promise<T>);
  }

  const doFetch = async (): Promise<T> => {
    const useServerProxy =
      typeof window !== 'undefined' &&
      window.location?.protocol?.startsWith('http') &&
      !(globalThis as Record<string, unknown>).__vitest_worker__;

    const preferDirectCors = useServerProxy && isDirectCorsFastPathUrl(url);
    let response: Response | null = null;

    if (preferDirectCors) {
      try {
        const directResp = await fetch(url, {
          method: 'GET',
          headers: { Accept: 'application/json' },
          signal,
        });
        if (directResp.ok) {
          response = directResp;
        }
      } catch (err) {
        if (signal?.aborted) throw err;
      }
    }

    if (!response && useServerProxy) {
      try {
        const authToken = getClientAuthToken();
        const backendOrigin = getCloudBackendOrigin();
        const proxyResp = await fetch(
          `${backendOrigin}/api/stremio-proxy?url=${encodeURIComponent(url)}`,
          {
            method: 'GET',
            headers: {
              Accept: 'application/json',
              ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
            },
            signal,
          },
        );
        if (proxyResp.ok) {
          response = proxyResp;
        }
      } catch (err) {
        if (signal?.aborted) throw err;
      }
    }

    if (!response) {
      response = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal,
      });
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const parsed = (await response.json()) as T;
    if (CLIENT_JSON_CACHE.size >= MAX_CLIENT_CACHE_ENTRIES) {
      const oldestKey = CLIENT_JSON_CACHE.keys().next().value;
      if (oldestKey !== undefined) CLIENT_JSON_CACHE.delete(oldestKey);
    }
    CLIENT_JSON_CACHE.set(url, { data: parsed, expiresAt: Date.now() + ttlMs });
    return parsed;
  };

  const promise = doFetch().finally(() => {
    CLIENT_INFLIGHT.delete(url);
  });
  CLIENT_INFLIGHT.set(url, promise);
  return withSignalRace(promise);
}

/**
 * Strictly declarative JSON-only Stremio Addon manifest fetcher.
 * Automatically falls back from `/stremio/manifest.json` to `/manifest.json` when ElfHosted/community endpoints return 404 on `/stremio/manifest.json`.
 */
export async function fetchStremioManifest(rawInput: string): Promise<{
  manifestUrl: string;
  manifest: StremioAddonManifest;
}> {
  const manifestUrl = await resolveAddonInputUrl(rawInput);
  const check = validateAddonOrStreamUrl(manifestUrl, {
    requireHttps: true,
    allowExplicitLanMediaServer: false,
  });

  if (!check.allowed || !check.normalizedUrl) {
    throw new Error(check.reason);
  }

  let activeManifestUrl = check.normalizedUrl;
  let data: Record<string, unknown> | null = null;

  try {
    data = await cachedJsonFetch<Record<string, unknown>>(activeManifestUrl, 3600_000);
  } catch (primaryErr) {
    // Automatic fallback if /stremio/manifest.json returns 404 (e.g. https://aiometadata.elfhosted.com/stremio/manifest.json)
    if (activeManifestUrl.endsWith('/stremio/manifest.json')) {
      const rootFallbackUrl = activeManifestUrl.replace(
        /\/stremio\/manifest\.json$/i,
        '/manifest.json',
      );
      const fallbackCheck = validateAddonOrStreamUrl(rootFallbackUrl, {
        requireHttps: true,
        allowExplicitLanMediaServer: false,
      });
      if (fallbackCheck.allowed && fallbackCheck.normalizedUrl) {
        data = await cachedJsonFetch<Record<string, unknown>>(
          fallbackCheck.normalizedUrl,
          3600_000,
        );
        activeManifestUrl = fallbackCheck.normalizedUrl;
      } else {
        throw primaryErr;
      }
    } else {
      throw new Error(
        primaryErr instanceof Error
          ? `Addon server returned ${primaryErr.message}`
          : 'Addon server error',
      );
    }
  }

  if (!data || typeof data.id !== 'string' || typeof data.name !== 'string') {
    if (data && typeof data.short_name === 'string' && Array.isArray(data.icons)) {
      throw new Error(
        'This URL returned a website PWA manifest, not a Stremio addon manifest. Paste a Stremio addon URL or https://stremio-addons.net/addons/<name>.',
      );
    }
    throw new Error('Manifest is missing required Stremio fields (id, name).');
  }

  const catalogsRaw = Array.isArray(data.catalogs) ? data.catalogs : [];
  const catalogs: StremioCatalogDefinition[] = catalogsRaw
    .filter((c): c is Record<string, unknown> => Boolean(c && typeof c === 'object'))
    .map((c) => ({
      type: typeof c.type === 'string' ? c.type : 'movie',
      id: typeof c.id === 'string' ? c.id : 'top',
      name: typeof c.name === 'string' ? c.name : String(c.id ?? 'Catalog'),
      genres: Array.isArray(c.genres)
        ? c.genres.filter((g): g is string => typeof g === 'string')
        : undefined,
      extra: Array.isArray(c.extra) ? (c.extra as StremioCatalogExtra[]) : undefined,
      extraSupported: Array.isArray(c.extraSupported)
        ? c.extraSupported.filter((e): e is string => typeof e === 'string')
        : undefined,
      extraRequired: Array.isArray(c.extraRequired)
        ? c.extraRequired.filter((e): e is string => typeof e === 'string')
        : undefined,
    }));

  const normalizedProfileId = String(data.id ?? '').toLowerCase();
  const normalizedActiveUrl = activeManifestUrl.toLowerCase();
  let resolvedManifestName = data.name;
  if (
    normalizedProfileId.includes('pwoi7q4u220fz') ||
    normalizedActiveUrl.includes('p_woi7q4u220fz')
  ) {
    resolvedManifestName = 'CNCVerse · Hindi & Indian OTT';
  } else if (
    normalizedProfileId.includes('p2tztbugmd1ys') ||
    normalizedActiveUrl.includes('p_2tztbugmd1ys')
  ) {
    resolvedManifestName = 'CNCVerse · English & 4K';
  } else if (
    normalizedProfileId.includes('pkhcby2w1jpgc') ||
    normalizedActiveUrl.includes('p_khcby2w1jpgc')
  ) {
    resolvedManifestName = 'CNCVerse · Anime & Cartoons';
  }

  return {
    manifestUrl: activeManifestUrl,
    manifest: {
      id: data.id,
      version: typeof data.version === 'string' ? data.version : '1.0.0',
      name: resolvedManifestName,
      description:
        typeof data.description === 'string' && stripDiscordText(data.description)
          ? stripDiscordText(data.description)
          : 'Declarative Stremio JSON addon.',
      logo: typeof data.logo === 'string' ? data.logo : undefined,
      background: typeof data.background === 'string' ? data.background : undefined,
      resources: Array.isArray(data.resources)
        ? (data.resources as Array<string | StremioResourceDescriptor>)
        : ['catalog'],
      types: Array.isArray(data.types)
        ? data.types.filter((t): t is string => typeof t === 'string')
        : ['movie', 'series'],
      idPrefixes: Array.isArray(data.idPrefixes)
        ? data.idPrefixes.filter((p): p is string => typeof p === 'string')
        : undefined,
      catalogs,
      behaviorHints:
        data.behaviorHints && typeof data.behaviorHints === 'object'
          ? (data.behaviorHints as StremioAddonManifest['behaviorHints'])
          : undefined,
    },
  };
}

export interface CatalogExtraQuery {
  genre?: string;
  search?: string;
  skip?: number;
}

/**
 * Fetches a declarative Stremio catalog (`/catalog/<type>/<id>[/<extra>].json`).
 * Supports Streaming Catalogs (`nfx`, `hbm`, `dnp`, `amp`, `atp`, etc.), Cinemeta, and all Stremio v1 catalog addons.
 */
export async function fetchAddonCatalog(
  manifestUrl: string,
  mediaType: string,
  catalogId: string,
  extra?: CatalogExtraQuery,
  addonContext?: { addonId?: string; addonName?: string; catalogName?: string },
  signal?: AbortSignal,
): Promise<StremioMediaItem[]> {
  const baseUrl = manifestUrl.replace(/\/manifest\.json$/i, '');

  const extraPairs: string[] = [];
  if (extra?.search && extra.search.trim()) {
    extraPairs.push(`search=${encodeURIComponent(extra.search.trim())}`);
  }
  if (extra?.genre && extra.genre !== 'All') {
    extraPairs.push(`genre=${encodeURIComponent(extra.genre)}`);
  }
  if (typeof extra?.skip === 'number' && extra.skip > 0) {
    extraPairs.push(`skip=${extra.skip}`);
  }

  const extraSuffix = extraPairs.length > 0 ? `/${extraPairs.join('&')}` : '';
  const endpoint = `${baseUrl}/catalog/${encodeURIComponent(mediaType)}/${encodeURIComponent(catalogId)}${extraSuffix}.json`;

  const check = validateAddonOrStreamUrl(endpoint, {
    requireHttps: true,
    allowExplicitLanMediaServer: false,
  });
  if (!check.allowed || !check.normalizedUrl) {
    throw new Error(check.reason);
  }

  const payload = await cachedJsonFetch<{ metas?: Array<Record<string, unknown>> }>(
    check.normalizedUrl,
    900_000,
    signal,
  );
  if (!Array.isArray(payload?.metas)) return [];

  const items: StremioMediaItem[] = [];
  for (const raw of payload.metas) {
    if (!raw || typeof raw !== 'object') continue;
    const normalized = normalizeStremioMeta(raw, {
      addonId: addonContext?.addonId,
      addonName: addonContext?.addonName,
      catalogId,
      catalogName: addonContext?.catalogName,
      fallbackType: mediaType,
    });
    if (normalized) {
      items.push(normalized);
    }
  }

  return items;
}

/**
 * Queries installed `meta` addons (e.g. Cinemeta, AIOMetadata) to enrich an item with full synopsis, cast, trailers, and series episodes (`videos`).
 */
export async function fetchMetaFromAddons(
  addons: InstalledAddon[],
  mediaType: string,
  itemId: string,
  initialItem?: StremioMediaItem,
): Promise<StremioMediaItem | null> {
  const candidates = addons.filter(
    (a) =>
      a.enabled &&
      addonSupportsResource(a.manifest, 'meta', mediaType, itemId),
  );

  for (const addon of candidates) {
    const baseUrl = addon.manifestUrl.replace(/\/manifest\.json$/i, '');
    const endpoint = `${baseUrl}/meta/${encodeURIComponent(mediaType)}/${encodeURIComponent(itemId)}.json`;
    const check = validateAddonOrStreamUrl(endpoint, {
      requireHttps: true,
      allowExplicitLanMediaServer: false,
    });
    if (!check.allowed || !check.normalizedUrl) continue;

    try {
      const data = await cachedJsonFetch<{ meta?: Record<string, unknown> }>(
        check.normalizedUrl,
        1800_000,
      );
      if (data?.meta && typeof data.meta === 'object') {
        const enriched = normalizeStremioMeta(data.meta, {
          addonId: initialItem?.sourceAddonId ?? addon.manifest.id,
          addonName: initialItem?.sourceAddonName ?? addon.manifest.name,
          catalogId: initialItem?.sourceCatalogId,
          catalogName: initialItem?.sourceCatalogName,
          fallbackType: mediaType,
        });
        if (enriched) {
          return {
            ...initialItem,
            ...enriched,
            poster: initialItem?.poster || enriched.poster,
            background: enriched.background || initialItem?.background,
            logo: enriched.logo || initialItem?.logo,
            description: enriched.description || initialItem?.description,
            genres: enriched.genres.length > 0 ? enriched.genres : initialItem?.genres ?? [],
            cast: enriched.cast.length > 0 ? enriched.cast : initialItem?.cast ?? [],
            director: enriched.director.length > 0 ? enriched.director : initialItem?.director ?? [],
            trailers: enriched.trailers.length > 0 ? enriched.trailers : initialItem?.trailers ?? [],
            videos: enriched.videos.length > 0 ? enriched.videos : initialItem?.videos ?? [],
          };
        }
      }
    } catch {
      // Try next meta addon
    }
  }

  return initialItem ?? null;
}

const streamListCache = new Map<
  string,
  { data: StremioStreamItem[]; expiresAt: number }
>();
const inFlightStreamFetches = new Map<string, Promise<StremioStreamItem[]>>();
const inFlightPartialListeners = new Map<
  string,
  Set<(partialStreams: StremioStreamItem[]) => void>
>();
const partialStreamSnapshots = new Map<string, StremioStreamItem[]>();

/**
 * Queries all enabled `stream` addons for `/stream/<type>/<videoId>.json`, parses resolution quality & file size,
 * merges trailers, and returns streams sorted in strictly decreasing order of quality.
 * Uses single-flight request coalescing + a 5-minute in-memory cache so card-hover prefetching makes Details/Player load in 0ms.
 */
export function getStreamProviderCategory(
  stream: Pick<StremioStreamItem, 'addonId' | 'addonName'>,
): string {
  const idLower = String(stream.addonId || '').toLowerCase();
  const nameLower = String(stream.addonName || '').toLowerCase();
  if (idLower.includes('pengu') || nameLower.includes('pengu')) {
    return 'PenguPlay';
  }
  if (idLower.includes('hdhub') || nameLower.includes('hdhub')) {
    return 'HdHub';
  }
  if (idLower.includes('111477') || nameLower.includes('111477')) {
    return '111477';
  }
  if (idLower.includes('webstreamr') || nameLower.includes('webstreamr')) {
    return 'WebStreamr';
  }
  if (idLower.includes('pwoi7q4u220fz') || nameLower.includes('hindi & indian ott')) {
    return 'CNCVerse · Hindi & Indian OTT';
  }
  if (idLower.includes('p2tztbugmd1ys') || nameLower.includes('english & 4k')) {
    return 'CNCVerse · English & 4K';
  }
  if (idLower.includes('pkhcby2w1jpgc') || nameLower.includes('anime & cartoons')) {
    return 'CNCVerse · Anime & Cartoons';
  }
  return stream.addonName?.trim() || stream.addonId?.trim() || 'Other';
}

export async function fetchStreamsFromAddons(
  addons: InstalledAddon[],
  mediaType: string,
  videoId: string,
  mediaItem?: StremioMediaItem,
  onPartialStreams?: (partialStreams: StremioStreamItem[]) => void,
): Promise<StremioStreamItem[]> {
  const streamAddons = addons.filter(
    (a) =>
      a.enabled &&
      addonSupportsResource(a.manifest, 'stream', mediaType, videoId),
  );

  const addonSignature = streamAddons
    .map((a) => a.manifest.id)
    .sort()
    .join(',');
  const cacheKey = `${addonSignature}::${mediaType}::${videoId}`;

  const cached = streamListCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    const hydrated = applyCachedServerHealth(cached.data);
    if (onPartialStreams && hydrated.length > 0) {
      onPartialStreams(hydrated);
    }
    return hydrated;
  }

  if (onPartialStreams) {
    let listenerSet = inFlightPartialListeners.get(cacheKey);
    if (!listenerSet) {
      listenerSet = new Set();
      inFlightPartialListeners.set(cacheKey, listenerSet);
    }
    listenerSet.add(onPartialStreams);
    const existingSnapshot = partialStreamSnapshots.get(cacheKey);
    if (existingSnapshot && existingSnapshot.length > 0) {
      try {
        onPartialStreams(applyCachedServerHealth(existingSnapshot));
      } catch {
        // Ignore callback error
      }
    }
  }

  const existingInFlight = inFlightStreamFetches.get(cacheKey);
  if (existingInFlight) {
    try {
      const list = await existingInFlight;
      return applyCachedServerHealth(list);
    } finally {
      if (onPartialStreams) {
        inFlightPartialListeners.get(cacheKey)?.delete(onPartialStreams);
      }
    }
  }

  const fetchPromise = (async (): Promise<StremioStreamItem[]> => {
    const results: StremioStreamItem[] = [];

    const notifyPartialWave = () => {
      if (results.length === 0) return;
      const sortedPartial = sortStreamsByDecreasingQuality([...results]);
      partialStreamSnapshots.set(cacheKey, sortedPartial);
      const listeners = inFlightPartialListeners.get(cacheKey);
      if (listeners && listeners.size > 0) {
        const hydratedPartial = applyCachedServerHealth(sortedPartial);
        listeners.forEach((cb) => {
          try {
            cb(hydratedPartial);
          } catch {
            // Ignore listener error
          }
        });
      }
    };

    await Promise.allSettled(
      streamAddons.map(async (addon) => {
        const seenAddonUrls = new Set<string>();
        const effectiveManifestUrl = upgradeLegacyDefaultAddonUrl(addon.manifestUrl);
        const baseUrl = effectiveManifestUrl.replace(/\/manifest\.json$/i, '');
        const endpoint = `${baseUrl}/stream/${encodeURIComponent(mediaType)}/${encodeURIComponent(videoId)}.json`;
        const check = validateAddonOrStreamUrl(endpoint, {
          requireHttps: true,
          allowExplicitLanMediaServer: false,
        });
        if (!check.allowed || !check.normalizedUrl) return;

        const abortCtrl = new AbortController();
        const timeoutId = setTimeout(() => abortCtrl.abort(), 18000);
        let payload: { streams?: Array<Record<string, unknown>> } | null = null;
        try {
          payload = await cachedJsonFetch<{
            streams?: Array<Record<string, unknown>>;
          }>(check.normalizedUrl, 600_000, abortCtrl.signal);
        } finally {
          clearTimeout(timeoutId);
        }
        if (!Array.isArray(payload?.streams)) return;

        const countBeforeAddon = results.length;

        payload.streams.forEach((raw, idx) => {
          if (!raw || typeof raw !== 'object') return;
          const name =
            typeof raw.name === 'string' && raw.name.trim()
              ? raw.name.trim()
              : addon.manifest.name;
          const rawDesc =
            typeof raw.description === 'string' && raw.description.trim()
              ? raw.description.trim()
              : '';
          const behaviorHints =
            raw.behaviorHints && typeof raw.behaviorHints === 'object'
              ? (raw.behaviorHints as Record<string, unknown>)
              : undefined;
          const hintFilename =
            behaviorHints && typeof behaviorHints.filename === 'string'
              ? behaviorHints.filename
              : '';
          const extraDesc = `${rawDesc} ${hintFilename}`.trim();
          const title =
            typeof raw.title === 'string' && raw.title.trim()
              ? raw.title.trim()
              : rawDesc || name;

          const qualityInfo = extractStreamQualityInfo(name, title, extraDesc);
          if (
            qualityInfo.sizeBytes === 0 &&
            behaviorHints &&
            typeof behaviorHints.videoSize === 'number' &&
            behaviorHints.videoSize > 0
          ) {
            qualityInfo.sizeBytes = behaviorHints.videoSize;
            const gb = behaviorHints.videoSize / (1024 * 1024 * 1024);
            qualityInfo.sizeLabel =
              gb >= 1
                ? `${gb.toFixed(gb >= 10 ? 1 : 2)} GB`
                : `${Math.round(behaviorHints.videoSize / (1024 * 1024))} MB`;
          }
          const rawUrlStr = typeof raw.url === 'string' ? raw.url : '';
          const rawExtStr = typeof raw.externalUrl === 'string' ? raw.externalUrl : '';

          // Completely drop any "Join Discord Server" or promotional spam entries
          if (
            qualityInfo.isPromo ||
            isDiscordOrPromoSpam(rawUrlStr) ||
            isDiscordOrPromoSpam(rawExtStr)
          ) {
            return;
          }

          if (typeof raw.url === 'string' && raw.url.trim()) {
            let candidateStreamUrl = raw.url.trim();
            if (candidateStreamUrl.toLowerCase().startsWith('magnet:')) {
              return;
            }
            // Unwrap proxy wrapper query params (e.g. `http://140.238.244.130/proxy/bound?d=https%3A%2F%2Fpixeldrain.dev...`)
            // so the browser connects directly to the underlying HTTPS CDN!
            try {
              const parsedCandidate = new URL(candidateStreamUrl);
              const embeddedTarget =
                parsedCandidate.searchParams.get('d') ||
                parsedCandidate.searchParams.get('link') ||
                parsedCandidate.searchParams.get('url');
              if (embeddedTarget && /^https?:\/\//i.test(embeddedTarget.trim())) {
                candidateStreamUrl = embeddedTarget.trim();
              }
            } catch {
              // Keep original candidateStreamUrl
            }
            // Auto-upgrade http:// stream URLs when they point to the same HTTPS-enabled addon host
            // (e.g. HdHub returning `http://hdhub.thevolecitor.qzz.io/resolve/...` even though the host serves HTTPS)
            if (candidateStreamUrl.startsWith('http://')) {
              try {
                const streamParsed = new URL(candidateStreamUrl);
                const addonParsed = new URL(effectiveManifestUrl);
                const streamHost = streamParsed.hostname.toLowerCase();
                if (
                  (addonParsed.protocol === 'https:' &&
                    streamHost === addonParsed.hostname.toLowerCase()) ||
                  streamHost === 'hdhub.thevolecitor.qzz.io' ||
                  streamHost.endsWith('.workers.dev') ||
                  streamHost.endsWith('.baby-beamup.club')
                ) {
                  streamParsed.protocol = 'https:';
                  candidateStreamUrl = streamParsed.toString();
                }
              } catch {
                // Keep original candidateStreamUrl
              }
            }
            const urlCheck = validateAddonOrStreamUrl(candidateStreamUrl, {
              requireHttps: false,
              allowExplicitLanMediaServer: false,
            });
            if (
              urlCheck.allowed &&
              urlCheck.normalizedUrl &&
              !seenAddonUrls.has(urlCheck.normalizedUrl)
            ) {
              seenAddonUrls.add(urlCheck.normalizedUrl);
              const normalizedProviderName = getStreamProviderCategory({
                addonId: addon.manifest.id,
                addonName: addon.manifest.name,
              });
              results.push({
                id: `${addon.manifest.id}-direct-${idx}`,
                addonId: addon.manifest.id,
                addonName: normalizedProviderName,
                name,
                title,
                kind: 'direct',
                url: urlCheck.normalizedUrl,
                isHls: /\.m3u8(\?|$)|\/hls\/|\/playlist\//i.test(
                  urlCheck.normalizedUrl,
                ),
                ...qualityInfo,
              });
            }
          } else if (typeof raw.externalUrl === 'string' && raw.externalUrl.trim()) {
            const extCheck = validateAddonOrStreamUrl(raw.externalUrl.trim(), {
              requireHttps: true,
              allowExplicitLanMediaServer: false,
            });
            if (extCheck.allowed && extCheck.normalizedUrl) {
              results.push({
                id: `${addon.manifest.id}-ext-${idx}`,
                addonId: addon.manifest.id,
                addonName: addon.manifest.name,
                name,
                title,
                kind: 'external',
                externalUrl: extCheck.normalizedUrl,
                ...qualityInfo,
              });
            }
          }
        });

        if (results.length > countBeforeAddon) {
          notifyPartialWave();
        }
      }),
    );

    const sorted = sortStreamsByDecreasingQuality(results);
    if (sorted.length > 0) {
      streamListCache.set(cacheKey, {
        data: sorted,
        expiresAt: Date.now() + 5 * 60 * 1000,
      });
    }
    return applyCachedServerHealth(sorted);
  })();

  inFlightStreamFetches.set(cacheKey, fetchPromise);
  try {
    return await fetchPromise;
  } finally {
    inFlightStreamFetches.delete(cacheKey);
    inFlightPartialListeners.delete(cacheKey);
    partialStreamSnapshots.delete(cacheKey);
  }
}

/**
 * Layer 1 (Hover Intent Prefetch): Silently prefetches addon streams for a media card
 * so opening the Details Page or clicking Play resolves the stream list in 0ms.
 */
export function prefetchStreamsForMedia(
  addons: InstalledAddon[],
  mediaItem: StremioMediaItem,
): void {
  const targetVideoId =
    mediaItem.type === 'series' && mediaItem.videos?.length > 0
      ? mediaItem.videos[0].id
      : mediaItem.imdbId || mediaItem.id;
  if (!targetVideoId) return;
  fetchStreamsFromAddons(addons, mediaItem.type, targetVideoId, mediaItem).catch(
    () => {},
  );
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

/**
 * Computes language priority rank for multi-audio tracks:
 * 0 = English (highest priority)
 * 1 = Hindi (second priority)
 * 2 = Any other language (preserves original stream index order)
 */
export function getAudioTrackLanguagePriority(
  track: Pick<ProbedAudioTrack, 'langCode' | 'langName' | 'title' | 'label'>,
): number {
  const code = (track.langCode || '').trim().toLowerCase();
  const combined = `${track.langName || ''} ${track.title || ''} ${track.label || ''}`.toLowerCase();

  if (
    code === 'eng' ||
    code === 'en' ||
    code.startsWith('en-') ||
    code === 'english' ||
    /\b(english|eng)\b/i.test(combined)
  ) {
    return 0;
  }

  if (
    code === 'hin' ||
    code === 'hi' ||
    code.startsWith('hi-') ||
    code === 'hindi' ||
    /\b(hindi|hin)\b/i.test(combined)
  ) {
    return 1;
  }

  return 2;
}

/**
 * Sorts multi-audio tracks with English first, then Hindi, then any other language,
 * while preserving each track's true FFmpeg `audioIndex` for accurate stream mapping.
 */
export function sortAudioTracksByLanguagePriority(
  tracks: ProbedAudioTrack[],
): ProbedAudioTrack[] {
  const codecWeight = (codec: string): number => {
    const c = (codec || '').toLowerCase();
    if (/^(aac|mp3|mp4a|opus|vorbis)$/.test(c)) return 0; // Browser-native codecs first
    if (/^(ac3|eac3)$/.test(c)) return 1; // Fast Dolby compatibility tracks second
    return 2; // Heavy lossless TrueHD / DTS last within the same language
  };

  return [...tracks].sort((a, b) => {
    const prioA = getAudioTrackLanguagePriority(a);
    const prioB = getAudioTrackLanguagePriority(b);
    if (prioA !== prioB) return prioA - prioB;
    if ((a.langCode || '').toLowerCase() === (b.langCode || '').toLowerCase()) {
      const cwA = codecWeight(a.codec);
      const cwB = codecWeight(b.codec);
      if (cwA !== cwB) return cwA - cwB;
    }
    return a.audioIndex - b.audioIndex;
  });
}

let cachedAc3Support: boolean | null = null;
let cachedEac3Support: boolean | null = null;

/**
 * Checks whether the current browser can natively decode the given audio codec inside HTML5 `<video>`,
 * avoiding unnecessary server-side FFmpeg split-audio transcoding (0 MB on Render & 0ms lockstep delay).
 */
export function canBrowserPlayAudioCodecNatively(codec?: string | null): boolean {
  const c = (codec || '').trim().toLowerCase();
  if (!c) return false;
  if (/^(aac|mp3|mp4a|opus|vorbis|flac|pcm)/i.test(c)) {
    return true;
  }
  if (typeof document === 'undefined') {
    return false;
  }
  if (c === 'eac3' || c === 'ec-3' || c === 'ec3') {
    if (cachedEac3Support === null) {
      try {
        const v = document.createElement('video');
        const res =
          v.canPlayType('audio/mp4; codecs="ec-3"') ||
          v.canPlayType('video/mp4; codecs="avc1.42E01E, ec-3"');
        cachedEac3Support = res === 'probably' || res === 'maybe';
      } catch {
        cachedEac3Support = false;
      }
    }
    return cachedEac3Support;
  }
  if (c === 'ac3' || c === 'ac-3') {
    if (cachedAc3Support === null) {
      try {
        const v = document.createElement('video');
        const res =
          v.canPlayType('audio/mp4; codecs="ac-3"') ||
          v.canPlayType('video/mp4; codecs="avc1.42E01E, ac-3"');
        cachedAc3Support = res === 'probably' || res === 'maybe';
      } catch {
        cachedAc3Support = false;
      }
    }
    return cachedAc3Support;
  }
  return false;
}

export interface MediaProbeResponse {
  resolvedUrl: string;
  durationSec: number;
  videoCodec: string;
  audioTracks: ProbedAudioTrack[];
  unreachable?: boolean;
}

const clientProbeCache = new Map<
  string,
  { data: MediaProbeResponse; expiresAt: number }
>();

const preconnectedOrigins = new Set<string>();

/**
 * Layer 2 (Browser Preconnect & DNS-Prefetch Warmup):
 * Injects `<link rel="dns-prefetch">` and `<link rel="preconnect" crossorigin>` into `document.head`
 * for the winning direct CDN origin so the user's browser completes DNS + TCP + TLS 1.3 handshakes
 * BEFORE the user clicks Play Now (0 MB Render bandwidth).
 */
export function warmBrowserCdnConnection(targetUrl?: string | null): void {
  if (!targetUrl || typeof document === 'undefined' || !document.head) return;
  try {
    const parsed = new URL(targetUrl);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return;
    const origin = parsed.origin;
    if (!origin || preconnectedOrigins.has(origin)) return;
    if (preconnectedOrigins.size >= 32) {
      const oldest = preconnectedOrigins.values().next().value;
      if (oldest) preconnectedOrigins.delete(oldest);
    }
    preconnectedOrigins.add(origin);

    const dnsLink = document.createElement('link');
    dnsLink.rel = 'dns-prefetch';
    dnsLink.href = origin;
    document.head.appendChild(dnsLink);

    const preconnectLink = document.createElement('link');
    preconnectLink.rel = 'preconnect';
    preconnectLink.href = origin;
    preconnectLink.crossOrigin = 'anonymous';
    document.head.appendChild(preconnectLink);
  } catch {
    // Ignore invalid URLs
  }
}

/**
 * Layer 3 (Synchronous Probe Cache Lookup):
 * Returns a previously pre-warmed `/api/media-probe` result synchronously in 0ms
 * so opening CinemaPlayerModal from the Details Page skips the async probe round-trip completely!
 */
export function getCachedMediaProbe(streamUrl?: string | null): MediaProbeResponse | null {
  if (!streamUrl) return null;
  const cached = clientProbeCache.get(streamUrl);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }
  return null;
}

const inFlightProbes = new Map<string, Promise<MediaProbeResponse | null>>();

export async function probeMediaStream(
  streamUrl: string,
  explicitToken?: string,
): Promise<MediaProbeResponse | null> {
  if (!streamUrl) return null;
  const cached = clientProbeCache.get(streamUrl);
  if (cached && cached.expiresAt > Date.now()) {
    warmBrowserCdnConnection(cached.data.resolvedUrl || streamUrl);
    return cached.data;
  }

  const existingInFlight = inFlightProbes.get(streamUrl);
  if (existingInFlight) {
    return existingInFlight;
  }

  const probePromise = (async (): Promise<MediaProbeResponse | null> => {
    try {
      const authToken = explicitToken ?? getClientAuthToken();
      const tokenQuery = authToken ? `&token=${encodeURIComponent(authToken)}` : '';
      const backendOrigin = getCloudBackendOrigin();
      const resp = await fetch(
        `${backendOrigin}/api/media-probe?url=${encodeURIComponent(streamUrl)}${tokenQuery}`,
        {
          headers: {
            Accept: 'application/json',
            ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
          },
        },
      );
      if (!resp.ok) return null;
      const data = (await resp.json()) as MediaProbeResponse;
      if (!data || !Array.isArray(data.audioTracks)) return null;
      const normalized: MediaProbeResponse = {
        ...data,
        audioTracks: sortAudioTracksByLanguagePriority(data.audioTracks),
      };
      clientProbeCache.set(streamUrl, {
        data: normalized,
        expiresAt: Date.now() + 10 * 60 * 1000,
      });
      if (normalized.resolvedUrl) {
        clientProbeCache.set(normalized.resolvedUrl, {
          data: normalized,
          expiresAt: Date.now() + 10 * 60 * 1000,
        });
      }
      warmBrowserCdnConnection(normalized.resolvedUrl || streamUrl);
      return normalized;
    } catch {
      return null;
    }
  })().finally(() => {
    inFlightProbes.delete(streamUrl);
  });

  inFlightProbes.set(streamUrl, probePromise);
  return probePromise;
}

export function buildTranscodedStreamUrl(
  streamUrl: string,
  audioTrackIndex = 0,
  startSec = 0,
  explicitToken?: string,
  mode: 'audio' | 'muxed' = 'audio',
): string {
  const roundedStart = Math.max(0, Math.floor(startSec));
  const authToken = explicitToken ?? getClientAuthToken();
  const tokenParam = authToken ? `&token=${encodeURIComponent(authToken)}` : '';
  const modeParam = mode === 'audio' ? '&mode=audio' : '';
  const backendOrigin = getCloudBackendOrigin();
  return `${backendOrigin}/api/media-stream?url=${encodeURIComponent(streamUrl)}&audioTrack=${audioTrackIndex}&start=${roundedStart}${modeParam}${tokenParam}`;
}

export interface ServerHealthMetric {
  id: string;
  ok: boolean;
  unreachable: boolean;
  isHttps: boolean;
  resolvedUrl?: string;
  ttfbMs: number;
  speedMbps: number;
  responsivenessScore: number;
  statusBadge: string;
}

const clientServerHealthCache = new Map<
  string,
  { metric: ServerHealthMetric; expiresAt: number }
>();

/**
 * Returns true ONLY if a stream has been confirmed Offline or Blocked.
 * Never returns true for `Slow / Timeout` streams so slow streams are kept in the list.
 */
export function isOfflineStream(stream: StremioStreamItem): boolean {
  const badge = (stream.serverStatusBadge || '').trim();
  if (/^Slow\s*\/\s*Timeout$/i.test(badge)) {
    return false;
  }
  if (/^(Offline|Blocked)$/i.test(badge)) {
    return true;
  }
  return Boolean(stream.unreachable);
}

/**
 * Marks a stream URL as Offline in the client health cache so confirmed dead streams are
 * immediately removed from both the Details Page and Player server lists.
 */
export function markStreamOfflineInCache(streamUrl?: string | null): void {
  if (!streamUrl) return;
  clientServerHealthCache.set(streamUrl, {
    metric: {
      id: streamUrl,
      ok: false,
      unreachable: true,
      isHttps: streamUrl.startsWith('https://'),
      resolvedUrl: streamUrl,
      ttfbMs: 9999,
      speedMbps: 0,
      responsivenessScore: -500,
      statusBadge: 'Offline',
    },
    expiresAt: Date.now() + 5 * 60 * 1000,
  });
}

/**
 * Layer 4 (Client-Side Ping & Resolution Cache):
 * Applies any cached server ping/health metrics synchronously and removes confirmed
 * Offline streams while keeping Slow / Timeout streams intact.
 */
export function applyCachedServerHealth(
  streams: StremioStreamItem[],
): StremioStreamItem[] {
  const now = Date.now();
  return streams
    .map((s) => {
      if (!s.url) return s;
      const cached = clientServerHealthCache.get(s.url);
      if (!cached || cached.expiresAt <= now) return s;
      const m = cached.metric;
      const isSlowTimeout = /^Slow\s*\/\s*Timeout$/i.test((m.statusBadge || '').trim());
      return {
        ...s,
        ttfbMs: m.ttfbMs,
        speedMbps: m.speedMbps || s.speedMbps,
        responsivenessScore: m.responsivenessScore || s.responsivenessScore,
        serverStatusBadge: m.statusBadge || s.serverStatusBadge,
        unreachable: isSlowTimeout ? false : Boolean(m.unreachable),
        resolvedDirectUrl: m.resolvedUrl || s.resolvedDirectUrl || s.url,
      };
    })
    .filter((s) => !isOfflineStream(s));
}

/**
 * Benchmarks up to 6 candidate stream servers in the background with a partial 64 KB Range check
 * via `/api/media-health-batch` (costs ~400 bytes of JSON on Render outbound HTTP Responses),
 * promotes the single most responsive zero-buffer server to the #1 top slot (`isTopResponsive: true`),
 * pushes confirmed dead/offline servers to the bottom, and preserves the exact decreasing quality +
 * multi-audio sorting for all remaining servers!
 */
export async function rankStreamsByResponsiveness(
  streams: StremioStreamItem[],
  explicitToken?: string,
): Promise<StremioStreamItem[]> {
  const sortedBase = applyCachedServerHealth(sortStreamsByDecreasingQuality(streams));
  const allDirect = sortedBase.filter(
    (s) =>
      s.kind === 'direct' &&
      !s.isPromo &&
      Boolean(s.url && /^https?:\/\//i.test(s.url)),
  );

  if (allDirect.length === 0) {
    return sortedBase;
  }

  // Pick up to 8 diverse, high-probability zero-buffer candidates across BOTH 4K and 1080p tiers:
  // - Up to 4 direct file streams from 4K (preferring PixelDrain/FSL/2Peckle/111477 with known sizeBytes)
  // - Up to 4 direct file streams from 1080p (fast 1.5–4 GB Dual-Audio files that start in <1s with zero buffering)
  // - Fill any remaining slots up to 8 from the rest of allDirect
  const selectedIds = new Set<string>();
  const directCandidates: StremioStreamItem[] = [];
  const addCandidate = (item?: StremioStreamItem) => {
    if (item && !selectedIds.has(item.id) && directCandidates.length < 6) {
      selectedIds.add(item.id);
      directCandidates.push(item);
    }
  };

  const nonHlsDirect = allDirect.filter((s) => !s.isHls);
  const tier4kFiles = nonHlsDirect.filter((s) => (s.qualityScore ?? 0) >= 2160);
  const tier1080pFiles = nonHlsDirect.filter(
    (s) => (s.qualityScore ?? 0) >= 1080 && (s.qualityScore ?? 0) < 2160,
  );

  // Prefer PixelDrain / FSL / BunnyCDN / 111477 servers with distinct mirror names and browser-native H.264 / sweet-spot sizes for instant zero-buffer start
  const pickDistinctMirrors = (
    list: StremioStreamItem[],
    count: number,
    preferCompactSize = false,
  ): StremioStreamItem[] => {
    const scored = [...list].sort((a, b) => {
      const urlA = (a.url || '').toLowerCase();
      const urlB = (b.url || '').toLowerCase();
      const metaA = `${a.name} ${a.title} ${urlA}`;
      const metaB = `${b.name} ${b.title} ${urlB}`;
      const hostScore = (urlLower: string, meta: string): number => {
        if (urlLower.includes('pixeldrain.dev') || urlLower.includes('pixeldrain.com')) return 6;
        if (
          urlLower.includes('111477.xyz') ||
          urlLower.includes('b-cdn.net') ||
          urlLower.includes('fsldownload') ||
          urlLower.includes('fsl-v2')
        )
          return 5;
        if (/\b(2peckle|arctic)\b/i.test(meta) && !urlLower.includes('.workers.dev')) return 3;
        if (urlLower.includes('.r2.cloudflarestorage.com')) return 2;
        if (urlLower.includes('.workers.dev')) return 1;
        return 0;
      };
      const hDiff = hostScore(urlB, metaB) - hostScore(urlA, metaA);
      if (hDiff !== 0) return hDiff;

      // Prefer non-Dolby-Vision streams over 4K DV profiles that often fail hardware decode in HTML5 <video>
      const dvPenaltyA = /\b(dv|dolby\s*vision|dovi)\b/i.test(metaA) ? 1 : 0;
      const dvPenaltyB = /\b(dv|dolby\s*vision|dovi)\b/i.test(metaB) ? 1 : 0;
      if (dvPenaltyA !== dvPenaltyB) return dvPenaltyA - dvPenaltyB;

      const audioA = a.audioScore ?? (a.isMultiAudio ? 1 : 0);
      const audioB = b.audioScore ?? (b.isMultiAudio ? 1 : 0);
      if (audioB !== audioA) return audioB - audioA;

      const gbA = (a.sizeBytes ?? 0) / (1024 * 1024 * 1024);
      const gbB = (b.sizeBytes ?? 0) / (1024 * 1024 * 1024);
      if (preferCompactSize) {
        const sweetA = gbA >= 1.0 && gbA <= 4.5 ? 1 : 0;
        const sweetB = gbB >= 1.0 && gbB <= 4.5 ? 1 : 0;
        if (sweetB !== sweetA) return sweetB - sweetA;
        if (gbA > 0 && gbB > 0) return gbA - gbB;
      } else {
        const sweet4kA = gbA >= 2.0 && gbA <= 22.0 ? 1 : 0;
        const sweet4kB = gbB >= 2.0 && gbB <= 22.0 ? 1 : 0;
        if (sweet4kB !== sweet4kA) return sweet4kB - sweet4kA;
      }
      return 0;
    });

    const picked: StremioStreamItem[] = [];
    const seenNames = new Set<string>();
    for (const item of scored) {
      if (picked.length >= count) break;
      const mirrorKey = item.name.toLowerCase().trim();
      if (!seenNames.has(mirrorKey)) {
        seenNames.add(mirrorKey);
        picked.push(item);
      }
    }
    for (const item of scored) {
      if (picked.length >= count) break;
      if (!picked.some((p) => p.id === item.id)) {
        picked.push(item);
      }
    }
    return picked;
  };

  for (const c of pickDistinctMirrors(tier4kFiles, 3, false)) {
    addCandidate(c);
  }
  for (const c of pickDistinctMirrors(tier1080pFiles, 3, true)) {
    addCandidate(c);
  }
  for (const c of allDirect) {
    if (directCandidates.length >= 6) break;
    addCandidate(c);
  }

  try {
    const now = Date.now();
    const metricById = new Map<string, ServerHealthMetric>();
    const uncachedCandidates: StremioStreamItem[] = [];

    for (const c of directCandidates) {
      const cached = c.url ? clientServerHealthCache.get(c.url) : undefined;
      if (cached && cached.expiresAt > now && cached.metric.speedMbps > 0) {
        metricById.set(c.id, { ...cached.metric, id: c.id });
      } else {
        uncachedCandidates.push(c);
      }
    }

    const authToken = explicitToken ?? getClientAuthToken();
    if (uncachedCandidates.length > 0) {
      const backendOrigin = getCloudBackendOrigin();
      const resp = await fetch(`${backendOrigin}/api/media-health-batch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({
          candidates: uncachedCandidates.map((c) => ({
            id: c.id,
            url: c.url,
            sizeBytes: c.sizeBytes ?? 0,
          })),
        }),
      });

      if (resp.ok) {
        const payload = (await resp.json()) as { results?: ServerHealthMetric[] };
        const metrics = Array.isArray(payload?.results) ? payload.results : [];
        for (const m of metrics) {
          if (m && typeof m.id === 'string') {
            metricById.set(m.id, m);
            const matchedCandidate = uncachedCandidates.find((c) => c.id === m.id);
            if (matchedCandidate?.url) {
              clientServerHealthCache.set(matchedCandidate.url, {
                metric: m,
                expiresAt: Date.now() + 5 * 60 * 1000,
              });
            }
          }
        }
      }
    }

    if (metricById.size === 0) {
      return sortedBase;
    }

    // Annotate streams with measured TTFB, speed, and reachability, and remove confirmed Offline streams (keeping Slow / Timeout streams)
    const annotated = sortedBase
      .map((s) => {
        const m = metricById.get(s.id);
        if (!m) return { ...s, isTopResponsive: false };
        const isSlowTimeout = /^Slow\s*\/\s*Timeout$/i.test((m.statusBadge || '').trim());
        return {
          ...s,
          isTopResponsive: false,
          ttfbMs: m.ttfbMs,
          speedMbps: m.speedMbps,
          responsivenessScore: m.responsivenessScore,
          serverStatusBadge: m.statusBadge,
          unreachable: isSlowTimeout ? false : Boolean(m.unreachable),
          resolvedDirectUrl: m.resolvedUrl || s.url,
        };
      })
      .filter((s) => !isOfflineStream(s));

    // Identify the best healthy server among the benchmarked candidates
    // Combine responsivenessScore with quality + multi-audio + Layer 3 Native/Fast-Start container bonus
    let bestStreamId: string | null = null;
    let bestCompositeScore = -Infinity;

    for (const s of annotated) {
      const m = metricById.get(s.id);
      if (!m || !m.ok || m.unreachable || !m.isHttps) continue;
      // Only award quality bonus if the server has genuine zero-buffer throughput (responsivenessScore >= 500)
      const qualityBonus =
        m.responsivenessScore >= 500
          ? Math.min(90, ((s.qualityScore ?? 720) / 2160) * 90)
          : Math.min(35, ((s.qualityScore ?? 720) / 2160) * 35);
      const audioBonus = (s.audioScore ?? 0) * 30;
      const combinedMeta = `${s.name} ${s.title} ${s.url || ''}`.toLowerCase();
      // Layer 3: Reward fast-seek MP4/HLS containers, universal H.264 video codec, and browser-native AAC/Opus audio codecs;
      // penalize 4K Dolby Vision profiles (`DV`/`DoVi`) that frequently fail HTML5 <video> decode in browsers.
      const nativeContainerBonus =
        s.isHls || /\b(mp4|m3u8|aac|opus|faststart)\b/i.test(combinedMeta) ? 45 : 0;
      const h264Bonus = /\b(x264|h\.?264|avc)\b/i.test(combinedMeta) ? 55 : 0;
      const directCdnBonus =
        /\b(pixeldrain|fsldownload|fsl(?:-v2)?|b-cdn\.net|111477\.xyz)\b/i.test(combinedMeta)
          ? 45
          : 0;
      const gbSize = (s.sizeBytes ?? 0) / (1024 * 1024 * 1024);
      const bloatPenalty = gbSize > 30 ? -160 : 0;
      const dvPenalty = /\b(dv|dolby\s*vision|dovi)\b/i.test(combinedMeta) ? -220 : 0;
      const composite =
        m.responsivenessScore +
        qualityBonus +
        audioBonus +
        nativeContainerBonus +
        h264Bonus +
        directCdnBonus +
        bloatPenalty +
        dvPenalty;
      if (composite > bestCompositeScore) {
        bestCompositeScore = composite;
        bestStreamId = s.id;
      }
    }

    if (!bestStreamId) {
      return annotated;
    }

    const winner = annotated.find((s) => s.id === bestStreamId);
    if (!winner) {
      return annotated;
    }

    const topWinner: StremioStreamItem = {
      ...winner,
      isTopResponsive: true,
    };

    const withWinner = annotated.map((s) =>
      s.id === bestStreamId ? { ...s, isTopResponsive: true } : s,
    );

    // Layer 2 & 3: Immediately preconnect browser TLS to the winning CDN origin AND pre-warm /api/media-probe!
    warmBrowserCdnConnection(topWinner.resolvedDirectUrl || topWinner.url);
    if (topWinner.url) {
      probeMediaStream(topWinner.url, authToken ?? undefined).catch(() => {});
    }

    // Preserve strict decreasing quality order (4K -> 1080p -> 720p -> 480p) so 1080p never jumps above 4K!
    return sortStreamsByDecreasingQuality(withWinner);
  } catch {
    return sortedBase;
  }
}

/**
 * Progressively pings a batch of direct streams (up to 18 per request, 1 KB Range check)
 * via `/api/media-health-batch` (`pingOnly: true`) so every stream in the Quality dropdown
 * and Details page displays its live `ms` ping without re-sorting or interrupting playback.
 * Reuses `clientServerHealthCache` (5-min TTL) so previously pinged streams resolve in 0ms!
 */
export async function pingStreamBatch(
  candidates: StremioStreamItem[],
  explicitToken?: string,
): Promise<Map<string, ServerHealthMetric>> {
  const resultMap = new Map<string, ServerHealthMetric>();
  const validCandidates = candidates
    .filter(
      (s) =>
        s.kind === 'direct' &&
        !s.isPromo &&
        Boolean(s.url && /^https?:\/\//i.test(s.url)),
    )
    .slice(0, 18);

  if (validCandidates.length === 0) {
    return resultMap;
  }

  const now = Date.now();
  const uncachedCandidates: StremioStreamItem[] = [];
  for (const c of validCandidates) {
    const cached = c.url ? clientServerHealthCache.get(c.url) : undefined;
    if (cached && cached.expiresAt > now) {
      resultMap.set(c.id, { ...cached.metric, id: c.id });
    } else {
      uncachedCandidates.push(c);
    }
  }

  if (uncachedCandidates.length === 0) {
    return resultMap;
  }

  try {
    const authToken = explicitToken ?? getClientAuthToken();
    const backendOrigin = getCloudBackendOrigin();
    const resp = await fetch(`${backendOrigin}/api/media-health-batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
      body: JSON.stringify({
        pingOnly: true,
        candidates: uncachedCandidates.map((c) => ({
          id: c.id,
          url: c.url,
          sizeBytes: c.sizeBytes ?? 0,
        })),
      }),
    });

    if (!resp.ok) {
      return resultMap;
    }

    const payload = (await resp.json()) as { results?: ServerHealthMetric[] };
    const metrics = Array.isArray(payload?.results) ? payload.results : [];
    for (const m of metrics) {
      if (m && typeof m.id === 'string') {
        resultMap.set(m.id, m);
        const matchedCandidate = uncachedCandidates.find((c) => c.id === m.id);
        if (matchedCandidate?.url) {
          clientServerHealthCache.set(matchedCandidate.url, {
            metric: m,
            expiresAt: Date.now() + 5 * 60 * 1000,
          });
        }
      }
    }
    return resultMap;
  } catch {
    return resultMap;
  }
}

/**
 * Queries all enabled `subtitles` addons (e.g., OpenSubtitles v3 Pro & OpenSubtitles v3) for `/subtitles/<type>/<videoId>.json`.
 */
export async function fetchSubtitlesFromAddons(
  addons: InstalledAddon[],
  mediaType: string,
  videoId: string,
): Promise<StremioSubtitleTrack[]> {
  const subAddons = addons.filter(
    (a) =>
      a.enabled &&
      addonSupportsResource(a.manifest, 'subtitles', mediaType, videoId),
  );

  const tracks: StremioSubtitleTrack[] = [];

  await Promise.allSettled(
    subAddons.map(async (addon) => {
      const baseUrl = addon.manifestUrl.replace(/\/manifest\.json$/i, '');
      const endpoint = `${baseUrl}/subtitles/${encodeURIComponent(mediaType)}/${encodeURIComponent(videoId)}.json`;
      const check = validateAddonOrStreamUrl(endpoint, {
        requireHttps: true,
        allowExplicitLanMediaServer: false,
      });
      if (!check.allowed || !check.normalizedUrl) return;

      const payload = await cachedJsonFetch<{
        subtitles?: Array<Record<string, unknown>>;
      }>(check.normalizedUrl, 900_000);
      if (!Array.isArray(payload?.subtitles)) return;

      payload.subtitles.slice(0, 25).forEach((sub, idx) => {
        if (!sub || typeof sub !== 'object' || typeof sub.url !== 'string') return;
        const urlCheck = validateAddonOrStreamUrl(sub.url, {
          requireHttps: true,
          allowExplicitLanMediaServer: false,
        });
        if (!urlCheck.allowed || !urlCheck.normalizedUrl) return;

        const lang = typeof sub.lang === 'string' ? sub.lang : 'unk';
        const fileName =
          typeof sub.subtitleFileName === 'string'
            ? sub.subtitleFileName
            : `${lang.toUpperCase()} #${idx + 1}`;

        tracks.push({
          id: `${addon.manifest.id}-sub-${sub.id ?? idx}`,
          addonId: addon.manifest.id,
          addonName: addon.manifest.name,
          lang,
          url: urlCheck.normalizedUrl,
          label: `${lang.toUpperCase()} — ${fileName}`,
        });
      });
    }),
  );

  return tracks;
}

/**
 * Fetches the live Stremio community addon directory (`https://api.strem.io/addonscollection.json`)
 * so users can browse and install any community addon without hardcoded lists.
 */
export async function fetchCommunityAddonsDirectory(): Promise<CommunityAddonDirectoryEntry[]> {
  const endpoint = 'https://api.strem.io/addonscollection.json';
  const check = validateAddonOrStreamUrl(endpoint, {
    requireHttps: true,
    allowExplicitLanMediaServer: false,
  });
  if (!check.allowed || !check.normalizedUrl) {
    throw new Error(check.reason);
  }

  const raw = await cachedJsonFetch<
    Array<{
      transportUrl?: string;
      manifest?: StremioAddonManifest;
    }>
  >(check.normalizedUrl, 3600_000);

  if (!Array.isArray(raw)) return [];

  return raw
    .filter(
      (entry): entry is CommunityAddonDirectoryEntry =>
        Boolean(
          entry &&
            typeof entry.transportUrl === 'string' &&
            entry.transportUrl.startsWith('https://') &&
            entry.manifest &&
            typeof entry.manifest.id === 'string' &&
            typeof entry.manifest.name === 'string',
        ),
    )
    .slice(0, 60);
}

export const DEFAULT_PENGUPLAY_MANIFEST_URL =
  'https://pengu.uk/%7B%22auth_token%22%3A%22jBIrOxA27mMz_WvoR_ZCAMR72uZegRCgWJzw9P0IIUQ%22%7D/manifest.json';

/**
 * Automatically upgrades any legacy unauthenticated PenguPlay URL (`https://pengu.uk/manifest.json`)
 * stored in localStorage or SQLite DB to the authenticated PenguPlay URL.
 */
export function upgradeLegacyDefaultAddonUrl(manifestUrl: string): string {
  const trimmed = manifestUrl.trim();
  if (/^https?:\/\/pengu\.uk\/manifest\.json$/i.test(trimmed)) {
    return DEFAULT_PENGUPLAY_MANIFEST_URL;
  }
  return trimmed;
}

/**
 * Default live Stremio addon manifest URLs installed automatically on startup.
 * Includes all user-requested default addons + Cinemeta & OpenSubtitles v3 for complete catalog, stream, meta, and subtitle coverage.
 */
export const DEFAULT_BOOTSTRAP_MANIFEST_URLS: string[] = [
  // Streaming Catalogs addon commented out (code preserved):
  // 'https://7a82163c306e-stremio-netflix-catalog-addon.baby-beamup.club/manifest.json',
  'https://cncverse.dpdns.org/u/p_woi7q4u220fz/manifest.json',
  'https://cncverse.dpdns.org/u/p_2tztbugmd1ys/manifest.json',
  'https://cncverse.dpdns.org/u/p_khcby2w1jpgc/manifest.json',
  'https://aiometadata.elfhosted.com/stremio/manifest.json',
  'https://87d6a6ef6b58-webstreamrmbg.baby-beamup.club/manifest.json',
  DEFAULT_PENGUPLAY_MANIFEST_URL,
  'https://st.111477.xyz/config/aHR0cHM6Ly9hLjExMTQ3Ny54eXov/manifest.json',
  'https://hdhub.thevolecitor.qzz.io/eyJ0b3Jib3giOiJ1bnNldCIsInF1YWxpdGllcyI6IjIxNjBwLDEwODBwLDcyMHAiLCJzb3J0IjoiZGVzYyJ9/manifest.json',
  'https://opensubtitlesv3-pro.dexter21767.com/manifest.json',
  'https://v3-cinemeta.strem.io/manifest.json',
  'https://opensubtitles-v3.strem.io/manifest.json',
];
