import { StremioMediaItem } from '../addons/stremioProtocol';
import {
  CandidateScoreBreakdown,
  executeHybridRecommendationPipeline,
  extractReleaseYearFromStremioItem,
  extractSignificantKeywords as extractSignificantKeywordsNew,
  extractTaxonomyNodesFromText,
  HIERARCHICAL_TAXONOMY,
  HybridRecommendationPipelineOutput,
  LocalRecommendationPreferences,
  normalizeWordStem as normalizeWordStemNew,
  parseRecommendationIntent,
  RecommendationDiagnostics,
  RecommendationIntent,
  RecommendationReason,
} from './recommendations';

export * from './recommendations';

export interface ConceptCluster {
  id: string;
  label: string;
  keywords: string[];
  relatedGenres: string[];
}

/**
 * Legacy-compatible concept cluster definitions mapped directly to the v2 hierarchical taxonomy.
 */
export const SEMANTIC_CONCEPT_CLUSTERS: ConceptCluster[] = [
  {
    id: 'post-apocalyptic',
    label: 'Post-Apocalyptic & Survival',
    keywords: [
      'apocalypse',
      'apocalyptic',
      'post-apocalyptic',
      'wasteland',
      'dystopia',
      'dystopian',
      'survival',
      'survivor',
      'survivors',
      'outbreak',
      'pandemic',
      'virus',
      'plague',
      'infected',
      'zombie',
      'zombies',
      'undead',
      'extinction',
      'collapse',
      'fallout',
      'nuclear',
      'bunker',
      'ruins',
      'quarantine',
      'catastrophe',
      'doomsday',
    ],
    relatedGenres: ['Sci-Fi', 'Thriller', 'Action', 'Horror', 'Drama'],
  },
  {
    id: 'space-cosmos',
    label: 'Space & Interstellar',
    keywords: [
      'space',
      'interstellar',
      'galaxy',
      'galactic',
      'astronaut',
      'astronauts',
      'spaceship',
      'spacecraft',
      'starship',
      'station',
      'alien',
      'aliens',
      'extraterrestrial',
      'planet',
      'planetary',
      'mars',
      'lunar',
      'moon',
      'orbit',
      'cosmos',
      'cosmic',
      'wormhole',
      'black hole',
      'nebula',
      'nasa',
      'colonize',
      'colony',
    ],
    relatedGenres: ['Sci-Fi', 'Adventure', 'Mystery', 'Thriller'],
  },
  {
    id: 'blood-vampire-gore',
    label: 'Blood, Vampire & Dark Horror',
    keywords: [
      'blood',
      'bloody',
      'bleed',
      'bloodbath',
      'bloodthirsty',
      'vampire',
      'vampires',
      'dracula',
      'fangs',
      'immortal',
      'slasher',
      'gore',
      'gory',
      'brutal',
      'butcher',
      'massacre',
      'slaughter',
      'carnage',
      'cannibal',
      'flesh',
      'demon',
      'demonic',
      'possession',
      'exorcism',
      'occult',
      'ritual',
      'curse',
      'cursed',
      'werewolf',
      'monster',
      'creature',
      'nightmare',
      'sinister',
      'terrifying',
    ],
    relatedGenres: ['Horror', 'Thriller', 'Action', 'Fantasy'],
  },
  {
    id: 'time-multiverse',
    label: 'Time Travel & Multiverse',
    keywords: [
      'time travel',
      'time-travel',
      'timeline',
      'timelines',
      'time loop',
      'paradox',
      'multiverse',
      'parallel',
      'alternate reality',
      'dimension',
      'dimensions',
      'portal',
      'quantum',
      'chronicle',
      'future self',
      'teleport',
    ],
    relatedGenres: ['Sci-Fi', 'Adventure', 'Mystery', 'Thriller'],
  },
  {
    id: 'psychological-mindbending',
    label: 'Mind-Bending & Psychological',
    keywords: [
      'psychological',
      'mind-bending',
      'mind',
      'hallucination',
      'paranoia',
      'paranoid',
      'memory',
      'memories',
      'amnesia',
      'dream',
      'dreams',
      'subconscious',
      'insanity',
      'madness',
      'asylum',
      'psychiatric',
      'delusion',
      'illusion',
      'obsessed',
      'obsession',
      'manipulation',
      'identity',
      'labyrinth',
    ],
    relatedGenres: ['Thriller', 'Mystery', 'Drama', 'Sci-Fi'],
  },
  {
    id: 'cyberpunk-ai',
    label: 'Cyberpunk, AI & Futuristic Tech',
    keywords: [
      'artificial intelligence',
      'robot',
      'robots',
      'android',
      'cyborg',
      'cyberpunk',
      'cyber',
      'hacker',
      'hacking',
      'virtual reality',
      'simulation',
      'matrix',
      'algorithm',
      'surveillance',
      'neural',
      'clone',
      'cloning',
      'genetic',
      'megacorp',
      'drones',
    ],
    relatedGenres: ['Sci-Fi', 'Action', 'Thriller'],
  },
  {
    id: 'heist-con',
    label: 'Heist & Mastermind Crime',
    keywords: [
      'heist',
      'robbery',
      'bank',
      'vault',
      'thief',
      'thieves',
      'steal',
      'stealing',
      'casino',
      'con artist',
      'scam',
      'mastermind',
      'diamond',
      'gold',
      'getaway',
      'crew',
    ],
    relatedGenres: ['Crime', 'Action', 'Thriller'],
  },
  {
    id: 'mafia-cartel-underworld',
    label: 'Mafia, Cartel & Underworld',
    keywords: [
      'mafia',
      'mob',
      'mobster',
      'gangster',
      'cartel',
      'narco',
      'drug',
      'trafficking',
      'underworld',
      'syndicate',
      'kingpin',
      'crime boss',
      'yakuza',
      'gang',
      'gangs',
      'corrupt',
      'corruption',
    ],
    relatedGenres: ['Crime', 'Drama', 'Thriller', 'Action'],
  },
  {
    id: 'detective-serial-killer',
    label: 'Detective & Murder Mystery',
    keywords: [
      'serial killer',
      'detective',
      'investigator',
      'investigation',
      'murder',
      'homicide',
      'forensic',
      'fbi',
      'suspect',
      'victim',
      'victims',
      'cold case',
      'whodunit',
      'clue',
      'clues',
      'disappearance',
      'missing',
      'kidnapped',
      'kidnapping',
      'abduction',
      'crime scene',
    ],
    relatedGenres: ['Mystery', 'Crime', 'Thriller', 'Drama'],
  },
  {
    id: 'revenge-vigilante',
    label: 'Revenge & Vigilante Action',
    keywords: [
      'revenge',
      'vengeance',
      'avenge',
      'payback',
      'betrayal',
      'betrayed',
      'vigilante',
      'hitman',
      'assassin',
      'mercenary',
      'bounty',
      'hunt',
      'hunted',
      'ruthless',
      'retribution',
    ],
    relatedGenres: ['Action', 'Thriller', 'Crime'],
  },
  {
    id: 'war-military-espionage',
    label: 'War, Military & Espionage',
    keywords: [
      'war',
      'warfare',
      'battlefield',
      'soldier',
      'soldiers',
      'military',
      'army',
      'marine',
      'sniper',
      'platoon',
      'trench',
      'world war',
      'nazi',
      'submarine',
      'spy',
      'espionage',
      'cia',
      'mi6',
      'kgb',
      'covert',
      'secret agent',
      'intelligence',
      'terrorist',
      'hostage',
    ],
    relatedGenres: ['War', 'Action', 'Thriller', 'History', 'Drama'],
  },
  {
    id: 'fantasy-magic-myth',
    label: 'Magic, Myth & Fantasy Worlds',
    keywords: [
      'magic',
      'magical',
      'wizard',
      'sorcerer',
      'witch',
      'witches',
      'dragon',
      'dragons',
      'kingdom',
      'throne',
      'empire',
      'sword',
      'prophecy',
      'mythical',
      'mythology',
      'ancient',
      'elf',
      'elves',
      'quest',
      'spell',
      'supernatural',
      'ghost',
      'haunted',
      'haunting',
    ],
    relatedGenres: ['Fantasy', 'Adventure', 'Action'],
  },
  {
    id: 'disaster-nature',
    label: 'Disaster & Extreme Survival',
    keywords: [
      'earthquake',
      'tsunami',
      'hurricane',
      'tornado',
      'storm',
      'volcano',
      'meteor',
      'asteroid',
      'shipwreck',
      'stranded',
      'island',
      'ocean',
      'deep sea',
      'shark',
      'wilderness',
      'mountain',
      'avalanche',
      'blizzard',
      'plane crash',
      'expedition',
    ],
    relatedGenres: ['Adventure', 'Action', 'Thriller', 'Drama'],
  },
  {
    id: 'martial-arts-combat',
    label: 'Martial Arts & Combat',
    keywords: [
      'martial arts',
      'kung fu',
      'karate',
      'fighter',
      'fighting',
      'boxing',
      'boxer',
      'mma',
      'tournament',
      'samurai',
      'ninja',
      'katana',
      'dojo',
      'gladiator',
      'arena',
    ],
    relatedGenres: ['Action', 'Sport', 'Drama'],
  },
  {
    id: 'romance-emotional',
    label: 'Romance & Heartfelt Drama',
    keywords: [
      'romance',
      'romantic',
      'love',
      'lovers',
      'soulmate',
      'wedding',
      'marriage',
      'heartbreak',
      'passion',
      'affair',
      'relationship',
      'couple',
      'falling in love',
    ],
    relatedGenres: ['Romance', 'Drama', 'Comedy'],
  },
  {
    id: 'prison-escape',
    label: 'Prison & Escape',
    keywords: [
      'prison',
      'prisoner',
      'inmate',
      'inmates',
      'jail',
      'escape',
      'cell',
      'warden',
      'fugitive',
      'convict',
      'sentence',
    ],
    relatedGenres: ['Crime', 'Drama', 'Thriller', 'Action'],
  },
];

