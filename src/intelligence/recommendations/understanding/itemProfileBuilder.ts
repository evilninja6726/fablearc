import { FEATURE_PROFILE_VERSION } from '../domain/recommendation.config';
import {
  MediaUnderstandingProfile,
  NormalizedMediaItem,
  WeightedFeature,
} from '../domain/recommendation.types';
import { extractSignificantKeywords, extractTermFrequencies, normalizeWordStem } from './lexicalIndex';
import {
  CANONICAL_GENRE_TAXONOMY,
  HIERARCHICAL_TAXONOMY,
  KNOWN_TITLE_ANCHORS,
  TaxonomyNode,
} from './taxonomy';

const profileCache = new Map<string, MediaUnderstandingProfile>();

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function extractTaxonomyNodesFromText(
  text: string,
  explicitGenres: string[] = [],
): WeightedFeature[] {
  const lower = (text || '').toLowerCase();
  const stems = new Set(extractSignificantKeywords(text));
  const explicitGenresLower = new Set(explicitGenres.map((g) => g.toLowerCase()));
  const features: WeightedFeature[] = [];

  for (const node of HIERARCHICAL_TAXONOMY) {
    let phraseHits = 0;
    let tokenHits = 0;

    for (const phrase of node.phrases) {
      if (lower.includes(phrase.toLowerCase())) {
        phraseHits += 1;
      }
    }

    for (const token of node.tokens) {
      const tokenLower = token.toLowerCase();
      if (tokenLower.includes(' ') || tokenLower.includes('-')) {
        if (lower.includes(tokenLower)) {
          tokenHits += 1;
        }
      } else {
        const stem = normalizeWordStem(tokenLower);
        if (
          stems.has(stem) ||
          new RegExp(`\\b${escapeRegex(tokenLower)}\\b`, 'i').test(lower)
        ) {
          tokenHits += 1;
        }
      }
    }

    if (phraseHits === 0 && tokenHits === 0) continue;

    let parentGenreOverlap = 0;
    for (const pg of node.parentGenres) {
      if (explicitGenresLower.has(pg.toLowerCase())) {
        parentGenreOverlap += 1;
      }
    }

    const rawScore = phraseHits * 0.55 + tokenHits * 0.28 + parentGenreOverlap * 0.15;
    const weight = Math.min(1, Math.round(Math.max(0.25, rawScore) * 100) / 100);
    const confidence = Math.min(
      0.98,
      Math.round(
        (phraseHits > 0 ? 0.78 + Math.min(0.18, tokenHits * 0.06) : 0.52 + Math.min(0.32, tokenHits * 0.12)) *
          100,
      ) / 100,
    );

    features.push({
      id: node.id,
      label: node.label,
      dimension: node.dimension,
      weight,
      confidence,
      source: phraseHits > 0 ? 'taxonomy_phrase' : 'taxonomy_token',
    });
  }

  return features.sort((a, b) => b.weight * b.confidence - a.weight * a.confidence);
}

export function buildMediaUnderstandingProfile(
  item: NormalizedMediaItem,
): MediaUnderstandingProfile {
  const hashInput = `${item.title}|${item.releaseYear ?? ''}|${item.genres.join(',')}|${item.synopsis.slice(0, 160)}`;
  const cached = profileCache.get(item.canonicalId);
  if (cached && cached.normalizedFeatureHash === hashInput) {
    return cached;
  }

  // 1. Canonical Genres from explicit metadata
  const genres: WeightedFeature[] = [];
  const seenGenreIds = new Set<string>();
  for (const rawG of item.genres) {
    const gLower = rawG.trim().toLowerCase();
    const matchedCanonical = CANONICAL_GENRE_TAXONOMY.find(
      (cg) =>
        cg.genre.toLowerCase() === gLower ||
        cg.synonyms.some((s) => s.toLowerCase() === gLower),
    );
    const canonicalLabel = matchedCanonical ? matchedCanonical.genre : rawG.trim();
    const genreId = `genre:${canonicalLabel.toLowerCase().replace(/\s+/g, '-')}`;
    if (!seenGenreIds.has(genreId)) {
      seenGenreIds.add(genreId);
      genres.push({
        id: genreId,
        label: canonicalLabel,
        dimension: 'genre',
        weight: 1.0,
        confidence: 1.0,
        source: 'metadata',
      });
    }
  }

  // 2. Extract Taxonomy Features from Title + Synopsis + Awards
  const combinedText = `${item.title} ${item.synopsis} ${item.awardsText || ''}`;
  const extracted = extractTaxonomyNodesFromText(combinedText, item.genres);

  // 3. Enrich with Known Title Anchor knowledge if this item matches a known iconic anchor
  const knownAnchor = KNOWN_TITLE_ANCHORS.find(
    (a) =>
      a.aliases.includes(item.normalizedTitle) ||
      a.canonicalTitle.toLowerCase() === item.title.toLowerCase(),
  );
  if (knownAnchor) {
    const existingIds = new Set(extracted.map((f) => f.id));
    for (const taxId of knownAnchor.taxonomyIds) {
      const cleanId = taxId.trim();
      if (existingIds.has(cleanId)) continue;
      const node: TaxonomyNode | undefined = HIERARCHICAL_TAXONOMY.find((n) => n.id === cleanId);
      if (node) {
        extracted.push({
          id: node.id,
          label: node.label,
          dimension: node.dimension,
          weight: 0.9,
          confidence: 0.92,
          source: 'anchor_knowledge',
        });
      }
    }
  }

  const subgenres = extracted.filter((f) => f.dimension === 'subgenre');
  const themes = extracted.filter((f) => f.dimension === 'theme');
  const narrativeTraits = extracted.filter((f) => f.dimension === 'narrative_mechanic');
  const tones = extracted.filter((f) => f.dimension === 'tone');
  const settings = extracted.filter((f) => f.dimension === 'setting');
  const pacing = extracted.filter((f) => f.dimension === 'pacing');
  const characterDynamics = extracted.filter((f) => f.dimension === 'character_dynamic');
  const contentSignals = extracted.filter((f) => f.dimension === 'content_signal');

  // Concepts combine subgenres, narrative mechanics, themes, and settings
  const concepts = [...subgenres, ...narrativeTraits, ...themes, ...settings].sort(
    (a, b) => b.weight * b.confidence - a.weight * a.confidence,
  );

  // Lexical terms
  const tfMap = extractTermFrequencies(`${item.title} ${item.synopsis}`);
  const lexicalTerms: Array<{ term: string; tf: number; weight: number }> = [];
  tfMap.forEach((tf, term) => {
    lexicalTerms.push({
      term,
      tf,
      weight: Math.min(1, 0.35 + Math.log1p(tf) * 0.4),
    });
  });

  const profile: MediaUnderstandingProfile = {
    canonicalId: item.canonicalId,
    genres,
    subgenres,
    themes,
    concepts,
    tones,
    settings,
    pacing,
    narrativeTraits,
    characterDynamics,
    contentSignals,
    lexicalTerms,
    conceptIds: extracted.map((f) => f.id),
    normalizedFeatureHash: hashInput,
    profileVersion: FEATURE_PROFILE_VERSION,
    generatedAt: new Date().toISOString(),
  };

  profileCache.set(item.canonicalId, profile);
  return profile;
}

export function clearProfileCache(): void {
  profileCache.clear();
}
