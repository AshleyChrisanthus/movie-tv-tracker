import Dexie, { type Table } from 'dexie';
import { isEpisodeAired } from '../utils/timezone';
import { isMediaMatch } from '../utils/mediaMatch';
import type {
  MediaItem,
  EpisodeItem,
  SettingItem,
  BackupFile,
  BackupMode,
  ImportResult,
  MediaStatus,
  WatchedStatus,
  SeriesAirStatus,
  MediaType,
  CompactEpisodeItem,
  CustomList,
  FranchiseCanvas,
  FranchiseCollectionCache,
  TMDBCollectionDetail
} from '../types';

export class BingeLogDatabase extends Dexie {
  media!: Table<MediaItem, string>;
  episodes!: Table<EpisodeItem, string>;
  settings!: Table<SettingItem, string>;
  canvases!: Table<FranchiseCanvas, string>;
  collections!: Table<FranchiseCollectionCache, number>;

  constructor() {
    super('BingeLogDB');
    this.version(1).stores({
      media: 'id, type, status, title, updatedAt, createdAt',
      episodes: 'id, mediaId, seasonNumber, episodeNumber, [mediaId+seasonNumber], isWatched',
      settings: 'key'
    });
    this.version(2).stores({
      canvases: 'id, name, updatedAt, createdAt'
    });
    this.version(3).stores({
      collections: 'id, name, updatedAt'
    });
  }
}

export const db = new BingeLogDatabase();

export interface EpisodeInput {
  id?: string;
  mediaId?: string;
  seasonNumber: number | string;
  episodeNumber: number | string;
  title?: string;
  overview?: string;
  airDate?: string;
  runtime?: number | null;
  stillUrl?: string | null;
  isWatched?: WatchedStatus | boolean;
  watchedAt?: string | null;
}

/**
 * Save or update a media item (Movie or TV Show) along with its optional episodes.
 */
