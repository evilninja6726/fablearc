import React from 'react';

interface PlatformLogoEmblemProps {
  serviceId: string;
  accentColor?: string;
  size?: 'sm' | 'md' | 'lg';
  title?: string;
}

/**
 * High-Contrast Distinguishable Platform Emblems (Commercial-Safe Original Vector Marks).
 * Designed following the `logo-design` skill principles:
 * - Distinct silhouette, background color fill, and iconic monogram/symbol per service
 * - Instantly recognizable at 28px–44px without looking uniform or repetitive
 */
export const PlatformLogoEmblem: React.FC<PlatformLogoEmblemProps> = ({
  serviceId,
  accentColor = '#E11D48',
  size = 'md',
  title,
}) => {
  const id = serviceId.toLowerCase();
  const px = size === 'sm' ? 28 : size === 'lg' ? 42 : 34;

  const renderEmblemSvg = () => {
    switch (id) {
      case 'all':
        return (
          <svg viewBox="0 0 40 40" width={px} height={px} aria-label={title || 'All Platforms'}>
            <circle cx="20" cy="20" r="19" fill="#12151E" stroke="rgba(255,255,255,0.22)" strokeWidth="1.5" />
            <rect x="10.5" y="10.5" width="8" height="8" rx="2" fill="#E11D48" />
            <rect x="21.5" y="10.5" width="8" height="8" rx="2" fill="#3B82F6" />
            <rect x="10.5" y="21.5" width="8" height="8" rx="2" fill="#10B981" />
            <rect x="21.5" y="21.5" width="8" height="8" rx="2" fill="#F59E0B" />
          </svg>
        );

      case 'nfx':
      case 'nfk':
        // Distinct Obsidian + Vivid Crimson Folded 'N' Ribbon
        return (
          <svg viewBox="0 0 40 40" width={px} height={px} aria-label={title || 'NFX'}>
            <circle cx="20" cy="20" r="19" fill="#0A0507" stroke="#E50914" strokeWidth="2" />
            <path d="M13 10.5h4.2v19H13z" fill="#B20710" />
            <path d="M22.8 10.5H27v19h-4.2z" fill="#B20710" />
            <path d="M13 10.5h4.3l9.7 19h-4.3z" fill="#FF1F2D" />
          </svg>
        );

      case 'hbm':
        // Solid Royal Electric Violet Badge with Bold White 'MAX' Portal
        return (
          <svg viewBox="0 0 40 40" width={px} height={px} aria-label={title || 'MAX'}>
            <defs>
              <linearGradient id="em-hbm" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#6D28D9" />
                <stop offset="100%" stopColor="#2E1065" />
              </linearGradient>
            </defs>
            <circle cx="20" cy="20" r="19" fill="url(#em-hbm)" stroke="#A78BFA" strokeWidth="1.8" />
            <text
              x="20"
              y="24"
              textAnchor="middle"
              fill="#FFFFFF"
              fontFamily="Plus Jakarta Sans, Inter, sans-serif"
              fontWeight="800"
              fontSize="11.5"
              letterSpacing="-0.4"
            >
              max
            </text>
            <circle cx="20" cy="12" r="2" fill="#DDD6FE" />
          </svg>
        );

      case 'dnp':
        // Deep Sapphire Royal Blue Badge + Shooting Star Arc + 'D+'
        return (
          <svg viewBox="0 0 40 40" width={px} height={px} aria-label={title || 'D+'}>
            <defs>
              <linearGradient id="em-dnp" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#0052D4" />
                <stop offset="100%" stopColor="#04153B" />
              </linearGradient>
            </defs>
            <circle cx="20" cy="20" r="19" fill="url(#em-dnp)" stroke="#38BDF8" strokeWidth="1.8" />
            <path
              d="M9.5 17.5c4.5-6.5 14.5-7 20.5-1"
              fill="none"
              stroke="#7DD3FC"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <text
              x="20"
              y="26.5"
              textAnchor="middle"
              fill="#FFFFFF"
              fontFamily="Plus Jakarta Sans, Inter, sans-serif"
              fontWeight="800"
              fontSize="13"
            >
              D+
            </text>
          </svg>
        );

      case 'amp':
        // Solid Cerulean Cyan Badge + Smile Curve Arrow + 'PV'
        return (
          <svg viewBox="0 0 40 40" width={px} height={px} aria-label={title || 'Prime'}>
            <circle cx="20" cy="20" r="19" fill="#00A8E1" stroke="#BAE6FD" strokeWidth="1.8" />
            <text
              x="20"
              y="21.5"
              textAnchor="middle"
              fill="#041019"
              fontFamily="Plus Jakarta Sans, Inter, sans-serif"
              fontWeight="800"
              fontSize="9.5"
              letterSpacing="0.3"
            >
              PRIME
            </text>
            <path
              d="M11.5 26.5c5 3.6 12 3.6 17 0"
              fill="none"
              stroke="#041019"
              strokeWidth="2.4"
              strokeLinecap="round"
            />
            <path d="M26.5 24.8l2.5 1.7-1.2 2.6" fill="none" stroke="#041019" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        );

      case 'atp':
        // High-Contrast Pure Titanium White Badge with Obsidian 'tv+'
        return (
          <svg viewBox="0 0 40 40" width={px} height={px} aria-label={title || 'TV+'}>
            <circle cx="20" cy="20" r="19" fill="#F1F5F9" stroke="#94A3B8" strokeWidth="1.8" />
            <text
              x="20"
              y="24.5"
              textAnchor="middle"
              fill="#090A0F"
              fontFamily="Plus Jakarta Sans, Inter, sans-serif"
              fontWeight="800"
              fontSize="13.5"
              letterSpacing="-0.5"
            >
              tv+
            </text>
          </svg>
        );

      case 'pmp':
        // Cobalt Peak Badge with Snow Summit & Star Halo
        return (
          <svg viewBox="0 0 40 40" width={px} height={px} aria-label={title || 'P+'}>
            <circle cx="20" cy="20" r="19" fill="#0051CC" stroke="#93C5FD" strokeWidth="1.8" />
            <path d="M10.5 28L20 12.5 29.5 28H10.5z" fill="#FFFFFF" />
            <path d="M15.5 28L20 20.5 24.5 28H15.5z" fill="#0051CC" />
            <circle cx="14" cy="13" r="1.2" fill="#DBEAFE" />
            <circle cx="20" cy="10" r="1.3" fill="#DBEAFE" />
            <circle cx="26" cy="13" r="1.2" fill="#DBEAFE" />
          </svg>
        );

      case 'pcp':
        // Obsidian Badge with 6 Vivid Spectrum Bars
        return (
          <svg viewBox="0 0 40 40" width={px} height={px} aria-label={title || 'PCP'}>
            <circle cx="20" cy="20" r="19" fill="#0F1117" stroke="#F59E0B" strokeWidth="1.8" />
            <rect x="9.5" y="14" width="2.8" height="12" rx="1.4" fill="#FACC15" />
            <rect x="13.3" y="12" width="2.8" height="16" rx="1.4" fill="#F97316" />
            <rect x="17.1" y="11" width="2.8" height="18" rx="1.4" fill="#EF4444" />
            <rect x="20.9" y="11" width="2.8" height="18" rx="1.4" fill="#A855F7" />
            <rect x="24.7" y="12" width="2.8" height="16" rx="1.4" fill="#3B82F6" />
            <rect x="28.5" y="14" width="2.8" height="12" rx="1.4" fill="#10B981" />
          </svg>
        );

      case 'hlu':
        // Solid Vivid Neon Green Badge with Obsidian 'hulu'
        return (
          <svg viewBox="0 0 40 40" width={px} height={px} aria-label={title || 'HULU'}>
            <circle cx="20" cy="20" r="19" fill="#1CE783" stroke="#A7F3D0" strokeWidth="1.8" />
            <text
              x="20"
              y="23.5"
              textAnchor="middle"
              fill="#05130B"
              fontFamily="Plus Jakarta Sans, Inter, sans-serif"
              fontWeight="900"
              fontSize="10.5"
              letterSpacing="-0.3"
            >
              HULU
            </text>
          </svg>
        );

      case 'cru':
        // Solid Anime Orange Badge with White Swirl Eye
        return (
          <svg viewBox="0 0 40 40" width={px} height={px} aria-label={title || 'CR'}>
            <circle cx="20" cy="20" r="19" fill="#F47521" stroke="#FED7AA" strokeWidth="1.8" />
            <path
              d="M28.5 20a8.5 8.5 0 1 1-4.2-7.4"
              fill="none"
              stroke="#FFFFFF"
              strokeWidth="3.2"
              strokeLinecap="round"
            />
            <circle cx="21.5" cy="20.5" r="4" fill="#FFFFFF" />
          </svg>
        );

      case 'jhs':
        // Gold-on-Navy Starburst Badge ('HOT★')
        return (
          <svg viewBox="0 0 40 40" width={px} height={px} aria-label={title || 'JHS'}>
            <circle cx="20" cy="20" r="19" fill="#09152E" stroke="#F59E0B" strokeWidth="1.8" />
            <path
              d="M20 9.5l2.7 7.3 7.8 2.7-7.8 2.7L20 29.5l-2.7-7.3-7.8-2.7 7.8-2.7L20 9.5z"
              fill="#FBBF24"
            />
          </svg>
        );

      case 'zee':
        // Magenta-Purple Badge with 'Z5' Monogram
        return (
          <svg viewBox="0 0 40 40" width={px} height={px} aria-label={title || 'Z5'}>
            <circle cx="20" cy="20" r="19" fill="#7E22CE" stroke="#F0ABFC" strokeWidth="1.8" />
            <text
              x="20"
              y="24.5"
              textAnchor="middle"
              fill="#FFFFFF"
              fontFamily="Plus Jakarta Sans, Inter, sans-serif"
              fontWeight="800"
              fontSize="13"
            >
              Z5
            </text>
          </svg>
        );

      case 'sonyliv':
        // Warm Sunset Orange-Red Badge with 'LIV'
        return (
          <svg viewBox="0 0 40 40" width={px} height={px} aria-label={title || 'LIV'}>
            <circle cx="20" cy="20" r="19" fill="#EA580C" stroke="#FDBA74" strokeWidth="1.8" />
            <text
              x="20"
              y="24"
              textAnchor="middle"
              fill="#FFFFFF"
              fontFamily="Plus Jakarta Sans, Inter, sans-serif"
              fontWeight="800"
              fontSize="11.5"
              letterSpacing="0.4"
            >
              LIV
            </text>
          </svg>
        );

      case 'mbi':
        // Bauhaus Royal Blue Badge with 'MUBI' Dots
        return (
          <svg viewBox="0 0 40 40" width={px} height={px} aria-label={title || 'MUBI'}>
            <circle cx="20" cy="20" r="19" fill="#0044CC" stroke="#93C5FD" strokeWidth="1.8" />
            <circle cx="13" cy="16" r="2.8" fill="#FFFFFF" />
            <circle cx="20" cy="20" r="3.2" fill="#FFFFFF" />
            <circle cx="27" cy="16" r="2.8" fill="#FFFFFF" />
            <circle cx="15.5" cy="26" r="2.8" fill="#93C5FD" />
            <circle cx="24.5" cy="26" r="2.8" fill="#93C5FD" />
          </svg>
        );

      default: {
        // Distinct Color-Coded Monogram Badge for all additional global platforms
        const code = (title || serviceId).slice(0, 3).toUpperCase();
        return (
          <svg viewBox="0 0 40 40" width={px} height={px} aria-label={title || serviceId}>
            <circle cx="20" cy="20" r="19" fill="#131722" stroke={accentColor} strokeWidth="2.2" />
            <circle cx="20" cy="20" r="15" fill={accentColor} fillOpacity="0.22" />
            <text
              x="20"
              y="23.5"
              textAnchor="middle"
              fill="#FFFFFF"
              fontFamily="Plus Jakarta Sans, Inter, sans-serif"
              fontWeight="800"
              fontSize="10"
              letterSpacing="0.4"
            >
              {code}
            </text>
          </svg>
        );
      }
    }
  };

  return (
    <span className={`platform-emblem-wrap circular-medallion size-${size}`} title={title}>
      {renderEmblemSvg()}
    </span>
  );
};

