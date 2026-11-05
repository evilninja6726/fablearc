import { RankedCandidateResult } from '../ranking/rankingModel';
import { computePairwiseItemSimilarity } from '../reranking/diversityReranker';

export function precisionAtK(
  recommendedIds: string[],
  relevantIds: Set<string>,
  k: number,
): number {
  if (k <= 0) return 0;
  const topK = recommendedIds.slice(0, k);
  if (topK.length === 0) return 0;
  let hits = 0;
  for (const id of topK) {
    if (relevantIds.has(id)) hits += 1;
  }
  return Math.round((hits / k) * 1000) / 1000;
}

export function recallAtK(
  recommendedIds: string[],
  relevantIds: Set<string>,
  k: number,
): number {
  if (relevantIds.size === 0 || k <= 0) return 0;
  const topK = recommendedIds.slice(0, k);
  let hits = 0;
  for (const id of topK) {
    if (relevantIds.has(id)) hits += 1;
  }
  return Math.round((hits / relevantIds.size) * 1000) / 1000;
}

export function ndcgAtK(
  recommendedIds: string[],
  gradedRelevanceById: Record<string, number>,
  k: number,
): number {
  if (k <= 0) return 0;
  const topK = recommendedIds.slice(0, k);

  let dcg = 0;
  for (let i = 0; i < topK.length; i += 1) {
    const rel = gradedRelevanceById[topK[i]] ?? 0;
    if (rel > 0) {
      dcg += (Math.pow(2, rel) - 1) / Math.log2(i + 2);
    }
  }

  const idealGrades = Object.values(gradedRelevanceById)
    .filter((g) => g > 0)
    .sort((a, b) => b - a)
    .slice(0, k);

  let idcg = 0;
  for (let i = 0; i < idealGrades.length; i += 1) {
    idcg += (Math.pow(2, idealGrades[i]) - 1) / Math.log2(i + 2);
  }

  if (idcg <= 0) return 0;
  return Math.round((dcg / idcg) * 1000) / 1000;
}

export function averagePrecisionAtK(
  recommendedIds: string[],
  relevantIds: Set<string>,
  k: number,
): number {
  if (relevantIds.size === 0 || k <= 0) return 0;
  const topK = recommendedIds.slice(0, k);
  let hits = 0;
  let sumPrecisions = 0;

  for (let i = 0; i < topK.length; i += 1) {
    if (relevantIds.has(topK[i])) {
      hits += 1;
      sumPrecisions += hits / (i + 1);
    }
  }

  return Math.round((sumPrecisions / Math.min(relevantIds.size, k)) * 1000) / 1000;
}

export function meanReciprocalRank(
  recommendedIds: string[],
  relevantIds: Set<string>,
): number {
  for (let i = 0; i < recommendedIds.length; i += 1) {
    if (relevantIds.has(recommendedIds[i])) {
      return Math.round((1 / (i + 1)) * 1000) / 1000;
    }
  }
  return 0;
}

export function computeIntraListDiversity(
  results: RankedCandidateResult[],
  k = 10,
): number {
  const slice = results.slice(0, k);
  if (slice.length <= 1) return 1;
  let totalDissimilarity = 0;
  let pairs = 0;
  for (let i = 0; i < slice.length; i += 1) {
    for (let j = i + 1; j < slice.length; j += 1) {
      const sim = computePairwiseItemSimilarity(slice[i], slice[j]);
      totalDissimilarity += 1 - sim;
      pairs += 1;
    }
  }
  return pairs > 0 ? Math.round((totalDissimilarity / pairs) * 1000) / 1000 : 1;
}

export function computeExclusionViolationRate(
  recommendedIds: string[],
  forbiddenIds: Set<string>,
  k = 10,
): number {
  const slice = recommendedIds.slice(0, k);
  if (slice.length === 0 || forbiddenIds.size === 0) return 0;
  let violations = 0;
  for (const id of slice) {
    if (forbiddenIds.has(id)) violations += 1;
  }
  return Math.round((violations / slice.length) * 1000) / 1000;
}