export async function saveMediaItem(
  mediaItem: Partial<MediaItem>,
  episodes: EpisodeInput[] = []
): Promise<MediaItem> {
  const now = new Date().toISOString();
  let id = mediaItem.id;

  return await db.transaction('rw', db.media, db.episodes, async () => {
    let existingMedia = id ? await db.media.get(id) : undefined;

    // Deduplication check if id was not provided or not yet found:
    if (!existingMedia) {
      if (mediaItem.externalId && mediaItem.source) {
        existingMedia = await db.media
          .where('type').equals(mediaItem.type || 'tv')
          .filter(m => String(m.externalId) === String(mediaItem.externalId) && m.source === mediaItem.source)
          .first();
      }
      if (!existingMedia && mediaItem.title && mediaItem.type) {
        const cleanTitle = mediaItem.title.trim().toLowerCase();
        const candidates = await db.media
          .where('type').equals(mediaItem.type)
          .filter(m => m.title.trim().toLowerCase() === cleanTitle)
          .toArray();
        existingMedia = candidates.find(candidate => isMediaMatch(mediaItem, candidate));
      }
      if (existingMedia) {
        id = existingMedia.id;
      }
    }

    const finalMediaId: string = id || `media_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    // Calculate total episodes & watched count if TV show
    let totalEpisodes = mediaItem.totalEpisodes || 0;
    let watchedEpisodesCount = 0;

    // If episodes are provided, save/merge them
    let storedEpisodes: EpisodeItem[] = [];
    if (episodes && episodes.length > 0) {
      totalEpisodes = episodes.length;

      const existingEpisodes = await db.episodes.where('mediaId').equals(finalMediaId).toArray();
      const existingWatchedMap = new Map<string, WatchedStatus>(
        existingEpisodes.map(ep => [`${ep.seasonNumber}_${ep.episodeNumber}`, ep.isWatched])
      );

      const episodesToStore: EpisodeItem[] = episodes.map(ep => {
        const key = `${ep.seasonNumber}_${ep.episodeNumber}`;
        const isWatched = existingWatchedMap.has(key)
          ? existingWatchedMap.get(key)!
          : (ep.isWatched ? 1 : 0);
        if (isWatched) watchedEpisodesCount++;

        return {
          id: ep.id || `${finalMediaId}_S${ep.seasonNumber}E${ep.episodeNumber}`,
          mediaId: finalMediaId,
          seasonNumber: Number(ep.seasonNumber) || 1,
          episodeNumber: Number(ep.episodeNumber) || 1,
          title: ep.title || `Episode ${ep.episodeNumber}`,
          overview: ep.overview || '',
          airDate: ep.airDate || '',
          runtime: ep.runtime ?? null,
          stillUrl: ep.stillUrl || '',
          isWatched: (isWatched ? 1 : 0) as WatchedStatus,
          watchedAt: ep.watchedAt || (isWatched ? now : null)
        };
      });

      storedEpisodes = episodesToStore;
      await db.episodes.where('mediaId').equals(finalMediaId).delete();
      await db.episodes.bulkPut(episodesToStore);
    } else if (existingMedia) {
      // Keep existing counts if not replacing episodes
      totalEpisodes = existingMedia.totalEpisodes || 0;
      watchedEpisodesCount = existingMedia.watchedEpisodesCount || 0;
      if (mediaItem.type === 'tv' || existingMedia.type === 'tv') {
        storedEpisodes = await db.episodes.where('mediaId').equals(finalMediaId).toArray();
      }
    }

    const networkTz = mediaItem.networkTimezone || existingMedia?.networkTimezone || 'America/New_York';
    let nextAirDate: string | null = null;
    let nextAirstamp: string | null = null;
    let nextEpisodeSeason: number | null = null;
    let nextEpisodeNumber: number | null = null;
    let lastAiredDate: string | null = null;

    // Determine default status if not set
    let status: MediaStatus = mediaItem.status || existingMedia?.status || 'plan_to_watch';
    if (storedEpisodes.length > 0 && (mediaItem.type === 'tv' || existingMedia?.type === 'tv')) {
      status = computeAutoStatus(status, storedEpisodes, mediaItem.airStatus || existingMedia?.airStatus, 'tv', networkTz);

      const airedEpisodes = storedEpisodes.filter(e => isEpisodeAired(e, networkTz) && (e.airDate || e.airstamp));
      if (airedEpisodes.length > 0) {
        airedEpisodes.sort((a, b) => {
          const dateA = a.airDate || (a.airstamp ? a.airstamp.slice(0, 10) : '');
          const dateB = b.airDate || (b.airstamp ? b.airstamp.slice(0, 10) : '');
          if (dateA && dateB && dateA !== dateB) return dateB.localeCompare(dateA);
          return (b.seasonNumber - a.seasonNumber) || (b.episodeNumber - a.episodeNumber);
        });
        lastAiredDate = airedEpisodes[0].airDate || (airedEpisodes[0].airstamp ? airedEpisodes[0].airstamp.slice(0, 10) : null);
      }

      const nextUnaired = storedEpisodes
        .slice()
        .sort((a, b) => a.seasonNumber - b.seasonNumber || a.episodeNumber - b.episodeNumber)
        .find(e => !isEpisodeAired(e, networkTz));

      if (nextUnaired) {
        nextAirDate = nextUnaired.airDate || null;
        nextAirstamp = nextUnaired.airstamp || null;
        nextEpisodeSeason = nextUnaired.seasonNumber;
        nextEpisodeNumber = nextUnaired.episodeNumber;
      }
    } else {
      lastAiredDate = mediaItem.releaseDate || (mediaItem.year && mediaItem.year !== 'N/A' ? `${mediaItem.year}-01-01` : null);
    }

    if (mediaItem.type === 'tv' && totalEpisodes > 0 && watchedEpisodesCount === totalEpisodes) {
      status = (mediaItem.airStatus === 'Ended' || mediaItem.airStatus === 'Canceled') ? 'completed' : 'caught_up';
    } else if (mediaItem.type === 'tv' && watchedEpisodesCount > 0 && status === 'plan_to_watch') {
      status = 'watching';
    } else if (mediaItem.type === 'book') {
      const mode = mediaItem.progressMode || existingMedia?.progressMode || 'pages';
      if (mode === 'chapters') {
        const totalChapters = mediaItem.totalChapters ?? existingMedia?.totalChapters ?? 0;
        const currentChapter = mediaItem.currentChapter ?? existingMedia?.currentChapter ?? 0;
        if (totalChapters > 0 && currentChapter >= totalChapters) {
          status = 'completed';
        } else if (currentChapter > 0 && status === 'plan_to_watch') {
          status = 'watching';
        }
        totalEpisodes = totalChapters || 1;
        watchedEpisodesCount = currentChapter;
      } else {
        const totalPages = mediaItem.totalPages ?? existingMedia?.totalPages ?? 0;
        const currentPage = mediaItem.currentPage ?? existingMedia?.currentPage ?? 0;
        if (totalPages > 0 && currentPage >= totalPages) {
          status = 'completed';
        } else if (currentPage > 0 && status === 'plan_to_watch') {
          status = 'watching';
        }
        totalEpisodes = totalPages || 1;
        watchedEpisodesCount = currentPage;
      }
    }

    const payload: MediaItem = {
      title: 'Untitled',
      type: 'movie',
      source: 'custom',
      ...existingMedia,
      ...mediaItem,
      id: finalMediaId,
      status,
      totalEpisodes,
      watchedEpisodesCount,
      progressMode: mediaItem.progressMode ?? existingMedia?.progressMode ?? 'pages',
      totalPages: mediaItem.totalPages !== undefined ? mediaItem.totalPages : existingMedia?.totalPages,
      currentPage: mediaItem.currentPage !== undefined ? mediaItem.currentPage : (existingMedia?.currentPage ?? (status === 'completed' && (mediaItem.totalPages || existingMedia?.totalPages) ? (mediaItem.totalPages || existingMedia?.totalPages) : 0)),
      totalChapters: mediaItem.totalChapters !== undefined ? mediaItem.totalChapters : existingMedia?.totalChapters,
      currentChapter: mediaItem.currentChapter !== undefined ? mediaItem.currentChapter : (existingMedia?.currentChapter ?? (status === 'completed' && (mediaItem.totalChapters || existingMedia?.totalChapters) ? (mediaItem.totalChapters || existingMedia?.totalChapters) : 0)),
      author: mediaItem.author || existingMedia?.author || '',
      isbn: mediaItem.isbn || existingMedia?.isbn,
      nextAirDate: nextAirDate !== null ? nextAirDate : (existingMedia?.nextAirDate ?? null),
      nextAirstamp: nextAirstamp !== null ? nextAirstamp : (existingMedia?.nextAirstamp ?? null),
      nextEpisodeSeason: nextEpisodeSeason !== null ? nextEpisodeSeason : (existingMedia?.nextEpisodeSeason ?? null),
      nextEpisodeNumber: nextEpisodeNumber !== null ? nextEpisodeNumber : (existingMedia?.nextEpisodeNumber ?? null),
      lastAiredDate: lastAiredDate !== null ? lastAiredDate : (existingMedia?.lastAiredDate ?? null),
      lists: mediaItem.lists !== undefined ? mediaItem.lists : (existingMedia?.lists || []),
      imdbId: mediaItem.imdbId || existingMedia?.imdbId || null,
      tmdbId: mediaItem.tmdbId || existingMedia?.tmdbId || null,
      tvmazeId: mediaItem.tvmazeId || existingMedia?.tvmazeId || null,
      thetvdbId: mediaItem.thetvdbId || existingMedia?.thetvdbId || null,
      rating: mediaItem.rating !== undefined ? mediaItem.rating : (existingMedia?.rating ?? null),
      communityRating: mediaItem.communityRating !== undefined ? mediaItem.communityRating : (existingMedia?.communityRating ?? null),
      communityRatingCount: mediaItem.communityRatingCount !== undefined ? mediaItem.communityRatingCount : (existingMedia?.communityRatingCount ?? null),
      updatedAt: now,
      createdAt: existingMedia?.createdAt || now,
      year: mediaItem.year ?? existingMedia?.year ?? 'N/A'
    };

    await db.media.put(payload);
    return payload;
  });
}

/**
 * Update the lastSyncedAt timestamp on a media item without changing other fields.
 */
export async function touchMediaSyncedAt(id: string): Promise<void> {
  const now = new Date().toISOString();
  await db.media.update(id, { lastSyncedAt: now });
}

/**
 * Fetch all media items with optional status/type filter.
 */
export async function getAllMedia(filters: {
  status?: string;
  type?: string;
  searchQuery?: string;
} = {}): Promise<MediaItem[]> {
  let collection = db.media.orderBy('updatedAt').reverse();

  if (filters.status && filters.status !== 'all') {
    collection = collection.filter(item => item.status === filters.status);
  }

  if (filters.type && filters.type !== 'all') {
    collection = collection.filter(item => item.type === filters.type);
  }

  if (filters.searchQuery && filters.searchQuery.trim()) {
    const q = filters.searchQuery.trim().toLowerCase();
    collection = collection.filter(item => item.title.toLowerCase().includes(q));
  }

  return await collection.toArray();
}

/**
 * Fetch single media item by ID.
 */
export async function getMediaById(id: string): Promise<MediaItem | undefined> {
  return await db.media.get(id);
}

/**
 * Fetch all episodes for a media item.
 */
export async function getEpisodesForMedia(mediaId: string): Promise<EpisodeItem[]> {
  return await db.episodes
    .where('mediaId')
    .equals(mediaId)
    .sortBy('episodeNumber')
    .then(eps => eps.sort((a, b) => a.seasonNumber - b.seasonNumber || a.episodeNumber - b.episodeNumber));
}

function getNextUnairedEpisodeInfo(episodes: EpisodeItem[], networkTz?: string) {
  const nextUnaired = episodes
    .slice()
    .sort((a, b) => a.seasonNumber - b.seasonNumber || a.episodeNumber - b.episodeNumber)
    .find(e => !isEpisodeAired(e, networkTz));

  return {
    nextAirDate: nextUnaired ? (nextUnaired.airDate || null) : null,
    nextAirstamp: nextUnaired ? (nextUnaired.airstamp || null) : null,
    nextEpisodeSeason: nextUnaired ? nextUnaired.seasonNumber : null,
    nextEpisodeNumber: nextUnaired ? nextUnaired.episodeNumber : null,
  };
}

/**
 * Automatically calculates media status based on watch progress, airStatus, and timezone-aware episode air dates.
 */
export function computeAutoStatus(
  currentStatus: MediaStatus,
  episodes: Array<Pick<EpisodeItem, 'isWatched'> & Partial<EpisodeItem>>,
  airStatus?: SeriesAirStatus,
  mediaType: MediaType = 'tv',
  networkTz?: string
): MediaStatus {
  if (mediaType !== 'tv') {
    return currentStatus;
  }

  // Preserve explicit user choice to pause or abandon a show unless they resume
  if (currentStatus === 'dropped' || currentStatus === 'on_hold') {
    return currentStatus;
  }

  const totalCount = episodes.length;
  if (totalCount === 0) {
    return currentStatus;
  }

  const watchedCount = episodes.filter(e => e.isWatched === 1).length;

  if (watchedCount === 0) {
    return currentStatus === 'watching' || currentStatus === 'caught_up' ? 'plan_to_watch' : currentStatus;
  }

  const isOngoing = airStatus === 'Returning Series' || airStatus === 'Running' || airStatus === 'In Production';

  // An episode has aired if it has past release timestamp or airDate
  const airedEpisodes = episodes.filter(e => isEpisodeAired(e, networkTz));
  const futureEpisodes = episodes.filter(e => !isEpisodeAired(e, networkTz));
  const unwatchedAiredEpisodes = airedEpisodes.filter(e => e.isWatched !== 1);

  // 1. If all known episodes are watched:
  if (watchedCount === totalCount) {
    // If the series is explicitly ongoing, the user is caught up awaiting the next season
    if (isOngoing) {
      return 'caught_up';
    }
    // Otherwise, the entire series is completed
    return 'completed';
  }

  // 2. If there are unwatched episodes, check if ALL unwatched episodes are future un-aired episodes:
  if (futureEpisodes.length > 0 && unwatchedAiredEpisodes.length === 0) {
    // Every episode that has aired so far is watched! Only future un-aired episodes remain:
    return 'caught_up';
  }

  // 3. Otherwise, there are aired episodes still unwatched:
  return 'watching';
}

/**
 * Toggle single episode watched state.
 */
export async function toggleEpisodeWatched(
  mediaId: string,
  seasonNumber: number,
  episodeNumber: number
): Promise<{ episodeId: string; isWatched: WatchedStatus } | undefined> {
  return await db.transaction('rw', db.media, db.episodes, async () => {
    const episodeId = `${mediaId}_S${seasonNumber}E${episodeNumber}`;
    const ep = await db.episodes.get(episodeId);
    if (!ep) return undefined;

    const newWatched: WatchedStatus = ep.isWatched ? 0 : 1;
    const now = new Date().toISOString();

    await db.episodes.update(episodeId, {
      isWatched: newWatched,
      watchedAt: newWatched ? now : null
    });

    // Update media watched counter & current pointers
    const allEps = await db.episodes.where('mediaId').equals(mediaId).toArray();
    const watchedEps = allEps.filter(e => e.isWatched === 1);
    const watchedCount = watchedEps.length;
    const totalCount = allEps.length;

    // Find highest watched episode across the entire show to keep currentSeason & currentEpisode accurate
    const sortedWatched = watchedEps.slice().sort((a, b) => b.seasonNumber - a.seasonNumber || b.episodeNumber - a.episodeNumber);
    const latestWatched = sortedWatched[0];
    const currentSeason = latestWatched ? latestWatched.seasonNumber : 1;
    const currentEpisode = latestWatched ? latestWatched.episodeNumber : 0;

    const media = await db.media.get(mediaId);
    if (media) {
      const status = computeAutoStatus(media.status, allEps, media.airStatus, media.type, media.networkTimezone);
      const nextInfo = getNextUnairedEpisodeInfo(allEps, media.networkTimezone);

      await db.media.update(mediaId, {
        watchedEpisodesCount: watchedCount,
        totalEpisodes: totalCount,
        currentSeason,
        currentEpisode,
        status,
        ...nextInfo,
        updatedAt: now
      });
    }

    return { episodeId, isWatched: newWatched };
  });
}

/**
 * Set exact progress (e.g., user watched up to Season S, Episode E).
 * Can optionally mark all episodes up to (S, E) as watched.
 */
export async function setExactProgress(
  mediaId: string,
  targetSeason: number,
  targetEpisode: number,
  markPreviousAsWatched: boolean = true
): Promise<void> {
  return await db.transaction('rw', db.media, db.episodes, async () => {
    const episodes = await db.episodes.where('mediaId').equals(mediaId).toArray();
    const now = new Date().toISOString();

    if (markPreviousAsWatched && episodes.length > 0) {
      for (const ep of episodes) {
        const isPastOrEqual =
          ep.seasonNumber < targetSeason ||
          (ep.seasonNumber === targetSeason && ep.episodeNumber <= targetEpisode);

        await db.episodes.update(ep.id, {
          isWatched: (isPastOrEqual ? 1 : 0) as WatchedStatus,
          watchedAt: isPastOrEqual ? (ep.watchedAt || now) : null
        });
      }
    }

    const updatedEpisodes = await db.episodes.where('mediaId').equals(mediaId).toArray();
    const watchedCount = updatedEpisodes.filter(e => e.isWatched === 1).length;
    const totalCount = updatedEpisodes.length;

    const media = await db.media.get(mediaId);
    if (media) {
      const status = computeAutoStatus(media.status, updatedEpisodes, media.airStatus, media.type, media.networkTimezone);
      const nextInfo = getNextUnairedEpisodeInfo(updatedEpisodes, media.networkTimezone);

      await db.media.update(mediaId, {
        currentSeason: targetSeason,
        currentEpisode: targetEpisode,
        watchedEpisodesCount: watchedCount,
        status,
        ...nextInfo,
        updatedAt: now
      });
    }
  });
}

/**
 * Strike off / mark all episodes up to and including (targetSeason, targetEpisode) as watched.
 * Does not unmark any already-watched episodes after it.
 */
export async function markEpisodesUpToWatched(
  mediaId: string,
  targetSeason: number,
  targetEpisode: number
): Promise<void> {
  return await db.transaction('rw', db.media, db.episodes, async () => {
    const episodes = await db.episodes.where('mediaId').equals(mediaId).toArray();
    const now = new Date().toISOString();

    for (const ep of episodes) {
      const isPastOrEqual =
        ep.seasonNumber < targetSeason ||
        (ep.seasonNumber === targetSeason && ep.episodeNumber <= targetEpisode);

      if (isPastOrEqual && ep.isWatched !== 1) {
        await db.episodes.update(ep.id, {
          isWatched: 1,
          watchedAt: now
        });
      }
    }

    const updatedEpisodes = await db.episodes.where('mediaId').equals(mediaId).toArray();
    const watchedCount = updatedEpisodes.filter(e => e.isWatched === 1).length;
    const totalCount = updatedEpisodes.length;

    const media = await db.media.get(mediaId);
    if (media) {
      const status = computeAutoStatus(media.status, updatedEpisodes, media.airStatus, media.type, media.networkTimezone);
      const nextInfo = getNextUnairedEpisodeInfo(updatedEpisodes, media.networkTimezone);

      await db.media.update(mediaId, {
        currentSeason: targetSeason,
        currentEpisode: targetEpisode,
        watchedEpisodesCount: watchedCount,
        status,
        ...nextInfo,
        updatedAt: now
      });
    }
  });
}

/**
 * Mark an entire season as watched or unwatched.
 */
export async function setSeasonWatched(
  mediaId: string,
  seasonNumber: number,
  isWatched: boolean
): Promise<void> {
  return await db.transaction('rw', db.media, db.episodes, async () => {
    const episodes = await db.episodes
      .where('mediaId')
      .equals(mediaId)
      .filter(ep => ep.seasonNumber === seasonNumber)
      .toArray();

    const now = new Date().toISOString();
    for (const ep of episodes) {
      await db.episodes.update(ep.id, {
        isWatched: (isWatched ? 1 : 0) as WatchedStatus,
        watchedAt: isWatched ? (ep.watchedAt || now) : null
      });
    }

    const allEps = await db.episodes.where('mediaId').equals(mediaId).toArray();
    const watchedEps = allEps.filter(e => e.isWatched === 1);
    const watchedCount = watchedEps.length;
    const totalCount = allEps.length;

    // Calculate updated progress pointer based on highest watched episode
    const sortedWatched = watchedEps.slice().sort((a, b) => b.seasonNumber - a.seasonNumber || b.episodeNumber - a.episodeNumber);
    const latestWatched = sortedWatched[0];
    const currentSeason = latestWatched ? latestWatched.seasonNumber : 1;
    const currentEpisode = latestWatched ? latestWatched.episodeNumber : 0;

    const media = await db.media.get(mediaId);
    if (media) {
      const status = computeAutoStatus(media.status, allEps, media.airStatus, media.type, media.networkTimezone);
      const nextInfo = getNextUnairedEpisodeInfo(allEps, media.networkTimezone);

      await db.media.update(mediaId, {
        currentSeason,
        currentEpisode,
        watchedEpisodesCount: watchedCount,
        status,
        ...nextInfo,
        updatedAt: now
      });
    }
  });
}

/**
 * Backfill and heal existing TV media items that may have missing status or next episode metadata.
 */
export async function backfillMissingMediaMetadata(): Promise<number> {
  const allShows = await db.media.where('type').equals('tv').toArray();
  let updatedCount = 0;

  for (const show of allShows) {
    const episodes = await db.episodes.where('mediaId').equals(show.id).toArray();
    if (episodes.length === 0) continue;

    const nextInfo = getNextUnairedEpisodeInfo(episodes, show.networkTimezone);
    const newStatus = computeAutoStatus(show.status, episodes, show.airStatus, 'tv', show.networkTimezone);

    const airedEpisodes = episodes.filter(e => isEpisodeAired(e, show.networkTimezone) && (e.airDate || e.airstamp));
    let computedLastAired: string | null = null;
    if (airedEpisodes.length > 0) {
      airedEpisodes.sort((a, b) => {
        const dateA = a.airDate || (a.airstamp ? a.airstamp.slice(0, 10) : '');
        const dateB = b.airDate || (b.airstamp ? b.airstamp.slice(0, 10) : '');
        if (dateA && dateB && dateA !== dateB) return dateB.localeCompare(dateA);
        return (b.seasonNumber - a.seasonNumber) || (b.episodeNumber - a.episodeNumber);
      });
      computedLastAired = airedEpisodes[0].airDate || (airedEpisodes[0].airstamp ? airedEpisodes[0].airstamp.slice(0, 10) : null);
    }

    if (
      newStatus !== show.status ||
      nextInfo.nextAirDate !== show.nextAirDate ||
      nextInfo.nextAirstamp !== show.nextAirstamp ||
      nextInfo.nextEpisodeSeason !== show.nextEpisodeSeason ||
      nextInfo.nextEpisodeNumber !== show.nextEpisodeNumber ||
      computedLastAired !== show.lastAiredDate
    ) {
      await db.media.update(show.id, {
        status: newStatus,
        ...nextInfo,
        lastAiredDate: computedLastAired,
        updatedAt: new Date().toISOString()
      });
      updatedCount++;
    }
  }

  return updatedCount;
}

/**
 * Backfill missing cross-reference IDs (IMDb ID, TMDB ID, TheTVDB ID) for existing library items (Issue #37).
 */
export async function backfillMediaCrossReferences(): Promise<number> {
  const allMedia = await db.media.toArray();
  let updatedCount = 0;

  for (const item of allMedia) {
    // If it's a TV show from TVMaze missing IMDb or TheTVDB ID, fetch its externals from TVMaze
    if (item.type === 'tv' && item.source === 'tvmaze' && item.externalId && (!item.imdbId || !item.thetvdbId || !item.tmdbId)) {
      try {
        const res = await fetch(`https://api.tvmaze.com/shows/${item.externalId}`).catch(() => null);
        if (res && res.ok) {
          const showData = await res.json();
          const imdbId = showData?.externals?.imdb || null;
          const thetvdbId = showData?.externals?.thetvdb || null;
          const tmdbId = showData?.externals?.themoviedb || null;

          if (imdbId || thetvdbId || tmdbId) {
            await db.media.update(item.id, {
              ...(imdbId ? { imdbId } : {}),
              ...(thetvdbId ? { thetvdbId } : {}),
              ...(tmdbId ? { tmdbId } : {}),
              tvmazeId: item.externalId,
              updatedAt: new Date().toISOString()
            });
            updatedCount++;
          }
        }
      } catch (err) {
        console.warn('Failed to backfill cross-references for', item.title, err);
      }
    }
  }

  return updatedCount;
}

