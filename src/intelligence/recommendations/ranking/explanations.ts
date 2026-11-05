import {
  BuiltUserTasteProfile,
  MediaUnderstandingProfile,
  NormalizedMediaItem,
  RecommendationIntent,
  RecommendationReason,
} from '../domain/recommendation.types';
import { HIERARCHICAL_TAXONOMY } from '../understanding/taxonomy';

const SHORT_LABEL_BY_TAXONOMY_ID: Record<string, string> = {
  'subgenre:psychological-thriller': 'Psychological Thriller',
  'subgenre:hard-sci-fi': 'Hard Sci-Fi',
  'subgenre:space-opera': 'Deep Space & Cosmos',
  'subgenre:dystopian-apocalyptic': 'Post-Apocalyptic Survival',
  'subgenre:cyberpunk-ai': 'Cyberpunk & AI',
  'subgenre:vampire-slasher-gore': 'Dark Vampire & Horror',
  'subgenre:folk-cosmic-horror': 'Cosmic & Folk Horror',
  'subgenre:heist-caper': 'High-Stakes Heist',
  'subgenre:neo-noir-detective': 'Detective Mystery',
  'subgenre:gangster-underworld': 'Crime Underworld',
  'subgenre:dark-fantasy': 'Dark & Epic Fantasy',
  'subgenre:martial-arts': 'Martial Arts Combat',
  'subgenre:war-espionage': 'War & Espionage',
  'subgenre:survival-disaster': 'Extreme Survival',
  'theme:isolation': 'Isolation & Solitude',
  'theme:identity-memory': 'Identity & Consciousness',
  'theme:survival': 'Survival Stakes',
  'theme:revenge-justice': 'Revenge & Justice',
  'theme:political-corruption': 'Political Intrigue',
  'theme:grief-sacrifice': 'Emotional Sacrifice',
  'theme:family-love': 'Heartfelt Drama',
  'mechanic:time-loop-travel': 'Time Loop & Paradox',
  'mechanic:twist-unreliable': 'Twist-Driven Mystery',
  'mechanic:whodunit-investigation': 'Whodunit Investigation',
  'mechanic:prison-escape': 'Confinement & Escape',
  'tone:dark-bleak': 'Dark & Bleak Tone',
  'tone:disturbing-intense': 'Intense & Visceral',
  'tone:cerebral-philosophical': 'Cerebral & Thought-Provoking',
  'tone:grounded-realistic': 'Grounded & Realistic',
  'tone:lighthearted-uplifting': 'Lighthearted & Feel-Good',
  'tone:tense-suspenseful': 'Gripping Suspense',
  'pacing:slow-burn': 'Slow-Burn Pacing',
  'pacing:fast-action': 'Fast-Paced Action',
};

function getShortTaxonomyLabel(id: string): string {
  if (SHORT_LABEL_BY_TAXONOMY_ID[id]) return SHORT_LABEL_BY_TAXONOMY_ID[id];
  const node = HIERARCHICAL_TAXONOMY.find((n) => n.id === id);
  return node ? node.label : id;
}

