export interface UrlValidationOptions {
  requireHttps?: boolean;
  allowExplicitLanMediaServer?: boolean;
}

export interface UrlValidationResult {
  allowed: boolean;
  normalizedUrl: string | null;
  reason: string;
  riskCode?:
    | 'INVALID_URL'
    | 'FORBIDDEN_SCHEME'
    | 'INSECURE_HTTP'
    | 'LOOPBACK_BLOCKED'
    | 'METADATA_LINK_LOCAL_BLOCKED'
    | 'PRIVATE_LAN_BLOCKED'
    | 'EMBEDDED_CREDENTIALS_BLOCKED';
}

function isIpv4Loopback(parts: number[]): boolean {
  return parts[0] === 127 || parts[0] === 0;
}

function isIpv4LinkLocal(parts: number[]): boolean {
  // 169.254.0.0/16 (AWS/GCP/Azure link-local metadata) & 100.100.100.200 (Alibaba Cloud metadata)
  if (parts[0] === 169 && parts[1] === 254) return true;
  if (parts[0] === 100 && parts[1] === 100 && parts[2] === 100 && parts[3] === 200) return true;
  return false;
}

function isIpv4PrivateLan(parts: number[]): boolean {
  if (parts[0] === 10) return true;
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  if (parts[0] === 192 && parts[1] === 168) return true;
  if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return true; // CGNAT 100.64.0.0/10
  if (parts[0] === 198 && (parts[1] === 18 || parts[1] === 19)) return true; // Benchmarking 198.18.0.0/15
  if (parts[0] >= 224) return true; // Multicast & reserved 224.0.0.0/4+
  return false;
}

function parseIpv4Octets(hostname: string): number[] | null {
  const parts = hostname.split('.');
  if (parts.length !== 4) return null;
  const nums: number[] = [];
  for (const part of parts) {
    if (!/^\d+$/.test(part)) return null;
    // Block octal leading zeros (e.g. 0177.0.0.1)
    if (part.length > 1 && part.startsWith('0')) return null;
    const n = Number(part);
    if (n < 0 || n > 255) return null;
    nums.push(n);
  }
  return nums;
}

/**
 * Extracts embedded IPv4 octets from IPv6-mapped or NAT64 IPv6 addresses:
 * - Dotted-quad form: `::ffff:127.0.0.1`, `::ffff:0:127.0.0.1`, `64:ff9b::127.0.0.1`
 * - Canonical hex-pair form (produced by `new URL()`): `::ffff:7f00:1`, `::ffff:a9fe:a9fe`, `64:ff9b::7f00:1`
 */
