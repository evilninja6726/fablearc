import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Hls from 'hls.js';
import {
  Bookmark,
  Camera,
  Captions,
  Check,
  ChevronUp,
  Copy,
  Crop,
  ExternalLink,
  FastForward,
  Gauge,
  Headphones,
  Layers,
  Lock,
  Maximize2,
  Minimize2,
  Pause,
  PictureInPicture2,
  Play,
  RefreshCw,
  Rewind,
  SkipForward,
  Sparkles,
  Sun,
  Trash2,
  Tv,
  Unlock,
  Volume2,
  VolumeX,
  X,
  Zap,
} from 'lucide-react';
import {
  applyCachedServerHealth,
  buildTranscodedStreamUrl,
  fetchStreamsFromAddons,
  fetchSubtitlesFromAddons,
  getAudioTrackLanguagePriority,
  getCachedMediaProbe,
  InstalledAddon,
  MediaProbeResponse,
  pingStreamBatch,
  ProbedAudioTrack,
  probeMediaStream,
  rankStreamsByResponsiveness,
  sortAudioTracksByLanguagePriority,
  sortStreamsByDecreasingQuality,
  StremioEpisodeVideo,
  StremioMediaItem,
  StremioStreamItem,
  StremioSubtitleTrack,
  warmBrowserCdnConnection,
} from '../addons/stremioProtocol';
import {
  computeAutoSyncDelayMs,
  DEFAULT_SUBTITLE_STYLE,
  findActiveCue,
  parseSubtitles,
  SubtitleStyleConfig,
} from '../player/subtitleEngine';
import {
  buildSafeExternalPlayerCommand,
  ExternalPlayerKind,
} from '../security/securityGuards';

export interface WatchProgressEntry {
  mediaId: string;
  mediaName: string;
  mediaType: string;
  poster?: string;
  background?: string;
  episodeId?: string;
  episodeLabel?: string;
  positionSec: number;
  durationSec: number;
  updatedAtIso: string;
}

interface CinemaPlayerModalProps {
  media: StremioMediaItem;
  addons: InstalledAddon[];
  initialEpisode?: StremioEpisodeVideo;
  initialStream?: StremioStreamItem;
  initialStreams?: StremioStreamItem[];
  initialPositionSec?: number;
  onClose: () => void;
  onProgressUpdate: (entry: WatchProgressEntry, flushToDb?: boolean) => void;
}

export interface SceneBookmarkItem {
  id: string;
  timeSec: number;
  label: string;
  createdAtIso: string;
}

type BottomPopoverType =
  | null
  | 'quality'
  | 'audio'
  | 'subtitles'
  | 'speed'
  | 'crop'
  | 'episodes'
  | 'bookmarks';

type AspectCropMode =
  | 'contain'
  | 'cover'
  | 'fill'
  | 'ratio-16-9'
  | 'ratio-16-10'
  | 'ratio-21-9'
  | 'ratio-239-1'
  | 'ratio-185-1'
  | 'ratio-190-1'
  | 'ratio-4-3'
  | 'zoom-115'
  | 'zoom-125'
  | 'zoom-135';

