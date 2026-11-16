import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  getDbModule,
  resetDatabase,
  getDurationModule,
  getRegionModule,
  mockFetch,
  restoreFetch
} from '../helpers/setup.js';

describe('Tier 1: Media Runtimes, Episode Durations, Remaining TV Watch Time & Content Certifications (Issue #60)', () => {
  let db;
  let saveMediaItem;
  let toggleEpisodeWatched;
  let markEpisodesUpToWatched;
  let setSeasonWatched;
  let backfillMissingMediaMetadata;

  beforeEach(async () => {
    await resetDatabase();
    const dbModule = await getDbModule();
    db = dbModule.db;
    saveMediaItem = dbModule.saveMediaItem;
    toggleEpisodeWatched = dbModule.toggleEpisodeWatched;
    markEpisodesUpToWatched = dbModule.markEpisodesUpToWatched;
    setSeasonWatched = dbModule.setSeasonWatched;
    backfillMissingMediaMetadata = dbModule.backfillMissingMediaMetadata;
  });

  describe('Duration Utility (formatRuntime, calculateSeasonRuntime, calculateSeriesRuntimes)', () => {
    it('should format runtimes correctly in hours_minutes format across all time thresholds', async () => {
      const { formatRuntime } = await getDurationModule();

      assert.equal(formatRuntime(null), '');
      assert.equal(formatRuntime(undefined), '');
      assert.equal(formatRuntime(-5), '');
      assert.equal(formatRuntime(0), '0m');
      assert.equal(formatRuntime(45), '45m');
      assert.equal(formatRuntime(60), '1h');
      assert.equal(formatRuntime(135), '2h 15m');
      assert.equal(formatRuntime(1500), '25h');
      assert.equal(formatRuntime(1530), '25h 30m');
      assert.equal(formatRuntime(10500), '175h');
    });

    it('should format runtimes in days_weeks mode for durations >= 24 hours (1440 mins)', async () => {
      const { formatRuntime } = await getDurationModule();

      // Under 24h should format like hours_minutes
      assert.equal(formatRuntime(45, 'days_weeks'), '45m');
      assert.equal(formatRuntime(135, 'days_weeks'), '2h 15m');

      // >= 24h (1 to 6 days)
      assert.equal(formatRuntime(1440, 'days_weeks'), '1d');
      assert.equal(formatRuntime(1500, 'days_weeks'), '1d 1h');
      assert.equal(formatRuntime(1530, 'days_weeks'), '1d 1h 30m');
      assert.equal(formatRuntime(2910, 'days_weeks'), '2d 30m'); // 48h 30m -> 2d 30m

      // >= 7 days (weeks)
      assert.equal(formatRuntime(10080, 'days_weeks'), '1w'); // exactly 7 days
      assert.equal(formatRuntime(10500, 'days_weeks'), '1w 7h'); // 175 hours = 7d 7h
      assert.equal(formatRuntime(13020, 'days_weeks'), '1w 2d 1h'); // 9 days 1 hour
      assert.equal(formatRuntime(20160, 'days_weeks'), '2w'); // 14 days
    });

    it('should calculate total season runtime by aggregating individual episode runtimes with fallback', async () => {
      const { calculateSeasonRuntime } = await getDurationModule();

      const episodes = [
        { seasonNumber: 1, episodeNumber: 1, runtime: 45 },
        { seasonNumber: 1, episodeNumber: 2, runtime: 55 },
        { seasonNumber: 1, episodeNumber: 3, runtime: 50 },
        { seasonNumber: 2, episodeNumber: 1, runtime: 60 }
      ];

      // Season 1: 45 + 55 + 50 = 150m
      assert.equal(calculateSeasonRuntime(episodes, 1), 150);

      // Season 2: 60m
      assert.equal(calculateSeasonRuntime(episodes, 2), 60);

      // Non-existent season: 0m
      assert.equal(calculateSeasonRuntime(episodes, 3), 0);

      // Season with missing individual episode runtime should use fallback average
      const episodesWithGaps = [
        { seasonNumber: 1, episodeNumber: 1, runtime: 40 },
        { seasonNumber: 1, episodeNumber: 2, runtime: null }, // missing
        { seasonNumber: 1, episodeNumber: 3, runtime: 60 }
      ];
      // known avg = (40 + 60) / 2 = 50 -> 40 + 50 + 60 = 150m
      assert.equal(calculateSeasonRuntime(episodesWithGaps, 1, 50), 150);
    });

    it('should calculate series total and remaining runtimes based on watch state', async () => {
      const { calculateSeriesRuntimes } = await getDurationModule();

      const episodes = [
        { seasonNumber: 1, episodeNumber: 1, runtime: 45, isWatched: 1 },
        { seasonNumber: 1, episodeNumber: 2, runtime: 45, isWatched: 1 },
        { seasonNumber: 1, episodeNumber: 3, runtime: 50, isWatched: 0 },
        { seasonNumber: 1, episodeNumber: 4, runtime: 50, isWatched: 0 }
      ];

      const runtimes = calculateSeriesRuntimes({ type: 'tv', status: 'watching' }, episodes);
      assert.equal(runtimes.totalMinutes, 190); // 45 + 45 + 50 + 50
      assert.equal(runtimes.remainingMinutes, 100); // 50 + 50 unwatched

      // When completed, remaining runtime must be 0
      const completedRuntimes = calculateSeriesRuntimes({ type: 'tv', status: 'completed' }, episodes);
      assert.equal(completedRuntimes.remainingMinutes, 0);
      assert.equal(completedRuntimes.totalMinutes, 190);
    });
  });

  describe('Database Ingestion & Runtime Persistence in Dexie', () => {
    it('should save media item with certification and calculate initial remaining and total runtimes', async () => {
      const showPayload = {
        title: 'Severance',
        type: 'tv',
        status: 'watching',
        runtime: 50,
        certification: 'TV-MA'
      };

      const episodes = [
        { seasonNumber: 1, episodeNumber: 1, title: 'Good News About Hell', runtime: 55, isWatched: 1 },
        { seasonNumber: 1, episodeNumber: 2, title: 'Half Loop', runtime: 50, isWatched: 0 },
        { seasonNumber: 1, episodeNumber: 3, title: 'In Perpetuity', runtime: 52, isWatched: 0 }
      ];

      const saved = await saveMediaItem(showPayload, episodes);
      assert.ok(saved.id);
      assert.equal(saved.certification, 'TV-MA');
      assert.equal(saved.runtime, 50);
      assert.equal(saved.totalRuntimeMinutes, 157); // 55 + 50 + 52
      assert.equal(saved.remainingRuntimeMinutes, 102); // 50 + 52 unwatched

      // Verify stored in DB
      const record = await db.media.get(saved.id);
      assert.equal(record.certification, 'TV-MA');
      assert.equal(record.remainingRuntimeMinutes, 102);
      assert.equal(record.totalRuntimeMinutes, 157);
    });

    it('should update remaining runtime dynamically when episodes are toggled or struck off', async () => {
      const show = await saveMediaItem({
        title: 'Andor',
        type: 'tv',
        status: 'watching',
        runtime: 40,
        certification: 'TV-14'
      }, [
        { seasonNumber: 1, episodeNumber: 1, runtime: 40, isWatched: 0 },
        { seasonNumber: 1, episodeNumber: 2, runtime: 40, isWatched: 0 },
        { seasonNumber: 1, episodeNumber: 3, runtime: 40, isWatched: 0 }
      ]);

      assert.equal(show.remainingRuntimeMinutes, 120);

      // Toggle episode 1 as watched
      await toggleEpisodeWatched(show.id, 1, 1);
      let updated = await db.media.get(show.id);
      assert.equal(updated.remainingRuntimeMinutes, 80);

      // Strike off up to episode 3
      await markEpisodesUpToWatched(show.id, 1, 3);
      updated = await db.media.get(show.id);
      assert.equal(updated.remainingRuntimeMinutes, 0);
      assert.equal(updated.status, 'completed');

      // Unmark entire season
      await setSeasonWatched(show.id, 1, false);
      updated = await db.media.get(show.id);
      assert.equal(updated.remainingRuntimeMinutes, 120);
    });

    it('should automatically backfill remaining and total runtimes for existing library shows', async () => {
      // Insert raw show without runtime metrics
      const showId = 'show_backfill_test';
      await db.media.put({
        id: showId,
        title: 'Succession',
        type: 'tv',
        status: 'watching',
        runtime: 60,
        networkTimezone: 'America/New_York',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      await db.episodes.bulkPut([
        { id: `${showId}_S1E1`, mediaId: showId, seasonNumber: 1, episodeNumber: 1, title: 'Celebration', runtime: 60, isWatched: 1 },
        { id: `${showId}_S1E2`, mediaId: showId, seasonNumber: 1, episodeNumber: 2, title: 'Shit Show at the Fuck Factory', runtime: 60, isWatched: 0 }
      ]);

      const updatedCount = await backfillMissingMediaMetadata();
      assert.ok(updatedCount >= 1);

      const healedShow = await db.media.get(showId);
      assert.equal(healedShow.totalRuntimeMinutes, 120);
      assert.equal(healedShow.remainingRuntimeMinutes, 60);
    });

    it('should persist movie runtime and certification in Dexie', async () => {
      const movie = await saveMediaItem({
        title: 'Dune: Part Two',
        type: 'movie',
        status: 'plan_to_watch',
        runtime: 166,
        certification: 'PG-13'
      });

      const retrieved = await db.media.get(movie.id);
      assert.equal(retrieved.runtime, 166);
      assert.equal(retrieved.certification, 'PG-13');
    });
  });

  describe('External Provider Ingestion (iTunes & TMDB)', () => {
    it('should extract movie certification from TMDB release_dates payload', async () => {
      const { parseTMDBReleaseDates } = await getRegionModule();

      const mockReleaseDates = [
        {
          iso_3166_1: 'US',
          release_dates: [
            { type: 3, release_date: '2024-03-01T00:00:00.000Z', certification: 'PG-13' },
            { type: 4, release_date: '2024-04-16T00:00:00.000Z', certification: '' }
          ]
        }
      ];

      const parsed = parseTMDBReleaseDates(mockReleaseDates, 'US');
      assert.equal(parsed.theatricalReleaseDate, '2024-03-01');
      assert.equal(parsed.digitalReleaseDate, '2024-04-16');
      assert.equal(parsed.certification, 'PG-13');
    });

    it('should extract runtime from iTunes search trackTimeMillis', async () => {
      const { searchMedia } = await import('../../src/services/api.ts');

      mockFetch((url) => {
        if (url.includes('itunes.apple.com/search') && url.includes('entity=movie')) {
          return {
            ok: true,
            json: async () => ({
              resultCount: 1,
              results: [
                {
                  trackId: 1234567,
                  trackName: 'Inception',
                  releaseDate: '2010-07-16T07:00:00Z',
                  trackTimeMillis: 8880000, // 148 minutes
                  contentAdvisoryRating: 'PG-13',
                  longDescription: 'A thief who steals corporate secrets through the use of dream-sharing technology...',
                  primaryGenreName: 'Sci-Fi'
                }
              ]
            })
          };
        }
        return { ok: false, statusText: 'Not found' };
      });

      try {
        const results = await searchMedia('Inception');
        const inception = results.find(r => r.title === 'Inception');
        assert.ok(inception, 'Inception should be returned in search results');
        assert.equal(inception.runtime, 148);
        assert.equal(inception.certification, 'PG-13');
      } finally {
        restoreFetch();
      }
    });

    it('should backfill movie certification and runtime during movie sync', async () => {
      const { syncMovieStreamingDetails } = await import('../../src/services/api.ts');

      const movie = await saveMediaItem({
        title: 'Interstellar',
        type: 'movie',
        status: 'plan_to_watch',
        runtime: null,
        certification: null
      });

      mockFetch((url) => {
        if (url.includes('itunes.apple.com/search')) {
          return {
            ok: true,
            json: async () => ({
              resultCount: 1,
              results: [
                {
                  trackId: 78910,
                  trackName: 'Interstellar',
                  trackTimeMillis: 10140000, // 169 minutes
                  contentAdvisoryRating: 'PG-13'
                }
              ]
            })
          };
        }
        return { ok: false, statusText: 'Not found' };
      });

      try {
        const { hasUpdates, updatedItem } = await syncMovieStreamingDetails(movie);
        assert.ok(hasUpdates);
        assert.equal(updatedItem.runtime, 169);
        assert.equal(updatedItem.certification, 'PG-13');

        // Check persisted in Dexie
        const inDb = await db.media.get(movie.id);
        assert.equal(inDb.runtime, 169);
        assert.equal(inDb.certification, 'PG-13');
      } finally {
        restoreFetch();
      }
    });
  });

  describe('Aired vs Un-Aired Episodes & Year Formatting in Air Dates (Issue #61)', () => {
    it('should calculate airedEpisodesCount and exclude future un-aired episodes from remaining watch time', async () => {
      const { getTimezoneModule } = await import('../helpers/setup.js');
      const { formatEpisodeAirDate } = await getTimezoneModule();

      // Future drop in 2027
      const futureDate = '2027-10-15';
      const futureAirstamp = '2027-10-15T20:00:00Z';
      // Past drop in 2024
      const pastDate = '2024-03-01';
      const pastAirstamp = '2024-03-01T20:00:00Z';

      const show = await saveMediaItem({
        title: 'VisionQuest',
        type: 'tv',
        status: 'watching',
        runtime: 50,
        networkTimezone: 'America/New_York'
      }, [
        { seasonNumber: 1, episodeNumber: 1, airDate: pastDate, airstamp: pastAirstamp, runtime: 50, isWatched: 1 },
        { seasonNumber: 1, episodeNumber: 2, airDate: pastDate, airstamp: pastAirstamp, runtime: 50, isWatched: 1 },
        { seasonNumber: 1, episodeNumber: 3, airDate: pastDate, airstamp: pastAirstamp, runtime: 50, isWatched: 1 },
        { seasonNumber: 1, episodeNumber: 4, airDate: pastDate, airstamp: pastAirstamp, runtime: 50, isWatched: 1 },
        { seasonNumber: 1, episodeNumber: 5, airDate: pastDate, airstamp: pastAirstamp, runtime: 50, isWatched: 1 },
        { seasonNumber: 1, episodeNumber: 6, airDate: pastDate, airstamp: pastAirstamp, runtime: 50, isWatched: 1 },
        { seasonNumber: 1, episodeNumber: 7, airDate: futureDate, airstamp: futureAirstamp, runtime: 50, isWatched: 0 },
        { seasonNumber: 1, episodeNumber: 8, airDate: futureDate, airstamp: futureAirstamp, runtime: 50, isWatched: 0 }
      ]);

      assert.equal(show.totalEpisodes, 8);
      assert.equal(show.airedEpisodesCount, 6);
      assert.equal(show.watchedEpisodesCount, 6);
      assert.equal(show.status, 'caught_up');
      // When caught up with all aired episodes, remaining runtime should be 0 even if future episodes have runtimes
      assert.equal(show.remainingRuntimeMinutes, 0);
      assert.equal(show.totalRuntimeMinutes, 400); // 8 * 50

      // When an episode in the past is marked unwatched, remaining time must reflect only the unwatched aired episode
      await toggleEpisodeWatched(show.id, 1, 6); // unwatch episode 6
      const unwatchedShow = await db.media.get(show.id);
      assert.equal(unwatchedShow.status, 'watching');
      assert.equal(unwatchedShow.watchedEpisodesCount, 5);
      assert.equal(unwatchedShow.airedEpisodesCount, 6);
      assert.equal(unwatchedShow.remainingRuntimeMinutes, 50); // only episode 6 is unwatched among aired
    });

    it('should distinguish actively airing seasons from upcoming season premieres via isSeasonActivelyAiring', async () => {
      const { isSeasonActivelyAiring } = await getDurationModule();

      const futureDate = '2027-10-15';
      const pastDate = '2024-03-01';

      // 1. Actively airing season (e.g. VisionQuest S1: 6 aired, E7/E8 upcoming)
      const activeSeasonShow = await saveMediaItem({
        title: 'VisionQuest',
        type: 'tv',
        status: 'watching',
        runtime: 50,
        networkTimezone: 'America/New_York'
      }, [
        { seasonNumber: 1, episodeNumber: 1, airDate: pastDate, isWatched: 1 },
        { seasonNumber: 1, episodeNumber: 2, airDate: pastDate, isWatched: 1 },
        { seasonNumber: 1, episodeNumber: 3, airDate: pastDate, isWatched: 1 },
        { seasonNumber: 1, episodeNumber: 4, airDate: pastDate, isWatched: 1 },
        { seasonNumber: 1, episodeNumber: 5, airDate: pastDate, isWatched: 1 },
        { seasonNumber: 1, episodeNumber: 6, airDate: pastDate, isWatched: 1 },
        { seasonNumber: 1, episodeNumber: 7, airDate: futureDate, isWatched: 0 },
        { seasonNumber: 1, episodeNumber: 8, airDate: futureDate, isWatched: 0 }
      ]);

      assert.equal(activeSeasonShow.nextEpisodeNumber, 7);
      assert.equal(activeSeasonShow.airedEpisodesCount, 6);
      assert.equal(activeSeasonShow.totalEpisodes, 8);
      // For actively airing season, isSeasonActivelyAiring is true so progress displays against totalEpisodes (6/8 = 75%)
      assert.equal(isSeasonActivelyAiring(activeSeasonShow), true);

      // 2. Completed seasons with future season premiere announced (e.g. 30 aired, S4E1 upcoming)
      const futureEpisodes = [];
      for (let s = 1; s <= 3; s++) {
        for (let e = 1; e <= 10; e++) {
          futureEpisodes.push({
            seasonNumber: s,
            episodeNumber: e,
            airDate: pastDate,
            isWatched: 1
          });
        }
      }
      // Season 4 Episode 1 in the future
      futureEpisodes.push({
        seasonNumber: 4,
        episodeNumber: 1,
        airDate: futureDate,
        isWatched: 0
      });

      const upcomingSeasonShow = await saveMediaItem({
        title: 'Stranger Things',
        type: 'tv',
        status: 'watching',
        runtime: 60,
        networkTimezone: 'America/New_York'
      }, futureEpisodes);

      assert.equal(upcomingSeasonShow.nextEpisodeSeason, 4);
      assert.equal(upcomingSeasonShow.nextEpisodeNumber, 1);
      assert.equal(upcomingSeasonShow.airedEpisodesCount, 30);
      assert.equal(upcomingSeasonShow.totalEpisodes, 31);
      // For upcoming season premiere, isSeasonActivelyAiring is false so progress displays against airedEpisodesCount (30/30 = 100%)
      assert.equal(isSeasonActivelyAiring(upcomingSeasonShow), false);
    });

    it('should include 4-digit year when formatting episode air dates for both airstamp and airDate', async () => {
      const { getTimezoneModule } = await import('../helpers/setup.js');
      const { formatEpisodeAirDate } = await getTimezoneModule();

      // Airstamp with UTC drop
      const formattedAirstamp = formatEpisodeAirDate('2026-11-04', '2026-11-04T20:00:00Z', 'America/New_York');
      assert.ok(formattedAirstamp.includes('2026'), `Expected airstamp format to include 2026: ${formattedAirstamp}`);

      // Date only
      const formattedDateOnly = formatEpisodeAirDate('2027-05-18', null, 'America/New_York');
      assert.ok(formattedDateOnly.includes('2027'), `Expected date-only format to include 2027: ${formattedDateOnly}`);
    });
  });
});
