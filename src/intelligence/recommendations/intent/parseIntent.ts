import { PARSER_VERSION } from '../domain/recommendation.config';
import {
  IntentPreference,
  NormalizedMediaItem,
  PreferenceStrength,
  RecommendationIntent,
  RecommendationMode,
  SlateStrategy,
} from '../domain/recommendation.types';
import { extractTaxonomyNodesFromText } from '../understanding/itemProfileBuilder';
import { extractSignificantKeywords, normalizeWordStem } from '../understanding/lexicalIndex';
import {
  CANONICAL_GENRE_TAXONOMY,
  HIERARCHICAL_TAXONOMY,
  KNOWN_TITLE_ANCHORS,
} from '../understanding/taxonomy';

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

interface ClauseSegment {
  text: string;
  polarity: 'include' | 'exclude';
  strength: PreferenceStrength;
}

/**
 * Splits a natural-language query into positive, soft-negative, and hard-negative clause segments
 * so negation words ("without", "no", "not", "avoid", "less") are never lost or inverted.
 */
export function segmentQueryClauses(rawText: string): ClauseSegment[] {
  const cleaned = rawText.trim();
  if (!cleaned) return [];

  // Split around major contrast/exclusion boundaries while keeping the trigger words
  const parts = cleaned
    .split(
      /\s*(?:,|;|\bbut\b|\bexcept\b|\brather than\b|\binstead of\b|\bwithout\b|\bavoid(?:ing)?\b|\bno\b|\bnot\b|\bless\b)\s*/i,
    )
    .filter(Boolean);

  if (parts.length <= 1) {
    return [{ text: cleaned, polarity: 'include', strength: 'strong' }];
  }

  // Re-scan using regex to preserve exact operator before each segment
  const pattern =
    /(\b(?:without|avoid(?:ing)?|never|no|not\s+too|not\s+necessarily|not\s+a|not|less|except(?:\s+for)?|rather\s+than|instead\s+of|but\s+not|but\s+less|but\s+without|but\s+more|but)\b)/gi;

  const tokens = cleaned.split(pattern);
  const segments: ClauseSegment[] = [];
  let currentPolarity: 'include' | 'exclude' = 'include';
  let currentStrength: PreferenceStrength = 'strong';
  let currentOperator = '';

  for (const piece of tokens) {
    const trimmed = piece.trim().replace(/^[,;:.]+|[,;:.]+$/g, '').trim();
    if (!trimmed) continue;

    if (pattern.test(trimmed)) {
      pattern.lastIndex = 0;
      const op = trimmed.toLowerCase().replace(/\s+/g, ' ');
      currentOperator = op;
      if (
        op === 'without' ||
        op.startsWith('avoid') ||
        op === 'never' ||
        op === 'no' ||
        op.startsWith('except') ||
        op === 'rather than' ||
        op === 'instead of' ||
        op === 'but not' ||
        op === 'but without'
      ) {
        currentPolarity = 'exclude';
        currentStrength = 'hard';
      } else if (
        op === 'not too' ||
        op === 'not necessarily' ||
        op === 'less' ||
        op === 'but less'
      ) {
        currentPolarity = 'exclude';
        currentStrength = 'soft';
      } else if (op === 'not' || op === 'not a') {
        currentPolarity = 'exclude';
        currentStrength = 'hard';
      } else if (op === 'but' || op === 'but more') {
        currentPolarity = 'include';
        currentStrength = 'strong';
      }
      continue;
    }
    pattern.lastIndex = 0;

    // A single segment like "less philosophical and more action-oriented" can have an internal "and more" switch
    if (
      currentPolarity === 'exclude' &&
      /\b(?:and\s+)?(?:more|with|keep\s+it)\s+/i.test(trimmed)
    ) {
      const subSplit = trimmed.split(/\b(?:and\s+)?(?=more\s+|with\s+|keep\s+it\s+)/i);
      if (subSplit.length >= 2) {
        segments.push({
          text: `${currentOperator} ${subSplit[0].trim()}`.trim(),
          polarity: currentPolarity,
          strength: currentStrength,
        });
        for (let i = 1; i < subSplit.length; i += 1) {
          segments.push({
            text: subSplit[i].trim(),
            polarity: 'include',
            strength: 'strong',
          });
        }
        currentPolarity = 'include';
        currentStrength = 'strong';
        currentOperator = '';
        continue;
      }
    }

    segments.push({
      text: currentOperator ? `${currentOperator} ${trimmed}` : trimmed,
      polarity: currentPolarity,
      strength: currentStrength,
    });
    // Reset to positive after a short clause unless another operator appears
    currentPolarity = 'include';
    currentStrength = 'strong';
    currentOperator = '';
  }

  return segments.length > 0
    ? segments
    : [{ text: cleaned, polarity: 'include', strength: 'strong' }];
}

