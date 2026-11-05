import { describe, expect, it } from 'vitest';
import { StremioMediaItem } from '../src/addons/stremioProtocol';
import {
  computeBayesianQualityPrior,
  computeDecayedEventWeight,
  computeExclusionViolationRate,
  computeIntraListDiversity,
  createDefaultLocalPreferences,
  deduplicateStremioMediaItems,
  executeHybridRecommendationPipeline,
  meanReciprocalRank,
  ndcgAtK,
  normalizeMediaItem,
  parseNaturalLanguageSuggestionQuery,
  parseRecommendationIntent,
  precisionAtK,
  rankByAdjustedRatingBaseline,
  rankByLegacyHeuristicBaseline,
  rankByPopularityRecencyBaseline,
  rankByRandomBaseline,
  rankSimilarMediaItems,
  scoreCandidatesForSuggestionPrompt,
} from '../src/intelligence/recommendationEngine';

function makeItem(overrides: Partial<StremioMediaItem> & { id: string; name: string }): StremioMediaItem {
  return {
    type: 'movie',
    genres: [],
    cast: [],
    director: [],
    writer: [],
    trailers: [],
    videos: [],
    ...overrides,
  };
}

const BENCHMARK_CATALOGUE: StremioMediaItem[] = [
  makeItem({
    id: 'tt0816692',
    imdbId: 'tt0816692',
    type: 'movie',
    name: 'Interstellar',
    description:
      'A team of explorers and astronauts travel through a wormhole in space in an attempt to ensure humanity survival on a distant planet.',
    year: '2014',
    runtime: '169 min',
    imdbRating: '8.7',
    genres: ['Sci-Fi', 'Adventure', 'Drama'],
    director: ['Christopher Nolan'],
    cast: ['Matthew McConaughey', 'Anne Hathaway'],
    country: 'United States',
  }),
  makeItem({
    id: 'tt2543164',
    imdbId: 'tt2543164',
    type: 'movie',
    name: 'Arrival',
    description:
      'A linguist works with the military to communicate with alien lifeforms after twelve mysterious spacecraft appear around the world, confronting memory and time.',
    year: '2016',
    runtime: '116 min',
    imdbRating: '7.9',
    genres: ['Sci-Fi', 'Drama', 'Mystery'],
    director: ['Denis Villeneuve'],
    cast: ['Amy Adams', 'Jeremy Renner'],
    country: 'United States',
  }),
  makeItem({
    id: 'tt3659388',
    imdbId: 'tt3659388',
    type: 'movie',
    name: 'The Martian',
    description:
      'A scientist and astronaut is stranded alone on Mars beyond Earth and must rely on realistic scientific ingenuity to survive isolation.',
    year: '2015',
    runtime: '144 min',
    imdbRating: '8.0',
    genres: ['Sci-Fi', 'Adventure', 'Drama'],
    director: ['Ridley Scott'],
    cast: ['Matt Damon', 'Jessica Chastain'],
    country: 'United States',
  }),
  makeItem({
    id: 'tt0448134',
    imdbId: 'tt0448134',
    type: 'movie',
    name: 'Sunshine',
    description:
      'A crew of astronauts on a bleak, dark mission in deep space face psychological paranoia and sacrifice while trying to reignite the dying sun.',
    year: '2007',
    runtime: '107 min',
    imdbRating: '7.2',
    genres: ['Sci-Fi', 'Thriller'],
    director: ['Danny Boyle'],
    cast: ['Cillian Murphy', 'Rose Byrne'],
    country: 'United Kingdom',
  }),
  makeItem({
    id: 'tt1182345',
    imdbId: 'tt1182345',
    type: 'movie',
    name: 'Moon',
    description:
      'A lonely astronaut confronting isolation on a lunar station discovers a disturbing mind-bending twist about his memory, identity, and clones.',
    year: '2009',
    runtime: '97 min',
    imdbRating: '7.8',
    genres: ['Sci-Fi', 'Drama', 'Mystery'],
    director: ['Duncan Jones'],
    cast: ['Sam Rockwell'],
    country: 'United Kingdom',
  }),
  makeItem({
    id: 'tt2397535',
    imdbId: 'tt2397535',
    type: 'movie',
    name: 'Predestination',
    description:
      'A temporal agent embarks on an intricate time travel and time loop mission full of mind-bending paradoxes and a shocking twist.',
    year: '2014',
    runtime: '97 min',
    imdbRating: '7.4',
    genres: ['Sci-Fi', 'Thriller', 'Mystery'],
    director: ['Michael Spierig', 'Peter Spierig'],
    cast: ['Ethan Hawke', 'Sarah Snook'],
    country: 'Australia',
  }),
  makeItem({
    id: 'tt1631867',
    imdbId: 'tt1631867',
    type: 'movie',
    name: 'Edge of Tomorrow',
    description:
      'A soldier fighting aliens gets caught in a time loop, repeating the same brutal battlefield day in a fast-paced sci-fi action thriller.',
    year: '2014',
    runtime: '113 min',
    imdbRating: '7.9',
    genres: ['Sci-Fi', 'Action', 'Adventure'],
    director: ['Doug Liman'],
    cast: ['Tom Cruise', 'Emily Blunt'],
    country: 'United States',
  }),
  makeItem({
    id: 'tt0470752',
    imdbId: 'tt0470752',
    type: 'movie',
    name: 'Ex Machina',
    description:
      'A young programmer is selected to participate in a ground-breaking experiment in synthetic consciousness by evaluating a sentient artificial intelligence android.',
    year: '2014',
    runtime: '108 min',
    imdbRating: '7.7',
    genres: ['Sci-Fi', 'Drama', 'Thriller'],
    director: ['Alex Garland'],
    cast: ['Domhnall Gleeson', 'Alicia Vikander', 'Oscar Isaac'],
    country: 'United Kingdom',
  }),
  makeItem({
    id: 'tt1856101',
    imdbId: 'tt1856101',
    type: 'movie',
    name: 'Blade Runner 2049',
    description:
      'A young blade runner replicant discovery of a long-buried secret leads him to track down former detective Rick Deckard in a dark cyberpunk dystopia.',
    year: '2017',
    runtime: '164 min',
    imdbRating: '8.0',
    genres: ['Sci-Fi', 'Drama', 'Mystery', 'Thriller'],
    director: ['Denis Villeneuve'],
    cast: ['Ryan Gosling', 'Harrison Ford'],
    country: 'United States',
  }),
  makeItem({
    id: 'tt1392214',
    imdbId: 'tt1392214',
    type: 'movie',
    name: 'Prisoners',
    description:
      'When two girls are kidnapped in a small town, a desperate father takes matters into his own hands while a detective investigates the dark abduction mystery.',
    year: '2013',
    runtime: '153 min',
    imdbRating: '8.2',
    genres: ['Crime', 'Drama', 'Mystery', 'Thriller'],
    director: ['Denis Villeneuve'],
    cast: ['Hugh Jackman', 'Jake Gyllenhaal'],
    country: 'United States',
  }),
  makeItem({
    id: 'tt0443706',
    imdbId: 'tt0443706',
    type: 'movie',
    name: 'Zodiac',
    description:
      'A slow-burn detective thriller following investigators and journalists obsessed with tracking down the Zodiac serial killer through forensic clues.',
    year: '2007',
    runtime: '157 min',
    imdbRating: '7.7',
    genres: ['Crime', 'Drama', 'Mystery', 'Thriller'],
    director: ['David Fincher'],
    cast: ['Jake Gyllenhaal', 'Robert Downey Jr.'],
    country: 'United States',
  }),
  makeItem({
    id: 'tt1130884',
    imdbId: 'tt1130884',
    type: 'movie',
    name: 'Shutter Island',
    description:
      'A U.S. Marshal investigates the disappearance of a murderer from a psychiatric asylum on a remote island, uncovering a psychological twist and unreliable narrator.',
    year: '2010',
    runtime: '138 min',
    imdbRating: '8.2',
    genres: ['Mystery', 'Thriller', 'Drama'],
    director: ['Martin Scorsese'],
    cast: ['Leonardo DiCaprio', 'Mark Ruffalo'],
    country: 'United States',
  }),
  makeItem({
    id: 'tt0387564',
    imdbId: 'tt0387564',
    type: 'movie',
    name: 'Saw',
    description:
      'Two strangers awaken in a room with extreme gore, brutal torture, bloody traps, and gruesome slasher mutilation orchestrated by a serial killer.',
    year: '2004',
    runtime: '103 min',
    imdbRating: '7.6',
    genres: ['Horror', 'Mystery', 'Thriller'],
    director: ['James Wan'],
    cast: ['Cary Elwes', 'Leigh Whannell'],
    country: 'United States',
  }),
  makeItem({
    id: 'tt0332280',
    imdbId: 'tt0332280',
    type: 'movie',
    name: 'The Notebook',
    description:
      'A passionate young couple falls deeply in love in a heartfelt romantic drama about soulmates, marriage, and lifelong romance.',
    year: '2004',
    runtime: '123 min',
    imdbRating: '7.8',
    genres: ['Romance', 'Drama'],
    director: ['Nick Cassavetes'],
    cast: ['Ryan Gosling', 'Rachel McAdams'],
    country: 'United States',
  }),
  makeItem({
    id: 'tt1109624',
    imdbId: 'tt1109624',
    type: 'movie',
    name: 'Paddington 2',
    description:
      'A lighthearted, cheerful, heartwarming family comedy adventure about a kind bear spreading joy and wholesome fun for all ages.',
    year: '2017',
    runtime: '103 min',
    imdbRating: '7.8',
    genres: ['Comedy', 'Family', 'Adventure'],
    director: ['Paul King'],
    cast: ['Ben Whishaw', 'Hugh Grant'],
    country: 'United Kingdom',
  }),
  makeItem({
    id: 'tt4154796',
    imdbId: 'tt4154796',
    type: 'movie',
    name: 'Avengers: Endgame',
    description:
      'The Avengers superheroes assemble with superpowers in a comic book cinematic universe to defeat a cosmic supervillain.',
    year: '2019',
    runtime: '181 min',
    imdbRating: '8.4',
    genres: ['Action', 'Adventure', 'Sci-Fi'],
    director: ['Anthony Russo', 'Joe Russo'],
    cast: ['Robert Downey Jr.', 'Chris Evans'],
    country: 'United States',
  }),
  makeItem({
    id: 'tt5753856',
    imdbId: 'tt5753856',
    type: 'series',
    name: 'Dark',
    description:
      'A family saga with a supernatural twist set in a German town where the disappearance of two children exposes time travel, time loops, and dark secrets across generations.',
    year: '2017',
    runtime: '60 min',
    imdbRating: '8.7',
    genres: ['Sci-Fi', 'Mystery', 'Drama', 'Thriller'],
    director: ['Baran bo Odar'],
    cast: ['Louis Hofmann'],
    country: 'Germany',
  }),
  makeItem({
    id: 'tt0944947',
    imdbId: 'tt0944947',
    type: 'series',
    name: 'House of the Crown',
    description:
      'A dark fantasy series where noble factions wage a ruthless struggle of political intrigue, royal succession, betrayal, and ancient dragons.',
    year: '2022',
    runtime: '58 min',
    imdbRating: '8.4',
    genres: ['Fantasy', 'Drama', 'Action'],
    director: ['Miguel Sapochnik'],
    cast: ['Matt Smith'],
    country: 'United States',
  }),
  makeItem({
    id: 'tt8108198',
    imdbId: 'tt8108198',
    type: 'movie',
    name: 'Andhadhun',
    description:
      'A blind pianist becomes embroiled in a twisted murder investigation full of suspenseful twists and dark humor in India.',
    year: '2018',
    runtime: '139 min',
    imdbRating: '8.2',
    genres: ['Crime', 'Mystery', 'Thriller'],
    director: ['Sriram Raghavan'],
    cast: ['Ayushmann Khurrana', 'Tabu'],
    country: 'India',
  }),
  makeItem({
    id: 'tt0289043',
    imdbId: 'tt0289043',
    type: 'movie',
    name: '28 Days Later',
    description:
      'Four weeks after a mysterious rage virus outbreak ravages the UK, a small group of survivors searches for sanctuary in a post-apocalyptic wasteland.',
    year: '2002',
    runtime: '113 min',
    imdbRating: '7.5',
    genres: ['Horror', 'Sci-Fi', 'Thriller'],
    director: ['Danny Boyle'],
    cast: ['Cillian Murphy'],
    country: 'United Kingdom',
  }),
  makeItem({
    id: 'tt0463854',
    imdbId: 'tt0463854',
    type: 'movie',
    name: '28 Weeks Later',
    description:
      'Six months after the rage virus pandemic devastated Britain, the US Army attempts to repopulate the quarantine zone before a new outbreak begins.',
    year: '2007',
    runtime: '100 min',
    imdbRating: '6.9',
    genres: ['Horror', 'Sci-Fi', 'Thriller'],
    director: ['Juan Carlos Fresnadillo'],
    cast: ['Robert Carlyle', 'Rose Byrne'],
    country: 'United Kingdom',
  }),
  makeItem({
    id: 'tt10548174',
    imdbId: 'tt10548174',
    type: 'movie',
    name: '28 Years Later',
    description:
      'Survivors in a post-apocalyptic wasteland fight for survival decades after a deadly rage virus outbreak.',
    year: '2025',
    runtime: '115 min',
    imdbRating: '8.1',
    genres: ['Sci-Fi', 'Horror', 'Thriller'],
    director: ['Danny Boyle'],
    cast: ['Cillian Murphy'],
    country: 'United Kingdom',
  }),
  makeItem({
    id: 'tt2866360',
    imdbId: 'tt2866360',
    type: 'movie',
    name: 'Coherence',
    description:
      'On the night of an astronomical anomaly, eight friends at a dinner party experience a troubling chain of reality-bending quantum multiverse events and psychological paranoia.',
    year: '2013',
    runtime: '89 min',
    imdbRating: '7.2',
    genres: ['Sci-Fi', 'Mystery', 'Thriller'],
    director: ['James Ward Byrkit'],
    cast: ['Emily Baldoni'],
    country: 'United States',
  }),
];

