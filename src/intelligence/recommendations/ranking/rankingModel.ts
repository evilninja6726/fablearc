import {
  BAYESIAN_QUALITY_CONFIG,
  RANKING_WEIGHTS_BY_MODE,
} from '../domain/recommendation.config';
import {
  BuiltUserTasteProfile,
  CandidateScoreBreakdown,
  MediaUnderstandingProfile,
  NormalizedMediaItem,
  RecommendationIntent,
  WeightedFeature,
} from '../domain/recommendation.types';
import { evaluateHardConstraints } from '../intent/intentConstraints';
import { RetrievedCandidate } from '../retrieval/candidateGenerator';
import { LexicalCorpusIndex } from '../understanding/lexicalIndex';
import { KNOWN_TITLE_ANCHORS } from '../understanding/taxonomy';
import { buildEvidenceBasedExplanations } from './explanations';

export interface RankedCandidateResult {
  candidate: RetrievedCandidate;
  breakdown: CandidateScoreBreakdown;
  primaryReasonLabel: string;
}

/**
 * Bayesian shrinkage quality estimate (Section 4.8).
 * Never fabricates a 6.2 rating when rating is missing; returns null raw/normalized values with 0 confidence.
 */
export function computeBayesianQualityPrior(item: NormalizedMediaItem): {
  rawValue: number | null;
  normalizedValue: number | null;
  confidence: number;
} {
  const ratingObj = item.ratings.find((r) => r.source === 'imdb') || item.ratings[0];
  if (!ratingObj || !Number.isFinite(ratingObj.value) || ratingObj.value <= 0) {
    return {
      rawValue: null,
      normalizedValue: null,
      confidence: 0,
    };
  }

  const R = ratingObj.value;
  const v =
    ratingObj.voteCount !== null && ratingObj.voteCount > 0
      ? ratingObj.voteCount
      : BAYESIAN_QUALITY_CONFIG.assumedVotesWhenMissingCount;
  const m = BAYESIAN_QUALITY_CONFIG.priorStrengthVotes;
  const C = BAYESIAN_QUALITY_CONFIG.catalogueMeanRating;

  const adjusted = (v / (v + m)) * R + (m / (v + m)) * C;
  const normalized = Math.max(0, Math.min(1, (adjusted - 4.0) / 5.5));
  const confidence = ratingObj.voteCount !== null ? Math.min(1, v / (v + m)) : 0.65;

  return {
    rawValue: Math.round(adjusted * 100) / 100,
    normalizedValue: Math.round(normalized * 1000) / 1000,
    confidence: Math.round(confidence * 100) / 100,
  };
}

function computeWeightedFeatureOverlap(
  targetIds: Set<string>,
  candidateFeatures: WeightedFeature[],
): { score: number; confidence: number } {
  if (targetIds.size === 0 || candidateFeatures.length === 0) {
    return { score: 0, confidence: 0 };
  }

  let matchedWeightSum = 0;
  let confidenceSum = 0;
  let matchCount = 0;

  for (const feat of candidateFeatures) {
    if (targetIds.has(feat.id)) {
      matchedWeightSum += feat.weight * feat.confidence;
      confidenceSum += feat.confidence;
      matchCount += 1;
    }
  }

  if (matchCount === 0) return { score: 0, confidence: 0 };

  // Normalize by min(targetIds.size, 3) so items don't need 10 simultaneous tags to reach 1.0
  const normDenom = Math.max(1, Math.min(targetIds.size, 2.5) * 0.78);
  const score = Math.min(1, matchedWeightSum / normDenom);
  const avgConfidence = confidenceSum / matchCount;

  return {
    score: Math.round(score * 1000) / 1000,
    confidence: Math.round(avgConfidence * 100) / 100,
  };
}

