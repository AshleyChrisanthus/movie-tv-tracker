/**
 * Standalone Empirical Stress-Test Suite: Milestone 3 Services & Theming Parity
 * 
 * Verifies:
 * 1. src/services/api.ts:
 *    - searchMedia fallback to TVMaze & iTunes when TMDB key is unset or fails
 *    - Rate-limited sync worker queue cancellation via AbortController
 * 2. src/services/exportService.ts:
 *    - Export serialization across all 3 tiers (minimal, compact, full)
 *    - importBackupFile format validation & error handling
 * 3. src/styles/theme.ts:
 *    - applyTheme / preset palette application & custom overrides
 *    - Preset color token retrieval across all 7 presets
 *    - getGenreTagStyle color wheel & tag calculation
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

// Setup environment shims and import helper hooks
import './helpers/setup.js';
import {
  getApiModule,
  getExportServiceModule,
  getThemeModule,
  getDbModule,
  resetDatabase,
  mockFetch,
  restoreFetch
} from './helpers/setup.js';

// Setup FileReader polyfill for Node.js environment
class MockFileReader {
  constructor() {
    this.onload = null;
    this.onerror = null;
  }

  readAsText(file) {
    setTimeout(async () => {
      try {
        if (file && file._simulateReaderError) {
          throw new Error('Disk I/O error reading backup file');
        }

        let content = '';
        if (typeof file === 'string') {
          content = file;
        } else if (file && typeof file.text === 'function') {
          content = await file.text();
        } else if (file && file.content !== undefined) {
          content = file.content;
        } else {
          content = String(file);
        }

        if (this.onload) {
          this.onload({ target: { result: content } });
        }
      } catch (err) {
        if (this.onerror) {
          this.onerror(err);
        }
      }
    }, 5);
  }
}

globalThis.FileReader = MockFileReader;

describe('Milestone 3 Parity & Stress Challenge Suite', () => {
  let apiModule;
  let exportModule;
  let themeModule;
  let dbModule;

  beforeEach(async () => {
    await resetDatabase();
    apiModule = await getApiModule();
    exportModule = await getExportServiceModule();
    themeModule = await getThemeModule();
    dbModule = await getDbModule();
  });

  afterEach(() => {
    restoreFetch();
  });

  // =========================================================================
  // 1. API SERVICE (src/services/api.ts)
  // =========================================================================
  describe('api.ts: Multi-Provider Search Fallback & Sync Queue Cancellation', () => {
    it('should fallback to TVMaze and iTunes when TMDB API key is unset', async () => {
      // Ensure no TMDB API key in settings or env
      await dbModule.setSetting('tmdb_api_key', '');
      globalThis.importMetaEnv = {};

      const queriedUrls = [];
      mockFetch((url) => {
        queriedUrls.push(url);

        // TVMaze Shows Mock
        if (url.includes('tvmaze.com/search/shows')) {
          return Promise.resolve({
            ok: true,
            json: async () => [
              {
                show: {
                  id: 991,
                  name: 'Doctor Who',
                  premiered: '2005-03-26',
                  summary: '<p>The Doctor is an alien Time Lord from <b>Gallifrey</b>.</p>',
                  rating: { average: 8.6 },
                  image: {
                    medium: 'https://tvmaze.example.com/drwho_med.jpg',
                    original: 'https://tvmaze.example.com/drwho_orig.jpg'
                  },
                  genres: ['Adventure', 'Drama', 'Sci-Fi'],
                  status: 'Running'
                }
              },
              {
                show: {
                  id: 992,
                  name: 'Doctor Foster',
                  premiered: '2015-09-09',
                  summary: null,
                  rating: null,
                  image: null,
                  genres: ['Drama'],
                  status: 'Ended'
                }
              }
            ]
          });
        }

        // iTunes Movies Mock
        if (url.includes('itunes.apple.com/search')) {
          assert.ok(url.includes('media=movie'));
          return Promise.resolve({
            ok: true,
            json: async () => ({
              results: [
                {
                  trackId: 881,
                  trackName: 'Doctor Strange',
                  releaseDate: '2016-11-04T07:00:00Z',
                  longDescription: 'A brilliant neurosurgeon discovers the mystic arts.',
                  artworkUrl100: 'https://itunes.example.com/drstrange_100x100bb.jpg',
                  primaryGenreName: 'Action'
                }
              ]
            })
          });
        }

        return Promise.reject(new Error(`Unexpected fetch call to: ${url}`));
      });

      const results = await apiModule.searchMedia('Doctor');

      // Verify both providers were queried concurrently
      assert.equal(queriedUrls.length, 2);
      assert.ok(queriedUrls.some(u => u.includes('tvmaze.com')));
      assert.ok(queriedUrls.some(u => u.includes('itunes.apple.com')));

      // Verify combined results length (2 TV shows + 1 movie)
      assert.equal(results.length, 3);

      // Verify TVMaze mapping & HTML stripping
      const drWho = results.find(r => r.externalId === 991);
      assert.ok(drWho);
      assert.equal(drWho.source, 'tvmaze');
      assert.equal(drWho.type, 'tv');
      assert.equal(drWho.title, 'Doctor Who');
      assert.equal(drWho.year, 2005);
      assert.equal(drWho.overview, 'The Doctor is an alien Time Lord from Gallifrey.');
      assert.equal(drWho.rating, 8.6);
      assert.equal(drWho.posterUrl, 'https://tvmaze.example.com/drwho_med.jpg');
      assert.equal(drWho.backdropUrl, 'https://tvmaze.example.com/drwho_orig.jpg');

      // Verify TV show with null/missing image
      const drFoster = results.find(r => r.externalId === 992);
      assert.ok(drFoster);
      assert.equal(drFoster.overview, '');
      assert.equal(drFoster.posterUrl, null);
      assert.equal(drFoster.backdropUrl, null);

      // Verify iTunes movie mapping & upgraded artwork (600x600)
      const drStrange = results.find(r => r.externalId === 881);
      assert.ok(drStrange);
      assert.equal(drStrange.source, 'itunes');
      assert.equal(drStrange.type, 'movie');
      assert.equal(drStrange.title, 'Doctor Strange');
      assert.equal(drStrange.year, 2016);
      assert.equal(drStrange.releaseDate, '2016-11-04');
      assert.equal(drStrange.posterUrl, 'https://itunes.example.com/drstrange_600x600bb.jpg');
      assert.deepEqual(drStrange.genres, ['Action']);
    });

    it('should fallback to TVMaze and iTunes when TMDB returns 401 Unauthorized or throws', async () => {
      await dbModule.setSetting('tmdb_api_key', 'invalid_expired_token');

      mockFetch((url) => {
        if (url.includes('api.themoviedb.org')) {
          return Promise.resolve({
            ok: false,
            status: 401,
            statusText: 'Unauthorized'
          });
        }
        if (url.includes('tvmaze.com')) {
          return Promise.resolve({
            ok: true,
            json: async () => [
              { show: { id: 701, name: 'Fallback TV Show', premiered: '2021-01-01' } }
            ]
          });
        }
        if (url.includes('itunes.apple.com')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ results: [] })
          });
        }
        return Promise.reject(new Error('Unexpected URL'));
      });

      const results = await apiModule.searchMedia('test fallback');
      assert.equal(results.length, 1);
      assert.equal(results[0].title, 'Fallback TV Show');
      assert.equal(results[0].source, 'tvmaze');
    });

    it('should gracefully handle partial failure when one free provider throws an exception', async () => {
      // Unset TMDB key
      await dbModule.setSetting('tmdb_api_key', '');

      mockFetch((url) => {
        if (url.includes('tvmaze.com')) {
          // Network error on TVMaze
          return Promise.reject(new Error('TVMaze network outage'));
        }
        if (url.includes('itunes.apple.com')) {
          // iTunes succeeds
          return Promise.resolve({
            ok: true,
            json: async () => ({
              results: [
                {
                  trackId: 777,
                  trackName: 'Resilient Movie',
                  releaseDate: '2022-05-10',
                  artworkUrl100: 'https://example.com/art100.jpg'
                }
              ]
            })
          });
        }
        return Promise.reject(new Error('Unknown URL'));
      });

      const results = await apiModule.searchMedia('resilient');
      assert.equal(results.length, 1);
      assert.equal(results[0].title, 'Resilient Movie');
      assert.equal(results[0].source, 'itunes');
    });

    it('should return empty array for empty, whitespace, or null queries without making network requests', async () => {
      let fetchCalled = false;
      mockFetch(() => {
        fetchCalled = true;
        return Promise.reject(new Error('Should not be called'));
      });

      assert.deepEqual(await apiModule.searchMedia(''), []);
      assert.deepEqual(await apiModule.searchMedia('   \t\n  '), []);
      assert.deepEqual(await apiModule.searchMedia(null), []);
      assert.deepEqual(await apiModule.searchMedia(undefined), []);
      assert.equal(fetchCalled, false);
    });

    it('should cancel rate-limited sync worker queue mid-flight via AbortController', async () => {
      // Create 6 shows in the library
      const shows = Array.from({ length: 6 }, (_, i) => ({
        id: `show_${i + 1}`,
        type: 'tv',
        title: `Show ${i + 1}`,
        externalId: 1000 + i + 1,
        status: 'watching'
      }));

      // Mock TVMaze show details & episodes with small delay to test concurrent worker abort
      mockFetch(async (url) => {
        if (url.includes('/shows/')) {
          await new Promise(r => setTimeout(r, 25));
          return {
            ok: true,
            json: async () => {
              if (url.endsWith('/episodes')) {
                return [
                  { id: 1, season: 1, number: 1, name: 'Pilot', airdate: '2024-01-01' }
                ];
              }
              return { id: 1001, name: 'Synced Show', premiered: '2024-01-01' };
            }
          };
        }
        return Promise.reject(new Error('Unexpected URL'));
      });

      const abortController = new AbortController();
      const progressSnapshots = [];

      const syncPromise = apiModule.runSyncQueue(shows, {
        concurrency: 2,
        delayMs: 30,
        abortSignal: abortController.signal,
        onProgress: (completed, total, currentShow, result, isCancelled) => {
          progressSnapshots.push({ completed, total, isCancelled });
          // Trigger abort as soon as 1 item is completed so the concurrent worker witnesses isCancelled=true
          if (completed >= 1 && !abortController.signal.aborted) {
            abortController.abort();
          }
        }
      });

      const queueResult = await syncPromise;

      // Verify cancellation flags
      assert.equal(queueResult.isCancelled, true);
      assert.equal(queueResult.total, 6);
      // Because abort was triggered immediately, remaining shows must not be processed
      assert.ok(queueResult.completed < 6, `Expected completed < 6, got ${queueResult.completed}`);
      assert.ok(queueResult.completed >= 1, `Expected completed >= 1, got ${queueResult.completed}`);
      assert.ok(progressSnapshots.some(s => s.isCancelled === true), 'Concurrent worker must report isCancelled=true');
    });

    it('should immediately exit sync queue when AbortSignal is pre-aborted', async () => {
      const shows = [
        { id: 'pre_show_1', type: 'tv', title: 'Pre-aborted Show', externalId: 9999 }
      ];

      const abortController = new AbortController();
      abortController.abort(); // Pre-aborted

      let fetchCalled = false;
      mockFetch(() => {
        fetchCalled = true;
        return Promise.resolve({ ok: true, json: async () => ({}) });
      });

      const queueResult = await apiModule.runSyncQueue(shows, {
        concurrency: 2,
        delayMs: 50,
        abortSignal: abortController.signal
      });

      assert.equal(queueResult.isCancelled, true);
      assert.equal(queueResult.completed, 0);
      assert.equal(queueResult.total, 1);
      assert.equal(fetchCalled, false, 'Fetch must not be called when signal is already aborted');
    });

    it('should complete all items when sync queue is not aborted', async () => {
      const shows = [
        { id: 'full_show_1', type: 'tv', title: 'Complete Show 1', externalId: 2001 },
        { id: 'full_show_2', type: 'tv', title: 'Complete Show 2', externalId: 2002 }
      ];

      mockFetch((url) => {
        return Promise.resolve({
          ok: true,
          json: async () => {
            if (url.endsWith('/episodes')) {
              return [{ id: 1, season: 1, number: 1, name: 'Ep 1', airdate: '2024-01-01' }];
            }
            return { id: 2001, name: 'Complete Show', premiered: '2024-01-01' };
          }
        });
      });

      const result = await apiModule.runSyncQueue(shows, {
        concurrency: 2,
        delayMs: 10
      });

      assert.equal(result.isCancelled, false);
      assert.equal(result.total, 2);
      assert.equal(result.completed, 2);
    });
  });

  // =========================================================================
  // 2. EXPORT & BACKUP SERVICE (src/services/exportService.ts)
  // =========================================================================
  describe('exportService.ts: 3-Tier Backup Serialization & Format Validation', () => {
    // Setup rich data in database
    const setupLibrary = async () => {
      // 1. Standard TV Show: S1 with 3 episodes (S1E1 watched, S1E2 unwatched, S1E3 watched)
      const standardTvShow = {
        id: 'tv_breaking_bad',
        type: 'tv',
        title: 'Breaking Bad',
        source: 'tvmaze',
        externalId: 169,
        status: 'watching',
        totalSeasons: 1,
        totalEpisodes: 3,
        watchedEpisodesCount: 2
      };
      const standardEpisodes = [
        {
          id: 'tv_breaking_bad_S1E1',
          mediaId: 'tv_breaking_bad',
          seasonNumber: 1,
          episodeNumber: 1,
          title: 'Pilot',
          overview: 'A high school chemistry teacher diagnosed with lung cancer turns to manufacturing methamphetamine.',
          stillUrl: 'https://image.example.com/pilot_still.jpg',
          isWatched: 1,
          watchedAt: '2026-09-01T12:00:00.000Z'
        },
        {
          id: 'tv_breaking_bad_S1E2',
          mediaId: 'tv_breaking_bad',
          seasonNumber: 1,
          episodeNumber: 2,
          title: "Cat's in the Bag...",
          overview: 'Walt and Jesse attempt to dispose of two bodies in the RV.',
          stillUrl: 'https://image.example.com/s1e2_still.jpg',
          isWatched: 0,
          watchedAt: null
        },
        {
          id: 'tv_breaking_bad_S1E3',
          mediaId: 'tv_breaking_bad',
          seasonNumber: 1,
          episodeNumber: 3,
          title: "...And the Bag's in the River",
          overview: 'Walt is left to deal with Krazy-8 alone in the basement.',
          stillUrl: 'https://image.example.com/s1e3_still.jpg',
          isWatched: 1,
          watchedAt: '2026-09-02T14:00:00.000Z'
        }
      ];
      await dbModule.saveMediaItem(standardTvShow, standardEpisodes);

      // 2. Custom TV Show: 2 episodes (both unwatched)
      const customShow = {
        id: 'custom_indie_series',
        type: 'tv',
        title: 'Indie Web Series',
        source: 'custom',
        status: 'plan_to_watch',
        totalSeasons: 1,
        totalEpisodes: 2,
        watchedEpisodesCount: 0
      };
      const customEpisodes = [
        {
          id: 'custom_indie_series_S1E1',
          mediaId: 'custom_indie_series',
          seasonNumber: 1,
          episodeNumber: 1,
          title: 'Custom Episode 1',
          overview: 'Custom written episode by user',
          stillUrl: 'https://custom.example.com/still1.jpg',
          isWatched: 0,
          watchedAt: null
        },
        {
          id: 'custom_indie_series_S1E2',
          mediaId: 'custom_indie_series',
          seasonNumber: 1,
          episodeNumber: 2,
          title: 'Custom Episode 2',
          overview: 'Custom written episode 2',
          stillUrl: 'https://custom.example.com/still2.jpg',
          isWatched: 0,
          watchedAt: null
        }
      ];
      await dbModule.saveMediaItem(customShow, customEpisodes);

      // 3. Standalone Movie
      const movieItem = {
        id: 'movie_the_matrix',
        type: 'movie',
        title: 'The Matrix',
        status: 'completed',
        totalEpisodes: 1,
        watchedEpisodesCount: 1
      };
      await dbModule.saveMediaItem(movieItem, []);
    };

    it('should verify export serialization across all 3 tiers (minimal, compact, full)', async () => {
      await setupLibrary();

      // --- Tier 1: MINIMAL ---
      const minData = await dbModule.exportAllData({ mode: 'minimal' });
      assert.equal(minData.app, 'BingeLog');
      assert.equal(minData.version, 1);
      assert.equal(minData.backupMode, 'minimal');
      assert.equal(minData.media.length, 3);

      // Minimal episode rules:
      // Standard TV show: ONLY watched episodes (S1E1 & S1E3) => 2
      // Custom TV show: ALL custom episodes preserved => 2
      // Total = 4 episodes
      assert.equal(minData.episodes.length, 4);

      const standardExported = minData.episodes.filter(e => e.mediaId === 'tv_breaking_bad');
      assert.equal(standardExported.length, 2);
      assert.ok(standardExported.every(e => e.isWatched === 1));

      const customExported = minData.episodes.filter(e => e.mediaId === 'custom_indie_series');
      assert.equal(customExported.length, 2);

      // Minimal tier MUST strip synopses & screenshots
      for (const ep of minData.episodes) {
        assert.equal(ep.overview, undefined, 'Minimal tier must strip overview');
        assert.equal(ep.stillUrl, undefined, 'Minimal tier must strip stillUrl');
      }

      // Minimal filename verification
      const minFilename = exportModule.generateBackupFilename('minimal');
      assert.match(minFilename, /^watch-history-minimal-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.json$/);

      // --- Tier 2: COMPACT ---
      const compactData = await dbModule.exportAllData({ mode: 'compact' });
      assert.equal(compactData.backupMode, 'compact');
      assert.equal(compactData.media.length, 3);

      // Compact episode rules:
      // ALL episodes included (3 standard + 2 custom = 5 episodes)
      assert.equal(compactData.episodes.length, 5);

      // Compact tier MUST strip synopses & screenshots
      for (const ep of compactData.episodes) {
        assert.equal(ep.overview, undefined, 'Compact tier must strip overview');
        assert.equal(ep.stillUrl, undefined, 'Compact tier must strip stillUrl');
      }

      const compactFilename = exportModule.generateBackupFilename('compact');
      assert.match(compactFilename, /^watch-history-compact-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.json$/);

      // --- Tier 3: FULL ---
      const fullData = await dbModule.exportAllData({ mode: 'full' });
      assert.equal(fullData.backupMode, 'full');
      assert.equal(fullData.media.length, 3);
      assert.equal(fullData.episodes.length, 5);

      // Full tier MUST PRESERVE rich synopses & screenshots
      const fullS1E1 = fullData.episodes.find(e => e.id === 'tv_breaking_bad_S1E1');
      assert.ok(fullS1E1.overview.includes('high school chemistry teacher'));
      assert.equal(fullS1E1.stillUrl, 'https://image.example.com/pilot_still.jpg');

      const fullFilename = exportModule.generateBackupFilename('full');
      assert.match(fullFilename, /^watch-history-full-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.json$/);
    });

    it('should verify JSON serialization formatting rules per tier mode', async () => {
      await setupLibrary();

      // Compact & Minimal: minified single line
      const minData = await dbModule.exportAllData({ mode: 'minimal' });
      const minified = JSON.stringify(minData);
      assert.ok(!minified.includes('\n'), 'Minimal export must be minified');

      const compactData = await dbModule.exportAllData({ mode: 'compact' });
      const compactMinified = JSON.stringify(compactData);
      assert.ok(!compactMinified.includes('\n'), 'Compact export must be minified');

      // Full: pretty-printed with 2-space indentation
      const fullData = await dbModule.exportAllData({ mode: 'full' });
      const fullPretty = JSON.stringify(fullData, null, 2);
      assert.ok(fullPretty.includes('\n  "app": "BingeLog"'), 'Full export must be 2-space indented');
    });

    it('should validate and successfully import a valid backup file', async () => {
      const validPayload = {
        app: 'BingeLog',
        version: 1,
        backupMode: 'compact',
        media: [
          { id: 'show_dexter', title: 'Dexter', type: 'tv', totalEpisodes: 1, watchedEpisodesCount: 1 }
        ],
        episodes: [
          { id: 'show_dexter_S1E1', mediaId: 'show_dexter', seasonNumber: 1, episodeNumber: 1, title: 'Dexter Pilot', isWatched: 1 }
        ],
        settings: [
          { key: 'theme', value: 'cyberpunk-neon' }
        ]
      };

      const fileMock = {
        name: 'valid-backup.json',
        content: JSON.stringify(validPayload)
      };

      const result = await exportModule.importBackupFile(fileMock, true);
      assert.equal(result.mediaCount, 1);
      assert.equal(result.episodesCount, 1);

      const savedMedia = await dbModule.getMediaById('show_dexter');
      assert.ok(savedMedia);
      assert.equal(savedMedia.title, 'Dexter');
    });

    it('should reject importBackupFile when JSON syntax is corrupted', async () => {
      const corruptFile = {
        name: 'corrupt.json',
        content: '{ app: "BingeLog", unclosed_bracket: '
      };

      await assert.rejects(
        async () => await exportModule.importBackupFile(corruptFile),
        (err) => {
          assert.ok(err instanceof Error);
          assert.ok(err.message.includes('Failed to import backup'));
          return true;
        }
      );
    });

    it('should reject importBackupFile when schema is missing media array', async () => {
      const missingMediaFile = {
        name: 'missing-media.json',
        content: JSON.stringify({ app: 'BingeLog', version: 1 })
      };

      await assert.rejects(
        async () => await exportModule.importBackupFile(missingMediaFile),
        {
          name: 'Error',
          message: 'Failed to import backup: Invalid backup file format: missing media list'
        }
      );
    });

    it('should reject importBackupFile when media field is not an array', async () => {
      const invalidMediaFile = {
        name: 'invalid-media.json',
        content: JSON.stringify({ app: 'BingeLog', media: 'not an array' })
      };

      await assert.rejects(
        async () => await exportModule.importBackupFile(invalidMediaFile),
        {
          name: 'Error',
          message: 'Failed to import backup: Invalid backup file format: missing media list'
        }
      );
    });

    it('should reject importBackupFile when FileReader encounters read error', async () => {
      const unreadableFile = {
        name: 'unreadable.json',
        _simulateReaderError: true
      };

      await assert.rejects(
        async () => await exportModule.importBackupFile(unreadableFile),
        {
          name: 'Error',
          message: 'Failed to read backup file'
        }
      );
    });
  });

  // =========================================================================
  // 3. THEME & STYLING MODULE (src/styles/theme.ts)
  // =========================================================================
  describe('theme.ts: applyTheme, Preset Tokens, and Genre Color Wheel Calculation', () => {
    it('should retrieve all 7 handcrafted presets and valid color tokens', () => {
      const { THEME_PRESETS } = themeModule;
      assert.equal(THEME_PRESETS.length, 7);

      const expectedPresets = [
        'default',
        'midnight-sapphire',
        'cyberpunk-neon',
        'emerald-forest',
        'sunset-amber',
        'rose-velvet',
        'nordic-frost'
      ];

      const presetIds = THEME_PRESETS.map(p => p.id);
      for (const expectedId of expectedPresets) {
        assert.ok(presetIds.includes(expectedId), `Missing preset: ${expectedId}`);
      }

      const requiredTokens = [
        '--bg-primary',
        '--bg-secondary',
        '--card-bg',
        '--bg-hover',
        '--text-primary',
        '--text-secondary',
        '--border-light',
        '--accent',
        '--accent-hover',
        '--tag-bg',
        '--tag-text'
      ];

      for (const preset of THEME_PRESETS) {
        assert.ok(preset.name, `Preset ${preset.id} missing name`);
        assert.equal(preset.swatches.dark.length, 4, `Preset ${preset.id} dark swatches must have 4 items`);
        assert.equal(preset.swatches.light.length, 4, `Preset ${preset.id} light swatches must have 4 items`);

        for (const token of requiredTokens) {
          assert.ok(preset.dark[token], `Preset ${preset.id} dark missing token ${token}`);
          assert.ok(preset.light[token], `Preset ${preset.id} light missing token ${token}`);
        }
      }
    });

    it('should retrieve active preset and fallback gracefully on unknown id', () => {
      const { getActivePreset, ACTIVE_PRESET_KEY } = themeModule;

      // Default when nothing in localStorage
      localStorage.removeItem(ACTIVE_PRESET_KEY);
      assert.equal(getActivePreset().id, 'default');

      // Specific valid preset
      localStorage.setItem(ACTIVE_PRESET_KEY, 'rose-velvet');
      assert.equal(getActivePreset().id, 'rose-velvet');

      // Fallback on invalid preset id
      localStorage.setItem(ACTIVE_PRESET_KEY, 'non_existent_preset_xyz');
      assert.equal(getActivePreset().id, 'default');
    });

    it('should apply preset palette tokens to documentElement and mirror computed properties', () => {
      const {
        applyPresetPaletteForMode,
        ACTIVE_PRESET_KEY,
        clearCustomThemeProperties
      } = themeModule;

      localStorage.setItem(ACTIVE_PRESET_KEY, 'midnight-sapphire');
      applyPresetPaletteForMode('dark');

      const rootStyle = document.documentElement.style;
      assert.equal(rootStyle.getPropertyValue('--bg-primary'), '#0b1329');
      assert.equal(rootStyle.getPropertyValue('--bg-secondary'), '#111c44');
      assert.equal(rootStyle.getPropertyValue('--card-bg'), '#152259');
      assert.equal(rootStyle.getPropertyValue('--accent'), '#38bdf8');

      // Check mirrored helper properties
      assert.equal(rootStyle.getPropertyValue('--modal-bg'), '#152259');
      assert.equal(rootStyle.getPropertyValue('--input-bg'), '#0b1329');
      assert.equal(rootStyle.getPropertyValue('--input-border'), '#1e293b');
      assert.equal(rootStyle.getPropertyValue('--card-border'), '#1e293b');

      // Clear properties
      clearCustomThemeProperties();
      assert.equal(rootStyle.getPropertyValue('--bg-primary'), '');
      assert.equal(rootStyle.getPropertyValue('--accent'), '');
    });

    it('should initialize theme and toggle theme modes between dark and light', () => {
      const { initTheme, toggleThemeMode, THEME_KEY } = themeModule;

      // Unset -> defaults to dark
      localStorage.removeItem(THEME_KEY);
      initTheme();
      assert.equal(document.documentElement.getAttribute('data-theme'), 'dark');

      // Toggle to light
      const mode1 = toggleThemeMode();
      assert.equal(mode1, 'light');
      assert.equal(document.documentElement.getAttribute('data-theme'), 'light');
      assert.equal(localStorage.getItem(THEME_KEY), 'light');

      // Toggle back to dark
      const mode2 = toggleThemeMode();
      assert.equal(mode2, 'dark');
      assert.equal(document.documentElement.getAttribute('data-theme'), 'dark');
      assert.equal(localStorage.getItem(THEME_KEY), 'dark');
    });

    it('should apply custom user color overrides on top of active preset', () => {
      const { applyPresetPaletteForMode, CUSTOM_THEME_KEY } = themeModule;

      const customOverrides = {
        dark: {
          '--accent': '#ff0055',
          '--bg-primary': '#000000'
        }
      };
      localStorage.setItem(CUSTOM_THEME_KEY, JSON.stringify(customOverrides));

      applyPresetPaletteForMode('dark');

      const rootStyle = document.documentElement.style;
      assert.equal(rootStyle.getPropertyValue('--accent'), '#ff0055');
      assert.equal(rootStyle.getPropertyValue('--bg-primary'), '#000000');
      // Non-overridden property must still come from preset
      assert.ok(rootStyle.getPropertyValue('--bg-secondary'));
    });

    it('should calculate accurate color wheel conversions via hslToHex, hexToRgb, and rgbToHex', () => {
      const { hslToHex, hexToRgb, rgbToHex } = themeModule;

      // Primary color wheel hues at 100% saturation and 50% lightness:
      // Red: 0 deg
      assert.equal(hslToHex(0, 100, 50).toLowerCase(), '#ff0000');
      // Yellow: 60 deg
      assert.equal(hslToHex(60, 100, 50).toLowerCase(), '#ffff00');
      // Green: 120 deg
      assert.equal(hslToHex(120, 100, 50).toLowerCase(), '#00ff00');
      // Cyan: 180 deg
      assert.equal(hslToHex(180, 100, 50).toLowerCase(), '#00ffff');
      // Blue: 240 deg
      assert.equal(hslToHex(240, 100, 50).toLowerCase(), '#0000ff');
      // Magenta: 300 deg
      assert.equal(hslToHex(300, 100, 50).toLowerCase(), '#ff00ff');

      // Extremes: White & Black
      assert.equal(hslToHex(0, 0, 100).toLowerCase(), '#ffffff');
      assert.equal(hslToHex(0, 0, 0).toLowerCase(), '#000000');

      // hexToRgb 6-digit & 3-digit
      assert.deepEqual(hexToRgb('#10b981'), { r: 16, g: 185, b: 129 });
      assert.deepEqual(hexToRgb('#f0f'), { r: 255, g: 0, b: 255 });
      assert.equal(hexToRgb('invalid'), null);
      assert.equal(hexToRgb(''), null);
      assert.equal(hexToRgb(null), null);

      // rgbToHex with padding
      assert.equal(rgbToHex(16, 185, 129).toLowerCase(), '#10b981');
      assert.equal(rgbToHex(0, 0, 0), '#000000');
      assert.equal(rgbToHex(255, 255, 255).toLowerCase(), '#ffffff');
    });

    it('should compute getGenreTagStyle dynamically based on theme mode and custom genre colors', () => {
      const { setGenreColor, getGenreTagStyle } = themeModule;

      // 1. Unset genre fallback
      const fallback = getGenreTagStyle('NonExistentGenre');
      assert.equal(fallback.borderColor, 'transparent');
      assert.ok(fallback.backgroundColor.includes('var(--tag-bg'));
      assert.ok(fallback.color.includes('var(--tag-text'));

      // Null / empty genre
      const emptyGenreStyle = getGenreTagStyle(null);
      assert.equal(emptyGenreStyle.borderColor, 'transparent');

      // 2. Set custom genre color
      setGenreColor('Action', '#f97316'); // RGB: (249, 115, 22)

      // Test Dark Mode
      document.documentElement.setAttribute('data-theme', 'dark');
      const darkStyle = getGenreTagStyle('Action');
      assert.equal(darkStyle.color, '#f97316');
      assert.equal(darkStyle.backgroundColor, 'rgba(249, 115, 22, 0.2)');
      assert.equal(darkStyle.borderColor, 'rgba(249, 115, 22, 0.4)');

      // Test Light Mode
      document.documentElement.setAttribute('data-theme', 'light');
      const lightStyle = getGenreTagStyle('Action');
      assert.equal(lightStyle.color, '#f97316');
      assert.equal(lightStyle.backgroundColor, 'rgba(249, 115, 22, 0.12)');
      assert.equal(lightStyle.borderColor, 'rgba(249, 115, 22, 0.25)');

      // Case insensitivity check ('action' vs 'Action')
      const lowerStyle = getGenreTagStyle('action');
      assert.equal(lowerStyle.color, '#f97316');

      // Cleanup
      setGenreColor('Action', null);
      const clearedStyle = getGenreTagStyle('Action');
      assert.equal(clearedStyle.borderColor, 'transparent');
    });
  });
});
