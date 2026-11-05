import {
  LOCAL_STORAGE_PREFERENCES_KEY,
  MAX_STORED_EVENTS,
  MAX_STORED_ID_LIST,
} from '../domain/recommendation.config';
import {
  LocalRecommendationPreferences,
  RecommendationEvent,
  RecommendationEventType,
} from '../domain/recommendation.types';

export function createDefaultLocalPreferences(): LocalRecommendationPreferences {
  return {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    likedItemIds: [],
    dislikedItemIds: [],
    notInterestedItemIds: [],
    savedItemIds: [],
    watchedItemIds: [],
    recentImpressionIds: [],
    preferredGenres: [],
    avoidedGenres: [],
    preferredThemes: [],
    avoidedThemes: [],
    preferredTones: [],
    avoidedTones: [],
    events: [],
    settings: {
      personalizationEnabled: true,
      discoveryLevel: 'balanced',
    },
  };
}

function sanitizeStringArray(arr: unknown, maxLen = MAX_STORED_ID_LIST): string[] {
  if (!Array.isArray(arr)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of arr) {
    if (typeof entry === 'string' && entry.trim().length > 0) {
      const clean = entry.trim();
      if (!seen.has(clean)) {
        seen.add(clean);
        out.push(clean);
        if (out.length >= maxLen) break;
      }
    }
  }
  return out;
}

function canUseLocalStorage(): boolean {
  try {
    return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
  } catch {
    return false;
  }
}

function normalizeIdToCanonicalIfImdb(rawId: string): string {
  const clean = (rawId || '').trim();
  if (/^tt\d{5,10}$/i.test(clean)) {
    return `imdb:${clean.toLowerCase()}`;
  }
  return clean;
}

/**
 * Reads existing FableArc watchlist/rating/history keys from localStorage
 * to enrich the recommendation profile without duplicating catalogue objects.
 */
function readExistingAppSignalsFromLocalStorage(): {
  likedIds: string[];
  dislikedIds: string[];
  savedIds: string[];
  watchedIds: string[];
  derivedEvents: RecommendationEvent[];
} {
  const likedIds: string[] = [];
  const dislikedIds: string[] = [];
  const savedIds: string[] = [];
  const watchedIds: string[] = [];
  const derivedEvents: RecommendationEvent[] = [];

  if (!canUseLocalStorage()) {
    return { likedIds, dislikedIds, savedIds, watchedIds, derivedEvents };
  }

  const nowIso = new Date().toISOString();

  // 1. Read fablearc_watchlist_meta_v1 (status: 'favorites' | 'completed' | 'watching' | 'plan', userRating?: 1..5)
  try {
    const rawMeta = window.localStorage.getItem('fablearc_watchlist_meta_v1');
    if (rawMeta) {
      const parsed = JSON.parse(rawMeta) as Record<
        string,
        { status?: string; userRating?: number }
      >;
      if (parsed && typeof parsed === 'object') {
        for (const [rawId, meta] of Object.entries(parsed)) {
          if (!rawId || !meta) continue;
          const canId = normalizeIdToCanonicalIfImdb(rawId);
          if (meta.status === 'favorites' || (meta.userRating && meta.userRating >= 4)) {
            likedIds.push(canId);
            derivedEvents.push({
              eventId: `meta-like-${canId}`,
              userId: 'local-user',
              canonicalItemId: canId,
              eventType: 'like',
              timestamp: nowIso,
            });
          } else if (meta.userRating && meta.userRating <= 2) {
            dislikedIds.push(canId);
            derivedEvents.push({
              eventId: `meta-dislike-${canId}`,
              userId: 'local-user',
              canonicalItemId: canId,
              eventType: 'dislike',
              timestamp: nowIso,
            });
          }
          if (meta.status === 'completed') {
            watchedIds.push(canId);
            derivedEvents.push({
              eventId: `meta-complete-${canId}`,
              userId: 'local-user',
              canonicalItemId: canId,
              eventType: 'watch_complete',
              timestamp: nowIso,
              completionRatio: 1.0,
            });
          } else if (meta.status === 'plan' || meta.status === 'watching') {
            savedIds.push(canId);
            derivedEvents.push({
              eventId: `meta-save-${canId}`,
              userId: 'local-user',
              canonicalItemId: canId,
              eventType: 'save',
              timestamp: nowIso,
            });
          }
        }
      }
    }
  } catch {
    // Ignore storage read errors
  }

  // 2. Read fablearc_watch_history_v1
  try {
    const rawHistory = window.localStorage.getItem('fablearc_watch_history_v1');
    if (rawHistory) {
      const parsedHist = JSON.parse(rawHistory) as Record<
        string,
        {
          mediaId?: string;
          progressSec?: number;
          durationSec?: number;
          updatedAtIso?: string;
        }
      >;
      if (parsedHist && typeof parsedHist === 'object') {
        for (const [key, entry] of Object.entries(parsedHist)) {
          const id = entry?.mediaId || key;
          if (!id) continue;
          const canId = normalizeIdToCanonicalIfImdb(id);
          const prog = Number(entry?.progressSec || 0);
          const dur = Number(entry?.durationSec || 0);
          const ratio = dur > 0 ? Math.min(1, prog / dur) : 0;
          const ts = entry?.updatedAtIso || nowIso;

          if (ratio >= 0.85) {
            watchedIds.push(canId);
            derivedEvents.push({
              eventId: `hist-complete-${canId}`,
              userId: 'local-user',
              canonicalItemId: canId,
              eventType: 'watch_complete',
              timestamp: ts,
              watchDurationSeconds: prog,
              itemDurationSeconds: dur,
              completionRatio: ratio,
            });
          } else if (ratio >= 0.35) {
            derivedEvents.push({
              eventId: `hist-progress-${canId}`,
              userId: 'local-user',
              canonicalItemId: canId,
              eventType: 'watch_progress',
              timestamp: ts,
              watchDurationSeconds: prog,
              itemDurationSeconds: dur,
              completionRatio: ratio,
            });
          } else if (prog > 30 && ratio > 0 && ratio < 0.12) {
            derivedEvents.push({
              eventId: `hist-skip-${canId}`,
              userId: 'local-user',
              canonicalItemId: canId,
              eventType: 'skip',
              timestamp: ts,
              watchDurationSeconds: prog,
              itemDurationSeconds: dur,
              completionRatio: ratio,
            });
          }
        }
      }
    }
  } catch {
    // Ignore storage read errors
  }

  return { likedIds, dislikedIds, savedIds, watchedIds, derivedEvents };
}