export function scoreAndRankCandidates(params: {
  candidates: RetrievedCandidate[];
  intent: RecommendationIntent;
  userProfile: BuiltUserTasteProfile;
  lexicalIndex: LexicalCorpusIndex;
  allProfilesByCanonicalId: Map<string, MediaUnderstandingProfile>;
  anchorItem?: NormalizedMediaItem;
  anchorProfile?: MediaUnderstandingProfile;
  explicitUiMediaFilter?: 'all' | 'movie' | 'series';
}): {
  ranked: RankedCandidateResult[];
  filteredOutCount: number;
} {
  const {
    candidates,
    intent,
    userProfile,
    lexicalIndex,
    allProfilesByCanonicalId,
    anchorItem,
    anchorProfile,
    explicitUiMediaFilter = 'all',
  } = params;

  const weights = RANKING_WEIGHTS_BY_MODE[intent.requestMode];
  const hasQueryText = intent.originalText.trim().length > 0;
  const rawQueryLower = intent.originalText.trim().toLowerCase();

  // Target positive sets from intent + anchorItem
  const targetGenresLower = new Set<string>([
    ...(intent.genres || [])
      .filter((g) => g.polarity === 'include')
      .map((g) => g.value.toLowerCase()),
    ...(anchorItem ? anchorItem.genres.map((g) => g.toLowerCase()) : []),
  ]);

  const targetConceptIds = new Set<string>([
    ...(intent.subgenres || []).filter((s) => s.polarity === 'include').map((s) => s.value),
    ...(intent.concepts || []).filter((c) => c.polarity === 'include').map((c) => c.value),
    ...(intent.settings || []).filter((s) => s.polarity === 'include').map((s) => s.value),
    ...(anchorProfile ? anchorProfile.subgenres.map((s) => s.id) : []),
    ...(anchorProfile ? anchorProfile.settings.map((s) => s.id) : []),
  ]);

  const targetThemeIds = new Set<string>([
    ...(intent.themes || []).filter((t) => t.polarity === 'include').map((t) => t.value),
    ...(anchorProfile ? anchorProfile.themes.map((t) => t.id) : []),
  ]);

  const targetNarrativeIds = new Set<string>([
    ...(intent.narrativeTraits || []).filter((n) => n.polarity === 'include').map((n) => n.value),
    ...(intent.pacing || []).filter((p) => p.polarity === 'include').map((p) => p.value),
    ...(anchorProfile ? anchorProfile.narrativeTraits.map((n) => n.id) : []),
    ...(anchorProfile ? anchorProfile.pacing.map((p) => p.id) : []),
  ]);

  const targetToneIds = new Set<string>([
    ...(intent.tones || []).filter((t) => t.polarity === 'include').map((t) => t.value),
    ...(anchorProfile ? anchorProfile.tones.map((t) => t.id) : []),
  ]);

  // Soft negative sets ("less disturbing", "not too violent", "not necessarily the science fiction")
  const softExcludedGenresLower = new Set<string>(
    (intent.genres || [])
      .filter((g) => g.polarity === 'exclude' && g.strength === 'soft')
      .map((g) => g.value.toLowerCase()),
  );
  const softExcludedFeatureIds = new Set<string>([
    ...(intent.tones || [])
      .filter((t) => t.polarity === 'exclude' && t.strength === 'soft')
      .map((t) => t.value),
    ...(intent.themes || [])
      .filter((t) => t.polarity === 'exclude' && t.strength === 'soft')
      .map((t) => t.value),
    ...(intent.concepts || [])
      .filter((c) => c.polarity === 'exclude' && c.strength === 'soft')
      .map((c) => c.value),
    ...(intent.contentExclusions || [])
      .filter((c) => c.polarity === 'exclude' && c.strength === 'soft')
      .map((c) => c.value),
  ]);

  // Title Anchor feature union (from KNOWN_TITLE_ANCHORS or catalogue anchor)
  const anchorFeatureIds = new Set<string>();
  const anchorGenreLower = new Set<string>();
  if (intent.titleAnchors && intent.titleAnchors.length > 0) {
    for (const anchor of intent.titleAnchors) {
      if (anchor.relationship !== 'similar_to') continue;
      const known = KNOWN_TITLE_ANCHORS.find(
        (k) => k.canonicalTitle.toLowerCase() === anchor.title.toLowerCase(),
      );
      if (known) {
        known.taxonomyIds.forEach((id) => anchorFeatureIds.add(id.trim()));
        known.genres.forEach((g) => anchorGenreLower.add(g.toLowerCase()));
      }
      if (anchor.canonicalId) {
        const catProf = allProfilesByCanonicalId.get(anchor.canonicalId);
        if (catProf) {
          catProf.conceptIds.forEach((id) => anchorFeatureIds.add(id));
          catProf.genres.forEach((g) => anchorGenreLower.add(g.label.toLowerCase()));
        }
      }
    }
  }
  if (anchorItem && anchorProfile) {
    anchorProfile.conceptIds.forEach((id) => anchorFeatureIds.add(id));
    anchorItem.genres.forEach((g) => anchorGenreLower.add(g.toLowerCase()));
  }

  const anchorDirectorsLower = new Set(
    (anchorItem?.directors || []).map((d) => d.toLowerCase()),
  );
  const anchorCastLower = new Set((anchorItem?.cast || []).map((c) => c.toLowerCase()));
  const anchorFranchiseSet = new Set(anchorItem?.franchiseIds || []);

  const queryLexicalTerms = [
    ...(intent.lexicalTerms || []),
    ...(anchorProfile ? anchorProfile.lexicalTerms.slice(0, 10).map((t) => t.term) : []),
  ];

  const ranked: RankedCandidateResult[] = [];
  let filteredOutCount = 0;

  for (const candidate of candidates) {
    const { item, profile, sources } = candidate;

    // 1. Evaluate Hard Constraints FIRST (Section 3, Principle 3)
    const hardCheck = evaluateHardConstraints(
      intent,
      item,
      profile,
      explicitUiMediaFilter,
    );
    if (!hardCheck.passed) {
      filteredOutCount += 1;
      continue;
    }

    // Also exclude explicitly disliked / "not interested" items from local preferences
    if (userProfile.dislikedItemIds.has(item.canonicalId)) {
      filteredOutCount += 1;
      continue;
    }

    // 2. Compute Bounded [0, 1] Feature Scores
    // (a) Intent Structured (Genre Query Coverage + Jaccard + Year Proximity + Media Type Match)
    let genreSim = 0;
    if (targetGenresLower.size > 0 && item.genres.length > 0) {
      let intersection = 0;
      for (const g of item.genres) {
        if (targetGenresLower.has(g.toLowerCase())) {
          intersection += 1;
        }
      }
      const union = new Set([
        ...Array.from(targetGenresLower),
        ...item.genres.map((g) => g.toLowerCase()),
      ]).size;
      const jaccard = union > 0 ? intersection / union : 0;
      const recall = intersection / Math.min(targetGenresLower.size, 3);
      genreSim = Math.min(1, recall * 0.82 + jaccard * 0.18);
    }

    let yearSim = 0.5;
    let yearConf = 0;
    const refYear = anchorItem?.releaseYear ?? null;
    if (intent.yearRange && item.releaseYear !== null) {
      yearConf = 1;
      const min = intent.yearRange.min ?? 1900;
      const max = intent.yearRange.max ?? 2035;
      if (item.releaseYear >= min && item.releaseYear <= max) {
        yearSim = 1.0;
      } else {
        const dist = Math.min(
          Math.abs(item.releaseYear - min),
          Math.abs(item.releaseYear - max),
        );
        yearSim = Math.max(0, 1 - dist / 12);
      }
    } else if (refYear !== null && item.releaseYear !== null) {
      yearConf = 0.9;
      const diff = Math.abs(refYear - item.releaseYear);
      yearSim = Math.max(0, 1 - diff / 18);
    }

    let typeMatchScore = 0.5;
    if (anchorItem) {
      typeMatchScore = item.type === anchorItem.type ? 1.0 : 0.25;
    } else if (intent.mediaTypes && intent.mediaTypes.length > 0) {
      typeMatchScore = intent.mediaTypes.includes(item.type) ? 1.0 : 0.2;
    }

    const intentStructuredScore = Math.min(
      1,
      genreSim * 0.65 + (yearConf > 0 ? yearSim * 0.2 : 0.1) + typeMatchScore * 0.15,
    );

    // (b) Semantic Concept Similarity (Subgenres + Concepts + Settings)
    const semanticOverlap = computeWeightedFeatureOverlap(targetConceptIds, [
      ...profile.subgenres,
      ...profile.settings,
      ...profile.concepts,
    ]);

    // (c) Lexical BM25 + Title Match
    let lexicalScore = lexicalIndex.scoreBm25(
      item.canonicalId,
      queryLexicalTerms,
      intent.originalText,
    );
    if (
      hasQueryText &&
      rawQueryLower.length >= 3 &&
      item.title.toLowerCase().includes(rawQueryLower)
    ) {
      lexicalScore = Math.min(1, lexicalScore + 0.65);
    }

    // (d) Thematic Similarity
    const thematicOverlap = computeWeightedFeatureOverlap(targetThemeIds, profile.themes);

    // (e) Narrative & Pacing Similarity
    const narrativeOverlap = computeWeightedFeatureOverlap(targetNarrativeIds, [
      ...profile.narrativeTraits,
      ...profile.pacing,
    ]);

    // (f) Tone & Atmosphere Similarity
    const toneOverlap = computeWeightedFeatureOverlap(targetToneIds, profile.tones);

    // (g) Anchor Similarity ("Like Interstellar, but darker", or Details-page target item)
    let anchorSimScore = 0;
    let anchorSimConf = 0;
    if (anchorFeatureIds.size > 0 || anchorGenreLower.size > 0) {
      const featMatch = computeWeightedFeatureOverlap(anchorFeatureIds, [
        ...profile.subgenres,
        ...profile.themes,
        ...profile.narrativeTraits,
        ...profile.tones,
        ...profile.settings,
      ]);
      let anchorGenreHits = 0;
      for (const g of item.genres) {
        if (anchorGenreLower.has(g.toLowerCase())) anchorGenreHits += 1;
      }
      const gOverlap =
        anchorGenreLower.size > 0
          ? Math.min(1, anchorGenreHits / Math.min(anchorGenreLower.size, 3))
          : 0;
      anchorSimScore = Math.min(1, featMatch.score * 0.72 + gOverlap * 0.28);
      anchorSimConf = Math.max(featMatch.confidence, anchorGenreHits > 0 ? 0.8 : 0);
    }

    // (h) Shared Creator / Director / Cast (normalized so huge cast lists don't dominate)
    let creatorCastScore = 0;
    if (anchorDirectorsLower.size > 0 || anchorCastLower.size > 0) {
      let dirHits = 0;
      for (const d of item.directors) {
        if (anchorDirectorsLower.has(d.toLowerCase())) dirHits += 1;
      }
      let castHits = 0;
      for (const c of item.cast.slice(0, 8)) {
        if (anchorCastLower.has(c.toLowerCase())) castHits += 1;
      }
      const dirScore = dirHits > 0 ? 0.7 : 0;
      const castScore = Math.min(0.5, castHits * 0.25);
      creatorCastScore = Math.min(1, dirScore + castScore);
    }

    // (i) Franchise Relationship
    let franchiseScore = 0;
    if (anchorFranchiseSet.size > 0 && item.franchiseIds.length > 0) {
      if (item.franchiseIds.some((f) => anchorFranchiseSet.has(f))) {
        franchiseScore = 1.0;
      }
    }

    // (j) Local Long-Term & Session Taste Affinity
    let longTermTasteScore = 0;
    let sessionTasteScore = 0;
    if (userProfile.hasSignals && userProfile.personalizationEnabled) {
      let posSum = 0;
      let sessSum = 0;
      const allItemFeatures = [
        ...profile.genres,
        ...profile.subgenres,
        ...profile.themes,
        ...profile.narrativeTraits,
        ...profile.tones,
      ];
      for (const f of allItemFeatures) {
        posSum += (userProfile.positiveFeatureWeights.get(f.id) ?? 0) * f.weight;
        sessSum += (userProfile.sessionFeatureWeights.get(f.id) ?? 0) * f.weight;
      }
      for (const d of item.directors) {
        posSum += userProfile.preferredDirectors.get(d.toLowerCase()) ?? 0;
      }
      for (const c of item.cast.slice(0, 4)) {
        posSum += userProfile.preferredCast.get(c.toLowerCase()) ?? 0;
      }
      longTermTasteScore = Math.min(1, posSum / 14);
      sessionTasteScore = Math.min(1, sessSum / 8);
    }

    // (k) Bayesian Quality Prior (neutral when rating is missing so missing ratings are neither boosted nor penalized)
    const qualityPrior = computeBayesianQualityPrior(item);
    const effectiveQualityNorm =
      qualityPrior.normalizedValue !== null ? qualityPrior.normalizedValue : 0.48;

    // (l) Novelty / Discovery Score ("hidden gems", "underrated", "surprise me")
    let noveltyScore = 0.35;
    const isUnwatched = !userProfile.watchedItemIds.has(item.canonicalId);
    if (intent.qualityPreference === 'hidden_gems') {
      const rVal = qualityPrior.rawValue;
      // Underrated / hidden gem sweet spot: strong quality (7.0-8.3) and not already watched
      if (rVal !== null && rVal >= 7.0 && rVal <= 8.4 && isUnwatched) {
        noveltyScore = 0.92;
      } else if (isUnwatched && item.metadataCompleteness >= 0.6) {
        noveltyScore = 0.65;
      }
    } else if (intent.noveltyPreference === 'exploratory') {
      noveltyScore = isUnwatched ? 0.8 : 0.2;
    } else if (!hasQueryText && item.releaseYear !== null && item.releaseYear >= 2022) {
      noveltyScore = Math.min(1, 0.45 + (item.releaseYear - 2021) * 0.12);
    }

    // (m) Soft Negative Preference & User Dislike Conflict Penalty
    let negativeConflictScore = 0;
    for (const g of item.genres) {
      if (softExcludedGenresLower.has(g.toLowerCase())) {
        negativeConflictScore += 0.45;
      }
    }
    for (const cid of profile.conceptIds) {
      if (softExcludedFeatureIds.has(cid)) {
        negativeConflictScore += 0.55;
      }
      if (userProfile.hasSignals) {
        const negW = userProfile.negativeFeatureWeights.get(cid) ?? 0;
        if (negW > 0) {
          negativeConflictScore += Math.min(0.4, negW / 12);
        }
      }
    }
    for (const tone of profile.tones) {
      if (softExcludedFeatureIds.has(tone.id)) {
        negativeConflictScore += 0.55 * tone.confidence;
      }
    }
    negativeConflictScore = Math.min(1, negativeConflictScore);

    // (n) Repetition Penalty (recent impressions or already watched on discovery surface)
    let repetitionScore = 0;
    if (userProfile.recentImpressionIds.has(item.canonicalId)) {
      repetitionScore += 0.5;
    }
    if (
      userProfile.watchedItemIds.has(item.canonicalId) &&
      (intent.requestMode === 'quality_discovery' || intent.requestMode === 'personalized_home')
    ) {
      repetitionScore += 0.65;
    }
    repetitionScore = Math.min(1, repetitionScore);

    // 3. Combine Weighted Contributions
    const featureBreakdown: CandidateScoreBreakdown['features'] = {
      intentStructured: {
        rawValue: intentStructuredScore,
        normalizedValue: intentStructuredScore,
        contribution: weights.intentStructured * intentStructuredScore,
        confidence: 0.9,
      },
      semanticConcept: {
        rawValue: semanticOverlap.score,
        normalizedValue: semanticOverlap.score,
        contribution: weights.semanticConcept * semanticOverlap.score,
        confidence: semanticOverlap.confidence,
      },
      lexicalBm25: {
        rawValue: lexicalScore,
        normalizedValue: lexicalScore,
        contribution: weights.lexicalBm25 * lexicalScore,
        confidence: lexicalScore > 0 ? 0.85 : 0,
      },
      thematic: {
        rawValue: thematicOverlap.score,
        normalizedValue: thematicOverlap.score,
        contribution: weights.thematic * thematicOverlap.score,
        confidence: thematicOverlap.confidence,
      },
      narrative: {
        rawValue: narrativeOverlap.score,
        normalizedValue: narrativeOverlap.score,
        contribution: weights.narrative * narrativeOverlap.score,
        confidence: narrativeOverlap.confidence,
      },
      toneAtmosphere: {
        rawValue: toneOverlap.score,
        normalizedValue: toneOverlap.score,
        contribution: weights.toneAtmosphere * toneOverlap.score,
        confidence: toneOverlap.confidence,
      },
      anchorSimilarity: {
        rawValue: anchorSimScore,
        normalizedValue: anchorSimScore,
        contribution: weights.anchorSimilarity * anchorSimScore,
        confidence: anchorSimConf,
      },
      creatorCast: {
        rawValue: creatorCastScore,
        normalizedValue: creatorCastScore,
        contribution: weights.creatorCast * creatorCastScore,
        confidence: creatorCastScore > 0 ? 1.0 : 0,
      },
      franchise: {
        rawValue: franchiseScore,
        normalizedValue: franchiseScore,
        contribution: weights.franchise * franchiseScore,
        confidence: franchiseScore > 0 ? 0.95 : 0,
      },
      longTermTaste: {
        rawValue: longTermTasteScore,
        normalizedValue: longTermTasteScore,
        contribution: weights.longTermTaste * longTermTasteScore,
        confidence: userProfile.hasSignals ? 0.8 : 0,
      },
      sessionTaste: {
        rawValue: sessionTasteScore,
        normalizedValue: sessionTasteScore,
        contribution: weights.sessionTaste * sessionTasteScore,
        confidence: userProfile.hasSignals ? 0.75 : 0,
      },
      qualityPrior: {
        rawValue: qualityPrior.rawValue,
        normalizedValue: qualityPrior.normalizedValue,
        contribution:
          weights.qualityPrior *
          effectiveQualityNorm *
          (qualityPrior.confidence > 0 ? 1.0 : 0.75),
        confidence: qualityPrior.confidence,
      },
      noveltyDiscovery: {
        rawValue: noveltyScore,
        normalizedValue: noveltyScore,
        contribution: weights.noveltyDiscovery * noveltyScore,
        confidence: 0.8,
      },
      negativePenalty: {
        rawValue: negativeConflictScore,
        normalizedValue: negativeConflictScore,
        contribution: -weights.negativePenalty * negativeConflictScore,
        confidence: negativeConflictScore > 0 ? 0.9 : 0,
      },
      repetitionPenalty: {
        rawValue: repetitionScore,
        normalizedValue: repetitionScore,
        contribution: -weights.repetitionPenalty * repetitionScore,
        confidence: repetitionScore > 0 ? 0.9 : 0,
      },
    };

    let totalScore = 0;
    for (const feat of Object.values(featureBreakdown)) {
      totalScore += feat.contribution;
    }

    // Metadata completeness tie-breaker adjustment (small, never overrides content match)
    totalScore += item.metadataCompleteness * 0.015;
    totalScore = Math.round(totalScore * 10000) / 10000;

    const { reasons, primaryReasonLabel } = buildEvidenceBasedExplanations({
      item,
      profile,
      intent,
      userProfile,
      anchorItem,
      anchorProfile,
      featureContributions: featureBreakdown,
    });

    ranked.push({
      candidate,
      breakdown: {
        canonicalId: item.canonicalId,
        totalScore,
        normalizedRelevance: 0, // populated after min-max normalization across pool
        features: featureBreakdown,
        candidateSources: sources,
        hardConstraintResults: hardCheck.results,
        reasons,
      },
      primaryReasonLabel,
    });
  }

  // Deterministic sort: highest totalScore first, then canonicalId for deterministic tie-breaking
  ranked.sort((a, b) => {
    const diff = b.breakdown.totalScore - a.breakdown.totalScore;
    if (Math.abs(diff) > 1e-6) return diff;
    return a.candidate.item.canonicalId.localeCompare(b.candidate.item.canonicalId);
  });

  if (ranked.length > 0) {
    const maxS = ranked[0].breakdown.totalScore;
    const minS = ranked[ranked.length - 1].breakdown.totalScore;
    const span = Math.max(0.05, maxS - minS);
    for (const entry of ranked) {
      const norm = Math.max(
        0,
        Math.min(1, (entry.breakdown.totalScore - minS) / span),
      );
      entry.breakdown.normalizedRelevance = Math.round(norm * 1000) / 1000;
    }
  }

  return {
    ranked,
    filteredOutCount,
  };
}
