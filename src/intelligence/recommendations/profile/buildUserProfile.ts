import {
  EVENT_DECAY_LAMBDA_PER_DAY,
  EVENT_INITIAL_WEIGHTS,
} from '../domain/recommendation.config';
import {
  BuiltUserTasteProfile,
  LocalRecommendationPreferences,
  MediaUnderstandingProfile,
  NormalizedMediaItem,
  RecommendationEventType,
} from '../domain/recommendation.types';

export function computeDecayedEventWeight(
  eventType: RecommendationEventType,
  timestampIso: string,
  completionRatio?: number,
  nowMs = Date.now(),
): number {
  let baseWeight = EVENT_INITIAL_WEIGHTS[eventType] ?? 0;

  if (eventType === 'watch_progress' && completionRatio !== undefined) {
    if (completionRatio >= 0.7) {
      baseWeight = 1.5;
    } else if (completionRatio >= 0.3) {
      baseWeight = 0.5;
    } else {
      baseWeight = -0.3;
    }
  }

  const parsedTime = Date.parse(timestampIso);
  const ageInDays = Number.isFinite(parsedTime)
    ? Math.max(0, (nowMs - parsedTime) / (1000 * 60 * 60 * 24))
    : 0;
  const lambda = EVENT_DECAY_LAMBDA_PER_DAY[eventType] ?? 0.02;

  return baseWeight * Math.exp(-lambda * ageInDays);
}

