import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { getDbModule, resetDatabase } from '../helpers/setup.js';

describe('Tier 2: Empty Library & Corner Media Items', () => {
  let dbModule;

  beforeEach(async () => {
    await resetDatabase();
    dbModule = await getDbModule();
  });

  it('should handle completely empty library queries without errors', async () => {
    const all = await dbModule.getAllMedia();
    assert.deepEqual(all, []);

    const filtered = await dbModule.getAllMedia({ status: 'completed', type: 'tv', searchQuery: 'none' });
    assert.deepEqual(filtered, []);

    const nonExistent = await dbModule.getMediaById('unknown_id_xyz');
    assert.equal(nonExistent, undefined);

    const nonExistentEps = await dbModule.getEpisodesForMedia('unknown_id_xyz');
    assert.deepEqual(nonExistentEps, []);
  });

  it('should handle single-episode shows (miniseries or specials)', async () => {
    const singleEpShow = {
      id: 'media_single_ep',
      type: 'tv',
      title: 'One-Shot Special',
      totalSeasons: 1,
      totalEpisodes: 1
    };

    const loneEpisode = [
      {
        id: 'media_single_ep_S1E1',
        mediaId: 'media_single_ep',
        seasonNumber: 1,
        episodeNumber: 1,
        title: 'The Special',
        isWatched: 0
      }
    ];

    await dbModule.saveMediaItem(singleEpShow, loneEpisode);

    let media = await dbModule.getMediaById('media_single_ep');
    assert.equal(media.totalEpisodes, 1);
    assert.equal(media.watchedEpisodesCount, 0);
    assert.equal(media.status, 'plan_to_watch');

    await dbModule.toggleEpisodeWatched('media_single_ep', 1, 1);

    media = await dbModule.getMediaById('media_single_ep');
    assert.equal(media.watchedEpisodesCount, 1);
    assert.equal(media.status, 'completed');

    await dbModule.toggleEpisodeWatched('media_single_ep', 1, 1);
    media = await dbModule.getMediaById('media_single_ep');
    assert.equal(media.watchedEpisodesCount, 0);
  });

  it('should handle standalone 0-episode movies cleanly', async () => {
    const movieWithoutEpisodes = {
      id: 'media_standalone_movie',
      type: 'movie',
      title: 'Standalone Indie Film',
      year: 2024,
      status: 'plan_to_watch'
    };

    await dbModule.saveMediaItem(movieWithoutEpisodes, []);

    const media = await dbModule.getMediaById('media_standalone_movie');
    assert.equal(media.totalEpisodes, 0);
    assert.equal(media.watchedEpisodesCount, 0);

    const eps = await dbModule.getEpisodesForMedia('media_standalone_movie');
    assert.equal(eps.length, 0);

    await dbModule.updateMediaStatus('media_standalone_movie', 'completed');
    const updated = await dbModule.getMediaById('media_standalone_movie');
    assert.equal(updated.status, 'completed');
  });

  it('should safely coerce string and missing fields on saveMediaItem without throwing', async () => {
    const edgeItem = {
      title: 'Minimal Raw Item'
    };

    const edgeEpisodes = [
      {
        seasonNumber: '2',
        episodeNumber: '10',
        title: null
      }
    ];

    const saved = await dbModule.saveMediaItem(edgeItem, edgeEpisodes);
    assert.ok(saved.id.startsWith('media_'));
    assert.equal(saved.totalEpisodes, 1);

    const storedEps = await dbModule.getEpisodesForMedia(saved.id);
    assert.equal(storedEps.length, 1);
    assert.equal(storedEps[0].seasonNumber, 2);
    assert.equal(storedEps[0].episodeNumber, 10);
    assert.equal(storedEps[0].title, 'Episode 10');
    assert.equal(storedEps[0].overview, '');
  });
});
