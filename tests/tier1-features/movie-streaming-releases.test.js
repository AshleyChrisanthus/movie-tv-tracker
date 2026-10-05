import { describe, it, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { getRegionModule, getDbModule, resetDatabase } from '../helpers/setup.js';

describe('Tier 1: Issue #46 Movie Theatrical-to-Streaming Release Dates & Watch Providers', () => {
  let regionModule;
  let dbModule;
  const mockNow = new Date('2026-10-05T00:00:00.000Z');

  before(async () => {
    regionModule = await getRegionModule();
    dbModule = await getDbModule();
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  describe('TMDB Release Dates Parsing', () => {
    it('correctly extracts theatrical (Type 3) and digital (Type 4) release dates for target region', () => {
      const mockReleaseDatesPayload = [
        {
          iso_3166_1: 'US',
          release_dates: [
            { type: 3, release_date: '2026-07-24T00:00:00.000Z', note: 'Theaters' },
            { type: 4, release_date: '2026-10-20T00:00:00.000Z', note: 'Amazon, Apple TV' }
          ]
        },
        {
          iso_3166_1: 'GB',
          release_dates: [
            { type: 3, release_date: '2026-07-25T00:00:00.000Z' },
            { type: 4, release_date: '2026-10-28T00:00:00.000Z' }
          ]
        }
      ];

      const usDates = regionModule.parseTMDBReleaseDates(mockReleaseDatesPayload, 'US');
      assert.equal(usDates.theatricalReleaseDate, '2026-07-24');
      assert.equal(usDates.digitalReleaseDate, '2026-10-20');

      const gbDates = regionModule.parseTMDBReleaseDates(mockReleaseDatesPayload, 'GB');
      assert.equal(gbDates.theatricalReleaseDate, '2026-07-25');
      assert.equal(gbDates.digitalReleaseDate, '2026-10-28');
    });

    it('falls back to US releases when the target region is not present in payload', () => {
      const mockPayload = [
        {
          iso_3166_1: 'US',
          release_dates: [
            { type: 3, release_date: '2026-05-01T00:00:00.000Z' },
            { type: 4, release_date: '2026-08-15T00:00:00.000Z' }
          ]
        }
      ];

      const auDates = regionModule.parseTMDBReleaseDates(mockPayload, 'AU');
      assert.equal(auDates.theatricalReleaseDate, '2026-05-01');
      assert.equal(auDates.digitalReleaseDate, '2026-08-15');
    });

    it('handles missing or empty release_dates gracefully without errors', () => {
      assert.deepEqual(regionModule.parseTMDBReleaseDates(null, 'US'), {
        theatricalReleaseDate: null,
        digitalReleaseDate: null
      });
      assert.deepEqual(regionModule.parseTMDBReleaseDates([], 'US'), {
        theatricalReleaseDate: null,
        digitalReleaseDate: null
      });
    });
  });

  describe('TMDB Watch Providers Parsing', () => {
    it('extracts subscription streaming providers (flatrate) with formatted logos', () => {
      const mockWatchProviders = {
        US: {
          link: 'https://www.themoviedb.org/movie/123/watch',
          flatrate: [
            { provider_id: 8, provider_name: 'Netflix', logo_path: '/pbpMk2JmcoNnQwx5JGpXngfoWtp.jpg' },
            { provider_id: 1899, provider_name: 'Max', logo_path: '/6uh702Tsb51CR97dJu25z4v0h35.jpg' }
          ]
        }
      };

      const providers = regionModule.parseTMDBWatchProviders(mockWatchProviders, 'US');
      assert.equal(providers.length, 2);
      assert.equal(providers[0].name, 'Netflix');
      assert.equal(providers[0].logoUrl, 'https://image.tmdb.org/t/p/w92/pbpMk2JmcoNnQwx5JGpXngfoWtp.jpg');
      assert.equal(providers[1].name, 'Max');
    });

    it('falls back to US providers if target region has no flatrate offerings', () => {
      const mockWatchProviders = {
        US: {
          flatrate: [{ provider_id: 337, provider_name: 'Disney Plus', logo_path: '/disney.jpg' }]
        }
      };

      const providers = regionModule.parseTMDBWatchProviders(mockWatchProviders, 'NZ');
      assert.equal(providers.length, 1);
      assert.equal(providers[0].name, 'Disney Plus');
    });

    it('returns empty array when no providers are available', () => {
      assert.deepEqual(regionModule.parseTMDBWatchProviders(null, 'US'), []);
      assert.deepEqual(regionModule.parseTMDBWatchProviders({}, 'US'), []);
    });
  });

  describe('getMovieStreamingStatus Helper', () => {
    it('returns state "streaming" when active streaming providers exist', () => {
      const item = {
        title: 'Dune: Part Two',
        type: 'movie',
        streamingProviders: [
          { id: 1899, name: 'Max', type: 'flatrate' },
          { id: 8, name: 'Netflix', type: 'flatrate' }
        ]
      };

      const status = regionModule.getMovieStreamingStatus(item, mockNow);
      assert.equal(status.state, 'streaming');
      assert.ok(status.badgeLabel.includes('Streaming on Max +1'));
      assert.equal(status.primaryProvider?.name, 'Max');
    });

    it('returns state "digital_upcoming" with countdown when digital date is in future', () => {
      const item = {
        title: 'Deadpool & Wolverine',
        type: 'movie',
        theatricalReleaseDate: '2026-07-24',
        digitalReleaseDate: '2026-10-20' // 15 days after mockNow (2026-10-05)
      };

      const status = regionModule.getMovieStreamingStatus(item, mockNow);
      assert.equal(status.state, 'digital_upcoming');
      assert.equal(status.countdownDays, 15);
      assert.equal(status.badgeLabel, 'Digital drops in 15d');
    });

    it('returns state "in_theaters" when theatrical release was recent and no digital date', () => {
      const item = {
        title: 'Recent Theatrical Hit',
        type: 'movie',
        theatricalReleaseDate: '2026-09-15' // ~20 days before mockNow
      };

      const status = regionModule.getMovieStreamingStatus(item, mockNow);
      assert.equal(status.state, 'in_theaters');
      assert.equal(status.badgeLabel, 'In Theaters');
    });

    it('returns state "theaters_upcoming" when theatrical release date is in future', () => {
      const item = {
        title: 'Future Blockbuster',
        type: 'movie',
        theatricalReleaseDate: '2026-11-20' // ~46 days after mockNow
      };

      const status = regionModule.getMovieStreamingStatus(item, mockNow);
      assert.equal(status.state, 'theaters_upcoming');
      assert.ok(status.countdownDays > 0);
      assert.ok(status.badgeLabel.includes('in theaters'));
    });
  });

  describe('Regional Settings & Persistence', () => {
    it('reads and respects user streaming_region setting from IndexedDB', async () => {
      await dbModule.setSetting('streaming_region', 'GB');
      const effective = await regionModule.getEffectiveStreamingRegion();
      assert.equal(effective, 'GB');
    });

    it('persists and retrieves theatricalReleaseDate, digitalReleaseDate, and streamingProviders in Dexie', async () => {
      const savedMovie = await dbModule.saveMediaItem({
        title: 'Inside Out 2',
        type: 'movie',
        status: 'plan_to_watch',
        year: 2026,
        theatricalReleaseDate: '2026-06-14',
        digitalReleaseDate: '2026-08-20',
        streamingProviders: [
          { id: 337, name: 'Disney Plus', logoUrl: 'https://example.com/disney.jpg', type: 'flatrate' }
        ]
      });

      assert.ok(savedMovie.id);
      const retrieved = await dbModule.getMediaById(savedMovie.id);
      assert.equal(retrieved.theatricalReleaseDate, '2026-06-14');
      assert.equal(retrieved.digitalReleaseDate, '2026-08-20');
      assert.equal(retrieved.streamingProviders?.length, 1);
      assert.equal(retrieved.streamingProviders[0].name, 'Disney Plus');
    });

    it('persists and retrieves streamingProviders on TV shows in Dexie', async () => {
      const savedShow = await dbModule.saveMediaItem({
        title: 'Stranger Things',
        type: 'tv',
        status: 'watching',
        year: 2016,
        streamingProviders: [
          { id: 8, name: 'Netflix', logoUrl: 'https://example.com/netflix.jpg', type: 'flatrate' }
        ]
      });

      assert.ok(savedShow.id);
      const retrieved = await dbModule.getMediaById(savedShow.id);
      assert.equal(retrieved.type, 'tv');
      assert.equal(retrieved.streamingProviders?.length, 1);
      assert.equal(retrieved.streamingProviders[0].name, 'Netflix');
    });
  });

  describe('Streaming Sync Queue & Eligibility', () => {
    it('correctly filters eligible movies and TV shows for streaming sync', async () => {
      const { getMediaEligibleForStreamingSync } = await import('../../src/services/api.ts');
      const items = [
        { id: '1', title: 'Movie 1', type: 'movie', externalId: 100 },
        { id: '2', title: 'TV Show 1', type: 'tv', externalId: 200 },
        { id: '3', title: 'Book 1', type: 'book', externalId: 'OL123M' },
        { id: '4', title: '', type: 'movie' }
      ];

      const eligible = getMediaEligibleForStreamingSync(items);
      assert.equal(eligible.length, 2);
      assert.equal(eligible[0].id, '1');
      assert.equal(eligible[1].id, '2');
    });

    it('runs streaming sync queue and reports progress', async () => {
      const { runStreamingSyncQueue } = await import('../../src/services/api.ts');
      const progressUpdates = [];

      const items = [
        { id: 'm1', title: 'Inception', type: 'movie' },
        { id: 't1', title: 'Breaking Bad', type: 'tv' }
      ];

      const result = await runStreamingSyncQueue(items, {
        concurrency: 1,
        delayMs: 10,
        region: 'US',
        onProgress: (completed, total, currentItem) => {
          progressUpdates.push({ completed, total, title: currentItem.title });
        }
      });

      assert.equal(result.total, 2);
      assert.equal(result.completed, 2);
      assert.equal(result.isCancelled, false);
      assert.equal(progressUpdates.length, 2);
      assert.equal(progressUpdates[0].completed, 1);
      assert.equal(progressUpdates[1].completed, 2);
    });
  });
});