/**
 * Backfill missing community ratings (Open Library for books, TVMaze / TMDB for TV & Movies).
 */
export async function backfillCommunityRatings(): Promise<number> {
  const allMedia = await db.media.toArray();
  let updatedCount = 0;
  const tmdbApiKey = await getSetting<string>('tmdb_api_key', '');

  for (const item of allMedia) {
    if (item.communityRating !== undefined && item.communityRating !== null) {
      continue;
    }

    try {
      if (item.type === 'book') {
        let avg: number | null = null;
        let count: number | null = null;

        if (item.externalId && String(item.externalId).startsWith('OL')) {
          const res = await fetch(`https://openlibrary.org/works/${item.externalId}/ratings.json`).catch(() => null);
          if (res && res.ok) {
            const data = await res.json();
            if (typeof data?.summary?.average === 'number') {
              avg = Math.round((data.summary.average * 2) * 10) / 10;
              count = typeof data.summary.count === 'number' ? data.summary.count : null;
            }
          }
        }

        if (avg === null && item.title) {
          const query = item.author ? `${item.title} ${item.author}` : item.title;
          const searchRes = await fetch(`https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=1&fields=ratings_average,ratings_count`).catch(() => null);
          if (searchRes && searchRes.ok) {
            const sData = await searchRes.json();
            const first = sData?.docs?.[0];
            if (first && typeof first.ratings_average === 'number') {
              avg = Math.round((first.ratings_average * 2) * 10) / 10;
              count = typeof first.ratings_count === 'number' ? first.ratings_count : null;
            }
          }
        }

        if (avg !== null) {
          await db.media.update(item.id, {
            communityRating: avg,
            communityRatingCount: count,
            updatedAt: new Date().toISOString()
          });
          updatedCount++;
        }
      } else if (item.type === 'tv') {
        const tvmazeId = item.tvmazeId || (item.source === 'tvmaze' ? item.externalId : null);
        if (tvmazeId) {
          const res = await fetch(`https://api.tvmaze.com/shows/${tvmazeId}`).catch(() => null);
          if (res && res.ok) {
            const showData = await res.json();
            if (showData?.rating?.average) {
              const avg = Number(showData.rating.average);
              await db.media.update(item.id, {
                communityRating: avg,
                updatedAt: new Date().toISOString()
              });
              updatedCount++;
              continue;
            }
          }
        }

        const tmdbId = item.tmdbId || (item.source === 'tmdb' ? item.externalId : null);
        if (tmdbId && tmdbApiKey) {
          const res = await fetch(`https://api.themoviedb.org/3/tv/${tmdbId}?api_key=${encodeURIComponent(tmdbApiKey)}`).catch(() => null);
          if (res && res.ok) {
            const data = await res.json();
            if (data?.vote_average) {
              await db.media.update(item.id, {
                communityRating: Number(data.vote_average.toFixed(1)),
                communityRatingCount: data.vote_count || null,
                updatedAt: new Date().toISOString()
              });
              updatedCount++;
            }
          }
        }
      } else if (item.type === 'movie') {
        const tmdbId = item.tmdbId || (item.source === 'tmdb' ? item.externalId : null);
        if (tmdbId && tmdbApiKey) {
          const res = await fetch(`https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${encodeURIComponent(tmdbApiKey)}`).catch(() => null);
          if (res && res.ok) {
            const data = await res.json();
            const collectionId = data.belongs_to_collection?.id || item.collectionId || null;
            const collectionName = data.belongs_to_collection?.name || item.collectionName || null;
            const updates: Partial<MediaItem> = {
              updatedAt: new Date().toISOString()
            };
            if (data?.vote_average) {
              updates.communityRating = Number(data.vote_average.toFixed(1));
              updates.communityRatingCount = data.vote_count || null;
            }
            if (collectionId && !item.collectionId) {
              updates.collectionId = collectionId;
              updates.collectionName = collectionName;
            }
            if (updates.communityRating || updates.collectionId) {
              await db.media.update(item.id, updates);
              updatedCount++;
            }
          }
        }
      }
    } catch (err) {
      console.warn('Failed to backfill community rating for', item.title, err);
    }
  }

  return updatedCount;
}

