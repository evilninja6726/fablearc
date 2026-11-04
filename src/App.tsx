import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bookmark,
  BookmarkCheck,
  Check,
  ChevronLeft,
  ChevronRight,
  Clapperboard,
  Compass,
  ExternalLink,
  Film,
  Flame,
  Globe,
  KeyRound,
  Layers,
  LogOut,
  Moon,
  Pause,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Star,
  Sun,
  Trash2,
  Tv,
  UserCheck,
  X,
} from 'lucide-react';
import {
  addonSupportsResource,
  applyCachedServerHealth,
  buildApiUrl,
  buildStreamingCatalogsManifestUrl,
  CommunityAddonDirectoryEntry,
  DEFAULT_BOOTSTRAP_MANIFEST_URLS,
  fetchAddonCatalog,
  fetchCommunityAddonsDirectory,
  fetchMetaFromAddons,
  fetchStreamsFromAddons,
  fetchStremioManifest,
  getStreamProviderCategory,
  InstalledAddon,
  isUnreachableOrSlowStream,
  parseStreamingCatalogsConfig,
  pingStreamBatch,
  prefetchStreamsForMedia,
  rankStreamsByResponsiveness,
  sortStreamsByDecreasingQuality,
  STREAMING_CATALOG_COUNTRIES,
  STREAMING_CATALOG_SERVICES,
  StreamingCatalogsConfig,
  StremioEpisodeVideo,
  StremioMediaItem,
  StremioStreamItem,
  stripDiscordText,
  upgradeLegacyDefaultAddonUrl,
} from './addons/stremioProtocol';
import {
  CinemaPlayerModal,
  WatchProgressEntry,
} from './components/CinemaPlayerModal';
import {
  AddonSvgEmblem,
  PlatformLogoEmblem,
  PopcornBrandLogo,
} from './components/PlatformLogoEmblem';
import { AuthGatePage } from './components/AuthGatePage';
import {
  AdminDashboardView,
  ChangePasswordModal,
} from './components/AdminDashboardView';
import type { DbUserProfile, UserStatePayload } from './server/streamzDb';

type NavSection = 'discover' | 'movies' | 'series' | 'library' | 'addons' | 'admin';

interface CatalogShelfData {
  key: string;
  addonId: string;
  addonName: string;
  manifestUrl: string;
  catalogId: string;
  catalogName: string;
  mediaType: string;
  genreQuery?: string;
  items: StremioMediaItem[];
  loading: boolean;
  loadingMore?: boolean;
  hasMore?: boolean;
  error?: string;
}

const ALPHABETICAL_GENRES: string[] = [
  'Action',
  'Adventure',
  'Animation',
  'Biography',
  'Comedy',
  'Crime',
  'Documentary',
  'Drama',
  'Family',
  'Fantasy',
  'History',
  'Horror',
  'Mystery',
  'Romance',
  'Sci-Fi',
  'Thriller',
];

const LIBRARY_STORAGE_KEY = 'streamz_library_items_v3';
const PROGRESS_STORAGE_KEY = 'streamz_progress_v3';
const ADDONS_STORAGE_KEY = 'streamz_addons_v3';
const AUTH_TOKEN_STORAGE_KEY = 'streamz_auth_token_v1';
const THEME_STORAGE_KEY = 'streamz_theme_v1';

interface PosterCardProps {
  item: StremioMediaItem;
  rankIndex?: number;
  inLibrary: boolean;
  onPlay: (item: StremioMediaItem) => void;
  onOpenDossier: (item: StremioMediaItem) => void;
  onToggleLibrary: (item: StremioMediaItem) => void;
}

let latestAddonsForHoverPrefetch: InstalledAddon[] = [];

