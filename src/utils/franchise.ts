import type { MediaItem, MediaStatus, TMDBCollectionPart } from '../types';
import { isMediaMatch } from './mediaMatch';

export interface NextFranchiseMovieInfo {
  part: TMDBCollectionPart;
  currentIndex: number;
  nextIndex: number;
  totalParts: number;
  isAlreadyInLibrary: boolean;
  libraryItem: MediaItem | null;
  libraryStatus: MediaStatus | null;
  isCompleted: boolean;
}

export interface FranchisePartStatus {
  part: TMDBCollectionPart;
  index: number;
  isCurrent: boolean;
  isInLibrary: boolean;
  libraryItem: MediaItem | null;
  status: MediaStatus | null;
}

/**
 * Sorts TMDB collection parts chronologically by release date.
 */
export function sortCollectionPartsChronologically(parts: TMDBCollectionPart[]): TMDBCollectionPart[] {
  return [...parts].sort((a, b) => {
    if (!a.release_date) return 1;
    if (!b.release_date) return -1;
    return a.release_date.localeCompare(b.release_date);
  });
}

/**
 * Finds the index of a given movie within a collection's parts list.
 */
export function findPartIndexForMedia(media: MediaItem, parts: TMDBCollectionPart[]): number {
  if (!media || !parts || parts.length === 0) return -1;

  // 1. Direct TMDB ID / external ID match
  const mediaTmdbId = media.tmdbId ? String(media.tmdbId) : (media.source === 'tmdb' && media.externalId ? String(media.externalId) : null);
  if (mediaTmdbId) {
    const idx = parts.findIndex(p => String(p.id) === mediaTmdbId);
    if (idx !== -1) return idx;
  }

  // 2. Normalized title and release year match
  const mediaTitleNorm = (media.title || '').trim().toLowerCase();
  const mediaYear = media.year ? String(media.year) : (media.releaseDate ? media.releaseDate.slice(0, 4) : '');

  const titleYearMatch = parts.findIndex(p => {
    const partTitleNorm = (p.title || '').trim().toLowerCase();
    const partYear = p.release_date ? p.release_date.slice(0, 4) : '';
    if (partTitleNorm === mediaTitleNorm) {
      if (mediaYear && partYear) return mediaYear === partYear;
      return true;
    }
    return false;
  });
  if (titleYearMatch !== -1) return titleYearMatch;

  // 3. Fallback: fuzzy/partial title match if titles match loosely
  return parts.findIndex(p => {
    const pTitle = (p.title || '').trim().toLowerCase();
    return pTitle === mediaTitleNorm;
  });
}

/**
 * Matches a TMDBCollectionPart against the user's current library items.
 */
export function matchPartToLibrary(part: TMDBCollectionPart, libraryItems: MediaItem[]): MediaItem | null {
  if (!part || !libraryItems || libraryItems.length === 0) return null;

  // 1. Check exact TMDB ID match
  const partIdStr = String(part.id);
  const exactIdMatch = libraryItems.find(item => 
    item.type === 'movie' && (
      (item.source === 'tmdb' && String(item.externalId) === partIdStr) ||
      (item.tmdbId && String(item.tmdbId) === partIdStr)
    )
  );
  if (exactIdMatch) return exactIdMatch;

  // 2. Fallback to title and release year matching via isMediaMatch
  const partYear = part.release_date ? parseInt(part.release_date.slice(0, 4), 10) : undefined;
  const dummyMedia: Partial<MediaItem> = {
    type: 'movie',
    source: 'tmdb',
    externalId: part.id,
    tmdbId: part.id,
    title: part.title,
    year: partYear
  };

  const matched = libraryItems.find(item => 
    item.type === 'movie' && isMediaMatch(dummyMedia as MediaItem, item)
  );
  return matched || null;
}

/**
 * Identifies the next uncompleted movie in a franchise collection relative to the current movie.
 */
