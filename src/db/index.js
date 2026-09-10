import Dexie from 'dexie';

export const db = new Dexie('BingeLogDB');

// Database Schema
db.version(1).stores({
  media: 'id, type, status, title, updatedAt, createdAt',
  episodes: 'id, mediaId, seasonNumber, episodeNumber, [mediaId+seasonNumber], isWatched',
  settings: 'key'
});

/**
 * Save or update a media item (Movie or TV Show) along with its optional episodes.
 */
export async function saveMediaItem(mediaItem, episodes = []) {
  const now = new Date().toISOString();
  const id = mediaItem.id || `media_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  
  return await db.transaction('rw', db.media, db.episodes, async () => {
    const existingMedia = await db.media.get(id);
    
    // Calculate total episodes & watched count if TV show
    let totalEpisodes = mediaItem.totalEpisodes || 0;
    let watchedEpisodesCount = 0;
    
    // If episodes are provided, save/merge them
    if (episodes && episodes.length > 0) {
      totalEpisodes = episodes.length;
      
      const existingEpisodes = await db.episodes.where('mediaId').equals(id).toArray();
      const existingWatchedMap = new Map(
        existingEpisodes.map(ep => [`${ep.seasonNumber}_${ep.episodeNumber}`, ep.isWatched])
      );
      
      const episodesToStore = episodes.map(ep => {
        const key = `${ep.seasonNumber}_${ep.episodeNumber}`;
        const isWatched = existingWatchedMap.has(key) ? existingWatchedMap.get(key) : !!ep.isWatched;
        if (isWatched) watchedEpisodesCount++;
        
        return {
          id: ep.id || `${id}_S${ep.seasonNumber}E${ep.episodeNumber}`,
          mediaId: id,
          seasonNumber: Number(ep.seasonNumber) || 1,
          episodeNumber: Number(ep.episodeNumber) || 1,
          title: ep.title || `Episode ${ep.episodeNumber}`,
          overview: ep.overview || '',
          airDate: ep.airDate || '',
          runtime: ep.runtime || null,
          stillUrl: ep.stillUrl || '',
          isWatched: isWatched ? 1 : 0,
          watchedAt: ep.watchedAt || (isWatched ? now : null)
        };
      });
      
      await db.episodes.where('mediaId').equals(id).delete();
      await db.episodes.bulkPut(episodesToStore);
    } else if (existingMedia) {
      // Keep existing counts if not replacing episodes
      totalEpisodes = existingMedia.totalEpisodes || 0;
      watchedEpisodesCount = existingMedia.watchedEpisodesCount || 0;
    }

    // Determine default status if not set
    let status = mediaItem.status || existingMedia?.status || 'plan_to_watch';
    if (mediaItem.type === 'tv' && totalEpisodes > 0 && watchedEpisodesCount === totalEpisodes) {
      status = 'completed';
    } else if (mediaItem.type === 'tv' && watchedEpisodesCount > 0 && status === 'plan_to_watch') {
      status = 'watching';
    }

    const payload = {
      ...existingMedia,
      ...mediaItem,
      id,
      status,
      totalEpisodes,
      watchedEpisodesCount,
      updatedAt: now,
      createdAt: existingMedia?.createdAt || now
    };

    await db.media.put(payload);
    return payload;
  });
}

/**
 * Update the lastSyncedAt timestamp on a media item without changing other fields.
 */
export async function touchMediaSyncedAt(id) {
  const now = new Date().toISOString();
  await db.media.update(id, { lastSyncedAt: now });
}

/**
 * Fetch all media items with optional status/type filter.
 */
export async function getAllMedia(filters = {}) {
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
export async function getMediaById(id) {
  return await db.media.get(id);
}

/**
 * Fetch all episodes for a media item.
 */
export async function getEpisodesForMedia(mediaId) {
  return await db.episodes
    .where('mediaId')
    .equals(mediaId)
    .sortBy('episodeNumber')
    .then(eps => eps.sort((a, b) => a.seasonNumber - b.seasonNumber || a.episodeNumber - b.episodeNumber));
}

/**
 * Toggle single episode watched state.
 */
export async function toggleEpisodeWatched(mediaId, seasonNumber, episodeNumber) {
  return await db.transaction('rw', db.media, db.episodes, async () => {
    const episodeId = `${mediaId}_S${seasonNumber}E${episodeNumber}`;
    const ep = await db.episodes.get(episodeId);
    if (!ep) return;

    const newWatched = ep.isWatched ? 0 : 1;
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

    let media = await db.media.get(mediaId);
    if (media) {
      let status = media.status;
      if (totalCount > 0 && watchedCount === totalCount) {
        status = 'completed';
      } else if (watchedCount > 0 && status === 'plan_to_watch') {
        status = 'watching';
      }

      await db.media.update(mediaId, {
        watchedEpisodesCount: watchedCount,
        totalEpisodes: totalCount,
        currentSeason: seasonNumber,
        currentEpisode: episodeNumber,
        status,
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
export async function setExactProgress(mediaId, targetSeason, targetEpisode, markPreviousAsWatched = true) {
  return await db.transaction('rw', db.media, db.episodes, async () => {
    const episodes = await db.episodes.where('mediaId').equals(mediaId).toArray();
    const now = new Date().toISOString();

    if (markPreviousAsWatched && episodes.length > 0) {
      for (const ep of episodes) {
        const isPastOrEqual = 
          ep.seasonNumber < targetSeason || 
          (ep.seasonNumber === targetSeason && ep.episodeNumber <= targetEpisode);
        
        await db.episodes.update(ep.id, {
          isWatched: isPastOrEqual ? 1 : 0,
          watchedAt: isPastOrEqual ? (ep.watchedAt || now) : null
        });
      }
    }

    const updatedEpisodes = await db.episodes.where('mediaId').equals(mediaId).toArray();
    const watchedCount = updatedEpisodes.filter(e => e.isWatched === 1).length;
    const totalCount = updatedEpisodes.length;

    const media = await db.media.get(mediaId);
    if (media) {
      let status = media.status;
      if (totalCount > 0 && watchedCount === totalCount) {
        status = 'completed';
      } else if (watchedCount > 0 && status === 'plan_to_watch') {
        status = 'watching';
      }

      await db.media.update(mediaId, {
        currentSeason: targetSeason,
        currentEpisode: targetEpisode,
        watchedEpisodesCount: watchedCount,
        status,
        updatedAt: now
      });
    }
  });
}

/**
 * Strike off / mark all episodes up to and including (targetSeason, targetEpisode) as watched.
 * Does not unmark any already-watched episodes after it.
 */
export async function markEpisodesUpToWatched(mediaId, targetSeason, targetEpisode) {
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
      let status = media.status;
      if (totalCount > 0 && watchedCount === totalCount) {
        status = 'completed';
      } else if (watchedCount > 0 && status === 'plan_to_watch') {
        status = 'watching';
      }

      await db.media.update(mediaId, {
        currentSeason: targetSeason,
        currentEpisode: targetEpisode,
        watchedEpisodesCount: watchedCount,
        status,
        updatedAt: now
      });
    }
  });
}

/**
 * Mark an entire season as watched or unwatched.
 */
export async function setSeasonWatched(mediaId, seasonNumber, isWatched) {
  return await db.transaction('rw', db.media, db.episodes, async () => {
    const episodes = await db.episodes
      .where('mediaId')
      .equals(mediaId)
      .filter(ep => ep.seasonNumber === seasonNumber)
      .toArray();

    const now = new Date().toISOString();
    for (const ep of episodes) {
      await db.episodes.update(ep.id, {
        isWatched: isWatched ? 1 : 0,
        watchedAt: isWatched ? (ep.watchedAt || now) : null
      });
    }

    const allEps = await db.episodes.where('mediaId').equals(mediaId).toArray();
    const watchedCount = allEps.filter(e => e.isWatched === 1).length;
    const totalCount = allEps.length;

    const media = await db.media.get(mediaId);
    if (media) {
      let status = media.status;
      if (totalCount > 0 && watchedCount === totalCount) {
        status = 'completed';
      } else if (watchedCount > 0 && status === 'plan_to_watch') {
        status = 'watching';
      }

      await db.media.update(mediaId, {
        watchedEpisodesCount: watchedCount,
        status,
        updatedAt: now
      });
    }
  });
}

/**
 * Delete a media item and all associated episodes.
 */
export async function deleteMediaItem(id) {
  return await db.transaction('rw', db.media, db.episodes, async () => {
    await db.episodes.where('mediaId').equals(id).delete();
    await db.media.delete(id);
  });
}

/**
 * Update media status (e.g. 'watching', 'completed', 'plan_to_watch', 'dropped', 'on_hold').
 */
export async function updateMediaStatus(id, status) {
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
export async function updateMediaRatingAndNotes(id, rating, notes) {
  return await db.media.update(id, {
    rating: Number(rating),
    notes,
    updatedAt: new Date().toISOString()
  });
}

/**
 * Export all data from IndexedDB as a complete JSON backup object.
 */
export async function exportAllData() {
  const media = await db.media.toArray();
  const episodes = await db.episodes.toArray();
  const settings = await db.settings.toArray();

  return {
    app: 'BingeLog',
    version: 1,
    exportedAt: new Date().toISOString(),
    totalMedia: media.length,
    totalEpisodes: episodes.length,
    media,
    episodes,
    settings
  };
}

/**
 * Import JSON backup into IndexedDB (overwrite or merge).
 */
export async function importData(backupData, overwrite = false) {
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
      await db.episodes.bulkPut(backupData.episodes);
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
export async function getSetting(key, defaultValue = null) {
  const record = await db.settings.get(key);
  return record ? record.value : defaultValue;
}

export async function setSetting(key, value) {
  await db.settings.put({ key, value });
  return value;
}