function formatTimecode(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
  const total = Math.floor(seconds);
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hrs > 0) {
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

const SUBTITLE_SWATCHES = [
  { label: 'Silver Nitrate', hex: '#EAE6DF' },
  { label: 'Cinema Gold', hex: '#F5B041' },
  { label: 'Cyan Broadcast', hex: '#63D2FF' },
  { label: 'Emerald Mint', hex: '#6EE7B7' },
];

const SPEED_OPTIONS = [
  { value: 0.5, label: '0.5x Slow' },
  { value: 0.75, label: '0.75x' },
  { value: 1, label: '1.0x Normal' },
  { value: 1.25, label: '1.25x' },
  { value: 1.5, label: '1.5x Fast' },
  { value: 1.75, label: '1.75x' },
  { value: 2, label: '2.0x Double' },
];

const CROP_OPTIONS: Array<{
  mode: AspectCropMode;
  shortLabel: string;
  label: string;
  desc: string;
}> = [
  {
    mode: 'contain',
    shortLabel: 'Fit',
    label: 'Auto Fit (Original)',
    desc: 'Fits full frame inside screen without cropping',
  },
  {
    mode: 'cover',
    shortLabel: 'Cover',
    label: 'Full Screen Fill (Cover)',
    desc: 'Fills 100% of screen edge-to-edge (no black bars)',
  },
  {
    mode: 'fill',
    shortLabel: 'Stretch',
    label: 'Full Screen Stretch (100% W×H)',
    desc: 'Stretches video to exact full viewport width & height',
  },
  {
    mode: 'ratio-16-9',
    shortLabel: '16:9',
    label: '16:9 UHD / 1080p (3840×2160 / 1920×1080)',
    desc: 'Standard 4K UHD & Full HD widescreen aspect ratio',
  },
  {
    mode: 'ratio-16-10',
    shortLabel: '16:10',
    label: '16:10 WUXGA / MacBook Full (2560×1600)',
    desc: 'Full 16:10 display ratio for MacBook & tall monitors',
  },
  {
    mode: 'ratio-21-9',
    shortLabel: '21:9',
    label: '21:9 UltraWide (3440×1440 / 2560×1080)',
    desc: 'Ultrawide curved cinema monitor aspect ratio',
  },
  {
    mode: 'ratio-239-1',
    shortLabel: '2.39:1',
    label: '2.39:1 Anamorphic CinemaScope',
    desc: 'Theatrical Panavision / CinemaScope widescreen',
  },
  {
    mode: 'ratio-190-1',
    shortLabel: '1.90:1',
    label: '1.90:1 Digital IMAX Expanded',
    desc: 'IMAX Laser / Digital expanded theatrical frame',
  },
  {
    mode: 'ratio-185-1',
    shortLabel: '1.85:1',
    label: '1.85:1 Theatrical Flat',
    desc: 'Academy standard theatrical widescreen ratio',
  },
  {
    mode: 'ratio-4-3',
    shortLabel: '4:3',
    label: '4:3 Classic / IMAX 70mm (1440×1080)',
    desc: 'Classic television & 1.33:1 archival cinema frame',
  },
  {
    mode: 'zoom-115',
    shortLabel: '115%',
    label: '115% Overscan Crop',
    desc: 'Crops thin baked-in letterbox bars inside video files',
  },
  {
    mode: 'zoom-125',
    shortLabel: '125%',
    label: '125% Letterbox Remover',
    desc: 'Removes hardcoded 21:9 black bars on 16:9 displays',
  },
  {
    mode: 'zoom-135',
    shortLabel: '135%',
    label: '135% Deep Cinema Zoom',
    desc: 'Maximum zoom crop for ultra-letterboxed transfers',
  },
];

// 44-byte silent PCM WAV used to bless/unlock HTMLAudioElement on initial mount gesture
const SILENT_WAV_DATA_URI =
  'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';

export const CinemaPlayerModal: React.FC<CinemaPlayerModalProps> = ({
  media,
  addons,
  initialEpisode,
  initialStream,
  initialStreams,
  initialPositionSec = 0,
  onClose,
  onProgressUpdate,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const directVideoLoadedUrlRef = useRef<string | null>(null);
  const userPausedRef = useRef<boolean>(false);
  const audioUnlockedRef = useRef<boolean>(false);
  const freezeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const onProgressRef = useRef(onProgressUpdate);
  onProgressRef.current = onProgressUpdate;
  const scrubCommitTimerRef = useRef<number | null>(null);

  const [selectedEpisode, setSelectedEpisode] = useState<StremioEpisodeVideo | undefined>(
    initialEpisode ?? media.videos[0],
  );
  const [episodeSeasonFilter, setEpisodeSeasonFilter] = useState<number>(
    initialEpisode?.season ?? media.videos[0]?.season ?? 1,
  );

  const activeVideoId = useMemo(() => {
    if (media.type === 'series' && selectedEpisode?.id) {
      return selectedEpisode.id;
    }
    return media.imdbId || media.id;
  }, [media.id, media.imdbId, media.type, selectedEpisode]);

  const [streams, setStreams] = useState<StremioStreamItem[]>(() =>
    initialStreams ? sortStreamsByDecreasingQuality(initialStreams) : [],
  );
  const [loadingStreams, setLoadingStreams] = useState(false);
  const [activeStream, setActiveStream] = useState<StremioStreamItem | null>(
    initialStream ?? initialStreams?.[0] ?? null,
  );

  // Audio Track / Multi-Language state (probed via FFmpeg or HLS audioTracks)
  const [probedAudioTracks, setProbedAudioTracks] = useState<ProbedAudioTrack[]>([]);
  const [selectedAudioTrackIndex, setSelectedAudioTrackIndex] = useState<number>(0);
  const [probingAudio, setProbingAudio] = useState(false);
  const [useFfmpegAudioEngine, setUseFfmpegAudioEngine] = useState<boolean>(true);
  const [audioBlockedByBrowser, setAudioBlockedByBrowser] = useState<boolean>(false);
  const [resolvedDirectUrl, setResolvedDirectUrl] = useState<string | null>(null);
  const [probedStreamUrl, setProbedStreamUrl] = useState<string | null>(null);
  const [streamStartOffsetSec, setStreamStartOffsetSec] = useState<number>(
    Math.max(0, Math.floor(initialPositionSec)),
  );
  const streamStartOffsetRef = useRef<number>(
    Math.max(0, Math.floor(initialPositionSec)),
  );
  streamStartOffsetRef.current = streamStartOffsetSec;
  const isSeekingSplitRef = useRef<boolean>(false);
  const lastSeekStartedAtMsRef = useRef<number>(0);
  const zoneSeekCommitTimerRef = useRef<number | null>(null);
  const pendingSeekTargetRef = useRef<number | null>(null);
  const [seekNonce, setSeekNonce] = useState<number>(0);
  const [probedDurationSec, setProbedDurationSec] = useState<number>(0);

  // Live subtitle tracks fetched from OpenSubtitles v3 Pro & OpenSubtitles v3
  const [subtitleTracks, setSubtitleTracks] = useState<StremioSubtitleTrack[]>([]);
  const [selectedSubtitleTrackId, setSelectedSubtitleTrackId] = useState<string>('');
  const [rawSubtitleContent, setRawSubtitleContent] = useState<string>('');
  const [loadingSubtitleTrack, setLoadingSubtitleTrack] = useState(false);

  // Player transport & HUD state
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(true);
  const [hasStartedPlayback, setHasStartedPlayback] = useState(false);
  const hasStartedPlaybackRef = useRef<boolean>(false);
  hasStartedPlaybackRef.current = hasStartedPlayback;
  const userManuallySelectedStreamRef = useRef<boolean>(Boolean(initialStream));
  const activeStreamRef = useRef<StremioStreamItem | null>(activeStream);
  activeStreamRef.current = activeStream;
  const [hasFreezeFrame, setHasFreezeFrame] = useState(false);
  const [scrubPreviewSec, setScrubPreviewSec] = useState<number | null>(null);
  const [failoverCountdownSec, setFailoverCountdownSec] = useState<number>(30);

  /**
   * Captures the exact current decoded video frame onto the overlay canvas before seeking or switching streams.
   * Ensures the player never flashes a black screen while buffering after +10s / -10s or timeline scrubbing.
   */
  const captureVideoFrameSnapshot = useCallback(() => {
    const video = videoRef.current;
    const canvas = freezeCanvasRef.current;
    if (!video || !canvas) return;
    if (video.videoWidth > 0 && video.videoHeight > 0 && video.readyState >= 2) {
      try {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          setHasFreezeFrame(true);
        }
      } catch {
        // Cross-origin frame security fallback handled via video poster & backdrop
      }
    }
  }, []);
  const [failoverToast, setFailoverToast] = useState<string | null>(null);
  const failedStreamIdsRef = useRef<Set<string>>(new Set());
  const [currentTimeSec, setCurrentTimeSec] = useState(initialPositionSec);
  const currentTimeRef = useRef<number>(initialPositionSec);
  currentTimeRef.current = currentTimeSec;
  const [nativeDurationSec, setNativeDurationSec] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [brightness, setBrightness] = useState(1);
  const [gestureHud, setGestureHud] = useState<{
    kind: 'brightness' | 'volume';
    valuePct: number;
  } | null>(null);
  const gestureHudTimerRef = useRef<number | null>(null);
  const [seekRipple, setSeekRipple] = useState<{
    side: 'left' | 'right';
    deltaSec: number;
    key: number;
  } | null>(null);
  const seekRippleTimerRef = useRef<number | null>(null);
  const singleTapTimerRef = useRef<number | null>(null);
  const lastTapInfoRef = useRef<{ timeMs: number; zone: 'left' | 'center' | 'right' }>({
    timeMs: 0,
    zone: 'center',
  });
  const stageGestureRef = useRef<{
    active: boolean;
    pointerId: number;
    side: 'left' | 'right';
    startX: number;
    startY: number;
    startValue: number;
    isDragging: boolean;
  } | null>(null);
  const suppressNextClickRef = useRef(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [aspectMode, setAspectMode] = useState<AspectCropMode>('contain');
  const [activePopover, setActivePopover] = useState<BottomPopoverType>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hudVisible, setHudVisible] = useState(true);
  const hudTimerRef = useRef<number | null>(null);

  // Auto-hide HUD on mouse/touch inactivity while playing when no dropdown is open
  const resetHudTimer = useCallback(() => {
    setHudVisible(true);
    if (hudTimerRef.current) {
      window.clearTimeout(hudTimerRef.current);
    }
    hudTimerRef.current = window.setTimeout(() => {
      setHudVisible(false);
    }, 4200);
  }, []);

  useEffect(() => {
    resetHudTimer();
    return () => {
      if (hudTimerRef.current) window.clearTimeout(hudTimerRef.current);
    };
  }, [resetHudTimer]);

  // Keep HUD visible whenever paused, buffering, or a bottom dropdown popover is open
  const showControlsHud = hudVisible || !isPlaying || isBuffering || activePopover !== null;

  // Automatically switch to the next available stream in decreasing quality order
  const switchToNextStream = useCallback(
    (reason: string) => {
      if (!activeStream) return;
      failedStreamIdsRef.current.add(activeStream.id);

      const playableCandidates = streams.filter(
        (s) => (s.kind === 'direct' || s.kind === 'youtube') && !s.isPromo,
      );
      const pool = playableCandidates.length > 0 ? playableCandidates : streams;
      if (pool.length <= 1) {
        setFailoverToast('No alternative stream available to switch to.');
        return;
      }

      const currentIdx = pool.findIndex((s) => s.id === activeStream.id);
      let nextStream: StremioStreamItem | undefined;

      for (let offset = 1; offset <= pool.length; offset++) {
        const candidate = pool[(Math.max(0, currentIdx) + offset) % pool.length];
        if (candidate && !failedStreamIdsRef.current.has(candidate.id)) {
          nextStream = candidate;
          break;
        }
      }

      if (!nextStream) {
        failedStreamIdsRef.current.clear();
        nextStream = pool[(Math.max(0, currentIdx) + 1) % pool.length];
      }

      if (nextStream && nextStream.id !== activeStream.id) {
        captureVideoFrameSnapshot();
        const resumeAtSec = Math.max(0, Math.floor(currentTimeRef.current));
        setFailoverToast(
          `${reason} — Switched to ${nextStream.qualityBadge || 'Next Stream'} (${nextStream.addonName} · ${nextStream.name}) at ${formatTimecode(resumeAtSec)}`,
        );
        setStreamStartOffsetSec(resumeAtSec);
        setCurrentTimeSec(resumeAtSec);
        setIsBuffering(true);
        setFailoverCountdownSec(30);
        setActiveStream(nextStream);
      }
    },
    [activeStream, captureVideoFrameSnapshot, streams],
  );
  const switchToNextStreamRef = useRef(switchToNextStream);
  switchToNextStreamRef.current = switchToNextStream;

  // Clear failover toast after 6 seconds
  useEffect(() => {
    if (!failoverToast) return;
    const t = window.setTimeout(() => setFailoverToast(null), 6000);
    return () => window.clearTimeout(t);
  }, [failoverToast]);

  // 30-Second Stream Watchdog: if a direct stream stays stuck buffering or hasn't started playing within 30s, auto-switch to next stream
  useEffect(() => {
    if (!activeStream || activeStream.kind !== 'direct') {
      setIsBuffering(false);
      setFailoverCountdownSec(30);
      return;
    }

    // Only count down when waiting for initial playback or stuck buffering
    const waitingForFrames = isBuffering || !hasStartedPlayback;
    if (!waitingForFrames) {
      setFailoverCountdownSec(30);
      return;
    }

    const interval = window.setInterval(() => {
      setFailoverCountdownSec((prev) => {
        if (prev <= 1) {
          switchToNextStream('Stream unresponsive for 30s');
          return 30;
        }
        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(interval);
  }, [activeStream, hasStartedPlayback, isBuffering, switchToNextStream]);

  // Fullscreen listener & toggle (supports standard Fullscreen API + WebKit/iOS Safari fallback)
  useEffect(() => {
    const docAny = document as Document & { webkitFullscreenElement?: Element | null };
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement || docAny.webkitFullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('webkitfullscreenchange', onFsChange);
    return () => {
      document.removeEventListener('fullscreenchange', onFsChange);
      document.removeEventListener('webkitfullscreenchange', onFsChange);
    };
  }, []);

  const toggleFullscreen = useCallback(async () => {
    try {
      const docAny = document as Document & {
        webkitFullscreenElement?: Element | null;
        webkitExitFullscreen?: () => Promise<void> | void;
      };
      const target = (containerRef.current ?? document.documentElement) as HTMLElement & {
        webkitRequestFullscreen?: () => Promise<void> | void;
      };
      const videoAny = videoRef.current as
        | (HTMLVideoElement & {
            webkitEnterFullscreen?: () => void;
            webkitExitFullscreen?: () => void;
            webkitDisplayingFullscreen?: boolean;
          })
        | null;

      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else if (docAny.webkitFullscreenElement && docAny.webkitExitFullscreen) {
        await docAny.webkitExitFullscreen();
      } else if (videoAny?.webkitDisplayingFullscreen && videoAny.webkitExitFullscreen) {
        videoAny.webkitExitFullscreen();
        setIsFullscreen(false);
      } else if (typeof target.requestFullscreen === 'function') {
        await target.requestFullscreen();
      } else if (typeof target.webkitRequestFullscreen === 'function') {
        await target.webkitRequestFullscreen();
      } else if (typeof videoAny?.webkitEnterFullscreen === 'function') {
        videoAny.webkitEnterFullscreen();
        setIsFullscreen(true);
      }
    } catch {
      // Fallback if fullscreen API is restricted by environment
    }
  }, []);

  // Fetch streams (sorted in decreasing order of quality) & subtitles when activeVideoId changes
  useEffect(() => {
    let cancelled = false;

    const initialTargetId =
      media.type === 'series' && (initialEpisode ?? media.videos[0])?.id
        ? (initialEpisode ?? media.videos[0])!.id
        : media.imdbId || media.id;

    // Progressively ping remaining un-pinged direct streams in batches of 18 so ALL servers show their live ms ping
    const pingRemainingServersInPlace = async (baseList: StremioStreamItem[]) => {
      const unpinged = baseList.filter(
        (s) => s.kind === 'direct' && !s.isPromo && Boolean(s.url) && !s.serverStatusBadge,
      );
      for (let i = 0; i < unpinged.length; i += 18) {
        if (cancelled) return;
        const chunk = unpinged.slice(i, i + 18);
        const metricsMap = await pingStreamBatch(chunk);
        if (cancelled || metricsMap.size === 0) continue;
        setStreams((prev) =>
          prev.map((s) => {
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
          }),
        );
      }
    };

    const loadStreams = async () => {
      if (
        initialStreams &&
        initialStreams.length > 0 &&
        activeVideoId === initialTargetId
      ) {
        const hydratedInitial = applyCachedServerHealth(initialStreams);
        const hasRankedWinner = hydratedInitial.some((s) => s.isTopResponsive);
        const orderedInitial = hasRankedWinner
          ? hydratedInitial
          : applyCachedServerHealth(sortStreamsByDecreasingQuality(hydratedInitial));
        setStreams(orderedInitial);
        setActiveStream((prev) => {
          if (prev) return prev;
          if (initialStream) return initialStream;
          return (
            orderedInitial.find((s) => s.isTopResponsive && !s.unreachable) ??
            orderedInitial.find(
              (s) => s.kind === 'direct' && !s.isPromo && !s.unreachable,
            ) ??
            orderedInitial.find((s) => s.kind === 'direct' && !s.isPromo) ??
            orderedInitial.find((s) => s.kind === 'youtube') ??
            orderedInitial[0] ??
            null
          );
        });
        if (!hasRankedWinner) {
          rankStreamsByResponsiveness(orderedInitial)
            .then((ranked) => {
              if (cancelled || ranked.length === 0) return;
              setStreams(ranked);
              // Only promote activeStream to the ⚡ Fastest winner if playback hasn't started yet
              // and the user didn't manually pick a specific server. Never interrupt active playback!
              const topFastest = ranked.find((s) => s.isTopResponsive && !s.unreachable);
              if (
                topFastest &&
                !hasStartedPlaybackRef.current &&
                !userManuallySelectedStreamRef.current
              ) {
                setActiveStream((prev) =>
                  prev?.id === topFastest.id ? prev : topFastest,
                );
              }
              void pingRemainingServersInPlace(ranked);
            })
            .catch(() => {});
        } else {
          void pingRemainingServersInPlace(orderedInitial);
        }
        return;
      }

      setLoadingStreams(true);
      try {
        const resolved = await fetchStreamsFromAddons(
          addons,
          media.type,
          activeVideoId,
          media,
        );
        if (cancelled) return;
        const sorted = sortStreamsByDecreasingQuality(resolved);
        setStreams(sorted);
        setActiveStream((prev) => {
          if (prev && sorted.some((r) => r.url === prev.url && r.name === prev.name)) {
            return prev;
          }
          if (initialStream) return initialStream;
          return (
            sorted.find((s) => s.kind === 'direct' && !s.isPromo && !s.unreachable) ??
            sorted.find((s) => s.kind === 'direct' && !s.isPromo) ??
            sorted.find((s) => s.kind === 'youtube') ??
            sorted[0] ??
            null
          );
        });
        if (sorted.length > 0) {
          rankStreamsByResponsiveness(sorted)
            .then((ranked) => {
              if (cancelled || ranked.length === 0) return;
              setStreams(ranked);
              const topFastest = ranked.find((s) => s.isTopResponsive && !s.unreachable);
              if (
                topFastest &&
                !hasStartedPlaybackRef.current &&
                !userManuallySelectedStreamRef.current
              ) {
                setActiveStream((prev) =>
                  prev?.id === topFastest.id ? prev : topFastest,
                );
              }
              void pingRemainingServersInPlace(ranked);
            })
            .catch(() => {});
        }
      } finally {
        if (!cancelled) setLoadingStreams(false);
      }
    };

    loadStreams();

    fetchSubtitlesFromAddons(addons, media.type, activeVideoId).then((tracks) => {
      if (cancelled) return;
      setSubtitleTracks(tracks);
      const preferredEng =
        tracks.find((t) => t.lang.toLowerCase().startsWith('eng')) ?? tracks[0];
      if (preferredEng) {
        setSelectedSubtitleTrackId(preferredEng.id);
      } else {
        setSelectedSubtitleTrackId('');
        setRawSubtitleContent('');
      }
    });

    return () => {
      cancelled = true;
    };
  }, [activeVideoId]);

  // Bless/unlock HTMLAudioElement on initial mount gesture so async audio.play() after /api/media-probe is never blocked by Autoplay Policy
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || audioUnlockedRef.current) return;
    try {
      audio.src = SILENT_WAV_DATA_URI;
      audio.muted = false;
      audio.volume = 0.01;
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            audioUnlockedRef.current = true;
            if (audio.src === SILENT_WAV_DATA_URI) {
              audio.pause();
            }
          })
          .catch(() => {});
      }
    } catch {
      // Ignore if environment does not support data URI audio preview
    }
  }, []);

  // Automatic one-tap/key recovery if browser blocked unmuted <audio> autoplay
  useEffect(() => {
    if (!audioBlockedByBrowser) return;
    const resumeBlockedAudio = () => {
      const audio = audioRef.current;
      const video = videoRef.current;
      if (audio) {
        audio.muted = isMuted;
        audio.volume = volume;
        audio
          .play()
          .then(() => {
            audioUnlockedRef.current = true;
            setAudioBlockedByBrowser(false);
            if (video && video.paused && !userPausedRef.current) {
              video.play().catch(() => {});
            }
          })
          .catch(() => {});
      }
    };
    window.addEventListener('pointerdown', resumeBlockedAudio, { capture: true });
    window.addEventListener('keydown', resumeBlockedAudio, { capture: true });
    window.addEventListener('touchstart', resumeBlockedAudio, { capture: true });
    return () => {
      window.removeEventListener('pointerdown', resumeBlockedAudio, { capture: true });
      window.removeEventListener('keydown', resumeBlockedAudio, { capture: true });
      window.removeEventListener('touchstart', resumeBlockedAudio, { capture: true });
    };
  }, [audioBlockedByBrowser, isMuted, volume]);

  const isSplitAudioMode = Boolean(
    useFfmpegAudioEngine &&
      activeStream?.kind === 'direct' &&
      !activeStream.isHls &&
      !activeStream.url?.toLowerCase().includes('.m3u8'),
  );

  // Master-Slave Lockstep Synchronizer: keeps <video> (direct CDN, 0 MB on Render) locked to <audio> (128k MP3 from Render)
  const syncSplitPlayback = useCallback(() => {
    if (!isSplitAudioMode || userPausedRef.current) return;
    const video = videoRef.current;
    const audio = audioRef.current;
    if (!video || !audio) return;

    const videoReady = video.readyState >= 2 && !video.seeking;
    const audioReady = audio.readyState >= 2 && !audio.seeking;

    if (videoReady && audioReady) {
      isSeekingSplitRef.current = false;
      const expectedVideoSec = streamStartOffsetRef.current + audio.currentTime;
      const driftSec = Math.abs(video.currentTime - expectedVideoSec);
      const msSinceLastSeek = Date.now() - lastSeekStartedAtMsRef.current;
      // Avoid yanking video.currentTime during the initial 1.2s after a forward seek unless drift is huge (> 2.5s)
      const driftThreshold = msSinceLastSeek < 1200 ? 2.5 : 0.45;
      if (
        !video.seeking &&
        Number.isFinite(expectedVideoSec) &&
        expectedVideoSec >= 0 &&
        driftSec > driftThreshold
      ) {
        try {
          video.currentTime = expectedVideoSec;
        } catch {
          // Ignore if video metadata is still settling
        }
      }

      if (audio.paused) {
        audio.muted = isMuted;
        audio.volume = volume;
        audio
          .play()
          .then(() => {
            audioUnlockedRef.current = true;
            setAudioBlockedByBrowser(false);
          })
          .catch((err) => {
            if (
              err &&
              (err.name === 'NotAllowedError' ||
                /interact|gesture|permission/i.test(String(err.message || '')))
            ) {
              setAudioBlockedByBrowser(true);
            }
          });
      }

      if (video.paused) {
        video.muted = true;
        video.play().catch(() => {});
      }

      setIsBuffering(false);
      setHasStartedPlayback(true);
      setHasFreezeFrame(false);
    } else {
      setIsBuffering(true);
      // If video is not ready yet, pause audio so dialogue never plays ahead of a frozen frame
      if (!videoReady && !audio.paused) {
        audio.pause();
      }
      // CRITICAL: Never call video.pause() while video.seeking is true!
      // Pausing an HTML5 <video> element in the middle of an HTTP Range seek causes Chromium/WebKit
      // to suspend byte-range preloading and deadlock at readyState 1. Only pause video if it has
      // already finished seeking (video.seeking === false) and audio is still buffering.
      if (!audioReady && !video.paused && !video.seeking) {
        video.pause();
      }
    }
  }, [isMuted, isSplitAudioMode, volume]);

  // Active Lockstep & Seek Stall Recovery Poll:
  // 1. Every 250ms while buffering in split mode, re-checks syncSplitPlayback() so if an event was missed
  //    while the other element was seeking, playback resumes immediately with zero deadlock.
  // 2. If <video> gets stuck on a mid-stream CDN byte-range socket for > 5.5s after a forward seek
  //    (even though the server itself works when freshly opened), automatically re-opens a fresh
  //    HTTP Range connection on <video> at the target timestamp (identical to re-selecting the stream in Quality)!
  useEffect(() => {
    if (!isSplitAudioMode || userPausedRef.current || !isBuffering) return;

    const timer = window.setInterval(() => {
      const video = videoRef.current;
      const audio = audioRef.current;
      if (!video || !audio || userPausedRef.current) return;

      if (video.readyState >= 2 && !video.seeking && audio.readyState >= 2) {
        syncSplitPlayback();
        return;
      }

      const msSinceSeek = Date.now() - lastSeekStartedAtMsRef.current;
      const effectiveCdnUrl = resolvedDirectUrl || activeStream?.url;
      if (
        isSeekingSplitRef.current &&
        msSinceSeek > 5500 &&
        effectiveCdnUrl &&
        (video.seeking || video.readyState < 2)
      ) {
        // Reset lastSeekStartedAtMsRef so we only auto-reconnect once per 6s window
        lastSeekStartedAtMsRef.current = Date.now();
        const targetSec = Math.max(0, Math.floor(currentTimeRef.current));
        streamStartOffsetRef.current = targetSec;
        try {
          video.src = effectiveCdnUrl;
          video.muted = true;
          video.playbackRate = playbackSpeed;
          video.load();
          video.addEventListener(
            'loadedmetadata',
            () => {
              try {
                video.currentTime = targetSec;
              } catch {
                // ignore
              }
              video.play().catch(() => {});
              syncSplitPlayback();
            },
            { once: true },
          );
        } catch {
          // ignore
        }
      }
    }, 250);

    return () => window.clearInterval(timer);
  }, [
    activeStream?.url,
    isBuffering,
    isSplitAudioMode,
    playbackSpeed,
    resolvedDirectUrl,
    syncSplitPlayback,
  ]);

  // Probe embedded multi-language audio tracks and container duration whenever the selected stream URL/ID actually changes.
  // Depend on primitive stream identifiers (id, url, kind) rather than `streams` or `switchToNextStream` so background
  // server health/ping updates NEVER reset directVideoLoadedUrlRef or restart <video>/<audio> buffering!
  const activeStreamId = activeStream?.id ?? '';
  const activeStreamUrl = activeStream?.url ?? '';
  const activeStreamKind = activeStream?.kind ?? '';
  const activeStreamIsHls = Boolean(activeStream?.isHls);

  useEffect(() => {
    const currentStream = activeStreamRef.current;
    directVideoLoadedUrlRef.current = null;
    userPausedRef.current = false;
    setAudioBlockedByBrowser(false);
    if (!currentStream || currentStream.kind !== 'direct' || !currentStream.url) {
      setProbedAudioTracks([]);
      setProbedDurationSec(0);
      setResolvedDirectUrl(null);
      setProbedStreamUrl(null);
      return;
    }

    const streamUrl = currentStream.url;
    // Fast-Start Audio & Video: If the background server benchmark already unwrapped the CDN URL,
    // use it immediately so <video> and <audio> start loading in 0ms in parallel with /api/media-probe!
    const preResolvedCdn =
      currentStream.resolvedDirectUrl &&
      /^https?:\/\//i.test(currentStream.resolvedDirectUrl)
        ? currentStream.resolvedDirectUrl
        : streamUrl;
    setResolvedDirectUrl(preResolvedCdn);
    setProbedStreamUrl(streamUrl);

    const isM3u8 =
      currentStream.isHls || streamUrl.toLowerCase().includes('.m3u8');
    if (isM3u8) {
      setUseFfmpegAudioEngine(false);
      setProbedAudioTracks([]);
      setProbedDurationSec(0);
      setSelectedAudioTrackIndex(0);
      setProbingAudio(false);
      setResolvedDirectUrl(streamUrl);
      setProbedStreamUrl(streamUrl);
      return;
    }

    const applyProbeDecision = (probe: MediaProbeResponse | null) => {
      const targetCdnUrl =
        probe?.resolvedUrl && /^https?:\/\//i.test(probe.resolvedUrl)
          ? probe.resolvedUrl
          : preResolvedCdn;

      // 1. Auto-skip dead (404 / 451 / signin.mp4) upstream servers immediately
      if (
        probe?.unreachable ||
        /\/signin\.mp4(\?|$)/i.test(targetCdnUrl) ||
        (probe && probe.durationSec === 0 && probe.audioTracks.length === 0)
      ) {
        switchToNextStreamRef.current('Server offline or file removed');
        return;
      }

      // 2. Auto-skip plain HTTP servers (e.g. http://usa7-as04.shegu.net) on HTTPS pages so we never proxy 20 GB video through Render
      const isInsecureHttpCdn =
        typeof window !== 'undefined' &&
        window.location?.protocol === 'https:' &&
        targetCdnUrl.startsWith('http://');
      if (isInsecureHttpCdn) {
        switchToNextStreamRef.current('Skipped insecure HTTP server');
        return;
      }

      warmBrowserCdnConnection(targetCdnUrl);
      setResolvedDirectUrl(targetCdnUrl);

      let shouldUseFfmpeg = true;
      if (probe) {
        if (probe.durationSec > 0) {
          setProbedDurationSec(probe.durationSec);
        }
        if (probe.audioTracks.length > 0) {
          // Sort tracks with English first, then Hindi, then any other language
          const sortedTracks = sortAudioTracksByLanguagePriority(probe.audioTracks);
          setProbedAudioTracks(sortedTracks);
          // Automatically prefer the top-priority language track (English -> Hindi -> first track)
          const preferredTrack = sortedTracks[0];
          const targetAudioIndex = preferredTrack ? preferredTrack.audioIndex : 0;
          setSelectedAudioTrackIndex(targetAudioIndex);

          // Direct-play from source CDN (0 MB Render bandwidth) when default track 0 already uses a browser-native audio codec
          const isBrowserNativeAudio = Boolean(
            preferredTrack &&
              /^(aac|mp3|mp4a|opus|vorbis|flac)$/i.test(preferredTrack.codec),
          );
          if (targetAudioIndex === 0 && isBrowserNativeAudio) {
            shouldUseFfmpeg = false;
          }
        }
      }
      setUseFfmpegAudioEngine(shouldUseFfmpeg);
      setProbingAudio(false);
      setProbedStreamUrl(streamUrl);
    };

    // Layer 3 (Synchronous Probe Fast-Path):
    // If the Details Page already pre-warmed `/api/media-probe` for this server, apply the cached probe
    // synchronously in 0ms without showing "Loading..." or waiting for an async fetch tick!
    const cachedProbe =
      getCachedMediaProbe(streamUrl) ?? getCachedMediaProbe(preResolvedCdn);
    if (cachedProbe) {
      applyProbeDecision(cachedProbe);
      return;
    }

    let cancelled = false;
    setProbingAudio(true);
    setProbedAudioTracks([]);
    setSelectedAudioTrackIndex(0);

    probeMediaStream(streamUrl)
      .then((probe) => {
        if (cancelled) return;
        applyProbeDecision(probe);
      })
      .catch(() => {
        if (!cancelled) {
          setProbingAudio(false);
          setProbedStreamUrl(streamUrl);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeStreamId, activeStreamKind, activeStreamUrl]);

  // Download live SRT/VTT content when a subtitle track is selected
  useEffect(() => {
    const track = subtitleTracks.find((t) => t.id === selectedSubtitleTrackId);
    if (!track) {
      setRawSubtitleContent('');
      return;
    }

    let cancelled = false;
    setLoadingSubtitleTrack(true);
    fetch(track.url)
      .then((r) => (r.ok ? r.text() : ''))
      .then((txt) => {
        if (!cancelled) {
          setRawSubtitleContent(txt);
        }
      })
      .catch(() => {
        if (!cancelled) setRawSubtitleContent('');
      })
      .finally(() => {
        if (!cancelled) setLoadingSubtitleTrack(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedSubtitleTrackId, subtitleTracks]);

  const effectiveDurationSec = useMemo(() => {
    if (probedDurationSec > 0) return probedDurationSec;
    if (Number.isFinite(nativeDurationSec) && nativeDurationSec > 0) {
      return nativeDurationSec;
    }
    return 0;
  }, [probedDurationSec, nativeDurationSec]);

  const activeAudioTrackObj = useMemo(
    () =>
      probedAudioTracks.find((t) => t.audioIndex === selectedAudioTrackIndex) ??
      probedAudioTracks[0] ??
      null,
    [probedAudioTracks, selectedAudioTrackIndex],
  );

  const [subStyle, setSubStyle] = useState<SubtitleStyleConfig>(DEFAULT_SUBTITLE_STYLE);
  const parsedCues = useMemo(
    () => (rawSubtitleContent ? parseSubtitles(rawSubtitleContent) : []),
    [rawSubtitleContent],
  );

  const activeSubtitleText = useMemo(() => {
    if (!subStyle.enabled || parsedCues.length === 0) return null;
    return findActiveCue(
      parsedCues,
      currentTimeSec * 1000,
      subStyle.delayMs,
      subStyle.stripSdh,
    );
  }, [parsedCues, currentTimeSec, subStyle.enabled, subStyle.delayMs, subStyle.stripSdh]);

  // External player safe hand-off state
  const [externalPlayer, setExternalPlayer] = useState<ExternalPlayerKind>('mpv');
  const [copiedExternalCmd, setCopiedExternalCmd] = useState(false);

  const externalLaunch = useMemo(
    () =>
      buildSafeExternalPlayerCommand(
        externalPlayer,
        activeStream?.url || activeStream?.externalUrl || '',
        media.name,
      ),
    [externalPlayer, activeStream, media.name],
  );

  // Load direct stream via Split Direct-Video + Audio-Only MP3 FFmpeg Pipeline, HLS.js, or native HTML5 video
  // Note: <video> NEVER streams from /api/media-stream, guaranteeing 0 MB of video bandwidth on Render!
  useEffect(() => {
    const video = videoRef.current;
    const audio = audioRef.current;
    if (!video || !activeStream || activeStream.kind !== 'direct' || !activeStream.url) {
      return;
    }

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    setIsBuffering(true);
    setFailoverCountdownSec(30);

    const isM3u8Playlist =
      activeStream.isHls || activeStream.url.toLowerCase().includes('.m3u8');

    // Wait for /api/media-probe to finish unwrapping the CDN URL & selecting the audio track before opening the stream
    if (!isM3u8Playlist && probedStreamUrl !== activeStream.url) {
      return;
    }

    const effectiveCdnUrl = resolvedDirectUrl || activeStream.url;

    if (isM3u8Playlist && Hls.isSupported() && !useFfmpegAudioEngine) {
      if (audio) {
        audio.pause();
        audio.removeAttribute('src');
        audio.load();
      }
      directVideoLoadedUrlRef.current = null;
      const hls = new Hls({ enableWorker: true });
      hlsRef.current = hls;
      hls.loadSource(activeStream.url);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (streamStartOffsetSec > 0 && video.currentTime < 1) {
          video.currentTime = streamStartOffsetSec;
        }
        video.muted = isMuted;
        video.volume = volume;
        video.playbackRate = playbackSpeed;
        video.play().catch(() => {
          setIsPlaying(false);
        });
      });
    } else if (isSplitAudioMode) {
      // Split Direct-Video + Real-Time MP3 Audio-Only Transcode:
      // 1. <video> streams 4K/1080p video directly from the unwrapped CDN URL (0 MB Render bandwidth!)
      // 2. <audio> streams 128 kbps MP3 audio (-vn) from Render (~0.11 GB per 2-hour movie!)
      // 3. <video> waits for <audio> via syncSplitPlayback() so both start in exact lockstep!
      video.muted = true;
      video.playbackRate = playbackSpeed;
      if (directVideoLoadedUrlRef.current !== effectiveCdnUrl) {
        directVideoLoadedUrlRef.current = effectiveCdnUrl;
        video.src = effectiveCdnUrl;
        video.load();
        video.addEventListener(
          'loadedmetadata',
          () => {
            if (
              streamStartOffsetSec > 0 &&
              Math.abs(video.currentTime - streamStartOffsetSec) > 1
            ) {
              try {
                video.currentTime = streamStartOffsetSec;
              } catch {
                // Ignore if not yet seekable
              }
            }
            syncSplitPlayback();
          },
          { once: true },
        );
      } else {
        if (Math.abs(video.currentTime - streamStartOffsetSec) > 1.2) {
          try {
            video.currentTime = streamStartOffsetSec;
          } catch {
            // Ignore
          }
        }
        if (video.paused && !userPausedRef.current) {
          video.muted = true;
          video.play().catch(() => {});
        }
      }

      if (audio) {
        const audioOnlyUrl = buildTranscodedStreamUrl(
          effectiveCdnUrl,
          selectedAudioTrackIndex,
          streamStartOffsetSec,
          undefined,
          'audio',
        );
        audio.src = seekNonce > 0 ? `${audioOnlyUrl}&_sn=${seekNonce}` : audioOnlyUrl;
        audio.muted = isMuted;
        audio.volume = volume;
        audio.playbackRate = playbackSpeed;
        audio.load();
        audio
          .play()
          .then(() => {
            audioUnlockedRef.current = true;
            setAudioBlockedByBrowser(false);
          })
          .catch((err) => {
            if (
              err &&
              (err.name === 'NotAllowedError' ||
                /interact|gesture|permission/i.test(String(err.message || '')))
            ) {
              setAudioBlockedByBrowser(true);
            }
          });
      }
    } else {
      if (audio) {
        audio.pause();
        audio.removeAttribute('src');
        audio.load();
      }
      directVideoLoadedUrlRef.current = effectiveCdnUrl;
      video.src = effectiveCdnUrl;
      video.muted = isMuted;
      video.volume = volume;
      video.playbackRate = playbackSpeed;
      video.load();
      video.addEventListener(
        'loadedmetadata',
        () => {
          if (streamStartOffsetSec > 0 && video.currentTime < 1) {
            video.currentTime = streamStartOffsetSec;
          }
          video.play().catch(() => {
            setIsPlaying(false);
          });
        },
        { once: true },
      );
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [
    activeStreamId,
    activeStreamIsHls,
    activeStreamKind,
    activeStreamUrl,
    isSplitAudioMode,
    probedStreamUrl,
    resolvedDirectUrl,
    seekNonce,
    selectedAudioTrackIndex,
    streamStartOffsetSec,
    useFfmpegAudioEngine,
  ]);

  // Switch audio track / language while preserving exact playback position & last video frame
  const handleSelectAudioTrack = (trackIndex: number) => {
    if (trackIndex === selectedAudioTrackIndex) return;
    captureVideoFrameSnapshot();
    userPausedRef.current = false;
    setStreamStartOffsetSec(Math.max(0, Math.floor(currentTimeSec)));
    setSelectedAudioTrackIndex(trackIndex);
    const chosenTrack = probedAudioTracks.find((t) => t.audioIndex === trackIndex);
    const canPlayChosenTrackNatively = Boolean(
      trackIndex === 0 &&
        chosenTrack &&
        /^(aac|mp3|mp4a|opus|vorbis|flac)$/i.test(chosenTrack.codec),
    );
    setUseFfmpegAudioEngine(!canPlayChosenTrackNatively);
    if (hlsRef.current) {
      hlsRef.current.audioTrack = trackIndex;
    }
  };

  const togglePlayPause = useCallback(() => {
    const video = videoRef.current;
    const audio = audioRef.current;
    if (!video || activeStream?.kind !== 'direct') return;
    if (video.paused && (!isSplitAudioMode || !audio || audio.paused)) {
      userPausedRef.current = false;
      if (isSplitAudioMode && audio) {
        audio.muted = isMuted;
        audio.volume = volume;
        audio
          .play()
          .then(() => {
            audioUnlockedRef.current = true;
            setAudioBlockedByBrowser(false);
          })
          .catch(() => {});
        video.muted = true;
        video.play().catch(() => {});
      } else {
        video.play().catch(() => {});
      }
    } else {
      userPausedRef.current = true;
      video.pause();
      if (isSplitAudioMode && audio) {
        audio.pause();
      }
    }
  }, [activeStream?.kind, isMuted, isSplitAudioMode, volume]);

  const seekTo = useCallback(
    (nextSec: number) => {
      const video = videoRef.current;
      const audio = audioRef.current;
      if (!video || activeStream?.kind !== 'direct') return;
      if (zoneSeekCommitTimerRef.current) {
        window.clearTimeout(zoneSeekCommitTimerRef.current);
        zoneSeekCommitTimerRef.current = null;
      }
      pendingSeekTargetRef.current = null;
      captureVideoFrameSnapshot();
      userPausedRef.current = false;
      const maxDur = effectiveDurationSec > 0 ? effectiveDurationSec : 14400;
      const clamped = Math.max(0, Math.min(maxDur, Math.floor(nextSec)));
      currentTimeRef.current = clamped;
      setCurrentTimeSec(clamped);
      setScrubPreviewSec(null);
      setFailoverCountdownSec(30);

      if (isSplitAudioMode) {
        setIsBuffering(true);
        isSeekingSplitRef.current = true;
        lastSeekStartedAtMsRef.current = Date.now();
        const targetRelativeSec = clamped - streamStartOffsetRef.current;
        let isAudioBuffered = false;
        if (audio && targetRelativeSec >= 0 && audio.buffered && audio.buffered.length > 0) {
          for (let i = 0; i < audio.buffered.length; i++) {
            const bStart = audio.buffered.start(i);
            const bEnd = audio.buffered.end(i);
            if (targetRelativeSec >= bStart && targetRelativeSec + 0.5 <= bEnd) {
              isAudioBuffered = true;
              break;
            }
          }
        }
        if (audio && isAudioBuffered) {
          try {
            video.currentTime = clamped;
            audio.currentTime = targetRelativeSec;
          } catch {
            // ignore
          }
          syncSplitPlayback();
        } else {
          // Immediately update streamStartOffsetRef synchronously & pause old <audio> BEFORE mutating video.currentTime
          // so a stale onTimeUpdate from the previous <audio> stream can never yank video.currentTime backward!
          streamStartOffsetRef.current = clamped;
          if (audio && !audio.paused) {
            audio.pause();
          }
          try {
            video.currentTime = clamped;
          } catch {
            // ignore
          }
          setStreamStartOffsetSec(clamped);
          setSeekNonce((prev) => prev + 1);
        }
      } else {
        setIsBuffering(true);
        try {
          video.currentTime = clamped;
        } catch {
          // ignore
        }
      }
    },
    [
      activeStream?.kind,
      captureVideoFrameSnapshot,
      effectiveDurationSec,
      isSplitAudioMode,
      syncSplitPlayback,
    ],
  );

  // Quick Resolution / Aspect Ratio Cycle Button: cycles to the next aspect/resolution preset on each click
  const cycleNextAspectRatio = useCallback(() => {
    setAspectMode((prev) => {
      const currentIndex = CROP_OPTIONS.findIndex((c) => c.mode === prev);
      const nextIndex = (currentIndex + 1) % CROP_OPTIONS.length;
      const nextOption = CROP_OPTIONS[nextIndex] ?? CROP_OPTIONS[0];
      setFailoverToast(`Resolution / Aspect Ratio: ${nextOption.label}`);
      return nextOption.mode;
    });
  }, []);

  const handleTimelineSliderChange = useCallback(
    (nextVal: number) => {
      if (scrubPreviewSec === null) {
        captureVideoFrameSnapshot();
      }
      setScrubPreviewSec(nextVal);
      setCurrentTimeSec(nextVal);
      if (scrubCommitTimerRef.current) {
        window.clearTimeout(scrubCommitTimerRef.current);
      }
      scrubCommitTimerRef.current = window.setTimeout(() => {
        seekTo(nextVal);
      }, 180);
    },
    [captureVideoFrameSnapshot, scrubPreviewSec, seekTo],
  );

  const showGestureHudBanner = useCallback(
    (kind: 'brightness' | 'volume', valuePct: number) => {
      setGestureHud({ kind, valuePct: Math.round(valuePct) });
      if (gestureHudTimerRef.current) {
        window.clearTimeout(gestureHudTimerRef.current);
      }
      gestureHudTimerRef.current = window.setTimeout(() => {
        setGestureHud(null);
      }, 1350);
    },
    [],
  );

  const applyVolumeLevel = useCallback(
    (rawVolume: number, showHudIndicator = true) => {
      const clamped = Math.max(0, Math.min(1, Number(rawVolume.toFixed(2))));
      setVolume(clamped);
      const nextMuted = clamped === 0;
      setIsMuted(nextMuted);
      if (isSplitAudioMode) {
        if (videoRef.current) videoRef.current.muted = true;
        if (audioRef.current) {
          audioRef.current.volume = clamped;
          audioRef.current.muted = nextMuted;
        }
      } else if (videoRef.current) {
        videoRef.current.volume = clamped;
        videoRef.current.muted = nextMuted;
      }
      if (showHudIndicator) {
        showGestureHudBanner('volume', clamped * 100);
      }
    },
    [isSplitAudioMode, showGestureHudBanner],
  );

  const applyBrightnessLevel = useCallback(
    (rawBrightness: number, showHudIndicator = true) => {
      const clamped = Math.max(0.2, Math.min(1.5, Number(rawBrightness.toFixed(2))));
      setBrightness(clamped);
      if (showHudIndicator) {
        showGestureHudBanner('brightness', clamped * 100);
      }
    },
    [showGestureHudBanner],
  );

  const triggerZoneSeek = useCallback(
    (side: 'left' | 'right') => {
      const stepSec = side === 'left' ? -10 : 10;
      if (pendingSeekTargetRef.current === null) {
        captureVideoFrameSnapshot();
      }
      const baseSec =
        pendingSeekTargetRef.current !== null
          ? pendingSeekTargetRef.current
          : currentTimeRef.current;
      const maxDur = effectiveDurationSec > 0 ? effectiveDurationSec : 14400;
      const targetSec = Math.max(0, Math.min(maxDur, Math.floor(baseSec + stepSec)));
      pendingSeekTargetRef.current = targetSec;
      currentTimeRef.current = targetSec;
      setCurrentTimeSec(targetSec);
      setScrubPreviewSec(targetSec);

      if (zoneSeekCommitTimerRef.current) {
        window.clearTimeout(zoneSeekCommitTimerRef.current);
      }
      zoneSeekCommitTimerRef.current = window.setTimeout(() => {
        zoneSeekCommitTimerRef.current = null;
        const commitSec = pendingSeekTargetRef.current;
        pendingSeekTargetRef.current = null;
        if (commitSec !== null) {
          seekTo(commitSec);
        }
      }, 220);

      setSeekRipple((prev) => {
        const nextDelta =
          prev && prev.side === side ? prev.deltaSec + stepSec : stepSec;
        return {
          side,
          deltaSec: nextDelta,
          key: Date.now(),
        };
      });
      if (seekRippleTimerRef.current) {
        window.clearTimeout(seekRippleTimerRef.current);
      }
      seekRippleTimerRef.current = window.setTimeout(() => {
        setSeekRipple(null);
      }, 850);
    },
    [captureVideoFrameSnapshot, effectiveDurationSec, seekTo],
  );

  const [isScreenLocked, setIsScreenLocked] = useState(false);
  const [isMiniPlayer, setIsMiniPlayer] = useState(false);
  const [isPiPActive, setIsPiPActive] = useState(false);
  const [isHold2xActive, setIsHold2xActive] = useState(false);
  const hold2xTimerRef = useRef<number | null>(null);
  const preHoldSpeedRef = useRef<number>(1);
  const [ambilightEnabled, setAmbilightEnabled] = useState(true);
  const [ambilightColor, setAmbilightColor] = useState<string>('56, 189, 248');
  const [audioBoostPct, setAudioBoostPct] = useState<100 | 150 | 200>(100);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const connectedMediaElRef = useRef<HTMLMediaElement | null>(null);
  const [shutterFlashActive, setShutterFlashActive] = useState(false);
  const [bookmarkNoteInput, setBookmarkNoteInput] = useState('');
  const [sceneBookmarks, setSceneBookmarks] = useState<SceneBookmarkItem[]>(() => {
    try {
      const raw = localStorage.getItem(`fablearc_scene_bookmarks_v1_${media.id}`);
      return raw ? (JSON.parse(raw) as SceneBookmarkItem[]) : [];
    } catch {
      return [];
    }
  });
  const [nextEpisodeDismissed, setNextEpisodeDismissed] = useState(false);

  // Sync Scene Bookmarks when media.id changes
  useEffect(() => {
    try {
      const raw = localStorage.getItem(`fablearc_scene_bookmarks_v1_${media.id}`);
      setSceneBookmarks(raw ? (JSON.parse(raw) as SceneBookmarkItem[]) : []);
    } catch {
      setSceneBookmarks([]);
    }
  }, [media.id]);

  const persistSceneBookmarks = useCallback(
    (nextList: SceneBookmarkItem[]) => {
      setSceneBookmarks(nextList);
      try {
        localStorage.setItem(
          `fablearc_scene_bookmarks_v1_${media.id}`,
          JSON.stringify(nextList),
        );
      } catch {}
    },
    [media.id],
  );

  const addSceneBookmark = useCallback(
    (customLabel?: string) => {
      const tSec = Math.max(0, Math.floor(currentTimeRef.current));
      const cleanLabel =
        (customLabel ?? bookmarkNoteInput).trim() ||
        (selectedEpisode
          ? `S${selectedEpisode.season}:E${selectedEpisode.episode} @ ${formatTimecode(tSec)}`
          : `Scene @ ${formatTimecode(tSec)}`);
      const newEntry: SceneBookmarkItem = {
        id: `${Date.now()}-${tSec}`,
        timeSec: tSec,
        label: cleanLabel,
        createdAtIso: new Date().toISOString(),
      };
      const updated = [...sceneBookmarks, newEntry].sort((a, b) => a.timeSec - b.timeSec);
      persistSceneBookmarks(updated);
      setBookmarkNoteInput('');
      setFailoverToast(`Saved bookmark "${cleanLabel}" (${formatTimecode(tSec)})`);
    },
    [bookmarkNoteInput, persistSceneBookmarks, sceneBookmarks, selectedEpisode],
  );

  const removeSceneBookmark = useCallback(
    (id: string) => {
      persistSceneBookmarks(sceneBookmarks.filter((b) => b.id !== id));
    },
    [persistSceneBookmarks, sceneBookmarks],
  );

  // Video Frame Screenshot Capture (Downloads PNG)
  const captureScreenshotFrame = useCallback(() => {
    const video = videoRef.current;
    if (!video || video.videoWidth <= 0 || video.videoHeight <= 0) {
      setFailoverToast('Wait for video frame to load before capturing screenshot.');
      return;
    }
    setShutterFlashActive(true);
    window.setTimeout(() => setShutterFlashActive(false), 260);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      const safeTitle = media.name.replace(/[^a-z0-9_-]+/gi, '_');
      const timeStr = formatTimecode(currentTimeRef.current).replace(/:/g, '-');
      link.download = `${safeTitle}_${timeStr}.png`;
      link.href = dataUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setFailoverToast(`Screenshot saved (${formatTimecode(currentTimeRef.current)})`);
    } catch {
      // If cross-origin video frame prevents canvas export, bookmark the exact timestamp automatically
      addSceneBookmark(`Captured Moment @ ${formatTimecode(currentTimeRef.current)}`);
      setFailoverToast(
        `Bookmarked frame at ${formatTimecode(currentTimeRef.current)} (Cross-Origin stream protected)`,
      );
    }
  }, [addSceneBookmark, media.name]);

  // Picture-in-Picture (PiP) Toggle
  const togglePiP = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
        setIsPiPActive(false);
      } else if (typeof video.requestPictureInPicture === 'function') {
        await video.requestPictureInPicture();
        setIsPiPActive(true);
      } else {
        setIsMiniPlayer((prev) => !prev);
      }
    } catch {
      // Fallback to in-app floating Mini Player
      setIsMiniPlayer((prev) => !prev);
    }
  }, []);

  // Hold-to-2x Speed helpers
  const startHold2xSpeed = useCallback(() => {
    if (isScreenLocked || activeStream?.kind !== 'direct') return;
    preHoldSpeedRef.current = playbackSpeed;
    setIsHold2xActive(true);
    if (videoRef.current) videoRef.current.playbackRate = 2;
    if (audioRef.current) audioRef.current.playbackRate = 2;
  }, [activeStream?.kind, isScreenLocked, playbackSpeed]);

  const stopHold2xSpeed = useCallback(() => {
    if (hold2xTimerRef.current) {
      window.clearTimeout(hold2xTimerRef.current);
      hold2xTimerRef.current = null;
    }
    setIsHold2xActive((wasActive) => {
      if (wasActive) {
        const restoreRate = preHoldSpeedRef.current || 1;
        if (videoRef.current) videoRef.current.playbackRate = restoreRate;
        if (audioRef.current) audioRef.current.playbackRate = restoreRate;
      }
      return false;
    });
  }, []);

  // Night Mode / Dialogue Audio Boost (100% -> 150% -> 200%) via Web Audio API Compressor + Gain
  const cycleAudioBoost = useCallback(() => {
    setAudioBoostPct((prev) => {
      const next: 100 | 150 | 200 = prev === 100 ? 150 : prev === 150 ? 200 : 100;
      const targetEl = isSplitAudioMode ? audioRef.current : videoRef.current;
      try {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext;
        if (AudioCtx && targetEl && connectedMediaElRef.current !== targetEl) {
          const ctx = audioCtxRef.current ?? new AudioCtx();
          audioCtxRef.current = ctx;
          const source = ctx.createMediaElementSource(targetEl);
          const compressor = ctx.createDynamicsCompressor();
          compressor.threshold.value = -28;
          compressor.knee.value = 24;
          compressor.ratio.value = 6;
          compressor.attack.value = 0.005;
          compressor.release.value = 0.2;
          const gain = ctx.createGain();
          gainNodeRef.current = gain;
          source.connect(compressor);
          compressor.connect(gain);
          gain.connect(ctx.destination);
          connectedMediaElRef.current = targetEl;
        }
        if (gainNodeRef.current) {
          gainNodeRef.current.gain.value = next / 100;
        }
        if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
          audioCtxRef.current.resume().catch(() => {});
        }
      } catch {
        // Safe fallback if browser blocks MediaElementSource on cross-origin stream
      }
      setFailoverToast(
        next === 100
          ? 'Audio Boost: 100% (Standard)'
          : `Night Dialogue Audio Boost: ${next}%`,
      );
      return next;
    });
  }, [isSplitAudioMode]);

  // Dynamic Cinema Ambilight color sampler
  useEffect(() => {
    if (!ambilightEnabled || !isPlaying) return;
    const sampleColor = () => {
      const video = videoRef.current;
      if (!video || video.videoWidth <= 0 || video.videoHeight <= 0) return;
      try {
        const c = document.createElement('canvas');
        c.width = 16;
        c.height = 16;
        const ctx = c.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(video, 0, 0, 16, 16);
        const data = ctx.getImageData(0, 0, 16, 16).data;
        let r = 0;
        let g = 0;
        let b = 0;
        let count = 0;
        for (let i = 0; i < data.length; i += 16) {
          r += data[i];
          g += data[i + 1];
          b += data[i + 2];
          count++;
        }
        if (count > 0) {
          setAmbilightColor(
            `${Math.min(255, Math.round(r / count) + 25)}, ${Math.min(255, Math.round(g / count) + 25)}, ${Math.min(255, Math.round(b / count) + 25)}`,
          );
        }
      } catch {
        // Cross-origin video fallback keeps dynamic cinema aura
      }
    };
    const id = window.setInterval(sampleColor, 1800);
    return () => window.clearInterval(id);
  }, [ambilightEnabled, isPlaying]);

  // Compute Next Episode for Binge Auto-Play in TV Series
  const nextEpisode = useMemo<StremioEpisodeVideo | null>(() => {
    if (media.type !== 'series' || !selectedEpisode || media.videos.length <= 1) {
      return null;
    }
    const sorted = [...media.videos].sort((a, b) =>
      a.season !== b.season ? a.season - b.season : a.episode - b.episode,
    );
    const idx = sorted.findIndex((ep) => ep.id === selectedEpisode.id);
    if (idx !== -1 && idx + 1 < sorted.length) {
      return sorted[idx + 1] ?? null;
    }
    return null;
  }, [media.type, media.videos, selectedEpisode]);

  useEffect(() => {
    setNextEpisodeDismissed(false);
  }, [selectedEpisode?.id]);

  const advanceToNextEpisode = useCallback(() => {
    if (!nextEpisode) return;
    setSelectedEpisode(nextEpisode);
    setEpisodeSeasonFilter(nextEpisode.season);
    setStreamStartOffsetSec(0);
    setCurrentTimeSec(0);
    setNextEpisodeDismissed(false);
    setFailoverToast(
      `Playing Next Episode: S${nextEpisode.season}:E${nextEpisode.episode} — ${nextEpisode.name}`,
    );
  }, [nextEpisode]);

  const remainingEpisodeSec =
    effectiveDurationSec > 60 && currentTimeSec > 10
      ? Math.max(0, Math.ceil(effectiveDurationSec - currentTimeSec))
      : null;
  const showNextEpisodeCard =
    Boolean(nextEpisode) &&
    !nextEpisodeDismissed &&
    remainingEpisodeSec !== null &&
    remainingEpisodeSec <= 15 &&
    remainingEpisodeSec > 0;

  useEffect(() => {
    return () => {
      if (gestureHudTimerRef.current) window.clearTimeout(gestureHudTimerRef.current);
      if (seekRippleTimerRef.current) window.clearTimeout(seekRippleTimerRef.current);
      if (singleTapTimerRef.current) window.clearTimeout(singleTapTimerRef.current);
      if (hold2xTimerRef.current) window.clearTimeout(hold2xTimerRef.current);
      if (zoneSeekCommitTimerRef.current) window.clearTimeout(zoneSeekCommitTimerRef.current);
    };
  }, []);

  // Keyboard shortcuts (Space, F, M, R/A for quick resolution cycle, ArrowLeft, ArrowRight, ArrowUp/Down for Volume, Shift+ArrowUp/Down or [/] for Brightness, Escape)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT')
      ) {
        return;
      }

      if (e.key === 'Escape') {
        if (activePopover) {
          setActivePopover(null);
        } else if (!document.fullscreenElement) {
          onClose();
        }
      } else if (e.key === ' ' || e.key === 'k') {
        e.preventDefault();
        togglePlayPause();
      } else if (e.key.toLowerCase() === 'f') {
        e.preventDefault();
        toggleFullscreen();
      } else if (e.key.toLowerCase() === 'a' || e.key.toLowerCase() === 'r') {
        e.preventDefault();
        cycleNextAspectRatio();
      } else if (e.key.toLowerCase() === 'm') {
        e.preventDefault();
        setIsMuted((prev) => {
          const next = !prev;
          if (isSplitAudioMode) {
            if (videoRef.current) videoRef.current.muted = true;
            if (audioRef.current) audioRef.current.muted = next;
          } else if (videoRef.current) {
            videoRef.current.muted = next;
          }
          showGestureHudBanner('volume', next ? 0 : volume * 100);
          return next;
        });
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        triggerZoneSeek('left');
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        triggerZoneSeek('right');
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (e.shiftKey) {
          applyBrightnessLevel(brightness + 0.05, true);
        } else {
          applyVolumeLevel((isMuted ? 0 : volume) + 0.05, true);
        }
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (e.shiftKey) {
          applyBrightnessLevel(brightness - 0.05, true);
        } else {
          applyVolumeLevel((isMuted ? 0 : volume) - 0.05, true);
        }
      } else if (e.key === ']') {
        e.preventDefault();
        applyBrightnessLevel(brightness + 0.05, true);
      } else if (e.key === '[') {
        e.preventDefault();
        applyBrightnessLevel(brightness - 0.05, true);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    activePopover,
    applyBrightnessLevel,
    applyVolumeLevel,
    brightness,
    cycleNextAspectRatio,
    isMuted,
    isSplitAudioMode,
    onClose,
    showGestureHudBanner,
    toggleFullscreen,
    togglePlayPause,
    triggerZoneSeek,
    volume,
  ]);

  const changeSpeed = (speed: number) => {
    setPlaybackSpeed(speed);
    if (videoRef.current) {
      videoRef.current.playbackRate = speed;
    }
    if (audioRef.current) {
      audioRef.current.playbackRate = speed;
    }
  };

  const availableSeasons = useMemo(() => {
    const s = new Set<number>();
    media.videos.forEach((v) => s.add(v.season));
    return Array.from(s).sort((a, b) => a - b);
  }, [media.videos]);

  const togglePopover = (target: Exclude<BottomPopoverType, null>) => {
    setActivePopover((prev) => (prev === target ? null : target));
  };

  const currentCropIndex = CROP_OPTIONS.findIndex((c) => c.mode === aspectMode);
  const currentCropLabel =
    CROP_OPTIONS[currentCropIndex]?.label ?? 'Auto Fit (Original)';
  const currentCropShortLabel =
    CROP_OPTIONS[currentCropIndex]?.shortLabel ?? 'Fit';

  const currentSubtitleTrack = subtitleTracks.find(
    (t) => t.id === selectedSubtitleTrackId,
  );

  return (
    <div
      className={`player-modal-backdrop ${showControlsHud && !isScreenLocked ? 'hud-visible' : 'hud-hidden'} ${isMiniPlayer ? 'mini-floating-player' : ''} ${isScreenLocked ? 'screen-locked' : ''}`}
      ref={containerRef}
      onMouseMove={resetHudTimer}
    >
      {/* Top Minimal Screening Header */}
      <header
        className={`player-top-bar ${showControlsHud && !isScreenLocked && !isMiniPlayer ? 'visible' : 'hidden'}`}
        onClick={(e) => {
          e.stopPropagation();
          resetHudTimer();
        }}
        onTouchStart={resetHudTimer}
      >
        <div className="player-top-left">
          <button
            type="button"
            className="player-icon-btn"
            onClick={onClose}
            title="Exit player (Esc)"
          >
            <X size={20} />
          </button>
          <div>
            <div className="player-title-row">
              <h2 className="player-film-title">{media.name}</h2>
              {selectedEpisode && (
                <span className="player-episode-pill">
                  S{selectedEpisode.season}:E{selectedEpisode.episode} — {selectedEpisode.name}
                </span>
              )}
            </div>
            <div className="player-source-badges">
              {activeStream ? (
                <>
                  <span className="tech-badge quality-pill">
                    {activeStream.qualityBadge || 'HD'}
                  </span>
                  {activeStream.audioBadge && (
                    <span className="tech-badge multi-audio-pill">
                      {activeStream.audioBadge}
                    </span>
                  )}
                  <span className="tech-badge">{activeStream.addonName}</span>
                  <span className="tech-badge accent">{activeStream.name}</span>
                  {activeStream.sizeLabel && (
                    <span className="tech-badge mono">{activeStream.sizeLabel}</span>
                  )}
                  {activeAudioTrackObj && (
                    <span className="tech-badge safe-tag">
                      Audio: {activeAudioTrackObj.langName}
                    </span>
                  )}
                </>
              ) : (
                <span className="tech-badge">
                  {loadingStreams
                    ? 'Finding best quality streams…'
                    : 'Choose a stream from Quality below'}
                </span>
              )}
              {media.imdbRating && (
                <span className="tech-badge mono">★ {media.imdbRating}</span>
              )}
            </div>
          </div>
        </div>

        {/* Top-Right Quick Utility Actions (Ambilight, Screenshot, Mini Player, Screen Lock) */}
        <div className="player-top-right">
          <button
            type="button"
            className={`player-icon-btn ${ambilightEnabled ? 'active-utility-btn' : ''}`}
            onClick={() => setAmbilightEnabled((prev) => !prev)}
            title={ambilightEnabled ? 'Disable Cinema Ambilight Glow' : 'Enable Cinema Ambilight Glow'}
          >
            <Sparkles size={17} />
          </button>
          <button
            type="button"
            className="player-icon-btn"
            onClick={captureScreenshotFrame}
            title="Capture Video Frame Screenshot (PNG)"
          >
            <Camera size={17} />
          </button>
          <button
            type="button"
            className={`player-icon-btn ${isMiniPlayer || isPiPActive ? 'active-utility-btn' : ''}`}
            onClick={() => setIsMiniPlayer((prev) => !prev)}
            title="Toggle Floating Mini Player (Browse while watching)"
          >
            <PictureInPicture2 size={17} />
          </button>
          <button
            type="button"
            className="player-icon-btn"
            onClick={() => {
              setIsScreenLocked(true);
              setActivePopover(null);
            }}
            title="Lock Touch Controls (Prevent accidental touches on phone)"
          >
            <Lock size={17} />
          </button>
        </div>
      </header>

      {/* Main Video / Trailer Stage (Supports Left/Right Double-Tap ±10s Seek + Left Drag/Wheel Brightness + Right Drag/Wheel Volume + Hold 2x Speed) */}
      <div
        className="player-stage"
        onPointerDown={(e) => {
          if (isScreenLocked) return;
          const target = e.target as HTMLElement | null;
          if (target && target.closest('button, a, input, .pause-dossier-overlay, .player-buffer-overlay, .next-episode-card-overlay')) {
            return;
          }
          const rect = e.currentTarget.getBoundingClientRect();
          if (rect.width <= 0) return;
          const relX = (e.clientX - rect.left) / rect.width;
          const side: 'left' | 'right' = relX < 0.5 ? 'left' : 'right';
          stageGestureRef.current = {
            active: true,
            pointerId: e.pointerId,
            side,
            startX: e.clientX,
            startY: e.clientY,
            startValue: side === 'left' ? brightness : isMuted ? 0 : volume,
            isDragging: false,
          };
          if (hold2xTimerRef.current) window.clearTimeout(hold2xTimerRef.current);
          hold2xTimerRef.current = window.setTimeout(() => {
            if (stageGestureRef.current && !stageGestureRef.current.isDragging) {
              suppressNextClickRef.current = true;
              startHold2xSpeed();
            }
          }, 420);
        }}
        onPointerMove={(e) => {
          if (isScreenLocked) return;
          const g = stageGestureRef.current;
          if (!g || !g.active || g.pointerId !== e.pointerId) return;
          const dy = g.startY - e.clientY;
          const dx = e.clientX - g.startX;
          if (Math.abs(dy) > 10 || Math.abs(dx) > 10) {
            if (hold2xTimerRef.current) {
              window.clearTimeout(hold2xTimerRef.current);
              hold2xTimerRef.current = null;
            }
          }
          if (!g.isDragging) {
            if (Math.abs(dy) < 12 || Math.abs(dx) > Math.abs(dy) * 1.1) {
              return;
            }
            g.isDragging = true;
            suppressNextClickRef.current = true;
            stopHold2xSpeed();
            if (singleTapTimerRef.current) {
              window.clearTimeout(singleTapTimerRef.current);
              singleTapTimerRef.current = null;
            }
          }
          const rect = e.currentTarget.getBoundingClientRect();
          const sensitivityPx = Math.max(180, rect.height * 0.55);
          const deltaNormalized = dy / sensitivityPx;
          if (g.side === 'left') {
            applyBrightnessLevel(g.startValue + deltaNormalized * 1.1, true);
          } else {
            applyVolumeLevel(g.startValue + deltaNormalized, true);
          }
          resetHudTimer();
        }}
        onPointerUp={(e) => {
          stopHold2xSpeed();
          if (stageGestureRef.current && stageGestureRef.current.pointerId === e.pointerId) {
            stageGestureRef.current = null;
          }
        }}
        onPointerCancel={() => {
          stopHold2xSpeed();
          stageGestureRef.current = null;
        }}
        onWheel={(e) => {
          if (isScreenLocked) return;
          const target = e.target as HTMLElement | null;
          if (target && target.closest('.bottom-popover-panel, .pause-dossier-overlay')) {
            return;
          }
          if (Math.abs(e.deltaY) < 4) return;
          const rect = e.currentTarget.getBoundingClientRect();
          if (rect.width <= 0) return;
          const relX = (e.clientX - rect.left) / rect.width;
          const step = e.deltaY < 0 ? 0.05 : -0.05;
          if (relX < 0.5) {
            applyBrightnessLevel(brightness + step, true);
          } else {
            applyVolumeLevel((isMuted ? 0 : volume) + step, true);
          }
          resetHudTimer();
        }}
        onClick={(e) => {
          if (isScreenLocked) {
            resetHudTimer();
            return;
          }
          if (suppressNextClickRef.current) {
            suppressNextClickRef.current = false;
            return;
          }
          const target = e.target as HTMLElement | null;
          if (target && target.closest('button, a, input, .pause-dossier-overlay, .player-buffer-overlay, .next-episode-card-overlay')) {
            return;
          }
          const rect = e.currentTarget.getBoundingClientRect();
          const relX = rect.width > 0 ? (e.clientX - rect.left) / rect.width : 0.5;
          const zone: 'left' | 'center' | 'right' =
            relX < 0.35 ? 'left' : relX > 0.65 ? 'right' : 'center';
          const now = Date.now();
          const elapsed = now - lastTapInfoRef.current.timeMs;

          if (elapsed > 0 && elapsed < 280 && lastTapInfoRef.current.zone === zone) {
            // Double-click / Double-tap detected!
            if (singleTapTimerRef.current) {
              window.clearTimeout(singleTapTimerRef.current);
              singleTapTimerRef.current = null;
            }
            lastTapInfoRef.current = { timeMs: 0, zone };
            resetHudTimer();
            if (zone === 'left') {
              triggerZoneSeek('left');
            } else if (zone === 'right') {
              triggerZoneSeek('right');
            } else {
              toggleFullscreen();
            }
            return;
          }

          lastTapInfoRef.current = { timeMs: now, zone };
          if (singleTapTimerRef.current) {
            window.clearTimeout(singleTapTimerRef.current);
          }
          singleTapTimerRef.current = window.setTimeout(() => {
            singleTapTimerRef.current = null;
            if (activePopover) {
              setActivePopover(null);
              resetHudTimer();
            } else if (!showControlsHud) {
              resetHudTimer();
            } else {
              resetHudTimer();
              togglePlayPause();
            }
          }, 230);
        }}
      >
        {/* Dynamic Cinema Ambilight Glow Layer */}
        {ambilightEnabled && (
          <div
            className="ambilight-stage-glow"
            style={{
              background: `radial-gradient(circle at 50% 50%, rgba(${ambilightColor}, 0.36) 0%, rgba(${ambilightColor}, 0.14) 52%, transparent 80%)`,
            }}
            aria-hidden="true"
          />
        )}

        {/* Camera Shutter Flash Effect for Video Screenshot */}
        {shutterFlashActive && <div className="shutter-flash-overlay" aria-hidden="true" />}

        {/* Hold-to-2x Speed Indicator Pill */}
        {isHold2xActive && (
          <div className="hold-2x-pill">
            <Zap size={15} fill="currentColor" />
            <span>2x Speed · Hold</span>
          </div>
        )}

        {/* Screen Lock Floating Unlock Button (Mobile Anti-Accidental Touch) */}
        {isScreenLocked && (
          <button
            type="button"
            className="screen-locked-pill"
            onClick={(e) => {
              e.stopPropagation();
              setIsScreenLocked(false);
              resetHudTimer();
            }}
          >
            <Unlock size={16} />
            <span>Screen Locked — Tap to Unlock</span>
          </button>
        )}

        {/* Mini Floating Player Controls Overlay */}
        {isMiniPlayer && (
          <div className="mini-player-controls-overlay" onClick={(e) => e.stopPropagation()}>
            <div className="mini-player-title-bar">
              <strong>{media.name}</strong>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  className="player-icon-btn small"
                  onClick={() => setIsMiniPlayer(false)}
                  title="Expand to Full Player"
                >
                  <Maximize2 size={14} />
                </button>
                <button
                  type="button"
                  className="player-icon-btn small"
                  onClick={onClose}
                  title="Close Player"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
            <div className="mini-player-bottom-btns">
              <button
                type="button"
                className="player-icon-btn small"
                onClick={() => triggerZoneSeek('left')}
                title="Rewind 10s"
              >
                <Rewind size={14} />
              </button>
              <button
                type="button"
                className="player-icon-btn small"
                onClick={togglePlayPause}
                title={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? <Pause size={15} /> : <Play size={15} />}
              </button>
              <button
                type="button"
                className="player-icon-btn small"
                onClick={() => triggerZoneSeek('right')}
                title="Forward 10s"
              >
                <FastForward size={14} />
              </button>
            </div>
          </div>
        )}
        {/* Double-Click / Double-Tap ±10s Seek Ripple Overlay */}
        {seekRipple && (
          <div
            key={seekRipple.key}
            className={`seek-ripple-indicator ${seekRipple.side}`}
            aria-live="polite"
          >
            <div className="seek-ripple-bubble">
              {seekRipple.side === 'left' ? <Rewind size={24} /> : <FastForward size={24} />}
              <strong>
                {seekRipple.deltaSec > 0 ? `+${seekRipple.deltaSec}s` : `${seekRipple.deltaSec}s`}
              </strong>
              <span>{seekRipple.side === 'left' ? 'Rewind' : 'Forward'}</span>
            </div>
          </div>
        )}

        {/* Left Brightness / Right Volume Gesture & Scroll HUD Pill */}
        {gestureHud && (
          <div
            className={`gesture-hud-pill ${gestureHud.kind}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="gesture-hud-head">
              {gestureHud.kind === 'brightness' ? (
                <Sun size={17} className="gesture-hud-icon" />
              ) : gestureHud.valuePct === 0 ? (
                <VolumeX size={17} className="gesture-hud-icon" />
              ) : (
                <Volume2 size={17} className="gesture-hud-icon" />
              )}
              <span>
                {gestureHud.kind === 'brightness' ? 'Brightness' : 'Volume'}
              </span>
              <strong className="mono">{gestureHud.valuePct}%</strong>
            </div>
            <div className="gesture-hud-bar-track">
              <div
                className="gesture-hud-bar-fill"
                style={{
                  width: `${
                    gestureHud.kind === 'brightness'
                      ? Math.min(100, Math.max(0, ((gestureHud.valuePct - 20) / 130) * 100))
                      : Math.min(100, Math.max(0, gestureHud.valuePct))
                  }%`,
                }}
              />
            </div>
          </div>
        )}
        {/* Auto-Failover Notification Banner */}
        {failoverToast && (
          <div className="failover-toast-banner" onClick={(e) => e.stopPropagation()}>
            <Sparkles size={15} />
            <span>{failoverToast}</span>
          </div>
        )}

        {/* Browser Autoplay Audio Unmute Banner (if browser blocked async unmuted <audio>) */}
        {audioBlockedByBrowser && (
          <button
            type="button"
            className="failover-toast-banner"
            style={{
              cursor: 'pointer',
              border: '1px solid rgba(245, 197, 24, 0.75)',
              background: 'rgba(18, 16, 10, 0.94)',
              color: '#f5c518',
              zIndex: 60,
            }}
            onClick={(e) => {
              e.stopPropagation();
              const audio = audioRef.current;
              const video = videoRef.current;
              if (audio) {
                audio.muted = isMuted;
                audio.volume = volume;
                audio
                  .play()
                  .then(() => {
                    audioUnlockedRef.current = true;
                    setAudioBlockedByBrowser(false);
                    if (video && video.paused && !userPausedRef.current) {
                      video.play().catch(() => {});
                    }
                  })
                  .catch(() => {});
              }
            }}
          >
            <Volume2 size={16} />
            <span>Tap anywhere to enable audio</span>
          </button>
        )}

        {/* Always-mounted Audio Master Clock Element (pre-unlocked on initial user gesture) */}
        <audio
          ref={audioRef}
          style={{ display: 'none' }}
          preload="auto"
          onLoadedData={() => {
            if (isSplitAudioMode) syncSplitPlayback();
          }}
          onCanPlay={() => {
            if (isSplitAudioMode) syncSplitPlayback();
          }}
          onCanPlayThrough={() => {
            if (isSplitAudioMode) syncSplitPlayback();
          }}
          onPlaying={() => {
            if (isSplitAudioMode) syncSplitPlayback();
          }}
          onWaiting={() => {
            if (isSplitAudioMode) {
              setIsBuffering(true);
              if (videoRef.current && !videoRef.current.paused) {
                videoRef.current.pause();
              }
            }
          }}
          onTimeUpdate={() => {
            if (isSplitAudioMode && !userPausedRef.current) {
              syncSplitPlayback();
            }
          }}
        />

        {activeStream?.kind === 'direct' && activeStream.url && (
          <>
            <video
              ref={videoRef}
              className={`player-video-element fit-${aspectMode}`}
              style={{
                filter: brightness !== 1 ? `brightness(${brightness})` : undefined,
              }}
              poster={media.background || media.poster}
              playsInline
              onLoadStart={() => setIsBuffering(true)}
              onLoadedData={() => {
                if (isSplitAudioMode) {
                  syncSplitPlayback();
                }
              }}
              onWaiting={() => {
                setIsBuffering(true);
                if (isSplitAudioMode && audioRef.current && !audioRef.current.paused) {
                  audioRef.current.pause();
                }
              }}
              onStalled={() => setIsBuffering(true)}
              onSeeking={() => setIsBuffering(true)}
              onSeeked={() => {
                if (isSplitAudioMode) {
                  syncSplitPlayback();
                } else {
                  setIsBuffering(false);
                  setHasFreezeFrame(false);
                }
              }}
              onCanPlay={() => {
                if (isSplitAudioMode) {
                  syncSplitPlayback();
                } else {
                  setIsBuffering(false);
                }
              }}
              onCanPlayThrough={() => {
                if (isSplitAudioMode) {
                  syncSplitPlayback();
                } else {
                  setIsBuffering(false);
                }
              }}
              onPlaying={() => {
                setIsPlaying(true);
                if (isSplitAudioMode) {
                  syncSplitPlayback();
                } else {
                  setIsBuffering(false);
                  setHasStartedPlayback(true);
                  setHasFreezeFrame(false);
                  setFailoverCountdownSec(30);
                }
              }}
              onPlay={() => {
                setIsPlaying(true);
                if (isSplitAudioMode) {
                  syncSplitPlayback();
                }
              }}
              onPause={(e) => {
                if (userPausedRef.current || !isSplitAudioMode) {
                  setIsPlaying(false);
                }
                if (userPausedRef.current && isSplitAudioMode && audioRef.current) {
                  audioRef.current.pause();
                }
                const actualPos = e.currentTarget.currentTime;
                const dur = effectiveDurationSec || e.currentTarget.duration || 0;
                if (actualPos > 1) {
                  onProgressRef.current(
                    {
                      mediaId: media.id,
                      mediaName: media.name,
                      mediaType: media.type,
                      poster: media.poster,
                      background: media.background,
                      episodeId: selectedEpisode?.id,
                      episodeLabel: selectedEpisode
                        ? `S${selectedEpisode.season}:E${selectedEpisode.episode} ${selectedEpisode.name}`
                        : undefined,
                      positionSec: actualPos,
                      durationSec: dur,
                      updatedAtIso: new Date().toISOString(),
                    },
                    true,
                  );
                }
              }}
              onError={() => {
                setIsBuffering(true);
                switchToNextStream('Video format or server unavailable');
              }}
              onLoadedMetadata={(e) => {
                e.currentTarget.muted = isSplitAudioMode ? true : isMuted;
                e.currentTarget.volume = volume;
                if (audioRef.current) {
                  audioRef.current.muted = isMuted;
                  audioRef.current.volume = volume;
                }
                const dur = e.currentTarget.duration;
                if (Number.isFinite(dur) && dur > 0) {
                  setNativeDurationSec(dur);
                }
              }}
              onTimeUpdate={(e) => {
                const actualPos = e.currentTarget.currentTime;
                if (actualPos > 0.08 && !e.currentTarget.paused) {
                  if (!isSplitAudioMode || (audioRef.current && audioRef.current.readyState >= 2)) {
                    setIsBuffering(false);
                    setHasStartedPlayback(true);
                    setHasFreezeFrame(false);
                  }
                }
                if (isSplitAudioMode && !e.currentTarget.paused) {
                  syncSplitPlayback();
                }
                const dur = effectiveDurationSec || e.currentTarget.duration || 0;
                if (scrubPreviewSec === null) {
                  setCurrentTimeSec(actualPos);
                }
                onProgressRef.current({
                  mediaId: media.id,
                  mediaName: media.name,
                  mediaType: media.type,
                  poster: media.poster,
                  background: media.background,
                  episodeId: selectedEpisode?.id,
                  episodeLabel: selectedEpisode
                    ? `S${selectedEpisode.season}:E${selectedEpisode.episode} ${selectedEpisode.name}`
                    : undefined,
                  positionSec: actualPos,
                  durationSec: dur,
                  updatedAtIso: new Date().toISOString(),
                });
              }}
              onEnded={() => {
                if (nextEpisode && !nextEpisodeDismissed) {
                  advanceToNextEpisode();
                }
              }}
            />
            {/* Freeze-Frame Canvas Overlay: Preserves the last decoded video frame during +10s/-10s seek & timeline scrubbing so the screen never turns black */}
            <canvas
              ref={freezeCanvasRef}
              className={`player-freeze-canvas fit-${aspectMode} ${hasFreezeFrame && isBuffering ? 'visible' : ''}`}
              style={{
                filter: brightness !== 1 ? `brightness(${brightness})` : undefined,
              }}
              aria-hidden="true"
            />
          </>
        )}

        {/* Centered Orbital Buffering Loader & 30-Second Auto-Failover Indicator */}
        {(loadingStreams ||
          (activeStream?.kind === 'direct' && (isBuffering || !hasStartedPlayback))) && (
          <div
            className={`player-buffer-overlay ${hasStartedPlayback || hasFreezeFrame ? 'over-frozen-frame' : ''}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="buffer-orbital-spinner">
              <div className="orbital-ring outer" />
              <div className="orbital-ring inner" />
              <div className="orbital-core" />
            </div>
            <div className="buffer-status-block">
              <span className="buffer-kicker">
                {loadingStreams
                  ? 'FINDING BEST STREAMS…'
                  : hasStartedPlayback
                    ? 'LOADING VIDEO…'
                    : 'STARTING PLAYBACK…'}
              </span>
              {activeStream && (
                <strong className="buffer-stream-title">
                  {activeStream.qualityBadge || 'HD'} · {activeStream.addonName} ({activeStream.name})
                </strong>
              )}
              {activeStream?.kind === 'direct' && streams.length > 1 && (
                <div className="buffer-failover-row">
                  <span className="buffer-countdown-pill mono">
                    Trying next server in {failoverCountdownSec}s
                  </span>
                  <button
                    type="button"
                    className="buffer-skip-btn"
                    onClick={() => switchToNextStream('Switched server')}
                  >
                    <span>Try Next Server</span>
                    <FastForward size={13} />
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {activeStream?.kind === 'youtube' && activeStream.ytId && (
          <div
            className="youtube-stage-embed"
            onClick={(e) => e.stopPropagation()}
            style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}
          >
            <iframe
              title={activeStream.title}
              src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(activeStream.ytId)}?autoplay=1&rel=0&modestbranding=1`}
              style={{ width: '100%', height: '100%', border: 'none' }}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        )}

        {!loadingStreams &&
          !activePopover &&
          (activeStream?.kind === 'external' ||
            activeStream?.kind === 'magnet' ||
            !activeStream) && (
          <div className="pause-dossier-overlay" onClick={(e) => e.stopPropagation()}>
            <span className="pause-kicker">
              {activeStream?.kind === 'external'
                ? `Watch on ${activeStream.name}`
                : activeStream?.kind === 'magnet'
                  ? `External Video Link (${activeStream.qualityBadge || activeStream.name})`
                  : 'No Stream Found'}
            </span>
            <h3 className="pause-film-heading">{media.name}</h3>
            <p className="pause-synopsis">
              {selectedEpisode?.overview ||
                media.description ||
                'Tap Quality below to pick another server.'}
            </p>

            <div className="hero-cta-row" style={{ marginTop: 12 }}>
              {activeStream?.kind === 'external' && activeStream.externalUrl && (
                <a
                  href={activeStream.externalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="primary-amber-btn"
                  style={{ textDecoration: 'none' }}
                >
                  <ExternalLink size={16} />
                  <span>Open on {activeStream.name}</span>
                </a>
              )}

              {activeStream?.kind === 'magnet' && activeStream.url && (
                <button
                  type="button"
                  className="primary-amber-btn"
                  onClick={() => {
                    navigator.clipboard?.writeText(activeStream.url!);
                  }}
                >
                  <Copy size={16} />
                  <span>Copy Video Link</span>
                </button>
              )}

              <button
                type="button"
                className="secondary-outline-btn"
                onClick={() => togglePopover('quality')}
              >
                <Layers size={16} />
                <span>Choose Server ({streams.length})</span>
              </button>
            </div>
          </div>
        )}

        {/* Subtle Pause Card when paused (and not currently buffering) and no bottom popover is open */}
        {activeStream?.kind === 'direct' &&
          !isPlaying &&
          hasStartedPlayback &&
          !isBuffering &&
          !activePopover && (
          <div className="pause-dossier-overlay" onClick={(e) => e.stopPropagation()}>
            <span className="pause-kicker">Paused</span>
            <h3 className="pause-film-heading">{media.name}</h3>
            <p className="pause-synopsis">{selectedEpisode?.overview ?? media.description}</p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 6 }}>
              <button type="button" className="primary-amber-btn" onClick={togglePlayPause}>
                <Play size={16} />
                <span>Resume</span>
              </button>
              {probedAudioTracks.length > 1 && (
                <button
                  type="button"
                  className="secondary-outline-btn"
                  onClick={() => togglePopover('audio')}
                >
                  <Headphones size={16} />
                  <span>
                    Audio: {activeAudioTrackObj?.langName || 'Multi-Audio'} (
                    {probedAudioTracks.length})
                  </span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Auto-Play Next Episode Countdown Card (Binge Mode for TV Series) */}
        {showNextEpisodeCard && nextEpisode && (
          <div className="next-episode-card-overlay" onClick={(e) => e.stopPropagation()}>
            <div className="next-episode-card-head">
              <span className="pause-kicker">
                Up Next in {remainingEpisodeSec}s
              </span>
              <strong className="next-episode-card-title">
                S{nextEpisode.season}:E{nextEpisode.episode} — {nextEpisode.name}
              </strong>
            </div>
            <div className="next-episode-card-actions">
              <button
                type="button"
                className="primary-amber-btn compact-btn"
                onClick={advanceToNextEpisode}
              >
                <SkipForward size={14} />
                <span>Play Next Now</span>
              </button>
              <button
                type="button"
                className="secondary-outline-btn compact-btn"
                onClick={() => setNextEpisodeDismissed(true)}
              >
                <span>Cancel</span>
              </button>
            </div>
          </div>
        )}

        {/* Custom Styled Subtitle Renderer */}
        {activeStream?.kind === 'direct' && activeSubtitleText && (
          <div
            className="custom-subtitle-layer"
            style={{
              bottom: `${subStyle.bottomOffsetPct}%`,
            }}
          >
            <span
              className="custom-subtitle-box"
              style={{
                fontSize: `${subStyle.fontSizePx}px`,
                color: subStyle.textColor,
                fontWeight: subStyle.bold ? 700 : 500,
                backgroundColor: `rgba(10, 11, 14, ${subStyle.bgOpacity})`,
                textShadow: subStyle.outline
                  ? '0 2px 6px rgba(0,0,0,0.95), 0 0 2px rgba(0,0,0,0.95)'
                  : 'none',
              }}
            >
              {activeSubtitleText}
            </span>
          </div>
        )}
      </div>

      {/* Bottom Transport Deck with Upward Popover Dropdown Menus */}
      <footer
        className={`player-bottom-deck ${showControlsHud && !isScreenLocked && !isMiniPlayer ? 'visible' : 'hidden'}`}
        onClick={(e) => {
          e.stopPropagation();
          resetHudTimer();
        }}
        onTouchStart={resetHudTimer}
      >
        {/* Upward Floating Dropdown Popover */}
        {activePopover && (
          <div className="bottom-popover-panel">
            <div className="bottom-popover-header">
              <div className="bottom-popover-title">
                {activePopover === 'quality' && (
                  <>
                    <Layers size={16} />
                    <span>
                      Video Quality &amp; Servers ({streams.length})
                    </span>
                  </>
                )}
                {activePopover === 'audio' && (
                  <>
                    <Headphones size={16} />
                    <span>
                      Audio Language ({probedAudioTracks.length || 1})
                    </span>
                  </>
                )}
                {activePopover === 'subtitles' && (
                  <>
                    <Captions size={16} />
                    <span>Subtitles ({subtitleTracks.length})</span>
                  </>
                )}
                {activePopover === 'speed' && (
                  <>
                    <Gauge size={16} />
                    <span>Playback Speed ({playbackSpeed}x)</span>
                  </>
                )}
                {activePopover === 'crop' && (
                  <>
                    <Crop size={16} />
                    <span>Screen Fit ({currentCropLabel})</span>
                  </>
                )}
                {activePopover === 'episodes' && (
                  <>
                    <Tv size={16} />
                    <span>Episodes ({media.videos.length})</span>
                  </>
                )}
                {activePopover === 'bookmarks' && (
                  <>
                    <Bookmark size={16} />
                    <span>Scene Bookmarks ({sceneBookmarks.length})</span>
                  </>
                )}
              </div>
              <button
                type="button"
                className="player-icon-btn small"
                onClick={() => setActivePopover(null)}
              >
                <X size={16} />
              </button>
            </div>

            {/* 1. QUALITY / STREAMS DROPDOWN (Sorted by Quality First, Then Multi-Audio Priority) */}
            {activePopover === 'quality' && (
              <div className="bottom-popover-body">
                <div className="popover-list-scroll">
                  {streams.length === 0 ? (
                    <p className="drawer-help-copy">
                      {loadingStreams
                        ? 'Finding available streams…'
                        : 'No streams available for this title right now.'}
                    </p>
                  ) : (
                    streams.map((stream) => {
                      const isSelected = activeStream?.id === stream.id;
                      const tierClass =
                        (stream.qualityScore ?? 0) >= 2160
                          ? 'tier-4k'
                          : (stream.qualityScore ?? 0) >= 1080
                            ? 'tier-1080p'
                            : (stream.qualityScore ?? 0) >= 720
                              ? 'tier-720p'
                              : 'tier-sd';
                      return (
                        <button
                          key={stream.id}
                          type="button"
                          className={`popover-option-row ${isSelected ? 'selected' : ''} ${stream.isTopResponsive ? 'top-responsive-server' : ''}`}
                          style={{ opacity: stream.unreachable ? 0.55 : 1 }}
                          onClick={() => {
                            if (stream.kind === 'external' && stream.externalUrl) {
                              window.open(stream.externalUrl, '_blank', 'noopener,noreferrer');
                              return;
                            }
                            userManuallySelectedStreamRef.current = true;
                            const resumeAtSec = Math.max(0, Math.floor(currentTimeRef.current));
                            setStreamStartOffsetSec(resumeAtSec);
                            setCurrentTimeSec(resumeAtSec);
                            setActiveStream(stream);
                            setActivePopover(null);
                          }}
                        >
                          <div className="popover-option-main">
                            <div className="popover-option-title-line">
                              {stream.isTopResponsive && (
                                <span className="fastest-server-badge">
                                  ⚡ Fastest
                                </span>
                              )}
                              <span className={`quality-tier-badge ${tierClass}`}>
                                {stream.qualityBadge || stream.kind.toUpperCase()}
                              </span>
                              {stream.audioBadge && (
                                <span className="multi-audio-badge">
                                  {stream.audioBadge}
                                </span>
                              )}
                              {stream.serverStatusBadge && (
                                <span
                                  className={`server-ping-badge mono ${stream.unreachable ? 'offline' : 'online'}`}
                                >
                                  {stream.serverStatusBadge}
                                </span>
                              )}
                              <strong>{stream.name}</strong>
                              {stream.sizeLabel && (
                                <span className="mono size-pill">{stream.sizeLabel}</span>
                              )}
                              <span className="addon-origin-tag">{stream.addonName}</span>
                            </div>
                            <span className="popover-option-sub">{stream.title}</span>
                          </div>
                          {isSelected && <Check size={16} className="selected-check" />}
                        </button>
                      );
                    })
                  )}
                </div>

                {externalLaunch.allowed && (
                  <>
                    <div className="popover-divider" />
                    <div className="popover-footer-tools">
                      <div className="external-handoff-inline">
                        <div className="button-strip compact">
                          {(['mpv', 'vlc', 'iina'] as ExternalPlayerKind[]).map((kind) => (
                            <button
                              key={kind}
                              type="button"
                              className={externalPlayer === kind ? 'active-chip-btn' : ''}
                              onClick={() => setExternalPlayer(kind)}
                            >
                              {kind.toUpperCase()}
                            </button>
                          ))}
                        </div>
                        <button
                          type="button"
                          className="secondary-outline-btn compact-btn"
                          onClick={() => {
                            navigator.clipboard?.writeText(externalLaunch.commandPreview);
                            setCopiedExternalCmd(true);
                            setTimeout(() => setCopiedExternalCmd(false), 1800);
                          }}
                        >
                          {copiedExternalCmd ? <Check size={14} /> : <Copy size={14} />}
                          <span>
                            {copiedExternalCmd
                              ? 'Copied'
                              : `Copy for ${externalPlayer.toUpperCase()}`}
                          </span>
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* 2. AUDIO LANGUAGE / TRACK DROPDOWN (Sorted: English -> Hindi -> Other Languages) */}
            {activePopover === 'audio' && (
              <div className="bottom-popover-body">
                <div className="popover-list-scroll">
                  {probedAudioTracks.length > 0 ? (
                    probedAudioTracks.map((track) => {
                      const isSelected = selectedAudioTrackIndex === track.audioIndex;
                      const langPrio = getAudioTrackLanguagePriority(track);
                      const badgeTier =
                        langPrio === 0
                          ? 'tier-4k'
                          : langPrio === 1
                            ? 'tier-1080p'
                            : 'tier-720p';
                      return (
                        <button
                          key={track.audioIndex}
                          type="button"
                          className={`popover-option-row ${isSelected ? 'selected' : ''}`}
                          onClick={() => {
                            handleSelectAudioTrack(track.audioIndex);
                            setActivePopover(null);
                          }}
                        >
                          <div className="popover-option-main">
                            <div className="popover-option-title-line">
                              <span className={`quality-tier-badge ${badgeTier}`}>
                                {langPrio === 0
                                  ? 'ENG · #1'
                                  : langPrio === 1
                                    ? 'HIN · #2'
                                    : track.langCode.toUpperCase()}
                              </span>
                              <strong>
                                {track.langName} (Track #{track.audioIndex + 1})
                              </strong>
                              <span className="mono size-pill">
                                {track.codec} · {track.channels}
                              </span>
                            </div>
                            <span className="popover-option-sub">
                              {track.title ? `${track.title} · ` : ''}Clear Stereo Audio
                            </span>
                          </div>
                          {isSelected && <Check size={16} className="selected-check" />}
                        </button>
                      );
                    })
                  ) : (
                    <div className="popover-grid-options">
                      {[
                        { idx: 0, label: 'Track #1 (English / Default)' },
                        { idx: 1, label: 'Track #2 (Hindi / Dual)' },
                        { idx: 2, label: 'Track #3 (Multi-Audio)' },
                        { idx: 3, label: 'Track #4 (Alternate)' },
                      ].map(({ idx, label }) => (
                        <button
                          key={idx}
                          type="button"
                          className={`popover-option-row ${selectedAudioTrackIndex === idx ? 'selected' : ''}`}
                          onClick={() => {
                            handleSelectAudioTrack(idx);
                            setActivePopover(null);
                          }}
                        >
                          <strong>{label}</strong>
                          {selectedAudioTrackIndex === idx && (
                            <Check size={15} className="selected-check" />
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="popover-divider" />
                <label className="drawer-control-row" style={{ cursor: 'pointer' }}>
                  <span>
                    <Sparkles size={13} style={{ marginRight: 6, color: '#F5B041' }} />
                    Enhanced Audio Compatibility (Recommended)
                  </span>
                  <input
                    type="checkbox"
                    checked={useFfmpegAudioEngine}
                    onChange={(e) => {
                      setStreamStartOffsetSec(Math.max(0, Math.floor(currentTimeSec)));
                      setUseFfmpegAudioEngine(e.target.checked);
                    }}
                  />
                </label>
              </div>
            )}

            {/* 3. SUBTITLES DROPDOWN */}
            {activePopover === 'subtitles' && (
              <div className="bottom-popover-body">
                <div className="popover-list-scroll" style={{ maxHeight: 190 }}>
                  <button
                    type="button"
                    className={`popover-option-row ${!subStyle.enabled || !selectedSubtitleTrackId ? 'selected' : ''}`}
                    onClick={() => {
                      setSubStyle((s) => ({ ...s, enabled: false }));
                    }}
                  >
                    <strong>Subtitles Off</strong>
                    {(!subStyle.enabled || !selectedSubtitleTrackId) && (
                      <Check size={16} className="selected-check" />
                    )}
                  </button>

                  {subtitleTracks.map((t) => {
                    const isSelected = subStyle.enabled && selectedSubtitleTrackId === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        className={`popover-option-row ${isSelected ? 'selected' : ''}`}
                        onClick={() => {
                          setSelectedSubtitleTrackId(t.id);
                          setSubStyle((s) => ({ ...s, enabled: true }));
                        }}
                      >
                        <div className="popover-option-main">
                          <div className="popover-option-title-line">
                            <span className="quality-tier-badge tier-720p">
                              {t.lang.toUpperCase()}
                            </span>
                            <strong>{t.label}</strong>
                          </div>
                          <span className="popover-option-sub">{t.addonName}</span>
                        </div>
                        {isSelected && <Check size={16} className="selected-check" />}
                      </button>
                    );
                  })}
                </div>

                {loadingSubtitleTrack && (
                  <span className="mono" style={{ fontSize: 11.5, color: '#F5B041' }}>
                    Loading subtitles…
                  </span>
                )}

                <div className="popover-divider" />

                <div className="subtitle-quick-controls">
                  <div className="drawer-control-row">
                    <span>Timing: {subStyle.delayMs}ms</span>
                    <div className="button-strip compact">
                      <button
                        type="button"
                        onClick={() => setSubStyle((s) => ({ ...s, delayMs: s.delayMs - 250 }))}
                      >
                        -0.25s
                      </button>
                      <button
                        type="button"
                        onClick={() => setSubStyle((s) => ({ ...s, delayMs: 0 }))}
                      >
                        Reset
                      </button>
                      <button
                        type="button"
                        onClick={() => setSubStyle((s) => ({ ...s, delayMs: s.delayMs + 250 }))}
                      >
                        +0.25s
                      </button>
                    </div>
                  </div>

                  <div className="drawer-control-row">
                    <span>Text Size ({subStyle.fontSizePx}px) &amp; Color</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <input
                        type="range"
                        min={16}
                        max={38}
                        value={subStyle.fontSizePx}
                        onChange={(e) =>
                          setSubStyle((s) => ({ ...s, fontSizePx: Number(e.target.value) }))
                        }
                        style={{ width: 90, accentColor: '#F5B041' }}
                      />
                      <div className="swatch-row" style={{ marginTop: 0 }}>
                        {SUBTITLE_SWATCHES.map((sw) => (
                          <button
                            key={sw.hex}
                            type="button"
                            className={`color-swatch ${subStyle.textColor === sw.hex ? 'selected' : ''}`}
                            style={{ backgroundColor: sw.hex, width: 20, height: 20 }}
                            title={sw.label}
                            onClick={() => setSubStyle((s) => ({ ...s, textColor: sw.hex }))}
                          />
                        ))}
                      </div>
                    </div>
                  </div>

                  <label className="drawer-control-row" style={{ cursor: 'pointer' }}>
                    <span>Hide sound descriptions ([music], ♪)</span>
                    <input
                      type="checkbox"
                      checked={subStyle.stripSdh}
                      onChange={(e) =>
                        setSubStyle((s) => ({ ...s, stripSdh: e.target.checked }))
                      }
                    />
                  </label>
                </div>

                {parsedCues.length > 0 && (
                  <details className="autosync-details">
                    <summary className="mono" style={{ fontSize: 11.5, cursor: 'pointer' }}>
                      Sync Subtitles (Tap the line currently being spoken)
                    </summary>
                    <div className="autosync-cue-list" style={{ marginTop: 8, maxHeight: 120 }}>
                      {parsedCues.slice(0, 40).map((cue) => (
                        <button
                          key={cue.id}
                          type="button"
                          className="autosync-cue-item"
                          onClick={() => {
                            const newDelay = computeAutoSyncDelayMs(
                              cue.startMs,
                              currentTimeSec * 1000,
                            );
                            setSubStyle((s) => ({ ...s, delayMs: newDelay }));
                          }}
                        >
                          <span className="mono cue-time">{formatTimecode(cue.startMs / 1000)}</span>
                          <span className="cue-text">{cue.text}</span>
                        </button>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            )}

            {/* 4. SPEED DROPDOWN */}
            {activePopover === 'speed' && (
              <div className="bottom-popover-body">
                <div className="popover-grid-options">
                  {SPEED_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      className={`popover-option-row ${playbackSpeed === opt.value ? 'selected' : ''}`}
                      onClick={() => {
                        changeSpeed(opt.value);
                        setActivePopover(null);
                      }}
                    >
                      <strong>{opt.label}</strong>
                      {playbackSpeed === opt.value && (
                        <Check size={16} className="selected-check" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 5. CROP / ASPECT RATIO DROPDOWN */}
            {activePopover === 'crop' && (
              <div className="bottom-popover-body">
                <div className="popover-list-scroll">
                  {CROP_OPTIONS.map((opt) => (
                    <button
                      key={opt.mode}
                      type="button"
                      className={`popover-option-row ${aspectMode === opt.mode ? 'selected' : ''}`}
                      onClick={() => {
                        setAspectMode(opt.mode);
                        setActivePopover(null);
                      }}
                    >
                      <div className="popover-option-main">
                        <strong>{opt.label}</strong>
                        <span className="popover-option-sub">{opt.desc}</span>
                      </div>
                      {aspectMode === opt.mode && <Check size={16} className="selected-check" />}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 6. SERIES EPISODES DROPDOWN */}
            {activePopover === 'episodes' && (
              <div className="bottom-popover-body">
                {availableSeasons.length > 1 && (
                  <div className="button-strip compact" style={{ flexWrap: 'wrap' }}>
                    {availableSeasons.map((sNum) => (
                      <button
                        key={sNum}
                        type="button"
                        className={episodeSeasonFilter === sNum ? 'active-chip-btn' : ''}
                        onClick={() => setEpisodeSeasonFilter(sNum)}
                      >
                        Season {sNum}
                      </button>
                    ))}
                  </div>
                )}
                <div className="popover-list-scroll">
                  {media.videos
                    .filter((ep) => ep.season === episodeSeasonFilter)
                    .map((ep) => {
                      const isCurrent = selectedEpisode?.id === ep.id;
                      return (
                        <button
                          key={ep.id}
                          type="button"
                          className={`popover-option-row ${isCurrent ? 'selected' : ''}`}
                          onClick={() => {
                            setSelectedEpisode(ep);
                            setStreamStartOffsetSec(0);
                            setCurrentTimeSec(0);
                            setActivePopover(null);
                          }}
                        >
                          <div className="popover-option-main">
                            <strong>
                              S{ep.season}:E{ep.episode} — {ep.name}
                            </strong>
                            {ep.overview && (
                              <span className="popover-option-sub">{ep.overview}</span>
                            )}
                          </div>
                          {isCurrent && <Check size={16} className="selected-check" />}
                        </button>
                      );
                    })}
                </div>
              </div>
            )}

            {/* 7. SCENE TIMESTAMP BOOKMARKS DROPDOWN */}
            {activePopover === 'bookmarks' && (
              <div className="bottom-popover-body">
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    type="text"
                    className="directory-search-input"
                    style={{ flex: 1, padding: '7px 11px', fontSize: 12.5 }}
                    placeholder={`Bookmark note @ ${formatTimecode(currentTimeSec)}…`}
                    value={bookmarkNoteInput}
                    onChange={(e) => setBookmarkNoteInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addSceneBookmark();
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="primary-amber-btn compact-btn"
                    onClick={() => addSceneBookmark()}
                  >
                    <Bookmark size={14} />
                    <span>+ Save ({formatTimecode(currentTimeSec)})</span>
                  </button>
                </div>

                <div className="popover-list-scroll">
                  {sceneBookmarks.length === 0 ? (
                    <p className="drawer-help-copy">
                      No bookmarked scenes yet. Click + Save above to bookmark your favorite moments.
                    </p>
                  ) : (
                    sceneBookmarks.map((bm) => (
                      <div key={bm.id} className="popover-option-row">
                        <div
                          className="popover-option-main"
                          style={{ cursor: 'pointer' }}
                          onClick={() => {
                            seekTo(bm.timeSec);
                            setActivePopover(null);
                          }}
                        >
                          <div className="popover-option-title-line">
                            <span className="quality-tier-badge tier-1080p mono">
                              {formatTimecode(bm.timeSec)}
                            </span>
                            <strong>{bm.label}</strong>
                          </div>
                        </div>
                        <button
                          type="button"
                          className="player-icon-btn small"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeSceneBookmark(bm.id);
                          }}
                          title="Delete Bookmark"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Timeline Scrubber */}
        <div className="timeline-scrub-row">
          <span className="mono timecode-readout">
            {formatTimecode(scrubPreviewSec ?? currentTimeSec)}
          </span>
          <input
            type="range"
            className="timeline-slider"
            min={0}
            max={Math.max(1, effectiveDurationSec || 7200)}
            step={1}
            value={scrubPreviewSec ?? currentTimeSec}
            disabled={activeStream?.kind !== 'direct'}
            onChange={(e) => handleTimelineSliderChange(Number(e.target.value))}
          />
          <span className="mono timecode-readout">{formatTimecode(effectiveDurationSec)}</span>
        </div>

        {/* Bottom Transport Bar with Unified Popover Dropdown Buttons + Quick Resolution Cycle + Fullscreen */}
        <div className="transport-controls-row">
          <div className="transport-left">
            <button
              type="button"
              className="player-icon-btn play-main-btn"
              onClick={togglePlayPause}
              disabled={activeStream?.kind !== 'direct'}
              title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
            >
              {isPlaying ? <Pause size={22} /> : <Play size={22} />}
            </button>
            <button
              type="button"
              className="player-icon-btn"
              onClick={() => triggerZoneSeek('left')}
              disabled={activeStream?.kind !== 'direct'}
              title="Rewind 10s (← or Double-Click Left)"
            >
              <Rewind size={18} />
            </button>
            <button
              type="button"
              className="player-icon-btn"
              onClick={() => triggerZoneSeek('right')}
              disabled={activeStream?.kind !== 'direct'}
              title="Forward 10s (→ or Double-Click Right)"
            >
              <FastForward size={18} />
            </button>

            <div className="volume-cluster">
              <button
                type="button"
                className="player-icon-btn"
                onClick={() => {
                  const next = !isMuted;
                  setIsMuted(next);
                  if (isSplitAudioMode) {
                    if (videoRef.current) videoRef.current.muted = true;
                    if (audioRef.current) audioRef.current.muted = next;
                  } else if (videoRef.current) {
                    videoRef.current.muted = next;
                  }
                  showGestureHudBanner('volume', next ? 0 : volume * 100);
                }}
                title="Mute / Unmute (M · Right Vertical Drag or Scroll)"
              >
                {isMuted || volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
              </button>
              <input
                type="range"
                className="volume-slider"
                min={0}
                max={1}
                step={0.05}
                value={isMuted ? 0 : volume}
                onChange={(e) => {
                  applyVolumeLevel(Number(e.target.value), true);
                }}
              />
            </div>

            <div className="brightness-cluster">
              <button
                type="button"
                className="player-icon-btn"
                onClick={() => applyBrightnessLevel(1, true)}
                title={`Brightness ${Math.round(brightness * 100)}% (Click to Reset · Left Vertical Drag or Scroll · Shift+↑/↓)`}
                aria-label="Reset Brightness"
              >
                <Sun size={17} />
              </button>
              <input
                type="range"
                className="brightness-slider"
                min={0.2}
                max={1.5}
                step={0.05}
                value={brightness}
                aria-label="Video Brightness"
                onChange={(e) => {
                  applyBrightnessLevel(Number(e.target.value), true);
                }}
              />
            </div>

            {/* Night Dialogue Audio Boost Button (100% -> 150% -> 200%) */}
            <button
              type="button"
              className={`bottom-dropdown-btn ${audioBoostPct > 100 ? 'active' : ''}`}
              onClick={cycleAudioBoost}
              title="Night Mode / Dialogue Audio Boost (Cycles 100% -> 150% -> 200%)"
            >
              <Zap size={14} />
              <span className="mono">{audioBoostPct}%</span>
            </button>

            {/* Next Episode Quick Skip Button (when watching a TV Series with a next episode) */}
            {nextEpisode && (
              <button
                type="button"
                className="bottom-dropdown-btn"
                onClick={advanceToNextEpisode}
                title={`Play Next Episode: S${nextEpisode.season}:E${nextEpisode.episode} — ${nextEpisode.name}`}
              >
                <SkipForward size={14} />
                <span>Next Ep</span>
              </button>
            )}
          </div>

          {/* Right Bottom Control Deck: Dropdown Triggers + Quick Resolution Cycle + Fullscreen */}
          <div className="transport-right">
            {/* Scene Timestamp Bookmarks Dropdown Button */}
            <button
              type="button"
              className={`bottom-dropdown-btn ${activePopover === 'bookmarks' ? 'active' : ''}`}
              onClick={() => togglePopover('bookmarks')}
              title="Scene Timestamp Bookmarks"
            >
              <Bookmark size={14} />
              <span>
                Scenes{sceneBookmarks.length > 0 ? ` (${sceneBookmarks.length})` : ''}
              </span>
              <ChevronUp size={13} className="chevron-icon" />
            </button>
            {/* Series Episodes Dropdown Button */}
            {media.videos.length > 0 && (
              <button
                type="button"
                className={`bottom-dropdown-btn ${activePopover === 'episodes' ? 'active' : ''}`}
                onClick={() => togglePopover('episodes')}
                title="Choose Episode"
              >
                <Tv size={15} />
                <span>
                  {selectedEpisode
                    ? `S${selectedEpisode.season}:E${selectedEpisode.episode}`
                    : 'Episodes'}
                </span>
                <ChevronUp size={13} className="chevron-icon" />
              </button>
            )}

            {/* Quality & Streams Dropdown Button (Sorted by Quality & Multi-Audio) */}
            <button
              type="button"
              className={`bottom-dropdown-btn ${activePopover === 'quality' ? 'active' : ''}`}
              onClick={() => togglePopover('quality')}
              title="Stream Quality & Sources (Sorted by Quality & Multi-Audio)"
            >
              <Layers size={15} />
              <span>
                {activeStream?.qualityBadge || 'Quality'} · {streams.length}
              </span>
              <ChevronUp size={13} className="chevron-icon" />
            </button>

            {/* Audio Language Dropdown Button */}
            <button
              type="button"
              className={`bottom-dropdown-btn ${activePopover === 'audio' ? 'active' : ''}`}
              onClick={() => togglePopover('audio')}
              title="Change Audio Language / Track"
            >
              <Headphones size={15} />
              <span>
                {probingAudio
                  ? 'Loading…'
                  : activeAudioTrackObj
                    ? activeAudioTrackObj.langName
                    : 'Audio'}
                {probedAudioTracks.length > 1 ? ` (${probedAudioTracks.length})` : ''}
              </span>
              <ChevronUp size={13} className="chevron-icon" />
            </button>

            {/* Subtitles Dropdown Button */}
            <button
              type="button"
              className={`bottom-dropdown-btn ${activePopover === 'subtitles' ? 'active' : ''}`}
              onClick={() => togglePopover('subtitles')}
              title="Subtitles & Sync"
            >
              <Captions size={15} />
              <span>
                {subStyle.enabled && currentSubtitleTrack
                  ? currentSubtitleTrack.lang.toUpperCase()
                  : 'Subs'}
              </span>
              <ChevronUp size={13} className="chevron-icon" />
            </button>

            {/* Playback Speed Dropdown Button */}
            <button
              type="button"
              className={`bottom-dropdown-btn ${activePopover === 'speed' ? 'active' : ''}`}
              onClick={() => togglePopover('speed')}
              title="Playback Speed"
            >
              <Gauge size={15} />
              <span className="mono">{playbackSpeed}x</span>
              <ChevronUp size={13} className="chevron-icon" />
            </button>

            {/* Aspect Ratio / Cropping Dropdown Button */}
            <button
              type="button"
              className={`bottom-dropdown-btn ${activePopover === 'crop' ? 'active' : ''}`}
              onClick={() => togglePopover('crop')}
              title={`Video Aspect Ratio & Cropping (${currentCropLabel})`}
            >
              <Crop size={15} />
              <span className="mono">{currentCropShortLabel}</span>
              <ChevronUp size={13} className="chevron-icon" />
            </button>

            {/* Compact Square Quick Crop / Aspect Ratio Cycle Button (Click to step through resolutions sequentially) */}
            <button
              type="button"
              className="player-icon-btn quick-ratio-cycle-btn"
              onClick={cycleNextAspectRatio}
              title={`Quick Crop / Aspect Ratio (${currentCropShortLabel} — ${Math.max(1, currentCropIndex + 1)}/${CROP_OPTIONS.length}) · Click for next ratio (R)`}
              aria-label="Quick Aspect Ratio Cycle"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.1"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="5" width="18" height="14" rx="2.5" />
                <path d="M7 9h3M7 9v3M17 15h-3M17 15v-3" />
              </svg>
            </button>

            {/* Fullscreen Toggle Button */}
            <button
              type="button"
              className="player-icon-btn fullscreen-btn"
              onClick={toggleFullscreen}
              title={isFullscreen ? 'Exit Fullscreen (F)' : 'Fullscreen (F)'}
            >
              {isFullscreen ? <Minimize2 size={19} /> : <Maximize2 size={19} />}
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
};
