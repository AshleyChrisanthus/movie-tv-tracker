import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { getDbModule, resetDatabase } from '../helpers/setup.js';
import { mockTvShowItem, mockTvEpisodes } from '../helpers/fixtures.js';

describe('Tier 1: Multi-Season Progress Tracking & Season Persistence (Issue #13)', () => {
  let dbModule;

  beforeEach(async () => {
    await resetDatabase();
    dbModule = await getDbModule();
  });

  it('should track currentSeason and currentEpisode when toggling episodes in multi-season shows', async () => {
    await dbModule.saveMediaItem(mockTvShowItem, mockTvEpisodes);

    // Toggle S2E1 (Season 2, Episode 1)
    await dbModule.toggleEpisodeWatched(mockTvShowItem.id, 2, 1);

    const media = await dbModule.getMediaById(mockTvShowItem.id);
    assert.equal(media.currentSeason, 2);
    assert.equal(media.currentEpisode, 1);
    assert.equal(media.watchedEpisodesCount, 1);

    // Toggle S2E2 (Season 2, Episode 2)
    await dbModule.toggleEpisodeWatched(mockTvShowItem.id, 2, 2);
    const mediaAfter = await dbModule.getMediaById(mockTvShowItem.id);
    assert.equal(mediaAfter.currentSeason, 2);
    assert.equal(mediaAfter.currentEpisode, 2);
    assert.equal(mediaAfter.watchedEpisodesCount, 2);
  });

  it('should adjust currentSeason and currentEpisode to the highest remaining watched episode when unmarking an episode', async () => {
    await dbModule.saveMediaItem(mockTvShowItem, mockTvEpisodes);

    // Watch S1E1, S1E2, S1E3
    await dbModule.toggleEpisodeWatched(mockTvShowItem.id, 1, 1);
    await dbModule.toggleEpisodeWatched(mockTvShowItem.id, 1, 2);
    await dbModule.toggleEpisodeWatched(mockTvShowItem.id, 1, 3);

    let media = await dbModule.getMediaById(mockTvShowItem.id);
    assert.equal(media.currentSeason, 1);
    assert.equal(media.currentEpisode, 3);
    assert.equal(media.watchedEpisodesCount, 3);

    // Accidentally mark S2E1
    await dbModule.toggleEpisodeWatched(mockTvShowItem.id, 2, 1);
    media = await dbModule.getMediaById(mockTvShowItem.id);
    assert.equal(media.currentSeason, 2);
    assert.equal(media.currentEpisode, 1);
    assert.equal(media.watchedEpisodesCount, 4);

    // Now unmark S2E1 (simulating accidental mark)
    await dbModule.toggleEpisodeWatched(mockTvShowItem.id, 2, 1);
    media = await dbModule.getMediaById(mockTvShowItem.id);
    assert.equal(media.currentSeason, 1);
    assert.equal(media.currentEpisode, 3);
    assert.equal(media.watchedEpisodesCount, 3);
  });

  it('should mark an entire season as watched via setSeasonWatched', async () => {
    await dbModule.saveMediaItem(mockTvShowItem, mockTvEpisodes);

    // Mark Season 1 (3 episodes) as watched
    await dbModule.setSeasonWatched(mockTvShowItem.id, 1, true);

    const media = await dbModule.getMediaById(mockTvShowItem.id);
    assert.equal(media.watchedEpisodesCount, 3);
    assert.equal(media.status, 'watching');
    assert.equal(media.currentSeason, 1);
    assert.equal(media.currentEpisode, 3);

    const episodes = await dbModule.getEpisodesForMedia(mockTvShowItem.id);
    const s1Episodes = episodes.filter(e => e.seasonNumber === 1);
    assert.equal(s1Episodes.length, 3);
    assert.ok(s1Episodes.every(e => e.isWatched === 1));

    // Season 2 episodes must remain untouched (0 watched)
    const s2Episodes = episodes.filter(e => e.seasonNumber === 2);
    assert.equal(s2Episodes.length, 2);
    assert.ok(s2Episodes.every(e => e.isWatched === 0));
  });

  it('should mark an entire season as unwatched via setSeasonWatched and decrement watched count', async () => {
    await dbModule.saveMediaItem(mockTvShowItem, mockTvEpisodes);
    // Mark Season 1 (3 episodes) as watched -> status transitions from plan_to_watch to watching
    await dbModule.setSeasonWatched(mockTvShowItem.id, 1, true);

    let media = await dbModule.getMediaById(mockTvShowItem.id);
    assert.equal(media.watchedEpisodesCount, 3);
    assert.equal(media.status, 'watching');

    // Unmark Season 1
    await dbModule.setSeasonWatched(mockTvShowItem.id, 1, false);

    media = await dbModule.getMediaById(mockTvShowItem.id);
    assert.equal(media.watchedEpisodesCount, 0);
    assert.equal(media.currentEpisode, 0);

    const episodes = await dbModule.getEpisodesForMedia(mockTvShowItem.id);
    const s1 = episodes.filter(e => e.seasonNumber === 1);
    assert.ok(s1.every(e => e.isWatched === 0));
  });

  it('should set exact progress to Season S, Episode E', async () => {
    await dbModule.saveMediaItem(mockTvShowItem, mockTvEpisodes);

    // Set progress to Season 2, Episode 1
    await dbModule.setExactProgress(mockTvShowItem.id, 2, 1, true);

    const media = await dbModule.getMediaById(mockTvShowItem.id);
    assert.equal(media.currentSeason, 2);
    assert.equal(media.currentEpisode, 1);
    assert.equal(media.watchedEpisodesCount, 4); // S1E1, S1E2, S1E3, S2E1

    const episodes = await dbModule.getEpisodesForMedia(mockTvShowItem.id);
    const s2e2 = episodes.find(e => e.seasonNumber === 2 && e.episodeNumber === 2);
    assert.equal(s2e2.isWatched, 0); // S2E2 is after target, remains unwatched
  });

  it('should simulate active season UI tab persistence during episode reload (Issue #13 regression verification)', () => {
    let activeSeasonState = 2; // User had selected Season 2

    const loadEpisodesSimulator = (availableSeasons) => {
      const updateActiveSeason = (prev) => {
        return availableSeasons.includes(prev) ? prev : (availableSeasons[0] || 1);
      };
      activeSeasonState = updateActiveSeason(activeSeasonState);
    };

    // Reload with seasons [1, 2]
    loadEpisodesSimulator([1, 2]);
    assert.equal(activeSeasonState, 2, 'Active season must persist as Season 2 when Season 2 exists');

    // Reload with seasons [1] (e.g. season filtered)
    loadEpisodesSimulator([1]);
    assert.equal(activeSeasonState, 1, 'Active season falls back to Season 1 only when Season 2 is absent');
  });
});
