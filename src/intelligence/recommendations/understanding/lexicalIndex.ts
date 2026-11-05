import { NormalizedMediaItem } from '../domain/recommendation.types';

const CONTENT_INDEX_STOPWORDS = new Set([
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
  'within',
  'along',
  'following',
  'across',
  'behind',
  'beyond',
  'plus',
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
  'finds',
  'take',
  'takes',
  'make',
  'makes',
  'year',
  'years',
  'also',
  'however',
  'upon',
  'every',
  'each',
]);

// Curated concept synonym expansion for lexical bridge ("lonely astronaut" <-> "stranded scientist beyond earth")
const CONCEPT_LEXICAL_SYNONYM_MAP: Record<string, string[]> = {
  astronaut: ['spacecraft', 'space', 'planet', 'orbit', 'stranded', 'cosmos'],
  wormhole: ['interstellar', 'space', 'relativity', 'galaxy', 'planet'],
  virus: ['outbreak', 'pandemic', 'infected', 'plague', 'quarantine', 'apocalyptic'],
  outbreak: ['virus', 'pandemic', 'infected', 'survivor', 'apocalyptic'],
  vampire: ['blood', 'immortal', 'fangs', 'dracula', 'slaughter', 'supernatural'],
  heist: ['robbery', 'vault', 'thief', 'casino', 'mastermind', 'steal'],
  detective: ['investigation', 'murder', 'homicide', 'suspect', 'clue', 'serial'],
  paradox: ['timeline', 'time', 'multiverse', 'loop'],
  cyberpunk: ['android', 'simulation', 'neural', 'hacker', 'dystopian'],
  isolated: ['lonely', 'stranded', 'solitude', 'alone'],
  lonely: ['isolated', 'stranded', 'solitude', 'alone'],
};

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
    .filter((t) => t.length >= 3 && !CONTENT_INDEX_STOPWORDS.has(t) && !/^\d+$/.test(t));

  const seen = new Set<string>();
  const out: string[] = [];
  for (const token of rawTokens) {
    const stem = normalizeWordStem(token);
    if (stem.length >= 3 && !CONTENT_INDEX_STOPWORDS.has(stem) && !seen.has(stem)) {
      seen.add(stem);
      out.push(stem);
    }
  }
  return out;
}

export function extractTermFrequencies(text: string): Map<string, number> {
  const tf = new Map<string, number>();
  if (!text) return tf;
  const rawTokens = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !CONTENT_INDEX_STOPWORDS.has(t) && !/^\d+$/.test(t));

  for (const token of rawTokens) {
    const stem = normalizeWordStem(token);
    if (stem.length >= 3 && !CONTENT_INDEX_STOPWORDS.has(stem)) {
      tf.set(stem, (tf.get(stem) ?? 0) + 1);
    }
  }
  return tf;
}

export function expandQueryTermsWithSynonyms(terms: string[]): Map<string, number> {
  const weighted = new Map<string, number>();
  for (const rawTerm of terms) {
    const stem = normalizeWordStem(rawTerm);
    if (!stem) continue;
    weighted.set(stem, Math.max(weighted.get(stem) ?? 0, 1.0));
    const expansions =
      CONCEPT_LEXICAL_SYNONYM_MAP[rawTerm.toLowerCase()] ||
      CONCEPT_LEXICAL_SYNONYM_MAP[stem] ||
      [];
    for (const exp of expansions) {
      const expStem = normalizeWordStem(exp);
      if (expStem && !weighted.has(expStem)) {
        weighted.set(expStem, 0.45);
      }
    }
  }
  return weighted;
}

export interface LexicalDocumentEntry {
  canonicalId: string;
  docLength: number;
  termFreqs: Map<string, number>;
  titleStems: Set<string>;
}

/**
 * In-memory BM25 / TF-IDF inverted index over normalized catalogue items.
 */
export class LexicalCorpusIndex {
  private readonly docs = new Map<string, LexicalDocumentEntry>();
  private readonly df = new Map<string, number>();
  private readonly invertedIndex = new Map<string, Set<string>>();
  private avgDocLength = 1;
  private totalDocs = 0;