export function buildEvidenceBasedExplanations(params: {
  item: NormalizedMediaItem;
  profile: MediaUnderstandingProfile;
  intent: RecommendationIntent;
  userProfile: BuiltUserTasteProfile;
  anchorItem?: NormalizedMediaItem;
  anchorProfile?: MediaUnderstandingProfile;
  featureContributions: Record<
    string,
    { rawValue: number | null; normalizedValue: number | null; contribution: number; confidence: number }
  >;
}): {
  reasons: RecommendationReason[];
  primaryReasonLabel: string;
} {
  const {
    item,
    profile,
    intent,
    userProfile,
    anchorItem,
    anchorProfile,
    featureContributions,
  } = params;

  const reasons: RecommendationReason[] = [];

  // 1. Check Shared Director / Creator (only if verified from actual metadata)
  if (anchorItem && anchorItem.directors.length > 0 && item.directors.length > 0) {
    const sharedDir = item.directors.find((d) =>
      anchorItem.directors.some((ad) => ad.toLowerCase() === d.toLowerCase()),
    );
    if (sharedDir) {
      reasons.push({
        code: 'shared_director',
        label: `Directed by ${sharedDir}`,
        contribution: featureContributions.creatorCast?.contribution ?? 0.08,
        confidence: 1.0,
        evidence: [sharedDir],
        source: 'metadata',
      });
    }
  }

  // 2. Check Title Anchor + Contrast Match ("Like Interstellar, but darker")
  if (intent.titleAnchors && intent.titleAnchors.length > 0) {
    const simAnchor = intent.titleAnchors.find((a) => a.relationship === 'similar_to');
    if (
      simAnchor &&
      (featureContributions.anchorSimilarity?.normalizedValue ?? 0) >= 0.35
    ) {
      const matchedTone = (intent.tones || [])
        .filter((t) => t.polarity === 'include')
        .map((t) => profile.tones.find((pt) => pt.id === t.value && pt.confidence >= 0.65))
        .find(Boolean);
      const matchedPacing = (intent.pacing || [])
        .filter((p) => p.polarity === 'include')
        .map((p) => profile.pacing.find((pp) => pp.id === p.value && pp.confidence >= 0.65))
        .find(Boolean);

      if (matchedTone) {
        reasons.push({
          code: 'anchor_with_tone',
          label: `Like ${simAnchor.title} · ${getShortTaxonomyLabel(matchedTone.id)}`,
          contribution:
            (featureContributions.anchorSimilarity?.contribution ?? 0) +
            (featureContributions.toneAtmosphere?.contribution ?? 0),
          confidence: matchedTone.confidence,
          evidence: [simAnchor.title, matchedTone.label],
          source: 'semantic_model',
        });
      } else if (matchedPacing) {
        reasons.push({
          code: 'anchor_with_pacing',
          label: `Like ${simAnchor.title} · ${getShortTaxonomyLabel(matchedPacing.id)}`,
          contribution:
            (featureContributions.anchorSimilarity?.contribution ?? 0) +
            (featureContributions.narrative?.contribution ?? 0),
          confidence: matchedPacing.confidence,
          evidence: [simAnchor.title, matchedPacing.label],
          source: 'semantic_model',
        });
      } else {
        reasons.push({
          code: 'anchor_similarity',
          label: `Similar themes to ${simAnchor.title}`,
          contribution: featureContributions.anchorSimilarity?.contribution ?? 0.15,
          confidence: 0.85,
          evidence: [simAnchor.title],
          source: 'semantic_model',
        });
      }
    }
  }

  // 3. Check High-Confidence Concept / Narrative / Theme Matches
  const targetConceptIds = new Set<string>([
    ...(intent.subgenres || []).filter((s) => s.polarity === 'include').map((s) => s.value),
    ...(intent.narrativeTraits || []).filter((n) => n.polarity === 'include').map((n) => n.value),
    ...(intent.themes || []).filter((t) => t.polarity === 'include').map((t) => t.value),
    ...(intent.concepts || []).filter((c) => c.polarity === 'include').map((c) => c.value),
    ...(anchorProfile ? anchorProfile.conceptIds : []),
  ]);

  const matchedHighConfConcepts = profile.concepts.filter(
    (c) => targetConceptIds.has(c.id) && c.confidence >= 0.6,
  );
  if (matchedHighConfConcepts.length > 0) {
    const topTwo = matchedHighConfConcepts.slice(0, 2);
    const label = topTwo.map((c) => getShortTaxonomyLabel(c.id)).join(' · ');
    reasons.push({
      code: 'concept_match',
      label,
      contribution:
        (featureContributions.semanticConcept?.contribution ?? 0) +
        (featureContributions.thematic?.contribution ?? 0),
      confidence: topTwo[0].confidence,
      evidence: topTwo.map((c) => c.label),
      source: 'semantic_model',
    });
  }

  // 4. Check Tone / Pacing Match when explicitly requested
  const requestedTones = new Set(
    (intent.tones || []).filter((t) => t.polarity === 'include').map((t) => t.value),
  );
  const requestedPacing = new Set(
    (intent.pacing || []).filter((p) => p.polarity === 'include').map((p) => p.value),
  );
  const matchedTones = [
    ...profile.tones.filter((t) => requestedTones.has(t.id) && t.confidence >= 0.6),
    ...profile.pacing.filter((p) => requestedPacing.has(p.id) && p.confidence >= 0.6),
  ];
  if (matchedTones.length > 0 && reasons.length < 2) {
    reasons.push({
      code: 'tone_pacing_match',
      label: matchedTones
        .slice(0, 2)
        .map((t) => getShortTaxonomyLabel(t.id))
        .join(' · '),
      contribution: featureContributions.toneAtmosphere?.contribution ?? 0.08,
      confidence: matchedTones[0].confidence,
      evidence: matchedTones.map((t) => t.label),
      source: 'semantic_model',
    });
  }

  // 5. Check Local Personalization Affinity (grounded in real local likes/watchlist)
  if (
    userProfile.hasSignals &&
    (featureContributions.longTermTaste?.normalizedValue ?? 0) >= 0.45
  ) {
    const matchedUserConcept = profile.concepts.find(
      (c) => (userProfile.positiveFeatureWeights.get(c.id) ?? 0) >= 2.5 && c.confidence >= 0.65,
    );
    if (matchedUserConcept) {
      reasons.push({
        code: 'local_taste_affinity',
        label: `Matches your taste in ${getShortTaxonomyLabel(matchedUserConcept.id)}`,
        contribution: featureContributions.longTermTaste?.contribution ?? 0.1,
        confidence: matchedUserConcept.confidence,
        evidence: [matchedUserConcept.label],
        source: 'local interaction-derived',
      });
    }
  }

  // 6. Check Structured Genre + Era / Rating Match
  const requestedGenres = new Set(
    (intent.genres || [])
      .filter((g) => g.polarity === 'include')
      .map((g) => g.value.toLowerCase()),
  );
  const matchedGenres = item.genres.filter((g) => requestedGenres.has(g.toLowerCase()));
  if (matchedGenres.length > 0) {
    const yearSuffix =
      intent.yearRange && item.releaseYear !== null ? ` · ${item.releaseYear}` : '';
    reasons.push({
      code: 'structured_genre_era',
      label: `${matchedGenres.slice(0, 2).join(' & ')}${yearSuffix}`,
      contribution: featureContributions.intentStructured?.contribution ?? 0.1,
      confidence: 1.0,
      evidence: matchedGenres,
      source: 'metadata',
    });
  }

  // 7. Check Hidden Gem / Acclaimed Discovery
  if (
    intent.qualityPreference === 'hidden_gems' &&
    (featureContributions.noveltyDiscovery?.normalizedValue ?? 0) >= 0.5
  ) {
    const topGenre = item.genres[0] || 'Cinema';
    reasons.push({
      code: 'hidden_gem',
      label: `Underrated ${topGenre} Pick`,
      contribution: featureContributions.noveltyDiscovery?.contribution ?? 0.08,
      confidence: 0.85,
      evidence: [topGenre],
      source: 'editorial',
    });
  }

  // Fallback honest metadata reason if none of the specific triggers fired
  if (reasons.length === 0) {
    const highConfConcept = profile.concepts.find((c) => c.confidence >= 0.72);
    if (highConfConcept) {
      reasons.push({
        code: 'profile_concept',
        label: getShortTaxonomyLabel(highConfConcept.id),
        contribution: 0.05,
        confidence: highConfConcept.confidence,
        evidence: [highConfConcept.label],
        source: 'semantic_model',
      });
    } else if (item.genres.length > 0) {
      const yearPart = item.releaseYear ? ` · ${item.releaseYear}` : '';
      reasons.push({
        code: 'genre_metadata',
        label: `${item.genres.slice(0, 2).join(' · ')}${yearPart}`,
        contribution: 0.05,
        confidence: 1.0,
        evidence: item.genres.slice(0, 2),
        source: 'metadata',
      });
    } else {
      reasons.push({
        code: 'catalogue_discovery',
        label: item.type === 'series' ? 'Featured Series' : 'Featured Film',
        contribution: 0.02,
        confidence: 1.0,
        source: 'editorial',
      });
    }
  }

  return {
    reasons,
    primaryReasonLabel: reasons[0].label,
  };
}
