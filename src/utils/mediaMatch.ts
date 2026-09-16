import type { MediaType, MediaSource } from '../types/media';

export interface MatchableMedia {
  externalId?: string | number | null;
  source?: MediaSource | string | null;
  type?: MediaType | string | null;
  title?: string | null;
  year?: number | string | null;
  releaseDate?: string | null;
  firstAirDate?: string | null;
  imdbId?: string | null;
  tmdbId?: string | number | null;
  tvmazeId?: string | number | null;
  thetvdbId?: string | number | null;
}

/**
 * Extracts a normalized 4-digit release year string from an item, if available.
 */
export function extractReleaseYear(item: MatchableMedia): string | null {
  if (item.year !== undefined && item.year !== null) {
    const yStr = String(item.year).trim();
    if (yStr && yStr !== 'N/A' && !isNaN(Number(yStr.slice(0, 4)))) {
      return yStr.slice(0, 4);
    }
  }
  if (item.releaseDate) {
    const yStr = item.releaseDate.trim().slice(0, 4);
    if (yStr.length === 4 && !isNaN(Number(yStr))) return yStr;
  }
  if (item.firstAirDate) {
    const yStr = item.firstAirDate.trim().slice(0, 4);
    if (yStr.length === 4 && !isNaN(Number(yStr))) return yStr;
  }
  return null;
}

/**
 * Checks if two media entries represent the exact same work across the app
 * and across different metadata providers (TVMaze, TMDB, iTunes, Open Library).
 *
 * Rules:
 * 1. Exact Source & ID Match:
 *    - If both have the same source and same externalId, it is a definite match.
 * 2. Cross-Provider ID Matches (Issue #37):
 *    - If both have matching non-empty `imdbId`s, it is a definite match.
 *    - If one is TMDB and the other has a matching `tmdbId`, it is a match.
 *    - If one is TVMaze and the other has a matching `tvmazeId`, it is a match.
 *    - If both have matching `thetvdbId`s, it is a match.
 * 3. Same-Source API ID Mismatch (Issue #36):
 *    - If both entries share the same provider API source (e.g. both 'tvmaze' or both 'tmdb'),
 *      and their externalIds differ, they are distinct items and return false.
 * 4. Cross-Source Title + Year Match (Issue #37):
 *    - If entries come from different API providers (e.g. 'tvmaze' vs 'tmdb'):
 *      - Types must match.
 *      - Normalized titles must match.
 *      - Release years must both exist and match.
 * 5. Custom / Manual Fallback:
 *    - If one or both items are custom / lack provider IDs:
 *      - Types must match.
 *      - Normalized titles must match.
 *      - If release years exist on both, they must match.
 */
export function isMediaMatch(a: MatchableMedia, b: MatchableMedia): boolean {
  if (!a || !b) return false;

  const aHasApiId = Boolean(a.externalId && a.source && a.source !== 'custom');
  const bHasApiId = Boolean(b.externalId && b.source && b.source !== 'custom');

  // 1. Exact Provider ID Match (same source, same externalId)
  if (aHasApiId && bHasApiId && a.source === b.source) {
    return String(a.externalId) === String(b.externalId);
  }

  // 2. Cross-Provider External ID Reconciliation (Issue #37)
  // 2a. Matching IMDb IDs (e.g. 'tt14688458')
  if (a.imdbId && b.imdbId) {
    const aImdb = a.imdbId.trim().toLowerCase();
    const bImdb = b.imdbId.trim().toLowerCase();
    if (aImdb && bImdb) {
      if (aImdb === bImdb) return true;
      // Conflicting IMDb IDs means definitely different works
      return false;
    }
  }

  // 2b. Cross-source TMDB ID match
  if (a.source === 'tmdb' && b.tmdbId && String(a.externalId) === String(b.tmdbId)) {
    return true;
  }
  if (b.source === 'tmdb' && a.tmdbId && String(b.externalId) === String(a.tmdbId)) {
    return true;
  }

  // 2c. Cross-source TVMaze ID match
  if (a.source === 'tvmaze' && b.tvmazeId && String(a.externalId) === String(b.tvmazeId)) {
    return true;
  }
  if (b.source === 'tvmaze' && a.tvmazeId && String(b.externalId) === String(a.tvmazeId)) {
    return true;
  }

  // 2d. Cross-source TheTVDB ID match
  if (a.thetvdbId && b.thetvdbId && String(a.thetvdbId) === String(b.thetvdbId)) {
    return true;
  }

  // Basic type and title comparison
  const aType = a.type || 'tv';
  const bType = b.type || 'tv';
  if (aType !== bType) return false;

  const aTitle = a.title ? a.title.trim().toLowerCase() : '';
  const bTitle = b.title ? b.title.trim().toLowerCase() : '';
  if (!aTitle || !bTitle || aTitle !== bTitle) return false;

  const aYear = extractReleaseYear(a);
  const bYear = extractReleaseYear(b);

  // 3. Cross-Source API Match (e.g. TVMaze in library vs TMDB in search)
  // When comparing different API sources without cross-ref IDs, both must have matching release years
  if (aHasApiId && bHasApiId && a.source !== b.source) {
    if (aYear && bYear) {
      return aYear === bYear;
    }
    return false;
  }

  // 4. Custom / Manual Fallback
  if (aYear && bYear && aYear !== bYear) {
    return false;
  }

  return true;
}
