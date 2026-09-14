import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { getDbModule, resetDatabase } from '../helpers/setup.js';
import { mockTvShowItem, mockTvEpisodes } from '../helpers/fixtures.js';

describe('Tier 1: Issue #17 Media Deduplication on Add', () => {
  let dbModule;

  beforeEach(async () => {
    await resetDatabase();
    dbModule = await getDbModule();
  });

  it('should not create duplicate entries when adding media with matching externalId and source', async () => {
    const item1 = await dbModule.saveMediaItem({
      title: 'Breaking Bad',
      type: 'tv',
      source: 'tvmaze',
      externalId: '169',
      status: 'watching'
    });

    const allBefore = await dbModule.getAllMedia();
    assert.equal(allBefore.length, 1);

    // Try adding the same media again with same externalId and source
    const item2 = await dbModule.saveMediaItem({
      title: 'Breaking Bad (Updated Name)',
      type: 'tv',
      source: 'tvmaze',
      externalId: '169',
      status: 'completed'
    });

    const allAfter = await dbModule.getAllMedia();
    assert.equal(allAfter.length, 1, 'Should not create a duplicate record in DB');
    assert.equal(item2.id, item1.id, 'Should update existing media id');
    assert.equal(allAfter[0].id, item1.id);
  });

  it('should not create duplicate entries when adding media with matching title and type', async () => {
    const item1 = await dbModule.saveMediaItem({
      title: 'Inception',
      type: 'movie',
      year: 2010,
      source: 'tmdb',
      externalId: '27205',
      status: 'plan_to_watch'
    });

    const allBefore = await dbModule.getAllMedia();
    assert.equal(allBefore.length, 1);

    // Custom or secondary search add with case-insensitive matching title
    const item2 = await dbModule.saveMediaItem({
      title: '  inception  ',
      type: 'movie',
      year: 2010,
      source: 'custom',
      externalId: 'custom_12345',
      status: 'completed'
    });

    const allAfter = await dbModule.getAllMedia();
    assert.equal(allAfter.length, 1, 'Should deduplicate by normalized title and type');
    assert.equal(item2.id, item1.id, 'Should preserve the original ID');
  });

  it('should preserve watched progress when deduplicating and merging episodes', async () => {
    await dbModule.saveMediaItem(mockTvShowItem, mockTvEpisodes);
    await dbModule.toggleEpisodeWatched(mockTvShowItem.id, 1, 1);

    const mediaBefore = await dbModule.getMediaById(mockTvShowItem.id);
    assert.equal(mediaBefore.watchedEpisodesCount, 1);

    // Re-add show with same externalId
    await dbModule.saveMediaItem({
      ...mockTvShowItem,
      title: 'Severance (Season 2 Confirmed)'
    }, mockTvEpisodes);

    const all = await dbModule.getAllMedia();
    assert.equal(all.length, 1);
    const mediaAfter = await dbModule.getMediaById(mockTvShowItem.id);
    assert.equal(mediaAfter.watchedEpisodesCount, 1, 'Existing watched episodes must be preserved');
  });
});
