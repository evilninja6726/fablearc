import { StremioMediaItem } from '../../addons/stremioProtocol';
import {
  deduplicateStremioMediaItems,
  normalizeMediaItem,
} from './catalogue/normalizeMediaItem';
import {
  FEATURE_PROFILE_VERSION,
  PARSER_VERSION,
  RANKING_MODEL_VERSION,
  RERANKER_VERSION,
} from './domain/recommendation.config';
import {
  CandidateScoreBreakdown,
  LocalRecommendationPreferences,
  MediaUnderstandingProfile,
  NormalizedMediaItem,
  RecommendationDiagnostics,
  RecommendationIntent,
  RecommendationReason,
} from './domain/recommendation.types';
import { parseRecommendationIntent } from './intent/parseIntent';
import { buildUserTasteProfile } from './profile/buildUserProfile';
import { loadLocalRecommendationPreferences } from './profile/localPreferenceStore';
import { scoreAndRankCandidates } from './ranking/rankingModel';
import { rerankForSlateDiversity } from './reranking/diversityReranker';
import { generateCandidates } from './retrieval/candidateGenerator';
import { buildMediaUnderstandingProfile } from './understanding/itemProfileBuilder';
import { getOrBuildLexicalIndex } from './understanding/lexicalIndex';

export interface HybridRecommendationItemResult {
  item: StremioMediaItem;
  normalizedItem: NormalizedMediaItem;
  profile: MediaUnderstandingProfile;
  totalScore: number;
  normalizedRelevance: number;
  primaryReasonLabel: string;
  reasons: RecommendationReason[];
  breakdown: CandidateScoreBreakdown;
}

export interface HybridRecommendationPipelineOutput {
  results: HybridRecommendationItemResult[];
  intent: RecommendationIntent;
  diagnostics: RecommendationDiagnostics;
}

/**
 * Full 9-Stage Hybrid Recommendation Engine Pipeline (Zero-DB, Zero-API-Key, In-Memory + LocalStorage).
 */
