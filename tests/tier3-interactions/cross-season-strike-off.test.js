import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { getDbModule, resetDatabase } from '../helpers/setup.js';

describe('Tier 3: Cross-Season Strike-Off & Active Pointers Interaction', () => {
  let dbModule;

  beforeEach(async () => {
    await resetDatabase();
    dbModule = await getDbModule();
  });

  it('should maintain future season watched records and counters during cross-season strike-off', async () => {
    // Create a 20-episode show (Season 1: 10 eps, Season 2: 10 eps)
    const mediaId = 'media_cross_season_show';
    const show = {
      id: mediaId,
      type: 'tv',
      title: 'Epic Multi-Season Saga',
      totalSeasons: 2,
      totalEpisodes: 20
    };

    const episodes = [];
    for (let s = 1; s <= 2; s++) {
      for (let e = 1; e <= 10; e++) {
        episodes.push({
          id: mediaId + '_S' + s + 'E' + e,
          mediaId,
          seasonNumber: s,
          episodeNumber: e,
          title: 'Season ' + s + ' Episode ' + e,
          isWatched: 0
        });
      }
    }

    await dbModule.saveMediaItem(show, episodes);

    // 1. User watches all of Season 1 (10 episodes)
    await dbModule.setSeasonWatched(mediaId, 1, true);

    // 2. User watches S2E1
    await dbModule.toggleEpisodeWatched(mediaId, 2, 1);

    let media = await dbModule.getMediaById(mediaId);
    assert.equal(media.watchedEpisodesCount, 11);
    assert.equal(media.currentSeason, 2);
    assert.equal(media.currentEpisode, 1);
    assert.equal(media.status, 'watching');

    // 3. User navigates back to Season 1 and strikes off up to S1E8
    await dbModule.markEpisodesUpToWatched(mediaId, 1, 8);

    // 4. Verify that:
    // - S1E1..S1E8 are watched
    // - S1E9, S1E10 remain watched!
    // - S2E1 remains watched!
    // - Total watched count remains 11!
    const allEps = await dbModule.getEpisodesForMedia(mediaId);
    const watchedEps = allEps.filter(e => e.isWatched === 1);
    assert.equal(watchedEps.length, 11);

    const s1e9 = allEps.find(e => e.seasonNumber === 1 && e.episodeNumber === 9);
    assert.equal(s1e9.isWatched, 1);

    const s1e10 = allEps.find(e => e.seasonNumber === 1 && e.episodeNumber === 10);
    assert.equal(s1e10.isWatched, 1);

    const s2e1 = allEps.find(e => e.seasonNumber === 2 && e.episodeNumber === 1);
    assert.equal(s2e1.isWatched, 1);

    const s2e2 = allEps.find(e => e.seasonNumber === 2 && e.episodeNumber === 2);
    assert.equal(s2e2.isWatched, 0);

    media = await dbModule.getMediaById(mediaId);
    assert.equal(media.watchedEpisodesCount, 11);
    assert.equal(media.currentSeason, 1);
    assert.equal(media.currentEpisode, 8);

    // 5. User now finishes Season 2 by marking Season 2 as watched
    await dbModule.setSeasonWatched(mediaId, 2, true);

    media = await dbModule.getMediaById(mediaId);
    assert.equal(media.watchedEpisodesCount, 20);
    assert.equal(media.status, 'completed');
  });
});
