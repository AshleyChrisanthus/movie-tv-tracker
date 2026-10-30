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

describe('Tier 1 — E2EE Zero-Knowledge Cloud Sync & QR Device Pairing (Issue #49)', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterEach(async () => {
    const sync = await getCloudSyncModule();
    sync.syncManager.disconnectVault();
    restoreFetch();
  });

  it('encrypts and decrypts payloads with AES-GCM 256-bit and fresh 12-byte IVs, rejecting tampered ciphertexts', async () => {
    const sync = await getCloudSyncModule();

    const secretKey = await sync.generateSecretKey();
    assert.equal(secretKey.length, 43, 'Base64URL encoded 32-byte key should be 43 chars');
    assert.equal(sync.base64UrlToBytes(secretKey).byteLength, 32);

    const vaultId = sync.generateVaultId();
    assert.match(vaultId, /^[a-f0-9]{32}$/);

    const samplePayload = {
      version: 1,
      updatedAt: new Date().toISOString(),
      deviceId: 'dev_desktop_1',
      media: [
        {
          id: 'media_sev_1',
          title: 'Severance',
          type: 'tv',
          status: 'watching',
          source: 'tvmaze',
          externalId: 44933,
          year: 2022,
          totalEpisodes: 2,
          watchedEpisodesCount: 1,
          createdAt: '2026-10-01T00:00:00.000Z',
          updatedAt: '2026-10-27T10:00:00.000Z'
        }
      ],
      episodes: [
        {
          id: 'media_sev_1_S1E1',
          mediaId: 'media_sev_1',
          seasonNumber: 1,
          episodeNumber: 1,
          title: 'Good News About Hell',
          isWatched: 1,
          watchedAt: '2026-10-27T10:00:00.000Z'
        }
      ],
      customLists: [],
      canvases: [],
      tombstones: []
    };

    const env1 = await sync.encryptPayload(samplePayload, secretKey, 'dev_desktop_1');
    const env2 = await sync.encryptPayload(samplePayload, secretKey, 'dev_desktop_1');

    assert.equal(env1.v, 1);
    assert.notEqual(env1.iv, env2.iv, 'Every encryption must use a fresh random 12-byte IV');
    assert.notEqual(env1.ciphertext, env2.ciphertext);
    assert.ok(!env1.ciphertext.includes('Severance'), 'Ciphertext must not leak plaintext');

    const decrypted = await sync.decryptPayload(env1, secretKey);
    assert.equal(decrypted.media[0].title, 'Severance');
    assert.equal(decrypted.episodes[0].isWatched, 1);

    // Wrong key must fail authentication
    const wrongKey = await sync.generateSecretKey();
    await assert.rejects(async () => {
      await sync.decryptPayload(env1, wrongKey);
    });

    // PBKDF2 passphrase derivation
    const derived1 = await sync.deriveKeyFromPassphrase('correct horse battery staple');
    const saltBytes = sync.base64ToBytes(derived1.salt);
    const derived2 = await sync.deriveKeyFromPassphrase('correct horse battery staple', saltBytes);
    assert.equal(derived1.secretKey, derived2.secretKey);
  });

  it('validates reference Cloudflare Worker KV store and QR code SVG generator', async () => {
    const sync = await getCloudSyncModule();

    // Test QR SVG generator with a full pairing URL
    const pairingUrl =
      'https://scarlet-oyster-rs75.here.now/#sync=v1:0123456789abcdef0123456789abcdef:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq:custom:https%3A%2F%2Fapp-directory-sync.ashleychrisanthus.workers.dev';
    const matrix = sync.generateQrMatrix(pairingUrl);
    assert.ok(matrix.length >= 21 && matrix.length <= 73);
    const svg = sync.generateQrSvg(pairingUrl);
    assert.ok(svg.startsWith('<svg') && svg.includes('<path d="M'));

    // Test reference Cloudflare Worker (GET / PUT / OPTIONS)
    const kvMap = new Map();
    const mockEnv = {
      SYNC_VAULTS: {
        get: async (k) => kvMap.get(k) || null,
        put: async (k, v) => {
          kvMap.set(k, v);
        }
      }
    };

    const optRes = await workerModule.fetch(
      new Request('https://worker.example.com/api/vault/testvault1', {
        method: 'OPTIONS',
        headers: { Origin: 'https://scarlet-oyster-rs75.here.now' }
      }),
      mockEnv
    );
    assert.equal(optRes.status, 200);
    assert.equal(
      optRes.headers.get('Access-Control-Allow-Origin'),
      'https://scarlet-oyster-rs75.here.now'
    );

    const getMissing = await workerModule.fetch(
      new Request('https://worker.example.com/api/vault/testvault1', { method: 'GET' }),
      mockEnv
    );
    assert.equal(getMissing.status, 404);

    const putRes = await workerModule.fetch(
      new Request('https://worker.example.com/api/vault/testvault1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          v: 1,
          iv: 'dGVzdGl2MTIzNDU2',
          ciphertext: 'ZW5jcnlwdGVk',
          updatedAt: new Date().toISOString(),
          deviceId: 'dev_1'
        })
      }),
      mockEnv
    );
    assert.equal(putRes.status, 200);

    const getFound = await workerModule.fetch(
      new Request('https://worker.example.com/api/vault/testvault1', { method: 'GET' }),
      mockEnv
    );
    assert.equal(getFound.status, 200);
    const body = await getFound.json();
    assert.equal(body.ciphertext, 'ZW5jcnlwdGVk');
  });

  it('pairs Desktop and Mobile PWA via #sync=v1:... hash, syncs +1 Ep and books, and propagates deletion tombstones', async () => {
    const dbMod = await getDbModule();
    const sync = await getCloudSyncModule();

    // Simulated cloud locker backed by our reference Cloudflare Worker
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

    // 1. Desktop creates a TV show with 3 episodes (1 watched) and a Book
    const show = await dbMod.saveMediaItem(
      {
        title: 'Andor',
        type: 'tv',
        source: 'tvmaze',
        externalId: 48020,
        imdbId: 'tt9253284',
        year: 2022,
        airStatus: 'Returning Series',
        status: 'watching'
      },
      [
        { seasonNumber: 1, episodeNumber: 1, title: 'Kassa', airDate: '2022-09-21', isWatched: 1 },
        { seasonNumber: 1, episodeNumber: 2, title: 'That Would Be Me', airDate: '2022-09-21', isWatched: 0 },
        { seasonNumber: 1, episodeNumber: 3, title: 'Reckoning', airDate: '2022-09-21', isWatched: 0 }
      ]
    );

    const book = await dbMod.saveMediaItem({
      title: 'Project Hail Mary',
      type: 'book',
      source: 'openlibrary',
      externalId: 'OL2000W',
      author: 'Andy Weir',
      totalPages: 496,
      currentPage: 100,
      status: 'watching'
    });

    // Desktop creates a new E2EE Sync Vault
    const desktopConfig = await sync.syncManager.createNewVault({
      provider: 'custom',
      customEndpoint: 'https://worker.example.com'
    });
    assert.ok(desktopConfig.vaultId);
    assert.equal(desktopConfig.secretKey.length, 43);

    // Verify encrypted envelope was uploaded to cloud KV
    const rawCloudBlob = kvStore.get(`vault:${desktopConfig.vaultId}`);
    assert.ok(rawCloudBlob, 'Encrypted vault envelope should be stored in cloud KV');
    assert.ok(!rawCloudBlob.includes('Andor'), 'Cloud KV blob must be zero-knowledge ciphertext');

    const pairingUrl = sync.syncManager.getPairingUrl();
    assert.ok(pairingUrl.includes(`#sync=v1:${desktopConfig.vaultId}:${desktopConfig.secretKey}`));

    // Snapshot Desktop state before simulating Mobile device
    const desktopSnapshot = await dbMod.exportAllData({ mode: 'full' });
    const desktopConfigRaw = localStorage.getItem(sync.CONFIG_STORAGE_KEY);

    // 2. Simulate fresh Mobile PWA opening the QR pairing URL (#sync=v1:...)
    await resetDatabase();
    const hashPart = '#' + pairingUrl.split('#')[1];
    globalThis.window.location = {
      protocol: 'https:',
      hostname: 'scarlet-oyster-rs75.here.now',
      origin: 'https://scarlet-oyster-rs75.here.now',
      pathname: '/',
      search: '',
      hash: hashPart
    };
    let replacedUrl = null;
    globalThis.window.history = {
      replaceState: (_state, _title, url) => {
        replacedUrl = url;
        globalThis.window.location.hash = '';
      }
    };

    const paired = await sync.syncManager.checkUrlPairing();
    assert.equal(paired, true, 'Mobile PWA should detect and consume #sync=v1:... hash');
    assert.equal(replacedUrl, '/', 'URL hash must be scrubbed immediately via history.replaceState');
    assert.equal(globalThis.window.location.hash, '');

    // Verify Mobile decrypted and imported Desktop's library
    const mobileMedia = await dbMod.getAllMedia();
    assert.equal(mobileMedia.length, 2);
    const mobileAndor = mobileMedia.find((m) => m.title === 'Andor');
    assert.ok(mobileAndor);
    assert.equal(mobileAndor.watchedEpisodesCount, 1);

    // 3. On Mobile PWA: log +1 Ep on Andor (S1E2), update book pages to 250, and delete the book?
    // First let's test +1 Ep and book update syncing back to Desktop, then test deletion tombstone!
    await dbMod.toggleEpisodeWatched(show.id, 1, 2);
    await dbMod.updateBookProgress(book.id, { currentPage: 250, progressMode: 'pages' });
    await sync.syncManager.syncNow();

    // 4. Switch back to Desktop device, restore its pre-mobile local DB, and run syncNow()
    await resetDatabase();
    await dbMod.importData(desktopSnapshot, true);
    localStorage.setItem(sync.CONFIG_STORAGE_KEY, desktopConfigRaw);
    sync.syncManager.loadConfig();

    // Also on Desktop, mark S1E3 watched before syncing to verify per-episode merge!
    await dbMod.toggleEpisodeWatched(show.id, 1, 3);
    await sync.syncManager.syncNow();

    const mergedDesktopMedia = await dbMod.getAllMedia();
    const mergedAndor = mergedDesktopMedia.find((m) => m.id === show.id);
    const mergedBook = mergedDesktopMedia.find((m) => m.id === book.id);

    // Both Mobile's S1E2 watch AND Desktop's S1E3 watch must be preserved (3/3 watched -> caught_up)
    assert.equal(mergedAndor.watchedEpisodesCount, 3);
    assert.equal(mergedAndor.currentSeason, 1);
    assert.equal(mergedAndor.currentEpisode, 3);
    assert.equal(mergedAndor.status, 'caught_up');
    assert.equal(mergedBook.currentPage, 250);

    // 5. Delete the book on Desktop -> records a tombstone in localStorage and removes it on sync
    await dbMod.deleteMediaItem(book.id);
    const tombstones = sync.syncManager.getLocalTombstones();
    assert.ok(tombstones.some((t) => t.id === book.id && t.type === 'media'));

    await sync.syncManager.syncNow();

    // Verify remote payload now reflects the tombstone and only 1 media item remains
    const remoteEnvAfterDelete = await workerModule
      .fetch(
        new Request(`https://worker.example.com/api/vault/${desktopConfig.vaultId}`, {
          method: 'GET'
        }),
        workerEnv
      )
      .then((r) => r.json());

    const decryptedAfterDelete = await sync.decryptPayload(
      remoteEnvAfterDelete,
      desktopConfig.secretKey
    );
    assert.equal(decryptedAfterDelete.media.length, 1);
    assert.equal(decryptedAfterDelete.media[0].title, 'Andor');
    assert.ok(decryptedAfterDelete.tombstones.some((t) => t.id === book.id && t.type === 'media'));
  });
});