/**
 * Backfill missing franchise collection metadata (collectionId, collectionName) for existing movies (Issue #34).
 */
export async function backfillMovieFranchiseCollections(): Promise<number> {
  const movies = await db.media.where('type').equals('movie').toArray();
  const tmdbApiKey = await getSetting<string>('tmdb_api_key', '');
  if (!tmdbApiKey) return 0;

  let updatedCount = 0;
  for (const movie of movies) {
    if (movie.collectionId) continue;

    try {
      let tmdbId = movie.tmdbId || (movie.source === 'tmdb' ? movie.externalId : null);

      if (!tmdbId && movie.title) {
        const yearParam = movie.year && movie.year !== 'N/A' ? `&year=${movie.year}` : '';
        const searchRes = await fetch(
          `https://api.themoviedb.org/3/search/movie?query=${encodeURIComponent(movie.title)}&api_key=${encodeURIComponent(tmdbApiKey)}${yearParam}`
        ).catch(() => null);
        if (searchRes && searchRes.ok) {
          const searchData = await searchRes.json();
          const match = searchData.results?.[0];
          if (match?.id) {
            tmdbId = match.id;
            await db.media.update(movie.id, {
              tmdbId: match.id
            });
          }
        }
      }

      if (tmdbId) {
        const res = await fetch(`https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${encodeURIComponent(tmdbApiKey)}`).catch(() => null);
        if (res && res.ok) {
          const data = await res.json();
          const col = data.belongs_to_collection;
          if (col && col.id) {
            await db.media.update(movie.id, {
              collectionId: col.id,
              collectionName: col.name,
              tmdbId: movie.tmdbId || tmdbId,
              updatedAt: new Date().toISOString()
            });
            updatedCount++;
          }
        }
      }
    } catch (err) {
      console.warn('Failed to backfill franchise collection for movie', movie.title, err);
    }
  }

  return updatedCount;
}

