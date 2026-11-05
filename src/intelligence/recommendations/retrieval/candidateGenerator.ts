import {
  BuiltUserTasteProfile,
  CandidateSourceChannel,
  MediaUnderstandingProfile,
  NormalizedMediaItem,
  RecommendationIntent,
} from '../domain/recommendation.types';
import { LexicalCorpusIndex } from '../understanding/lexicalIndex';
import { KNOWN_TITLE_ANCHORS } from '../understanding/taxonomy';

export interface RetrievedCandidate {
  item: NormalizedMediaItem;
  profile: MediaUnderstandingProfile;
  sources: CandidateSourceChannel[];
}

export interface CandidateGenerationOutput {
  candidates: RetrievedCandidate[];
  candidateCountBySource: Record<string, number>;
}

/**
 * Multi-channel candidate generator (Section 4.4).
 * Prioritizes recall across 14 independent channels and merges by canonical ID while preserving provenance.
 */
export function generateCandidates(params: {
  allItems: NormalizedMediaItem[];
  profilesByCanonicalId: Map<string, MediaUnderstandingProfile>;
  lexicalIndex: LexicalCorpusIndex;
  intent: RecommendationIntent;
  userProfile: BuiltUserTasteProfile;
  anchorItem?: NormalizedMediaItem;
  anchorProfile?: MediaUnderstandingProfile;
}): CandidateGenerationOutput {
  const {
    allItems,
    profilesByCanonicalId,
    lexicalIndex,
    intent,
    userProfile,
    anchorItem,
    anchorProfile,
  } = params;

  const sourcesByCanonicalId = new Map<string, Set<CandidateSourceChannel>>();
  const candidateCountBySource: Record<string, number> = {};

  const recordSource = (canonicalId: string, channel: CandidateSourceChannel) => {
    let set = sourcesByCanonicalId.get(canonicalId);
    if (!set) {
      set = new Set<CandidateSourceChannel>();
      sourcesByCanonicalId.set(canonicalId, set);
    }
    if (!set.has(channel)) {
      set.add(channel);
      candidateCountBySource[channel] = (candidateCountBySource[channel] ?? 0) + 1;
    }
  };

  // Pre-collect query target sets
  const positiveGenres = new Set(
    (intent.genres || [])
      .filter((g) => g.polarity === 'include')
      .map((g) => g.value.toLowerCase()),
  );
  const positiveThemeIds = new Set(
    [
      ...(intent.themes || []).filter((t) => t.polarity === 'include').map((t) => t.value),
      ...(intent.subgenres || []).filter((s) => s.polarity === 'include').map((s) => s.value),
      ...(intent.concepts || []).filter((c) => c.polarity === 'include').map((c) => c.value),
    ],
  );
  const positiveNarrativeIds = new Set(
    (intent.narrativeTraits || [])
      .filter((n) => n.polarity === 'include')
      .map((n) => n.value),
  );
  const positiveToneIds = new Set(
    (intent.tones || []).filter((t) => t.polarity === 'include').map((t) => t.value),
  );

  // Also include anchor features if query references a title anchor ("Like Interstellar, but darker")
  if (intent.titleAnchors && intent.titleAnchors.length > 0) {
    for (const anchor of intent.titleAnchors) {
      if (anchor.relationship !== 'similar_to') continue;
      const known = KNOWN_TITLE_ANCHORS.find(
        (k) => k.canonicalTitle.toLowerCase() === anchor.title.toLowerCase(),
      );
      if (known) {
        known.genres.forEach((g) => positiveGenres.add(g.toLowerCase()));
        known.taxonomyIds.forEach((id) => positiveThemeIds.add(id.trim()));
      }
      if (anchor.canonicalId) {
        const catProfile = profilesByCanonicalId.get(anchor.canonicalId);
        if (catProfile) {
          catProfile.conceptIds.forEach((id) => positiveThemeIds.add(id));
        }
      }
    }
  }

  if (anchorItem && anchorProfile) {
    anchorItem.genres.forEach((g) => positiveGenres.add(g.toLowerCase()));
    anchorProfile.conceptIds.forEach((id) => positiveThemeIds.add(id));
    anchorProfile.narrativeTraits.forEach((n) => positiveNarrativeIds.add(n.id));
    anchorProfile.tones.forEach((t) => positiveToneIds.add(t.id));
  }

  // Channel 1: Lexical / BM25 Retrieval
  const queryTerms = [
    ...(intent.lexicalTerms || []),
    ...(anchorItem
      ? anchorProfile?.lexicalTerms.slice(0, 12).map((t) => t.term) || []
      : []),
  ];
  if (queryTerms.length > 0) {
    const lexicalHits = lexicalIndex.retrieveCandidateIdsForTerms(queryTerms, 500);
    lexicalHits.forEach((id) => recordSource(id, 'synopsis_lexical_concept'));
  }

  const rawQueryLower = intent.originalText.trim().toLowerCase();
  const anchorDirectors = new Set(
    (anchorItem?.directors || []).map((d) => d.toLowerCase()),
  );
  const anchorCast = new Set((anchorItem?.cast || []).map((c) => c.toLowerCase()));
  const anchorFranchiseIds = new Set(anchorItem?.franchiseIds || []);

  for (const item of allItems) {
    if (anchorItem && item.canonicalId === anchorItem.canonicalId) continue;
    const profile = profilesByCanonicalId.get(item.canonicalId);
    if (!profile) continue;

    // Channel 14: Exact or Substring Named-Title Retrieval
    if (
      rawQueryLower.length >= 3 &&
      (item.title.toLowerCase().includes(rawQueryLower) ||
        item.normalizedTitle.includes(rawQueryLower))
    ) {
      recordSource(item.canonicalId, 'query_exact');
    }

    // Channel 2: Theme & Subgenre Taxonomy Similarity
    if (
      positiveThemeIds.size > 0 &&
      profile.conceptIds.some((id) => positiveThemeIds.has(id))
    ) {
      recordSource(item.canonicalId, 'theme_taxonomy');
    }

    // Channel 3: Narrative-Structure Similarity
    if (
      positiveNarrativeIds.size > 0 &&
      profile.narrativeTraits.some((n) => positiveNarrativeIds.has(n.id))
    ) {
      recordSource(item.canonicalId, 'narrative_structure');
    }

    // Channel 4: Tone / Atmosphere Similarity
    if (positiveToneIds.size > 0 && profile.tones.some((t) => positiveToneIds.has(t.id))) {
      recordSource(item.canonicalId, 'tone_atmosphere');
    }

    // Channel 5: Structured Genre Similarity
    if (
      positiveGenres.size > 0 &&
      item.genres.some((g) => positiveGenres.has(g.toLowerCase()))
    ) {
      recordSource(item.canonicalId, 'structured_genre');
    }

    // Channel 6 & 7 & 8 & 9: Item-to-Item / Creator / Cast / Franchise
    if (anchorItem) {
      if (item.directors.some((d) => anchorDirectors.has(d.toLowerCase()))) {
        recordSource(item.canonicalId, 'same_creator');
      }
      if (item.cast.some((c) => anchorCast.has(c.toLowerCase()))) {
        recordSource(item.canonicalId, 'same_cast');
      }
      if (item.franchiseIds.some((f) => anchorFranchiseIds.has(f))) {
        recordSource(item.canonicalId, 'franchise');
      }
      if (
        profile.conceptIds.some((id) => anchorProfile?.conceptIds.includes(id)) ||
        item.genres.filter((g) => positiveGenres.has(g.toLowerCase())).length >= 2
      ) {
        recordSource(item.canonicalId, 'similar_item');
      }
    }

    // Channel 10 & 11: Local Long-Term Taste & Session Mood Profile
    if (userProfile.hasSignals) {
      const hasPositiveTasteMatch = profile.conceptIds.some(
        (id) => (userProfile.positiveFeatureWeights.get(id) ?? 0) >= 2.0,
      );
      if (hasPositiveTasteMatch) {
        recordSource(item.canonicalId, 'local_interaction_derived');
      }
      const hasSessionMatch = profile.conceptIds.some(
        (id) => (userProfile.sessionFeatureWeights.get(id) ?? 0) >= 1.5,
      );
      if (hasSessionMatch) {
        recordSource(item.canonicalId, 'session_mood');
      }
    }

    // Channel 12: Quality Discovery / Editorial Pool
    const ratingVal = item.ratings[0]?.value ?? null;
    if (ratingVal !== null && ratingVal >= 7.6) {
      recordSource(item.canonicalId, 'quality_discovery');
    }

    // Channel 13: New and Underexposed Catalogue Items
    if (
      (item.releaseYear !== null && item.releaseYear >= 2023) ||
      (ratingVal !== null && ratingVal >= 7.2 && item.metadataCompleteness >= 0.65)
    ) {
      recordSource(item.canonicalId, 'new_underexposed');
    }
  }

  // Ensure every catalogue item has at least a fallback discovery channel so infinite scroll never starves
  const candidates: RetrievedCandidate[] = [];
  for (const item of allItems) {
    if (anchorItem && item.canonicalId === anchorItem.canonicalId) continue;
    const profile = profilesByCanonicalId.get(item.canonicalId);
    if (!profile) continue;
    const chanSet = sourcesByCanonicalId.get(item.canonicalId);
    const sources: CandidateSourceChannel[] =
      chanSet && chanSet.size > 0
        ? Array.from(chanSet)
        : ['new_underexposed'];
    candidates.push({
      item,
      profile,
      sources,
    });
  }

  return {
    candidates,
    candidateCountBySource,
  };
}
