export type PreferenceStrength = 'hard' | 'strong' | 'soft';

export interface IntentPreference<T = string> {
  value: T;
  polarity: 'include' | 'exclude';
  strength: PreferenceStrength;
  confidence: number;
  sourceText: string;
}

export type RecommendationMode =
  | 'personalized_home'
  | 'similar_to_item'
  | 'natural_language_search'
  | 'mood_discovery'
  | 'quality_discovery'
  | 'franchise_exploration';

export type SlateStrategy =
  | 'strict'
  | 'balanced'
  | 'discovery'
  | 'mood'
  | 'similar_to_title';

export interface RecommendationIntent {
  originalText: string;
  mediaTypes?: Array<'movie' | 'series'>;
  mediaTypeHard?: boolean;
  yearRange?: { min?: number; max?: number; hard: boolean; label?: string };
  minRating?: { source: string; value: number; hard: boolean };
  languages?: IntentPreference<string>[];
  genres?: IntentPreference<string>[];
  subgenres?: IntentPreference<string>[];
  themes?: IntentPreference<string>[];
  concepts?: IntentPreference<string>[];
  tones?: IntentPreference<string>[];
  settings?: IntentPreference<string>[];
  pacing?: IntentPreference<string>[];
  narrativeTraits?: IntentPreference<string>[];
  people?: Array<{ id?: string; name: string; role?: string; polarity?: 'include' | 'exclude' }>;
  titleAnchors?: Array<{
    title: string;
    canonicalId?: string;
    relationship: 'similar_to' | 'avoid' | 'exact' | 'less_like';
    modifiers?: string[];
  }>;
  runtime?: { minMinutes?: number; maxMinutes?: number; hard: boolean };
  contentExclusions?: IntentPreference<string>[];
  qualityPreference?: 'highly_rated' | 'any' | 'hidden_gems';
  noveltyPreference?: 'familiar' | 'balanced' | 'exploratory';
  mood?: string[];
  context?: string[];
  lexicalTerms?: string[];
  cinemetaSearchTerms?: string[];
  unresolvedClauses?: string[];
  clarificationQuestion?: string;
  requestMode: RecommendationMode;
  slateStrategy: SlateStrategy;
  parserVersion: string;
}

export interface NormalizedMediaItem {
  canonicalId: string;
  sourceIds: Array<{ provider: string; id: string }>;

  type: 'movie' | 'series';
  title: string;
  normalizedTitle: string;
  alternateTitles: string[];

  releaseYear: number | null;
  releaseDate: string | null;
  originalLanguage: string | null;
  country: string | null;
  genres: string[];

  synopsis: string;
  cast: string[];
  directors: string[];
  creators: string[];
  writers: string[];

  runtimeMinutes: number | null;

  ratings: Array<{
    source: string;
    value: number;
    scaleMax: number;
    voteCount: number | null;
    observedAt: string | null;
  }>;

  franchiseIds: string[];
  relatedItemIds: string[];

  awardsText: string | null;
  metadataCompleteness: number;
  metadataUpdatedAt: string | null;
}

export type TaxonomyDimension =
  | 'genre'
  | 'subgenre'
  | 'theme'
  | 'narrative_mechanic'
  | 'tone'
  | 'setting'
  | 'pacing'
  | 'character_dynamic'
  | 'content_signal';

export interface WeightedFeature {
  id: string;
  label: string;
  dimension: TaxonomyDimension;
  weight: number;
  confidence: number;
  source: 'metadata' | 'taxonomy_phrase' | 'taxonomy_token' | 'anchor_knowledge';
}

export interface MediaUnderstandingProfile {
  canonicalId: string;

  genres: WeightedFeature[];
  subgenres: WeightedFeature[];
  themes: WeightedFeature[];
  concepts: WeightedFeature[];
  tones: WeightedFeature[];
  settings: WeightedFeature[];
  pacing: WeightedFeature[];
  narrativeTraits: WeightedFeature[];
  characterDynamics: WeightedFeature[];
  contentSignals: WeightedFeature[];

