import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  getDbModule,
  getApiModule,
  getCloudSyncModule,
  resetDatabase,
  mockFetch
} from '../helpers/setup.js';

describe('Tier 1: TMDB -> TVMaze ID Collision Protection & Automatic Library Self-Healing (Issue #53)', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  test('resolveTVMazeShowId should never query or return a TMDB ID for a TMDB show', async () => {
    const { resolveTVMazeShowId } = await getApiModule();

    // Mock TVMaze lookup endpoint for Ms. Marvel IMDb ID tt10857164
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
      const urlStr = String(url);
      if (urlStr.includes('/lookup/shows?imdb=tt10857164')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: 43519,
            name: 'Ms. Marvel',
            premiered: '2022-06-08'
          })
        };
      }
      return { ok: false, status: 404 };
    };

    try {
      // 1. Show has source: 'tmdb' and externalId: 92782 (must NOT return 92782)
      const resolved = await resolveTVMazeShowId({
        title: 'Ms. Marvel',
        source: 'tmdb',
        externalId: 92782,
        tmdbId: 92782,
        imdbId: 'tt10857164'
      });

      assert.equal(resolved, 43519, 'Should resolve authentic TVMaze ID via IMDb lookup, never the TMDB ID');

      // 2. Show has corrupted tvmazeId equaling tmdbId (must ignore corrupted tvmazeId and lookup via IMDb)
      const resolvedCorrupted = await resolveTVMazeShowId({
        title: 'Ms. Marvel',
        source: 'tmdb',
        externalId: 92782,
        tmdbId: 92782,
        tvmazeId: 92782, // Corrupted by bug!
        imdbId: 'tt10857164'
      });

      assert.equal(resolvedCorrupted, 43519, 'Should ignore corrupted tvmazeId that equals tmdbId');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('fetchFullMediaDetails should safely resolve TVMaze without querying TMDB ID when TMDB key is missing', async () => {
    const { fetchFullMediaDetails } = await getApiModule();
    const { setSetting } = await getDbModule();

    // Ensure no TMDB API key is configured
    await setSetting('tmdb_api_key', '');

    const queriedUrls = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
      const urlStr = String(url);
      queriedUrls.push(urlStr);

      if (urlStr.includes('/lookup/shows?imdb=tt10857164')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: 43519,
            name: 'Ms. Marvel',
            premiered: '2022-06-08',
            status: 'Ended'
          })
        };
      }
      if (urlStr.includes('/shows/43519/episodes')) {
        return {
          ok: true,
          status: 200,
          json: async () => [
            { season: 1, number: 1, name: 'Generation Why', airdate: '2022-06-08' },
            { season: 1, number: 2, name: 'Crushed', airdate: '2022-06-15' },
            { season: 1, number: 3, name: 'Destined', airdate: '2022-06-22' },
            { season: 1, number: 4, name: 'Seeing Red', airdate: '2022-06-29' },
            { season: 1, number: 5, name: 'Time and Again', airdate: '2022-07-06' },
            { season: 1, number: 6, name: 'No Normal', airdate: '2022-07-13' }
          ]
        };
      }
      if (urlStr.includes('/shows/43519')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: 43519,
            name: 'Ms. Marvel',
            premiered: '2022-06-08',
            status: 'Ended',
            externals: { imdb: 'tt10857164', themoviedb: 92782 }
          })
        };
      }

      // If it queried /shows/92782 (the bug!), fail or return 404
      if (urlStr.includes('/shows/92782')) {
        throw new Error('CATASTROPHIC BUG: Queried TMDB ID 92782 directly against TVMaze endpoint!');
      }

      return { ok: false, status: 404 };
    };

    try {
      const res = await fetchFullMediaDetails({
        id: 'media_ms_marvel',
        title: 'Ms. Marvel',
        type: 'tv',
        source: 'tmdb',
        externalId: 92782,
        tmdbId: 92782,
        imdbId: 'tt10857164'
      });

      assert.equal(res.media.source, 'tmdb', 'Original source tmdb must be preserved');
      assert.equal(res.media.externalId, 92782, 'Original externalId 92782 must be preserved');
      assert.equal(res.media.tmdbId, 92782, 'Original tmdbId must be preserved');
      assert.equal(res.media.tvmazeId, 43519, 'Resolved TVMaze ID 43519 must be populated');
      assert.equal(res.episodes.length, 6, 'Must return authentic 6 episodes, not 150 telenovela episodes');
      assert.equal(res.episodes[0].title, 'Generation Why');
      assert.equal(res.episodes[5].title, 'No Normal');

      // Verify TMDB ID 92782 was never queried against TVMaze
      assert.ok(!queriedUrls.some(u => u.includes('api.tvmaze.com/shows/92782')), 'Must never query TMDB numeric ID against TVMaze');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('healCorruptedTmdbShows should detect and prune 144 phantom episodes, restore 6 episodes and completed status', async () => {
    const { db, saveMediaItem, healCorruptedTmdbShows } = await getDbModule();

    // Seed library with corrupted Ms. Marvel: 150 episodes!
    const corruptedEpisodes = [];
    for (let i = 1; i <= 150; i++) {
      corruptedEpisodes.push({
        seasonNumber: 1,
        episodeNumber: i,
        title: i <= 6 ? `Telenovela Episode ${i}` : `Phantom Episode ${i}`,
        airDate: '2022-06-08',
        isWatched: i <= 6 ? 1 : 0, // User had completed S1E1-S1E6
        watchedAt: i <= 6 ? '2026-09-16T15:57:30.000Z' : null
      });
    }

    const corruptedItem = await saveMediaItem({
      id: 'media_ms_marvel_corrupted',
      title: 'Ms. Marvel',
      type: 'tv',
      source: 'tmdb',
      externalId: 92782,
      tmdbId: 92782,
      tvmazeId: 92782, // Corrupted by bug!
      imdbId: 'tt10857164',
      totalSeasons: 1,
      totalEpisodes: 150,
      watchedEpisodesCount: 6,
      status: 'watching', // Downgraded from completed by the bug!
      airStatus: 'Ended'
    }, corruptedEpisodes);

    // Verify initial corrupted state
    const beforeEps = await db.episodes.where('mediaId').equals('media_ms_marvel_corrupted').toArray();
    assert.equal(beforeEps.length, 150, 'Library starts in corrupted state with 150 episodes');
    assert.equal(corruptedItem.status, 'watching');

    // Mock TVMaze responses for healing (or TMDB API)
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
      const urlStr = String(url);
      if (urlStr.includes('/lookup/shows?imdb=tt10857164')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: 43519,
            name: 'Ms. Marvel',
            premiered: '2022-06-08',
            status: 'Ended'
          })
        };
      }
      if (urlStr.includes('/shows/43519/episodes')) {
        return {
          ok: true,
          status: 200,
          json: async () => [
            { season: 1, number: 1, name: 'Generation Why', airdate: '2022-06-08' },
            { season: 1, number: 2, name: 'Crushed', airdate: '2022-06-15' },
            { season: 1, number: 3, name: 'Destined', airdate: '2022-06-22' },
            { season: 1, number: 4, name: 'Seeing Red', airdate: '2022-06-29' },
            { season: 1, number: 5, name: 'Time and Again', airdate: '2022-07-06' },
            { season: 1, number: 6, name: 'No Normal', airdate: '2022-07-13' }
          ]
        };
      }
      return { ok: false, status: 404 };
    };

    try {
      // Execute self-healing
      const healResult = await healCorruptedTmdbShows();

      assert.equal(healResult.healedCount, 1, 'Should heal 1 corrupted show');
      const healedShowInfo = healResult.healedShows[0];
      assert.equal(healedShowInfo.title, 'Ms. Marvel');
      assert.equal(healedShowInfo.previousEpisodesCount, 150);
      assert.equal(healedShowInfo.healedEpisodesCount, 6);
      assert.equal(healedShowInfo.removedPhantomCount, 144);

      // Verify database record post-heal
      const healedMedia = await db.media.get('media_ms_marvel_corrupted');
      assert.equal(healedMedia.totalEpisodes, 6, 'Total episodes must be restored to 6');
      assert.equal(healedMedia.watchedEpisodesCount, 6, 'Watched episodes must be 6/6');
      assert.equal(healedMedia.status, 'completed', 'Status must be restored to completed');
      assert.equal(healedMedia.tvmazeId, 43519, 'Corrupted tvmazeId 92782 must be replaced with true TVMaze ID 43519');

      const afterEps = await db.episodes.where('mediaId').equals('media_ms_marvel_corrupted').toArray();
      assert.equal(afterEps.length, 6, 'All 144 phantom episodes must be deleted from database');
      assert.equal(afterEps[0].title, 'Generation Why', 'Official titles restored');
      assert.equal(afterEps[0].isWatched, 1, 'Watched status preserved');
      assert.equal(afterEps[5].title, 'No Normal', 'Official titles restored');
      assert.equal(afterEps[5].isWatched, 1, 'Watched status preserved');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('mergeSyncPayload should never resurrect pruned phantom episodes from older remote cloud payload', async () => {
    const { mergeSyncPayload } = await getCloudSyncModule();

    const mediaId = 'media_ms_marvel_1';

    // Local device: Healed state at T2 (6 episodes)
    const localMedia = [{
      id: mediaId,
      title: 'Ms. Marvel',
      type: 'tv',
      source: 'tmdb',
      externalId: 92782,
      totalEpisodes: 6,
      watchedEpisodesCount: 6,
      status: 'completed',
      updatedAt: '2026-10-31T00:00:00.000Z' // T2 (newer)
    }];

    const localEpisodes = [
      { id: `${mediaId}_S1E1`, mediaId, seasonNumber: 1, episodeNumber: 1, title: 'Generation Why', isWatched: 1, watchedAt: '2026-09-16T00:00:00.000Z' },
      { id: `${mediaId}_S1E2`, mediaId, seasonNumber: 1, episodeNumber: 2, title: 'Crushed', isWatched: 1, watchedAt: '2026-09-16T00:00:00.000Z' },
      { id: `${mediaId}_S1E3`, mediaId, seasonNumber: 1, episodeNumber: 3, title: 'Destined', isWatched: 1, watchedAt: '2026-09-16T00:00:00.000Z' },
      { id: `${mediaId}_S1E4`, mediaId, seasonNumber: 1, episodeNumber: 4, title: 'Seeing Red', isWatched: 1, watchedAt: '2026-09-16T00:00:00.000Z' },
      { id: `${mediaId}_S1E5`, mediaId, seasonNumber: 1, episodeNumber: 5, title: 'Time and Again', isWatched: 1, watchedAt: '2026-09-16T00:00:00.000Z' },
      { id: `${mediaId}_S1E6`, mediaId, seasonNumber: 1, episodeNumber: 6, title: 'No Normal', isWatched: 1, watchedAt: '2026-09-16T00:00:00.000Z' }
    ];

    // Remote vault: Old corrupted state at T1 (150 episodes)
    const remoteEpisodes = [];
    for (let i = 1; i <= 150; i++) {
      remoteEpisodes.push({
        id: `${mediaId}_S1E${i}`,
        mediaId,
        seasonNumber: 1,
        episodeNumber: i,
        title: `Episode ${i}`,
        isWatched: i <= 6 ? 1 : 0
      });
    }

    const remotePayload = {
      version: 1,
      updatedAt: '2026-10-25T00:00:00.000Z', // T1 (older)
      deviceId: 'dev_remote',
      media: [{
        id: mediaId,
        title: 'Ms. Marvel',
        type: 'tv',
        source: 'tmdb',
        externalId: 92782,
        totalEpisodes: 150,
        watchedEpisodesCount: 6,
        status: 'watching',
        updatedAt: '2026-10-25T00:00:00.000Z'
      }],
      episodes: remoteEpisodes,
      customLists: [],
      canvases: [],
      tombstones: []
    };

    const result = mergeSyncPayload(
      {
        media: localMedia,
        episodes: localEpisodes,
        customLists: [],
        canvases: [],
        tombstones: []
      },
      remotePayload
    );

    assert.equal(result.mergedEpisodes.length, 6, 'Must retain clean 6 episodes and NOT resurrect the 144 phantom episodes');
    const mergedShow = result.mergedMedia.find(m => m.id === mediaId);
    assert.equal(mergedShow.totalEpisodes, 6);
    assert.equal(mergedShow.status, 'completed');
  });

  test('Cloud Sync should include tmdb_api_key and google_books_api_key in synced settings', async () => {
    const { syncManager } = await getCloudSyncModule();
    const { setSetting } = await getDbModule();

    await setSetting('tmdb_api_key', 'test_tmdb_key_12345');
    await setSetting('google_books_api_key', 'test_gb_key_67890');

    const payload = await syncManager.buildLocalPayload();

    assert.equal(payload.settings.tmdb_api_key, 'test_tmdb_key_12345', 'tmdb_api_key must be synced so paired PWA/secondary devices have it');
    assert.equal(payload.settings.google_books_api_key, 'test_gb_key_67890', 'google_books_api_key must be synced');
  });
});