/**
 * Reset all personal user ratings (`rating`) to null across all library items.
 * Leaves community ratings (`communityRating`) completely intact.
 */
export async function clearAllPersonalRatings(): Promise<number> {
  const allMedia = await db.media.toArray();
  let count = 0;
  const now = new Date().toISOString();

  await db.transaction('rw', db.media, async () => {
    for (const item of allMedia) {
      if (item.rating !== null && item.rating !== undefined) {
        await db.media.update(item.id, {
          rating: null,
          updatedAt: now
        });
        count++;
      }
    }
  });

  return count;
}

if (typeof globalThis !== 'undefined') {
  (globalThis as any).clearAllPersonalRatings = clearAllPersonalRatings;
}

/**
 * Delete a media item and all associated episodes.
 */
export async function deleteMediaItem(id: string): Promise<void> {
  return await db.transaction('rw', db.media, db.episodes, async () => {
    await db.episodes.where('mediaId').equals(id).delete();
    await db.media.delete(id);
  });
}

/**
 * Update media status (e.g. 'watching', 'completed', 'plan_to_watch', 'dropped', 'on_hold').
 */
export async function updateMediaStatus(id: string, status: MediaStatus): Promise<void> {
  return await db.transaction('rw', db.media, db.episodes, async () => {
    const now = new Date().toISOString();
    const media = await db.media.get(id);
    if (!media) return;

    // If marked completed and it's a TV show, mark all episodes watched
    if (status === 'completed' && media.type === 'tv') {
      const episodes = await db.episodes.where('mediaId').equals(id).toArray();
      for (const ep of episodes) {
        await db.episodes.update(ep.id, { isWatched: 1, watchedAt: ep.watchedAt || now });
      }
      await db.media.update(id, {
        status,
        watchedEpisodesCount: episodes.length,
        updatedAt: now
      });
    } else if (status === 'completed' && media.type === 'book') {
      const mode = media.progressMode || 'pages';
      const totalPages = media.totalPages || 0;
      const totalChapters = media.totalChapters || 0;
      await db.media.update(id, {
        status,
        currentPage: totalPages,
        currentChapter: totalChapters,
        watchedEpisodesCount: mode === 'chapters' ? totalChapters : totalPages,
        updatedAt: now
      });
    } else {
      await db.media.update(id, { status, updatedAt: now });
    }
  });
}