export function normalizeWordStem(word: string): string {
  return normalizeWordStemNew(word);
}

export function extractSignificantKeywords(text?: string): string[] {
  return extractSignificantKeywordsNew(text);
}

export function extractReleaseYear(
  item: Pick<StremioMediaItem, 'year' | 'releaseInfo'>,
): number | null {
  return extractReleaseYearFromStremioItem(item);
}

export function detectConceptClustersForText(text: string): ConceptCluster[] {
  if (!text || !text.trim()) return [];
  const extractedNodes = extractTaxonomyNodesFromText(text);
  const clusterScores = new Map<string, number>();

  for (const feat of extractedNodes) {
    const taxNode = HIERARCHICAL_TAXONOMY.find((n) => n.id === feat.id);
    if (taxNode?.legacyClusterId) {
      clusterScores.set(
        taxNode.legacyClusterId,
        (clusterScores.get(taxNode.legacyClusterId) ?? 0) + feat.weight * feat.confidence,
      );
    }
  }

  // Also scan direct legacy clusters for exact compatibility
  const lower = text.toLowerCase();
  const stems = new Set(extractSignificantKeywords(text));
  for (const cluster of SEMANTIC_CONCEPT_CLUSTERS) {
    let hits = 0;
    for (const kw of cluster.keywords) {
      if (kw.includes(' ')) {
        if (lower.includes(kw)) hits += 2;
      } else if (stems.has(normalizeWordStem(kw))) {
        hits += 1;
      }
    }
    if (hits > 0) {
      clusterScores.set(cluster.id, (clusterScores.get(cluster.id) ?? 0) + hits * 0.4);
    }
  }

  return Array.from(clusterScores.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => SEMANTIC_CONCEPT_CLUSTERS.find((c) => c.id === id)!)
    .filter(Boolean);
}

