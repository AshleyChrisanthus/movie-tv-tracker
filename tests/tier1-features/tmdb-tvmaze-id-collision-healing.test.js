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

  test('healCorruptedTmdbShows should detect and heal Shrinking when corrupted by Bruce Forsyth 14-episode collision', async () => {
    const { db, saveMediaItem, healCorruptedTmdbShows, setSetting } = await getDbModule();

    await setSetting('tmdb_api_key', 'mock_api_key');

    // 1. Seed database with corrupted Shrinking (14 episodes from Bruce Forsyth TMDB 58323 collision)
    const corruptedShrinking = {
      id: 'media_shrinking_corrupted',
      title: 'Shrinking',
      type: 'tv',
      source: 'tmdb',
      externalId: 58323,
      tvmazeId: 58323,
      tmdbId: 136311,
      imdbId: 'tt15677150',
      thetvdbId: 411364,
      totalSeasons: 1,
      totalEpisodes: 14,
      watchedEpisodesCount: 14,
      status: 'watching'
    };

    await saveMediaItem(corruptedShrinking);

    // Seed 14 corrupted episodes
    const corruptedEpisodes = [];
    for (let i = 1; i <= 14; i++) {
      corruptedEpisodes.push({
        id: `media_shrinking_corrupted_S1E${i}`,
        mediaId: 'media_shrinking_corrupted',
        seasonNumber: 1,
        episodeNumber: i,
        title: i <= 10 ? `Episode ${i}` : `Bruce Forsyth Extra ${i}`,
        isWatched: 1,
        watchedAt: '2026-09-14T03:05:00.000Z'
      });
    }
    await db.episodes.bulkPut(corruptedEpisodes);

    // Mock TVMaze 58323 episodes endpoint returning the 34 authentic Shrinking episodes across 3 seasons
    const mockTvmazeEpisodes = [];
    // Season 1: 10 episodes
    for (let e = 1; e <= 10; e++) {
      mockTvmazeEpisodes.push({ season: 1, number: e, name: `S1 Episode ${e}`, airdate: '2023-01-27' });
    }
    // Season 2: 12 episodes
    for (let e = 1; e <= 12; e++) {
      mockTvmazeEpisodes.push({ season: 2, number: e, name: `S2 Episode ${e}`, airdate: '2024-10-16' });
    }
    // Season 3: 12 episodes
    for (let e = 1; e <= 12; e++) {
      mockTvmazeEpisodes.push({ season: 3, number: e, name: `S3 Episode ${e}`, airdate: '2026-01-28' });
    }

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
      const urlStr = String(url);
      if (urlStr.includes('/shows/58323/episodes')) {
        return {
          ok: true,
          status: 200,
          json: async () => mockTvmazeEpisodes
        };
      }
      return { ok: false, status: 404 };
    };

    try {
      const healResult = await healCorruptedTmdbShows();

      assert.equal(healResult.healedCount, 1, 'Should heal the corrupted Shrinking show');
      const healedShowInfo = healResult.healedShows.find(s => s.title === 'Shrinking');
      assert.ok(healedShowInfo, 'Shrinking should be in healed list');
      assert.equal(healedShowInfo.previousEpisodesCount, 14);
      assert.equal(healedShowInfo.healedEpisodesCount, 34);

      // Verify database record post-heal
      const healedMedia = await db.media.get('media_shrinking_corrupted');
      assert.equal(healedMedia.source, 'tvmaze', 'Source must be restored to tvmaze');
      assert.equal(healedMedia.externalId, 58323, 'External ID must be 58323');
      assert.equal(healedMedia.tvmazeId, 58323, 'TVMaze ID must be 58323');
      assert.equal(healedMedia.tmdbId, 136311, 'True TMDB ID 136311 must be preserved');
      assert.equal(healedMedia.totalSeasons, 3, 'Total seasons must be restored to 3');
      assert.equal(healedMedia.totalEpisodes, 34, 'Total episodes must be restored to 34');
      assert.equal(healedMedia.watchedEpisodesCount, 34, 'User is caught up, watched count must be 34');
      assert.equal(healedMedia.status, 'caught_up', 'Status must be restored to caught_up');
      assert.equal(healedMedia.currentSeason, 3);
      assert.equal(healedMedia.currentEpisode, 12);

      const afterEps = await db.episodes.where('mediaId').equals('media_shrinking_corrupted').toArray();
      assert.equal(afterEps.length, 34, 'All 34 episodes across 3 seasons must be in database');
      assert.ok(afterEps.every(e => e.isWatched === 1), 'All episodes must be marked watched since user is caught up');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('healCorruptedTmdbShows should never convert legitimate TVMaze shows to TMDB', async () => {
    const { db, saveMediaItem, healCorruptedTmdbShows } = await getDbModule();

    // Seed Abbott Elementary as a normal TVMaze show
    const abbott = {
      id: 'media_abbott',
      title: 'Abbott Elementary',
      type: 'tv',
      source: 'tvmaze',
      externalId: 55350,
      tvmazeId: 55350,
      tmdbId: 125935,
      totalSeasons: 4,
      totalEpisodes: 50,
      watchedEpisodesCount: 50,
      status: 'caught_up'
    };
    await saveMediaItem(abbott);

    const abbottEps = [];
    for (let i = 1; i <= 50; i++) {
      abbottEps.push({
        id: `media_abbott_S1E${i}`,
        mediaId: 'media_abbott',
        seasonNumber: 1,
        episodeNumber: i,
        title: `Abbott Ep ${i}`,
        isWatched: 1
      });
    }
    await db.episodes.bulkPut(abbottEps);

    const healResult = await healCorruptedTmdbShows();

    // Abbott should NOT be healed or modified
    const abbottAfter = await db.media.get('media_abbott');
    assert.equal(abbottAfter.source, 'tvmaze', 'Abbott Elementary must remain tvmaze source');
    assert.equal(abbottAfter.externalId, 55350, 'Abbott Elementary externalId must remain 55350');
    assert.equal(abbottAfter.totalEpisodes, 50);
  });

  test('healCorruptedTmdbShows should detect and heal Abbott Elementary when corrupted by MyPam! 4-episode collision and restore S5E8 watch progress', async () => {
    const { db, saveMediaItem, healCorruptedTmdbShows } = await getDbModule();

    // 1. Seed database with corrupted Abbott Elementary (source: 'tmdb', externalId: 55350, 4 episodes from MyPam! TMDB 55350 collision)
    const corruptedAbbott = {
      id: 'media_abbott_corrupted',
      title: 'Abbott Elementary',
      type: 'tv',
      source: 'tmdb', // Flip caused by earlier healer!
      externalId: 55350, // TVMaze ID 55350!
      tvmazeId: 55350,
      tmdbId: 125935,
      imdbId: 'tt14218830',
      thetvdbId: 403102,
      totalSeasons: 1,
      totalEpisodes: 4,
      watchedEpisodesCount: 4,
      status: 'watching'
    };

    await saveMediaItem(corruptedAbbott);

    // Seed 4 corrupted episodes from MyPam!
    const corruptedEpisodes = [];
    for (let i = 1; i <= 4; i++) {
      corruptedEpisodes.push({
        id: `media_abbott_corrupted_S1E${i}`,
        mediaId: 'media_abbott_corrupted',
        seasonNumber: 1,
        episodeNumber: i,
        title: `MyPam Episode ${i}`,
        isWatched: 1,
        watchedAt: '2026-09-14T03:05:00.000Z'
      });
    }
    await db.episodes.bulkPut(corruptedEpisodes);

    // Mock TVMaze 55350 episodes endpoint returning the 101 authentic Abbott Elementary episodes across 6 seasons:
    // S1: 13, S2: 22, S3: 14, S4: 22, S5: 22, S6: 8 (total = 101)
    const seasonCounts = [
      { season: 1, count: 13, date: '2021-12-07' },
      { season: 2, count: 22, date: '2022-09-21' },
      { season: 3, count: 14, date: '2024-02-07' },
      { season: 4, count: 22, date: '2024-10-09' },
      { season: 5, count: 22, date: '2025-10-08' },
      { season: 6, count: 8, date: '2026-10-07' }
    ];
    const mockTvmazeEpisodes = [];
    for (const sc of seasonCounts) {
      for (let e = 1; e <= sc.count; e++) {
        mockTvmazeEpisodes.push({
          season: sc.season,
          number: e,
          name: `S${sc.season} Episode ${e}`,
          airdate: sc.date
        });
      }
    }

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
      const urlStr = String(url);
      if (urlStr.includes('/shows/55350/episodes')) {
        return {
          ok: true,
          status: 200,
          json: async () => mockTvmazeEpisodes
        };
      }
      return { ok: false, status: 404 };
    };

    try {
      const healResult = await healCorruptedTmdbShows();

      assert.equal(healResult.healedCount, 1, 'Should heal the corrupted Abbott Elementary show');
      const healedShowInfo = healResult.healedShows.find(s => s.title === 'Abbott Elementary');
      assert.ok(healedShowInfo, 'Abbott Elementary should be in healed list');
      assert.equal(healedShowInfo.previousEpisodesCount, 4);
      assert.equal(healedShowInfo.healedEpisodesCount, 101);

      // Verify database record post-heal
      const healedMedia = await db.media.get('media_abbott_corrupted');
      assert.equal(healedMedia.source, 'tvmaze', 'Source must be restored to tvmaze');
      assert.equal(healedMedia.externalId, 55350, 'External ID must be 55350');
      assert.equal(healedMedia.tvmazeId, 55350, 'TVMaze ID must be 55350');
      assert.equal(healedMedia.tmdbId, 125935, 'True TMDB ID 125935 must be preserved');
      assert.equal(healedMedia.totalSeasons, 6, 'Total seasons must be restored to 6');
      assert.equal(healedMedia.totalEpisodes, 101, 'Total episodes must be restored to 101');
      assert.equal(healedMedia.watchedEpisodesCount, 79, 'User reached S5E8 (13+22+14+22+8 = 79 watched episodes)');
      assert.equal(healedMedia.status, 'watching', 'Status must be watching');
      assert.equal(healedMedia.currentSeason, 5, 'Current season must be 5');
      assert.equal(healedMedia.currentEpisode, 8, 'Current episode must be 8');

      const afterEps = await db.episodes.where('mediaId').equals('media_abbott_corrupted').toArray();
      assert.equal(afterEps.length, 101, 'All 101 episodes across 6 seasons must be in database');
      const s5e8 = afterEps.find(e => e.seasonNumber === 5 && e.episodeNumber === 8);
      const s5e9 = afterEps.find(e => e.seasonNumber === 5 && e.episodeNumber === 9);
      assert.equal(s5e8.isWatched, 1, 'S5E8 must be marked watched');
      assert.equal(s5e9.isWatched, 0, 'S5E9 must be marked unwatched');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('isMatchingShowIdentity and fetchFullMediaDetails should reject unrelated shows from cross-provider numeric ID collisions', async () => {
    const { isMatchingShowIdentity, fetchFullMediaDetails } = await getApiModule();

    // 1. Direct identity check
    assert.equal(
      isMatchingShowIdentity({ title: 'Abbott Elementary', imdbId: 'tt14218830' }, 'MyPam!', 'tt9999999'),
      false,
      'Must reject MyPam! when expecting Abbott Elementary'
    );
    assert.equal(
      isMatchingShowIdentity({ title: 'Shrinking', imdbId: 'tt15677150' }, "Bruce Forsyth's Big Night", null),
      false,
      'Must reject Bruce Forsyth when expecting Shrinking'
    );
    assert.equal(
      isMatchingShowIdentity({ title: 'Abbott Elementary', imdbId: 'tt14218830' }, 'Abbott Elementary', 'tt14218830'),
      true,
      'Must accept matching show identity'
    );

    // 2. Mislabeled TVMaze show in fetchFullMediaDetails should auto-route to TVMaze and restore source: 'tvmaze'
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
      const urlStr = String(url);
      if (urlStr.includes('api.tvmaze.com/shows/55350/episodes')) {
        return {
          ok: true,
          status: 200,
          json: async () => [
            { season: 1, number: 1, name: 'Pilot', airdate: '2021-12-07' }
          ]
        };
      }
      if (urlStr.includes('api.tvmaze.com/shows/55350')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: 55350,
            name: 'Abbott Elementary',
            status: 'Running',
            premiered: '2021-12-07',
            externals: { imdb: 'tt14218830', thetvdb: 403102 }
          })
        };
      }
      return { ok: false, status: 404 };
    };

    try {
      const mislabeledShow = {
        id: 'media_abbott_test',
        title: 'Abbott Elementary',
        type: 'tv',
        source: 'tmdb', // Wrongly flipped!
        externalId: 55350, // TVMaze ID!
        tvmazeId: 55350,
        tmdbId: 125935,
        imdbId: 'tt14218830'
      };
      const details = await fetchFullMediaDetails(mislabeledShow);
      assert.equal(details.media.source, 'tvmaze', 'Must automatically restore source to tvmaze');
      assert.equal(details.media.externalId, 55350);
      assert.equal(details.episodes.length, 1);
      assert.equal(details.episodes[0].title, 'Pilot');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
