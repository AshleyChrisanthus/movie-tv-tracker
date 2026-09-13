import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { getApiModule, getDbModule, resetDatabase, mockFetch, restoreFetch } from '../helpers/setup.js';
import { mockTvShowItem, mockTvEpisodes } from '../helpers/fixtures.js';

describe('Tier 1: Episode Syncing & Progress Preservation Engine', () => {
  let apiModule;
  let dbModule;

  beforeEach(async () => {
    await resetDatabase();
    apiModule = await getApiModule();
    dbModule = await getDbModule();
  });

  afterEach(() => {
    restoreFetch();
  });

  it('should sync and append newly dropped episodes while preserving watched status of previous episodes', async () => {
    // 1. Initial state: Show has Season 1 (3 episodes), user has watched S1E1 and S1E2
    const initialEpisodes = mockTvEpisodes.slice(0, 3).map((ep, idx) => ({
      ...ep,
      isWatched: idx < 2 ? 1 : 0,
      watchedAt: idx < 2 ? '2026-09-01T10:00:00.000Z' : null
    }));

    await dbModule.saveMediaItem({
      ...mockTvShowItem,
      totalEpisodes: 3,
      totalSeasons: 1,
      watchedEpisodesCount: 2,
      status: 'watching'
    }, initialEpisodes);

    // 2. Provider drops Season 2 (2 new episodes) and updates S1E3 official title
    mockFetch((url) => {
      if (url.endsWith('/shows/44458')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            id: 44458,
            name: 'Ted Lasso',
            premiered: '2020-08-14'
          })
        });
      }
      if (url.endsWith('/shows/44458/episodes')) {
        return Promise.resolve({
          ok: true,
          json: async () => [
            { id: 1, season: 1, number: 1, name: 'Pilot', summary: 'Pilot summary', airdate: '2020-08-14' },
            { id: 2, season: 1, number: 2, name: 'Biscuits', summary: 'Biscuits summary', airdate: '2020-08-14' },
            { id: 3, season: 1, number: 3, name: 'Trent Crimm: The Official Title', summary: 'Reporter story', airdate: '2020-08-14' },
            { id: 4, season: 2, number: 1, name: 'Goodbye Earl', summary: 'Season 2 premiere', airdate: '2021-07-23' },
            { id: 5, season: 2, number: 2, name: 'Lavender', summary: 'New arrival', airdate: '2021-07-30' }
          ]
        });
      }
      return Promise.reject(new Error('Unexpected URL: ' + url));
    });

    const mediaBefore = await dbModule.getMediaById(mockTvShowItem.id);
    const syncResult = await apiModule.syncMediaEpisodes(mediaBefore);

    assert.equal(syncResult.hasUpdates, true);
    assert.equal(syncResult.newEpisodesCount, 2);
    assert.equal(syncResult.updatedTitlesCount, 1);
    assert.equal(syncResult.totalEpisodes, 5);

    // 3. Verify database state
    const mediaAfter = await dbModule.getMediaById(mockTvShowItem.id);
    assert.equal(mediaAfter.totalEpisodes, 5);
    assert.equal(mediaAfter.totalSeasons, 2);
    assert.equal(mediaAfter.watchedEpisodesCount, 2); // Still 2 watched!
    assert.ok(mediaAfter.lastSyncedAt);

    const allEpisodes = await dbModule.getEpisodesForMedia(mockTvShowItem.id);
    assert.equal(allEpisodes.length, 5);

    // S1E1 & S1E2 strictly remain watched with exact timestamps
    const s1e1 = allEpisodes.find(e => e.seasonNumber === 1 && e.episodeNumber === 1);
    assert.equal(s1e1.isWatched, 1);
    assert.equal(s1e1.watchedAt, '2026-09-01T10:00:00.000Z');

    const s1e2 = allEpisodes.find(e => e.seasonNumber === 1 && e.episodeNumber === 2);
    assert.equal(s1e2.isWatched, 1);

    // S1E3 title updated
    const s1e3 = allEpisodes.find(e => e.seasonNumber === 1 && e.episodeNumber === 3);
    assert.equal(s1e3.isWatched, 0);
    assert.equal(s1e3.title, 'Trent Crimm: The Official Title');

    // S2E1 and S2E2 added as unwatched
    const s2e1 = allEpisodes.find(e => e.seasonNumber === 2 && e.episodeNumber === 1);
    assert.ok(s2e1);
    assert.equal(s2e1.isWatched, 0);
    assert.equal(s2e1.title, 'Goodbye Earl');
  });

  it('should filter eligible shows for sync based on status and cooldown period', () => {
    const now = Date.now();
    const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString();
    const tenDaysAgo = new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString();

    const library = [
      { id: '1', type: 'tv', externalId: 101, status: 'watching', lastSyncedAt: oneDayAgo },
      { id: '2', type: 'tv', externalId: 102, status: 'dropped', lastSyncedAt: tenDaysAgo },
      { id: '3', type: 'tv', externalId: 103, status: 'plan_to_watch', lastSyncedAt: tenDaysAgo },
      { id: '4', type: 'tv', externalId: 104, status: 'plan_to_watch', lastSyncedAt: oneDayAgo },
      { id: '5', type: 'movie', externalId: 105, status: 'watching' },
      { id: '6', type: 'tv', externalId: null, status: 'watching' } // Custom show without externalId
    ];

    // Standard sync with default 5-day cooldown
    const eligible = apiModule.getShowsEligibleForSync(library, { cooldownDays: 5 });
    const eligibleIds = eligible.map(s => s.id);

    // Show 1 is watching -> always eligible
    assert.ok(eligibleIds.includes('1'));
    // Show 2 is dropped -> never eligible in automatic sync
    assert.ok(!eligibleIds.includes('2'));
    // Show 3 is past 5-day cooldown (10 days ago) -> eligible
    assert.ok(eligibleIds.includes('3'));
    // Show 4 was synced 1 day ago (< 5 days) -> not eligible
    assert.ok(!eligibleIds.includes('4'));
    // Show 5 is movie -> not eligible
    assert.ok(!eligibleIds.includes('5'));
    // Show 6 has no externalId -> not eligible
    assert.ok(!eligibleIds.includes('6'));

    // Force all flag
    const forceAll = apiModule.getShowsEligibleForSync(library, { forceAll: true });
    assert.equal(forceAll.length, 4); // All 4 valid TV shows with externalIds
  });
});