describe('Hybrid Movie & TV Recommendation Intelligence Engine (Master Specification)', () => {
  it('1. Catalogue Normalization & Deduplication: preserves unknown ratings as null (never fabricates 6.2) and safely handles duplicates vs same-title different-year items', () => {
    const missingRatingItem = makeItem({
      id: 'tt9990001',
      name: 'Unrated Indie Sci-Fi',
      description: 'An astronaut explores a silent planet.',
      year: '2023',
      imdbRating: undefined,
      genres: ['Sci-Fi'],
    });

    const norm = normalizeMediaItem(missingRatingItem);
    expect(norm.ratings).toHaveLength(0);

    const prior = computeBayesianQualityPrior(norm);
    expect(prior.rawValue).toBeNull();
    expect(prior.normalizedValue).toBeNull();
    expect(prior.confidence).toBe(0);

    // Duplicate items with different source completeness merge into one canonical record
    const sparseDup = makeItem({
      id: 'tt0816692',
      name: 'Interstellar',
      year: '2014',
      genres: ['Sci-Fi'],
    });
    const richDup = makeItem({
      id: 'cinemeta:tt0816692',
      imdbId: 'tt0816692',
      name: 'Interstellar',
      description: 'Astronauts travel through a wormhole in space to save humanity.',
      year: '2014',
      imdbRating: '8.7',
      genres: ['Sci-Fi', 'Adventure', 'Drama'],
    });
    // Same title but different release year must NOT be merged
    const differentYearSameTitle = makeItem({
      id: 'custom-interstellar-1979',
      name: 'Interstellar',
      description: 'An earlier 1979 short archive documentary.',
      year: '1979',
      genres: ['Documentary'],
    });

    const deduped = deduplicateStremioMediaItems([
      sparseDup,
      richDup,
      differentYearSameTitle,
    ]);
    expect(deduped.deduplicatedItems).toHaveLength(2);
    const mergedInterstellar = deduped.normalizedByCanonicalId.get('imdb:tt0816692');
    expect(mergedInterstellar?.synopsis).toContain('wormhole');
    expect(mergedInterstellar?.genres).toHaveLength(3);
  });

  it('2. Positive Intent Understanding: ranks mind-bending twist sci-fi, realistic space, slow-burn detective, AI consciousness, and dark fantasy accurately', () => {
    const q1 = scoreCandidatesForSuggestionPrompt(
      'Mind-bending sci-fi with a satisfying twist',
      BENCHMARK_CATALOGUE,
    );
    const top3Q1 = q1.slice(0, 3).map((r) => r.item.name);
    expect(top3Q1.some((n) => ['Predestination', 'Moon', 'Coherence'].includes(n))).toBe(true);

    const q2 = scoreCandidatesForSuggestionPrompt(
      'A realistic space movie with scientific concepts',
      BENCHMARK_CATALOGUE,
    );
    const top3Q2 = q2.slice(0, 3).map((r) => r.item.name);
    expect(top3Q2.some((n) => ['The Martian', 'Interstellar', 'Arrival'].includes(n))).toBe(true);

    const q3 = scoreCandidatesForSuggestionPrompt(
      'A slow-burn detective thriller',
      BENCHMARK_CATALOGUE,
    );
    expect(['Zodiac', 'Prisoners']).toContain(q3[0]?.item.name);

    const q4 = scoreCandidatesForSuggestionPrompt(
      'Movies about artificial intelligence and consciousness',
      BENCHMARK_CATALOGUE,
    );
    expect(['Ex Machina', 'Blade Runner 2049']).toContain(q4[0]?.item.name);

    const q5 = scoreCandidatesForSuggestionPrompt(
      'A dark fantasy series with political intrigue',
      BENCHMARK_CATALOGUE,
    );
    expect(q5[0]?.item.name).toBe('House of the Crown');
  });

  it('3. Negation & Hard Exclusions: never violates "without gore", "no romance", "something serious, not comedy", or "avoid superhero movies"', () => {
    // "A thriller without gore" must exclude Saw (gore/torture) while keeping Zodiac / Prisoners / Shutter Island
    const noGore = scoreCandidatesForSuggestionPrompt(
      'A thriller without gore',
      BENCHMARK_CATALOGUE,
    );
    const noGoreIds = noGore.map((r) => r.item.name);
    expect(noGoreIds).not.toContain('Saw');
    expect(noGoreIds.slice(0, 4)).toContain('Shutter Island');

    // "No romance, please" must exclude The Notebook
    const noRomance = scoreCandidatesForSuggestionPrompt(
      'Drama with no romance, please',
      BENCHMARK_CATALOGUE,
    );
    expect(noRomance.map((r) => r.item.name)).not.toContain('The Notebook');

    // "Something serious, not comedy" must exclude Paddington 2
    const notComedy = scoreCandidatesForSuggestionPrompt(
      'Something serious, not comedy',
      BENCHMARK_CATALOGUE,
    );
    expect(notComedy.map((r) => r.item.name)).not.toContain('Paddington 2');

    // "Avoid predictable superhero movies" must exclude Avengers: Endgame
    const noSuperhero = scoreCandidatesForSuggestionPrompt(
      'Sci-fi action but avoid predictable superhero movies',
      BENCHMARK_CATALOGUE,
    );
    expect(noSuperhero.map((r) => r.item.name)).not.toContain('Avengers: Endgame');
    expect(noSuperhero[0]?.item.name).toBe('Edge of Tomorrow');
  });

  it('4. Contrast & Relative Intent with Title Anchors: understands "Like Interstellar, but darker" and "Similar atmosphere to Blade Runner, but with a faster pace"', () => {
    const darkerInterstellar = parseRecommendationIntent(
      'Like Interstellar, but darker',
      BENCHMARK_CATALOGUE.map(normalizeMediaItem),
    );
    expect(darkerInterstellar.titleAnchors?.[0]?.title).toBe('Interstellar');
    expect(darkerInterstellar.tones?.some((t) => t.value === 'tone:dark-bleak' && t.polarity === 'include')).toBe(
      true,
    );

    const scoredDarker = scoreCandidatesForSuggestionPrompt(
      'Like Interstellar, but darker',
      BENCHMARK_CATALOGUE,
    );
    // Interstellar itself must be excluded when asking for movies "Like Interstellar", and dark space/sci-fi (Sunshine / Moon) should rank at the top
    expect(scoredDarker.map((r) => r.item.name)).not.toContain('Interstellar');
    expect(['Sunshine', 'Moon', 'Dark']).toContain(scoredDarker[0]?.item.name);

    // "I want the mystery, not necessarily the science fiction" -> soft-penalizes Sci-Fi while boosting pure Mystery
    const mysteryNotSciFi = scoreCandidatesForSuggestionPrompt(
      'I want the mystery, not necessarily the science fiction',
      BENCHMARK_CATALOGUE,
    );
    expect(['Prisoners', 'Zodiac', 'Shutter Island', 'Andhadhun']).toContain(
      mysteryNotSciFi[0]?.item.name,
    );
  });

  it('5. Hard Structural Constraints: strictly enforces year ranges, runtime limits, IMDb minimum ratings, media types, and languages', () => {
    // Year range: 2015 to 2022 movies only
    const yearFiltered = scoreCandidatesForSuggestionPrompt(
      'Movies from 2015 to 2022',
      BENCHMARK_CATALOGUE,
    );
    expect(yearFiltered.length).toBeGreaterThan(0);
    for (const r of yearFiltered) {
      const y = Number.parseInt(r.item.year || '0', 10);
      expect(y).toBeGreaterThanOrEqual(2015);
      expect(y).toBeLessThanOrEqual(2022);
    }

    // Runtime: Under two hours (<= 120 min)
    const underTwoHours = scoreCandidatesForSuggestionPrompt(
      'Sci-fi movie under two hours',
      BENCHMARK_CATALOGUE,
    );
    expect(underTwoHours.map((r) => r.item.name)).not.toContain('Interstellar'); // 169 min
    expect(underTwoHours.map((r) => r.item.name)).not.toContain('Blade Runner 2049'); // 164 min
    expect(
      [
        '28 Years Later',
        'Arrival',
        'Moon',
        'Predestination',
        'Edge of Tomorrow',
        'Ex Machina',
        'Coherence',
      ],
    ).toContain(underTwoHours[0]?.item.name);

    // Minimum IMDb rating: 8.2 or higher
    const highRated = scoreCandidatesForSuggestionPrompt(
      'IMDb 8.2 or higher',
      BENCHMARK_CATALOGUE,
    );
    for (const r of highRated) {
      expect(Number.parseFloat(r.item.imdbRating || '0')).toBeGreaterThanOrEqual(8.2);
    }

    // Media type: Movies only, no series
    const moviesOnly = scoreCandidatesForSuggestionPrompt(
      'Time travel movies only, no series',
      BENCHMARK_CATALOGUE,
    );
    expect(moviesOnly.every((r) => r.item.type === 'movie')).toBe(true);
    expect(moviesOnly.map((r) => r.item.name)).not.toContain('Dark');

    // Language constraint: Hindi
    const hindiOnly = scoreCandidatesForSuggestionPrompt(
      'Mystery thriller in Hindi',
      BENCHMARK_CATALOGUE,
    );
    expect(hindiOnly[0]?.item.name).toBe('Andhadhun');
  });

  it('6. Local Personalization & Temporal Decay: improves ranking from browser-local likes/dislikes while keeping cold-start functional', () => {
    // Verify temporal decay math: older events decay smoothly while recent events stay strong
    const recentWeight = computeDecayedEventWeight(
      'watch_complete',
      new Date(Date.now() - 1000 * 60 * 60 * 24 * 1).toISOString(),
    );
    const oldWeight = computeDecayedEventWeight(
      'watch_complete',
      new Date(Date.now() - 1000 * 60 * 60 * 24 * 90).toISOString(),
    );
    expect(recentWeight).toBeGreaterThan(oldWeight);

    // Cold-start user vs Personalized user who loved Detective Mysteries (Prisoners & Zodiac) and disliked Space
    const coldPrefs = createDefaultLocalPreferences();
    const detectiveLoverPrefs = createDefaultLocalPreferences();
    detectiveLoverPrefs.likedItemIds = ['imdb:tt1392214', 'imdb:tt0443706']; // Prisoners, Zodiac
    detectiveLoverPrefs.dislikedItemIds = ['imdb:tt0816692']; // Disliked Interstellar

    const coldHome = executeHybridRecommendationPipeline({
      queryText: '',
      candidates: BENCHMARK_CATALOGUE,
      localPreferencesOverride: coldPrefs,
    });
    const personalHome = executeHybridRecommendationPipeline({
      queryText: '',
      candidates: BENCHMARK_CATALOGUE,
      localPreferencesOverride: detectiveLoverPrefs,
    });

    // Disliked item is excluded from personalized results
    expect(personalHome.results.map((r) => r.item.name)).not.toContain('Interstellar');

    // Shutter Island / Andhadhun (detective/investigation thrillers) rank higher for the detective-lover profile than in cold start
    const coldRankShutter = coldHome.results.findIndex((r) => r.item.name === 'Shutter Island');
    const personalRankShutter = personalHome.results.findIndex(
      (r) => r.item.name === 'Shutter Island',
    );
    expect(personalRankShutter).toBeLessThan(coldRankShutter);
  });

  it('7. MMR Diversity Re-ranking & Honest Explanations: prevents franchise clustering and never fabricates % Match probabilities', () => {
    const targetApoc = BENCHMARK_CATALOGUE.find((i) => i.name === '28 Years Later')!;
    const similar = rankSimilarMediaItems(targetApoc, BENCHMARK_CATALOGUE, 8);
    expect(similar.items.length).toBeGreaterThan(0);

    // Every explanation label is an honest, human-readable reason (never "99% Match")
    const scored = scoreCandidatesForSuggestionPrompt(
      'Post-apocalyptic survival after a virus outbreak',
      BENCHMARK_CATALOGUE,
    );
    expect(scored[0]?.matchReasonLabel).not.toMatch(/^\d+%\s*Match$/i);
    expect(scored[0]?.matchReasonLabel.length).toBeGreaterThan(3);
    expect(scored[0]?.reasons.length).toBeGreaterThan(0);
  });

  it('8. Offline Benchmark Evaluation (Section 12): proves Hybrid + MMR Engine outperforms Random, Popularity, Adjusted Rating, and Legacy Heuristic Baselines', () => {
    const evaluationSuite: Array<{
      query: string;
      gradedRelevance: Record<string, number>;
      forbiddenIds: Set<string>;
    }> = [
      {
        query: 'A realistic space movie with scientific concepts and isolation',
        gradedRelevance: {
          tt3659388: 3, // The Martian
          tt0816692: 3, // Interstellar
          tt2543164: 2, // Arrival
          tt1182345: 2, // Moon
          tt0448134: 1, // Sunshine
        },
        forbiddenIds: new Set(),
      },
      {
        query: 'A gripping thriller without gore',
        gradedRelevance: {
          tt1392214: 3, // Prisoners
          tt0443706: 3, // Zodiac
          tt1130884: 3, // Shutter Island
          tt8108198: 2, // Andhadhun
          tt1631867: 2, // Edge of Tomorrow (Gripping non-gore sci-fi thriller)
          tt10548174: 2, // 28 Years Later (Sci-Fi/Thriller without gore keyword)
          tt2397535: 2, // Predestination (Sci-Fi/Thriller)
        },
        forbiddenIds: new Set(['tt0387564']), // Saw (gore) must not appear
      },
      {
        query: 'Sci-fi action but avoid predictable superhero movies',
        gradedRelevance: {
          tt1631867: 3, // Edge of Tomorrow (Sci-Fi + Action)
          tt0816692: 2, // Interstellar (Sci-Fi + Adventure)
          tt3659388: 2, // The Martian (Sci-Fi + Adventure)
          tt10548174: 2, // 28 Years Later (Sci-Fi + Thriller)
          tt1856101: 2, // Blade Runner 2049
        },
        forbiddenIds: new Set(['tt4154796']), // Avengers: Endgame must not appear
      },
      {
        query: 'Like Interstellar, but darker and more suspenseful',
        gradedRelevance: {
          tt0448134: 3, // Sunshine
          tt1182345: 3, // Moon
          tt5753856: 2, // Dark
          tt1856101: 2, // Blade Runner 2049
        },
        forbiddenIds: new Set(['tt0816692']), // Anchor itself shouldn't be top recommendation
      },
    ];

    let randomNdcgSum = 0;
    let popNdcgSum = 0;
    let ratingNdcgSum = 0;
    let legacyNdcgSum = 0;
    let hybridNdcgSum = 0;

    let legacyViolationSum = 0;
    let hybridViolationSum = 0;
    let hybridPrecisionSum = 0;
    let hybridMrrSum = 0;

    for (const testCase of evaluationSuite) {
      const relevantSet = new Set(Object.keys(testCase.gradedRelevance));

      const randIds = rankByRandomBaseline(BENCHMARK_CATALOGUE).map((i) => i.id);
      const popIds = rankByPopularityRecencyBaseline(BENCHMARK_CATALOGUE).map((i) => i.id);
      const ratingIds = rankByAdjustedRatingBaseline(BENCHMARK_CATALOGUE).map((i) => i.id);
      const legacyIds = rankByLegacyHeuristicBaseline(
        testCase.query,
        BENCHMARK_CATALOGUE,
      ).map((i) => i.id);

      const hybridOut = scoreCandidatesForSuggestionPrompt(
        testCase.query,
        BENCHMARK_CATALOGUE,
      );
      const hybridIds = hybridOut.map((r) => r.item.id);

      randomNdcgSum += ndcgAtK(randIds, testCase.gradedRelevance, 5);
      popNdcgSum += ndcgAtK(popIds, testCase.gradedRelevance, 5);
      ratingNdcgSum += ndcgAtK(ratingIds, testCase.gradedRelevance, 5);
      legacyNdcgSum += ndcgAtK(legacyIds, testCase.gradedRelevance, 5);
      hybridNdcgSum += ndcgAtK(hybridIds, testCase.gradedRelevance, 5);

      legacyViolationSum += computeExclusionViolationRate(
        legacyIds,
        testCase.forbiddenIds,
        5,
      );
      hybridViolationSum += computeExclusionViolationRate(
        hybridIds,
        testCase.forbiddenIds,
        5,
      );

      hybridPrecisionSum += precisionAtK(hybridIds, relevantSet, 3);
      hybridMrrSum += meanReciprocalRank(hybridIds, relevantSet);
    }

    const n = evaluationSuite.length;
    const avgRandomNdcg = randomNdcgSum / n;
    const avgPopNdcg = popNdcgSum / n;
    const avgRatingNdcg = ratingNdcgSum / n;
    const avgLegacyNdcg = legacyNdcgSum / n;
    const avgHybridNdcg = hybridNdcgSum / n;

    expect(avgHybridNdcg).toBeGreaterThan(avgRandomNdcg);
    expect(avgHybridNdcg).toBeGreaterThan(avgPopNdcg);
    expect(avgHybridNdcg).toBeGreaterThan(avgRatingNdcg);
    expect(avgHybridNdcg).toBeGreaterThan(avgLegacyNdcg);

    // Hybrid engine has 0% hard-exclusion violations, whereas legacy heuristic violates exclusions
    expect(hybridViolationSum).toBe(0);
    expect(legacyViolationSum).toBeGreaterThan(0);

    expect(hybridPrecisionSum / n).toBeGreaterThanOrEqual(0.75);
    expect(hybridMrrSum / n).toBeGreaterThanOrEqual(0.85);

    // Verify intra-list diversity is healthy (>= 0.45)
    const pipelineRun = executeHybridRecommendationPipeline({
      queryText: 'Sci-fi thriller',
      candidates: BENCHMARK_CATALOGUE,
    });
    const diversity = computeIntraListDiversity(
      pipelineRun.results.map((r) => ({
        candidate: {
          item: r.normalizedItem,
          profile: r.profile,
          sources: r.breakdown.candidateSources,
        },
        breakdown: r.breakdown,
        primaryReasonLabel: r.primaryReasonLabel,
      })),
      6,
    );
    expect(diversity).toBeGreaterThanOrEqual(0.45);
    expect(pipelineRun.diagnostics.latencyMsByStage.total).toBeLessThan(200);
  });
});
