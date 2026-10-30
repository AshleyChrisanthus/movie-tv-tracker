import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  getDbModule,
  getCloudSyncModule,
  resetDatabase,
  mockFetch,
  restoreFetch
} from '../helpers/setup.js';
import workerModule from '../../server/cloudflare-sync-worker.js';

describe('Tier 1 — Cloud Sync Force Push & Pull Directional Overwrites (Issue #54)', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterEach(async () => {
    const sync = await getCloudSyncModule();
    sync.syncManager.disconnectVault();
    restoreFetch();
  });

  it('pushToCloud({ forceOverwrite: true }) should overwrite remote cloud vault with local state, replacing outdated remote data', async () => {
    const dbMod = await getDbModule();
    const sync = await getCloudSyncModule();

    const kvStore = new Map();
    const workerEnv = {
      SYNC_VAULTS: {
        get: async (k) => kvStore.get(k) || null,
        put: async (k, v) => {
          kvStore.set(k, v);
        }
      }
    };

    mockFetch(async (url, init) => {
      const req = new Request(url, {
        method: init?.method || 'GET',
        headers: init?.headers,
        body: init?.body
      });
      return await workerModule.fetch(req, workerEnv);
    });

    // 1. Initial vault setup with clean local Abbott Elementary (101 episodes across 6 seasons, S5E8 watched)
    const abbottEpisodes = [];
    let watchedCount = 0;
    // 6 seasons: 13, 22, 14, 22, 22, 8 = 101
    const seasonCounts = [13, 22, 14, 22, 22, 8];
    for (let s = 1; s <= 6; s++) {
      for (let e = 1; e <= seasonCounts[s - 1]; e++) {
        const isWatched = s < 5 || (s === 5 && e <= 8) ? 1 : 0;
        if (isWatched) watchedCount++;
        abbottEpisodes.push({
          seasonNumber: s,
          episodeNumber: e,
          title: `S${s}E${e}`,
          isWatched
        });
      }
    }

    const cleanShow = await dbMod.saveMediaItem(
      {
        id: 'media_abbott_1',
        title: 'Abbott Elementary',
        type: 'tv',
        source: 'tvmaze',
        externalId: 55350,
        tvmazeId: 55350,
        tmdbId: 125935,
        totalSeasons: 6,
        totalEpisodes: 101,
        watchedEpisodesCount: watchedCount,
        currentSeason: 5,
        currentEpisode: 8,
        status: 'watching'
      },
      abbottEpisodes
    );

    const vaultConfig = await sync.syncManager.createNewVault({
      provider: 'custom',
      customEndpoint: 'https://worker.example.com'
    });

    // 2. Corrupt remote cloud KV directly to simulate an outdated remote payload (e.g. MyPam! 4-episode collision)
    const corruptedRemotePayload = {
      version: 1,
      updatedAt: '2026-10-25T00:00:00.000Z',
      deviceId: 'dev_mobile_corrupted',
      media: [
        {
          id: 'media_abbott_1',
          title: 'Abbott Elementary',
          type: 'tv',
          source: 'tmdb',
          externalId: 55350,
          totalSeasons: 1,
          totalEpisodes: 4,
          watchedEpisodesCount: 4,
          status: 'watching',
          updatedAt: '2026-10-25T00:00:00.000Z'
        }
      ],
      episodes: [
        { id: 'media_abbott_1_S1E1', mediaId: 'media_abbott_1', seasonNumber: 1, episodeNumber: 1, title: 'MyPam 1', isWatched: 1 },
        { id: 'media_abbott_1_S1E2', mediaId: 'media_abbott_1', seasonNumber: 1, episodeNumber: 2, title: 'MyPam 2', isWatched: 1 },
        { id: 'media_abbott_1_S1E3', mediaId: 'media_abbott_1', seasonNumber: 1, episodeNumber: 3, title: 'MyPam 3', isWatched: 1 },
        { id: 'media_abbott_1_S1E4', mediaId: 'media_abbott_1', seasonNumber: 1, episodeNumber: 4, title: 'MyPam 4', isWatched: 1 }
      ],
      customLists: [],
      canvases: [],
      tombstones: []
    };

    const corruptedEnvelope = await sync.encryptPayload(corruptedRemotePayload, vaultConfig.secretKey, 'dev_mobile_corrupted');
    kvStore.set(`vault:${vaultConfig.vaultId}`, JSON.stringify(corruptedEnvelope));

    // 3. Execute pushToCloud({ forceOverwrite: true }) from Desktop
    const pushResult = await sync.syncManager.pushToCloud({ forceOverwrite: true });
    assert.equal(pushResult, true, 'pushToCloud should succeed');

    // Verify remote KV is completely replaced by clean 101 episodes of Abbott Elementary
    const remoteBlobAfterPush = kvStore.get(`vault:${vaultConfig.vaultId}`);
    assert.ok(remoteBlobAfterPush);
    const remoteEnvelopeAfterPush = JSON.parse(remoteBlobAfterPush);
    const decryptedPayload = await sync.decryptPayload(remoteEnvelopeAfterPush, vaultConfig.secretKey);

    assert.equal(decryptedPayload.media.length, 1);
    assert.equal(decryptedPayload.media[0].title, 'Abbott Elementary');
    assert.equal(decryptedPayload.media[0].totalEpisodes, 101);
    assert.equal(decryptedPayload.media[0].watchedEpisodesCount, 79);
    assert.equal(decryptedPayload.media[0].source, 'tvmaze');
    assert.equal(decryptedPayload.episodes.length, 101, 'Cloud vault must now have all 101 episodes, NOT the 4 corrupted episodes');
  });

  it('pullFromCloud({ forceOverwrite: true }) should replace local library completely with cloud vault data', async () => {
    const dbMod = await getDbModule();
    const sync = await getCloudSyncModule();

    const kvStore = new Map();
    const workerEnv = {
      SYNC_VAULTS: {
        get: async (k) => kvStore.get(k) || null,
        put: async (k, v) => {
          kvStore.set(k, v);
        }
      }
    };

    mockFetch(async (url, init) => {
      const req = new Request(url, {
        method: init?.method || 'GET',
        headers: init?.headers,
        body: init?.body
      });
      return await workerModule.fetch(req, workerEnv);
    });

    const secretKey = await sync.generateSecretKey();
    const vaultId = sync.generateVaultId();

    // Remote vault contains authentic Shrinking (34 episodes across 3 seasons, caught_up)
    const remoteShrinkingEpisodes = [];
    for (let e = 1; e <= 34; e++) {
      const season = e <= 10 ? 1 : e <= 22 ? 2 : 3;
      const epNum = e <= 10 ? e : e <= 22 ? e - 10 : e - 22;
      remoteShrinkingEpisodes.push({
        id: `media_shrinking_S${season}E${epNum}`,
        mediaId: 'media_shrinking',
        seasonNumber: season,
        episodeNumber: epNum,
        title: `Shrinking S${season}E${epNum}`,
        isWatched: 1
      });
    }

    const remotePayload = {
      version: 1,
      updatedAt: new Date().toISOString(),
      deviceId: 'dev_desktop',
      media: [
        {
          id: 'media_shrinking',
          title: 'Shrinking',
          type: 'tv',
          source: 'tvmaze',
          externalId: 58323,
          tvmazeId: 58323,
          tmdbId: 136311,
          totalSeasons: 3,
          totalEpisodes: 34,
          watchedEpisodesCount: 34,
          status: 'caught_up',
          currentSeason: 3,
          currentEpisode: 12,
          updatedAt: new Date().toISOString()
        }
      ],
      episodes: remoteShrinkingEpisodes,
      customLists: [],
      canvases: [],
      tombstones: []
    };

    const envelope = await sync.encryptPayload(remotePayload, secretKey, 'dev_desktop');
    kvStore.set(`vault:${vaultId}`, JSON.stringify(envelope));

    // Local device has old corrupted 14 episodes of Shrinking (Bruce Forsyth collision)
    await dbMod.saveMediaItem(
      {
        id: 'media_shrinking',
        title: 'Shrinking',
        type: 'tv',
        source: 'tmdb',
        externalId: 58323,
        totalSeasons: 1,
        totalEpisodes: 14,
        watchedEpisodesCount: 14,
        status: 'watching'
      },
      [
        { seasonNumber: 1, episodeNumber: 1, title: 'Bruce 1', isWatched: 1 }
      ]
    );

    // Join vault
    sync.syncManager.joinVault(vaultId, secretKey, 'custom', 'https://worker.example.com');

    // Execute pullFromCloud({ forceOverwrite: true })
    const pullResult = await sync.syncManager.pullFromCloud({ forceOverwrite: true });
    assert.equal(pullResult, true);

    // Verify local IndexedDB now matches the cloud vault exactly
    const localMedia = await dbMod.getAllMedia();
    assert.equal(localMedia.length, 1);
    const shrinking = localMedia[0];
    assert.equal(shrinking.title, 'Shrinking');
    assert.equal(shrinking.source, 'tvmaze');
    assert.equal(shrinking.totalEpisodes, 34);
    assert.equal(shrinking.totalSeasons, 3);
    assert.equal(shrinking.watchedEpisodesCount, 34);
    assert.equal(shrinking.status, 'caught_up');

    const episodesInDb = await dbMod.db.episodes.where('mediaId').equals('media_shrinking').toArray();
    assert.equal(episodesInDb.length, 34, 'Local DB must contain all 34 authentic episodes');
    assert.ok(episodesInDb.every(e => e.isWatched === 1));
  });

  it('mergeSyncPayload should never resurrect pruned episodes when localMediaTime >= remoteMediaTime', async () => {
    const sync = await getCloudSyncModule();

    const mediaId = 'media_ms_marvel';
    const nowIso = '2026-10-31T01:00:00.000Z';

    const localMedia = [{
      id: mediaId,
      title: 'Ms. Marvel',
      type: 'tv',
      source: 'tmdb',
      externalId: 92782,
      totalEpisodes: 6,
      watchedEpisodesCount: 6,
      status: 'completed',
      updatedAt: nowIso
    }];

    const localEpisodes = [
      { id: `${mediaId}_S1E1`, mediaId, seasonNumber: 1, episodeNumber: 1, title: 'Generation Why', isWatched: 1 },
      { id: `${mediaId}_S1E2`, mediaId, seasonNumber: 1, episodeNumber: 2, title: 'Crushed', isWatched: 1 },
      { id: `${mediaId}_S1E3`, mediaId, seasonNumber: 1, episodeNumber: 3, title: 'Destined', isWatched: 1 },
      { id: `${mediaId}_S1E4`, mediaId, seasonNumber: 1, episodeNumber: 4, title: 'Seeing Red', isWatched: 1 },
      { id: `${mediaId}_S1E5`, mediaId, seasonNumber: 1, episodeNumber: 5, title: 'Time and Again', isWatched: 1 },
      { id: `${mediaId}_S1E6`, mediaId, seasonNumber: 1, episodeNumber: 6, title: 'No Normal', isWatched: 1 }
    ];

    // Remote has equal timestamp (nowIso) with 150 episodes
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
      updatedAt: nowIso,
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
        updatedAt: nowIso
      }],
      episodes: remoteEpisodes,
      customLists: [],
      canvases: [],
      tombstones: []
    };

    const result = sync.mergeSyncPayload(
      {
        media: localMedia,
        episodes: localEpisodes,
        customLists: [],
        canvases: [],
        tombstones: []
      },
      remotePayload
    );

    assert.equal(result.mergedEpisodes.length, 6, 'Must retain 6 episodes when localMediaTime >= remoteMediaTime');
    assert.equal(result.mergedMedia[0].totalEpisodes, 6);
  });
});
