/**
 * API Service for fetching Movie & TV Show metadata.
 * Supports:
 * 1. TMDB API (Rich Movies + TV Shows with full episode data when API key is configured)
 * 2. TVMaze API (TV Shows with zero API key configuration needed)
 * 3. iTunes Search API (Free fallback for movie search when no TMDB key is set)
 */

import { getSetting, getEpisodesForMedia, saveMediaItem, touchMediaSyncedAt } from '../db/index';
import type {
  MediaItem,
  EpisodeItem,
  WatchedStatus,
  MediaSource,
  MediaType,
  SyncResult,
  SyncQueueOptions,
  SyncQueueResult,
  MediaSearchResult,
  FullMediaDetailsResponse,
  TMDBMovie,
  TMDBTV,
  TMDBSeasonDetail,
  TMDBMultiSearchResult,
  TVMazeShow,
  TVMazeSearchResultItem,
  TVMazeEpisode,
  ITunesResult,
  ITunesSearchResponse
} from '../types';

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p';
const TVMAZE_BASE_URL = 'https://api.tvmaze.com';

/**
 * Retrieve TMDB API key from IndexedDB or Vite env.
 */
export async function getTmdbApiKey(): Promise<string> {
  const savedKey = await getSetting<string>('tmdb_api_key');
  return savedKey || import.meta.env?.VITE_TMDB_API_KEY || '';
}

/**
 * Search movies and TV shows.
 * Intelligently switches between TMDB (if key exists) and TVMaze + iTunes (if no key).
 */
export async function searchMedia(query?: string | null): Promise<MediaSearchResult[]> {
  if (!query || query.trim().length === 0) return [];
  const trimmed = query.trim();
  const apiKey = await getTmdbApiKey();

  if (apiKey) {
    try {
      return await searchTMDB(trimmed, apiKey);
    } catch (err) {
      console.warn('TMDB search failed, falling back to free providers:', err);
    }
  }

  // Fallback: TVMaze for TV shows + iTunes for movies (zero config needed)
  return await searchFreeProviders(trimmed);
}

/**
 * Search TMDB (Movies and TV Shows)
 */
async function searchTMDB(query: string, apiKey: string): Promise<MediaSearchResult[]> {
  const url = `${TMDB_BASE_URL}/search/multi?api_key=${encodeURIComponent(apiKey)}&query=${encodeURIComponent(query)}&include_adult=false`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`TMDB error: ${res.statusText}`);
  }
  const data: TMDBMultiSearchResult = await res.json();

  return (data.results || [])
    .filter((item): item is (TMDBMovie | TMDBTV) & { media_type: 'movie' | 'tv' } => item.media_type === 'tv' || item.media_type === 'movie')
    .map((item): MediaSearchResult => {
      const isTv = item.media_type === 'tv';
      const title = isTv ? (item as TMDBTV).name : (item as TMDBMovie).title;
      const releaseDate = isTv ? (item as TMDBTV).first_air_date : (item as TMDBMovie).release_date;
      const year = releaseDate ? new Date(releaseDate).getFullYear() : 'N/A';
      const posterUrl = item.poster_path ? `${TMDB_IMAGE_BASE}/w500${item.poster_path}` : null;
      const backdropUrl = item.backdrop_path ? `${TMDB_IMAGE_BASE}/original${item.backdrop_path}` : null;

      return {
        externalId: item.id,
        source: 'tmdb',
        type: isTv ? 'tv' : 'movie',
        title: title || 'Untitled',
        year,
        releaseDate: releaseDate || '',
        overview: item.overview || '',
        rating: item.vote_average ? Number(item.vote_average.toFixed(1)) : null,
        posterUrl,
        backdropUrl,
        popularity: item.popularity || 0
      };
    })
    .sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
}

/**
 * Search TVMaze (TV shows) and iTunes (Movies) with zero API keys required
 */
