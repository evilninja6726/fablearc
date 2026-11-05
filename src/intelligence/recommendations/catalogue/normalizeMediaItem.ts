import { StremioMediaItem } from '../../../addons/stremioProtocol';
import { NormalizedMediaItem } from '../domain/recommendation.types';

export function normalizeTitleForIdentity(rawTitle: string): string {
  return (rawTitle || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\b(the|a|an)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractReleaseYearFromStremioItem(
  item: Pick<StremioMediaItem, 'year' | 'releaseInfo'>,
): number | null {
  const raw = `${item.year || ''} ${item.releaseInfo || ''}`.trim();
  if (!raw) return null;
  const match = raw.match(/\b(189\d|19\d{2}|20[0-3]\d)\b/);
  if (!match) return null;
  const parsed = Number.parseInt(match[1], 10);
  if (!Number.isFinite(parsed) || parsed < 1888 || parsed > 2035) {
    return null;
  }
  return parsed;
}

export function parseRuntimeMinutes(runtimeRaw?: string): number | null {
  if (!runtimeRaw) return null;
  const text = runtimeRaw.trim().toLowerCase();
  if (!text) return null;

  const hoursMinutes = text.match(/(\d+)\s*h(?:ours?|r|rs)?\s*(?:(\d+)\s*m(?:in(?:utes?)?)?)?/);
  if (hoursMinutes) {
    const hrs = Number.parseInt(hoursMinutes[1], 10);
    const mins = hoursMinutes[2] ? Number.parseInt(hoursMinutes[2], 10) : 0;
    const total = hrs * 60 + mins;
    return total > 0 && total < 1200 ? total : null;
  }

  const minutesOnly = text.match(/(\d+)\s*(?:min|mins|minute|minutes|m)\b/);
  if (minutesOnly) {
    const mins = Number.parseInt(minutesOnly[1], 10);
    return mins > 0 && mins < 1200 ? mins : null;
  }

  const bareNum = text.match(/^(\d{2,3})$/);
  if (bareNum) {
    const mins = Number.parseInt(bareNum[1], 10);
    return mins > 0 && mins < 1200 ? mins : null;
  }

  return null;
}

export function parseExplicitImdbRating(imdbRatingRaw?: string): number | null {
  if (!imdbRatingRaw) return null;
  const cleaned = String(imdbRatingRaw).trim();
  if (!cleaned || cleaned === 'N/A' || cleaned === '-') return null;
  const val = Number.parseFloat(cleaned);
  if (!Number.isFinite(val) || val <= 0 || val > 10) {
    return null;
  }
  return Math.round(val * 100) / 100;
}

export function deriveFranchiseIds(title: string): string[] {
  const raw = (title || '').trim();
  if (!raw) return [];
  const lower = raw.toLowerCase();
  const ids = new Set<string>();

  // Special known structural patterns like "28 Days Later" / "28 Weeks Later" / "28 Years Later"
  if (/\b28\s+(?:days|weeks|years|months)\s+later\b/i.test(lower)) {
    ids.add('franchise:28-later');
  }

  // Colon or dash subtitle separation: "Blade Runner 2049" / "Dune: Part Two" / "Mad Max: Fury Road"
  const colonSplit = raw.split(/\s*[:–—-]\s*/);
  if (colonSplit.length >= 2 && colonSplit[0].trim().length >= 4) {
    const baseRoot = normalizeTitleForIdentity(
      colonSplit[0].replace(/\b(part|vol|volume|chapter|book|\d+|ii|iii|iv|v)\b$/i, ''),
    );
    if (baseRoot.length >= 4) {
      ids.add(`franchise:${baseRoot.replace(/\s+/g, '-')}`);
    }
  }

  // Sequel number / Roman numeral suffix: "John Wick 4", "Alien 3", "Terminator 2"
  const sequelMatch = lower.match(
    /^([a-z0-9\s'&]{4,}?)\s+(?:part\s+|chapter\s+|vol\.?\s+)?(?:2|3|4|5|6|7|8|9|ii|iii|iv|v|vi|vii|2049|resurrection|reloaded|revolutions|retribution|apocalypse|afterlife|vendetta|awakens|returns|rises|begins|forever|reborn|legacy|origins)\b/i,
  );
  if (sequelMatch) {
    const root = normalizeTitleForIdentity(sequelMatch[1]);
    if (root.length >= 3) {
      ids.add(`franchise:${root.replace(/\s+/g, '-')}`);
    }
  }

  return Array.from(ids);
}

export function resolveCanonicalMediaId(item: StremioMediaItem): {
  canonicalId: string;
  sourceIds: Array<{ provider: string; id: string }>;
} {
  const sourceIds: Array<{ provider: string; id: string }> = [];
  const rawId = (item.id || '').trim();
  const rawImdb = (item.imdbId || '').trim();

  const imdbMatch =
    rawImdb.match(/\b(tt\d{5,10})\b/i) || rawId.match(/\b(tt\d{5,10})\b/i);

  if (imdbMatch) {
    const ttId = imdbMatch[1].toLowerCase();
    sourceIds.push({ provider: 'imdb', id: ttId });
    if (rawId && rawId.toLowerCase() !== ttId) {
      sourceIds.push({ provider: item.sourceAddonId || 'stremio', id: rawId });
    }
    return {
      canonicalId: `imdb:${ttId}`,
      sourceIds,
    };
  }

  if (rawId) {
    sourceIds.push({ provider: item.sourceAddonId || 'stremio', id: rawId });
  }

  const normTitle = normalizeTitleForIdentity(item.name || '');
  const releaseYear = extractReleaseYearFromStremioItem(item);
  const normType = item.type === 'series' ? 'series' : 'movie';

  if (normTitle) {
    return {
      canonicalId: `title:${normType}:${normTitle.replace(/\s+/g, '-')}:${releaseYear ?? 'unknown'}`,
      sourceIds,
    };
  }

  return {
    canonicalId: `provider:${item.sourceAddonId || 'stremio'}:${rawId || 'unknown'}`,
    sourceIds,
  };
}

export function inferLanguageFromCountryOrText(
  country?: string,
  description?: string,
): string | null {
  const c = (country || '').toLowerCase();
  if (!c && !description) return null;
  if (/\b(india|indian)\b/.test(c)) return 'Hindi';
  if (/\b(south korea|korea)\b/.test(c)) return 'Korean';
  if (/\b(japan)\b/.test(c)) return 'Japanese';
  if (/\b(france)\b/.test(c)) return 'French';
  if (/\b(spain|mexico|argentina|colombia)\b/.test(c)) return 'Spanish';
  if (/\b(germany|austria)\b/.test(c)) return 'German';
  if (/\b(italy)\b/.test(c)) return 'Italian';
  if (/\b(china|hong kong|taiwan)\b/.test(c)) return 'Chinese';
  if (/\b(united states|usa|uk|united kingdom|canada|australia|new zealand|ireland)\b/.test(c)) {
    return 'English';
  }
  return null;
}

export function computeMetadataCompleteness(item: {
  title: string;
  synopsis: string;
  genres: string[];
  releaseYear: number | null;
  hasRating: boolean;
  cast: string[];
  directors: string[];
  runtimeMinutes: number | null;
}): number {
  let score = 0;
  if (item.title.length > 0) score += 0.15;
  if (item.synopsis.length >= 40) score += 0.30;
  else if (item.synopsis.length > 0) score += 0.12;
  if (item.genres.length > 0) score += 0.20;
  if (item.releaseYear !== null) score += 0.12;
  if (item.hasRating) score += 0.10;
  if (item.cast.length > 0 || item.directors.length > 0) score += 0.08;
  if (item.runtimeMinutes !== null) score += 0.05;
  return Math.min(1, Math.round(score * 100) / 100);
}

export function normalizeMediaItem(item: StremioMediaItem): NormalizedMediaItem {
  const { canonicalId, sourceIds } = resolveCanonicalMediaId(item);
  const type: 'movie' | 'series' = item.type === 'series' ? 'series' : 'movie';
  const title = (item.name || '').trim();
  const normalizedTitle = normalizeTitleForIdentity(title);
  const releaseYear = extractReleaseYearFromStremioItem(item);
  const runtimeMinutes = parseRuntimeMinutes(item.runtime);
  const explicitRating = parseExplicitImdbRating(item.imdbRating);

  const genres = Array.from(
    new Set(
      (item.genres || [])
        .map((g) => (g || '').trim())
        .filter((g) => g.length > 0),
    ),
  );
  const cast = Array.from(
    new Set(
      (item.cast || [])
        .map((c) => (c || '').trim())
        .filter((c) => c.length > 0),
    ),
  );
  const directors = Array.from(
    new Set(
      (item.director || [])
        .map((d) => (d || '').trim())
        .filter((d) => d.length > 0),
    ),
  );
  const writers = Array.from(
    new Set(
      (item.writer || [])
        .map((w) => (w || '').trim())
        .filter((w) => w.length > 0),
    ),
  );

  const synopsis = (item.description || '').trim();
  const ratings =
    explicitRating !== null
      ? [
          {
            source: 'imdb',
            value: explicitRating,
            scaleMax: 10,
            voteCount: null,
            observedAt: null,
          },
        ]
      : [];

  const franchiseIds = deriveFranchiseIds(title);
  const metadataCompleteness = computeMetadataCompleteness({
    title,
    synopsis,
    genres,
    releaseYear,
    hasRating: ratings.length > 0,
    cast,
    directors,
    runtimeMinutes,
  });

  return {
    canonicalId,
    sourceIds,
    type,
    title,
    normalizedTitle,
    alternateTitles: [],
    releaseYear,
    releaseDate: item.releaseInfo || item.year || null,
    originalLanguage: inferLanguageFromCountryOrText(item.country, synopsis),
    country: item.country?.trim() || null,
    genres,
    synopsis,
    cast,
    directors,
    creators: type === 'series' ? directors : [],
    writers,
    runtimeMinutes,
    ratings,
    franchiseIds,
    relatedItemIds: [],
    awardsText: item.awards?.trim() || null,
    metadataCompleteness,
    metadataUpdatedAt: null,
  };
}

/**
 * Deduplicates StremioMediaItems by canonical identity (IMDb ID -> Provider ID -> Normalized Title + Release Year + Media Type).
 * Never merges two items solely because their titles are similar if their release years conflict.
 */
export function deduplicateStremioMediaItems(items: StremioMediaItem[]): {
  deduplicatedItems: StremioMediaItem[];
  normalizedByCanonicalId: Map<string, NormalizedMediaItem>;
  stremioByCanonicalId: Map<string, StremioMediaItem>;
} {
  const stremioByCanonicalId = new Map<string, StremioMediaItem>();
  const normalizedByCanonicalId = new Map<string, NormalizedMediaItem>();
  const titleYearIndex = new Map<string, string>();

  for (const rawItem of items) {
    if (!rawItem || !rawItem.id || !rawItem.name) continue;
    const norm = normalizeMediaItem(rawItem);
    const titleYearKey =
      norm.normalizedTitle && norm.releaseYear !== null
        ? `${norm.type}:${norm.normalizedTitle}:${norm.releaseYear}`
        : null;

    let targetCanonicalId = norm.canonicalId;
    if (!stremioByCanonicalId.has(targetCanonicalId) && titleYearKey) {
      const existingByTitleYear = titleYearIndex.get(titleYearKey);
      if (existingByTitleYear) {
        targetCanonicalId = existingByTitleYear;
      }
    }

    const existingStremio = stremioByCanonicalId.get(targetCanonicalId);
    if (!existingStremio) {
      stremioByCanonicalId.set(targetCanonicalId, rawItem);
      normalizedByCanonicalId.set(targetCanonicalId, {
        ...norm,
        canonicalId: targetCanonicalId,
      });
      if (titleYearKey) {
        titleYearIndex.set(titleYearKey, targetCanonicalId);
      }
    } else {
      const mergedStremio: StremioMediaItem = {
        ...existingStremio,
        imdbId: existingStremio.imdbId || rawItem.imdbId,
        description:
          (existingStremio.description || '').length >= (rawItem.description || '').length
            ? existingStremio.description
            : rawItem.description,
        genres:
          existingStremio.genres.length >= rawItem.genres.length
            ? existingStremio.genres
            : rawItem.genres,
        cast:
          existingStremio.cast.length >= rawItem.cast.length
            ? existingStremio.cast
            : rawItem.cast,
        director:
          existingStremio.director.length >= rawItem.director.length
            ? existingStremio.director
            : rawItem.director,
        writer:
          existingStremio.writer.length >= rawItem.writer.length
            ? existingStremio.writer
            : rawItem.writer,
        imdbRating: existingStremio.imdbRating || rawItem.imdbRating,
        year: existingStremio.year || rawItem.year,
        releaseInfo: existingStremio.releaseInfo || rawItem.releaseInfo,
        runtime: existingStremio.runtime || rawItem.runtime,
        country: existingStremio.country || rawItem.country,
        awards: existingStremio.awards || rawItem.awards,
        poster: existingStremio.poster || rawItem.poster,
        background: existingStremio.background || rawItem.background,
      };
      stremioByCanonicalId.set(targetCanonicalId, mergedStremio);
      const reNorm = normalizeMediaItem(mergedStremio);
      normalizedByCanonicalId.set(targetCanonicalId, {
        ...reNorm,
        canonicalId: targetCanonicalId,
      });
    }
  }

  return {
    deduplicatedItems: Array.from(stremioByCanonicalId.values()),
    normalizedByCanonicalId,
    stremioByCanonicalId,
  };
}