/**
 * Official FABLEARC Architectural Brand Mark.
 * Designed following the `logo-design` skill:
 * - Midnight Navy squircle chassis (#071130 -> #04081C) with subtle electric cyan rim
 * - Curved 3D film-strip 'F' stem with 3 film sprocket perforations & bottom ribbon fold
 * - Luminous Electric Aqua-Mint sweeping top wing + center rounded Play Triangle
 */
export const PopcornBrandLogo: React.FC = () => (
  <svg
    viewBox="0 0 64 64"
    width={38}
    height={38}
    className="popcorn-brand-svg"
    aria-label="FABLEARC"
  >
    <defs>
      <linearGradient id="fa-brand-bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#071130" />
        <stop offset="100%" stopColor="#04081C" />
      </linearGradient>
      <linearGradient id="fa-brand-fold" x1="0%" y1="20%" x2="100%" y2="90%">
        <stop offset="0%" stopColor="#031634" />
        <stop offset="55%" stopColor="#035388" />
        <stop offset="100%" stopColor="#00B4D8" />
      </linearGradient>
      <linearGradient id="fa-brand-stem" x1="30%" y1="0%" x2="50%" y2="100%">
        <stop offset="0%" stopColor="#063262" />
        <stop offset="45%" stopColor="#00B4D8" />
        <stop offset="100%" stopColor="#00F0FF" />
      </linearGradient>
      <linearGradient id="fa-brand-wing" x1="0%" y1="80%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="#00B4D8" />
        <stop offset="45%" stopColor="#00E5FF" />
        <stop offset="100%" stopColor="#00FFC6" />
      </linearGradient>
      <linearGradient id="fa-brand-play" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#00E5FF" />
        <stop offset="100%" stopColor="#00FFC6" />
      </linearGradient>
    </defs>

    {/* Midnight Navy Squircle Studio Chassis */}
    <rect
      x="2"
      y="2"
      width="60"
      height="60"
      rx="15"
      fill="url(#fa-brand-bg)"
      stroke="rgba(0, 229, 255, 0.3)"
      strokeWidth="1.5"
    />

    {/* Bottom-Right 3D Folded Ribbon Shadow */}
    <path
      d="M 26.5 34.5 C 31 38.5 36.8 42.5 42.5 46 C 39.2 50.2 34 52.5 28.2 52.5 C 25.8 52.5 25 49.5 25 45 Z"
      fill="url(#fa-brand-fold)"
    />

    {/* Vertical Film-Strip Stem with 3 Film Perforations */}
    <path
      fillRule="evenodd"
      d="M 16 31.5 C 17.5 24 22 19.5 27.5 19.5 L 27.5 47.5 C 27.5 50.5 28.4 52.5 30 52.5 C 21.8 52.5 16 47.2 16 39.5 Z
         M 18.4 26.2 H 21.6 C 22.1 26.2 22.5 26.6 22.5 27.1 V 29.9 C 22.5 30.4 22.1 30.8 21.6 30.8 H 18.4 C 17.9 30.8 17.5 30.4 17.5 29.9 V 27.1 C 17.5 26.6 17.9 26.2 18.4 26.2 Z
         M 18.4 33.4 H 21.6 C 22.1 33.4 22.5 33.8 22.5 34.3 V 37.1 C 22.5 37.6 22.1 38 21.6 38 H 18.4 C 17.9 38 17.5 37.6 17.5 37.1 V 34.3 C 17.5 33.8 17.9 33.4 18.4 33.4 Z
         M 18.4 40.6 H 21.6 C 22.1 40.6 22.5 41 22.5 41.5 V 44.3 C 22.5 44.8 22.1 45.2 21.6 45.2 H 18.4 C 17.9 45.2 17.5 44.8 17.5 44.3 V 41.5 C 17.5 41 17.9 40.6 18.4 40.6 Z"
      fill="url(#fa-brand-stem)"
    />

    {/* Upper Sweeping Aqua-Mint 'F' Wing */}
    <path
      d="M 16 32.5 C 16 19.2 23.8 11.5 36 11.5 L 50.5 11.5 C 48 17.2 43.5 20.2 37.2 20.2 L 30.2 20.2 C 23 20.2 18 24.8 16 32.5 Z"
      fill="url(#fa-brand-wing)"
    />

    {/* Center Rounded Aqua Play Triangle */}
    <path
      d="M 31.2 25.4 C 31.2 24.1 32.6 23.3 33.7 24 L 41.5 29 C 42.5 29.7 42.5 31.1 41.5 31.8 L 33.7 36.8 C 32.6 37.5 31.2 36.7 31.2 35.4 Z"
      fill="url(#fa-brand-play)"
    />
  </svg>
);