const LANGUAGE_PATTERNS: Array<{ language: string; regex: RegExp }> = [
  { language: 'English', regex: /\benglish\b/i },
  { language: 'Hindi', regex: /\bhindi\b/i },
  { language: 'Korean', regex: /\bkorean\b/i },
  { language: 'Japanese', regex: /\bjapanese\b/i },
  { language: 'Spanish', regex: /\bspanish\b/i },
  { language: 'French', regex: /\bfrench\b/i },
  { language: 'German', regex: /\bgerman\b/i },
  { language: 'Italian', regex: /\bitalian\b/i },
  { language: 'Chinese', regex: /\b(?:chinese|mandarin|cantonese)\b/i },
];

export function detectTitleAnchors(
  rawText: string,
  catalogueItems: NormalizedMediaItem[] = [],
): RecommendationIntent['titleAnchors'] {
  const anchors: NonNullable<RecommendationIntent['titleAnchors']> = [];
  const lower = rawText.toLowerCase();

  // Check explicit patterns: "like [Title]", "similar to [Title]", "more ... than [Title]", "similar atmosphere to [Title]", "not like [Title]"
  const anchorPatterns: Array<{
    regex: RegExp;
    relationship: 'similar_to' | 'avoid' | 'less_like';
  }> = [
    {
      regex: /\b(?:not\s+like|nothing\s+like|unlike|avoid\s+movies\s+like)\s+([a-z0-9][a-z0-9\s:'-]{1,35}?)(?=\s*(?:,|;|\.|\bbut\b|\band\b|\bwith\b|\bwithout\b|$))/gi,
      relationship: 'avoid',
    },
    {
      regex: /\b(?:similar(?:\s+atmosphere|\s+vibe|\s+tone|\s+style)?\s+to|something\s+like|movies?\s+like|series\s+like|shows?\s+like|like|more\s+[a-z-]+\s+than)\s+([a-z0-9][a-z0-9\s:'-]{1,35}?)(?=\s*(?:,|;|\.|\bbut\b|\band\b|\bwith\b|\bwithout\b|$))/gi,
      relationship: 'similar_to',
    },
  ];

  const seenTitles = new Set<string>();

  for (const { regex, relationship } of anchorPatterns) {
    let match: RegExpExecArray | null;
    while ((match = regex.exec(rawText)) !== null) {
      const candidateRaw = match[1].trim();
      const candidateLower = candidateRaw.toLowerCase();

      // Match against known anchors first
      const known = KNOWN_TITLE_ANCHORS.find(
        (k) =>
          k.aliases.includes(candidateLower) ||
          k.canonicalTitle.toLowerCase() === candidateLower,
      );
      if (known && !seenTitles.has(known.canonicalTitle.toLowerCase())) {
        seenTitles.add(known.canonicalTitle.toLowerCase());
        const catalogHit = catalogueItems.find(
          (c) =>
            c.normalizedTitle === known.canonicalTitle.toLowerCase() ||
            c.title.toLowerCase() === known.canonicalTitle.toLowerCase(),
        );
        anchors.push({
          title: known.canonicalTitle,
          canonicalId: catalogHit?.canonicalId,
          relationship,
        });
        continue;
      }

      // Match against loaded catalogue items
      const catalogHit = catalogueItems.find(
        (c) =>
          c.title.toLowerCase() === candidateLower ||
          (c.normalizedTitle.length >= 4 && c.normalizedTitle === candidateLower),
      );
      if (catalogHit && !seenTitles.has(catalogHit.title.toLowerCase())) {
        seenTitles.add(catalogHit.title.toLowerCase());
        anchors.push({
          title: catalogHit.title,
          canonicalId: catalogHit.canonicalId,
          relationship,
        });
      }
    }
  }

  // Also check if any known anchor is mentioned by name with "like" or "than"
  for (const known of KNOWN_TITLE_ANCHORS) {
    if (seenTitles.has(known.canonicalTitle.toLowerCase())) continue;
    for (const alias of known.aliases) {
      const r = new RegExp(
        `\\b(?:like|to|than|as)\\s+${escapeRegex(alias)}\\b`,
        'i',
      );
      if (r.test(lower)) {
        seenTitles.add(known.canonicalTitle.toLowerCase());
        const catalogHit = catalogueItems.find(
          (c) =>
            c.normalizedTitle === alias ||
            c.title.toLowerCase() === known.canonicalTitle.toLowerCase(),
        );
        anchors.push({
          title: known.canonicalTitle,
          canonicalId: catalogHit?.canonicalId,
          relationship: 'similar_to',
        });
        break;
      }
    }
  }

  return anchors;
}

export function parseRecommendationIntent(
  rawText: string,
  catalogueItems: NormalizedMediaItem[] = [],
): RecommendationIntent {
  const originalText = (rawText || '').trim();
  const lower = originalText.toLowerCase();

  const genres: IntentPreference<string>[] = [];
  const subgenres: IntentPreference<string>[] = [];
  const themes: IntentPreference<string>[] = [];
  const concepts: IntentPreference<string>[] = [];
  const tones: IntentPreference<string>[] = [];
  const settings: IntentPreference<string>[] = [];
  const pacing: IntentPreference<string>[] = [];
  const narrativeTraits: IntentPreference<string>[] = [];
  const contentExclusions: IntentPreference<string>[] = [];
  const languages: IntentPreference<string>[] = [];
  const mood: string[] = [];
  const context: string[] = [];
  const unresolvedClauses: string[] = [];

  if (!originalText) {
    return {
      originalText: '',
      requestMode: 'personalized_home',
      slateStrategy: 'balanced',
      parserVersion: PARSER_VERSION,
    };
  }

  // 1. Media Type Detection (including hard exclusions like "movies only, no series" or "only completed series")
  let mediaTypes: Array<'movie' | 'series'> | undefined;
  let mediaTypeHard = false;

  const noSeries = /\b(?:no\s+(?:tv\s+)?series|no\s+shows?|movies?\s+only|only\s+movies?|just\s+movies?)\b/i.test(
    lower,
  );
  const noMovies = /\b(?:no\s+movies?|no\s+films?|(?:tv\s+)?series\s+only|only\s+(?:completed\s+)?(?:tv\s+)?series|only\s+shows?)\b/i.test(
    lower,
  );
  const mentionsSeries = /\b(series|tv show|tv shows|shows|miniseries|season|episodes)\b/i.test(
    lower,
  );
  const mentionsMovie = /\b(movie|movies|film|films|cinema)\b/i.test(lower);

  if (noSeries) {
    mediaTypes = ['movie'];
    mediaTypeHard = true;
  } else if (noMovies) {
    mediaTypes = ['series'];
    mediaTypeHard = true;
  } else if (mentionsSeries && !mentionsMovie) {
    mediaTypes = ['series'];
    mediaTypeHard = /\b(?:only)\b/i.test(lower);
  } else if (mentionsMovie && !mentionsSeries) {
    mediaTypes = ['movie'];
    mediaTypeHard = /\b(?:only)\b/i.test(lower);
  }

  // 2. Year / Era Constraint Detection
  let yearRange: RecommendationIntent['yearRange'];
  const isHardYear = /\b(only|from|between|after|since|before|prior\s+to|in)\b/i.test(lower);
  const betweenYears = lower.match(
    /\b(19\d{2}|20[0-3]\d)\s*(?:-|–|—|to|and|through)\s*(19\d{2}|20[0-3]\d)\b/,
  );
  const afterYear = lower.match(/\b(?:after|since|from|post)\s+(19\d{2}|20[0-3]\d)\b/);
  const beforeYear = lower.match(/\b(?:before|pre|prior\s+to|until)\s+(19\d{2}|20[0-3]\d)\b/);
  const decadeMatch = lower.match(/\b(1970s|70s|1980s|80s|1990s|90s|2000s|2010s|2020s)\b/);
  const singleYear = lower.match(/\b(19\d{2}|20[0-3]\d)\b/);

  // Make sure singleYear is not part of a title like "Blade Runner 2049"
  const isBladeRunner2049 = /\bblade\s+runner\s+2049\b/i.test(lower);

  if (betweenYears) {
    const y1 = Number.parseInt(betweenYears[1], 10);
    const y2 = Number.parseInt(betweenYears[2], 10);
    const min = Math.min(y1, y2);
    const max = Math.max(y1, y2);
    yearRange = { min, max, hard: true, label: `${min}–${max}` };
  } else if (afterYear) {
    const y = Number.parseInt(afterYear[1], 10);
    yearRange = { min: y, max: 2030, hard: true, label: `${y}+` };
  } else if (beforeYear) {
    const y = Number.parseInt(beforeYear[1], 10);
    yearRange = { min: 1900, max: y, hard: true, label: `Before ${y}` };
  } else if (decadeMatch) {
    const token = decadeMatch[1];
    const map: Record<string, { min: number; max: number; label: string }> = {
      '70s': { min: 1970, max: 1979, label: '1970s' },
      '1970s': { min: 1970, max: 1979, label: '1970s' },
      '80s': { min: 1980, max: 1989, label: '1980s' },
      '1980s': { min: 1980, max: 1989, label: '1980s' },
      '90s': { min: 1990, max: 1999, label: '1990s' },
      '1990s': { min: 1990, max: 1999, label: '1990s' },
      '2000s': { min: 2000, max: 2009, label: '2000s' },
      '2010s': { min: 2010, max: 2019, label: '2010s' },
      '2020s': { min: 2020, max: 2029, label: '2020s' },
    };
    if (map[token]) {
      yearRange = { ...map[token], hard: isHardYear };
    }
  } else if (singleYear && !isBladeRunner2049) {
    const y = Number.parseInt(singleYear[1], 10);
    if (/\b(?:only|in|from)\s+(19\d{2}|20[0-3]\d)\b/.test(lower)) {
      yearRange = { min: y, max: y, hard: true, label: `${y}` };
    } else {
      yearRange = { min: y - 1, max: y + 1, hard: false, label: `${y}` };
    }
  } else if (/\b(latest|recent|new release|modern)\b/i.test(lower)) {
    yearRange = { min: 2021, max: 2030, hard: false, label: '2021–Present' };
  } else if (/\b(classic|retro|old school|vintage|good old movie)\b/i.test(lower)) {
    yearRange = { min: 1950, max: 2005, hard: false, label: 'Classic Era' };
  }

  // 3. Minimum Rating Constraint Detection
  let minRating: RecommendationIntent['minRating'];
  const explicitRatingMatch = lower.match(
    /\b(?:rating|rated|imdb|above|over|at\s+least)\s*(\d(?:\.\d)?)\s*(?:or\s+higher|or\s+more|\+)?\b/i,
  ) || lower.match(/\b(\d(?:\.\d)?)\s*(?:or\s+higher|or\s+above|\+\s*imdb)\b/i);

  if (explicitRatingMatch) {
    const val = Number.parseFloat(explicitRatingMatch[1]);
    if (Number.isFinite(val) && val > 0 && val <= 10) {
      minRating = { source: 'imdb', value: val, hard: true };
    }
  } else if (
    /\b(masterpiece|top rated|highest rated|high rated|best rated|acclaimed)\b/i.test(lower)
  ) {
    minRating = { source: 'imdb', value: 7.4, hard: false };
  }

  // 4. Runtime Constraints ("under two hours", "under 90 minutes", "for a 90-minute break")
  let runtime: RecommendationIntent['runtime'];
  const underHours = lower.match(/\b(?:under|less\s+than|max|within)\s+(two|2|one|1|three|3)\s+hours?\b/i);
  const underMinutes = lower.match(
    /\b(?:under|less\s+than|for\s+a|within|max)\s+(\d{2,3})\s*(?:-|\s+)?(?:min(?:ute)?s?)\b/i,
  );
  const overHours = lower.match(/\b(?:over|more\s+than|at\s+least)\s+(two|2|three|3)\s+hours?\b/i);

  if (underHours) {
    const word = underHours[1].toLowerCase();
    const hrs = word === 'one' || word === '1' ? 1 : word === 'three' || word === '3' ? 3 : 2;
    runtime = { maxMinutes: hrs * 60, hard: true };
  } else if (underMinutes) {
    const mins = Number.parseInt(underMinutes[1], 10);
    if (mins >= 30 && mins <= 300) {
      runtime = { maxMinutes: mins + 5, hard: true };
    }
  } else if (overHours) {
    const word = overHours[1].toLowerCase();
    const hrs = word === 'three' || word === '3' ? 3 : 2;
    runtime = { minMinutes: hrs * 60, hard: true };
  }

  // 5. Languages ("English or Hindi audio")
  for (const { language, regex } of LANGUAGE_PATTERNS) {
    if (regex.test(lower)) {
      const isExcluded = new RegExp(`\\b(?:no|not|without|except)\\s+${language}\\b`, 'i').test(
        lower,
      );
      languages.push({
        value: language,
        polarity: isExcluded ? 'exclude' : 'include',
        strength: 'hard',
        confidence: 0.95,
        sourceText: language,
      });
    }
  }

  // 6. Title Anchors ("Like Interstellar, but darker", "Something like Prisoners, but less disturbing")
  const titleAnchors = detectTitleAnchors(originalText, catalogueItems);
  const anchorTitleTokens = new Set<string>();
  for (const anchor of titleAnchors || []) {
    for (const tk of anchor.title.toLowerCase().split(/\s+/)) {
      if (tk.length >= 2) anchorTitleTokens.add(tk);
    }
  }

  // 7. Segment Query into Clause Polarity & Extract Genres, Taxonomy & Exclusions
  const segments = segmentQueryClauses(originalText);

  for (const segment of segments) {
    const segLower = segment.text.toLowerCase();

    // Strip anchor title words from the segment if it's an anchor introduction clause ("like Interstellar")
    let cleanedSegText = segLower;
    for (const anchor of titleAnchors || []) {
      const anchorRegex = new RegExp(
        `\\b(?:similar(?:\\s+atmosphere|\\s+vibe|\\s+tone)?\\s+to|something\\s+like|like|than)\\s+${escapeRegex(anchor.title.toLowerCase())}\\b`,
        'gi',
      );
      cleanedSegText = cleanedSegText.replace(anchorRegex, ' ');
    }

    // Check special exclusions/phrases in this segment
    if (segment.polarity === 'exclude') {
      if (/\b(gore|gory|blood|bloody|brutal|torture|splatter)\b/i.test(cleanedSegText)) {
        contentExclusions.push({
          value: 'content:gore-extreme-violence',
          polarity: 'exclude',
          strength: segment.strength,
          confidence: 0.95,
          sourceText: segment.text,
        });
      }
      if (/\b(violent|violence)\b/i.test(cleanedSegText)) {
        contentExclusions.push({
          value: 'content:gore-extreme-violence',
          polarity: 'exclude',
          strength: segment.strength,
          confidence: 0.88,
          sourceText: segment.text,
        });
      }
      if (/\b(superhero|superheroes|comic book|marvel)\b/i.test(cleanedSegText)) {
        contentExclusions.push({
          value: 'content:superhero-comic',
          polarity: 'exclude',
          strength: segment.strength,
          confidence: 0.95,
          sourceText: segment.text,
        });
      }
      if (/\b(depressing|bleak|sad|tragic|miserable)\b/i.test(cleanedSegText)) {
        tones.push({
          value: 'tone:dark-bleak',
          polarity: 'exclude',
          strength: segment.strength,
          confidence: 0.9,
          sourceText: segment.text,
        });
        themes.push({
          value: 'theme:grief-sacrifice',
          polarity: 'exclude',
          strength: segment.strength,
          confidence: 0.85,
          sourceText: segment.text,
        });
      }
      if (/\b(disturbing)\b/i.test(cleanedSegText)) {
        tones.push({
          value: 'tone:disturbing-intense',
          polarity: 'exclude',
          strength: segment.strength,
          confidence: 0.92,
          sourceText: segment.text,
        });
      }
    }

    // Genre detection per clause segment
    for (const gDef of CANONICAL_GENRE_TAXONOMY) {
      let matchedGenre = false;
      for (const syn of gDef.synonyms) {
        if (syn.includes(' ')) {
          if (cleanedSegText.includes(syn)) {
            matchedGenre = true;
            break;
          }
        } else if (new RegExp(`\\b${escapeRegex(syn)}\\b`, 'i').test(cleanedSegText)) {
          matchedGenre = true;
          break;
        }
      }
      if (matchedGenre) {
        // Avoid inferring Horror genre merely because someone said "without gore"
        if (
          segment.polarity === 'exclude' &&
          gDef.genre === 'Horror' &&
          /\b(gore|gory|blood)\b/i.test(cleanedSegText) &&
          !/\b(horror|scary|slasher|vampire|zombie)\b/i.test(cleanedSegText)
        ) {
          continue;
        }
        genres.push({
          value: gDef.genre,
          polarity: segment.polarity,
          strength: segment.strength,
          confidence: 0.92,
          sourceText: segment.text,
        });
      }
    }

    // Taxonomy node detection per clause segment
    const extractedNodes = extractTaxonomyNodesFromText(cleanedSegText);
    for (const node of extractedNodes) {
      const pref: IntentPreference<string> = {
        value: node.id,
        polarity: segment.polarity,
        strength: segment.strength,
        confidence: node.confidence,
        sourceText: segment.text,
      };
      if (node.dimension === 'subgenre') subgenres.push(pref);
      else if (node.dimension === 'theme') themes.push(pref);
      else if (node.dimension === 'narrative_mechanic') narrativeTraits.push(pref);
      else if (node.dimension === 'tone') tones.push(pref);
      else if (node.dimension === 'setting') settings.push(pref);
      else if (node.dimension === 'pacing') pacing.push(pref);
      else if (node.dimension === 'content_signal' && segment.polarity === 'exclude') {
        contentExclusions.push(pref);
      }
      if (
        node.dimension === 'subgenre' ||
        node.dimension === 'narrative_mechanic' ||
        node.dimension === 'theme' ||
        node.dimension === 'setting'
      ) {
        concepts.push(pref);
      }
    }
  }

  // 8. Also infer related positive genres from positive subgenres/concepts when no explicit genre contradicts them
  const excludedGenreSet = new Set(
    genres.filter((g) => g.polarity === 'exclude').map((g) => g.value.toLowerCase()),
  );
  const existingPositiveGenres = new Set(
    genres.filter((g) => g.polarity === 'include').map((g) => g.value),
  );
  for (const conceptPref of concepts.filter((c) => c.polarity === 'include').slice(0, 3)) {
    const taxNode = HIERARCHICAL_TAXONOMY.find((n) => n.id === conceptPref.value);
    if (!taxNode) continue;
    for (const parentGenre of taxNode.parentGenres.slice(0, 2)) {
      if (
        !excludedGenreSet.has(parentGenre.toLowerCase()) &&
        !existingPositiveGenres.has(parentGenre)
      ) {
        existingPositiveGenres.add(parentGenre);
        genres.push({
          value: parentGenre,
          polarity: 'include',
          strength: 'soft',
          confidence: 0.72,
          sourceText: conceptPref.sourceText,
        });
      }
    }
  }

  // 9. Context & Mood Detection ("tonight", "with family", "something light", "something serious")
  if (/\b(with\s+family|family\s+movie|for\s+kids|with\s+kids|wholesome)\b/i.test(lower)) {
    context.push('family');
    if (!existingPositiveGenres.has('Family')) {
      genres.push({
        value: 'Family',
        polarity: 'include',
        strength: 'strong',
        confidence: 0.9,
        sourceText: 'with family',
      });
    }
    contentExclusions.push({
      value: 'content:gore-extreme-violence',
      polarity: 'exclude',
      strength: 'hard',
      confidence: 0.95,
      sourceText: 'with family',
    });
    tones.push({
      value: 'tone:disturbing-intense',
      polarity: 'exclude',
      strength: 'hard',
      confidence: 0.9,
      sourceText: 'with family',
    });
  }
  if (/\b(tonight|right\s+now|break|weekend)\b/i.test(lower)) {
    context.push('session_now');
  }
  if (/\b(something\s+light|feel-good|cheerful|uplifting|fun)\b/i.test(lower)) {
    mood.push('lighthearted');
  }
  if (/\b(something\s+serious|serious)\b/i.test(lower)) {
    mood.push('serious');
    if (!existingPositiveGenres.has('Drama') && !existingPositiveGenres.has('Thriller')) {
      genres.push({
        value: 'Drama',
        polarity: 'include',
        strength: 'soft',
        confidence: 0.75,
        sourceText: 'something serious',
      });
    }
  }

  // 10. Quality & Novelty / Discovery Preferences
  let qualityPreference: RecommendationIntent['qualityPreference'] = 'any';
  let noveltyPreference: RecommendationIntent['noveltyPreference'] = 'balanced';

  if (
    /\b(hidden\s+gems?|underrated|lesser[- ]known|unusual|probably\s+haven't\s+seen|under\s+the\s+radar|something\s+different)\b/i.test(
      lower,
    )
  ) {
    qualityPreference = 'hidden_gems';
    noveltyPreference = 'exploratory';
  } else if (/\b(surprise\s+me)\b/i.test(lower)) {
    noveltyPreference = 'exploratory';
  } else if (
    /\b(highly\s+rated|top\s+rated|best|masterpiece|acclaimed|genuinely\s+good)\b/i.test(lower)
  ) {
    qualityPreference = 'highly_rated';
  }

  // 11. Request Mode & Slate Strategy Selection
  let requestMode: RecommendationMode = 'natural_language_search';
  let slateStrategy: SlateStrategy = 'balanced';

  if (titleAnchors && titleAnchors.some((a) => a.relationship === 'similar_to')) {
    requestMode = 'similar_to_item';
    slateStrategy = 'similar_to_title';
  } else if (qualityPreference === 'hidden_gems' || noveltyPreference === 'exploratory') {
    requestMode = 'quality_discovery';
    slateStrategy = 'discovery';
  } else if (mood.length > 0 || context.includes('session_now')) {
    requestMode = 'mood_discovery';
    slateStrategy = 'mood';
  } else if (yearRange?.hard || minRating?.hard || runtime?.hard || mediaTypeHard) {
    slateStrategy = 'strict';
  }

  // 12. Positive Lexical Terms (excluding terms from negative segments, anchor titles, and bare genre names already captured in structured genres!)
  const GENERIC_GENRE_STEMS = new Set([
    'thriller',
    'drama',
    'dramatic',
    'comedy',
    'romance',
    'romantic',
    'action',
    'adventur',
    'horror',
    'mysteri',
    'fantasi',
    'sci-fi',
    'scifi',
    'science',
    'fiction',
    'crime',
    'animat',
    'documentari',
  ]);
  const positiveText = segments
    .filter((s) => s.polarity === 'include')
    .map((s) => s.text)
    .join(' ');
  const rawLexical = extractSignificantKeywords(positiveText).filter(
    (stem) =>
      !anchorTitleTokens.has(stem) &&
      !GENERIC_GENRE_STEMS.has(stem) &&
      !['without', 'avoid', 'never', 'less', 'except', 'not', 'only', 'under', 'hour', 'minute', 'imdb', 'rated', 'please'].includes(
        stem,
      ),
  );

  // Build Cinemeta search terms for remote candidate fetching
  const cinemetaSearchTerms: string[] = [];
  for (const anchor of titleAnchors || []) {
    if (anchor.relationship === 'similar_to') {
      const known = KNOWN_TITLE_ANCHORS.find(
        (k) => k.canonicalTitle.toLowerCase() === anchor.title.toLowerCase(),
      );
      if (known && known.keywords[0]) {
        cinemetaSearchTerms.push(known.keywords[0]);
      }
    }
  }
  for (const cPref of concepts.filter((c) => c.polarity === 'include').slice(0, 2)) {
    const node = HIERARCHICAL_TAXONOMY.find((n) => n.id === cPref.value);
    if (node && node.tokens[0]) {
      cinemetaSearchTerms.push(node.tokens[0]);
    }
  }
  for (const term of rawLexical) {
    if (!cinemetaSearchTerms.includes(term) && cinemetaSearchTerms.length < 4) {
      cinemetaSearchTerms.push(term);
    }
  }

  // 13. Check for high-ambiguity queries ("Something like Dark", "A good old movie", "Best sci-fi", "Something different")
  let clarificationQuestion: string | undefined;
  if (/^something\s+like\s+dark\.?$/i.test(originalText)) {
    clarificationQuestion =
      'Do you want the time-travel puzzle mechanics of Dark, or its bleak mystery atmosphere?';
  } else if (/^a\s+good\s+old\s+movie\.?$/i.test(originalText)) {
    clarificationQuestion =
      'Any preferred era (e.g., 1970s–1990s) or mood (classic thriller, drama, or adventure)?';
  } else if (/^something\s+different\.?$/i.test(originalText)) {
    clarificationQuestion =
      'Looking for mind-bending sci-fi, surreal mystery, or an underrated international gem?';
  }

  return {
    originalText,
    mediaTypes,
    mediaTypeHard,
    yearRange,
    minRating,
    languages: languages.length > 0 ? languages : undefined,
    genres: genres.length > 0 ? genres : undefined,
    subgenres: subgenres.length > 0 ? subgenres : undefined,
    themes: themes.length > 0 ? themes : undefined,
    concepts: concepts.length > 0 ? concepts : undefined,
    tones: tones.length > 0 ? tones : undefined,
    settings: settings.length > 0 ? settings : undefined,
    pacing: pacing.length > 0 ? pacing : undefined,
    narrativeTraits: narrativeTraits.length > 0 ? narrativeTraits : undefined,
    titleAnchors: titleAnchors && titleAnchors.length > 0 ? titleAnchors : undefined,
    runtime,
    contentExclusions: contentExclusions.length > 0 ? contentExclusions : undefined,
    qualityPreference,
    noveltyPreference,
    mood: mood.length > 0 ? mood : undefined,
    context: context.length > 0 ? context : undefined,
    lexicalTerms: rawLexical,
    cinemetaSearchTerms,
    unresolvedClauses: unresolvedClauses.length > 0 ? unresolvedClauses : undefined,
    clarificationQuestion,
    requestMode,
    slateStrategy,
    parserVersion: PARSER_VERSION,
  };
}