const PosterCard: React.FC<PosterCardProps> = React.memo(({
  item,
  rankIndex,
  inLibrary,
  onPlay,
  onOpenDossier,
  onToggleLibrary,
}) => {
  const [imgFailed, setImgFailed] = useState(false);
  const hoverTimerRef = useRef<number | null>(null);

  const handleMouseEnter = () => {
    if (hoverTimerRef.current !== null) {
      window.clearTimeout(hoverTimerRef.current);
    }
    hoverTimerRef.current = window.setTimeout(() => {
      hoverTimerRef.current = null;
      if (latestAddonsForHoverPrefetch.length > 0) {
        prefetchStreamsForMedia(latestAddonsForHoverPrefetch, item);
      }
    }, 260);
  };

  const handleMouseLeave = () => {
    if (hoverTimerRef.current !== null) {
      window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      if (hoverTimerRef.current !== null) {
        window.clearTimeout(hoverTimerRef.current);
      }
    };
  }, []);

  return (
    <article
      className="poster-card"
      onClick={() => onOpenDossier(item)}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className="poster-image-wrap">
        {item.poster && !imgFailed ? (
          <img
            src={item.poster}
            alt={item.name}
            loading="lazy"
            decoding="async"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <div className="poster-fallback-art">
            <Clapperboard size={28} />
            <span>{item.name}</span>
          </div>
        )}

        {typeof rankIndex === 'number' && rankIndex < 10 && (
          <span className="poster-rank-watermark mono">
            {String(rankIndex + 1).padStart(2, '0')}
          </span>
        )}

        <div className="poster-top-badges">
          <span className={`poster-type-pill ${item.type === 'series' ? 'series' : 'movie'}`}>
            {item.type === 'series' ? 'SERIES' : 'MOVIE'}
          </span>
          {item.imdbRating && (
            <span className="poster-rating-pill mono">
              <Star size={10} fill="currentColor" /> {item.imdbRating}
            </span>
          )}
        </div>

        <div className="poster-hover-actions">
          <button
            type="button"
            className="poster-play-orb"
            onClick={(e) => {
              e.stopPropagation();
              onOpenDossier(item);
            }}
            title={`View details & play ${item.name}`}
          >
            <Play size={20} fill="currentColor" />
          </button>
          <div className="poster-hover-bottom-btns">
            <button
              type="button"
              className="poster-mini-btn"
              onClick={(e) => {
                e.stopPropagation();
                onOpenDossier(item);
              }}
            >
              Details &amp; Play
            </button>
            <button
              type="button"
              className={`poster-mini-btn icon-only ${inLibrary ? 'saved' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                onToggleLibrary(item);
              }}
              title={inLibrary ? 'Remove from Watchlist' : 'Add to Watchlist'}
            >
              {inLibrary ? <BookmarkCheck size={14} /> : <Plus size={14} />}
            </button>
          </div>
        </div>
      </div>

      <div className="poster-meta">
        <h3 className="poster-title" title={item.name}>
          {item.name}
        </h3>
        <p className="poster-subline">
          {item.releaseInfo || item.year || item.type.toUpperCase()}
          {item.genres.length > 0 ? ` · ${item.genres.slice(0, 2).join(', ')}` : ''}
        </p>
      </div>
    </article>
  );
});

interface HorizontalShelfRowProps {
  shelf: CatalogShelfData;
  showRanks?: boolean;
  isInLibrary: (id: string) => boolean;
  onPlay: (item: StremioMediaItem) => void;
  onOpenDossier: (item: StremioMediaItem) => void;
  onToggleLibrary: (item: StremioMediaItem) => void;
  onConfigureServices?: () => void;
  onLoadMore?: (shelf: CatalogShelfData) => void;
}

const HorizontalShelfRow: React.FC<HorizontalShelfRowProps> = React.memo(({
  shelf,
  showRanks = false,
  isInLibrary,
  onPlay,
  onOpenDossier,
  onToggleLibrary,
  onConfigureServices,
  onLoadMore,
}) => {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const serviceMeta = STREAMING_CATALOG_SERVICES.find((s) => s.id === shelf.catalogId);

  const checkAndTriggerInfiniteScroll = useCallback(
    (el: HTMLDivElement) => {
      if (!onLoadMore || shelf.loadingMore || shelf.hasMore === false) return;
      const remainingRight = el.scrollWidth - el.scrollLeft - el.clientWidth;
      if (remainingRight < 750) {
        onLoadMore(shelf);
      }
    },
    [onLoadMore, shelf],
  );

  const scrollTrack = (direction: 'left' | 'right') => {
    const el = trackRef.current;
    if (!el) return;
    const distance = Math.max(460, Math.floor(el.clientWidth * 0.8));
    el.scrollBy({
      left: direction === 'left' ? -distance : distance,
      behavior: 'smooth',
    });
    if (direction === 'right') {
      window.setTimeout(() => {
        if (trackRef.current) {
          checkAndTriggerInfiniteScroll(trackRef.current);
        }
      }, 260);
    }
  };

  return (
    <section className="catalog-shelf">
      <div className="shelf-header">
        <div className="shelf-title-group">
          {serviceMeta ? (
            <h2>
              {shelf.mediaType === 'series' ? 'Featured Series' : 'Featured Movies'}
            </h2>
          ) : (
            <h2>{shelf.catalogName}</h2>
          )}
          <span className="shelf-subtitle mono">
            {shelf.items.length} TITLES · {shelf.mediaType.toUpperCase()}
          </span>
        </div>
        <div className="shelf-controls">
          {/* Platform customization button commented out (kept for future re-enabling):
          {shelf.addonId === 'pw.ers.netflix-catalog' && onConfigureServices && (
            <button
              type="button"
              className="mini-refresh-btn"
              onClick={onConfigureServices}
            >
              <SlidersHorizontal size={12} />
              <span>Customize</span>
            </button>
          )}
          */}
          <div className="carousel-nav-btns">
            <button
              type="button"
              className="carousel-arrow-btn"
              onClick={() => scrollTrack('left')}
              aria-label="Scroll left"
            >
              <ChevronLeft size={17} />
            </button>
            <button
              type="button"
              className="carousel-arrow-btn"
              onClick={() => scrollTrack('right')}
              aria-label="Scroll right"
            >
              <ChevronRight size={17} />
            </button>
          </div>
        </div>
      </div>

      <div
        className="horizontal-poster-track"
        ref={trackRef}
        onScroll={(e) => checkAndTriggerInfiniteScroll(e.currentTarget)}
      >
        {shelf.items.map((item, idx) => (
          <PosterCard
            key={`${shelf.key}-${item.id}`}
            item={item}
            rankIndex={showRanks ? idx : undefined}
            inLibrary={isInLibrary(item.id)}
            onPlay={onPlay}
            onOpenDossier={onOpenDossier}
            onToggleLibrary={onToggleLibrary}
          />
        ))}
        {shelf.loadingMore && (
          <div className="shelf-infinite-loader-tile mono">
            <RefreshCw size={18} className="spin-icon" />
            <span>Loading more…</span>
          </div>
        )}
      </div>
    </section>
  );
});

export const App: React.FC = () => {
  const [activeNav, setActiveNav] = useState<NavSection>('discover');
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedServiceFilter, setSelectedServiceFilter] = useState<string>('all');
  const [selectedGenre, setSelectedGenre] = useState<string>('All');

  // Dark / Light Theme State (persisted & synced with document root [data-theme])
  const [themeMode, setThemeMode] = useState<'dark' | 'light'>(() => {
    try {
      const saved = localStorage.getItem(THEME_STORAGE_KEY);
      if (saved === 'light' || saved === 'dark') return saved;
    } catch {}
    return 'dark';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', themeMode);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, themeMode);
    } catch {}
  }, [themeMode]);

  const toggleThemeMode = useCallback(() => {
    setThemeMode((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  // Authenticated User State (backed by SQLite WAL database)
  const [authToken, setAuthToken] = useState<string | null>(() => {
    try {
      return localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
    } catch {
      return null;
    }
  });
  const [currentUser, setCurrentUser] = useState<DbUserProfile | null>(null);
  const [changePasswordModalOpen, setChangePasswordModalOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);
  // New visitors start on Discover page; navigating to any other page or performing any action opens the non-bypassable Login Popup
  const [authModalOpen, setAuthModalOpen] = useState<boolean>(false);
  const [authTamperKey, setAuthTamperKey] = useState<number>(0);
  const [viewportWidth, setViewportWidth] = useState<number>(() =>
    typeof window !== 'undefined' ? window.innerWidth : 1280,
  );
  const [userToastCard, setUserToastCard] = useState<{
    kind: 'success' | 'error';
    text: string;
  } | null>(null);

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', onResize, { passive: true });
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (!profileMenuOpen) return;
    const handlePointerDown = (ev: MouseEvent | TouchEvent) => {
      if (
        profileMenuRef.current &&
        !profileMenuRef.current.contains(ev.target as Node)
      ) {
        setProfileMenuOpen(false);
      }
    };
    const handleKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        setProfileMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown, { passive: true });
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [profileMenuOpen]);

  useEffect(() => {
    if (!userToastCard) return;
    const timer = window.setTimeout(() => {
      setUserToastCard(null);
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [userToastCard]);

  // Installed addons (populated dynamically from live Stremio endpoints, with all 7 requested default addons)
  const [addons, setAddons] = useState<InstalledAddon[]>(() => {
    try {
      const savedV3 = localStorage.getItem(ADDONS_STORAGE_KEY);
      const savedV2 = localStorage.getItem('streamz_addons_v2');
      const raw = savedV3 || savedV2;
      if (raw) {
        const parsed = JSON.parse(raw) as InstalledAddon[];
        const cleaned = parsed
          .filter(
            (a) =>
              a &&
              typeof a.manifestUrl === 'string' &&
              !a.manifestUrl.includes('streamz.local-builtin') &&
              !a.manifestUrl.includes('stremio-addons.net/manifest.json') &&
              !a.manifestUrl.includes('torrentio.strem.fun') &&
              a.manifest &&
              typeof a.manifest.id === 'string' &&
              a.manifest.id !== 'com.stremio.torrentio.addon' &&
              // Streaming Catalogs addon disabled/commented out for now:
              a.manifest.id !== 'pw.ers.netflix-catalog',
          )
          .map((a) => ({
            ...a,
            manifestUrl: upgradeLegacyDefaultAddonUrl(a.manifestUrl),
          }));
        if (cleaned.length > 0) {
          return cleaned;
        }
      }
    } catch {
      // Ignore storage parse error
    }
    return [];
  });

  const [bootstrappingAddons, setBootstrappingAddons] = useState(false);

  // Live catalog shelves loaded from enabled addons
  const [catalogShelves, setCatalogShelves] = useState<CatalogShelfData[]>([]);
  const [loadingCatalogs, setLoadingCatalogs] = useState(false);

  // Live search results
  const [remoteSearchItems, setRemoteSearchItems] = useState<StremioMediaItem[]>([]);
  const [searchingRemote, setSearchingRemote] = useState(false);

  // Top 3D Moving Cards Hero Carousel state
  const [activeHeroIndex, setActiveHeroIndex] = useState<number>(0);
  const [heroAutoPlay, setHeroAutoPlay] = useState<boolean>(true);

  // Dossier / Full Movie & Series Details Page state
  const [dossierItem, setDossierItem] = useState<StremioMediaItem | null>(null);
  const [dossierLoadingMeta, setDossierLoadingMeta] = useState(false);
  const [dossierStreams, setDossierStreams] = useState<StremioStreamItem[]>([]);
  const [dossierLoadingStreams, setDossierLoadingStreams] = useState(false);
  const [dossierBenchmarkingServers, setDossierBenchmarkingServers] = useState(false);
  const [dossierSelectedSeason, setDossierSelectedSeason] = useState<number>(1);
  const [dossierEpisodeQuery, setDossierEpisodeQuery] = useState<string>('');
  const [dossierShowStreams, setDossierShowStreams] = useState<boolean>(false);
  const [dossierProviderCategory, setDossierProviderCategory] = useState<string>('all');
  const [dossierSimilarPool, setDossierSimilarPool] = useState<StremioMediaItem[]>([]);
  const dossierScrollRef = useRef<HTMLDivElement | null>(null);

  const dossierProviderCategories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of dossierStreams) {
      const cat = getStreamProviderCategory(s);
      counts.set(cat, (counts.get(cat) ?? 0) + 1);
    }
    const list: Array<{ id: string; label: string; count: number }> = [
      { id: 'all', label: 'All', count: dossierStreams.length },
    ];
    counts.forEach((count, cat) => {
      list.push({ id: cat, label: cat, count });
    });
    return list;
  }, [dossierStreams]);

  const effectiveDossierProviderCategory = useMemo(() => {
    if (dossierProviderCategory === 'all') return 'all';
    return dossierProviderCategories.some((c) => c.id === dossierProviderCategory)
      ? dossierProviderCategory
      : 'all';
  }, [dossierProviderCategories, dossierProviderCategory]);

  const filteredDossierStreams = useMemo(() => {
    if (effectiveDossierProviderCategory === 'all') return dossierStreams;
    return dossierStreams.filter(
      (s) => getStreamProviderCategory(s) === effectiveDossierProviderCategory,
    );
  }, [dossierStreams, effectiveDossierProviderCategory]);

  // Custom Watchlist Collections ("plan", "watching", "completed", "favorites") & Personal 1-5 Star Ratings
  const [watchlistFilterTab, setWatchlistFilterTab] = useState<
    'all' | 'watching' | 'plan' | 'completed' | 'favorites'
  >('all');
  const [watchlistMetaById, setWatchlistMetaById] = useState<
    Record<
      string,
      {
        status: 'watching' | 'plan' | 'completed' | 'favorites';
        userRating?: number;
      }
    >
  >(() => {
    try {
      const raw = localStorage.getItem('fablearc_watchlist_meta_v1');
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });

  const updateWatchlistMeta = useCallback(
    (
      mediaId: string,
      patch: Partial<{
        status: 'watching' | 'plan' | 'completed' | 'favorites';
        userRating?: number;
      }>,
    ) => {
      setWatchlistMetaById((prev) => {
        const current = prev[mediaId] ?? { status: 'plan' as const };
        const next = {
          ...prev,
          [mediaId]: {
            ...current,
            ...patch,
          },
        };
        try {
          localStorage.setItem('fablearc_watchlist_meta_v1', JSON.stringify(next));
        } catch {}
        return next;
      });
    },
    [],
  );

  // Active player modal state
  const [playingSession, setPlayingSession] = useState<{
    media: StremioMediaItem;
    episode?: StremioEpisodeVideo;
    stream?: StremioStreamItem;
    streams?: StremioStreamItem[];
    resumeSec: number;
  } | null>(null);

  // Streaming Catalogs Configurator Modal state
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [streamingConfig, setStreamingConfig] = useState<StreamingCatalogsConfig>(() => {
    const existing = addons.find((a) => a.manifest.id === 'pw.ers.netflix-catalog');
    return existing
      ? parseStreamingCatalogsConfig(existing.manifestUrl)
      : {
          providers: ['nfx', 'hbm', 'dnp', 'amp', 'atp'],
          rpdbKey: '',
          countryCode: 'US',
          netflixTop10Global: true,
          netflixTop10Country: false,
          netflixTop10CountryCode: 'US',
        };
  });
  const [applyingConfig, setApplyingConfig] = useState(false);

  // Personal Library & Watch Progress
  const [libraryItems, setLibraryItems] = useState<StremioMediaItem[]>(() => {
    try {
      const saved =
        localStorage.getItem(LIBRARY_STORAGE_KEY) ||
        localStorage.getItem('streamz_library_items_v2');
      return saved ? (JSON.parse(saved) as StremioMediaItem[]) : [];
    } catch {
      return [];
    }
  });

  const [progressMap, setProgressMap] = useState<Record<string, WatchProgressEntry>>(() => {
    try {
      const saved =
        localStorage.getItem(PROGRESS_STORAGE_KEY) ||
        localStorage.getItem('streamz_progress_v2');
      return saved ? (JSON.parse(saved) as Record<string, WatchProgressEntry>) : {};
    } catch {
      return {};
    }
  });

  // Addon installation & Per-User Edit Addon state
  const [newAddonUrl, setNewAddonUrl] = useState('');
  const [addonInstallStatus, setAddonInstallStatus] = useState<{
    kind: 'idle' | 'loading' | 'success' | 'error';
    message: string;
  }>({ kind: 'idle', message: '' });

  // Auto-remove addon install/update success or error card after 5 seconds (5000ms)
  useEffect(() => {
    if (addonInstallStatus.kind !== 'success' && addonInstallStatus.kind !== 'error') {
      return;
    }
    const timer = window.setTimeout(() => {
      setAddonInstallStatus({ kind: 'idle', message: '' });
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [addonInstallStatus]);

  // Inline Edit Existing Addon state (isolated strictly to the active user account)
  const [editingAddonId, setEditingAddonId] = useState<string | null>(null);
  const [editAddonUrlInput, setEditAddonUrlInput] = useState('');
  const [editAddonNameInput, setEditAddonNameInput] = useState('');
  const [editAddonSaving, setEditAddonSaving] = useState(false);
  const [editAddonError, setEditAddonError] = useState('');

  // Refs for minimal DB read/write throttling during video playback
  const latestPlayerProgressRef = useRef<WatchProgressEntry | null>(null);
  const lastDbProgressSyncMsRef = useRef<number>(0);
  const lastLocalProgressStateMsRef = useRef<number>(0);

  const persistWatchlistToDb = useCallback(
    (nextWatchlist: StremioMediaItem[]) => {
      if (!authToken || !currentUser) return;
      fetch(buildApiUrl('/api/user/watchlist'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          watchlist: nextWatchlist.map((i) => ({
            id: i.id,
            name: i.name,
            type: i.type,
            poster: i.poster,
            imdbRating: i.imdbRating,
            releaseInfo: i.releaseInfo,
          })),
        }),
      }).catch(() => {});
    },
    [authToken, currentUser],
  );

  const persistProvidersToDb = useCallback(
    (nextAddons: InstalledAddon[], nextCfg: StreamingCatalogsConfig = streamingConfig) => {
      if (!authToken || !currentUser || nextAddons.length === 0) return;
      const cfgCompact = [
        nextCfg.providers.join(','),
        nextCfg.rpdbKey,
        nextCfg.countryCode,
        nextCfg.netflixTop10Global ? '1' : '0',
        nextCfg.netflixTop10Country ? '1' : '0',
        nextCfg.netflixTop10CountryCode,
      ].join(':');
      fetch(buildApiUrl('/api/user/providers'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          providers: nextAddons,
          streamingConfigCompact: cfgCompact,
        }),
      }).catch(() => {});
    },
    [authToken, currentUser, streamingConfig],
  );

  const flushWatchProgressToDb = useCallback(
    (entry: WatchProgressEntry | null) => {
      if (!authToken || !currentUser || !entry || entry.positionSec <= 1) return;
      lastDbProgressSyncMsRef.current = Date.now();
      fetch(buildApiUrl('/api/user/watch-history'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          action: 'upsert',
          entry,
        }),
      }).catch(() => {});
    },
    [authToken, currentUser],
  );

  useEffect(() => {
    try {
      const key = currentUser
        ? `${LIBRARY_STORAGE_KEY}_u${currentUser.id}`
        : LIBRARY_STORAGE_KEY;
      localStorage.setItem(key, JSON.stringify(libraryItems));
    } catch {}
  }, [libraryItems, currentUser]);

  useEffect(() => {
    try {
      const key = currentUser
        ? `${PROGRESS_STORAGE_KEY}_u${currentUser.id}`
        : PROGRESS_STORAGE_KEY;
      localStorage.setItem(key, JSON.stringify(progressMap));
    } catch {}
  }, [progressMap, currentUser]);

  useEffect(() => {
    try {
      if (addons.length > 0) {
        const key = currentUser
          ? `${ADDONS_STORAGE_KEY}_u${currentUser.id}`
          : ADDONS_STORAGE_KEY;
        localStorage.setItem(key, JSON.stringify(addons));
      }
    } catch {}
  }, [addons, currentUser]);

  // Apply authenticated user's isolated state (providers, watchHistory, watchlist) from SQLite DB
  const applyAuthenticatedState = useCallback(
    (token: string, state: UserStatePayload) => {
      setAuthToken(token);
      setCurrentUser(state.user);
      setAuthModalOpen(false);
      try {
        localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
      } catch {}

      // 1. Load user's isolated Watch History
      const nextProgress: Record<string, WatchProgressEntry> = {};
      for (const h of state.watchHistory) {
        nextProgress[h.mediaId] = h;
      }
      setProgressMap(nextProgress);

      // 2. Load user's isolated Watchlist
      const nextLibrary: StremioMediaItem[] = state.watchlist.map((w) => ({
        id: w.id,
        imdbId: w.id.startsWith('tt') ? w.id : undefined,
        name: w.name,
        type: w.type,
        poster: w.poster,
        imdbRating: w.imdbRating,
        releaseInfo: w.releaseInfo,
        genres: [],
        cast: [],
        director: [],
        writer: [],
        trailers: [],
        videos: [],
      }));
      setLibraryItems(nextLibrary);

      // 3. Load user's isolated Providers (if user has saved providers in DB; otherwise reset to bootstrap defaults for new user)
      if (state.providers && state.providers.length > 0) {
        const restoredAddons: InstalledAddon[] = state.providers
          .map((p) => ({
            manifestUrl: upgradeLegacyDefaultAddonUrl(p.manifestUrl),
            enabled: p.enabled,
            manifest: p.manifest as unknown as InstalledAddon['manifest'],
            lastCheckedIso: p.lastCheckedIso,
          }))
          // Streaming Catalogs & raw P2P Torrentio addons excluded:
          .filter(
            (a) =>
              a.manifest.id !== 'pw.ers.netflix-catalog' &&
              a.manifest.id !== 'com.stremio.torrentio.addon' &&
              !a.manifestUrl.includes('torrentio.strem.fun'),
          );
        setAddons(restoredAddons);
        /* Streaming Catalogs config restore commented out (code preserved):
        const scAddon = restoredAddons.find(
          (a) => a.manifest.id === 'pw.ers.netflix-catalog',
        );
        if (scAddon) {
          setStreamingConfig(parseStreamingCatalogsConfig(scAddon.manifestUrl));
        }
        */
      } else {
        setAddons([]);
        setStreamingConfig({
          providers: ['nfx', 'hbm', 'dnp', 'amp', 'atp'],
          rpdbKey: '',
          countryCode: 'US',
          netflixTop10Global: true,
          netflixTop10Country: false,
          netflixTop10CountryCode: 'US',
        });
      }
    },
    [],
  );

  // Restore session on startup if authToken exists
  useEffect(() => {
    if (!authToken) return;
    let cancelled = false;
    fetch(buildApiUrl('/api/user/state'), {
      headers: { Authorization: `Bearer ${authToken}` },
    })
      .then(async (resp) => {
        if (!resp.ok) {
          if (resp.status === 401 && !cancelled) {
            setAuthToken(null);
            setCurrentUser(null);
            setAuthModalOpen(true);
            try {
              localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
            } catch {}
          }
          return;
        }
        const state = (await resp.json()) as UserStatePayload;
        if (!cancelled && state?.user) {
          applyAuthenticatedState(authToken, state);
        }
      })
      .catch(() => {
        // Offline or static preview fallback
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const clearClientSessionState = useCallback(() => {
    try {
      localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
    } catch {}
    setAuthToken(null);
    setCurrentUser(null);
    setActiveNav('discover');
    setProgressMap({});
    setLibraryItems([]);
    setAddons([]);
    setEditingAddonId(null);
    setDossierItem(null);
    setPlayingSession(null);
    setAuthModalOpen(true);
  }, []);

  const handleLogout = useCallback(() => {
    if (authToken) {
      fetch(buildApiUrl('/api/auth/logout'), {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` },
      }).catch(() => {});
    }
    clearClientSessionState();
  }, [authToken, clearClientSessionState]);

  // Single-device session enforcement: automatically log out this system if the user signs in on another device
  useEffect(() => {
    if (!authToken) return;
    let cancelled = false;

    const verifyActiveSession = () => {
      if (cancelled) return;
      fetch(buildApiUrl('/api/user/state'), {
        headers: { Authorization: `Bearer ${authToken}` },
      })
        .then((resp) => {
          if (resp.status === 401 && !cancelled) {
            clearClientSessionState();
          }
        })
        .catch(() => {
          // Ignore transient network errors
        });
    };

    const intervalId = window.setInterval(verifyActiveSession, 10_000);
    const onFocus = () => verifyActiveSession();
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        verifyActiveSession();
      }
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === AUTH_TOKEN_STORAGE_KEY && e.newValue !== authToken) {
        if (!e.newValue) {
          clearClientSessionState();
        } else {
          setAuthToken(e.newValue);
        }
      }
    };

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('storage', onStorage);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('storage', onStorage);
    };
  }, [authToken, clearClientSessionState]);

  const handleNavigateSection = useCallback(
    (targetNav: NavSection) => {
      if (!currentUser) {
        if (targetNav !== 'discover') {
          setAuthModalOpen(true);
        } else {
          setActiveNav('discover');
          setAuthModalOpen(false);
        }
        return;
      }
      setActiveNav(targetNav);
    },
    [currentUser],
  );

  // Automatically bootstrap default addons (or heal any missing default addons from an interrupted startup)
  // while preserving all existing user-configured addons and their enabled state.
  useEffect(() => {
    const missingDefaultUrls = DEFAULT_BOOTSTRAP_MANIFEST_URLS.filter((defaultUrl) => {
      try {
        const parsedDefault = new URL(defaultUrl);
        const defaultHost = parsedDefault.hostname.toLowerCase();
        const defaultPath = parsedDefault.pathname.replace(/\/+$/, '').toLowerCase();
        const isMultiProfileHost =
          defaultHost.includes('cncverse.dpdns.org') || defaultPath.includes('/u/p_');
        return !addons.some((existing) => {
          try {
            const parsedExisting = new URL(existing.manifestUrl);
            const existingHost = parsedExisting.hostname.toLowerCase();
            if (isMultiProfileHost) {
              const existingPath = parsedExisting.pathname.replace(/\/+$/, '').toLowerCase();
              return existingHost === defaultHost && existingPath === defaultPath;
            }
            return existingHost === defaultHost;
          } catch {
            return false;
          }
        });
      } catch {
        return false;
      }
    });

    if (missingDefaultUrls.length === 0) return;

    let cancelled = false;

    const ensureDefaultAddons = async () => {
      setBootstrappingAddons(true);
      const fetchedAddons: InstalledAddon[] = [];

      await Promise.allSettled(
        missingDefaultUrls.map(async (url) => {
          const { manifestUrl, manifest } = await fetchStremioManifest(url);
          fetchedAddons.push({
            manifestUrl,
            enabled: true,
            manifest,
            lastCheckedIso: new Date().toISOString(),
          });
        }),
      );

      if (!cancelled && fetchedAddons.length > 0) {
        setAddons((prev) => {
          const merged = [...prev];
          for (const next of fetchedAddons) {
            if (!merged.some((existing) => existing.manifest.id === next.manifest.id)) {
              merged.push(next);
            }
          }
          if (authToken && currentUser && merged.length > 0) {
            persistProvidersToDb(merged);
          }
          return merged;
        });
      }
      if (!cancelled) {
        setBootstrappingAddons(false);
      }
    };

    ensureDefaultAddons();

    return () => {
      cancelled = true;
    };
  }, [addons.length, authToken, currentUser]);

  // Load all catalogs from enabled addons
  const loadAllAddonCatalogs = useCallback(async () => {
    const enabledCatalogAddons = addons.filter(
      (a) =>
        a.enabled &&
        addonSupportsResource(a.manifest, 'catalog') &&
        Array.isArray(a.manifest.catalogs) &&
        a.manifest.catalogs.length > 0,
    );

    if (enabledCatalogAddons.length === 0) {
      setCatalogShelves([]);
      return;
    }

    const sortedAddons = [...enabledCatalogAddons].sort((a, b) => {
      if (a.manifest.id === 'pw.ers.netflix-catalog') return -1;
      if (b.manifest.id === 'pw.ers.netflix-catalog') return 1;
      return 0;
    });

    const descriptorList: Array<{
      key: string;
      addon: InstalledAddon;
      catalogId: string;
      catalogName: string;
      mediaType: string;
    }> = [];

    for (const addon of sortedAddons) {
      for (const cat of addon.manifest.catalogs) {
        if (cat.type !== 'movie' && cat.type !== 'series' && cat.type !== 'anime') {
          continue;
        }
        if (Array.isArray(cat.extraRequired) && cat.extraRequired.length > 0) {
          continue;
        }
        if (Array.isArray(cat.extra) && cat.extra.some((e) => e.isRequired)) {
          continue;
        }
        if (addon.manifest.id === 'com.linvo.cinemeta' && cat.id !== 'top') {
          continue;
        }

        const serviceMeta = STREAMING_CATALOG_SERVICES.find((s) => s.id === cat.id);
        const rawName = (cat.name || serviceMeta?.name || cat.id).replace(/\s+/g, ' ').trim();
        const typeLabel =
          cat.type === 'movie' ? 'Movies' : cat.type === 'series' ? 'Series' : cat.type;
        const displayCatalogName = rawName.toLowerCase().includes(typeLabel.toLowerCase())
          ? rawName
          : `${rawName} — ${typeLabel}`;

        descriptorList.push({
          key: `${addon.manifest.id}:${cat.type}:${cat.id}`,
          addon,
          catalogId: cat.id,
          catalogName: displayCatalogName,
          mediaType: cat.type,
        });
      }
    }

    setLoadingCatalogs(true);

    const results = await Promise.all(
      descriptorList.map(async (desc): Promise<CatalogShelfData> => {
        try {
          const items = await fetchAddonCatalog(
            desc.addon.manifestUrl,
            desc.mediaType,
            desc.catalogId,
            undefined,
            {
              addonId: desc.addon.manifest.id,
              addonName: desc.addon.manifest.name,
              catalogName: desc.catalogName,
            },
          );
          return {
            key: desc.key,
            addonId: desc.addon.manifest.id,
            addonName: desc.addon.manifest.name,
            manifestUrl: desc.addon.manifestUrl,
            catalogId: desc.catalogId,
            catalogName: desc.catalogName,
            mediaType: desc.mediaType,
            items,
            loading: false,
          };
        } catch (err) {
          return {
            key: desc.key,
            addonId: desc.addon.manifest.id,
            addonName: desc.addon.manifest.name,
            manifestUrl: desc.addon.manifestUrl,
            catalogId: desc.catalogId,
            catalogName: desc.catalogName,
            mediaType: desc.mediaType,
            items: [],
            loading: false,
            error: err instanceof Error ? err.message : 'Failed to load catalog',
          };
        }
      }),
    );

    setCatalogShelves(results.filter((shelf) => shelf.items.length > 0));
    setLoadingCatalogs(false);
  }, [addons]);

  useEffect(() => {
    loadAllAddonCatalogs();
  }, [loadAllAddonCatalogs]);

  // Debounce searchInput -> searchQuery (180ms idle or immediate on Enter submit) for instant search feel
  useEffect(() => {
    const trimmed = searchInput.trim();
    if (!trimmed) {
      setSearchQuery('');
      return;
    }
    if (trimmed.length < 2) {
      return;
    }
    const timer = window.setTimeout(() => {
      setSearchQuery(trimmed);
    }, 180);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  // High-Speed Progressive Search:
  // 1. Renders local shelf matches in 0ms
  // 2. Resolves fast Cinemeta Series + Movie search in ~150ms and renders immediately without waiting on slow third-party addons
  // 3. Progressively merges any supplemental addon search results in the background
  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 2) {
      setRemoteSearchItems([]);
      setSearchingRemote(false);
      return;
    }

    const abortController = new AbortController();
    let cancelled = false;
    const lowerQ = q.toLowerCase();

    const scoreSearchMatch = (item: StremioMediaItem): number => {
      const lowerName = item.name.trim().toLowerCase();
      const normalizedName = lowerName.replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ');
      const normalizedQuery = lowerQ.replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ');
      let score = 0;

      if (lowerName === lowerQ || normalizedName === normalizedQuery) {
        score += 1000;
      } else if (
        lowerName.startsWith(`${lowerQ} `) ||
        lowerName.startsWith(`${lowerQ}:`) ||
        normalizedName.startsWith(`${normalizedQuery} `)
      ) {
        score += 650;
      } else if (lowerName.startsWith(lowerQ)) {
        score += 500;
      } else if (lowerName.includes(lowerQ)) {
        score += 250;
      }

      if (item.releaseInfo && /\d{4}\s*[-–]\s*\d{0,4}/.test(item.releaseInfo)) {
        score += 45;
      }
      if (item.imdbRating) {
        score += 25;
      }
      return score;
    };

    const mergeAndRankLists = (lists: StremioMediaItem[][]): StremioMediaItem[] => {
      const interleaved: StremioMediaItem[] = [];
      const maxLen = lists.reduce((m, arr) => Math.max(m, arr.length), 0);
      for (let i = 0; i < maxLen; i++) {
        for (const list of lists) {
          if (list[i]) {
            interleaved.push(list[i]);
          }
        }
      }
      for (const shelf of catalogShelves) {
        for (const item of shelf.items) {
          if (item.name.toLowerCase().includes(lowerQ)) {
            interleaved.push(item);
          }
        }
      }
      const seen = new Set<string>();
      const uniqueItems = interleaved.filter((item) => {
        if (seen.has(item.id)) return false;
        seen.add(item.id);
        return true;
      });
      uniqueItems.sort((a, b) => scoreSearchMatch(b) - scoreSearchMatch(a));
      return uniqueItems;
    };

    const runSearch = async () => {
      // Phase 0: Instant 0ms local shelf matches
      const instantLocal = mergeAndRankLists([]);
      if (instantLocal.length > 0) {
        setRemoteSearchItems(instantLocal);
      }
      setSearchingRemote(true);

      // Phase 1: Ultra-fast primary Cinemeta Series + Movie search (~150ms)
      const primaryTargets: Array<{
        manifestUrl: string;
        addonId: string;
        addonName: string;
        mediaType: 'series' | 'movie';
        catalogId: string;
      }> = [
        {
          manifestUrl: 'https://v3-cinemeta.strem.io/manifest.json',
          addonId: 'com.linvo.cinemeta',
          addonName: 'Cinemeta',
          mediaType: 'series',
          catalogId: 'top',
        },
        {
          manifestUrl: 'https://v3-cinemeta.strem.io/manifest.json',
          addonId: 'com.linvo.cinemeta',
          addonName: 'Cinemeta',
          mediaType: 'movie',
          catalogId: 'top',
        },
      ];

      const collectedLists: StremioMediaItem[][] = [];

      const primaryResults = await Promise.allSettled(
        primaryTargets.map((target) =>
          fetchAddonCatalog(
            target.manifestUrl,
            target.mediaType,
            target.catalogId,
            { search: q },
            {
              addonId: target.addonId,
              addonName: target.addonName,
              catalogName: `${target.addonName} Search`,
            },
            abortController.signal,
          ),
        ),
      );

      if (cancelled || abortController.signal.aborted) return;

      for (const res of primaryResults) {
        if (res.status === 'fulfilled' && Array.isArray(res.value) && res.value.length > 0) {
          collectedLists.push(res.value);
        }
      }

      // Render primary search results immediately without waiting for slower third-party addons!
      setRemoteSearchItems(mergeAndRankLists(collectedLists));
      setSearchingRemote(false);

      // Phase 2: Supplemental non-blocking addon search (capped at 2.5s timeout so slow addons never lag UI)
      const secondaryTargets: Array<{
        manifestUrl: string;
        addonId: string;
        addonName: string;
        mediaType: 'series' | 'movie';
        catalogId: string;
      }> = [];

      for (const addon of addons) {
        if (!addon.enabled || addon.manifest.id === 'com.linvo.cinemeta') continue;
        for (const cat of addon.manifest.catalogs) {
          if (
            (cat.type === 'movie' || cat.type === 'series') &&
            (cat.extraSupported?.includes('search') ||
              cat.extra?.some((e) => e.name === 'search'))
          ) {
            secondaryTargets.push({
              manifestUrl: addon.manifestUrl,
              addonId: addon.manifest.id,
              addonName: addon.manifest.name,
              mediaType: cat.type,
              catalogId: cat.id,
            });
          }
        }
      }

      if (secondaryTargets.length > 0) {
        secondaryTargets.slice(0, 2).forEach((target) => {
          fetchAddonCatalog(
            target.manifestUrl,
            target.mediaType,
            target.catalogId,
            { search: q },
            {
              addonId: target.addonId,
              addonName: target.addonName,
              catalogName: `${target.addonName} Search`,
            },
            abortController.signal,
          )
            .then((extraItems) => {
              if (
                cancelled ||
                abortController.signal.aborted ||
                !Array.isArray(extraItems) ||
                extraItems.length === 0
              ) {
                return;
              }
              collectedLists.push(extraItems);
              setRemoteSearchItems(mergeAndRankLists(collectedLists));
            })
            .catch(() => {});
        });
      }
    };

    runSearch();

    return () => {
      cancelled = true;
      abortController.abort();
    };
  }, [searchQuery, addons, catalogShelves]);

  // Open Movie / Series Details Page & enrich with episodes, sorted streams, and similar titles
  const openItemDossier = useCallback(
    async (item: StremioMediaItem) => {
      if (!currentUser) {
        setAuthModalOpen(true);
        return;
      }
      setDossierItem(item);
      setDossierSelectedSeason(1);
      setDossierEpisodeQuery('');
      setDossierShowStreams(false);
      setDossierProviderCategory('all');
      setDossierLoadingMeta(true);
      setDossierLoadingStreams(true);
      setDossierStreams([]);
      if (dossierScrollRef.current) {
        dossierScrollRef.current.scrollTo({ top: 0, behavior: 'smooth' });
      }

      const enriched = await fetchMetaFromAddons(addons, item.type, item.id, item);
      const finalItem = enriched || item;
      setDossierItem(finalItem);
      if (finalItem.videos.length > 0) {
        setDossierSelectedSeason(finalItem.videos[0].season);
      }
      setDossierLoadingMeta(false);

      // Hydrate similar movies/series from Cinemeta for the primary genre so "More Like This" is always rich
      const primaryGenre = finalItem.genres[0];
      if (primaryGenre) {
        fetchAddonCatalog(
          'https://v3-cinemeta.strem.io/manifest.json',
          finalItem.type === 'series' ? 'series' : 'movie',
          'top',
          { genre: primaryGenre },
          {
            addonId: 'com.linvo.cinemeta',
            addonName: 'Cinemeta',
            catalogName: `Similar ${primaryGenre}`,
          },
        )
          .then((fetchedSimilar) => {
            if (Array.isArray(fetchedSimilar) && fetchedSimilar.length > 0) {
              setDossierSimilarPool(
                fetchedSimilar.map((sim) =>
                  sim.genres.length > 0 ? sim : { ...sim, genres: [primaryGenre] },
                ),
              );
            }
          })
          .catch(() => {});
      }

      const targetVideoId =
        finalItem.type === 'series' && finalItem.videos.length > 0
          ? finalItem.videos[0].id
          : finalItem.imdbId || finalItem.id;

      const streams = await fetchStreamsFromAddons(
        addons,
        finalItem.type,
        targetVideoId,
        finalItem,
      );
      const initialSorted = applyCachedServerHealth(
        sortStreamsByDecreasingQuality(streams),
      );
      setDossierStreams(initialSorted);
      setDossierLoadingStreams(false);

      // Background partial server speed & health benchmark:
      // Tests top candidate servers (64 KB Range check), promotes the fastest zero-buffer server to #1,
      // keeps remaining servers in decreasing quality order, pre-warms /api/media-probe for the #1 server,
      // and then progressively pings all remaining direct servers in background batches!
      if (initialSorted.length > 0) {
        setDossierBenchmarkingServers(true);
        rankStreamsByResponsiveness(initialSorted)
          .then(async (ranked) => {
            setDossierStreams((prev) => (prev.length > 0 ? ranked : prev));
            setDossierBenchmarkingServers(false);

            const unpinged = ranked.filter(
              (s) =>
                s.kind === 'direct' &&
                !s.isPromo &&
                Boolean(s.url) &&
                !s.serverStatusBadge,
            );
            for (let i = 0; i < unpinged.length; i += 18) {
              const chunk = unpinged.slice(i, i + 18);
              const metricsMap = await pingStreamBatch(chunk);
              if (metricsMap.size === 0) continue;
              setDossierStreams((prev) =>
                prev
                  .map((s) => {
                    const m = metricsMap.get(s.id);
                    if (!m) return s;
                    return {
                      ...s,
                      ttfbMs: m.ttfbMs,
                      speedMbps: m.speedMbps || s.speedMbps,
                      responsivenessScore: m.responsivenessScore || s.responsivenessScore,
                      serverStatusBadge: m.statusBadge,
                      unreachable: m.unreachable || !m.ok,
                      resolvedDirectUrl: m.resolvedUrl || s.resolvedDirectUrl || s.url,
                    };
                  })
                  .filter((s) => !isUnreachableOrSlowStream(s)),
              );
            }
          })
          .catch(() => {
            setDossierBenchmarkingServers(false);
          });
      }
    },
    [addons, currentUser],
  );

  // Start screening an item
  const startScreeningItem = useCallback(
    async (
      item: StremioMediaItem,
      episode?: StremioEpisodeVideo,
      stream?: StremioStreamItem,
      resumeSec = 0,
      preloadedStreams?: StremioStreamItem[],
    ) => {
      if (!currentUser) {
        setAuthModalOpen(true);
        return;
      }
      let targetItem = item;
      if (item.type === 'series' && item.videos.length === 0) {
        const enriched = await fetchMetaFromAddons(addons, item.type, item.id, item);
        if (enriched) targetItem = enriched;
      }
      setPlayingSession({
        media: targetItem,
        episode: episode ?? targetItem.videos[0],
        stream,
        streams: preloadedStreams,
        resumeSec,
      });
    },
    [addons, currentUser],
  );

  const availableServiceTabs = useMemo(() => {
    const map = new Map<string, { id: string; label: string; accentColor?: string }>();
    for (const shelf of catalogShelves) {
      if (!map.has(shelf.catalogId)) {
        const svc = STREAMING_CATALOG_SERVICES.find((s) => s.id === shelf.catalogId);
        const cleanLabel = svc
          ? svc.name
          : shelf.catalogName.split('—')[0].trim();
        map.set(shelf.catalogId, {
          id: shelf.catalogId,
          label: cleanLabel,
          accentColor: svc?.accentColor,
        });
      }
    }
    return Array.from(map.values());
  }, [catalogShelves]);

  const allGenres = useMemo(() => {
    const set = new Set<string>(ALPHABETICAL_GENRES);
    for (const shelf of catalogShelves) {
      for (const item of shelf.items) {
        item.genres.forEach((g) => {
          if (g && g.trim()) set.add(g.trim());
        });
      }
    }
    const sorted = Array.from(set).sort((a, b) => a.localeCompare(b));
    return ['All', ...sorted];
  }, [catalogShelves]);

  const effectiveMediaTypeFilter: 'all' | 'movie' | 'series' =
    activeNav === 'movies' ? 'movie' : activeNav === 'series' ? 'series' : 'all';

  // Infinite Scroll State for Catalog Shelves & Alphabetical Genre Shelves (Movies + Series separated)
  const [genreExtraItemsByKey, setGenreExtraItemsByKey] = useState<
    Record<string, StremioMediaItem[]>
  >({});
  const [shelfNextSkipByKey, setShelfNextSkipByKey] = useState<Record<string, number>>({});
  const [shelfLoadingMoreByKey, setShelfLoadingMoreByKey] = useState<
    Record<string, boolean>
  >({});
  const [shelfHasMoreByKey, setShelfHasMoreByKey] = useState<Record<string, boolean>>({});
  const [visibleGenreCount, setVisibleGenreCount] = useState<number>(6);
  const inFlightShelfFetchRef = useRef<Set<string>>(new Set());

  const visibleShelves = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return catalogShelves
      .filter((shelf) => {
        if (
          effectiveMediaTypeFilter !== 'all' &&
          shelf.mediaType !== effectiveMediaTypeFilter
        ) {
          return false;
        }
        if (
          selectedServiceFilter !== 'all' &&
          shelf.catalogId !== selectedServiceFilter
        ) {
          return false;
        }
        return true;
      })
      .map((shelf) => {
        const filteredItems = shelf.items.filter((item) => {
          const matchesGenre =
            selectedGenre === 'All' || item.genres.includes(selectedGenre);
          const matchesSearch =
            !q ||
            item.name.toLowerCase().includes(q) ||
            (item.description && item.description.toLowerCase().includes(q)) ||
            item.director.some((d) => d.toLowerCase().includes(q)) ||
            item.cast.some((c) => c.toLowerCase().includes(q)) ||
            item.genres.some((g) => g.toLowerCase().includes(q));
          return matchesGenre && matchesSearch;
        });

        return {
          ...shelf,
          items: filteredItems,
          loadingMore: Boolean(shelfLoadingMoreByKey[shelf.key]),
          hasMore: shelfHasMoreByKey[shelf.key] ?? true,
        };
      })
      .filter((shelf) => shelf.items.length > 0);
  }, [
    catalogShelves,
    effectiveMediaTypeFilter,
    searchQuery,
    selectedGenre,
    selectedServiceFilter,
    shelfHasMoreByKey,
    shelfLoadingMoreByKey,
  ]);

  // Dedicated Alphabetical Genre Shelves:
  // Sorted A-Z by genre, with "<Genre> Movies" followed immediately by "<Genre> Series"
  const genreCatalogShelves = useMemo<CatalogShelfData[]>(() => {
    if (searchQuery.trim()) return [];

    // 1. Cross-shelf genre index by item ID
    const genresById = new Map<string, string[]>();
    for (const shelf of catalogShelves) {
      for (const item of shelf.items) {
        if (item.genres && item.genres.length > 0 && !genresById.has(item.id)) {
          genresById.set(item.id, item.genres);
        }
      }
    }

    const activeGenresList =
      selectedGenre !== 'All'
        ? [selectedGenre]
        : ALPHABETICAL_GENRES.slice(0, visibleGenreCount);

    const mediaTypesOrder: Array<'movie' | 'series'> =
      effectiveMediaTypeFilter === 'movie'
        ? ['movie']
        : effectiveMediaTypeFilter === 'series'
          ? ['series']
          : ['movie', 'series'];

    const matchesGenreName = (rawGenre: string, targetGenre: string): boolean => {
      const r = rawGenre.trim().toLowerCase();
      const t = targetGenre.trim().toLowerCase();
      if (r === t) return true;
      if (t === 'sci-fi' && (r === 'science fiction' || r === 'sci-fi')) return true;
      return false;
    };

    const built: CatalogShelfData[] = [];

    for (const genreName of activeGenresList) {
      for (const mType of mediaTypesOrder) {
        const shelfKey = `genre-shelf:${genreName.toLowerCase()}:${mType}`;
        const seenIds = new Set<string>();
        const combinedItems: StremioMediaItem[] = [];

        // Include matching items from loaded catalogShelves of the same mediaType
        for (const shelf of catalogShelves) {
          if (shelf.mediaType !== mType) continue;
          for (const item of shelf.items) {
            if (item.type !== mType) continue;
            const effectiveGenres =
              item.genres.length > 0 ? item.genres : (genresById.get(item.id) ?? []);
            if (effectiveGenres.some((g) => matchesGenreName(g, genreName))) {
              if (!seenIds.has(item.id)) {
                seenIds.add(item.id);
                combinedItems.push(
                  item.genres.length > 0 ? item : { ...item, genres: effectiveGenres },
                );
              }
            }
          }
        }

        // Append API-hydrated & infinite-scrolled items for this specific <Genre> + <movie|series> shelf
        const apiItems = genreExtraItemsByKey[shelfKey] ?? [];
        for (const item of apiItems) {
          if (!seenIds.has(item.id)) {
            seenIds.add(item.id);
            combinedItems.push(item);
          }
        }

        const typeHeading = mType === 'movie' ? 'Movies' : 'Series';
        built.push({
          key: shelfKey,
          addonId: 'com.linvo.cinemeta',
          addonName: 'Cinemeta',
          manifestUrl: 'https://v3-cinemeta.strem.io/manifest.json',
          catalogId: 'top',
          catalogName: `${genreName} ${typeHeading}`,
          mediaType: mType,
          genreQuery: genreName,
          items: combinedItems,
          loading: false,
          loadingMore: Boolean(shelfLoadingMoreByKey[shelfKey]),
          hasMore: shelfHasMoreByKey[shelfKey] ?? true,
        });
      }
    }

    return built.filter((s) => s.items.length > 0 || s.loadingMore);
  }, [
    catalogShelves,
    effectiveMediaTypeFilter,
    genreExtraItemsByKey,
    searchQuery,
    selectedGenre,
    shelfHasMoreByKey,
    shelfLoadingMoreByKey,
    visibleGenreCount,
  ]);

  // API-backed Infinite Scroll fetcher for ANY shelf (Featured Movies/Series OR <Genre> Movies / <Genre> Series)
  const handleLoadMoreShelf = useCallback(
    async (shelf: CatalogShelfData) => {
      const shelfKey = shelf.key;
      if (inFlightShelfFetchRef.current.has(shelfKey)) return;
      if (shelfHasMoreByKey[shelfKey] === false) return;

      const isGenreShelf = Boolean(shelf.genreQuery);
      const currentSkip =
        shelfNextSkipByKey[shelfKey] ??
        (isGenreShelf
          ? (genreExtraItemsByKey[shelfKey]?.length ?? 0)
          : shelf.items.length);

      inFlightShelfFetchRef.current.add(shelfKey);
      setShelfLoadingMoreByKey((prev) => ({ ...prev, [shelfKey]: true }));

      try {
        const targetManifestUrl =
          shelf.manifestUrl || 'https://v3-cinemeta.strem.io/manifest.json';
        const targetCatalogId = shelf.catalogId || 'top';

        const fetched = await fetchAddonCatalog(
          targetManifestUrl,
          shelf.mediaType,
          targetCatalogId,
          {
            genre: shelf.genreQuery,
            skip: currentSkip > 0 ? currentSkip : undefined,
          },
          {
            addonId: shelf.addonId,
            addonName: shelf.addonName,
            catalogName: shelf.catalogName,
          },
        );

        if (fetched.length === 0) {
          setShelfHasMoreByKey((prev) => ({ ...prev, [shelfKey]: false }));
        } else {
          const nextSkip = currentSkip + fetched.length;
          setShelfNextSkipByKey((prev) => ({ ...prev, [shelfKey]: nextSkip }));

          if (isGenreShelf) {
            setGenreExtraItemsByKey((prev) => {
              const existing = prev[shelfKey] ?? [];
              const seen = new Set(existing.map((i) => i.id));
              const merged = [...existing];
              for (const item of fetched) {
                if (!seen.has(item.id)) {
                  seen.add(item.id);
                  merged.push(
                    item.genres.length > 0
                      ? item
                      : { ...item, genres: [shelf.genreQuery!] },
                  );
                }
              }
              return { ...prev, [shelfKey]: merged };
            });
          } else {
            setCatalogShelves((prev) =>
              prev.map((s) => {
                if (s.key !== shelfKey) return s;
                const seen = new Set(s.items.map((i) => i.id));
                const merged = [...s.items];
                for (const item of fetched) {
                  if (!seen.has(item.id)) {
                    seen.add(item.id);
                    merged.push(item);
                  }
                }
                return { ...s, items: merged };
              }),
            );
          }
        }
      } catch {
        setShelfHasMoreByKey((prev) => ({ ...prev, [shelfKey]: false }));
      } finally {
        inFlightShelfFetchRef.current.delete(shelfKey);
        setShelfLoadingMoreByKey((prev) => ({ ...prev, [shelfKey]: false }));
      }
    },
    [genreExtraItemsByKey, shelfHasMoreByKey, shelfNextSkipByKey],
  );

  // Automatically hydrate visible <Genre> Movies and <Genre> Series shelves via API so each shelf has rich titles immediately
  useEffect(() => {
    if (searchQuery.trim()) return;
    const activeGenresList =
      selectedGenre !== 'All'
        ? [selectedGenre]
        : ALPHABETICAL_GENRES.slice(0, visibleGenreCount);

    const mediaTypesOrder: Array<'movie' | 'series'> =
      effectiveMediaTypeFilter === 'movie'
        ? ['movie']
        : effectiveMediaTypeFilter === 'series'
          ? ['series']
          : ['movie', 'series'];

    for (const genreName of activeGenresList) {
      for (const mType of mediaTypesOrder) {
        const shelfKey = `genre-shelf:${genreName.toLowerCase()}:${mType}`;
        const alreadyHydrated =
          genreExtraItemsByKey[shelfKey] !== undefined ||
          shelfHasMoreByKey[shelfKey] === false ||
          inFlightShelfFetchRef.current.has(shelfKey);

        if (!alreadyHydrated) {
          handleLoadMoreShelf({
            key: shelfKey,
            addonId: 'com.linvo.cinemeta',
            addonName: 'Cinemeta',
            manifestUrl: 'https://v3-cinemeta.strem.io/manifest.json',
            catalogId: 'top',
            catalogName: `${genreName} ${mType === 'movie' ? 'Movies' : 'Series'}`,
            mediaType: mType,
            genreQuery: genreName,
            items: [],
            loading: false,
          });
        }
      }
    }
  }, [
    effectiveMediaTypeFilter,
    genreExtraItemsByKey,
    handleLoadMoreShelf,
    searchQuery,
    selectedGenre,
    shelfHasMoreByKey,
    visibleGenreCount,
  ]);

  // Vertical Infinite Scroll handler on main viewport to progressively load more alphabetical genre pairs
  const handleMainViewportScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const el = e.currentTarget;
      const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      if (distanceToBottom < 900 && visibleGenreCount < ALPHABETICAL_GENRES.length) {
        setVisibleGenreCount((prev) =>
          Math.min(ALPHABETICAL_GENRES.length, prev + 3),
        );
      }
    },
    [visibleGenreCount],
  );

  // Top Moving Cards Pool: Interleave trending Movies & Series from the top shelves so the Top Hero Deck moves through diverse titles!
  const heroMovingCards = useMemo(() => {
    const seen = new Set<string>();
    const list: StremioMediaItem[] = [];
    const sourceShelves = visibleShelves.length > 0 ? visibleShelves : catalogShelves;

    for (let pass = 0; pass < 4; pass++) {
      for (const shelf of sourceShelves) {
        const candidate = shelf.items[pass];
        if (candidate && candidate.poster && !seen.has(candidate.id)) {
          seen.add(candidate.id);
          list.push(candidate);
        }
        if (list.length >= 12) break;
      }
      if (list.length >= 12) break;
    }
    return list;
  }, [catalogShelves, visibleShelves]);

  // Keep activeHeroIndex in bounds
  useEffect(() => {
    if (activeHeroIndex >= heroMovingCards.length && heroMovingCards.length > 0) {
      setActiveHeroIndex(0);
    }
  }, [activeHeroIndex, heroMovingCards.length]);

  const activeHeroItem = useMemo(() => {
    if (heroMovingCards.length === 0) return null;
    return heroMovingCards[activeHeroIndex] ?? heroMovingCards[0];
  }, [activeHeroIndex, heroMovingCards]);

  // Keep module-level hover prefetch reference synced with user's installed addons
  useEffect(() => {
    latestAddonsForHoverPrefetch = addons;
  }, [addons]);

  // Layer 1: Silently prefetch streams for the active Hero spotlight title after 900ms
  useEffect(() => {
    if (!activeHeroItem || addons.length === 0) return;
    const t = window.setTimeout(() => {
      prefetchStreamsForMedia(addons, activeHeroItem);
    }, 900);
    return () => window.clearTimeout(t);
  }, [activeHeroItem, addons]);

  // Auto-glide the Top Moving Cards Deck every 5 seconds (resets cleanly after Next/Prev/Card clicks)
  useEffect(() => {
    if (heroMovingCards.length <= 1 || !heroAutoPlay) return;
    const timer = window.setTimeout(() => {
      setActiveHeroIndex((prev) => (prev + 1) % heroMovingCards.length);
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [activeHeroIndex, heroAutoPlay, heroMovingCards.length]);

  const stepHeroCard = (dir: -1 | 1) => {
    if (heroMovingCards.length === 0) return;
    setHeroAutoPlay(true);
    setActiveHeroIndex(
      (prev) => (prev + dir + heroMovingCards.length) % heroMovingCards.length,
    );
  };

  const isInLibrary = useCallback(
    (mediaId: string) => libraryItems.some((i) => i.id === mediaId),
    [libraryItems],
  );

  const toggleLibraryItem = useCallback(
    (item: StremioMediaItem) => {
      if (!currentUser) {
        setAuthModalOpen(true);
        return;
      }
      setLibraryItems((prev) => {
        const exists = prev.some((existing) => existing.id === item.id);
        const nextWatchlist = exists
          ? prev.filter((existing) => existing.id !== item.id)
          : [item, ...prev];
        setUserToastCard({
          kind: 'success',
          text: exists
            ? `Removed "${item.name}" from your Watchlist.`
            : `Added "${item.name}" to your Watchlist.`,
        });
        persistWatchlistToDb(nextWatchlist);
        return nextWatchlist;
      });
    },
    [currentUser, persistWatchlistToDb],
  );

  const handleApplyStreamingCatalogsConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      streamingConfig.providers.length === 0 &&
      !streamingConfig.netflixTop10Global &&
      !streamingConfig.netflixTop10Country
    ) {
      return;
    }

    setApplyingConfig(true);
    try {
      const existingAddon = addons.find((a) => a.manifest.id === 'pw.ers.netflix-catalog');
      const configuredUrl = buildStreamingCatalogsManifestUrl(
        streamingConfig,
        existingAddon?.manifestUrl,
      );
      const { manifestUrl, manifest } = await fetchStremioManifest(configuredUrl);

      const updatedAddon: InstalledAddon = {
        manifestUrl,
        enabled: true,
        manifest,
        lastCheckedIso: new Date().toISOString(),
      };

      setAddons((prev) => {
        const hasExisting = prev.some((a) => a.manifest.id === 'pw.ers.netflix-catalog');
        const nextList = hasExisting
          ? prev.map((a) =>
              a.manifest.id === 'pw.ers.netflix-catalog' ? updatedAddon : a,
            )
          : [updatedAddon, ...prev];
        persistProvidersToDb(nextList, streamingConfig);
        return nextList;
      });

      setSelectedServiceFilter('all');
      setConfigModalOpen(false);
    } catch (err) {
      alert(
        err instanceof Error
          ? `Failed to apply Streaming Catalogs config: ${err.message}`
          : 'Failed to apply configuration.',
      );
    } finally {
      setApplyingConfig(false);
    }
  };

  const handleInstallAddon = async (rawInputUrl: string, e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const targetInput = rawInputUrl.trim();
    if (!targetInput) return;

    setAddonInstallStatus({
      kind: 'loading',
      message: 'Adding source…',
    });

    try {
      const { manifestUrl, manifest } = await fetchStremioManifest(targetInput);
      const nextAddon: InstalledAddon = {
        manifestUrl,
        enabled: true,
        manifest,
        lastCheckedIso: new Date().toISOString(),
      };

      const nextCfg =
        manifest.id === 'pw.ers.netflix-catalog'
          ? parseStreamingCatalogsConfig(manifestUrl)
          : streamingConfig;

      if (manifest.id === 'pw.ers.netflix-catalog') {
        setStreamingConfig(nextCfg);
      }

      setAddons((prev) => {
        const existingIdx = prev.findIndex((a) => a.manifest.id === manifest.id);
        let nextList: InstalledAddon[];
        if (existingIdx !== -1) {
          const copy = [...prev];
          copy[existingIdx] = nextAddon;
          nextList = copy;
        } else {
          nextList = [nextAddon, ...prev];
        }
        persistProvidersToDb(nextList, nextCfg);
        return nextList;
      });

      setNewAddonUrl('');
      const installMsg = `Installed "${manifest.name}" (v${manifest.version}).`;
      setAddonInstallStatus({
        kind: 'success',
        message: installMsg,
      });
      setUserToastCard({
        kind: 'success',
        text: installMsg,
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Failed to install addon.';
      setAddonInstallStatus({
        kind: 'error',
        message: errMsg,
      });
      setUserToastCard({
        kind: 'error',
        text: errMsg,
      });
    }
  };

  const handleStartEditAddon = (addon: InstalledAddon) => {
    setEditingAddonId(addon.manifest.id);
    setEditAddonUrlInput(addon.manifestUrl);
    setEditAddonNameInput(addon.manifest.name);
    setEditAddonError('');
  };

  const handleCancelEditAddon = () => {
    setEditingAddonId(null);
    setEditAddonUrlInput('');
    setEditAddonNameInput('');
    setEditAddonError('');
    setEditAddonSaving(false);
  };

  const handleSaveEditedAddon = async (
    originalAddon: InstalledAddon,
    e?: React.FormEvent,
  ) => {
    if (e) e.preventDefault();
    const nextUrlRaw = editAddonUrlInput.trim();
    const nextNameRaw = editAddonNameInput.trim();

    if (!nextUrlRaw) {
      setEditAddonError('Please enter a valid Stremio manifest URL.');
      return;
    }

    setEditAddonSaving(true);
    setEditAddonError('');

    try {
      let resolvedUrl = originalAddon.manifestUrl;
      let resolvedManifest = { ...originalAddon.manifest };

      if (nextUrlRaw !== originalAddon.manifestUrl) {
        const fetched = await fetchStremioManifest(nextUrlRaw);
        resolvedUrl = fetched.manifestUrl;
        resolvedManifest = { ...fetched.manifest };
      }

      if (nextNameRaw) {
        resolvedManifest = {
          ...resolvedManifest,
          name: nextNameRaw,
        };
      }

      const updatedAddon: InstalledAddon = {
        manifestUrl: resolvedUrl,
        enabled: originalAddon.enabled,
        manifest: resolvedManifest,
        lastCheckedIso: new Date().toISOString(),
      };

      setAddons((prev) => {
        const nextList = prev.map((a) =>
          a.manifest.id === originalAddon.manifest.id ? updatedAddon : a,
        );
        persistProvidersToDb(nextList);
        return nextList;
      });

      setEditingAddonId(null);
      const updateMsg = `Updated "${resolvedManifest.name}" for your account only.`;
      setAddonInstallStatus({
        kind: 'success',
        message: updateMsg,
      });
      setUserToastCard({
        kind: 'success',
        text: updateMsg,
      });
    } catch (err) {
      setEditAddonError(
        err instanceof Error ? err.message : 'Failed to verify edited addon URL.',
      );
    } finally {
      setEditAddonSaving(false);
    }
  };

  const continueTrackRef = useRef<HTMLDivElement | null>(null);

  const scrollContinueTrack = useCallback((direction: 'left' | 'right') => {
    const el = continueTrackRef.current;
    if (!el) return;
    const distance = Math.max(460, Math.floor(el.clientWidth * 0.8));
    el.scrollBy({
      left: direction === 'left' ? -distance : distance,
      behavior: 'smooth',
    });
  }, []);

  const continueWatchingEntries = useMemo(() => {
    return Object.values(progressMap)
      .filter((entry) => entry.positionSec > 2)
      .sort((a, b) => b.updatedAtIso.localeCompare(a.updatedAtIso));
  }, [progressMap]);

  const removeContinueWatchingItem = useCallback(
    (mediaId: string) => {
      setProgressMap((prev) => {
        const next = { ...prev };
        delete next[mediaId];
        return next;
      });
      if (authToken) {
        fetch('/api/user/watch-history', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({ action: 'delete', mediaId }),
        }).catch(() => {});
      }
    },
    [authToken],
  );

  const clearAllContinueWatching = useCallback(() => {
    setProgressMap({});
    try {
      const key = currentUser
        ? `${PROGRESS_STORAGE_KEY}_u${currentUser.id}`
        : PROGRESS_STORAGE_KEY;
      localStorage.removeItem(key);
    } catch {
      // Ignore storage error
    }
    if (authToken) {
      fetch('/api/user/watch-history', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ action: 'clear' }),
      }).catch(() => {});
    }
  }, [authToken, currentUser]);

  const dossierSeasons = useMemo(() => {
    if (!dossierItem || dossierItem.videos.length === 0) return [];
    const set = new Set<number>();
    dossierItem.videos.forEach((v) => set.add(v.season));
    return Array.from(set).sort((a, b) => a - b);
  }, [dossierItem]);

  // Compute Similar Movies / Series ("More Like This") for the active Details Page item
  const similarDossierItems = useMemo<StremioMediaItem[]>(() => {
    if (!dossierItem) return [];
    const targetGenres = new Set(
      dossierItem.genres.map((g) => g.trim().toLowerCase()).filter(Boolean),
    );
    const targetCast = new Set(
      dossierItem.cast.map((c) => c.trim().toLowerCase()).filter(Boolean),
    );
    const targetDirectors = new Set(
      dossierItem.director.map((d) => d.trim().toLowerCase()).filter(Boolean),
    );

    const candidateMap = new Map<string, StremioMediaItem>();
    for (const shelf of catalogShelves) {
      for (const item of shelf.items) {
        if (item.id !== dossierItem.id && !candidateMap.has(item.id)) {
          candidateMap.set(item.id, item);
        }
      }
    }
    for (const extraList of Object.values(genreExtraItemsByKey)) {
      for (const item of extraList) {
        if (item.id !== dossierItem.id && !candidateMap.has(item.id)) {
          candidateMap.set(item.id, item);
        }
      }
    }
    for (const simItem of dossierSimilarPool) {
      if (simItem.id !== dossierItem.id && !candidateMap.has(simItem.id)) {
        candidateMap.set(simItem.id, simItem);
      }
    }

    const scored = Array.from(candidateMap.values()).map((candidate) => {
      let score = 0;
      if (candidate.type === dossierItem.type) {
        score += 3;
      }
      for (const g of candidate.genres) {
        if (targetGenres.has(g.trim().toLowerCase())) {
          score += 4;
        }
      }
      for (const c of candidate.cast) {
        if (targetCast.has(c.trim().toLowerCase())) {
          score += 3;
        }
      }
      for (const d of candidate.director) {
        if (targetDirectors.has(d.trim().toLowerCase())) {
          score += 4;
        }
      }
      const ratingNum = Number.parseFloat(candidate.imdbRating || '0');
      if (Number.isFinite(ratingNum) && ratingNum > 0) {
        score += ratingNum * 0.25;
      }
      return { candidate, score };
    });

    return scored
      .filter((entry) => entry.score > 1)
      .sort((a, b) => b.score - a.score)
      .slice(0, 12)
      .map((entry) => entry.candidate);
  }, [catalogShelves, dossierItem, dossierSimilarPool, genreExtraItemsByKey]);

  // Close Movie/Series Details Page on Escape key when player is not active
  useEffect(() => {
    if (!dossierItem || playingSession) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDossierItem(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dossierItem, playingSession]);

  // "Surprise Me" Smart Movie / Series Roulette Pick
  const handleSurpriseMePick = useCallback(() => {
    if (!currentUser) {
      setAuthModalOpen(true);
      return;
    }
    const poolMap = new Map<string, StremioMediaItem>();
    for (const shelf of visibleShelves.length > 0 ? visibleShelves : catalogShelves) {
      for (const item of shelf.items) {
        if (item.id !== dossierItem?.id && !poolMap.has(item.id)) {
          poolMap.set(item.id, item);
        }
      }
    }
    for (const gShelf of genreCatalogShelves) {
      for (const item of gShelf.items) {
        if (item.id !== dossierItem?.id && !poolMap.has(item.id)) {
          poolMap.set(item.id, item);
        }
      }
    }
    const allCandidates = Array.from(poolMap.values());
    if (allCandidates.length === 0) return;

    const highRated = allCandidates.filter(
      (i) => Number.parseFloat(i.imdbRating || '0') >= 7.2,
    );
    const pickPool = highRated.length > 0 ? highRated : allCandidates;
    const chosen = pickPool[Math.floor(Math.random() * pickPool.length)];
    if (chosen) {
      setUserToastCard({
        kind: 'success',
        text: `Surprise Pick: "${chosen.name}"${chosen.imdbRating ? ` (★ ${chosen.imdbRating})` : ''}`,
      });
      openItemDossier(chosen);
    }
  }, [
    catalogShelves,
    currentUser,
    dossierItem?.id,
    genreCatalogShelves,
    openItemDossier,
    visibleShelves,
  ]);

  const effectiveNav: NavSection = currentUser ? activeNav : 'discover';

  return (
    <div className="spatial-app-shell" onScroll={handleMainViewportScroll}>
      {/* Top Navigation Bar (Scrolls naturally with page; hidden inside Video Player) */}
      {!playingSession && (
        <header className="spatial-top-dock">
        <div
          className="dock-brand"
          onClick={() => {
            handleNavigateSection('discover');
            setSearchInput('');
            setSearchQuery('');
          }}
        >
          <PopcornBrandLogo />
          <div className="dock-brand-copy">
            <span className="dock-brand-title">FABLEARC</span>
            <span className="dock-brand-tag mono">STORIES IN EVERY FRAME</span>
          </div>
        </div>

        {/* Center Segmented Navigation Pills */}
        <nav className="dock-nav-pills" aria-label="Main Navigation">
          <button
            type="button"
            className={`dock-nav-btn ${effectiveNav === 'discover' ? 'active' : ''}`}
            onClick={() => handleNavigateSection('discover')}
          >
            <Compass size={14} />
            <span>Discover</span>
          </button>
          <button
            type="button"
            className={`dock-nav-btn ${effectiveNav === 'movies' ? 'active' : ''}`}
            onClick={() => handleNavigateSection('movies')}
          >
            <Film size={14} />
            <span>Movies</span>
          </button>
          <button
            type="button"
            className={`dock-nav-btn ${effectiveNav === 'series' ? 'active' : ''}`}
            onClick={() => handleNavigateSection('series')}
          >
            <Tv size={14} />
            <span>TV Series</span>
          </button>
          <button
            type="button"
            className={`dock-nav-btn ${effectiveNav === 'library' ? 'active' : ''}`}
            onClick={() => handleNavigateSection('library')}
          >
            <Bookmark size={14} />
            <span>Watchlist</span>
            {currentUser && libraryItems.length > 0 && (
              <span className="dock-pill-badge mono">{libraryItems.length}</span>
            )}
          </button>
          <button
            type="button"
            className={`dock-nav-btn ${effectiveNav === 'addons' ? 'active' : ''}`}
            onClick={() => handleNavigateSection('addons')}
          >
            <Layers size={14} />
            <span>Addons</span>
            {currentUser && (
              <span className="dock-pill-badge mono">
                {addons.filter((a) => a.enabled).length}
              </span>
            )}
          </button>
          <button
            type="button"
            className="dock-nav-btn surprise-roulette-btn"
            onClick={handleSurpriseMePick}
            title="Pick a random top-rated Movie or Series for me!"
          >
            <Sparkles size={14} />
            <span>Surprise Me</span>
          </button>
          {currentUser?.role === 'admin' && (
            <button
              type="button"
              className={`dock-nav-btn ${effectiveNav === 'admin' ? 'active' : ''}`}
              onClick={() => handleNavigateSection('admin')}
            >
              <ShieldCheck size={14} />
              <span>Admin</span>
            </button>
          )}
        </nav>

        {/* Right Search & Action Controls */}
        <div className="dock-right-tools">
          <form
            className="dock-search-box"
            onSubmit={(e) => {
              e.preventDefault();
              if (!currentUser) {
                setAuthModalOpen(true);
                return;
              }
              const q = searchInput.trim();
              setSearchQuery(q);
              if (q && (activeNav === 'addons' || activeNav === 'library')) {
                setActiveNav('discover');
              }
            }}
          >
            <Search size={14} />
            <input
              type="search"
              placeholder="Search titles…"
              value={searchInput}
              onFocus={() => {
                if (!currentUser) {
                  setAuthModalOpen(true);
                }
              }}
              onChange={(e) => {
                if (!currentUser) {
                  setAuthModalOpen(true);
                  return;
                }
                const val = e.target.value;
                setSearchInput(val);
                if (!val.trim()) {
                  setSearchQuery('');
                }
                if (activeNav === 'addons' || activeNav === 'library') {
                  setActiveNav('discover');
                }
              }}
            />
            {searchInput && (
              <button
                type="button"
                className="clear-search-btn"
                onClick={() => {
                  setSearchInput('');
                  setSearchQuery('');
                }}
              >
                <X size={13} />
              </button>
            )}
          </form>

          <button
            type="button"
            className="dock-action-pill icon-only theme-switch-btn"
            onClick={toggleThemeMode}
            title={
              themeMode === 'dark'
                ? 'Switch to Light Mode'
                : 'Switch to Dark Mode'
            }
            aria-label="Toggle Dark or Light Theme"
          >
            {themeMode === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          </button>

          {currentUser ? (
            <div className="dock-user-cluster" ref={profileMenuRef}>
              <button
                type="button"
                className={`dock-profile-avatar-btn ${profileMenuOpen ? 'open' : ''}`}
                onClick={() => setProfileMenuOpen((prev) => !prev)}
                aria-expanded={profileMenuOpen}
                aria-haspopup="menu"
                aria-label={`Profile menu for ${currentUser.displayName}`}
              >
                <span
                  className="user-avatar-dot"
                  style={{ backgroundColor: currentUser.avatarColor }}
                >
                  {currentUser.displayName.slice(0, 1).toUpperCase()}
                </span>
                <span className="profile-hover-name-tooltip" role="tooltip">
                  <strong>{currentUser.displayName}</strong>
                  <span className="mono">{currentUser.role.toUpperCase()}</span>
                </span>
              </button>

              {profileMenuOpen && (
                <div className="dock-profile-dropdown" role="menu">
                  <div className="dock-profile-dropdown-head">
                    <span
                      className="dock-profile-dropdown-avatar"
                      style={{ backgroundColor: currentUser.avatarColor }}
                    >
                      {currentUser.displayName.slice(0, 1).toUpperCase()}
                    </span>
                    <div className="dock-profile-dropdown-meta">
                      <strong>{currentUser.displayName}</strong>
                      <span className="mono">{currentUser.email}</span>
                    </div>
                  </div>
                  <div className="dock-profile-dropdown-divider" />
                  <button
                    type="button"
                    className="dock-profile-menu-item"
                    role="menuitem"
                    onClick={() => {
                      setProfileMenuOpen(false);
                      setChangePasswordModalOpen(true);
                    }}
                  >
                    <KeyRound size={14} />
                    <span>Change Password</span>
                  </button>
                  <button
                    type="button"
                    className="dock-profile-menu-item danger"
                    role="menuitem"
                    onClick={() => {
                      setProfileMenuOpen(false);
                      handleLogout();
                    }}
                  >
                    <LogOut size={14} />
                    <span>Logout</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button
              type="button"
              className="neon-primary-btn compact-btn"
              onClick={() => setAuthModalOpen(true)}
            >
              <UserCheck size={14} />
              <span>Sign In</span>
            </button>
          )}
        </div>
      </header>
      )}

      {/* Auto-Dismissing 5-Second User Success / Status Card */}
      {userToastCard && (
        <div
          className={`user-floating-toast-card ${userToastCard.kind}`}
          role="status"
          aria-live="polite"
        >
          <Check size={15} />
          <span>{userToastCard.text}</span>
          <button
            type="button"
            className="user-toast-close-btn"
            onClick={() => setUserToastCard(null)}
            aria-label="Close notification"
          >
            <X size={13} />
          </button>
        </div>
      )}

      {/* Main Scroll Viewport (Unmounted when unauthenticated login gate is triggered so DevTools cannot bypass) */}
      {(!authModalOpen || Boolean(currentUser)) && (
        <main className="spatial-main-viewport">
          {(effectiveNav === 'discover' ||
            (currentUser && (effectiveNav === 'movies' || effectiveNav === 'series'))) && (
          <div className="spatial-scroll-flow">
            {/* =====================================================================
                TOP HERO: INTERACTIVE 3D MOVING CARDS SHOWCASE (TRENDING MOVIES & SERIES)
               ===================================================================== */}
            {activeHeroItem && !searchQuery.trim() && (
              <section className="top-moving-hero-stage">
                {/* Vivid Dual-Layer Movie Poster & Widescreen Backdrop Stage */}
                <div
                  className="hero-ambient-backdrop"
                  style={{
                    backgroundImage: [
                      activeHeroItem.background
                        ? `url(${activeHeroItem.background})`
                        : '',
                      activeHeroItem.poster ? `url(${activeHeroItem.poster})` : '',
                    ]
                      .filter(Boolean)
                      .join(', '),
                  }}
                />
                {(activeHeroItem.background || activeHeroItem.poster) && (
                  <img
                    key={`hero-bg-${activeHeroItem.id}`}
                    className="hero-backdrop-poster-art"
                    src={activeHeroItem.background || activeHeroItem.poster}
                    alt=""
                    aria-hidden="true"
                    onError={(e) => {
                      if (
                        activeHeroItem.poster &&
                        e.currentTarget.src !== activeHeroItem.poster
                      ) {
                        e.currentTarget.src = activeHeroItem.poster;
                      }
                    }}
                  />
                )}
                <div className="hero-vignette-mask" />

                <div className="top-moving-hero-inner">
                  {/* Left Column: Active Card Live Spotlight Metadata */}
                  <div className="hero-spotlight-col" key={activeHeroItem.id}>
                    <div className="hero-kicker-row">
                      <span className="hero-trending-pill">
                        <Flame size={13} />
                        <span>
                          TRENDING #{String(activeHeroIndex + 1).padStart(2, '0')}
                        </span>
                      </span>
                      <span className="hero-platform-pill">
                        <Sparkles size={12} />
                        <span>
                          {activeHeroItem.type === 'series'
                            ? 'FEATURED SERIES'
                            : 'FEATURED MOVIE'}
                        </span>
                      </span>
                      {activeHeroItem.imdbRating && (
                        <span className="hero-imdb-pill mono">
                          ★ IMDb {activeHeroItem.imdbRating}
                        </span>
                      )}
                      {activeHeroItem.releaseInfo && (
                        <span className="hero-year-pill mono">
                          {activeHeroItem.releaseInfo}
                        </span>
                      )}
                    </div>

                    <h1 className="hero-kinetic-title">{activeHeroItem.name}</h1>

                    {activeHeroItem.genres.length > 0 && (
                      <div className="hero-genre-tags">
                        {activeHeroItem.genres.slice(0, 4).map((g) => (
                          <span key={g} className="hero-genre-tag">
                            {g}
                          </span>
                        ))}
                      </div>
                    )}

                    {activeHeroItem.description && (
                      <p className="hero-spotlight-synopsis">
                        {activeHeroItem.description}
                      </p>
                    )}

                    <div className="hero-spotlight-actions">
                      <button
                        type="button"
                        className="neon-primary-btn"
                        onClick={() =>
                          startScreeningItem(
                            activeHeroItem,
                            undefined,
                            undefined,
                            progressMap[activeHeroItem.id]?.positionSec ?? 0,
                          )
                        }
                      >
                        <Play size={18} fill="currentColor" />
                        <span>
                          {progressMap[activeHeroItem.id]?.positionSec
                            ? `Resume (${Math.floor(progressMap[activeHeroItem.id].positionSec / 60)}m)`
                            : 'Watch Now'}
                        </span>
                      </button>

                      <button
                        type="button"
                        className="glass-secondary-btn"
                        onClick={() => openItemDossier(activeHeroItem)}
                      >
                        <Film size={16} />
                        <span>
                          {activeHeroItem.type === 'series'
                            ? 'Episodes & 4K Streams'
                            : '4K / 1080p Streams'}
                        </span>
                      </button>

                      <button
                        type="button"
                        className="glass-secondary-btn icon-btn"
                        onClick={() => toggleLibraryItem(activeHeroItem)}
                        title={
                          isInLibrary(activeHeroItem.id)
                            ? 'Saved in Watchlist'
                            : 'Add to Watchlist'
                        }
                      >
                        {isInLibrary(activeHeroItem.id) ? (
                          <BookmarkCheck size={17} />
                        ) : (
                          <Plus size={17} />
                        )}
                      </button>
                    </div>

                    {/* Deck Transport & Auto-Motion Controls */}
                    <div className="hero-deck-transport">
                      <button
                        type="button"
                        className="deck-step-btn"
                        onClick={() => stepHeroCard(-1)}
                        title="Previous Trending Card"
                      >
                        <ChevronLeft size={16} />
                      </button>
                      <button
                        type="button"
                        className="deck-step-btn"
                        onClick={() => setHeroAutoPlay((p) => !p)}
                        title={heroAutoPlay ? 'Pause Moving Cards' : 'Play Moving Cards'}
                      >
                        {heroAutoPlay ? <Pause size={14} /> : <Play size={14} />}
                      </button>
                      <button
                        type="button"
                        className="deck-step-btn"
                        onClick={() => stepHeroCard(1)}
                        title="Next Trending Card"
                      >
                        <ChevronRight size={16} />
                      </button>

                      <div className="hero-progress-dots">
                        {heroMovingCards.map((c, idx) => (
                          <button
                            key={c.id}
                            type="button"
                            className={`hero-dot ${idx === activeHeroIndex ? 'active' : ''}`}
                            onClick={() => {
                              setHeroAutoPlay(true);
                              setActiveHeroIndex(idx);
                            }}
                            aria-label={`Select ${c.name}`}
                          />
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Right Column: 3D Spatial Moving Cards Deck (Coverflow / Conveyor) */}
                  <div className="hero-3d-cards-stage">
                    <div className="hero-3d-track">
                      {heroMovingCards.map((cardItem, idx) => {
                        const total = heroMovingCards.length;
                        let rel = idx - activeHeroIndex;
                        if (rel < -Math.floor(total / 2)) rel += total;
                        if (rel > Math.floor(total / 2)) rel -= total;

                        // Show active card (0), 1 previous card (-1), and upcoming cards (+1, +2, +3 on desktop; +1, +2 on phone)
                        const maxVisibleRight = viewportWidth <= 480 ? 2 : 3;
                        const isVisible = rel >= -1 && rel <= maxVisibleRight;
                        const stepX =
                          viewportWidth <= 480
                            ? 68
                            : viewportWidth <= 768
                              ? 94
                              : viewportWidth <= 1024
                                ? 114
                                : 142;
                        const stepZ =
                          viewportWidth <= 480
                            ? 52
                            : viewportWidth <= 768
                              ? 66
                              : 85;
                        const translateX = rel * stepX;
                        const translateZ = -Math.abs(rel) * stepZ;
                        const rotateY = rel === 0 ? 0 : rel > 0 ? -18 : 18;
                        const scale = rel === 0 ? 1.05 : Math.max(0.76, 1 - Math.abs(rel) * 0.09);
                        const opacity = !isVisible
                          ? 0
                          : rel === 0
                            ? 1
                            : Math.max(0.28, 0.88 - Math.abs(rel) * 0.2);
                        const zIndex = 20 - Math.abs(rel);

                        return (
                          <div
                            key={cardItem.id}
                            className={`hero-3d-card ${rel === 0 ? 'is-active' : ''}`}
                            style={{
                              transform: `translate3d(${translateX}px, 0px, ${translateZ}px) rotateY(${rotateY}deg) scale(${scale})`,
                              opacity,
                              zIndex,
                              pointerEvents: isVisible ? 'auto' : 'none',
                            }}
                            onClick={() => {
                              if (rel === 0) {
                                openItemDossier(cardItem);
                              } else {
                                setHeroAutoPlay(true);
                                setActiveHeroIndex(idx);
                              }
                            }}
                          >
                            <img src={cardItem.poster} alt={cardItem.name} />
                            <div className="hero-3d-card-sheen" />
                            <div className="hero-3d-card-overlay">
                              <div className="hero-3d-card-top">
                                <span className="hero-3d-rank mono">
                                  #{String(idx + 1).padStart(2, '0')}
                                </span>
                                {cardItem.imdbRating && (
                                  <span className="hero-3d-rating mono">
                                    ★ {cardItem.imdbRating}
                                  </span>
                                )}
                              </div>

                              <div className="hero-3d-card-bottom">
                                <span className="hero-3d-type">
                                  {cardItem.type === 'series' ? 'SERIES' : 'MOVIE'}
                                </span>
                                <strong>{cardItem.name}</strong>
                                {rel === 0 && (
                                  <button
                                    type="button"
                                    className="hero-3d-play-pill"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      startScreeningItem(
                                        cardItem,
                                        undefined,
                                        undefined,
                                        progressMap[cardItem.id]?.positionSec ?? 0,
                                      );
                                    }}
                                  >
                                    <Play size={13} fill="currentColor" />
                                    <span>Stream Now</span>
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </section>
            )}

            {/* Platform Emblem Logos & Genre Filter Ribbon */}
            <section className="spatial-filter-ribbon">
              {/* Platform section commented out (code preserved):
              <div className="ribbon-scroll-row">
                <button
                  type="button"
                  className={`platform-chip logo-chip ${selectedServiceFilter === 'all' ? 'active' : ''}`}
                  onClick={() => setSelectedServiceFilter('all')}
                  title={`All Platforms (${catalogShelves.length})`}
                >
                  <PlatformLogoEmblem serviceId="all" size="md" title="All Platforms" />
                  <span className="platform-chip-code mono">ALL ({catalogShelves.length})</span>
                </button>
                {availableServiceTabs.map((svc) => (
                  <button
                    key={svc.id}
                    type="button"
                    className={`platform-chip logo-chip ${selectedServiceFilter === svc.id ? 'active' : ''}`}
                    onClick={() => setSelectedServiceFilter(svc.id)}
                    title={`Filter by ${svc.id.toUpperCase()}`}
                  >
                    <PlatformLogoEmblem
                      serviceId={svc.id}
                      accentColor={svc.accentColor}
                      size="md"
                      title={svc.id.toUpperCase()}
                    />
                  </button>
                ))}
                <button
                  type="button"
                  className="mini-refresh-btn"
                  onClick={() => setConfigModalOpen(true)}
                >
                  <Plus size={13} />
                  <span>Add Platforms</span>
                </button>
              </div>
              */}

              {allGenres.length > 1 && (
                <div className="ribbon-scroll-row secondary">
                  {allGenres.map((genre) => (
                    <button
                      key={genre}
                      type="button"
                      className={`genre-pill ${selectedGenre === genre ? 'active' : ''}`}
                      onClick={() => {
                        if (!currentUser) {
                          setAuthModalOpen(true);
                          return;
                        }
                        setSelectedGenre(genre);
                      }}
                    >
                      {genre}
                    </button>
                  ))}
                </div>
              )}
            </section>

            {/* Continue Watching Shelf (with Single Item Delete & Clear All) */}
            {continueWatchingEntries.length > 0 && !searchQuery.trim() && (
              <section className="catalog-shelf">
                <div className="shelf-header">
                  <div className="shelf-title-group">
                    <h2>Continue Watching</h2>
                    <span className="shelf-subtitle mono">
                      {continueWatchingEntries.length} IN PROGRESS · RESUME INSTANTLY
                    </span>
                  </div>
                  <div className="shelf-controls">
                    <button
                      type="button"
                      className="danger-btn clear-all-continue-btn"
                      onClick={clearAllContinueWatching}
                      title="Delete all items from Continue Watching"
                    >
                      <Trash2 size={13} />
                      <span>Clear All</span>
                    </button>
                    <div className="carousel-nav-btns">
                      <button
                        type="button"
                        className="carousel-arrow-btn"
                        onClick={() => scrollContinueTrack('left')}
                        aria-label="Scroll Continue Watching left"
                      >
                        <ChevronLeft size={17} />
                      </button>
                      <button
                        type="button"
                        className="carousel-arrow-btn"
                        onClick={() => scrollContinueTrack('right')}
                        aria-label="Scroll Continue Watching right"
                      >
                        <ChevronRight size={17} />
                      </button>
                    </div>
                  </div>
                </div>
                <div className="continue-cards-row" ref={continueTrackRef}>
                  {continueWatchingEntries.map((entry) => {
                    const pct =
                      entry.durationSec > 0
                        ? Math.min(
                            100,
                            Math.round((entry.positionSec / entry.durationSec) * 100),
                          )
                        : 15;
                    const playContinueEntry = () =>
                      startScreeningItem(
                        {
                          id: entry.mediaId,
                          imdbId: entry.mediaId.startsWith('tt')
                            ? entry.mediaId
                            : undefined,
                          name: entry.mediaName,
                          type: entry.mediaType,
                          poster: entry.poster,
                          background: entry.background,
                          genres: [],
                          cast: [],
                          director: [],
                          writer: [],
                          trailers: [],
                          videos: [],
                        },
                        undefined,
                        undefined,
                        entry.positionSec,
                      );

                    return (
                      <article
                        key={entry.mediaId}
                        className="continue-card"
                        role="button"
                        tabIndex={0}
                        onClick={playContinueEntry}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            playContinueEntry();
                          }
                        }}
                        title={`Resume watching ${entry.mediaName}`}
                      >
                        <div className="continue-card-art">
                          <div
                            className="continue-card-backdrop"
                            style={{
                              backgroundImage: `url(${entry.background || entry.poster || ''})`,
                            }}
                          />
                          <div className="continue-card-hover-veil" />
                          <button
                            type="button"
                            className="continue-delete-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeContinueWatchingItem(entry.mediaId);
                            }}
                            title={`Remove ${entry.mediaName} from Continue Watching`}
                            aria-label={`Remove ${entry.mediaName}`}
                          >
                            <Trash2 size={14} />
                          </button>
                          <div className="continue-play-trigger" aria-hidden="true">
                            <Play size={20} fill="currentColor" />
                          </div>
                          <div className="continue-progress-track">
                            <div
                              className="continue-progress-fill"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                        <div className="continue-card-info">
                          <strong>{entry.mediaName}</strong>
                          <span className="mono">
                            {entry.episodeLabel ? `${entry.episodeLabel} · ` : ''}
                            {Math.floor(entry.positionSec / 60)}m
                          </span>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Live Search Results */}
            {searchQuery.trim().length >= 2 && (
              <section className="catalog-shelf">
                <div className="shelf-header">
                  <div className="shelf-title-group">
                    <h2>Search Results for “{searchQuery.trim()}”</h2>
                    <span className="shelf-subtitle mono">
                      {searchingRemote
                        ? 'SEARCHING…'
                        : `${remoteSearchItems.length} RESULTS`}
                    </span>
                  </div>
                </div>
                {remoteSearchItems.length > 0 ? (
                  <div className="poster-grid">
                    {[...remoteSearchItems]
                      .sort((a, b) => {
                        if (effectiveMediaTypeFilter === 'all') return 0;
                        const aMatch = a.type === effectiveMediaTypeFilter ? 1 : 0;
                        const bMatch = b.type === effectiveMediaTypeFilter ? 1 : 0;
                        return bMatch - aMatch;
                      })
                      .slice(0, 36)
                      .map((item) => (
                        <PosterCard
                          key={`search-${item.id}`}
                          item={item}
                          inLibrary={isInLibrary(item.id)}
                          onPlay={(i) =>
                            startScreeningItem(
                              i,
                              undefined,
                              undefined,
                              progressMap[i.id]?.positionSec ?? 0,
                            )
                          }
                          onOpenDossier={openItemDossier}
                          onToggleLibrary={toggleLibraryItem}
                        />
                      ))}
                  </div>
                ) : (
                  !searchingRemote && (
                    <div className="empty-state-box">
                      <p>No titles found matching “{searchQuery.trim()}”.</p>
                    </div>
                  )
                )}
              </section>
            )}

            {/* Loading State when bootstrapping */}
            {(bootstrappingAddons || loadingCatalogs) && catalogShelves.length === 0 && (
              <div className="empty-state-box">
                <p>
                  Grab your popcorn! Loading movies and TV series…
                </p>
              </div>
            )}

            {/* Horizontal Catalog Shelves (Featured Movies & Featured Series) */}
            {visibleShelves.map((shelf, sIdx) => (
              <HorizontalShelfRow
                key={shelf.key}
                shelf={shelf}
                showRanks={sIdx < 2}
                isInLibrary={isInLibrary}
                onPlay={(item) =>
                  startScreeningItem(
                    item,
                    undefined,
                    undefined,
                    progressMap[item.id]?.positionSec ?? 0,
                  )
                }
                onOpenDossier={openItemDossier}
                onToggleLibrary={toggleLibraryItem}
                onConfigureServices={() => setConfigModalOpen(true)}
                onLoadMore={handleLoadMoreShelf}
              />
            ))}

            {/* Dedicated Alphabetical Genre Sections (Movies then Series per Genre) */}
            {genreCatalogShelves.length > 0 && (
              <div className="genre-sections-group">
                {genreCatalogShelves.map((gShelf) => (
                  <HorizontalShelfRow
                    key={gShelf.key}
                    shelf={gShelf}
                    showRanks={false}
                    isInLibrary={isInLibrary}
                    onPlay={(item) =>
                      startScreeningItem(
                        item,
                        undefined,
                        undefined,
                        progressMap[item.id]?.positionSec ?? 0,
                      )
                    }
                    onOpenDossier={openItemDossier}
                    onToggleLibrary={toggleLibraryItem}
                    onLoadMore={handleLoadMoreShelf}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* WATCHLIST / LIBRARY VIEW (Authenticated Users Only — With Custom Collection Tabs & Personal 1-5★ Ratings) */}
        {currentUser && effectiveNav === 'library' && (
          <div className="spatial-scroll-flow padded-top">
            <section className="catalog-shelf">
              <div className="shelf-header" style={{ flexWrap: 'wrap', gap: 12 }}>
                <div className="shelf-title-group">
                  <h2>My Watchlist &amp; Collections</h2>
                  <span className="shelf-subtitle mono">
                    {libraryItems.length} SAVED TITLES
                  </span>
                </div>

                {/* Custom Watchlist Collection Filter Tabs */}
                <div className="watchlist-collection-tabs">
                  {(
                    [
                      { id: 'all', label: 'All Saved' },
                      { id: 'watching', label: 'Watching' },
                      { id: 'plan', label: 'Plan to Watch' },
                      { id: 'completed', label: 'Completed' },
                      { id: 'favorites', label: '★ Favorites' },
                    ] as const
                  ).map((tab) => {
                    const count =
                      tab.id === 'all'
                        ? libraryItems.length
                        : libraryItems.filter(
                            (i) => (watchlistMetaById[i.id]?.status ?? 'plan') === tab.id,
                          ).length;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        className={`genre-pill ${watchlistFilterTab === tab.id ? 'active' : ''}`}
                        onClick={() => setWatchlistFilterTab(tab.id)}
                      >
                        {tab.label} ({count})
                      </button>
                    );
                  })}
                </div>
              </div>

              {libraryItems.length === 0 ? (
                <div className="empty-state-box">
                  <p>Your watchlist is empty. Save movies or series while browsing to find them here.</p>
                  <button
                    type="button"
                    className="neon-primary-btn"
                    onClick={() => setActiveNav('discover')}
                  >
                    Explore Trending Titles
                  </button>
                </div>
              ) : (
                <div className="poster-grid">
                  {libraryItems
                    .filter((item) => {
                      if (watchlistFilterTab === 'all') return true;
                      const st = watchlistMetaById[item.id]?.status ?? 'plan';
                      return st === watchlistFilterTab;
                    })
                    .map((item) => {
                      const itemMeta = watchlistMetaById[item.id] ?? { status: 'plan' as const };
                      return (
                        <div key={item.id} className="watchlist-card-wrapper">
                          <PosterCard
                            item={item}
                            inLibrary={true}
                            onPlay={(i) => openItemDossier(i)}
                            onOpenDossier={openItemDossier}
                            onToggleLibrary={toggleLibraryItem}
                          />
                          <div className="watchlist-item-controls">
                            <select
                              className="watchlist-status-select"
                              value={itemMeta.status}
                              aria-label={`Collection status for ${item.name}`}
                              onChange={(e) =>
                                updateWatchlistMeta(item.id, {
                                  status: e.target.value as
                                    | 'watching'
                                    | 'plan'
                                    | 'completed'
                                    | 'favorites',
                                })
                              }
                            >
                              <option value="plan">Plan to Watch</option>
                              <option value="watching">Watching</option>
                              <option value="completed">Completed</option>
                              <option value="favorites">★ Favorites</option>
                            </select>
                            <div className="watchlist-star-picker" title="Your Personal Rating">
                              {[1, 2, 3, 4, 5].map((starVal) => (
                                <button
                                  key={starVal}
                                  type="button"
                                  className={`star-rate-btn ${(itemMeta.userRating ?? 0) >= starVal ? 'filled' : ''}`}
                                  onClick={() =>
                                    updateWatchlistMeta(item.id, { userRating: starVal })
                                  }
                                >
                                  ★
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </section>
          </div>
        )}

        {/* ADDONS HUB VIEW (Authenticated Users Only) */}
        {currentUser && effectiveNav === 'addons' && (
          <div className="spatial-scroll-flow padded-top">
            <section className="addons-manager-section">
              <div className="addons-intro-card">
                <div>
                  <h2>Addons &amp; Sources</h2>
                  <p>
                    Your streaming and subtitle sources are pre-installed and active. You can also
                    paste an addon link below to add more sources.
                  </p>
                </div>

                <form
                  className="addon-install-form"
                  onSubmit={(e) => handleInstallAddon(newAddonUrl, e)}
                >
                  <input
                    type="text"
                    className="mono"
                    placeholder="Paste addon link (https://...)"
                    value={newAddonUrl}
                    onChange={(e) => setNewAddonUrl(e.target.value)}
                  />
                  <button type="submit" className="neon-primary-btn">
                    <Plus size={16} />
                    <span>Add Source</span>
                  </button>
                </form>

                {addonInstallStatus.kind !== 'idle' && (
                  <div className={`addon-status-notice ${addonInstallStatus.kind}`}>
                    <span>{addonInstallStatus.message}</span>
                  </div>
                )}
              </div>

              <div className="shelf-header" style={{ marginTop: 8 }}>
                <div className="shelf-title-group">
                  <h2>Installed Addons ({addons.length})</h2>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <button
                    type="button"
                    className="glass-secondary-btn compact-btn reload-catalogs-addon-btn"
                    onClick={async () => {
                      await loadAllAddonCatalogs();
                      setAddonInstallStatus({
                        kind: 'success',
                        message: 'Reloaded live catalogs from all enabled addons.',
                      });
                      setUserToastCard({
                        kind: 'success',
                        text: 'Reloaded live catalogs from all enabled addons.',
                      });
                    }}
                    disabled={loadingCatalogs}
                    title="Reload live catalogs from all enabled addons"
                  >
                    <RefreshCw size={14} className={loadingCatalogs ? 'spin-icon' : ''} />
                    <span>{loadingCatalogs ? 'Reloading Catalogs…' : 'Reload Catalogs'}</span>
                  </button>
                </div>
                {/* Configure Streaming Platforms button commented out (code preserved):
                <button
                  type="button"
                  className="glass-secondary-btn"
                  onClick={() => setConfigModalOpen(true)}
                >
                  <SlidersHorizontal size={14} />
                  <span>Configure Streaming Platforms</span>
                </button>
                */}
              </div>

              <div className="installed-addons-list">
                {addons.map((addon) => {
                  const isEditingThisAddon = editingAddonId === addon.manifest.id;
                  return (
                    <article key={addon.manifest.id} className="addon-row-card">
                      <div className="addon-row-main">
                        <div className="addon-title-line">
                          <AddonSvgEmblem
                            addonId={addon.manifest.id}
                            addonName={addon.manifest.name}
                            size={36}
                          />
                          <h3>{addon.manifest.name}</h3>
                          <span className="mono tech-badge">v{addon.manifest.version}</span>
                          <span className="tech-badge safe-tag">
                            {addon.manifest.catalogs.length} Catalogs
                          </span>
                        </div>
                        <p>{stripDiscordText(addon.manifest.description)}</p>
                        <code className="mono addon-url-code">{addon.manifestUrl}</code>

                        {isEditingThisAddon && (
                          <form
                            className="addon-edit-inline-form"
                            onSubmit={(e) => handleSaveEditedAddon(addon, e)}
                          >
                            <div className="addon-edit-fields">
                              <label className="addon-edit-field">
                                <span>Display Name</span>
                                <input
                                  type="text"
                                  value={editAddonNameInput}
                                  onChange={(e) => setEditAddonNameInput(e.target.value)}
                                  placeholder="Addon Display Name"
                                />
                              </label>
                              <label className="addon-edit-field addon-edit-url-field">
                                <span>Manifest URL (Isolated to your account)</span>
                                <input
                                  type="text"
                                  className="mono"
                                  value={editAddonUrlInput}
                                  onChange={(e) => setEditAddonUrlInput(e.target.value)}
                                  placeholder="https://.../manifest.json"
                                />
                              </label>
                            </div>
                            {editAddonError && (
                              <div className="addon-status-notice error" style={{ marginTop: 8 }}>
                                <span>{editAddonError}</span>
                              </div>
                            )}
                            <div className="addon-edit-btn-row">
                              <button
                                type="submit"
                                className="neon-primary-btn compact-btn"
                                disabled={editAddonSaving}
                              >
                                <Check size={14} />
                                <span>{editAddonSaving ? 'Saving…' : 'Save Changes'}</span>
                              </button>
                              <button
                                type="button"
                                className="glass-secondary-btn compact-btn"
                                onClick={handleCancelEditAddon}
                                disabled={editAddonSaving}
                              >
                                <X size={14} />
                                <span>Cancel</span>
                              </button>
                            </div>
                          </form>
                        )}
                      </div>

                      <div className="addon-row-actions">
                        {/* Streaming Catalogs configure button commented out (code preserved):
                        {addon.manifest.id === 'pw.ers.netflix-catalog' && (
                          <button
                            type="button"
                            className="neon-primary-btn compact-btn"
                            onClick={() => {
                              setStreamingConfig(parseStreamingCatalogsConfig(addon.manifestUrl));
                              setConfigModalOpen(true);
                            }}
                          >
                            <SlidersHorizontal size={14} />
                            <span>Configure</span>
                          </button>
                        )}
                        */}
                        <button
                          type="button"
                          className="glass-secondary-btn compact-btn"
                          onClick={() =>
                            isEditingThisAddon
                              ? handleCancelEditAddon()
                              : handleStartEditAddon(addon)
                          }
                          title="Edit addon URL or name for your account"
                        >
                          <Pencil size={13} />
                          <span>{isEditingThisAddon ? 'Close' : 'Edit'}</span>
                        </button>
                        <label className="inline-checkbox">
                          <input
                            type="checkbox"
                            checked={addon.enabled}
                            onChange={(e) => {
                              const nextEnabled = e.target.checked;
                              setAddons((prev) => {
                                const nextList = prev.map((a) =>
                                  a.manifest.id === addon.manifest.id
                                    ? { ...a, enabled: nextEnabled }
                                    : a,
                                );
                                persistProvidersToDb(nextList);
                                return nextList;
                              });
                              const msg = `${nextEnabled ? 'Enabled' : 'Disabled'} "${addon.manifest.name}".`;
                              setAddonInstallStatus({ kind: 'success', message: msg });
                              setUserToastCard({ kind: 'success', text: msg });
                            }}
                          />
                          <span>Enabled</span>
                        </label>
                        <button
                          type="button"
                          className="danger-btn"
                          onClick={() => {
                            setAddons((prev) => {
                              const nextList = prev.filter(
                                (a) => a.manifest.id !== addon.manifest.id,
                              );
                              persistProvidersToDb(nextList);
                              return nextList;
                            });
                            const msg = `Removed "${addon.manifest.name}" from your account.`;
                            setAddonInstallStatus({ kind: 'success', message: msg });
                            setUserToastCard({ kind: 'success', text: msg });
                          }}
                          title="Remove addon"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          </div>
        )}

        {/* ADMIN CONTROL CONSOLE VIEW */}
        {effectiveNav === 'admin' && currentUser?.role === 'admin' && authToken && (
          <AdminDashboardView
            authToken={authToken}
            currentAdminId={currentUser.id}
            onCurrentUserUpdated={(updatedUser) => {
              setCurrentUser({
                id: updatedUser.id,
                email: updatedUser.email,
                displayName: updatedUser.displayName,
                avatarColor: updatedUser.avatarColor,
                role: updatedUser.role,
                createdAtIso: updatedUser.createdAtIso,
              });
            }}
          />
        )}
        </main>
      )}

      {/* Streaming Catalogs Configurator Modal (Commented out — code preserved):
      {configModalOpen && (
        <div className="dossier-backdrop" onClick={() => setConfigModalOpen(false)}>
          <aside
            className="dossier-drawer"
            style={{ width: 'min(680px, 95vw)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="drawer-header" style={{ padding: '20px 24px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 18 }}>
                  Customize Streaming Platforms
                </h3>
                <span className="mono" style={{ fontSize: 12, color: '#9499A6' }}>
                  Select the streaming services displayed across your home shelves
                </span>
              </div>
              <button
                type="button"
                className="player-icon-btn"
                onClick={() => setConfigModalOpen(false)}
              >
                <X size={18} />
              </button>
            </div>

            <form
              className="dossier-body"
              onSubmit={handleApplyStreamingCatalogsConfig}
              style={{ gap: 20 }}
            >
              <div className="dossier-section">
                <span className="drawer-label">1. Region &amp; Optional RPDB Key</span>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="sandbox-field-group">
                    <label>Catalog Country</label>
                    <select
                      value={streamingConfig.countryCode}
                      onChange={(e) =>
                        setStreamingConfig((c) => ({
                          ...c,
                          countryCode: e.target.value,
                          netflixTop10CountryCode: e.target.value,
                        }))
                      }
                      style={{
                        padding: '10px 12px',
                        borderRadius: 8,
                        background: 'var(--bg-cosmos)',
                        color: 'var(--text-bright)',
                        border: '1px solid var(--border-subtle)',
                      }}
                    >
                      {STREAMING_CATALOG_COUNTRIES.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.name} ({c.code})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="sandbox-field-group">
                    <label>RPDB Key (Optional)</label>
                    <input
                      type="text"
                      className="mono"
                      placeholder="t0-..."
                      value={streamingConfig.rpdbKey}
                      onChange={(e) =>
                        setStreamingConfig((c) => ({ ...c, rpdbKey: e.target.value }))
                      }
                    />
                  </div>
                </div>
              </div>

              <div className="dossier-section">
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <span className="drawer-label">
                    2. Select Streaming Platforms ({streamingConfig.providers.length} active)
                  </span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      type="button"
                      className="mini-refresh-btn"
                      onClick={() =>
                        setStreamingConfig((c) => ({
                          ...c,
                          providers: ['nfx', 'hbm', 'dnp', 'amp', 'atp'],
                        }))
                      }
                    >
                      Top 5 Default
                    </button>
                    <button
                      type="button"
                      className="mini-refresh-btn"
                      onClick={() =>
                        setStreamingConfig((c) => ({
                          ...c,
                          providers: [
                            'nfx',
                            'hbm',
                            'dnp',
                            'amp',
                            'atp',
                            'pmp',
                            'pcp',
                            'hlu',
                            'cru',
                            'jhs',
                            'zee',
                            'sonyliv',
                            'mbi',
                          ],
                        }))
                      }
                    >
                      Global + India Pack
                    </button>
                  </div>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(145px, 1fr))',
                    gap: 8,
                  }}
                >
                  {STREAMING_CATALOG_SERVICES.map((service) => {
                    const active = streamingConfig.providers.includes(service.id);
                    return (
                      <button
                        key={service.id}
                        type="button"
                        onClick={() =>
                          setStreamingConfig((c) => ({
                            ...c,
                            providers: active
                              ? c.providers.filter((id) => id !== service.id)
                              : [...c.providers, service.id],
                          }))
                        }
                        className={`service-Select-tile ${active ? 'active' : ''}`}
                        style={{
                          borderColor: active ? service.accentColor : undefined,
                        }}
                        title={service.shortTag}
                      >
                        <PlatformLogoEmblem
                          serviceId={service.id}
                          accentColor={service.accentColor}
                          size="sm"
                          title={service.shortTag}
                        />
                        <span
                          className="mono"
                          style={{
                            fontSize: 10.5,
                            padding: '2px 6px',
                            borderRadius: 4,
                            backgroundColor: active
                              ? service.accentColor
                              : 'var(--surface-elevated)',
                            color: active ? '#ffffff' : 'var(--text-bright)',
                            fontWeight: 700,
                          }}
                        >
                          {service.shortTag}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="glass-secondary-btn"
                  onClick={() => setConfigModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="neon-primary-btn"
                  disabled={applyingConfig}
                >
                  <Globe size={16} />
                  <span>
                    {applyingConfig ? 'Applying…' : 'Save & Reload Catalogs'}
                  </span>
                </button>
              </div>
            </form>
          </aside>
        </div>
      )}
      */}

      {/* Full-Screen Movie & Series Details Page + Decreasing Quality Stream Picker + Similar Titles (Authenticated Only) */}
      {currentUser && dossierItem && (
        <div
          className="dossier-backdrop details-page-backdrop"
          onClick={() => setDossierItem(null)}
        >
          <aside
            ref={dossierScrollRef}
            className="dossier-drawer details-page-container"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Sticky Top Bar inside Details Page */}
            <header className="details-page-topbar">
              <button
                type="button"
                className="details-back-btn"
                onClick={() => setDossierItem(null)}
              >
                <ChevronLeft size={18} />
                <span>Back to Browse</span>
              </button>
              <div className="details-breadcrumb mono">
                <span>{dossierItem.type === 'series' ? 'TV SERIES' : 'MOVIE'}</span>
                {dossierItem.genres[0] && (
                  <>
                    <span>·</span>
                    <span>{dossierItem.genres[0].toUpperCase()}</span>
                  </>
                )}
                <span>·</span>
                <span className="breadcrumb-current">{dossierItem.name}</span>
              </div>
              <button
                type="button"
                className="player-icon-btn dossier-close"
                onClick={() => setDossierItem(null)}
                title="Close Details (Esc)"
              >
                <X size={18} />
              </button>
            </header>

            {/* Cinematic Hero Banner with Poster + Rating + One Play Button + Actions */}
            <div
              className="dossier-hero-banner details-hero-banner"
              style={{
                backgroundImage: `linear-gradient(180deg, rgba(8,10,16,0.45) 0%, rgba(10,12,20,0.92) 78%, #0a0c14 100%), url(${dossierItem.background || dossierItem.poster || ''})`,
              }}
            >
              <div className="details-hero-inner">
                {/* Left Crisp 2:3 Poster Card */}
                <div className="details-poster-frame">
                  {dossierItem.poster ? (
                    <img src={dossierItem.poster} alt={dossierItem.name} />
                  ) : (
                    <div className="poster-fallback-art">
                      <Clapperboard size={36} />
                      <span>{dossierItem.name}</span>
                    </div>
                  )}
                </div>

                {/* Right Details Metadata & Primary Controls */}
                <div className="details-hero-copy">
                  <div className="details-badge-strip">
                    <span
                      className={`poster-type-pill ${dossierItem.type === 'series' ? 'series' : 'movie'}`}
                    >
                      {dossierItem.type === 'series' ? 'TV SERIES' : 'MOVIE'}
                    </span>
                    <span className="details-imdb-badge mono">
                      <Star size={13} fill="currentColor" />
                      <strong>
                        {dossierItem.imdbRating ? `${dossierItem.imdbRating} / 10` : 'IMDb Rated'}
                      </strong>
                    </span>
                    {(dossierItem.releaseInfo || dossierItem.year) && (
                      <span className="details-meta-pill mono">
                        {dossierItem.releaseInfo || dossierItem.year}
                      </span>
                    )}
                    {dossierItem.runtime && (
                      <span className="details-meta-pill mono">{dossierItem.runtime}</span>
                    )}
                    {dossierStreams[0]?.qualityBadge && (
                      <span className="quality-tier-badge tier-4k">
                        {dossierStreams[0].qualityBadge}
                      </span>
                    )}
                    {dossierStreams.some((s) => s.audioBadge) && (
                      <span className="multi-audio-badge">Multi-Audio</span>
                    )}
                  </div>

                  <h1 className="details-main-title">{dossierItem.name}</h1>

                  {/* Clickable Genre Pills */}
                  {dossierItem.genres.length > 0 && (
                    <div className="details-genre-pills">
                      {dossierItem.genres.map((g) => (
                        <button
                          key={g}
                          type="button"
                          className="details-genre-chip"
                          onClick={() => {
                            setSelectedGenre(g);
                            setDossierItem(null);
                          }}
                          title={`Explore ${g} titles`}
                        >
                          {g}
                        </button>
                      ))}
                    </div>
                  )}

                  {dossierItem.description && (
                    <p className="dossier-synopsis details-synopsis">
                      {dossierItem.description}
                    </p>
                  )}

                  {/* Primary Action Bar: One Prominent Play Button + Secondary Controls */}
                  <div className="details-action-bar">
                    <button
                      type="button"
                      className="neon-primary-btn details-play-main-btn"
                      onClick={() => {
                        const target = dossierItem;
                        const currentStreams = [...dossierStreams];
                        const preRankedBest = currentStreams.find(
                          (s) => s.isTopResponsive && !s.unreachable,
                        );
                        const resumePos = progressMap[target.id]?.positionSec ?? 0;
                        setDossierItem(null);
                        startScreeningItem(
                          target,
                          target.videos[0],
                          preRankedBest,
                          resumePos,
                          currentStreams,
                        );
                      }}
                    >
                      <Play size={18} fill="currentColor" />
                      <span>
                        {(progressMap[dossierItem.id]?.positionSec ?? 0) > 15
                          ? `Resume (${Math.floor((progressMap[dossierItem.id]?.positionSec ?? 0) / 60)}m)`
                          : dossierItem.type === 'series'
                            ? 'Play Episode 1'
                            : 'Play Movie'}
                      </span>
                    </button>

                    {(progressMap[dossierItem.id]?.positionSec ?? 0) > 15 && (
                      <button
                        type="button"
                        className="glass-secondary-btn"
                        onClick={() => {
                          const target = dossierItem;
                          const currentStreams = [...dossierStreams];
                          const preRankedBest = currentStreams.find(
                            (s) => s.isTopResponsive && !s.unreachable,
                          );
                          setDossierItem(null);
                          startScreeningItem(
                            target,
                            target.videos[0],
                            preRankedBest,
                            0,
                            currentStreams,
                          );
                        }}
                      >
                        <RefreshCw size={15} />
                        <span>Start Over</span>
                      </button>
                    )}

                    <button
                      type="button"
                      className="glass-secondary-btn"
                      onClick={() => toggleLibraryItem(dossierItem)}
                    >
                      {isInLibrary(dossierItem.id) ? (
                        <>
                          <BookmarkCheck size={15} />
                          <span>In Watchlist</span>
                        </>
                      ) : (
                        <>
                          <Plus size={15} />
                          <span>Add to Watchlist</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      className={`glass-secondary-btn ${dossierShowStreams ? 'active-chip-btn' : ''}`}
                      onClick={() => setDossierShowStreams((prev) => !prev)}
                    >
                      <Layers size={15} />
                      <span>
                        {dossierLoadingStreams
                          ? 'Loading Servers…'
                          : dossierBenchmarkingServers
                            ? `Testing Fastest Server (${dossierStreams.length})…`
                            : `Servers & Quality (${dossierStreams.length})`}
                      </span>
                    </button>

                    <button
                      type="button"
                      className="glass-secondary-btn"
                      onClick={handleSurpriseMePick}
                      title="Pick another random top-rated Movie or Series"
                    >
                      <Sparkles size={15} />
                      <span>Surprise Me</span>
                    </button>
                  </div>

                  {/* Personal Collection Status & 1-5★ Rating Bar inside Details Page */}
                  <div className="details-personal-rating-bar">
                    <div className="details-collection-pills">
                      <span className="drawer-label" style={{ marginRight: 4 }}>
                        Collection:
                      </span>
                      {(
                        [
                          { id: 'plan', label: 'Plan to Watch' },
                          { id: 'watching', label: 'Watching' },
                          { id: 'completed', label: 'Completed' },
                          { id: 'favorites', label: '★ Favorite' },
                        ] as const
                      ).map((col) => {
                        const activeCol =
                          isInLibrary(dossierItem.id) &&
                          (watchlistMetaById[dossierItem.id]?.status ?? 'plan') === col.id;
                        return (
                          <button
                            key={col.id}
                            type="button"
                            className={`mini-refresh-btn ${activeCol ? 'active-chip-btn' : ''}`}
                            onClick={() => {
                              if (!isInLibrary(dossierItem.id)) {
                                toggleLibraryItem(dossierItem);
                              }
                              updateWatchlistMeta(dossierItem.id, { status: col.id });
                            }}
                          >
                            {col.label}
                          </button>
                        );
                      })}
                    </div>

                    <div className="details-star-rating-box">
                      <span className="drawer-label" style={{ marginRight: 4 }}>
                        Your Rating:
                      </span>
                      {[1, 2, 3, 4, 5].map((starVal) => (
                        <button
                          key={starVal}
                          type="button"
                          className={`star-rate-btn ${(watchlistMetaById[dossierItem.id]?.userRating ?? 0) >= starVal ? 'filled' : ''}`}
                          onClick={() => {
                            if (!isInLibrary(dossierItem.id)) {
                              toggleLibraryItem(dossierItem);
                            }
                            updateWatchlistMeta(dossierItem.id, { userRating: starVal });
                          }}
                          title={`Rate ${starVal} of 5 stars`}
                        >
                          ★
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="dossier-body details-page-body">
              {/* Cast & Director Interactive Credits Grid */}
              {(dossierItem.director.length > 0 || dossierItem.cast.length > 0) && (
                <div className="dossier-credits-grid details-credits-panel">
                  {dossierItem.director.length > 0 && (
                    <div className="details-credit-group">
                      <span className="drawer-label">Director</span>
                      <div className="details-people-pills">
                        {dossierItem.director.map((dir) => (
                          <button
                            key={dir}
                            type="button"
                            className="person-search-pill"
                            onClick={() => {
                              setSearchInput(dir);
                              setSearchQuery(dir);
                              setDossierItem(null);
                            }}
                            title={`Search titles directed by ${dir}`}
                          >
                            {dir}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {dossierItem.cast.length > 0 && (
                    <div className="details-credit-group">
                      <span className="drawer-label">Starring Cast</span>
                      <div className="details-people-pills">
                        {dossierItem.cast.slice(0, 10).map((actor) => (
                          <button
                            key={actor}
                            type="button"
                            className="person-search-pill"
                            onClick={() => {
                              setSearchInput(actor);
                              setSearchQuery(actor);
                              setDossierItem(null);
                            }}
                            title={`Search titles starring ${actor}`}
                          >
                            {actor}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TV Series Seasons & Episodes Browser with Episode Search */}
              {dossierItem.type === 'series' && (
                <div className="dossier-section details-episodes-section">
                  <div className="details-section-head">
                    <span className="drawer-label">
                      <Tv size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                      {dossierLoadingMeta
                        ? 'Loading episodes…'
                        : `Seasons & Episodes (${dossierItem.videos.length})`}
                    </span>

                    <div className="details-episodes-controls">
                      {dossierSeasons.length > 1 && (
                        <div className="details-season-tabs">
                          {dossierSeasons.map((seasonNum) => (
                            <button
                              key={seasonNum}
                              type="button"
                              className={`mini-refresh-btn ${dossierSelectedSeason === seasonNum ? 'active-chip-btn' : ''}`}
                              onClick={() => setDossierSelectedSeason(seasonNum)}
                            >
                              Season {seasonNum}
                            </button>
                          ))}
                        </div>
                      )}
                      {dossierItem.videos.length > 4 && (
                        <input
                          type="search"
                          className="directory-search-input episode-filter-input"
                          placeholder="Filter episodes…"
                          value={dossierEpisodeQuery}
                          onChange={(e) => setDossierEpisodeQuery(e.target.value)}
                        />
                      )}
                    </div>
                  </div>

                  <div className="dossier-episodes-list details-episodes-grid">
                    {dossierItem.videos
                      .filter((ep) => {
                        if (ep.season !== dossierSelectedSeason) return false;
                        const q = dossierEpisodeQuery.trim().toLowerCase();
                        if (!q) return true;
                        return (
                          ep.name.toLowerCase().includes(q) ||
                          `e${ep.episode}`.includes(q) ||
                          String(ep.episode).includes(q) ||
                          Boolean(ep.overview && ep.overview.toLowerCase().includes(q))
                        );
                      })
                      .map((ep) => (
                        <div
                          key={ep.id}
                          className="dossier-stream-row details-episode-card"
                          onClick={() => {
                            const target = dossierItem;
                            setDossierItem(null);
                            startScreeningItem(target, ep, undefined, 0);
                          }}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              const target = dossierItem;
                              setDossierItem(null);
                              startScreeningItem(target, ep, undefined, 0);
                            }
                          }}
                        >
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div className="details-episode-title-row">
                              <span className="episode-num-badge mono">
                                S{ep.season}:E{ep.episode}
                              </span>
                              <strong>{ep.name}</strong>
                            </div>
                            {ep.overview && <p className="episode-mini-desc">{ep.overview}</p>}
                          </div>
                          <span className="episode-play-indicator">
                            <Play size={14} fill="currentColor" />
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* Collapsible / Expandable Server & Quality Picker */}
              {dossierShowStreams && (
                <div className="dossier-section">
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 10,
                      flexWrap: 'wrap',
                      marginBottom: 10,
                    }}
                  >
                    <span className="drawer-label" style={{ marginBottom: 0 }}>
                      {dossierLoadingStreams
                        ? 'Finding best quality streams…'
                        : dossierBenchmarkingServers
                          ? `Benchmarking Servers in Background (${dossierStreams.length})…`
                          : `Available Servers — Fastest & Zero-Buffer First (${filteredDossierStreams.length})`}
                    </span>
                    {dossierProviderCategories.length > 1 && (
                      <div
                        className="button-strip compact provider-category-tabs"
                        style={{ flexWrap: 'wrap' }}
                      >
                        {dossierProviderCategories.map((cat) => (
                          <button
                            key={cat.id}
                            type="button"
                            className={
                              effectiveDossierProviderCategory === cat.id
                                ? 'active-chip-btn'
                                : ''
                            }
                            onClick={() => setDossierProviderCategory(cat.id)}
                          >
                            {cat.label} ({cat.count})
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="dossier-streams-list">
                    {filteredDossierStreams.map((st) => {
                      const providerLabel = getStreamProviderCategory(st);
                      const tierClass =
                        (st.qualityScore ?? 0) >= 2160
                          ? 'tier-4k'
                          : (st.qualityScore ?? 0) >= 1080
                            ? 'tier-1080p'
                            : (st.qualityScore ?? 0) >= 720
                              ? 'tier-720p'
                              : 'tier-sd';
                      return (
                        <div
                          key={st.id}
                          className={`dossier-stream-row ${st.isTopResponsive ? 'top-responsive-server' : ''}`}
                          style={{ cursor: 'pointer', opacity: st.unreachable ? 0.55 : 1 }}
                          onClick={() => {
                            if (st.kind === 'external' && st.externalUrl) {
                              window.open(st.externalUrl, '_blank', 'noopener,noreferrer');
                              return;
                            }
                            const target = dossierItem;
                            const currentStreams = [...dossierStreams];
                            setDossierItem(null);
                            startScreeningItem(target, undefined, st, 0, currentStreams);
                          }}
                        >
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                flexWrap: 'wrap',
                                marginBottom: 4,
                              }}
                            >
                              {st.isTopResponsive && (
                                <span className="fastest-server-badge">
                                  ⚡ Fastest · Zero-Buffer
                                </span>
                              )}
                              <span className={`quality-tier-badge ${tierClass}`}>
                                {st.qualityBadge || st.kind.toUpperCase()}
                              </span>
                              {st.audioBadge && (
                                <span className="multi-audio-badge">
                                  {st.audioBadge}
                                </span>
                              )}
                              {st.serverStatusBadge && (
                                <span
                                  className={`server-ping-badge mono ${st.unreachable ? 'offline' : 'online'}`}
                                >
                                  {st.serverStatusBadge}
                                </span>
                              )}
                              <strong>{st.name}</strong>
                              {st.sizeLabel && (
                                <span className="mono size-pill">{st.sizeLabel}</span>
                              )}
                              <span className="addon-origin-tag">{providerLabel}</span>
                            </div>
                            <div className="stream-choice-meta">
                              <span>{st.title}</span>
                            </div>
                          </div>
                          <span className="episode-play-indicator">
                            <Play size={14} fill="currentColor" />
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Similar Movies / Series ("More Like This") Section Below */}
              <div className="dossier-section details-similar-section">
                <div className="details-section-head">
                  <div>
                    <h3 className="details-similar-heading">
                      Similar {dossierItem.type === 'series' ? 'TV Series' : 'Movies'} You May Like
                    </h3>
                    <span className="shelf-subtitle mono">
                      MATCHED BY GENRE ({dossierItem.genres.slice(0, 3).join(' · ') || 'TRENDING'}) &amp; IMDb RATING
                    </span>
                  </div>
                </div>

                {similarDossierItems.length > 0 ? (
                  <div className="poster-grid details-similar-grid">
                    {similarDossierItems.map((simItem) => (
                      <PosterCard
                        key={`similar-${simItem.id}`}
                        item={simItem}
                        inLibrary={isInLibrary(simItem.id)}
                        onPlay={(i) => openItemDossier(i)}
                        onOpenDossier={(i) => openItemDossier(i)}
                        onToggleLibrary={toggleLibraryItem}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="empty-state-box">
                    <p>Loading similar recommendations…</p>
                  </div>
                )}
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* Cinema Video Player Modal (Authenticated Only) */}
      {currentUser && playingSession && (
        <CinemaPlayerModal
          media={playingSession.media}
          addons={addons}
          initialEpisode={playingSession.episode}
          initialStream={playingSession.stream}
          initialStreams={
            playingSession.streams && playingSession.streams.length > 0
              ? playingSession.streams
              : dossierItem?.id === playingSession.media.id && dossierStreams.length > 0
                ? dossierStreams
                : undefined
          }
          initialPositionSec={playingSession.resumeSec}
          onClose={() => {
            if (latestPlayerProgressRef.current) {
              const finalEntry = latestPlayerProgressRef.current;
              setProgressMap((prev) => ({
                ...prev,
                [finalEntry.mediaId]: finalEntry,
              }));
              flushWatchProgressToDb(finalEntry);
              latestPlayerProgressRef.current = null;
            }
            setPlayingSession(null);
          }}
          onProgressUpdate={(entry, flushToDb) => {
            latestPlayerProgressRef.current = entry;
            const nowMs = Date.now();
            if (
              flushToDb ||
              nowMs - lastLocalProgressStateMsRef.current >= 2000
            ) {
              lastLocalProgressStateMsRef.current = nowMs;
              setProgressMap((prev) => ({
                ...prev,
                [entry.mediaId]: entry,
              }));
            }
            // Write to DB only on explicit pause/close or every 60 seconds during playback
            if (flushToDb || nowMs - lastDbProgressSyncMsRef.current >= 60_000) {
              flushWatchProgressToDb(entry);
            }
          }}
        />
      )}

      {/* Professional Login Page Overlay (Admin-Provisioned Accounts Only, Tamper-Protected) */}
      {authModalOpen && (
        <AuthGatePage
          key={authTamperKey}
          onAuthenticated={(token, state) => {
            applyAuthenticatedState(token, state);
            setUserToastCard({
              kind: 'success',
              text: `Welcome back, ${state.user.displayName}!`,
            });
          }}
          onClose={() => {
            setActiveNav('discover');
            setAuthModalOpen(false);
          }}
          onTamperDetected={() => setAuthTamperKey((k) => k + 1)}
          themeMode={themeMode}
          onToggleTheme={toggleThemeMode}
        />
      )}

      {/* Password Change Modal */}
      {changePasswordModalOpen && currentUser && authToken && (
        <ChangePasswordModal
          authToken={authToken}
          userEmail={currentUser.email}
          onClose={() => setChangePasswordModalOpen(false)}
          onSuccess={(msg) => setUserToastCard({ kind: 'success', text: msg })}
        />
      )}
    </div>
  );
};
