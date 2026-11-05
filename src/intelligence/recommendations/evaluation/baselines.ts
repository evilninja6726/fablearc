import { StremioMediaItem } from '../../../addons/stremioProtocol';
import {
  extractReleaseYearFromStremioItem,
  normalizeMediaItem,
} from '../catalogue/normalizeMediaItem';
import { computeBayesianQualityPrior } from '../ranking/rankingModel';

/**
 * Baseline 1: Deterministic Pseudo-Random Baseline
 */
export function rankByRandomBaseline(
  candidates: StremioMediaItem[],
  seed = 42,
): StremioMediaItem[] {
  let state = seed;
  const nextRand = () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
  return [...candidates]
    .map((item) => ({ item, r: nextRand() }))
    .sort((a, b) => a.r - b.r)
    .map((x) => x.item);
}

/**
 * Baseline 2: Most Popular / Recent Release Baseline
 */
export function rankByPopularityRecencyBaseline(
  candidates: StremioMediaItem[],
): StremioMediaItem[] {
  return [...candidates].sort((a, b) => {
    const yA = extractReleaseYearFromStremioItem(a) ?? 1990;
    const yB = extractReleaseYearFromStremioItem(b) ?? 1990;
    const rA = Number.parseFloat(a.imdbRating || '0') || 6.0;
    const rB = Number.parseFloat(b.imdbRating || '0') || 6.0;
    const popA = (yA - 1980) * 0.15 + rA * 0.5;
    const popB = (yB - 1980) * 0.15 + rB * 0.5;
    return popB - popA;
  });
}

/**
 * Baseline 3: Highest Bayesian Adjusted Rating Baseline
 */
export function rankByAdjustedRatingBaseline(
  candidates: StremioMediaItem[],
): StremioMediaItem[] {
  return [...candidates]
    .map((item) => {
      const norm = normalizeMediaItem(item);
      const prior = computeBayesianQualityPrior(norm);
      return {
        item,
        score: prior.rawValue ?? 6.0,
      };
    })
    .sort((a, b) => b.score - a.score)
    .map((x) => x.item);
}

/**
 * Baseline 4: Original Legacy Heuristic Ranker (preserved strictly for comparative benchmarking)
 */
export function rankByLegacyHeuristicBaseline(
  rawPrompt: string,
  candidates: StremioMediaItem[],
): StremioMediaItem[] {
  const lower = rawPrompt.trim().toLowerCase();
  const rawTokens = lower
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 3);

  return [...candidates]
    .map((item) => {
      const itemRating = Number.parseFloat(item.imdbRating || '0');
      const validRating = Number.isFinite(itemRating) && itemRating > 0 ? itemRating : 6.2;
      let score = validRating * 0.45;
      const text = `${item.name} ${item.description || ''} ${item.genres.join(' ')}`.toLowerCase();
      for (const tk of rawTokens) {
        if (text.includes(tk)) {
          score += 6.5;
        }
      }
      return { item, score };
    })
    .sort((a, b) => b.score - a.score)
    .map((x) => x.item);
}
