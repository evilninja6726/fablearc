import {
  RecommendationEventType,
  RecommendationMode,
  SlateStrategy,
} from './recommendation.types';

export const RECOMMENDATION_ENGINE_VERSION = '2.0.0-hybrid';
export const TAXONOMY_VERSION = '2.0.0';
export const PARSER_VERSION = '2.0.0';
export const FEATURE_PROFILE_VERSION = '2.0.0';
export const RANKING_MODEL_VERSION = '2.0.0';
export const RERANKER_VERSION = '2.0.0';

export const LOCAL_STORAGE_PREFERENCES_KEY = 'streaming-recommendations:v1';
export const MAX_STORED_EVENTS = 250;
export const MAX_STORED_ID_LIST = 200;

export interface RankingWeightVector {
  intentStructured: number;
  semanticConcept: number;
  lexicalBm25: number;
  thematic: number;
  narrative: number;
  toneAtmosphere: number;
  anchorSimilarity: number;
  creatorCast: number;
  franchise: number;
  longTermTaste: number;
  sessionTaste: number;
  qualityPrior: number;
  noveltyDiscovery: number;
  negativePenalty: number;
  repetitionPenalty: number;
}

export const RANKING_WEIGHTS_BY_MODE: Record<RecommendationMode, RankingWeightVector> = {
  natural_language_search: {
    intentStructured: 0.20,
    semanticConcept: 0.24,
    lexicalBm25: 0.16,
    thematic: 0.12,
    narrative: 0.10,
    toneAtmosphere: 0.08,
    anchorSimilarity: 0.15,
    creatorCast: 0.05,
    franchise: 0.04,
    longTermTaste: 0.06,
    sessionTaste: 0.06,
    qualityPrior: 0.07,
    noveltyDiscovery: 0.03,
    negativePenalty: 0.45,
    repetitionPenalty: 0.12,
  },
  similar_to_item: {
    intentStructured: 0.12,
    semanticConcept: 0.24,
    lexicalBm25: 0.14,
    thematic: 0.16,
    narrative: 0.12,
    toneAtmosphere: 0.10,
    anchorSimilarity: 0.22,
    creatorCast: 0.08,
    franchise: 0.08,
    longTermTaste: 0.05,
    sessionTaste: 0.03,
    qualityPrior: 0.06,
    noveltyDiscovery: 0.03,
    negativePenalty: 0.40,
    repetitionPenalty: 0.10,
  },
  mood_discovery: {
    intentStructured: 0.15,
    semanticConcept: 0.18,
    lexicalBm25: 0.10,
    thematic: 0.14,
    narrative: 0.10,
    toneAtmosphere: 0.24,
    anchorSimilarity: 0.10,
    creatorCast: 0.04,
    franchise: 0.02,
    longTermTaste: 0.08,
    sessionTaste: 0.14,
    qualityPrior: 0.08,
    noveltyDiscovery: 0.08,
    negativePenalty: 0.45,
    repetitionPenalty: 0.15,
  },
  quality_discovery: {
    intentStructured: 0.14,
    semanticConcept: 0.16,
    lexicalBm25: 0.10,
    thematic: 0.12,
    narrative: 0.10,
    toneAtmosphere: 0.08,
    anchorSimilarity: 0.08,
    creatorCast: 0.05,
    franchise: 0.02,
    longTermTaste: 0.08,
    sessionTaste: 0.05,
    qualityPrior: 0.18,
    noveltyDiscovery: 0.18,
    negativePenalty: 0.45,
    repetitionPenalty: 0.18,
  },
  personalized_home: {
    intentStructured: 0.08,
    semanticConcept: 0.14,
    lexicalBm25: 0.06,
    thematic: 0.14,
    narrative: 0.10,
    toneAtmosphere: 0.10,
    anchorSimilarity: 0.06,
    creatorCast: 0.08,
    franchise: 0.04,
    longTermTaste: 0.26,
    sessionTaste: 0.14,
    qualityPrior: 0.10,
    noveltyDiscovery: 0.10,
    negativePenalty: 0.50,
    repetitionPenalty: 0.20,
  },
  franchise_exploration: {
    intentStructured: 0.14,
    semanticConcept: 0.18,
    lexicalBm25: 0.14,
    thematic: 0.10,
    narrative: 0.08,
    toneAtmosphere: 0.06,
    anchorSimilarity: 0.24,
    creatorCast: 0.10,
    franchise: 0.28,
    longTermTaste: 0.04,
    sessionTaste: 0.04,
    qualityPrior: 0.06,
    noveltyDiscovery: 0.02,
    negativePenalty: 0.40,
    repetitionPenalty: 0.05,
  },
};

export const MMR_LAMBDA_BY_STRATEGY: Record<SlateStrategy, number> = {
  strict: 0.90,
  similar_to_title: 0.84,
  balanced: 0.76,
  mood: 0.72,
  discovery: 0.60,
};

export const BAYESIAN_QUALITY_CONFIG = {
  catalogueMeanRating: 6.8,
  priorStrengthVotes: 1200,
  assumedVotesWhenMissingCount: 1800,
  scaleMax: 10,
};

export const EVENT_INITIAL_WEIGHTS: Record<RecommendationEventType, number> = {
  like: 5.0,
  dislike: -5.0,
  not_interested: -6.0,
  hide: -4.0,
  rewatch: 3.0,
  watch_complete: 2.0,
  watch_progress: 1.5,
  save: 1.0,
  remove_from_watchlist: -0.5,
  watch_start: 0.25,
  trailer_play: 0.35,
  detail_open: 0.1,
  click: 0.1,
  search: 0.4,
  skip: -0.5,
  impression: -0.02,
};

export const EVENT_DECAY_LAMBDA_PER_DAY: Record<RecommendationEventType, number> = {
  like: 0.002,
  dislike: 0.001,
  not_interested: 0.0,
  hide: 0.0,
  rewatch: 0.005,
  watch_complete: 0.012,
  watch_progress: 0.02,
  save: 0.008,
  remove_from_watchlist: 0.02,
  watch_start: 0.04,
  trailer_play: 0.04,
  detail_open: 0.05,
  click: 0.05,
  search: 0.12,
  skip: 0.05,
  impression: 0.15,
};
