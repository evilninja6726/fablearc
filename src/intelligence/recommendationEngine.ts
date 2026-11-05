import { StremioMediaItem } from '../addons/stremioProtocol';

export interface ConceptCluster {
  id: string;
  label: string;
  keywords: string[];
  relatedGenres: string[];
}

/**
 * Curated semantic concept clusters for intelligent movie & series similarity and natural-language discovery.
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

const STOPWORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'that',
  'this',
  'from',
  'his',
  'her',
  'their',
  'they',
  'them',
  'into',
  'who',
  'when',
  'where',
  'what',
  'which',
  'while',
  'after',
  'before',
  'over',
  'under',
  'between',
  'through',
  'about',
  'against',
  'during',
  'without',
  'within',
  'along',
  'following',
  'across',
  'behind',
  'beyond',
  'plus',
  'except',
  'but',
  'not',
  'are',
  'was',
  'were',
  'been',
  'being',
  'have',
  'has',
  'had',
  'having',
  'does',
  'did',
  'doing',
  'will',
  'would',
  'shall',
  'should',
  'can',
  'could',
  'may',
  'might',
  'must',
  'ought',
  'one',
  'two',
  'three',
  'four',
  'five',
  'first',
  'new',
  'old',
  'good',
  'best',
  'more',
  'most',
  'other',
  'some',
  'such',
  'no',
  'nor',
  'only',
  'own',
  'same',
  'so',
  'than',
  'too',
  'very',
  'just',
  'now',
  'movie',
  'movies',
  'film',
  'films',
  'series',
  'show',
  'shows',
  'tv',
  'watch',
  'like',
  'similar',
  'something',
  'give',
  'find',
  'want',
  'looking',
  'story',
  'life',
  'world',
  'man',
  'woman',
  'young',
  'group',
  'people',
  'find',
  'finds',
  'must',
  'take',
  'takes',
  'make',
  'makes',
  'year',
  'years',
]);

const CANONICAL_GENRES: Array<{ genre: string; synonyms: string[] }> = [
  { genre: 'Action', synonyms: ['action', 'action-packed', 'explosive', 'combat', 'stunt'] },
  { genre: 'Adventure', synonyms: ['adventure', 'quest', 'journey', 'expedition'] },
  { genre: 'Animation', synonyms: ['animation', 'animated', 'anime', 'cartoon', 'pixar'] },
  { genre: 'Biography', synonyms: ['biography', 'biographical', 'biopic', 'true story'] },
  { genre: 'Comedy', synonyms: ['comedy', 'funny', 'hilarious', 'laugh', 'sitcom', 'humor'] },
  { genre: 'Crime', synonyms: ['crime', 'criminal', 'heist', 'mafia', 'gangster', 'detective'] },
  { genre: 'Documentary', synonyms: ['documentary', 'docuseries', 'real-life'] },
  { genre: 'Drama', synonyms: ['drama', 'dramatic', 'emotional'] },
  { genre: 'Family', synonyms: ['family', 'kids', 'children', 'wholesome'] },
  { genre: 'Fantasy', synonyms: ['fantasy', 'magical', 'mythical', 'sword', 'sorcery'] },
  {
    genre: 'History',
    synonyms: ['history', 'historical', 'period piece', 'ancient', 'medieval'],
  },
  {
    genre: 'Horror',
    synonyms: [
      'horror',
      'scary',
      'terrifying',
      'spooky',
      'creepy',
      'slasher',
      'haunted',
      'blood',
      'bloody',
      'gore',
      'vampire',
      'zombie',
    ],
  },
  {
    genre: 'Mystery',
    synonyms: ['mystery', 'mysterious', 'whodunit', 'suspense', 'enigma', 'investigation'],
  },
  { genre: 'Romance', synonyms: ['romance', 'romantic', 'love story', 'rom-com', 'romcom'] },
  {
    genre: 'Sci-Fi',
    synonyms: [
      'sci-fi',
      'scifi',
      'science fiction',
      'futuristic',
      'space',
      'interstellar',
      'alien',
      'post-apocalyptic',
      'apocalyptic',
      'dystopian',
      'dystopia',
      'cyberpunk',
      'time travel',
    ],
  },
  {
    genre: 'Thriller',
    synonyms: ['thriller', 'thrilling', 'tense', 'edge of your seat', 'psychological', 'suspenseful'],
  },
  { genre: 'War', synonyms: ['war', 'military', 'battlefield', 'world war', 'soldiers'] },
  { genre: 'Western', synonyms: ['western', 'cowboy', 'wild west', 'outlaw', 'frontier'] },
];

export function normalizeWordStem(word: string): string {
  const clean = word.toLowerCase().replace(/[^a-z0-9-]/g, '');
  if (clean.length <= 3) return clean;
  if (clean.endsWith('ies') && clean.length > 4) return `${clean.slice(0, -3)}y`;
  if (clean.endsWith('ing') && clean.length > 5) return clean.slice(0, -3);
  if (clean.endsWith('ed') && clean.length > 4) return clean.slice(0, -2);
  if (clean.endsWith('es') && clean.length > 4) return clean.slice(0, -2);
  if (clean.endsWith('s') && !clean.endsWith('ss') && clean.length > 3) return clean.slice(0, -1);
  return clean;
}

export function extractSignificantKeywords(text?: string): string[] {
  if (!text) return [];
  const rawTokens = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t) && !/^\d+$/.test(t));

  const seen = new Set<string>();
  const out: string[] = [];
  for (const token of rawTokens) {
    const stem = normalizeWordStem(token);
    if (stem.length >= 3 && !STOPWORDS.has(stem) && !seen.has(stem)) {
      seen.add(stem);
      out.push(stem);
    }
  }
  return out;
}

export function extractReleaseYear(item: Pick<StremioMediaItem, 'year' | 'releaseInfo'>): number | null {
  const raw = `${item.year || ''} ${item.releaseInfo || ''}`;
  const match = raw.match(/\b(19\d{2}|20\d{2})\b/);
  if (!match) return null;
  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function detectConceptClustersForText(text: string): ConceptCluster[] {
  if (!text.trim()) return [];
  const lower = text.toLowerCase();
  const stems = new Set(extractSignificantKeywords(text));
  const matched: Array<{ cluster: ConceptCluster; hits: number }> = [];

  for (const cluster of SEMANTIC_CONCEPT_CLUSTERS) {
    let hits = 0;
    for (const kw of cluster.keywords) {
      if (kw.includes(' ')) {
        if (lower.includes(kw)) hits += 2;
      } else {
        const kwStem = normalizeWordStem(kw);
        if (
          stems.has(kwStem) ||
          new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(lower)
        ) {
          hits += 1;
        }
      }
    }
    if (hits > 0) {
      matched.push({ cluster, hits });
    }
  }

  return matched.sort((a, b) => b.hits - a.hits).map((m) => m.cluster);
}

export interface SimilarMediaResult {
  items: StremioMediaItem[];
  matchedConceptLabels: string[];
  targetYear: number | null;
}

/**
 * Intelligent multi-dimensional similarity ranking for the Movie/Series Details Page.
 * Scores candidates by:
 * 1. Concept & Theme Cluster overlap (post-apocalyptic, space, blood/vampire, time travel, heist, etc.)
 * 2. Synopsis & Title keyword overlap
 * 3. Multi-genre combination overlap
 * 4. Release Year / Era proximity
 * 5. Cast, Director & IMDb rating quality
 */
