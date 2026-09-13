import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { getDbModule, resetDatabase } from '../helpers/setup.js';
import { mockTvShowItem, mockTvEpisodes } from '../helpers/fixtures.js';

describe('Tier 1: Bulk Episode Strike-Off Engine (Issue #14)', () => {
  let dbModule;

  beforeEach(async () => {
    await resetDatabase();
    dbModule = await getDbModule();
  });

  it('should mark all episodes up to target season and episode as watched', async () => {
    await dbModule.saveMediaItem(mockTvShowItem, mockTvEpisodes);

    await dbModule.markEpisodesUpToWatched(mockTvShowItem.id, 1, 2);

    const media = await dbModule.getMediaById(mockTvShowItem.id);
    assert.equal(media.currentSeason, 1);
    assert.equal(media.currentEpisode, 2);
    assert.equal(media.watchedEpisodesCount, 2);
    assert.equal(media.status, 'watching');

    const episodes = await dbModule.getEpisodesForMedia(mockTvShowItem.id);
    const s1e1 = episodes.find(e => e.seasonNumber === 1 && e.episodeNumber === 1);
    const s1e2 = episodes.find(e => e.seasonNumber === 1 && e.episodeNumber === 2);
    const s1e3 = episodes.find(e => e.seasonNumber === 1 && e.episodeNumber === 3);

    assert.equal(s1e1.isWatched, 1);
    assert.ok(s1e1.watchedAt);
    assert.equal(s1e2.isWatched, 1);
    assert.ok(s1e2.watchedAt);
    assert.equal(s1e3.isWatched, 0);
  });

  it('CRITICAL Issue #14: should NOT unmark already-watched future episodes after target', async () => {
    const episodesWithFutureWatched = mockTvEpisodes.map(ep => {
      if (ep.seasonNumber === 2 && ep.episodeNumber === 2) {
        return { ...ep, isWatched: 1, watchedAt: '2026-08-01T12:00:00.000Z' };
      }
      return { ...ep, isWatched: 0 };
    });

    await dbModule.saveMediaItem({
      ...mockTvShowItem,
      watchedEpisodesCount: 1,
      status: 'watching'
    }, episodesWithFutureWatched);

    await dbModule.markEpisodesUpToWatched(mockTvShowItem.id, 1, 2);

    const episodes = await dbModule.getEpisodesForMedia(mockTvShowItem.id);
    const s1e1 = episodes.find(e => e.seasonNumber === 1 && e.episodeNumber === 1);
    const s1e2 = episodes.find(e => e.seasonNumber === 1 && e.episodeNumber === 2);
    const s1e3 = episodes.find(e => e.seasonNumber === 1 && e.episodeNumber === 3);
    const s2e1 = episodes.find(e => e.seasonNumber === 2 && e.episodeNumber === 1);
    const s2e2 = episodes.find(e => e.seasonNumber === 2 && e.episodeNumber === 2);

    assert.equal(s1e1.isWatched, 1);
    assert.equal(s1e2.isWatched, 1);
    assert.equal(s1e3.isWatched, 0);
    assert.equal(s2e1.isWatched, 0);

    // S2E2 must remain watched
    assert.equal(s2e2.isWatched, 1);
    assert.equal(s2e2.watchedAt, '2026-08-01T12:00:00.000Z');

    const media = await dbModule.getMediaById(mockTvShowItem.id);
    assert.equal(media.watchedEpisodesCount, 3);
  });

  it('should mark all episodes as watched when striking off to the last episode of the series', async () => {
    await dbModule.saveMediaItem(mockTvShowItem, mockTvEpisodes);

    await dbModule.markEpisodesUpToWatched(mockTvShowItem.id, 2, 2);

    const media = await dbModule.getMediaById(mockTvShowItem.id);
    assert.equal(media.watchedEpisodesCount, 5);
    assert.equal(media.status, 'completed');

    const episodes = await dbModule.getEpisodesForMedia(mockTvShowItem.id);
    assert.ok(episodes.every(e => e.isWatched === 1));
  });
});