export function loadLocalRecommendationPreferences(): LocalRecommendationPreferences {
  const defaults = createDefaultLocalPreferences();
  if (!canUseLocalStorage()) return defaults;

  let stored: Partial<LocalRecommendationPreferences> | null = null;
  try {
    const raw = window.localStorage.getItem(LOCAL_STORAGE_PREFERENCES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && parsed.schemaVersion === 1) {
        stored = parsed;
      }
    }
  } catch {
    stored = null;
  }

  const appSignals = readExistingAppSignalsFromLocalStorage();

  const likedItemIds = sanitizeStringArray([
    ...(stored?.likedItemIds || []).map(normalizeIdToCanonicalIfImdb),
    ...appSignals.likedIds,
  ]);
  const dislikedItemIds = sanitizeStringArray([
    ...(stored?.dislikedItemIds || []).map(normalizeIdToCanonicalIfImdb),
    ...appSignals.dislikedIds,
  ]);
  const notInterestedItemIds = sanitizeStringArray(
    (stored?.notInterestedItemIds || []).map(normalizeIdToCanonicalIfImdb),
  );
  const savedItemIds = sanitizeStringArray([
    ...(stored?.savedItemIds || []).map(normalizeIdToCanonicalIfImdb),
    ...appSignals.savedIds,
  ]);
  const watchedItemIds = sanitizeStringArray([
    ...(stored?.watchedItemIds || []).map(normalizeIdToCanonicalIfImdb),
    ...appSignals.watchedIds,
  ]);
  const recentImpressionIds = sanitizeStringArray(
    (stored?.recentImpressionIds || []).map(normalizeIdToCanonicalIfImdb),
    100,
  );

  const storedEvents = Array.isArray(stored?.events)
    ? stored!.events.filter(
        (e): e is RecommendationEvent =>
          Boolean(e && typeof e === 'object' && typeof e.eventType === 'string'),
      )
    : [];

  const seenEventIds = new Set(storedEvents.map((e) => e.eventId));
  const mergedEvents = [...storedEvents];
  for (const de of appSignals.derivedEvents) {
    if (!seenEventIds.has(de.eventId)) {
      seenEventIds.add(de.eventId);
      mergedEvents.push(de);
    }
  }

  return {
    schemaVersion: 1,
    updatedAt: stored?.updatedAt || defaults.updatedAt,
    likedItemIds,
    dislikedItemIds,
    notInterestedItemIds,
    savedItemIds,
    watchedItemIds,
    recentImpressionIds,
    preferredGenres: sanitizeStringArray(stored?.preferredGenres, 30),
    avoidedGenres: sanitizeStringArray(stored?.avoidedGenres, 30),
    preferredThemes: sanitizeStringArray(stored?.preferredThemes, 40),
    avoidedThemes: sanitizeStringArray(stored?.avoidedThemes, 40),
    preferredTones: sanitizeStringArray(stored?.preferredTones, 30),
    avoidedTones: sanitizeStringArray(stored?.avoidedTones, 30),
    events: mergedEvents.slice(-MAX_STORED_EVENTS),
    settings: {
      personalizationEnabled:
        stored?.settings?.personalizationEnabled ?? defaults.settings!.personalizationEnabled,
      discoveryLevel: stored?.settings?.discoveryLevel || 'balanced',
    },
  };
}