export function buildUserTasteProfile(
  prefs: LocalRecommendationPreferences,
  itemsByCanonicalId: Map<string, NormalizedMediaItem>,
  profilesByCanonicalId: Map<string, MediaUnderstandingProfile>,
  nowMs = Date.now(),
): BuiltUserTasteProfile {
  const positiveFeatureWeights = new Map<string, number>();
  const negativeFeatureWeights = new Map<string, number>();
  const sessionFeatureWeights = new Map<string, number>();
  const preferredDirectors = new Map<string, number>();
  const preferredCast = new Map<string, number>();

  const likedItemIds = new Set(prefs.likedItemIds);
  const dislikedItemIds = new Set([
    ...prefs.dislikedItemIds,
    ...prefs.notInterestedItemIds,
  ]);
  const watchedItemIds = new Set(prefs.watchedItemIds);
  const savedItemIds = new Set(prefs.savedItemIds);
  const recentImpressionIds = new Set(prefs.recentImpressionIds);

  const personalizationEnabled = prefs.settings?.personalizationEnabled ?? true;
  const discoveryLevel = prefs.settings?.discoveryLevel ?? 'balanced';

  if (!personalizationEnabled) {
    return {
      hasSignals: false,
      personalizationEnabled: false,
      discoveryLevel,
      positiveFeatureWeights,
      negativeFeatureWeights,
      sessionFeatureWeights,
      preferredDirectors,
      preferredCast,
      likedItemIds,
      dislikedItemIds,
      watchedItemIds,
      savedItemIds,
      recentImpressionIds,
    };
  }

  // 1. Explicit user genre/theme/tone preferences
  for (const g of prefs.preferredGenres) {
    const id = g.startsWith('genre:') ? g : `genre:${g.toLowerCase().replace(/\s+/g, '-')}`;
    positiveFeatureWeights.set(id, (positiveFeatureWeights.get(id) ?? 0) + 4.0);
  }
  for (const g of prefs.avoidedGenres) {
    const id = g.startsWith('genre:') ? g : `genre:${g.toLowerCase().replace(/\s+/g, '-')}`;
    negativeFeatureWeights.set(id, (negativeFeatureWeights.get(id) ?? 0) + 5.0);
  }
  for (const t of prefs.preferredThemes) {
    positiveFeatureWeights.set(t, (positiveFeatureWeights.get(t) ?? 0) + 3.5);
  }
  for (const t of prefs.avoidedThemes) {
    negativeFeatureWeights.set(t, (negativeFeatureWeights.get(t) ?? 0) + 4.5);
  }
  for (const tn of prefs.preferredTones) {
    positiveFeatureWeights.set(tn, (positiveFeatureWeights.get(tn) ?? 0) + 3.0);
  }
  for (const tn of prefs.avoidedTones) {
    negativeFeatureWeights.set(tn, (negativeFeatureWeights.get(tn) ?? 0) + 4.5);
  }

  // 2. Aggregate item-level signals from events + explicit ID lists
  const netSignalByItem = new Map<string, { weight: number; isRecentSession: boolean }>();

  for (const event of prefs.events || []) {
    if (!event.canonicalItemId) continue;
    const decayed = computeDecayedEventWeight(
      event.eventType,
      event.timestamp,
      event.completionRatio,
      nowMs,
    );
    const parsedTime = Date.parse(event.timestamp);
    const isRecentSession =
      Number.isFinite(parsedTime) && nowMs - parsedTime <= 1000 * 60 * 60 * 12;

    const prev = netSignalByItem.get(event.canonicalItemId) ?? {
      weight: 0,
      isRecentSession: false,
    };
    netSignalByItem.set(event.canonicalItemId, {
      weight: Math.max(-8, Math.min(8, prev.weight + decayed)),
      isRecentSession: prev.isRecentSession || isRecentSession,
    });
  }

  // Ensure explicit liked/disliked/saved/watched lists are represented even if events array was trimmed
  likedItemIds.forEach((id) => {
    if (!netSignalByItem.has(id)) {
      netSignalByItem.set(id, { weight: 5.0, isRecentSession: false });
    }
  });
  dislikedItemIds.forEach((id) => {
    const prev = netSignalByItem.get(id);
    if (!prev || prev.weight > -5.0) {
      netSignalByItem.set(id, { weight: -5.5, isRecentSession: false });
    }
  });
  watchedItemIds.forEach((id) => {
    if (!netSignalByItem.has(id)) {
      netSignalByItem.set(id, { weight: 2.0, isRecentSession: false });
    }
  });
  savedItemIds.forEach((id) => {
    if (!netSignalByItem.has(id)) {
      netSignalByItem.set(id, { weight: 1.0, isRecentSession: false });
    }
  });

  // 3. Project item signals onto taxonomy features, directors, and cast
  netSignalByItem.forEach(({ weight, isRecentSession }, canonicalId) => {
    if (Math.abs(weight) < 0.05) return;
    const item = itemsByCanonicalId.get(canonicalId);
    const profile = profilesByCanonicalId.get(canonicalId);
    if (!item || !profile) return;

    const allFeatures = [
      ...profile.genres,
      ...profile.subgenres,
      ...profile.themes,
      ...profile.narrativeTraits,
      ...profile.tones,
      ...profile.settings,
    ];

    for (const feat of allFeatures) {
      const delta = weight * feat.weight * feat.confidence;
      if (delta > 0) {
        positiveFeatureWeights.set(
          feat.id,
          (positiveFeatureWeights.get(feat.id) ?? 0) + delta,
        );
        if (isRecentSession) {
          sessionFeatureWeights.set(
            feat.id,
            (sessionFeatureWeights.get(feat.id) ?? 0) + delta,
          );
        }
      } else if (delta < 0) {
        negativeFeatureWeights.set(
          feat.id,
          (negativeFeatureWeights.get(feat.id) ?? 0) + Math.abs(delta),
        );
      }
    }

    if (weight > 0) {
      for (const dir of item.directors) {
        const key = dir.toLowerCase();
        preferredDirectors.set(key, (preferredDirectors.get(key) ?? 0) + weight * 0.6);
      }
      for (const actor of item.cast.slice(0, 4)) {
        const key = actor.toLowerCase();
        preferredCast.set(key, (preferredCast.get(key) ?? 0) + weight * 0.35);
      }
    }
  });

  const hasSignals =
    positiveFeatureWeights.size > 0 ||
    negativeFeatureWeights.size > 0 ||
    likedItemIds.size > 0 ||
    dislikedItemIds.size > 0;

  return {
    hasSignals,
    personalizationEnabled,
    discoveryLevel,
    positiveFeatureWeights,
    negativeFeatureWeights,
    sessionFeatureWeights,
    preferredDirectors,
    preferredCast,
    likedItemIds,
    dislikedItemIds,
    watchedItemIds,
    savedItemIds,
    recentImpressionIds,
  };
}