export function executeHybridRecommendationPipeline(params: {
  queryText?: string;
  parsedIntent?: RecommendationIntent;
  anchorStremioItem?: StremioMediaItem;
  candidates: StremioMediaItem[];
  explicitUiMediaFilter?: 'all' | 'movie' | 'series';
  localPreferencesOverride?: LocalRecommendationPreferences;
  enableDiversityRerank?: boolean;
  mmrWindowSize?: number;
  limit?: number;
}): HybridRecommendationPipelineOutput {
  const t0 = performance.now();
  const latencyMsByStage: Record<string, number> = {};
  const warnings: string[] = [];

  // Stage 0: Catalogue Normalization & Canonical Deduplication
  const tNormStart = performance.now();
  const {
    deduplicatedItems,
    normalizedByCanonicalId,
    stremioByCanonicalId,
  } = deduplicateStremioMediaItems(params.candidates);

  const normalizedList = Array.from(normalizedByCanonicalId.values());
  let anchorNorm: NormalizedMediaItem | undefined;
  if (params.anchorStremioItem) {
    anchorNorm = normalizeMediaItem(params.anchorStremioItem);
  }
  latencyMsByStage.normalization = Math.round((performance.now() - tNormStart) * 100) / 100;

  // Stage 1 & 2: Item Understanding & In-Memory Lexical Indexing
  const tProfileStart = performance.now();
  const profilesByCanonicalId = new Map<string, MediaUnderstandingProfile>();
  for (const normItem of normalizedList) {
    profilesByCanonicalId.set(
      normItem.canonicalId,
      buildMediaUnderstandingProfile(normItem),
    );
  }
  let anchorProfile: MediaUnderstandingProfile | undefined;
  if (anchorNorm) {
    anchorProfile = buildMediaUnderstandingProfile(anchorNorm);
    profilesByCanonicalId.set(anchorNorm.canonicalId, anchorProfile);
  }
  const lexicalIndex = getOrBuildLexicalIndex(normalizedList);
  latencyMsByStage.understandingAndIndex =
    Math.round((performance.now() - tProfileStart) * 100) / 100;

  // Stage 4: Query / Intent Understanding
  const tIntentStart = performance.now();
  let intent: RecommendationIntent;
  if (params.parsedIntent) {
    intent = params.parsedIntent;
  } else if (anchorNorm) {
    intent = {
      originalText: params.queryText || '',
      requestMode: 'similar_to_item',
      slateStrategy: 'similar_to_title',
      parserVersion: PARSER_VERSION,
    };
  } else {
    intent = parseRecommendationIntent(params.queryText || '', normalizedList);
  }
  latencyMsByStage.intentParsing =
    Math.round((performance.now() - tIntentStart) * 100) / 100;

  // Stage 5 & 6: Local Personalization Profile
  const tUserStart = performance.now();
  const prefs =
    params.localPreferencesOverride ?? loadLocalRecommendationPreferences();
  const userProfile = buildUserTasteProfile(
    prefs,
    normalizedByCanonicalId,
    profilesByCanonicalId,
  );
  latencyMsByStage.userProfile =
    Math.round((performance.now() - tUserStart) * 100) / 100;

  // Stage 3: Multi-Channel Candidate Generation
  const tRetrievalStart = performance.now();
  const { candidates: retrievedCandidates, candidateCountBySource } =
    generateCandidates({
      allItems: normalizedList,
      profilesByCanonicalId,
      lexicalIndex,
      intent,
      userProfile,
      anchorItem: anchorNorm,
      anchorProfile,
    });
  latencyMsByStage.candidateRetrieval =
    Math.round((performance.now() - tRetrievalStart) * 100) / 100;

  // Stage 7: Hard Constraint Filtering & Personalized Hybrid Ranking
  const tRankStart = performance.now();
  const { ranked } = scoreAndRankCandidates({
    candidates: retrievedCandidates,
    intent,
    userProfile,
    lexicalIndex,
    allProfilesByCanonicalId: profilesByCanonicalId,
    anchorItem: anchorNorm,
    anchorProfile,
    explicitUiMediaFilter: params.explicitUiMediaFilter ?? 'all',
  });
  latencyMsByStage.ranking = Math.round((performance.now() - tRankStart) * 100) / 100;

  // Stage 8: MMR Diversity & Novelty Re-Ranking
  const tRerankStart = performance.now();
  const shouldRerank = params.enableDiversityRerank !== false;
  const finalRanked = shouldRerank
    ? rerankForSlateDiversity({
        rankedCandidates: ranked,
        slateStrategy: intent.slateStrategy,
        requestMode: intent.requestMode,
        mmrWindowSize: params.mmrWindowSize ?? 36,
      })
    : ranked;
  latencyMsByStage.reranking =
    Math.round((performance.now() - tRerankStart) * 100) / 100;

  const limit = params.limit ?? 2000;
  const sliced = finalRanked.slice(0, limit);

  const results: HybridRecommendationItemResult[] = [];
  for (const entry of sliced) {
    const stremioItem = stremioByCanonicalId.get(entry.candidate.item.canonicalId);
    if (!stremioItem) continue;
    results.push({
      item: stremioItem,
      normalizedItem: entry.candidate.item,
      profile: entry.candidate.profile,
      totalScore: entry.breakdown.totalScore,
      normalizedRelevance: entry.breakdown.normalizedRelevance,
      primaryReasonLabel: entry.primaryReasonLabel,
      reasons: entry.breakdown.reasons,
      breakdown: entry.breakdown,
    });
  }

  latencyMsByStage.total = Math.round((performance.now() - t0) * 100) / 100;

  const diagnostics: RecommendationDiagnostics = {
    requestId: `rec-${Date.now()}`,
    timestamp: new Date().toISOString(),
    parserVersion: PARSER_VERSION,
    featureVersion: FEATURE_PROFILE_VERSION,
    rankingVersion: RANKING_MODEL_VERSION,
    rerankerVersion: RERANKER_VERSION,
    requestMode: intent.requestMode,
    slateStrategy: intent.slateStrategy,
    candidateCountBySource,
    candidateCountAfterDedup: deduplicatedItems.length,
    candidateCountAfterFilters: ranked.length,
    selectedItemIds: results.slice(0, 50).map((r) => r.normalizedItem.canonicalId),
    scoreBreakdowns: results.slice(0, 25).map((r) => r.breakdown),
    latencyMsByStage,
    fallbackUsed: false,
    warnings,
  };

  return {
    results,
    intent,
    diagnostics,
  };
}

export * from './catalogue/normalizeMediaItem';
export * from './domain/recommendation.config';
export * from './domain/recommendation.types';
export * from './evaluation/baselines';
export * from './evaluation/metrics';
export * from './intent/intentConstraints';
export * from './intent/parseIntent';
export * from './profile/buildUserProfile';
export * from './profile/localPreferenceStore';
export * from './ranking/explanations';
export * from './ranking/rankingModel';
export * from './reranking/diversityReranker';
export * from './retrieval/candidateGenerator';
export * from './understanding/itemProfileBuilder';
export * from './understanding/lexicalIndex';
export * from './understanding/taxonomy';
