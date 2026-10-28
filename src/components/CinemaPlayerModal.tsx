import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Hls from 'hls.js';
import {
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
  Maximize2,
  Minimize2,
  Pause,
  Play,
  RefreshCw,
  Rewind,
  Sparkles,
  Tv,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import {
  buildTranscodedStreamUrl,
  fetchStreamsFromAddons,
  fetchSubtitlesFromAddons,
  getAudioTrackLanguagePriority,
  InstalledAddon,
  ProbedAudioTrack,
  probeMediaStream,
  sortAudioTracksByLanguagePriority,
  sortStreamsByDecreasingQuality,
  StremioEpisodeVideo,
  StremioMediaItem,
  StremioStreamItem,
  StremioSubtitleTrack,
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

type BottomPopoverType =
  | null
  | 'quality'
  | 'audio'
  | 'subtitles'
  | 'speed'
  | 'crop'
  | 'episodes';

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
  const [streamStartOffsetSec, setStreamStartOffsetSec] = useState<number>(
    Math.max(0, Math.floor(initialPositionSec)),
  );
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

    const loadStreams = async () => {
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
            sorted.find((s) => s.kind === 'direct' && !s.isPromo) ??
            sorted.find((s) => s.kind === 'youtube') ??
            sorted[0] ??
            null
          );
        });
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

  // Probe embedded multi-language audio tracks and container duration whenever activeStream changes
  useEffect(() => {
    if (!activeStream || activeStream.kind !== 'direct' || !activeStream.url) {
      setProbedAudioTracks([]);
      setProbedDurationSec(0);
      return;
    }

    const isM3u8 =
      activeStream.isHls || activeStream.url.toLowerCase().includes('.m3u8');
    setUseFfmpegAudioEngine(!isM3u8);

    let cancelled = false;
    setProbingAudio(true);
    setProbedAudioTracks([]);
    setSelectedAudioTrackIndex(0);

    probeMediaStream(activeStream.url)
      .then((probe) => {
        if (cancelled || !probe) return;
        if (probe.durationSec > 0) {
          setProbedDurationSec(probe.durationSec);
        }
        if (probe.audioTracks.length > 0) {
          // Sort tracks with English first, then Hindi, then any other language
          const sortedTracks = sortAudioTracksByLanguagePriority(probe.audioTracks);
          setProbedAudioTracks(sortedTracks);
          // Automatically prefer the top-priority language track (English -> Hindi -> first track)
          const preferredTrack = sortedTracks[0];
          if (preferredTrack && preferredTrack.audioIndex !== 0) {
            setSelectedAudioTrackIndex(preferredTrack.audioIndex);
          }
        }
      })
      .finally(() => {
        if (!cancelled) setProbingAudio(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeStream]);

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

  // Load direct stream via FFmpeg Multi-Audio Remux Pipeline, HLS.js, or native HTML5 video
  useEffect(() => {
    const video = videoRef.current;
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

    if (isM3u8Playlist && Hls.isSupported() && !useFfmpegAudioEngine) {
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
    } else if (useFfmpegAudioEngine) {
      const transcodedUrl = buildTranscodedStreamUrl(
        activeStream.url,
        selectedAudioTrackIndex,
        streamStartOffsetSec,
      );
      video.src = seekNonce > 0 ? `${transcodedUrl}&_sn=${seekNonce}` : transcodedUrl;
      video.muted = isMuted;
      video.volume = volume;
      video.playbackRate = playbackSpeed;
      video.load();
      video.play().catch(() => {
        setIsPlaying(false);
      });
    } else {
      video.src = activeStream.url;
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
  }, [activeStream, seekNonce, selectedAudioTrackIndex, streamStartOffsetSec, useFfmpegAudioEngine]);

  // Switch audio track / language while preserving exact playback position & last video frame
  const handleSelectAudioTrack = (trackIndex: number) => {
    if (trackIndex === selectedAudioTrackIndex && useFfmpegAudioEngine) return;
    captureVideoFrameSnapshot();
    setStreamStartOffsetSec(Math.max(0, Math.floor(currentTimeSec)));
    setSelectedAudioTrackIndex(trackIndex);
    setUseFfmpegAudioEngine(true);
    if (hlsRef.current) {
      hlsRef.current.audioTrack = trackIndex;
    }
  };

  const togglePlayPause = useCallback(() => {
    const video = videoRef.current;
    if (!video || activeStream?.kind !== 'direct') return;
    if (video.paused) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, [activeStream?.kind]);

  const seekTo = useCallback(
    (nextSec: number) => {
      const video = videoRef.current;
      if (!video || activeStream?.kind !== 'direct') return;
      captureVideoFrameSnapshot();
      const maxDur = effectiveDurationSec > 0 ? effectiveDurationSec : 14400;
      const clamped = Math.max(0, Math.min(maxDur, Math.floor(nextSec)));
      setCurrentTimeSec(clamped);
      setScrubPreviewSec(null);

      if (useFfmpegAudioEngine) {
        // Fast path: if the target time is already buffered inside the browser's <video> buffer,
        // seek directly in memory without tearing down or restarting the FFmpeg pipeline.
        const targetRelativeSec = clamped - streamStartOffsetSec;
        let isBufferedInRam = false;
        if (targetRelativeSec >= 0 && video.buffered && video.buffered.length > 0) {
          for (let i = 0; i < video.buffered.length; i++) {
            const bStart = video.buffered.start(i);
            const bEnd = video.buffered.end(i);
            if (targetRelativeSec >= bStart && targetRelativeSec + 0.8 <= bEnd) {
              isBufferedInRam = true;
              break;
            }
          }
        }

        if (isBufferedInRam) {
          video.currentTime = targetRelativeSec;
          setIsBuffering(false);
          setHasFreezeFrame(false);
          return;
        }

        setIsBuffering(true);
        setStreamStartOffsetSec(clamped);
        setSeekNonce((prev) => prev + 1);
      } else {
        setIsBuffering(true);
        video.currentTime = clamped;
      }
    },
    [
      activeStream?.kind,
      captureVideoFrameSnapshot,
      effectiveDurationSec,
      streamStartOffsetSec,
      useFfmpegAudioEngine,
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

  // Keyboard shortcuts (Space, F, M, R/A for quick resolution cycle, ArrowLeft, ArrowRight, Escape)
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
          if (videoRef.current) videoRef.current.muted = next;
          return next;
        });
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        seekTo(currentTimeSec - 10);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        seekTo(currentTimeSec + 10);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    activePopover,
    currentTimeSec,
    cycleNextAspectRatio,
    onClose,
    seekTo,
    toggleFullscreen,
    togglePlayPause,
  ]);

  const changeSpeed = (speed: number) => {
    setPlaybackSpeed(speed);
    if (videoRef.current) {
      videoRef.current.playbackRate = speed;
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
      className={`player-modal-backdrop ${showControlsHud ? 'hud-visible' : 'hud-hidden'}`}
      ref={containerRef}
      onMouseMove={resetHudTimer}
    >
      {/* Top Minimal Screening Header */}
      <header
        className={`player-top-bar ${showControlsHud ? 'visible' : 'hidden'}`}
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
      </header>

      {/* Main Video / Trailer Stage */}
      <div
        className="player-stage"
        onClick={() => {
          if (activePopover) {
            setActivePopover(null);
            resetHudTimer();
          } else if (!showControlsHud) {
            // On mobile/touch or when HUD is auto-hidden, first tap wakes up all player controls
            resetHudTimer();
          } else {
            resetHudTimer();
            togglePlayPause();
          }
        }}
        onDoubleClick={toggleFullscreen}
      >
        {/* Auto-Failover Notification Banner */}
        {failoverToast && (
          <div className="failover-toast-banner" onClick={(e) => e.stopPropagation()}>
            <Sparkles size={15} />
            <span>{failoverToast}</span>
          </div>
        )}

        {activeStream?.kind === 'direct' && activeStream.url && (
          <>
            <video
              ref={videoRef}
              className={`player-video-element fit-${aspectMode}`}
              poster={media.background || media.poster}
              playsInline
              onLoadStart={() => setIsBuffering(true)}
              onWaiting={() => setIsBuffering(true)}
              onStalled={() => setIsBuffering(true)}
              onSeeking={() => setIsBuffering(true)}
              onSeeked={() => {
                setIsBuffering(false);
                setHasFreezeFrame(false);
              }}
              onCanPlay={() => setIsBuffering(false)}
              onCanPlayThrough={() => setIsBuffering(false)}
              onPlaying={() => {
                setIsPlaying(true);
                setIsBuffering(false);
                setHasStartedPlayback(true);
                setHasFreezeFrame(false);
                setFailoverCountdownSec(30);
              }}
              onPlay={() => setIsPlaying(true)}
              onPause={(e) => {
                setIsPlaying(false);
                const rawPos = e.currentTarget.currentTime;
                const actualPos = useFfmpegAudioEngine
                  ? streamStartOffsetSec + rawPos
                  : rawPos;
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
                const isHlsStream =
                  Boolean(activeStream?.isHls) ||
                  Boolean(activeStream?.url?.toLowerCase().includes('.m3u8'));
                if (useFfmpegAudioEngine && isHlsStream) {
                  // Fall back to direct HLS.js playback only for .m3u8 playlists
                  setUseFfmpegAudioEngine(false);
                } else {
                  switchToNextStream('Stream unavailable');
                }
              }}
              onLoadedMetadata={(e) => {
                e.currentTarget.muted = isMuted;
                e.currentTarget.volume = volume;
                const dur = e.currentTarget.duration;
                if (Number.isFinite(dur) && dur > 0) {
                  setNativeDurationSec(dur);
                }
              }}
              onTimeUpdate={(e) => {
                const rawPos = e.currentTarget.currentTime;
                if (rawPos > 0.08 && !e.currentTarget.paused) {
                  setIsBuffering(false);
                  setHasStartedPlayback(true);
                  setHasFreezeFrame(false);
                }
                const actualPos = useFfmpegAudioEngine
                  ? streamStartOffsetSec + rawPos
                  : rawPos;
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
            />
            {/* Freeze-Frame Canvas Overlay: Preserves the last decoded video frame during +10s/-10s seek & timeline scrubbing so the screen never turns black */}
            <canvas
              ref={freezeCanvasRef}
              className={`player-freeze-canvas fit-${aspectMode} ${hasFreezeFrame && isBuffering ? 'visible' : ''}`}
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
        className={`player-bottom-deck ${showControlsHud ? 'visible' : 'hidden'}`}
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
                          className={`popover-option-row ${isSelected ? 'selected' : ''}`}
                          onClick={() => {
                            if (stream.kind === 'external' && stream.externalUrl) {
                              window.open(stream.externalUrl, '_blank', 'noopener,noreferrer');
                              return;
                            }
                            const resumeAtSec = Math.max(0, Math.floor(currentTimeRef.current));
                            setStreamStartOffsetSec(resumeAtSec);
                            setCurrentTimeSec(resumeAtSec);
                            setActiveStream(stream);
                            setActivePopover(null);
                          }}
                        >
                          <div className="popover-option-main">
                            <div className="popover-option-title-line">
                              <span className={`quality-tier-badge ${tierClass}`}>
                                {stream.qualityBadge || stream.kind.toUpperCase()}
                              </span>
                              {stream.audioBadge && (
                                <span className="multi-audio-badge">
                                  {stream.audioBadge}
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
              onClick={() => seekTo(currentTimeSec - 10)}
              disabled={activeStream?.kind !== 'direct'}
              title="Rewind 10s (←)"
            >
              <Rewind size={18} />
            </button>
            <button
              type="button"
              className="player-icon-btn"
              onClick={() => seekTo(currentTimeSec + 10)}
              disabled={activeStream?.kind !== 'direct'}
              title="Forward 10s (→)"
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
                  if (videoRef.current) videoRef.current.muted = next;
                }}
                title="Mute / Unmute (M)"
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
                  const v = Number(e.target.value);
                  setVolume(v);
                  setIsMuted(v === 0);
                  if (videoRef.current) {
                    videoRef.current.volume = v;
                    videoRef.current.muted = v === 0;
                  }
                }}
              />
            </div>
          </div>

          {/* Right Bottom Control Deck: Dropdown Triggers + Quick Resolution Cycle + Fullscreen */}
          <div className="transport-right">
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