export interface AddonSvgEmblemProps {
  addonId: string;
  addonName: string;
  size?: number;
}

const ADDON_PALETTES: Array<{ bgStart: string; bgEnd: string; stroke: string; accent: string }> = [
  { bgStart: '#31102F', bgEnd: '#0F0714', stroke: '#F43F5E', accent: '#FDA4AF' },
  { bgStart: '#0B2545', bgEnd: '#06101E', stroke: '#38BDF8', accent: '#BAE6FD' },
  { bgStart: '#062E22', bgEnd: '#04140F', stroke: '#10B981', accent: '#A7F3D0' },
  { bgStart: '#2E1A05', bgEnd: '#140B02', stroke: '#F59E0B', accent: '#FDE68A' },
  { bgStart: '#231442', bgEnd: '#0B0617', stroke: '#A855F7', accent: '#E9D5FF' },
  { bgStart: '#0F293A', bgEnd: '#061118', stroke: '#06B6D4', accent: '#A5F3FC' },
  { bgStart: '#2D121E', bgEnd: '#12060B', stroke: '#EC4899', accent: '#FBCFE8' },
  { bgStart: '#182611', bgEnd: '#090F06', stroke: '#84CC16', accent: '#D9F99D' },
];

function extractAddonMonogram(name: string, id: string): string {
  const cleaned = (name || id).replace(/[^a-zA-Z0-9\s]/g, ' ').trim();
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return `${words[0][0]}${words[1][0]}`.toUpperCase();
  }
  if (words.length === 1 && words[0].length >= 2) {
    return words[0].slice(0, 3).toUpperCase();
  }
  return 'ADD';
}

