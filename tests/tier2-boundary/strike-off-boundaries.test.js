import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { getDbModule, resetDatabase } from '../helpers/setup.js';
import { mockTvShowItem, mockTvEpisodes } from '../helpers/fixtures.js';

describe('Tier 2: Strike-Off Boundary & Corner Cases', () => {
  let dbModule;

  beforeEach(async () => {
    await resetDatabase();
    dbModule = await getDbModule();
  });

  it('should handle strike-off at the very first episode (S1E1)', async () => {
    await dbModule.saveMediaItem(mockTvShowItem, mockTvEpisodes);

    await dbModule.markEpisodesUpToWatched(mockTvShowItem.id, 1, 1);

    const media = await dbModule.getMediaById(mockTvShowItem.id);
    assert.equal(media.watchedEpisodesCount, 1);
    assert.equal(media.currentSeason, 1);
    assert.equal(media.currentEpisode, 1);

    const eps = await dbModule.getEpisodesForMedia(mockTvShowItem.id);
    assert.equal(eps[0].isWatched, 1);
    assert.equal(eps[1].isWatched, 0);
  });

  it('should handle strike-off when episode number exceeds the season total (e.g. S1E999)', async () => {
    await dbModule.saveMediaItem(mockTvShowItem, mockTvEpisodes);

    // Target S1E999: Season 1 has only 3 episodes.
    // All Season 1 episodes should be marked watched, but Season 2 episodes should remain unwatched!
    await dbModule.markEpisodesUpToWatched(mockTvShowItem.id, 1, 999);

    const media = await dbModule.getMediaById(mockTvShowItem.id);
    assert.equal(media.watchedEpisodesCount, 3);
    assert.equal(media.currentSeason, 1);
    assert.equal(media.currentEpisode, 999);

    const eps = await dbModule.getEpisodesForMedia(mockTvShowItem.id);
    const s1 = eps.filter(e => e.seasonNumber === 1);
    assert.ok(s1.every(e => e.isWatched === 1));

    const s2 = eps.filter(e => e.seasonNumber === 2);
    assert.ok(s2.every(e => e.isWatched === 0));
  });

  it('should handle strike-off on a show with 0 episodes without throwing', async () => {
    await dbModule.saveMediaItem({
      id: 'media_no_eps',
      type: 'tv',
      title: 'Show Without Episodes',
      totalEpisodes: 0
    }, []);

    await dbModule.markEpisodesUpToWatched('media_no_eps', 1, 5);

    const media = await dbModule.getMediaById('media_no_eps');
    assert.equal(media.watchedEpisodesCount, 0);
    assert.equal(media.currentSeason, 1);
    assert.equal(media.currentEpisode, 5);
  });

  it('should be idempotent when strike-off is called repeatedly on the same target', async () => {
    await dbModule.saveMediaItem(mockTvShowItem, mockTvEpisodes);

    await dbModule.markEpisodesUpToWatched(mockTvShowItem.id, 1, 2);
    const eps1 = await dbModule.getEpisodesForMedia(mockTvShowItem.id);
    const s1e1WatchedAt = eps1[0].watchedAt;
    assert.ok(s1e1WatchedAt);

    // Call strike-off on same target again
    await dbModule.markEpisodesUpToWatched(mockTvShowItem.id, 1, 2);
    const eps2 = await dbModule.getEpisodesForMedia(mockTvShowItem.id);

    assert.equal(eps2[0].isWatched, 1);
    assert.equal(eps2[0].watchedAt, s1e1WatchedAt, 'Watched timestamp should not change when already watched');

    const media = await dbModule.getMediaById(mockTvShowItem.id);
    assert.equal(media.watchedEpisodesCount, 2);
  });

  it('should handle non-existent mediaId gracefully without crashing', async () => {
    await dbModule.markEpisodesUpToWatched('non_existent_media_id', 1, 1);
    const media = await dbModule.getMediaById('non_existent_media_id');
    assert.equal(media, undefined);
  });
});
