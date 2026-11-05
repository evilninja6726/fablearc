import { MMR_LAMBDA_BY_STRATEGY } from '../domain/recommendation.config';
import {
  RecommendationMode,
  SlateStrategy,
} from '../domain/recommendation.types';
import { RankedCandidateResult } from '../ranking/rankingModel';

export function computePairwiseItemSimilarity(
  a: RankedCandidateResult,
  b: RankedCandidateResult,
): number {
  const itemA = a.candidate.item;
  const itemB = b.candidate.item;
  const profA = a.candidate.profile;
  const profB = b.candidate.profile;

  let sim = 0;

  // 1. Same franchise is a near-duplicate (0.75)
  if (
    itemA.franchiseIds.length > 0 &&
    itemB.franchiseIds.some((f) => itemA.franchiseIds.includes(f))
  ) {
    sim += 0.75;
  }

  // 2. Shared director (0.40)
  if (
    itemA.directors.length > 0 &&
    itemB.directors.some((d) =>
      itemA.directors.some((ad) => ad.toLowerCase() === d.toLowerCase()),
    )
  ) {
    sim += 0.40;
  }

  // 3. Shared lead cast (0.25)
  const leadA = itemA.cast.slice(0, 2).map((c) => c.toLowerCase());
  if (
    leadA.length > 0 &&
    itemB.cast.slice(0, 2).some((c) => leadA.includes(c.toLowerCase()))
  ) {
    sim += 0.25;
  }

  // 4. Fine-grained concept taxonomy Jaccard (only when items share multiple specific concepts)
  if (profA.conceptIds.length > 0 && profB.conceptIds.length > 0) {
    const setA = new Set(profA.conceptIds);
    let shared = 0;
    for (const id of profB.conceptIds) {
      if (setA.has(id)) shared += 1;
    }
    const union = new Set([...profA.conceptIds, ...profB.conceptIds]).size;
    if (shared >= 2 && union > 0) {
      sim += (shared / union) * 0.25;
    }
  }

  return Math.min(1, sim);
}

/**
 * Maximal Marginal Relevance (MMR) list-level diversity re-ranker (Section 4.9).
 * Diversifies the active top slate (up to `mmrWindowSize`) while preserving the full tail for infinite scroll.
 * Principle: "Do not diversify by arbitrary genre quotas if that creates irrelevant results."
 */
export function rerankForSlateDiversity(params: {
  rankedCandidates: RankedCandidateResult[];
  slateStrategy: SlateStrategy;
  requestMode: RecommendationMode;
  mmrWindowSize?: number;
}): RankedCandidateResult[] {
  const {
    rankedCandidates,
    slateStrategy,
    requestMode,
    mmrWindowSize = 36,
  } = params;

  if (rankedCandidates.length <= 2 || requestMode === 'franchise_exploration') {
    return rankedCandidates;
  }

  const lambda = MMR_LAMBDA_BY_STRATEGY[slateStrategy] ?? 0.80;
  const windowPool = rankedCandidates.slice(0, mmrWindowSize);
  const tailPool = rankedCandidates.slice(mmrWindowSize);

  const selected: RankedCandidateResult[] = [];
  const remaining = [...windowPool];

  // Always pick the #1 highest-scoring match first
  selected.push(remaining.shift()!);

  const franchiseCount = new Map<string, number>();
  const directorCount = new Map<string, number>();

  const registerSelection = (entry: RankedCandidateResult) => {
    for (const f of entry.candidate.item.franchiseIds) {
      franchiseCount.set(f, (franchiseCount.get(f) ?? 0) + 1);
    }
    for (const d of entry.candidate.item.directors) {
      const k = d.toLowerCase();
      directorCount.set(k, (directorCount.get(k) ?? 0) + 1);
    }
  };
  registerSelection(selected[0]);

  while (remaining.length > 0) {
    let bestIdx = 0;
    let bestMmrScore = -Infinity;

    for (let i = 0; i < remaining.length; i += 1) {
      const cand = remaining[i];
      const rel = cand.breakdown.normalizedRelevance;

      let maxSim = 0;
      const recentSlice = selected.slice(-6);
      for (const sel of recentSlice) {
        const pairSim = computePairwiseItemSimilarity(cand, sel);
        if (pairSim > maxSim) maxSim = pairSim;
      }

      // Apply franchise & director concentration cap penalty
      let concentrationPenalty = 0;
      for (const f of cand.candidate.item.franchiseIds) {
        const count = franchiseCount.get(f) ?? 0;
        if (count >= 2) concentrationPenalty += 0.35 * count;
        else if (count === 1) concentrationPenalty += 0.15;
      }
      for (const d of cand.candidate.item.directors) {
        const count = directorCount.get(d.toLowerCase()) ?? 0;
        if (count >= 2) concentrationPenalty += 0.20 * count;
      }

      const mmrScore =
        lambda * rel - (1 - lambda) * maxSim * 0.55 - (1 - lambda) * concentrationPenalty;

      if (mmrScore > bestMmrScore) {
        bestMmrScore = mmrScore;
        bestIdx = i;
      }
    }

    const chosen = remaining.splice(bestIdx, 1)[0];
    registerSelection(chosen);
    selected.push(chosen);
  }

  return [...selected, ...tailPool];
}