/**
 * 100% Original Code-Generated SVG Addon Emblem (Fair & Safe for Commercial Use).
 * Used for both pre-installed/default addons and suggested Community Directory addons
 * so zero third-party copyrighted image URLs are ever rendered.
 */
export const AddonSvgEmblem: React.FC<AddonSvgEmblemProps> = ({
  addonId,
  addonName,
  size = 38,
}) => {
  const combined = `${addonId} ${addonName}`.toLowerCase();

  let hash = 0;
  for (let i = 0; i < combined.length; i++) {
    hash = (hash * 31 + combined.charCodeAt(i)) >>> 0;
  }
  const palette = ADDON_PALETTES[hash % ADDON_PALETTES.length];
  const gradId = `addon-svg-${(hash % 99999).toString(36)}`;
  const monogram = extractAddonMonogram(addonName, addonId);

  // Bespoke vector artwork for core & popular addon families
  const renderCustomSymbol = () => {
    if (combined.includes('aiometadata') || combined.includes('metadata') || combined.includes('tmdb')) {
      // Constellation Prism / Metadata Matrix
      return (
        <>
          <polygon
            points="20,7 31,13.5 31,26.5 20,33 9,26.5 9,13.5"
            fill="none"
            stroke="#38BDF8"
            strokeWidth="1.8"
          />
          <circle cx="20" cy="13" r="2.2" fill="#BAE6FD" />
          <circle cx="14" cy="24" r="2.2" fill="#38BDF8" />
          <circle cx="26" cy="24" r="2.2" fill="#38BDF8" />
          <path d="M20 13L14 24H26L20 13Z" fill="rgba(56,189,248,0.25)" stroke="#7DD3FC" strokeWidth="1.3" />
        </>
      );
    }

    if (combined.includes('webstreamr') || combined.includes('stream')) {
      // Signal Broadcast Wave + Play Core
      return (
        <>
          <circle cx="20" cy="20" r="11.5" fill="none" stroke="#10B981" strokeWidth="1.5" strokeDasharray="4 2.5" />
          <polygon points="17,14.5 17,25.5 26.5,20" fill="#A7F3D0" />
        </>
      );
    }

    if (combined.includes('pengu')) {
      // Arctic Diamond Crest + 'PG'
      return (
        <>
          <path d="M20 7.5L31.5 20L20 32.5L8.5 20Z" fill="rgba(168,85,247,0.22)" stroke="#C084FC" strokeWidth="1.8" />
          <text
            x="20"
            y="23.5"
            textAnchor="middle"
            fill="#FFFFFF"
            fontFamily="Plus Jakarta Sans, Inter, sans-serif"
            fontWeight="800"
            fontSize="10.5"
          >
            PG
          </text>
        </>
      );
    }

    if (combined.includes('111477')) {
      // Vault Numeric Monogram Badge
      return (
        <>
          <rect x="9" y="11" width="22" height="18" rx="4" fill="rgba(245,158,11,0.18)" stroke="#FBBF24" strokeWidth="1.6" />
          <text
            x="20"
            y="23.5"
            textAnchor="middle"
            fill="#FEF08A"
            fontFamily="JetBrains Mono, monospace"
            fontWeight="800"
            fontSize="10"
          >
            111
          </text>
        </>
      );
    }

    if (combined.includes('hdhub') || combined.includes('4k') || combined.includes('uhd')) {
      // Ultra-HD Widescreen Lens Emblem
      return (
        <>
          <rect x="8.5" y="11.5" width="23" height="17" rx="3.5" fill="rgba(244,63,94,0.2)" stroke="#FB7185" strokeWidth="1.6" />
          <text
            x="20"
            y="23.5"
            textAnchor="middle"
            fill="#FFFFFF"
            fontFamily="Plus Jakarta Sans, Inter, sans-serif"
            fontWeight="800"
            fontSize="9.5"
          >
            HD
          </text>
        </>
      );
    }

    if (combined.includes('subtitle') || combined.includes('opensub')) {
      // Closed-Caption Speech Frame ('CC')
      return (
        <>
          <rect x="8.5" y="11" width="23" height="16" rx="4" fill="rgba(6,182,212,0.2)" stroke="#22D3EE" strokeWidth="1.7" />
          <line x1="13" y1="17" x2="27" y2="17" stroke="#CFFAFE" strokeWidth="2" strokeLinecap="round" />
          <line x1="13" y1="22" x2="22" y2="22" stroke="#67E8F9" strokeWidth="2" strokeLinecap="round" />
        </>
      );
    }

    if (combined.includes('cinemeta')) {
      // Classic Cinema Aperture Reel
      return (
        <>
          <circle cx="20" cy="20" r="11" fill="rgba(225,29,72,0.2)" stroke="#FB7185" strokeWidth="1.7" />
          <circle cx="20" cy="14" r="1.8" fill="#FFE4E6" />
          <circle cx="14.5" cy="22.5" r="1.8" fill="#FFE4E6" />
          <circle cx="25.5" cy="22.5" r="1.8" fill="#FFE4E6" />
        </>
      );
    }

    // Procedural geometric vector crest + monogram for any community / suggested addon
    const shapeVariant = hash % 3;
    return (
      <>
        {shapeVariant === 0 && (
          <circle
            cx="20"
            cy="20"
            r="13.5"
            fill={palette.stroke}
            fillOpacity="0.16"
            stroke={palette.stroke}
            strokeWidth="1.4"
          />
        )}
        {shapeVariant === 1 && (
          <polygon
            points="20,6.5 32,13.2 32,26.8 20,33.5 8,26.8 8,13.2"
            fill={palette.stroke}
            fillOpacity="0.16"
            stroke={palette.stroke}
            strokeWidth="1.4"
          />
        )}
        {shapeVariant === 2 && (
          <rect
            x="8.5"
            y="8.5"
            width="23"
            height="23"
            rx="6"
            fill={palette.stroke}
            fillOpacity="0.16"
            stroke={palette.stroke}
            strokeWidth="1.4"
          />
        )}
        <text
          x="20"
          y="23.5"
          textAnchor="middle"
          fill={palette.accent}
          fontFamily="Plus Jakarta Sans, Inter, sans-serif"
          fontWeight="800"
          fontSize={monogram.length >= 3 ? '9.2' : '11'}
          letterSpacing="0.4"
        >
          {monogram}
        </text>
      </>
    );
  };

  return (
    <span
      className="addon-svg-emblem-wrap"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        flexShrink: 0,
      }}
      title={addonName}
    >
      <svg viewBox="0 0 40 40" width={size} height={size} aria-label={addonName}>
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={palette.bgStart} />
            <stop offset="100%" stopColor={palette.bgEnd} />
          </linearGradient>
        </defs>
        <rect
          x="2"
          y="2"
          width="36"
          height="36"
          rx="10"
          fill={`url(#${gradId})`}
          stroke={palette.stroke}
          strokeWidth="1.5"
        />
        {renderCustomSymbol()}
      </svg>
    </span>
  );
};