export function rankSimilarMediaItems(
  target: StremioMediaItem,
  candidates: StremioMediaItem[],
  limit = 12,
): SimilarMediaResult {
  const targetText = `${target.name} ${target.description || ''} ${target.genres.join(' ')}`;
  const targetClusters = detectConceptClustersForText(targetText);
  const targetClusterIds = new Set(targetClusters.map((c) => c.id));
  const targetKeywords = new Set(
    extractSignificantKeywords(`${target.name} ${target.description || ''}`),
  );
  const targetGenres = new Set(target.genres.map((g) => g.trim().toLowerCase()));
  const targetCast = new Set(target.cast.map((c) => c.trim().toLowerCase()));
  const targetDirectors = new Set(target.director.map((d) => d.trim().toLowerCase()));
  const targetYear = extractReleaseYear(target);

  const scored = candidates
    .filter((c) => c.id !== target.id)
    .map((candidate) => {
      let score = 0;

      // 1. Same media type (movie vs series)
      if (candidate.type === target.type) {
        score += 3.5;
      }

      // 2. Multi-Genre combination matching
      let genreMatches = 0;
      for (const g of candidate.genres) {
        if (targetGenres.has(g.trim().toLowerCase())) {
          genreMatches += 1;
          score += 4.5;
        }
      }
      if (genreMatches >= 2) {
        score += 4; // Multi-genre synergy bonus (e.g. Sci-Fi + Thriller)
      }
      if (genreMatches >= 3) {
        score += 3;
      }

      // 3. Semantic Concept Cluster matching (e.g. Post-Apocalyptic, Space, Blood/Vampire)
      const candText = `${candidate.name} ${candidate.description || ''} ${candidate.genres.join(' ')}`;
      const candClusters = detectConceptClustersForText(candText);
      let sharedClusterCount = 0;
      for (const cc of candClusters) {
        if (targetClusterIds.has(cc.id)) {
          sharedClusterCount += 1;
          score += 8.5;
        }
      }
      if (sharedClusterCount >= 2) {
        score += 4;
      }

      // 4. Direct Synopsis & Title Keyword Overlap
      const candKeywords = extractSignificantKeywords(
        `${candidate.name} ${candidate.description || ''}`,
      );
      let sharedKeywords = 0;
      for (const kw of candKeywords) {
        if (targetKeywords.has(kw)) {
          sharedKeywords += 1;
        }
      }
      score += Math.min(12, sharedKeywords * 2.5);

      // 5. Release Year / Era Proximity
      const candYear = extractReleaseYear(candidate);
      if (targetYear && candYear) {
        const diff = Math.abs(targetYear - candYear);
        if (diff <= 2) {
          score += 5;
        } else if (diff <= 5) {
          score += 3.5;
        } else if (diff <= 9) {
          score += 2;
        } else if (diff <= 15) {
          score += 0.8;
        }
      }

      // 6. Shared Director & Cast
      for (const d of candidate.director) {
        if (targetDirectors.has(d.trim().toLowerCase())) {
          score += 5;
        }
      }
      for (const c of candidate.cast) {
        if (targetCast.has(c.trim().toLowerCase())) {
          score += 3;
        }
      }

      // 7. IMDb Rating Quality Tie-Breaker
      const ratingNum = Number.parseFloat(candidate.imdbRating || '0');
      if (Number.isFinite(ratingNum) && ratingNum > 0) {
        score += ratingNum * 0.35;
      }

      return { candidate, score };
    });

  const topItems = scored
    .filter((entry) => entry.score > 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.candidate);

  return {
    items: topItems,
    matchedConceptLabels: targetClusters.slice(0, 2).map((c) => c.label),
    targetYear,
  };
}

