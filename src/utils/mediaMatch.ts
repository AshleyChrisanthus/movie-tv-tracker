import type { MediaType, MediaSource } from '../types/media';

export interface MatchableMedia {
  externalId?: string | number | null;
  source?: MediaSource | string | null;
  type?: MediaType | string | null;
  title?: string | null;
  year?: number | string | null;
  releaseDate?: string | null;
  firstAirDate?: string | null;
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
 * Checks if two media entries represent the exact same work.
 *
 * Rules:
 * 1. If both entries have an API provider ID (non-custom source and non-empty externalId):
 *    - Strict match: returns true IF AND ONLY IF `externalId` and `source` are identical.
 *    - If externalIds or sources differ, returns false immediately (even if titles match).
 * 2. If one or both entries are custom/manual (missing externalId or `source === 'custom'`):
 *    - Types must match (e.g. 'tv' === 'tv').
 *    - Normalized titles must match (case-insensitive, trimmed).
 *    - If both have release years, the release years MUST match.
 */
export function isMediaMatch(a: MatchableMedia, b: MatchableMedia): boolean {
  if (!a || !b) return false;

  const aHasApiId = Boolean(a.externalId && a.source && a.source !== 'custom');
  const bHasApiId = Boolean(b.externalId && b.source && b.source !== 'custom');

  // Both have provider API IDs: must match strictly by provider externalId and source
  if (aHasApiId && bHasApiId) {
    return String(a.externalId) === String(b.externalId) && a.source === b.source;
  }

  // At least one is custom / lacks API ID: check type, title, and release year
  const aType = a.type || 'tv';
  const bType = b.type || 'tv';
  if (aType !== bType) return false;

  const aTitle = a.title ? a.title.trim().toLowerCase() : '';
  const bTitle = b.title ? b.title.trim().toLowerCase() : '';
  if (!aTitle || !bTitle || aTitle !== bTitle) return false;

  // Check release years if available on both items
  const aYear = extractReleaseYear(a);
  const bYear = extractReleaseYear(b);
  if (aYear && bYear && aYear !== bYear) {
    return false;
  }

  return true;
}