function extractEmbeddedIpv4FromIpv6(host: string): number[] | null {
  const clean = host.toLowerCase().replace(/^\[|\]$/g, '');
  if (!clean.includes(':')) return null;

  // Check dotted-quad suffix (e.g. ::ffff:127.0.0.1)
  const lastColon = clean.lastIndexOf(':');
  const tail = clean.slice(lastColon + 1);
  if (tail.includes('.')) {
    return parseIpv4Octets(tail);
  }

  // Check hex pair suffix on IPv4-mapped / translated prefixes (::ffff:xxxx:yyyy or ::xxxx:yyyy or 64:ff9b::xxxx:yyyy)
  const mappedHexMatch = clean.match(
    /^(?:::ffff:(?:0:)?|::|0:0:0:0:0:ffff:|0:0:0:0:0:0:|64:ff9b::)([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i,
  );
  if (mappedHexMatch) {
    const hi = parseInt(mappedHexMatch[1], 16);
    const lo = parseInt(mappedHexMatch[2], 16);
    return [(hi >> 8) & 0xff, hi & 0xff, (lo >> 8) & 0xff, lo & 0xff];
  }

  return null;
}

const BLOCKED_METADATA_HOSTS = new Set([
  'metadata.google.internal',
  'metadata.goog',
  'metadata',
  'instance-data',
]);

/**
 * Remediates NuvioDesktop [VULN-002] (SSRF via FetchBridge) & [VULN-005] (unsafe URI schemes).
 * Validates addon manifest URLs, stream URLs, and media server endpoints against loopback,
 * RFC1918 (`10/8`, `172.16/12`, `192.168/16`), CGNAT (`100.64/10`), cloud metadata (`169.254.169.254`, `fd00:ec2::254`),
 * and IPv6-mapped IPv4 bypasses (`[::ffff:127.0.0.1]`).
 */
export function validateAddonOrStreamUrl(
  rawUrl: string,
  options: UrlValidationOptions = {},
): UrlValidationResult {
  const { requireHttps = true, allowExplicitLanMediaServer = false } = options;
  const trimmed = rawUrl.trim();
  if (!trimmed || trimmed.startsWith('-')) {
    return {
      allowed: false,
      normalizedUrl: null,
      reason: 'Enter a complete URL starting with https://',
      riskCode: 'INVALID_URL',
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return {
      allowed: false,
      normalizedUrl: null,
      reason: 'Malformed URL syntax.',
      riskCode: 'INVALID_URL',
    };
  }

  const scheme = parsed.protocol.toLowerCase();
  if (scheme !== 'https:' && scheme !== 'http:') {
    return {
      allowed: false,
      normalizedUrl: null,
      reason: `Blocked unsafe URI scheme "${scheme}". Only HTTPS/HTTP media endpoints are permitted.`,
      riskCode: 'FORBIDDEN_SCHEME',
    };
  }

  if (parsed.username || parsed.password) {
    return {
      allowed: false,
      normalizedUrl: null,
      reason: 'Blocked URL containing embedded credentials.',
      riskCode: 'EMBEDDED_CREDENTIALS_BLOCKED',
    };
  }

  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');

  // Block cloud metadata hostnames
  if (BLOCKED_METADATA_HOSTS.has(host) || host.endsWith('.internal')) {
    return {
      allowed: false,
      normalizedUrl: null,
      reason: `Blocked internal/cloud metadata hostname (${host}).`,
      riskCode: 'METADATA_LINK_LOCAL_BLOCKED',
    };
  }

  // Block localhost & IPv6 loopback / unspecified
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host === '::1' ||
    host === '0:0:0:0:0:0:0:1' ||
    host === '::' ||
    host === '0:0:0:0:0:0:0:0' ||
    host === '0.0.0.0' ||
    host.startsWith('127.')
  ) {
    return {
      allowed: false,
      normalizedUrl: null,
      reason: `Blocked loopback address (${host}) to prevent local SSRF attacks.`,
      riskCode: 'LOOPBACK_BLOCKED',
    };
  }

  // Check IPv6-mapped / NAT64 embedded IPv4 addresses (e.g. [::ffff:127.0.0.1] -> ::ffff:7f00:1)
  const embeddedIpv4 = extractEmbeddedIpv4FromIpv6(host);
  if (embeddedIpv4) {
    if (isIpv4Loopback(embeddedIpv4)) {
      return {
        allowed: false,
        normalizedUrl: null,
        reason: `Blocked IPv6-mapped loopback address (${host}).`,
        riskCode: 'LOOPBACK_BLOCKED',
      };
    }
    if (isIpv4LinkLocal(embeddedIpv4)) {
      return {
        allowed: false,
        normalizedUrl: null,
        reason: `Blocked IPv6-mapped link-local/metadata address (${host}).`,
        riskCode: 'METADATA_LINK_LOCAL_BLOCKED',
      };
    }
    if (isIpv4PrivateLan(embeddedIpv4) && !allowExplicitLanMediaServer) {
      return {
        allowed: false,
        normalizedUrl: null,
        reason: `Blocked IPv6-mapped private LAN address (${host}).`,
        riskCode: 'PRIVATE_LAN_BLOCKED',
      };
    }
  }

  // Block IPv6 link-local (fe80::/10) and unique-local (fc00::/7, fd00::/8 including AWS fd00:ec2::254)
  if (
    host.startsWith('fe80:') ||
    host.startsWith('fec0:') ||
    host.startsWith('fc') ||
    host.startsWith('fd')
  ) {
    if (
      allowExplicitLanMediaServer &&
      (host.startsWith('fc') || host.startsWith('fd')) &&
      host !== 'fd00:ec2::254'
    ) {
      // Permitted only when user explicitly opts into LAN media server mode
    } else {
      return {
        allowed: false,
        normalizedUrl: null,
        reason: `Blocked private/link-local IPv6 address (${host}).`,
        riskCode: 'METADATA_LINK_LOCAL_BLOCKED',
      };
    }
  }

  // Check IPv4 ranges and hex/octal/shorthand IP bypass attempts (e.g. 0x7f000001, 2130706433, 0177.0.0.1, 127.1)
  if (
    /^0x[0-9a-f]+$/i.test(host) ||
    /^\d+$/.test(host) ||
    /^[0-9x.]+$/i.test(host) && parseIpv4Octets(host) === null
  ) {
    return {
      allowed: false,
      normalizedUrl: null,
      reason: 'Blocked non-standard IP encoding bypass attempt.',
      riskCode: 'LOOPBACK_BLOCKED',
    };
  }

  const ipv4 = parseIpv4Octets(host);
  if (ipv4) {
    if (isIpv4Loopback(ipv4)) {
      return {
        allowed: false,
        normalizedUrl: null,
        reason: `Blocked loopback IPv4 address (${host}).`,
        riskCode: 'LOOPBACK_BLOCKED',
      };
    }
    if (isIpv4LinkLocal(ipv4)) {
      return {
        allowed: false,
        normalizedUrl: null,
        reason: `Blocked link-local / cloud metadata address (${host}).`,
        riskCode: 'METADATA_LINK_LOCAL_BLOCKED',
      };
    }
    if (isIpv4PrivateLan(ipv4) && !allowExplicitLanMediaServer) {
      return {
        allowed: false,
        normalizedUrl: null,
        reason: `Blocked RFC1918 private LAN address (${host}). Enable LAN Media Server scope only for trusted home servers.`,
        riskCode: 'PRIVATE_LAN_BLOCKED',
      };
    }
  }

  if (host.endsWith('.local') && !allowExplicitLanMediaServer) {
    return {
      allowed: false,
      normalizedUrl: null,
      reason: `Blocked mDNS LAN hostname (${host}) for untrusted addon requests.`,
      riskCode: 'PRIVATE_LAN_BLOCKED',
    };
  }

  if (requireHttps && scheme !== 'https:') {
    return {
      allowed: false,
      normalizedUrl: null,
      reason: 'Plaintext HTTP is blocked by default. Use HTTPS to prevent MITM tampering.',
      riskCode: 'INSECURE_HTTP',
    };
  }

  return {
    allowed: true,
    normalizedUrl: parsed.toString(),
    reason: 'Verified safe remote endpoint.',
  };
}

/**
 * Boolean convenience wrapper around `validateAddonOrStreamUrl` for backend proxy & FFmpeg pipelines.
 */
export function isSafePublicUrl(rawUrl: string, requireHttps = false): boolean {
  return validateAddonOrStreamUrl(rawUrl, {
    requireHttps,
    allowExplicitLanMediaServer: false,
  }).allowed;
}

/**
 * Masks a raw `scrypt$<saltHex>$<hashHex>` password hash before sending user summaries over HTTP
 * so raw cryptographic material is never exposed on the wire.
 */
export function maskScryptPasswordHash(rawHash: string): string {
  if (!rawHash) return '';
  const parts = rawHash.split('$');
  if (parts.length === 3 && parts[0] === 'scrypt') {
    const saltPreview = parts[1].slice(0, 8);
    return `scrypt$${saltPreview}…$REDACTED`;
  }
  return 'scrypt$REDACTED';
}

/**
 * Sliding-window brute-force rate limiter for authentication & password endpoints.
 */
export class SlidingWindowRateLimiter {
  private readonly buckets = new Map<string, number[]>();
  private readonly maxAttempts: number;
  private readonly windowMs: number;

  public constructor(maxAttempts = 5, windowMs = 60_000) {
    this.maxAttempts = maxAttempts;
    this.windowMs = windowMs;
  }

  public check(key: string, now = Date.now()): {
    allowed: boolean;
    retryAfterSec: number;
    remaining: number;
  } {
    const cutoff = now - this.windowMs;
    const existing = (this.buckets.get(key) || []).filter((ts) => ts > cutoff);
    if (existing.length === 0) {
      this.buckets.delete(key);
      return { allowed: true, retryAfterSec: 0, remaining: this.maxAttempts };
    }
    this.buckets.set(key, existing);
    if (existing.length >= this.maxAttempts) {
      const oldest = existing[0];
      const retryAfterSec = Math.max(1, Math.ceil((oldest + this.windowMs - now) / 1000));
      return { allowed: false, retryAfterSec, remaining: 0 };
    }
    return {
      allowed: true,
      retryAfterSec: 0,
      remaining: Math.max(0, this.maxAttempts - existing.length),
    };
  }

  public recordFailure(key: string, now = Date.now()): void {
    const cutoff = now - this.windowMs;
    const existing = (this.buckets.get(key) || []).filter((ts) => ts > cutoff);
    existing.push(now);
    this.buckets.set(key, existing);
  }

  public reset(key: string): void {
    this.buckets.delete(key);
  }

  public clearAll(): void {
    this.buckets.clear();
  }
}

/**
 * Remediates NuvioDesktop [VULN-006] (Path traversal in DownloadsPlatformDownloader.desktop.kt).
 */
export function sanitizeDownloadFilename(rawName: string): string {
  const withoutNulls = rawName.replace(/\0/g, '').trim();
  // Extract only the terminal basename after any forward or backward slashes
  const segments = withoutNulls.split(/[/\\]+/).filter(Boolean);
  const baseCandidate = segments.length > 0 ? segments[segments.length - 1] : 'streamz-media.mp4';

  // Remove traversal sequences, control chars, and unsafe shell/filesystem characters
  const cleaned = baseCandidate
    .replace(/\.\.+/g, '.')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/^[._-]+/, '');

  const reservedWindowsNames = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;
  if (!cleaned || reservedWindowsNames.test(cleaned)) {
    return 'streamz-media.mp4';
  }

  return cleaned.slice(0, 140);
}

export type ExternalPlayerKind = 'mpv' | 'vlc' | 'iina';

export interface SafeExternalPlayerLaunch {
  allowed: boolean;
  commandPreview: string;
  argv: string[];
  reason: string;
}

/**
 * Remediates NuvioDesktop [VULN-005] (ExternalPlayerPlatform file:// & rundll32 execution).
 * Never invokes OS shell handlers or allows file:// URIs; constructs an explicit argv array.
 */
export function buildSafeExternalPlayerCommand(
  player: ExternalPlayerKind,
  streamUrl: string,
  mediaTitle: string,
): SafeExternalPlayerLaunch {
  const validation = validateAddonOrStreamUrl(streamUrl, {
    requireHttps: false,
    allowExplicitLanMediaServer: false,
  });

  if (!validation.allowed || !validation.normalizedUrl) {
    return {
      allowed: false,
      commandPreview: '',
      argv: [],
      reason: validation.reason,
    };
  }

  const safeTitle = mediaTitle.replace(/["`$\\]/g, '').slice(0, 120);
  const url = validation.normalizedUrl;

  switch (player) {
    case 'mpv': {
      const argv = ['mpv', '--no-config', `--force-media-title=${safeTitle}`, '--', url];
      return {
        allowed: true,
        commandPreview: `mpv --no-config --force-media-title="${safeTitle}" -- "${url}"`,
        argv,
        reason: 'Constructed isolated mpv argv with --no-config and end-of-options delimiter.',
      };
    }
    case 'vlc': {
      const argv = ['vlc', `--meta-title=${safeTitle}`, '--', url];
      return {
        allowed: true,
        commandPreview: `vlc --meta-title="${safeTitle}" -- "${url}"`,
        argv,
        reason: 'Constructed isolated VLC argv with end-of-options delimiter.',
      };
    }
    case 'iina': {
      const argv = ['iina-cli', '--no-stdin', `--mpv-force-media-title=${safeTitle}`, '--', url];
      return {
        allowed: true,
        commandPreview: `iina-cli --no-stdin --mpv-force-media-title="${safeTitle}" -- "${url}"`,
        argv,
        reason: 'Constructed isolated IINA CLI argv.',
      };
    }
  }
}

/**
 * Remediates NuvioDesktop [VULN-003] (Unverified update downloads).
 * Computes and compares SHA-256 digest using WebCrypto SubtleCrypto.
 */
export async function verifyArtifactSha256(
  payload: Uint8Array | string,
  expectedSha256Hex: string,
): Promise<{ verified: boolean; actualHex: string }> {
  const bytes =
    typeof payload === 'string' ? new TextEncoder().encode(payload) : payload;
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const digestBuffer = await crypto.subtle.digest('SHA-256', copy.buffer);
  const actualHex = Array.from(new Uint8Array(digestBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const normalizedExpected = expectedSha256Hex.trim().toLowerCase();
  return {
    verified: actualHex === normalizedExpected,
    actualHex,
  };
}