async function searchFreeProviders(query: string): Promise<MediaSearchResult[]> {
  const [tvResults, movieResults] = await Promise.allSettled([
    searchTVMaze(query),
    searchITunesMovies(query)
  ]);

  const tv = tvResults.status === 'fulfilled' ? tvResults.value : [];
  const movies = movieResults.status === 'fulfilled' ? movieResults.value : [];

  // Interleave or combine results with TV prioritized for matched queries
  return [...tv, ...movies];
}

/**
 * Free TV Show Search via TVMaze
 */
async function searchTVMaze(query: string): Promise<MediaSearchResult[]> {
  try {
    const res = await fetch(`${TVMAZE_BASE_URL}/search/shows?q=${encodeURIComponent(query)}`);
    if (!res.ok) return [];
    const data: TVMazeSearchResultItem[] = await res.json();

    return data.map(({ show }): MediaSearchResult => {
      const year = show.premiered ? new Date(show.premiered).getFullYear() : 'N/A';
      // Strip HTML tags from TVMaze summary
      const cleanOverview = show.summary ? show.summary.replace(/<[^>]*>?/gm, '') : '';

      return {
        externalId: show.id,
        source: 'tvmaze',
        type: 'tv',
        title: show.name,
        year,
        releaseDate: show.premiered || '',
        overview: cleanOverview,
        rating: show.rating?.average ? Number(show.rating.average) : null,
        posterUrl: show.image?.medium || show.image?.original || null,
        backdropUrl: show.image?.original || null,
        genres: show.genres || [],
        status: show.status
      };
    });
  } catch (err) {
    console.error('TVMaze search error:', err);
    return [];
  }
}

/**
 * Free Movie Search via iTunes API (Fallback when no TMDB key is provided)
 */