export interface SimilarMediaResult {
  items: StremioMediaItem[];
  matchedConceptLabels: string[];
  targetYear: number | null;
  reasonsByItemId: Record<string, string>;
  diagnostics: RecommendationDiagnostics;
}

/**
 * Item-to-item content & taxonomy similarity ranking for the Movie/Series Details Page.
 * Uses the 9-stage Hybrid Recommendation Pipeline with MMR diversity re-ranking and honest explanations.
 */
export function rankSimilarMediaItems(
  target: StremioMediaItem,
  candidates: StremioMediaItem[],
  limit = 12,
  localPreferencesOverride?: LocalRecommendationPreferences,
): SimilarMediaResult {
  const targetClusters = detectConceptClustersForText(
    `${target.name} ${target.description || ''} ${target.genres.join(' ')}`,
  );
  const targetYear = extractReleaseYear(target);

  const pipelineOutput: HybridRecommendationPipelineOutput =
    executeHybridRecommendationPipeline({
      anchorStremioItem: target,
      candidates,
      localPreferencesOverride,
      enableDiversityRerank: true,
      mmrWindowSize: Math.max(24, limit * 2),
      limit,
    });

  const reasonsByItemId: Record<string, string> = {};
  for (const r of pipelineOutput.results) {
    reasonsByItemId[r.item.id] = r.primaryReasonLabel;
  }

  return {
    items: pipelineOutput.results.map((r) => r.item),
    matchedConceptLabels: targetClusters.slice(0, 2).map((c) => c.label),
    targetYear,
    reasonsByItemId,
    diagnostics: pipelineOutput.diagnostics,
  };
}

export interface ParsedSuggestionPrompt {
  rawPrompt: string;
  mediaTypeFilter: 'all' | 'movie' | 'series';
  yearRange: { min: number; max: number; label: string; hard?: boolean } | null;
  minRating: number | null;
  matchedGenres: string[];
  excludedGenres: string[];
  matchedClusters: ConceptCluster[];
  significantKeywords: string[];
  cinemetaSearchTerms: string[];
  intent: RecommendationIntent;
}

/**
 * Parses a free-form natural language description, concept, genre, contrast, exclusion, or year prompt
 * into a structured RecommendationIntent and backward-compatible ParsedSuggestionPrompt.
 */