export function saveLocalRecommendationPreferences(
  prefs: LocalRecommendationPreferences,
): void {
  if (!canUseLocalStorage()) return;
  try {
    const payload: LocalRecommendationPreferences = {
      ...prefs,
      schemaVersion: 1,
      updatedAt: new Date().toISOString(),
      likedItemIds: sanitizeStringArray(prefs.likedItemIds),
      dislikedItemIds: sanitizeStringArray(prefs.dislikedItemIds),
      notInterestedItemIds: sanitizeStringArray(prefs.notInterestedItemIds),
      savedItemIds: sanitizeStringArray(prefs.savedItemIds),
      watchedItemIds: sanitizeStringArray(prefs.watchedItemIds),
      recentImpressionIds: sanitizeStringArray(prefs.recentImpressionIds, 100),
      events: (prefs.events || []).slice(-MAX_STORED_EVENTS),
    };
    window.localStorage.setItem(LOCAL_STORAGE_PREFERENCES_KEY, JSON.stringify(payload));
  } catch {
    // Handle quota or private browsing errors gracefully without breaking recommendations
  }
}

export function resetLocalRecommendationPreferences(): LocalRecommendationPreferences {
  const fresh = createDefaultLocalPreferences();
  if (canUseLocalStorage()) {
    try {
      window.localStorage.removeItem(LOCAL_STORAGE_PREFERENCES_KEY);
    } catch {
      // Ignore
    }
  }
  return fresh;
}

export function recordLocalRecommendationFeedback(params: {
  rawItemId: string;
  eventType: RecommendationEventType;
  completionRatio?: number;
}): LocalRecommendationPreferences {
  const current = loadLocalRecommendationPreferences();
  const canId = normalizeIdToCanonicalIfImdb(params.rawItemId);
  const nowIso = new Date().toISOString();

  if (params.eventType === 'like') {
    current.likedItemIds = [canId, ...current.likedItemIds.filter((id) => id !== canId)];
    current.dislikedItemIds = current.dislikedItemIds.filter((id) => id !== canId);
    current.notInterestedItemIds = current.notInterestedItemIds.filter((id) => id !== canId);
  } else if (params.eventType === 'dislike') {
    current.dislikedItemIds = [canId, ...current.dislikedItemIds.filter((id) => id !== canId)];
    current.likedItemIds = current.likedItemIds.filter((id) => id !== canId);
  } else if (params.eventType === 'not_interested' || params.eventType === 'hide') {
    current.notInterestedItemIds = [
      canId,
      ...current.notInterestedItemIds.filter((id) => id !== canId),
    ];
    current.likedItemIds = current.likedItemIds.filter((id) => id !== canId);
  } else if (params.eventType === 'watch_complete') {
    current.watchedItemIds = [canId, ...current.watchedItemIds.filter((id) => id !== canId)];
  } else if (params.eventType === 'save') {
    current.savedItemIds = [canId, ...current.savedItemIds.filter((id) => id !== canId)];
  }

  current.events.push({
    eventId: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    userId: 'local-user',
    canonicalItemId: canId,
    eventType: params.eventType,
    timestamp: nowIso,
    completionRatio: params.completionRatio,
  });

  saveLocalRecommendationPreferences(current);
  return current;
}