async function searchITunesMovies(query: string): Promise<MediaSearchResult[]> {
  try {
    const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=movie&entity=movie&limit=8`);
    if (!res.ok) return [];
    const data: ITunesSearchResponse = await res.json();

    return (data.results || []).map((movie: ITunesResult): MediaSearchResult => {
      const year = movie.releaseDate ? new Date(movie.releaseDate).getFullYear() : 'N/A';
      // Upgrade iTunes 100x100 artwork to higher resolution (600x600)
      const posterUrl = movie.artworkUrl100
        ? movie.artworkUrl100.replace('100x100bb.jpg', '600x600bb.jpg')
        : null;

      return {
        externalId: movie.trackId,
        source: 'itunes',
        type: 'movie',
        title: movie.trackName,
        year,
        releaseDate: movie.releaseDate ? movie.releaseDate.split('T')[0] : '',
        overview: movie.longDescription || movie.shortDescription || '',
        rating: null,
        posterUrl,
        backdropUrl: posterUrl,
        genres: movie.primaryGenreName ? [movie.primaryGenreName] : []
      };
    });
  } catch (err) {
    console.error('iTunes movie search error:', err);
    return [];
  }
}

/**
 * Fetch complete media details along with full season and episode lists.
 */
export async function fetchFullMediaDetails(
  item: Partial<MediaItem> & { externalId?: string | number; source?: MediaSource; type?: MediaType }
): Promise<FullMediaDetailsResponse> {
  const apiKey = await getTmdbApiKey();

  if (item.source === 'tmdb' && apiKey && item.externalId) {
    if (item.type === 'movie') {
      return await fetchTMDBMovieDetails(item.externalId, apiKey, item);
    } else {
      return await fetchTMDBTVDetails(item.externalId, apiKey, item);
    }
  }

  if (item.source === 'tvmaze' || item.type === 'tv') {
    return await fetchTVMazeDetails(item.externalId || item.id || '', item);
  }

  // Standalone movie without TMDB key
  return {
    media: {
      ...item,
      totalSeasons: 0,
      totalEpisodes: 1,
      watchedEpisodesCount: 0
    },
    episodes: []
  };
}

/**
 * Fetch full TV show details and episodes from TVMaze
 */
async function fetchTVMazeDetails(
  showId: string | number,
  fallbackItem: Partial<MediaItem> = {}
): Promise<FullMediaDetailsResponse> {
  const [showRes, episodesRes] = await Promise.all([
    fetch(`${TVMAZE_BASE_URL}/shows/${showId}`).catch(() => null),
    fetch(`${TVMAZE_BASE_URL}/shows/${showId}/episodes`).catch(() => null)
  ]);

  let showData: TVMazeShow | null = null;
  if (showRes && showRes.ok) {
    showData = await showRes.json();
  }

  let episodesData: TVMazeEpisode[] = [];
  if (episodesRes && episodesRes.ok) {
    episodesData = await episodesRes.json();
  }

  const cleanOverview = showData?.summary
    ? showData.summary.replace(/<[^>]*>?/gm, '')
    : fallbackItem.overview || '';

  // Process episodes
  const formattedEpisodes: Omit<EpisodeItem, 'id' | 'mediaId'>[] = episodesData.map(ep => {
    const epCleanSummary = ep.summary ? ep.summary.replace(/<[^>]*>?/gm, '') : '';
    return {
      seasonNumber: ep.season,
      episodeNumber: ep.number,
      title: ep.name || `Episode ${ep.number}`,
      overview: epCleanSummary,
      airDate: ep.airdate || '',
      runtime: ep.runtime || null,
      stillUrl: ep.image?.medium || ep.image?.original || null,
      isWatched: 0 as WatchedStatus
    };
  });

  // Calculate highest season number
  const maxSeason = formattedEpisodes.reduce((max, ep) => Math.max(max, ep.seasonNumber), 1);

  const media: Partial<MediaItem> = {
    ...fallbackItem,
    title: showData?.name || fallbackItem.title,
    year: showData?.premiered ? new Date(showData.premiered).getFullYear() : fallbackItem.year,
    overview: cleanOverview,
    posterUrl: showData?.image?.original || showData?.image?.medium || fallbackItem.posterUrl,
    backdropUrl: showData?.image?.original || fallbackItem.backdropUrl,
    type: 'tv',
    source: 'tvmaze',
    externalId: showId,
    totalSeasons: maxSeason,
    totalEpisodes: formattedEpisodes.length,
    watchedEpisodesCount: 0,
    currentSeason: 1,
    currentEpisode: 0
  };

  return { media, episodes: formattedEpisodes };
}

/**
 * Fetch TV show details and all episodes for all seasons from TMDB
 */
async function fetchTMDBTVDetails(
  showId: string | number,
  apiKey: string,
  fallbackItem: Partial<MediaItem> = {}
): Promise<FullMediaDetailsResponse> {
  const res = await fetch(`${TMDB_BASE_URL}/tv/${showId}?api_key=${encodeURIComponent(apiKey)}`);
  if (!res.ok) throw new Error('Failed to fetch TMDB TV details');
  const data: TMDBTV = await res.json();

  const regularSeasons = (data.seasons || []).filter(s => s.season_number > 0);

  // Fetch episodes for all seasons concurrently
  const seasonPromises = regularSeasons.map(async season => {
    try {
      const sRes = await fetch(`${TMDB_BASE_URL}/tv/${showId}/season/${season.season_number}?api_key=${encodeURIComponent(apiKey)}`);
      if (!sRes.ok) return [];
      const sData: TMDBSeasonDetail = await sRes.json();
      return (sData.episodes || []).map((ep): Omit<EpisodeItem, 'id' | 'mediaId'> => ({
        seasonNumber: ep.season_number,
        episodeNumber: ep.episode_number,
        title: ep.name || `Episode ${ep.episode_number}`,
        overview: ep.overview || '',
        airDate: ep.air_date || '',
        runtime: ep.runtime || null,
        stillUrl: ep.still_path ? `${TMDB_IMAGE_BASE}/w500${ep.still_path}` : null,
        isWatched: 0 as WatchedStatus
      }));
    } catch {
      return [];
    }
  });

  const seasonEpisodesArrays = await Promise.all(seasonPromises);
  const allEpisodes = seasonEpisodesArrays.flat();

  const media: Partial<MediaItem> = {
    ...fallbackItem,
    title: data.name || fallbackItem.title,
    year: data.first_air_date ? new Date(data.first_air_date).getFullYear() : fallbackItem.year,
    overview: data.overview || fallbackItem.overview,
    posterUrl: data.poster_path ? `${TMDB_IMAGE_BASE}/w500${data.poster_path}` : fallbackItem.posterUrl,
    backdropUrl: data.backdrop_path ? `${TMDB_IMAGE_BASE}/original${data.backdrop_path}` : fallbackItem.backdropUrl,
    type: 'tv',
    source: 'tmdb',
    externalId: showId,
    totalSeasons: regularSeasons.length || data.number_of_seasons || 1,
    totalEpisodes: allEpisodes.length || data.number_of_episodes || 0,
    watchedEpisodesCount: 0,
    currentSeason: 1,
    currentEpisode: 0
  };

  return { media, episodes: allEpisodes };
}

/**
 * Fetch Movie details from TMDB
 */
async function fetchTMDBMovieDetails(
  movieId: string | number,
  apiKey: string,
  fallbackItem: Partial<MediaItem> = {}
): Promise<FullMediaDetailsResponse> {
  const res = await fetch(`${TMDB_BASE_URL}/movie/${movieId}?api_key=${encodeURIComponent(apiKey)}`);
  if (!res.ok) throw new Error('Failed to fetch TMDB movie details');
  const data: TMDBMovie = await res.json();

  const media: Partial<MediaItem> = {
    ...fallbackItem,
    title: data.title || fallbackItem.title,
    year: data.release_date ? new Date(data.release_date).getFullYear() : fallbackItem.year,
    overview: data.overview || fallbackItem.overview,
    posterUrl: data.poster_path ? `${TMDB_IMAGE_BASE}/w500${data.poster_path}` : fallbackItem.posterUrl,
    backdropUrl: data.backdrop_path ? `${TMDB_IMAGE_BASE}/original${data.backdrop_path}` : fallbackItem.backdropUrl,
    type: 'movie',
    source: 'tmdb',
    externalId: movieId,
    totalSeasons: 0,
    totalEpisodes: 1,
    watchedEpisodesCount: 0,
    runtime: data.runtime || null
  };

  return { media, episodes: [] };
}

/**
 * Smart Sync: Check TVMaze/TMDB for newly dropped seasons or updated episode titles,
 * and merge them into IndexedDB while strictly preserving all existing watch progress and notes.
 */
export async function syncMediaEpisodes(mediaItem: MediaItem): Promise<SyncResult> {
  if (!mediaItem || mediaItem.type !== 'tv' || !mediaItem.externalId) {
    return { hasUpdates: false, newEpisodesCount: 0, updatedTitlesCount: 0 };
  }

  try {
    const freshData = await fetchFullMediaDetails(mediaItem);
    const existingEpisodes = await getEpisodesForMedia(mediaItem.id);

    const existingMap = new Map<string, EpisodeItem>();
    for (const ep of existingEpisodes) {
      existingMap.set(`${ep.seasonNumber}_${ep.episodeNumber}`, ep);
    }

    let newEpisodesCount = 0;
    let updatedTitlesCount = 0;

    const mergedEpisodes: EpisodeItem[] = (freshData.episodes || []).map(freshEp => {
      const key = `${freshEp.seasonNumber}_${freshEp.episodeNumber}`;
      const existing = existingMap.get(key);

      if (existing) {
        // Check if title was updated from a generic placeholder to an official title
        if (existing.title !== freshEp.title && freshEp.title && !existing.title?.startsWith('Custom')) {
          updatedTitlesCount++;
        }
        return {
          ...freshEp,
          id: existing.id,
          mediaId: mediaItem.id,
          // Strictly retain watched state and timestamp!
          isWatched: existing.isWatched,
          watchedAt: existing.watchedAt,
          // Update title and synopsis if newly published
          title: freshEp.title || existing.title,
          overview: freshEp.overview || existing.overview
        };
      } else {
        // Completely new episode or newly dropped season!
        newEpisodesCount++;
        return {
          ...freshEp,
          id: `${mediaItem.id}_S${freshEp.seasonNumber}E${freshEp.episodeNumber}`,
          mediaId: mediaItem.id,
          isWatched: 0 as WatchedStatus,
          watchedAt: null
        };
      }
    });

    const hasUpdates = newEpisodesCount > 0 || updatedTitlesCount > 0;

    if (hasUpdates) {
      const updatedMedia: Partial<MediaItem> = {
        ...mediaItem,
        totalSeasons: freshData.media.totalSeasons || mediaItem.totalSeasons,
        totalEpisodes: mergedEpisodes.length,
        lastSyncedAt: new Date().toISOString()
      };
      await saveMediaItem(updatedMedia, mergedEpisodes);
    } else {
      // Touch lastSyncedAt so cooldown timer knows this show was recently verified
      await touchMediaSyncedAt(mediaItem.id);
    }

    return {
      hasUpdates,
      newEpisodesCount,
      updatedTitlesCount,
      totalEpisodes: mergedEpisodes.length,
      mediaTitle: mediaItem.title,
      isCompletedWithNewEpisodes: (mediaItem.status === 'completed' && newEpisodesCount > 0),
      previousStatus: mediaItem.status
    };
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.warn(`Failed to sync episodes for ${mediaItem.title}:`, err);
    return { hasUpdates: false, error: errorMessage, mediaTitle: mediaItem.title };
  }
}

export interface EligibleSyncOptions {
  forceAll?: boolean;
  cooldownDays?: number;
}

/**
 * Filter library items to find TV shows eligible for background or manual sync.
 */
export function getShowsEligibleForSync(
  items: MediaItem[],
  { forceAll = false, cooldownDays = 5 }: EligibleSyncOptions = {}
): MediaItem[] {
  const tvShows = (items || []).filter(m => m.type === 'tv' && m.externalId);
  if (forceAll) return tvShows;

  const cooldownMs = cooldownDays * 24 * 60 * 60 * 1000;
  const now = Date.now();

  return tvShows.filter(show => {
    // Active watching shows are always eligible
    if (show.status === 'watching') return true;

    // Dropped shows are skipped in automatic sync
    if (show.status === 'dropped') return false;

    // Completed, Plan to Watch, and On Hold shows: sync if never synced or past cooldown
    if (!show.lastSyncedAt) return true;
    const lastSyncTime = new Date(show.lastSyncedAt).getTime();
    return (now - lastSyncTime) > cooldownMs;
  });
}

/**
 * Run a concurrent worker pool to sync multiple TV shows safely with rate limiting,
 * live progress reporting, and cancellation support.
 */
export async function runSyncQueue(
  shows: MediaItem[],
  options: SyncQueueOptions = {}
): Promise<SyncQueueResult> {
  const {
    concurrency = 2,
    delayMs = 250,
    onProgress,
    abortSignal
  } = options;

  let index = 0;
  let completed = 0;
  const total = shows.length;
  if (total === 0) {
    return { total: 0, completed: 0, updatedShows: [], isCancelled: false };
  }

  const updatedShows: Array<{ show: MediaItem; result: SyncResult }> = [];
  const workerCount = Math.min(concurrency || 2, total);

  const workers = Array.from({ length: workerCount }, async () => {
    while (index < total) {
      if (abortSignal?.aborted) break;

      const i = index++;
      const show = shows[i];

      let result: SyncResult | null = null;
      try {
        result = await syncMediaEpisodes(show);
        if (result?.hasUpdates && ((result.newEpisodesCount ?? 0) > 0 || (result.updatedTitlesCount ?? 0) > 0)) {
          updatedShows.push({ show, result });
        }
      } catch (err) {
        console.warn(`Sync queue error on ${show.title}:`, err);
      }

      completed++;
      if (onProgress) {
        onProgress(completed, total, show, result, abortSignal?.aborted || false);
      }

      if (delayMs > 0 && !abortSignal?.aborted) {
        await new Promise(r => setTimeout(r, delayMs));
      }
    }
  });

  await Promise.all(workers);

  return {
    total,
    completed,
    updatedShows,
    isCancelled: abortSignal?.aborted || false
  };
}
