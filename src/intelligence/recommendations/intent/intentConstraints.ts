import {
  MediaUnderstandingProfile,
  NormalizedMediaItem,
  RecommendationIntent,
} from '../domain/recommendation.types';
import { normalizeWordStem } from '../understanding/lexicalIndex';

export interface HardConstraintEvaluation {
  passed: boolean;
  results: Record<string, boolean>;
}

/**
 * Evaluates hard constraints and explicit exclusions before ranking.
 * Principle 3: "Hard constraints are hard. Never violate explicit exclusions to improve a score."
 */
export function evaluateHardConstraints(
  intent: RecommendationIntent,
  item: NormalizedMediaItem,
  profile: MediaUnderstandingProfile,
  explicitUiMediaFilter: 'all' | 'movie' | 'series' = 'all',
): HardConstraintEvaluation {
  const results: Record<string, boolean> = {};

  // 1. Explicit UI Media Type Filter or Hard Intent Media Type Filter
  if (explicitUiMediaFilter !== 'all') {
    const ok = item.type === explicitUiMediaFilter;
    results.uiMediaType = ok;
    if (!ok) return { passed: false, results };
  } else if (intent.mediaTypes && intent.mediaTypes.length > 0 && intent.mediaTypeHard) {
    const ok = intent.mediaTypes.includes(item.type);
    results.intentMediaType = ok;
    if (!ok) return { passed: false, results };
  }

  // 2. Hard Year Range Filter ("Movies from 2015 to 2022", "after 2015")
  if (intent.yearRange && intent.yearRange.hard) {
    if (item.releaseYear === null) {
      results.yearRange = false;
      return { passed: false, results };
    }
    const minOk =
      intent.yearRange.min === undefined || item.releaseYear >= intent.yearRange.min;
    const maxOk =
      intent.yearRange.max === undefined || item.releaseYear <= intent.yearRange.max;
    results.yearRange = minOk && maxOk;
    if (!results.yearRange) return { passed: false, results };
  }

  // 3. Hard Minimum Rating Filter ("IMDb 7.5 or higher")
  if (intent.minRating && intent.minRating.hard) {
    const imdbEntry = item.ratings.find((r) => r.source === 'imdb') || item.ratings[0];
    // Principle 4: Unknown rating is not a 6.2 rating; if user explicitly requires >= 7.5, unknown cannot pass
    if (!imdbEntry || imdbEntry.value < intent.minRating.value) {
      results.minRating = false;
      return { passed: false, results };
    }
    results.minRating = true;
  }

  // 4. Hard Runtime Filter ("Under two hours")
  if (intent.runtime && intent.runtime.hard && item.runtimeMinutes !== null) {
    if (
      intent.runtime.maxMinutes !== undefined &&
      item.runtimeMinutes > intent.runtime.maxMinutes
    ) {
      results.runtime = false;
      return { passed: false, results };
    }
    if (
      intent.runtime.minMinutes !== undefined &&
      item.runtimeMinutes < intent.runtime.minMinutes
    ) {
      results.runtime = false;
      return { passed: false, results };
    }
    results.runtime = true;
  }

  // 5. Hard Language Filter ("English or Hindi audio")
  const includedLanguages = (intent.languages || []).filter((l) => l.polarity === 'include');
  const excludedLanguages = (intent.languages || []).filter((l) => l.polarity === 'exclude');
  if (excludedLanguages.length > 0 && item.originalLanguage) {
    const isExcluded = excludedLanguages.some(
      (l) => l.value.toLowerCase() === item.originalLanguage?.toLowerCase(),
    );
    results.languageExcluded = !isExcluded;
    if (isExcluded) return { passed: false, results };
  }
  if (includedLanguages.length > 0 && item.originalLanguage) {
    const isIncluded = includedLanguages.some(
      (l) => l.value.toLowerCase() === item.originalLanguage?.toLowerCase(),
    );
    results.languageIncluded = isIncluded;
    if (!isIncluded) return { passed: false, results };
  }

  // 6. Hard Genre Exclusions ("No romance, please", "Something serious, not comedy", "No horror")
  const hardExcludedGenres = (intent.genres || []).filter(
    (g) => g.polarity === 'exclude' && g.strength === 'hard',
  );
  if (hardExcludedGenres.length > 0) {
    const itemGenresLower = new Set(item.genres.map((g) => g.toLowerCase()));
    for (const exG of hardExcludedGenres) {
      const exLower = exG.value.toLowerCase();
      if (itemGenresLower.has(exLower)) {
        results[`excludeGenre:${exG.value}`] = false;
        return { passed: false, results };
      }
      // Also check if synopsis/profile strongly triggers the excluded genre (e.g. romance theme when "no romance")
      if (
        exLower === 'romance' &&
        profile.themes.some((t) => t.id === 'theme:family-love' && /\b(romance|romantic|lovers|wedding)\b/i.test(item.synopsis))
      ) {
        results['excludeGenre:Romance'] = false;
        return { passed: false, results };
      }
    }
    results.genreExclusions = true;
  }

  // 7. Hard Content & Concept Exclusions ("A thriller without gore", "Avoid predictable superhero movies")
  const hardContentExclusions = [
    ...(intent.contentExclusions || []).filter(
      (c) => c.polarity === 'exclude' && c.strength === 'hard',
    ),
    ...(intent.concepts || []).filter(
      (c) => c.polarity === 'exclude' && c.strength === 'hard',
    ),
    ...(intent.subgenres || []).filter(
      (c) => c.polarity === 'exclude' && c.strength === 'hard',
    ),
    ...(intent.tones || []).filter(
      (c) => c.polarity === 'exclude' && c.strength === 'hard',
    ),
  ];

  if (hardContentExclusions.length > 0) {
    const itemConceptSet = new Set(profile.conceptIds);
    const fullTextLower = `${item.title} ${item.synopsis}`.toLowerCase();

    for (const ex of hardContentExclusions) {
      if (itemConceptSet.has(ex.value)) {
        results[`excludeFeature:${ex.value}`] = false;
        return { passed: false, results };
      }
      if (
        ex.value === 'content:gore-extreme-violence' &&
        /\b(gore|gory|slasher|bloodbath|slaughter|massacre|cannibal|mutilation|brutal)\b/i.test(
          fullTextLower,
        )
      ) {
        results['excludeContent:gore'] = false;
        return { passed: false, results };
      }
      if (
        ex.value === 'content:superhero-comic' &&
        /\b(superhero|superheroes|superpower|avengers|marvel|caped crusader)\b/i.test(
          fullTextLower,
        )
      ) {
        results['excludeContent:superhero'] = false;
        return { passed: false, results };
      }
    }
    results.contentExclusions = true;
  }

  // 8. Title Anchor Exclusions & Self-Exclusion ("Like Interstellar" shouldn't just return Interstellar if seeking similar, and "not like X" must exclude X)
  if (intent.titleAnchors && intent.titleAnchors.length > 0) {
    for (const anchor of intent.titleAnchors) {
      const isSameItem =
        (anchor.canonicalId && anchor.canonicalId === item.canonicalId) ||
        item.title.toLowerCase() === anchor.title.toLowerCase() ||
        item.normalizedTitle === normalizeWordStem(anchor.title.toLowerCase());
      if (isSameItem && (anchor.relationship === 'avoid' || anchor.relationship === 'similar_to')) {
        results[`anchor:${anchor.title}`] = false;
        return { passed: false, results };
      }
    }
  }

  return { passed: true, results };
}