/**
 * Update user rating and notes.
 */
export async function updateMediaRatingAndNotes(
  id: string,
  rating: number | string,
  notes: string
): Promise<number> {
  return await db.media.update(id, {
    rating: Number(rating),
    notes,
    updatedAt: new Date().toISOString()
  });
}

/**
 * Export all data from IndexedDB as a JSON backup object.
 * Supports:
 * - 'minimal': Ultra-light watch history (~15-25 KB). Only saves watched episodes (isWatched === 1) and custom entries. Strips heavy synopses and image URLs.
 * - 'compact' (default): Compact checklist (~120-200 KB). Saves all episode titles and numbers for complete offline checklist access, without synopses and screenshots.
 * - 'full': Complete offline snapshot (~500 KB+) with all cached synopses and screenshots.
 */
export async function exportAllData(options: { mode?: BackupMode } = {}): Promise<BackupFile> {
  const mode: BackupMode = options?.mode || 'compact';
  const media = await db.media.toArray();
  const rawEpisodes = await db.episodes.toArray();
  const settings = await db.settings.toArray();
  const canvases = await db.canvases.toArray();
  const collections = await db.collections.toArray();

  const customMediaIds = new Set(media.filter(m => m.source === 'custom').map(m => m.id));

  let episodes: EpisodeItem[] | CompactEpisodeItem[] = rawEpisodes;
  if (mode === 'minimal') {
    // Only include watched episodes or custom episodes (so custom user items are never lost)
    episodes = rawEpisodes
      .filter(ep => ep.isWatched === 1 || customMediaIds.has(ep.mediaId))
      .map((ep): CompactEpisodeItem => ({
        id: ep.id,
        mediaId: ep.mediaId,
        seasonNumber: ep.seasonNumber,
        episodeNumber: ep.episodeNumber,
        title: ep.title,
        airDate: ep.airDate,
        runtime: ep.runtime,
        isWatched: ep.isWatched,
        watchedAt: ep.watchedAt
      }));

    return {
      app: 'BingeLog',
      version: 1,
      backupMode: 'minimal',
      exportedAt: new Date().toISOString(),
      totalMedia: media.length,
      totalEpisodes: episodes.length,
      media,
      episodes,
      settings,
      canvases,
      collections
    };
  } else if (mode === 'compact') {
    episodes = rawEpisodes.map((ep): CompactEpisodeItem => ({
      id: ep.id,
      mediaId: ep.mediaId,
      seasonNumber: ep.seasonNumber,
      episodeNumber: ep.episodeNumber,
      title: ep.title,
      airDate: ep.airDate,
      runtime: ep.runtime,
      isWatched: ep.isWatched,
      watchedAt: ep.watchedAt
    }));

    return {
      app: 'BingeLog',
      version: 1,
      backupMode: 'compact',
      exportedAt: new Date().toISOString(),
      totalMedia: media.length,
      totalEpisodes: episodes.length,
      media,
      episodes,
      settings,
      canvases,
      collections
    };
  }

  return {
    app: 'BingeLog',
    version: 1,
    backupMode: 'full',
    exportedAt: new Date().toISOString(),
    totalMedia: media.length,
    totalEpisodes: rawEpisodes.length,
    media,
    episodes: rawEpisodes,
    settings,
    canvases,
    collections
  };
}