export function getNextFranchiseMovie(
  currentMovie: MediaItem,
  rawParts: TMDBCollectionPart[],
  libraryItems: MediaItem[] = []
): NextFranchiseMovieInfo | null {
  if (!currentMovie || !rawParts || rawParts.length === 0) return null;

  const sortedParts = sortCollectionPartsChronologically(rawParts);
  const currentIndex = findPartIndexForMedia(currentMovie, sortedParts);

  // If current movie is not recognized in collection parts, or is the last part
  if (currentIndex === -1 || currentIndex >= sortedParts.length - 1) {
    return null;
  }

  // Iterate subsequent parts chronologically
  const subsequentParts = sortedParts.slice(currentIndex + 1);
  for (const part of subsequentParts) {
    const matchedMedia = matchPartToLibrary(part, libraryItems);
    const isCompleted = matchedMedia?.status === 'completed';

    // If user has already watched this sequel, keep checking for the next one
    if (isCompleted) {
      continue;
    }

    // Found next uncompleted sequel!
    return {
      part,
      currentIndex,
      nextIndex: sortedParts.indexOf(part),
      totalParts: sortedParts.length,
      isAlreadyInLibrary: Boolean(matchedMedia),
      libraryItem: matchedMedia,
      libraryStatus: matchedMedia ? matchedMedia.status : null,
      isCompleted: false
    };
  }

  return null;
}

/**
 * Generates annotated sequence list of all parts in a collection with their library tracking status.
 */
export function getFranchisePartsWithLibraryStatus(
  rawParts: TMDBCollectionPart[],
  currentMovie: MediaItem,
  libraryItems: MediaItem[] = []
): FranchisePartStatus[] {
  if (!rawParts || rawParts.length === 0) return [];
  const sortedParts = sortCollectionPartsChronologically(rawParts);
  const currentPartIndex = findPartIndexForMedia(currentMovie, sortedParts);

  return sortedParts.map((part, index) => {
    const isCurrent = index === currentPartIndex;
    const libraryItem = isCurrent ? currentMovie : matchPartToLibrary(part, libraryItems);
    return {
      part,
      index,
      isCurrent,
      isInLibrary: Boolean(libraryItem),
      libraryItem,
      status: libraryItem ? libraryItem.status : null
    };
  });
}

/**
 * Builds a valid Partial<MediaItem> payload from a TMDB Collection Part ready to save into Dexie.
 */
export function createMediaItemFromCollectionPart(
  part: TMDBCollectionPart,
  collection: { id: number | string; name: string },
  initialStatus: MediaStatus = 'plan_to_watch'
): Partial<MediaItem> {
  const year = part.release_date ? parseInt(part.release_date.slice(0, 4), 10) : 'N/A';
  const posterUrl = part.poster_path 
    ? (part.poster_path.startsWith('http') ? part.poster_path : `https://image.tmdb.org/t/p/w500${part.poster_path}`)
    : null;
  const backdropUrl = part.backdrop_path
    ? (part.backdrop_path.startsWith('http') ? part.backdrop_path : `https://image.tmdb.org/t/p/original${part.backdrop_path}`)
    : null;
  const communityRating = typeof part.vote_average === 'number' && part.vote_average > 0
    ? Number(part.vote_average.toFixed(1))
    : null;

  return {
    type: 'movie',
    source: 'tmdb',
    externalId: part.id,
    tmdbId: part.id,
    title: part.title,
    year: isNaN(Number(year)) ? 'N/A' : Number(year),
    releaseDate: part.release_date || '',
    overview: part.overview || '',
    posterUrl,
    backdropUrl,
    communityRating,
    communityRatingCount: part.vote_count || null,
    collectionId: collection.id,
    collectionName: collection.name,
    status: initialStatus,
    totalSeasons: 0,
    totalEpisodes: 1,
    watchedEpisodesCount: initialStatus === 'completed' ? 1 : 0
  };
}