export interface ParsedSuggestionPrompt {
  rawPrompt: string;
  mediaTypeFilter: 'all' | 'movie' | 'series';
  yearRange: { min: number; max: number; label: string } | null;
  minRating: number | null;
  matchedGenres: string[];
  matchedClusters: ConceptCluster[];
  significantKeywords: string[];
  cinemetaSearchTerms: string[];
}

/**
 * Parses a free-form natural language description, concept, genre, or year prompt
 * into structured semantic signals for the Smart Suggestions engine.
 */
export function parseNaturalLanguageSuggestionQuery(rawPrompt: string): ParsedSuggestionPrompt {
  const trimmed = rawPrompt.trim();
  const lower = trimmed.toLowerCase();

  // 1. Detect explicit media type if mentioned
  let mediaTypeFilter: 'all' | 'movie' | 'series' = 'all';
  const mentionsSeries = /\b(series|tv show|tv shows|shows|miniseries|season|episodes)\b/i.test(
    lower,
  );
  const mentionsMovie = /\b(movie|movies|film|films|cinema)\b/i.test(lower);
  if (mentionsSeries && !mentionsMovie) {
    mediaTypeFilter = 'series';
  } else if (mentionsMovie && !mentionsSeries) {
    mediaTypeFilter = 'movie';
  }

  // 2. Detect Year / Decade / Era constraints
  let yearRange: { min: number; max: number; label: string } | null = null;
  const betweenYears = lower.match(/\b(19\d{2}|20\d{2})\s*(?:-|to|and)\s*(19\d{2}|20\d{2})\b/);
  const afterYear = lower.match(/\b(?:after|since|from|post)\s+(19\d{2}|20\d{2})\b/);
  const beforeYear = lower.match(/\b(?:before|pre|prior to)\s+(19\d{2}|20\d{2})\b/);
  const decadeMatch = lower.match(/\b(1970s|70s|1980s|80s|1990s|90s|2000s|2010s|2020s)\b/);
  const singleYear = lower.match(/\b(19\d{2}|20\d{2})\b/);

  if (betweenYears) {
    const y1 = Number.parseInt(betweenYears[1], 10);
    const y2 = Number.parseInt(betweenYears[2], 10);
    const min = Math.min(y1, y2);
    const max = Math.max(y1, y2);
    yearRange = { min, max, label: `${min}–${max}` };
  } else if (afterYear) {
    const y = Number.parseInt(afterYear[1], 10);
    yearRange = { min: y, max: 2030, label: `${y}+` };
  } else if (beforeYear) {
    const y = Number.parseInt(beforeYear[1], 10);
    yearRange = { min: 1920, max: y, label: `Before ${y}` };
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
    if (map[token]) yearRange = map[token];
  } else if (singleYear) {
    const y = Number.parseInt(singleYear[1], 10);
    yearRange = { min: y - 1, max: y + 1, label: `${y}` };
  } else if (/\b(latest|recent|new release|modern)\b/i.test(lower)) {
    yearRange = { min: 2022, max: 2030, label: '2022–Present' };
  } else if (/\b(classic|retro|old school|vintage)\b/i.test(lower)) {
    yearRange = { min: 1950, max: 2004, label: 'Classic Era' };
  }

  // 3. Detect minimum rating constraints
  let minRating: number | null = null;
  const explicitRating = lower.match(/\b(?:rating|rated|imdb|above|over)\s*(\d(?:\.\d)?)\b/);
  if (explicitRating) {
    minRating = Number.parseFloat(explicitRating[1]);
  } else if (/\b(masterpiece|top rated|highest rated|high rated|best rated|acclaimed)\b/i.test(lower)) {
    minRating = 7.5;
  }

  // 4. Detect Concept Clusters
  const matchedClusters = detectConceptClustersForText(trimmed);

  // 5. Detect Explicit + Concept-Inferred Genres
  const genreSet = new Set<string>();
  for (const entry of CANONICAL_GENRES) {
    for (const syn of entry.synonyms) {
      if (syn.includes(' ')) {
        if (lower.includes(syn)) {
          genreSet.add(entry.genre);
        }
      } else if (new RegExp(`\\b${syn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(lower)) {
        genreSet.add(entry.genre);
      }
    }
  }
  for (const cluster of matchedClusters.slice(0, 2)) {
    for (const rg of cluster.relatedGenres.slice(0, 2)) {
      genreSet.add(rg);
    }
  }

  // 6. Significant Keywords & Cinemeta Search Terms
  const significantKeywords = extractSignificantKeywords(trimmed);
  const cinemetaSearchTerms: string[] = [];
  for (const cluster of matchedClusters.slice(0, 2)) {
    const matchedClusterKw = cluster.keywords.find((kw) => lower.includes(kw));
    if (matchedClusterKw) {
      cinemetaSearchTerms.push(matchedClusterKw);
    } else if (cluster.keywords[0]) {
      cinemetaSearchTerms.push(cluster.keywords[0]);
    }
  }
  for (const kw of significantKeywords) {
    if (!cinemetaSearchTerms.includes(kw) && cinemetaSearchTerms.length < 4) {
      cinemetaSearchTerms.push(kw);
    }
  }
  if (cinemetaSearchTerms.length === 0 && trimmed.length >= 2) {
    cinemetaSearchTerms.push(trimmed.slice(0, 40));
  }

  return {
    rawPrompt: trimmed,
    mediaTypeFilter,
    yearRange,
    minRating,
    matchedGenres: Array.from(genreSet),
    matchedClusters,
    significantKeywords,
    cinemetaSearchTerms,
  };
}

export interface ScoredSuggestionItem {
  item: StremioMediaItem;
  score: number;
  matchPercent: number;
  matchReasonLabel: string;
}

/**
 * Ranks candidate movies/series against a parsed natural-language suggestion query
 * from highest match (99% Match) down to lower matches (60% Match, 12% Match, etc.)
 * without artificially truncating the pool so infinite scroll can display hundreds of titles.
 */
export function scoreCandidatesForSuggestionPrompt(
  query: ParsedSuggestionPrompt,
  candidates: StremioMediaItem[],
  explicitMediaFilter: 'all' | 'movie' | 'series' = 'all',
  limit = 2000,
): ScoredSuggestionItem[] {
  const effectiveType =
    explicitMediaFilter !== 'all' ? explicitMediaFilter : query.mediaTypeFilter;
  const targetGenresLower = new Set(query.matchedGenres.map((g) => g.toLowerCase()));
  const targetClusterIds = new Set(query.matchedClusters.map((c) => c.id));
  const queryKeywords = new Set(query.significantKeywords);
  const rawLower = query.rawPrompt.trim().toLowerCase();
  const hasPrompt = rawLower.length > 0;

  const rawScored: Array<{ item: StremioMediaItem; score: number }> = [];

  for (const item of candidates) {
    if (effectiveType !== 'all' && item.type !== effectiveType) {
      continue;
    }

    const itemYear = extractReleaseYear(item);
    const itemRating = Number.parseFloat(item.imdbRating || '0');
    const validRating = Number.isFinite(itemRating) && itemRating > 0 ? itemRating : 6.2;

    if (!hasPrompt) {
      // Default discovery ranking when no prompt is entered yet
      const recencyBonus = itemYear && itemYear >= 2020 ? (itemYear - 2018) * 0.45 : 0;
      const baseScore = validRating * 2.2 + recencyBonus;
      rawScored.push({ item, score: baseScore });
      continue;
    }

    let score = 0;

    // Year / Era match
    if (query.yearRange && itemYear) {
      if (itemYear >= query.yearRange.min && itemYear <= query.yearRange.max) {
        score += 12;
      } else {
        const dist = Math.min(
          Math.abs(itemYear - query.yearRange.min),
          Math.abs(itemYear - query.yearRange.max),
        );
        if (dist <= 2) {
          score += 5;
        } else if (dist <= 5) {
          score += 1.5;
        } else {
          score -= 4;
        }
      }
    }

    // Minimum rating if requested
    if (query.minRating) {
      if (validRating >= query.minRating) {
        score += 7;
      } else if (validRating < query.minRating - 0.8) {
        score -= 3;
      }
    }

    // 1. Direct Title / Phrase match
    const itemNameLower = item.name.toLowerCase();
    if (rawLower.length >= 3 && itemNameLower.includes(rawLower)) {
      score += 22;
    }

    // 2. Semantic Concept Cluster Match
    const itemText = `${item.name} ${item.description || ''} ${item.genres.join(' ')}`;
    const itemClusters = detectConceptClustersForText(itemText);
    for (const ic of itemClusters) {
      if (targetClusterIds.has(ic.id)) {
        score += 14;
      }
    }

    // 3. Plot / Synopsis / Cast / Director Keyword Match
    const itemKeywords = new Set(
      extractSignificantKeywords(
        `${item.name} ${item.description || ''} ${item.director.join(' ')} ${item.cast.join(' ')}`,
      ),
    );
    let matchedKwCount = 0;
    for (const qkw of queryKeywords) {
      if (itemKeywords.has(qkw)) {
        matchedKwCount += 1;
        score += 6.5;
      }
    }
    if (matchedKwCount >= 2) {
      score += 4.5;
    }

    // 4. Genre Match
    let matchedGenreCount = 0;
    for (const g of item.genres) {
      if (targetGenresLower.has(g.trim().toLowerCase())) {
        matchedGenreCount += 1;
        score += 5;
      }
    }
    if (matchedGenreCount >= 2) {
      score += 4;
    }

    // 5. IMDb Quality Baseline (allows all candidates to be ranked down to low % matches)
    score += validRating * 0.45;

    rawScored.push({ item, score });
  }

  rawScored.sort((a, b) => b.score - a.score);
  const sliced = rawScored.slice(0, limit);
  if (sliced.length === 0) return [];

  const maxScore = Math.max(sliced[0].score, 1);
  const minScore = sliced[sliced.length - 1].score;
  const scoreSpan = Math.max(maxScore - minScore, 1);

  return sliced.map((entry, idx) => {
    let pct: number;
    if (!hasPrompt) {
      // Smoothly distribute default recommendations from 98% down to 45%
      const ratio = sliced.length > 1 ? 1 - idx / (sliced.length - 1) : 1;
      pct = Math.round(45 + ratio * 53);
    } else if (entry.score >= 22) {
      const topNorm = Math.min(1, (entry.score - 22) / Math.max(12, maxScore - 22));
      pct = Math.round(90 + topNorm * 9);
    } else if (entry.score >= 12) {
      const midHighNorm = (entry.score - 12) / 10;
      pct = Math.round(72 + midHighNorm * 17);
    } else if (entry.score >= 5.5) {
      const midNorm = (entry.score - 5.5) / 6.5;
      pct = Math.round(45 + midNorm * 26);
    } else {
      const lowNorm = Math.max(0, (entry.score - minScore) / scoreSpan);
      pct = Math.max(8, Math.min(44, Math.round(8 + lowNorm * 34)));
    }

    const clampedPct = Math.max(8, Math.min(99, pct));
    return {
      item: entry.item,
      score: entry.score,
      matchPercent: clampedPct,
      matchReasonLabel: `${clampedPct}% Match`,
    };
  });
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
    prompt: 'Deep space exploration, astronauts, alien worlds and cosmic sci-fi',
  },
  {
    label: 'Blood, Vampires & Dark Horror',
    prompt: 'Dark bloody vampire, supernatural horror and brutal slasher thrillers',
  },
  {
    label: 'Mind-Bending Psychological',
    prompt: 'Mind-bending psychological thriller with twists, paranoia and mystery',
  },
  {
    label: 'Time Travel & Multiverse',
    prompt: 'Time travel paradox, time loops and parallel universe sci-fi',
  },
  {
    label: 'Cyberpunk & AI Dystopia',
    prompt: 'Futuristic cyberpunk, artificial intelligence, robots and virtual reality',
  },
  {
    label: 'High-Stakes Heist & Crime',
    prompt: 'Mastermind bank heist, casino robbery and crime syndicate thriller',
  },
  {
    label: '2024–2025 Top Rated',
    prompt: 'Top rated acclaimed movies and series after 2024',
  },
];