  constructor(items: NormalizedMediaItem[]) {
    let totalLength = 0;
    for (const item of items) {
      const combinedText = `${item.title} ${item.title} ${item.synopsis} ${item.genres.join(' ')}`;
      const termFreqs = extractTermFrequencies(combinedText);
      const titleStems = new Set(extractSignificantKeywords(item.title));
      let docLength = 0;
      termFreqs.forEach((count, term) => {
        docLength += count;
        this.df.set(term, (this.df.get(term) ?? 0) + 1);
        let bucket = this.invertedIndex.get(term);
        if (!bucket) {
          bucket = new Set<string>();
          this.invertedIndex.set(term, bucket);
        }
        bucket.add(item.canonicalId);
      });

      this.docs.set(item.canonicalId, {
        canonicalId: item.canonicalId,
        docLength: Math.max(1, docLength),
        termFreqs,
        titleStems,
      });
      totalLength += Math.max(1, docLength);
    }

    this.totalDocs = Math.max(1, items.length);
    this.avgDocLength = totalLength > 0 ? totalLength / this.totalDocs : 1;
  }

  public getIdf(term: string): number {
    const docFreq = this.df.get(term) ?? 0;
    return Math.log(1 + (this.totalDocs - docFreq + 0.5) / (docFreq + 0.5));
  }

  public retrieveCandidateIdsForTerms(terms: string[], maxCandidates = 400): Set<string> {
    const expanded = expandQueryTermsWithSynonyms(terms);
    const hitCounts = new Map<string, number>();
    expanded.forEach((weight, term) => {
      const matchingIds = this.invertedIndex.get(term);
      if (!matchingIds) return;
      const idf = this.getIdf(term);
      matchingIds.forEach((id) => {
        hitCounts.set(id, (hitCounts.get(id) ?? 0) + weight * idf);
      });
    });

    return new Set(
      Array.from(hitCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, maxCandidates)
        .map(([id]) => id),
    );
  }

  /**
   * Computes bounded [0, 1] BM25 + title-match score for a candidate against query terms.
   */
  public scoreBm25(canonicalId: string, rawQueryTerms: string[], rawQueryPhrase?: string): number {
    if (rawQueryTerms.length === 0 && !rawQueryPhrase) return 0;
    const doc = this.docs.get(canonicalId);
    if (!doc) return 0;

    const expandedTerms = expandQueryTermsWithSynonyms(rawQueryTerms);
    const k1 = 1.5;
    const b = 0.75;

    let rawBm25 = 0;
    let idealMaxBm25 = 0;

    expandedTerms.forEach((queryWeight, term) => {
      const idf = this.getIdf(term);
      idealMaxBm25 += queryWeight * idf * 1.8;

      const freq = doc.termFreqs.get(term) ?? 0;
      if (freq <= 0) return;

      const numerator = freq * (k1 + 1);
      const denominator = freq + k1 * (1 - b + b * (doc.docLength / this.avgDocLength));
      let termScore = idf * (numerator / denominator) * queryWeight;

      if (doc.titleStems.has(term)) {
        termScore *= 1.45;
      }
      rawBm25 += termScore;
    });

    if (idealMaxBm25 <= 0) return 0;
    const normalized = Math.min(1, rawBm25 / Math.max(2.2, idealMaxBm25 * 0.65));
    return Math.round(normalized * 1000) / 1000;
  }
}

let cachedIndexSignature = '';
let cachedIndexInstance: LexicalCorpusIndex | null = null;

export function getOrBuildLexicalIndex(items: NormalizedMediaItem[]): LexicalCorpusIndex {
  const firstId = items[0]?.canonicalId || '';
  const lastId = items[items.length - 1]?.canonicalId || '';
  const signature = `${items.length}:${firstId}:${lastId}`;
  if (cachedIndexInstance && cachedIndexSignature === signature) {
    return cachedIndexInstance;
  }
  cachedIndexInstance = new LexicalCorpusIndex(items);
  cachedIndexSignature = signature;
  return cachedIndexInstance;
}