/**
 * Import JSON backup into IndexedDB (overwrite or merge).
 */
export async function importData(backupData: BackupFile, overwrite: boolean = false): Promise<ImportResult> {
  if (!backupData || !Array.isArray(backupData.media)) {
    throw new Error('Invalid backup file format: missing media list');
  }

  return await db.transaction('rw', db.media, db.episodes, db.settings, db.canvases, db.collections, async () => {
    if (overwrite) {
      await db.media.clear();
      await db.episodes.clear();
      await db.settings.clear();
      await db.canvases.clear();
      await db.collections.clear();
    }

    if (backupData.media.length > 0) {
      await db.media.bulkPut(backupData.media);
    }
    if (Array.isArray(backupData.episodes) && backupData.episodes.length > 0) {
      await db.episodes.bulkPut(backupData.episodes as EpisodeItem[]);
    }
    if (Array.isArray(backupData.settings) && backupData.settings.length > 0) {
      await db.settings.bulkPut(backupData.settings);
    }
    if (Array.isArray(backupData.canvases) && backupData.canvases.length > 0) {
      await db.canvases.bulkPut(backupData.canvases);
    }
    if (Array.isArray(backupData.collections) && backupData.collections.length > 0) {
      await db.collections.bulkPut(backupData.collections);
    }

    return {
      mediaCount: backupData.media.length,
      episodesCount: backupData.episodes ? backupData.episodes.length : 0
    };
  });
}

/**
 * Retrieve a cached Franchise Collection from IndexedDB by TMDB collection ID.
 */
export async function getFranchiseCollection(collectionId: number | string): Promise<FranchiseCollectionCache | undefined> {
  if (!collectionId) return undefined;
  const numId = typeof collectionId === 'string' ? parseInt(collectionId, 10) : collectionId;
  if (isNaN(numId)) return undefined;
  return await db.collections.get(numId);
}

/**
 * Save or update a Franchise Collection in IndexedDB cache.
 */
export async function saveFranchiseCollection(
  collection: TMDBCollectionDetail | FranchiseCollectionCache
): Promise<FranchiseCollectionCache> {
  const now = new Date().toISOString();
  const numId = typeof collection.id === 'string' ? parseInt(String(collection.id), 10) : collection.id;
  const cached: FranchiseCollectionCache = {
    id: numId,
    name: collection.name.trim(),
    overview: collection.overview || '',
    poster_path: collection.poster_path || null,
    backdrop_path: collection.backdrop_path || null,
    parts: Array.isArray(collection.parts) ? collection.parts : [],
    updatedAt: now
  };
  await db.collections.put(cached);
  return cached;
}

/**
 * Retrieve all cached Franchise Collections from IndexedDB.
 */
export async function getAllFranchiseCollections(): Promise<FranchiseCollectionCache[]> {
  return await db.collections.orderBy('updatedAt').reverse().toArray();
}

/**
 * Delete a cached Franchise Collection from IndexedDB.
 */
export async function deleteFranchiseCollection(collectionId: number | string): Promise<void> {
  const numId = typeof collectionId === 'string' ? parseInt(String(collectionId), 10) : collectionId;
  if (!isNaN(numId)) {
    await db.collections.delete(numId);
  }
}

/**
 * Retrieve all Franchise Canvases.
 */
export async function getCanvases(): Promise<FranchiseCanvas[]> {
  return await db.canvases.orderBy('updatedAt').reverse().toArray();
}

/**
 * Retrieve a specific canvas by ID.
 */
export async function getCanvasById(id: string): Promise<FranchiseCanvas | undefined> {
  return await db.canvases.get(id);
}

/**
 * Create or update a Franchise Canvas.
 */
