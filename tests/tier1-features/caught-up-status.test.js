import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { getDbModule, resetDatabase } from '../helpers/setup.js';

describe('Tier 1: Auto-detect Caught Up Status Engine (Issue #18)', () => {
  let dbModule;

  beforeEach(async () => {
    await resetDatabase();
    dbModule = await getDbModule();
  });

  it('should automatically transition ongoing show with future un-aired episodes to caught_up when current episodes are watched', async () => {
    const today = new Date();
    const pastDate = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const futureDate = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const ongoingShow = {
      id: 'media_test_airing_show',
      externalId: 9991,
      source: 'tvmaze',
      type: 'tv',
      title: 'Currently Airing Weekly Drama',
      status: 'plan_to_watch',
      airStatus: 'Running',
      totalSeasons: 1,
      totalEpisodes: 3,
      watchedEpisodesCount: 0,
      currentSeason: 1,
      currentEpisode: 0
    };

    const episodes = [
      {
        id: 'media_test_airing_show_S1E1',
        mediaId: 'media_test_airing_show',
        seasonNumber: 1,
        episodeNumber: 1,
        title: 'Episode 1 (Aired)',
        airDate: pastDate,
        isWatched: 0
      },
      {
        id: 'media_test_airing_show_S1E2',
        mediaId: 'media_test_airing_show',
        seasonNumber: 1,
        episodeNumber: 2,
        title: 'Episode 2 (Aired)',
        airDate: pastDate,
        isWatched: 0
      },
      {
        id: 'media_test_airing_show_S1E3',
        mediaId: 'media_test_airing_show',
        seasonNumber: 1,
        episodeNumber: 3,
        title: 'Episode 3 (Future / Un-aired)',
        airDate: futureDate,
        isWatched: 0
      }
    ];

    await dbModule.saveMediaItem(ongoingShow, episodes);

    // 1. Watching first episode transitions show from plan_to_watch -> watching
    await dbModule.toggleEpisodeWatched(ongoingShow.id, 1, 1);
    let media = await dbModule.getMediaById(ongoingShow.id);
    assert.equal(media.watchedEpisodesCount, 1);
    assert.equal(media.status, 'watching');

    // 2. Watching second episode finishes all aired episodes -> auto transitions to caught_up!
    await dbModule.toggleEpisodeWatched(ongoingShow.id, 1, 2);
    media = await dbModule.getMediaById(ongoingShow.id);
    assert.equal(media.watchedEpisodesCount, 2);
    assert.equal(media.status, 'caught_up');

    // 3. Unmarking an aired episode returns status to watching
    await dbModule.toggleEpisodeWatched(ongoingShow.id, 1, 2);
    media = await dbModule.getMediaById(ongoingShow.id);
    assert.equal(media.watchedEpisodesCount, 1);
    assert.equal(media.status, 'watching');
  });

  it('should mark an ongoing show as caught_up when all episodes are watched and airStatus is Returning Series', async () => {
    const show = {
      id: 'media_test_returning_show',
      externalId: 9992,
      source: 'tmdb',
      type: 'tv',
      title: 'Awaiting Season 2',
      status: 'watching',
      airStatus: 'Returning Series',
      totalSeasons: 1,
      totalEpisodes: 2,
      watchedEpisodesCount: 1,
      currentSeason: 1,
      currentEpisode: 1
    };

    const episodes = [
      {
        id: 'media_test_returning_show_S1E1',
        mediaId: 'media_test_returning_show',
        seasonNumber: 1,
        episodeNumber: 1,
        title: 'Episode 1',
        airDate: '2024-01-01',
        isWatched: 1
      },
      {
        id: 'media_test_returning_show_S1E2',
        mediaId: 'media_test_returning_show',
        seasonNumber: 1,
        episodeNumber: 2,
        title: 'Episode 2',
        airDate: '2024-01-08',
        isWatched: 0
      }
    ];

    await dbModule.saveMediaItem(show, episodes);

    // Watch the finale of season 1
    await dbModule.toggleEpisodeWatched(show.id, 1, 2);
    const media = await dbModule.getMediaById(show.id);

    assert.equal(media.watchedEpisodesCount, 2);
    // Because airStatus is 'Returning Series', it is caught_up waiting for the next season!
    assert.equal(media.status, 'caught_up');
  });

  it('should mark an ended show as completed when all episodes are watched', async () => {
    const show = {
      id: 'media_test_ended_show',
      externalId: 9993,
      source: 'tvmaze',
      type: 'tv',
      title: 'Ended Series',
      status: 'watching',
      airStatus: 'Ended',
      totalSeasons: 1,
      totalEpisodes: 2,
      watchedEpisodesCount: 1,
      currentSeason: 1,
      currentEpisode: 1
    };

    const episodes = [
      {
        id: 'media_test_ended_show_S1E1',
        mediaId: 'media_test_ended_show',
        seasonNumber: 1,
        episodeNumber: 1,
        title: 'Episode 1',
        airDate: '2020-01-01',
        isWatched: 1
      },
      {
        id: 'media_test_ended_show_S1E2',
        mediaId: 'media_test_ended_show',
        seasonNumber: 1,
        episodeNumber: 2,
        title: 'Finale',
        airDate: '2020-01-08',
        isWatched: 0
      }
    ];

    await dbModule.saveMediaItem(show, episodes);

    await dbModule.toggleEpisodeWatched(show.id, 1, 2);
    const media = await dbModule.getMediaById(show.id);

    assert.equal(media.watchedEpisodesCount, 2);
    // Because airStatus is 'Ended', it transitions to completed
    assert.equal(media.status, 'completed');
  });

  it('should support querying media list with caught_up filter', async () => {
    const show1 = {
      id: 'media_test_cu_filter_1',
      title: 'Show 1 Caught Up',
      type: 'tv',
      source: 'custom',
      status: 'caught_up',
      totalEpisodes: 2,
      watchedEpisodesCount: 2
    };

    const show2 = {
      id: 'media_test_cu_filter_2',
      title: 'Show 2 Watching',
      type: 'tv',
      source: 'custom',
      status: 'watching',
      totalEpisodes: 5,
      watchedEpisodesCount: 1
    };

    await dbModule.saveMediaItem(show1);
    await dbModule.saveMediaItem(show2);

    const caughtUpList = await dbModule.getAllMedia({ status: 'caught_up' });
    assert.equal(caughtUpList.length, 1);
    assert.equal(caughtUpList[0].id, show1.id);
  });
});