export function parseNaturalLanguageSuggestionQuery(
  rawPrompt: string,
): ParsedSuggestionPrompt {
  const intent = parseRecommendationIntent(rawPrompt);

  let mediaTypeFilter: 'all' | 'movie' | 'series' = 'all';
  if (intent.mediaTypes && intent.mediaTypes.length === 1) {
    mediaTypeFilter = intent.mediaTypes[0];
  }

  const yearRange = intent.yearRange
    ? {
        min: intent.yearRange.min ?? 1900,
        max: intent.yearRange.max ?? 2030,
        label:
          intent.yearRange.label ||
          `${intent.yearRange.min ?? 1900}–${intent.yearRange.max ?? 2030}`,
        hard: intent.yearRange.hard,
      }
    : null;

  const minRating = intent.minRating ? intent.minRating.value : null;

  const matchedGenres = (intent.genres || [])
    .filter((g) => g.polarity === 'include')
    .map((g) => g.value);

  const excludedGenres = (intent.genres || [])
    .filter((g) => g.polarity === 'exclude')
    .map((g) => g.value);

  // Only detect positive clusters from positive clauses so excluded concepts aren't added to matchedClusters
  const matchedClusters = detectConceptClustersForText(
    (intent.lexicalTerms || []).join(' '),
  );

  return {
    rawPrompt: intent.originalText,
    mediaTypeFilter,
    yearRange,
    minRating,
    matchedGenres,
    excludedGenres,
    matchedClusters,
    significantKeywords: intent.lexicalTerms || [],
    cinemetaSearchTerms: intent.cinemetaSearchTerms || [],
    intent,
  };
}

export interface ScoredSuggestionItem {
  item: StremioMediaItem;
  score: number;
  normalizedRelevance: number;
  matchReasonLabel: string;
  reasons: RecommendationReason[];
  breakdown: CandidateScoreBreakdown;
}

/**
 * Ranks candidate movies/series using the 9-stage Hybrid Recommendation Pipeline:
 * 1. Canonical deduplication & normalization (no fabricated 6.2 ratings)
 * 2. Hard constraint & exclusion filtering ("without gore", "no romance", "2015 to 2022", "movies only")
 * 3. Multi-dimensional taxonomy + BM25 lexical + title-anchor + contrast scoring
 * 4. Local personalization affinity (from localStorage watch history, watchlist & 1-5★ ratings)
 * 5. MMR diversity re-ranking
 * 6. Honest, evidence-based explanation labels (no fake % probabilities)
 */
export function scoreCandidatesForSuggestionPrompt(
  query: ParsedSuggestionPrompt | string,
  candidates: StremioMediaItem[],
  explicitMediaFilter: 'all' | 'movie' | 'series' = 'all',
  limit = 2000,
  localPreferencesOverride?: LocalRecommendationPreferences,
): ScoredSuggestionItem[] {
  const parsedQuery =
    typeof query === 'string' ? parseNaturalLanguageSuggestionQuery(query) : query;

  const pipelineOutput = executeHybridRecommendationPipeline({
    queryText: parsedQuery.rawPrompt,
    parsedIntent: parsedQuery.intent,
    candidates,
    explicitUiMediaFilter: explicitMediaFilter,
    localPreferencesOverride,
    enableDiversityRerank: true,
    mmrWindowSize: 36,
    limit,
  });

  return pipelineOutput.results.map((r) => ({
    item: r.item,
    score: r.totalScore,
    normalizedRelevance: r.normalizedRelevance,
    matchReasonLabel: r.primaryReasonLabel,
    reasons: r.reasons,
    breakdown: r.breakdown,
  }));
}

export const QUICK_SUGGESTION_PROMPTS: Array<{
  label: string;
  prompt: string;
}> = [
  {
    label: 'Post-Apocalyptic Survival',
    prompt: 'Post-apocalyptic survival after a virus outbreak or wasteland collapse',
  },
  {
    label: 'Deep Space & Interstellar',
    prompt: 'Realistic space exploration, astronauts, alien worlds and hard sci-fi',
  },
  {
    label: 'Mind-Bending & Time Loops',
    prompt: 'Mind-bending sci-fi or thriller with time loops and a satisfying twist',
  },
  {
    label: 'Dark Detective Mystery',
    prompt: 'Slow-burn detective murder mystery with a dark atmosphere',
  },
  {
    label: 'Like Interstellar, But Darker',
    prompt: 'Like Interstellar, but darker and more suspenseful',
  },
  {
    label: 'Thriller Without Gore',
    prompt: 'Gripping psychological thriller without gore or slasher violence',
  },
  {
    label: 'Underrated Hidden Gems',
    prompt: 'Underrated psychological thriller or sci-fi hidden gems above 7.2',
  },
  {
    label: 'Light & Feel-Good Tonight',
    prompt: 'Something light and uplifting for tonight without depressing drama',
  },
];