export async function saveCanvas(
  canvas: Partial<FranchiseCanvas> & { name: string }
): Promise<FranchiseCanvas> {
  const now = new Date().toISOString();
  const id = canvas.id || `canvas_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const existing = await db.canvases.get(id);

  const fullCanvas: FranchiseCanvas = {
    id,
    name: canvas.name.trim(),
    description: canvas.description?.trim() || '',
    coverImage: canvas.coverImage || existing?.coverImage,
    nodes: Array.isArray(canvas.nodes) ? canvas.nodes : (existing?.nodes || []),
    edges: Array.isArray(canvas.edges) ? canvas.edges : (existing?.edges || []),
    viewport: canvas.viewport || existing?.viewport || { x: 0, y: 0, zoom: 1 },
    createdAt: existing?.createdAt || canvas.createdAt || now,
    updatedAt: now
  };

  await db.canvases.put(fullCanvas);
  return fullCanvas;
}

/**
 * Delete a Franchise Canvas by ID.
 */
export async function deleteCanvas(id: string): Promise<void> {
  await db.canvases.delete(id);
}

/**
 * Settings helpers (e.g. TMDB API Key).
 */
export async function getSetting<T = unknown>(key: string, defaultValue: T | null = null): Promise<T | null> {
  const record = await db.settings.get(key);
  return record ? (record.value as T) : defaultValue;
}

export async function setSetting<T = unknown>(key: string, value: T): Promise<T> {
  await db.settings.put({ key, value });
  return value;
}

/**
 * Retrieve all custom folders / lists (Issue #20).
 */
export async function getCustomLists(): Promise<CustomList[]> {
  const setting = await db.settings.get('custom_lists');
  if (setting && Array.isArray(setting.value)) {
    return setting.value;
  }
  return [];
}

/**
 * Save or overwrite custom lists array.
 */
export async function saveCustomLists(lists: CustomList[]): Promise<void> {
  await db.settings.put({
    key: 'custom_lists',
    value: lists
  });
}

/**
 * Create or edit a custom list.
 */
export async function saveCustomList(
  list: Omit<CustomList, 'id' | 'createdAt'> & { id?: string; createdAt?: string }
): Promise<CustomList> {
  const current = await getCustomLists();
  const id = list.id || `list_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const now = new Date().toISOString();
  const existingIndex = current.findIndex(l => l.id === id);

  const fullList: CustomList = {
    id,
    name: list.name.trim(),
    color: list.color || '#3b82f6',
    description: list.description || '',
    createdAt: list.createdAt || now
  };

  if (existingIndex >= 0) {
    current[existingIndex] = fullList;
  } else {
    current.push(fullList);
  }

  await saveCustomLists(current);
  return fullList;
}

/**
 * Delete a custom list by id, and remove this list name from all media items.
 */
export async function deleteCustomList(listId: string): Promise<void> {
  const current = await getCustomLists();
  const target = current.find(l => l.id === listId);
  if (!target) return;

  const filtered = current.filter(l => l.id !== listId);
  await saveCustomLists(filtered);

  // Remove list name from all media items
  const allMedia = await db.media.toArray();
  for (const item of allMedia) {
    if (item.lists && item.lists.includes(target.name)) {
      const updatedLists = item.lists.filter(name => name !== target.name);
      await db.media.update(item.id, { lists: updatedLists, updatedAt: new Date().toISOString() });
    }
  }
}

/**
 * Toggle a media item's membership in a list by list name.
 */
export async function toggleMediaList(mediaId: string, listName: string): Promise<string[]> {
  const media = await db.media.get(mediaId);
  if (!media) return [];

  const currentLists = new Set<string>(media.lists || []);
  if (currentLists.has(listName)) {
    currentLists.delete(listName);
  } else {
    currentLists.add(listName);
  }

  const updatedLists = Array.from(currentLists);
  await db.media.update(mediaId, {
    lists: updatedLists,
    updatedAt: new Date().toISOString()
  });

  return updatedLists;
}

/**
 * Update all lists for a media item.
 */
export async function updateMediaLists(mediaId: string, lists: string[]): Promise<void> {
  await db.media.update(mediaId, {
    lists,
    updatedAt: new Date().toISOString()
  });
}

/**
 * Update reading progress for a book (page count or chapter count) (Issue #22).
 */
export async function updateBookProgress(
  mediaId: string,
  progress: {
    currentPage?: number;
    totalPages?: number;
    currentChapter?: number;
    totalChapters?: number;
    progressMode?: 'pages' | 'chapters';
  } | number
): Promise<MediaItem | null> {
  const media = await db.media.get(mediaId);
  if (!media || media.type !== 'book') return null;

  const options = typeof progress === 'number' ? { currentPage: progress } : progress;
  const mode = options.progressMode || media.progressMode || 'pages';

  const totalPages = options.totalPages !== undefined ? options.totalPages : (media.totalPages || 0);
  const totalChapters = options.totalChapters !== undefined ? options.totalChapters : (media.totalChapters || 0);

  let newPage = options.currentPage !== undefined ? options.currentPage : (media.currentPage || 0);
  newPage = Math.max(0, totalPages > 0 ? Math.min(newPage, totalPages) : newPage);

  let newChapter = options.currentChapter !== undefined ? options.currentChapter : (media.currentChapter || 0);
  newChapter = Math.max(0, totalChapters > 0 ? Math.min(newChapter, totalChapters) : newChapter);

  // Check if either mode has reached its total (or if finishing via options)
  const reachedPageFinish = totalPages > 0 && newPage >= totalPages;
  const reachedChapterFinish = totalChapters > 0 && newChapter >= totalChapters;
  const isFinished = reachedPageFinish || reachedChapterFinish;

  // If finished in one mode, reflect completion in both modes
  if (isFinished) {
    if (totalPages > 0) newPage = totalPages;
    if (totalChapters > 0) newChapter = totalChapters;
  } else if (media.status === 'completed') {
    // If book was already marked completed and user enters a new total without specifying a lesser progress
    if (options.currentPage === undefined && options.currentChapter === undefined) {
      if (totalPages > 0) newPage = totalPages;
      if (totalChapters > 0) newChapter = totalChapters;
    }
  }

  const finalIsFinished = (totalPages > 0 && newPage >= totalPages) ||
                          (totalChapters > 0 && newChapter >= totalChapters);

  const hasProgress = mode === 'chapters' ? newChapter > 0 : newPage > 0;

  let newStatus = media.status;
  if (finalIsFinished) {
    newStatus = 'completed';
  } else if (hasProgress && (media.status === 'plan_to_watch' || media.status === 'completed')) {
    newStatus = 'watching';
  }

  const watchedEpisodesCount = mode === 'chapters' ? newChapter : newPage;
  const totalEpisodes = mode === 'chapters' ? (totalChapters || 1) : (totalPages || 1);

  const now = new Date().toISOString();
  await db.media.update(mediaId, {
    progressMode: mode,
    currentPage: newPage,
    totalPages,
    currentChapter: newChapter,
    totalChapters,
    watchedEpisodesCount,
    totalEpisodes,
    status: newStatus,
    updatedAt: now
  });

  return await db.media.get(mediaId) || null;
}