  lexicalTerms: Array<{ term: string; tf: number; weight: number }>;
  conceptIds: string[];
  normalizedFeatureHash: string;

  profileVersion: string;
  generatedAt: string;
}

export type RecommendationEventType =
  | 'impression'
  | 'click'
  | 'detail_open'
  | 'trailer_play'
  | 'watch_start'
  | 'watch_progress'
  | 'watch_complete'
  | 'rewatch'
  | 'like'
  | 'dislike'
  | 'save'
  | 'remove_from_watchlist'
  | 'skip'
  | 'not_interested'
  | 'hide'
  | 'search';

export interface RecommendationEvent {
  eventId: string;
  userId: string;
  canonicalItemId?: string;
  eventType: RecommendationEventType;
  timestamp: string;

  sessionId?: string;
  position?: number;
  sourceSurface?: string;

  watchDurationSeconds?: number;
  itemDurationSeconds?: number;
  completionRatio?: number;

  queryId?: string;
  recommendationRequestId?: string;
  modelVersion?: string;
}

export interface LocalRecommendationPreferences {
  schemaVersion: 1;
  updatedAt: string;
  likedItemIds: string[];
  dislikedItemIds: string[];
  notInterestedItemIds: string[];
  savedItemIds: string[];
  watchedItemIds: string[];
  recentImpressionIds: string[];
  preferredGenres: string[];
  avoidedGenres: string[];
  preferredThemes: string[];
  avoidedThemes: string[];
  preferredTones: string[];
  avoidedTones: string[];
  events: RecommendationEvent[];
  settings?: {
    personalizationEnabled: boolean;
    discoveryLevel: 'balanced' | 'familiar' | 'exploratory';
  };
}

export interface BuiltUserTasteProfile {
  hasSignals: boolean;
  personalizationEnabled: boolean;
  discoveryLevel: 'balanced' | 'familiar' | 'exploratory';
  positiveFeatureWeights: Map<string, number>;
  negativeFeatureWeights: Map<string, number>;
  sessionFeatureWeights: Map<string, number>;
  preferredDirectors: Map<string, number>;
  preferredCast: Map<string, number>;
  likedItemIds: Set<string>;
  dislikedItemIds: Set<string>;
  watchedItemIds: Set<string>;
  savedItemIds: Set<string>;
  recentImpressionIds: Set<string>;
}

export type CandidateSourceChannel =
  | 'synopsis_lexical_concept'
  | 'theme_taxonomy'
  | 'narrative_structure'
  | 'tone_atmosphere'
  | 'structured_genre'
  | 'same_creator'
  | 'same_cast'
  | 'franchise'
  | 'similar_item'
  | 'local_interaction_derived'
  | 'session_mood'
  | 'quality_discovery'
  | 'new_underexposed'
  | 'query_exact';

export interface RecommendationReason {
  code: string;
  label: string;
  contribution?: number;
  confidence?: number;
  evidence?: string[];
  source:
    | 'metadata'
    | 'user_feedback'
    | 'semantic_model'
    | 'local interaction-derived'
    | 'editorial';
}

export interface CandidateScoreBreakdown {
  canonicalId: string;
  totalScore: number;
  normalizedRelevance: number;

  features: Record<
    string,
    {
      rawValue: number | null;
      normalizedValue: number | null;
      contribution: number;
      confidence: number;
    }
  >;

  candidateSources: CandidateSourceChannel[];
  hardConstraintResults: Record<string, boolean>;
  reasons: RecommendationReason[];
}

export interface RecommendationDiagnostics {
  requestId: string;
  timestamp: string;

  parserVersion: string;
  featureVersion: string;
  rankingVersion: string;
  rerankerVersion: string;

  requestMode: RecommendationMode;
  slateStrategy: SlateStrategy;
  candidateCountBySource: Record<string, number>;
  candidateCountAfterDedup: number;
  candidateCountAfterFilters: number;

  selectedItemIds: string[];
  scoreBreakdowns?: CandidateScoreBreakdown[];

  latencyMsByStage: Record<string, number>;
  fallbackUsed: boolean;
  warnings: string[];
}
