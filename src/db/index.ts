import Dexie, { type Table } from 'dexie';
import { isEpisodeAired } from '../utils/timezone';
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
  CompactEpisodeItem
} from '../types';

export class BingeLogDatabase extends Dexie {
  media!: Table<MediaItem, string>;
  episodes!: Table<EpisodeItem, string>;
  settings!: Table<SettingItem, string>;

  constructor() {
    super('BingeLogDB');
    this.version(1).stores({
      media: 'id, type, status, title, updatedAt, createdAt',
      episodes: 'id, mediaId, seasonNumber, episodeNumber, [mediaId+seasonNumber], isWatched',
      settings: 'key'
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
  const id = mediaItem.id || `media_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  return await db.transaction('rw', db.media, db.episodes, async () => {
    const existingMedia = await db.media.get(id);

    // Calculate total episodes & watched count if TV show
    let totalEpisodes = mediaItem.totalEpisodes || 0;
    let watchedEpisodesCount = 0;

    // If episodes are provided, save/merge them
    let storedEpisodes: EpisodeItem[] = [];
    if (episodes && episodes.length > 0) {
      totalEpisodes = episodes.length;

      const existingEpisodes = await db.episodes.where('mediaId').equals(id).toArray();
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
          id: ep.id || `${id}_S${ep.seasonNumber}E${ep.episodeNumber}`,
          mediaId: id,
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
      await db.episodes.where('mediaId').equals(id).delete();
      await db.episodes.bulkPut(episodesToStore);
    } else if (existingMedia) {
      // Keep existing counts if not replacing episodes
      totalEpisodes = existingMedia.totalEpisodes || 0;
      watchedEpisodesCount = existingMedia.watchedEpisodesCount || 0;
      if (mediaItem.type === 'tv' || existingMedia.type === 'tv') {
        storedEpisodes = await db.episodes.where('mediaId').equals(id).toArray();
      }
    }

    const networkTz = mediaItem.networkTimezone || existingMedia?.networkTimezone || 'America/New_York';
    let nextAirDate: string | null = null;
    let nextAirstamp: string | null = null;
    let nextEpisodeSeason: number | null = null;
    let nextEpisodeNumber: number | null = null;

    // Determine default status if not set
    let status: MediaStatus = mediaItem.status || existingMedia?.status || 'plan_to_watch';
    if (storedEpisodes.length > 0 && (mediaItem.type === 'tv' || existingMedia?.type === 'tv')) {
      status = computeAutoStatus(status, storedEpisodes, mediaItem.airStatus || existingMedia?.airStatus, 'tv', networkTz);

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
    } else if (mediaItem.type === 'tv' && totalEpisodes > 0 && watchedEpisodesCount === totalEpisodes) {
      status = (mediaItem.airStatus === 'Ended' || mediaItem.airStatus === 'Canceled') ? 'completed' : 'caught_up';
    } else if (mediaItem.type === 'tv' && watchedEpisodesCount > 0 && status === 'plan_to_watch') {
      status = 'watching';
    }

    const payload: MediaItem = {
      title: 'Untitled',
      type: 'movie',
      source: 'custom',
      ...existingMedia,
      ...mediaItem,
      id,
      status,
      totalEpisodes,
      watchedEpisodesCount,
      nextAirDate: nextAirDate !== null ? nextAirDate : (existingMedia?.nextAirDate ?? null),
      nextAirstamp: nextAirstamp !== null ? nextAirstamp : (existingMedia?.nextAirstamp ?? null),
      nextEpisodeSeason: nextEpisodeSeason !== null ? nextEpisodeSeason : (existingMedia?.nextEpisodeSeason ?? null),
      nextEpisodeNumber: nextEpisodeNumber !== null ? nextEpisodeNumber : (existingMedia?.nextEpisodeNumber ?? null),
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
  episodes: EpisodeItem[],
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

    const media = await db.media.get(mediaId);
    if (media) {
      const status = computeAutoStatus(media.status, allEps, media.airStatus, media.type, media.networkTimezone);
      const nextInfo = getNextUnairedEpisodeInfo(allEps, media.networkTimezone);

      await db.media.update(mediaId, {
        watchedEpisodesCount: watchedCount,
        totalEpisodes: totalCount,
        currentSeason: seasonNumber,
        currentEpisode: episodeNumber,
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

    if (
      newStatus !== show.status ||
      nextInfo.nextAirDate !== show.nextAirDate ||
      nextInfo.nextAirstamp !== show.nextAirstamp ||
      nextInfo.nextEpisodeSeason !== show.nextEpisodeSeason ||
      nextInfo.nextEpisodeNumber !== show.nextEpisodeNumber
    ) {
      await db.media.update(show.id, {
        status: newStatus,
        ...nextInfo,
        updatedAt: new Date().toISOString()
      });
      updatedCount++;
    }
  }

  return updatedCount;
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
      settings
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
      settings
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
    settings
  };
}

/**
 * Import JSON backup into IndexedDB (overwrite or merge).
 */
export async function importData(backupData: BackupFile, overwrite: boolean = false): Promise<ImportResult> {
  if (!backupData || !Array.isArray(backupData.media)) {
    throw new Error('Invalid backup file format: missing media list');
  }

  return await db.transaction('rw', db.media, db.episodes, db.settings, async () => {
    if (overwrite) {
      await db.media.clear();
      await db.episodes.clear();
      await db.settings.clear();
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

    return {
      mediaCount: backupData.media.length,
      episodesCount: backupData.episodes ? backupData.episodes.length : 0
    };
  });
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
