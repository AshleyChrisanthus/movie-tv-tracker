import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { getDbModule, resetDatabase } from '../helpers/setup.js';
import { mockMovieItem, mockTvShowItem, mockTvEpisodes } from '../helpers/fixtures.js';

describe('Tier 1: Dexie Storage & Schema CRUD Operations', () => {
  let dbModule;

  beforeEach(async () => {
    await resetDatabase();
    dbModule = await getDbModule();
  });

  it('should save a movie item and retrieve it by ID', async () => {
    const saved = await dbModule.saveMediaItem(mockMovieItem);
    assert.ok(saved);
    assert.equal(saved.id, mockMovieItem.id);
    assert.equal(saved.title, 'Fight Club');
    assert.equal(saved.type, 'movie');
    assert.equal(saved.status, 'plan_to_watch');

    const retrieved = await dbModule.getMediaById(mockMovieItem.id);
    assert.ok(retrieved);
    assert.equal(retrieved.id, mockMovieItem.id);
    assert.equal(retrieved.title, 'Fight Club');
    assert.equal(retrieved.totalEpisodes, 1);
  });

  it('should save a TV show with episodes and compute total & watched episode counts', async () => {
    const saved = await dbModule.saveMediaItem(mockTvShowItem, mockTvEpisodes);
    assert.ok(saved);
    assert.equal(saved.totalEpisodes, 5);
    assert.equal(saved.watchedEpisodesCount, 0);
    assert.equal(saved.status, 'plan_to_watch');

    const episodes = await dbModule.getEpisodesForMedia(mockTvShowItem.id);
    assert.equal(episodes.length, 5);
    assert.equal(episodes[0].seasonNumber, 1);
    assert.equal(episodes[0].episodeNumber, 1);
    assert.equal(episodes[4].seasonNumber, 2);
    assert.equal(episodes[4].episodeNumber, 2);
  });

  it('should automatically transition TV show status to watching when episodes are partially watched', async () => {
    await dbModule.saveMediaItem(mockTvShowItem, mockTvEpisodes);

    // Toggle S1E1 to watched
    const res = await dbModule.toggleEpisodeWatched(mockTvShowItem.id, 1, 1);
    assert.equal(res.isWatched, 1);

    const media = await dbModule.getMediaById(mockTvShowItem.id);
    assert.equal(media.watchedEpisodesCount, 1);
    assert.equal(media.status, 'watching');
    assert.equal(media.currentSeason, 1);
    assert.equal(media.currentEpisode, 1);
  });

  it('should automatically transition TV show status to completed when all episodes are watched', async () => {
    await dbModule.saveMediaItem(mockTvShowItem, mockTvEpisodes);

    // Toggle all 5 episodes
    await dbModule.toggleEpisodeWatched(mockTvShowItem.id, 1, 1);
    await dbModule.toggleEpisodeWatched(mockTvShowItem.id, 1, 2);
    await dbModule.toggleEpisodeWatched(mockTvShowItem.id, 1, 3);
    await dbModule.toggleEpisodeWatched(mockTvShowItem.id, 2, 1);
    await dbModule.toggleEpisodeWatched(mockTvShowItem.id, 2, 2);

    const media = await dbModule.getMediaById(mockTvShowItem.id);
    assert.equal(media.watchedEpisodesCount, 5);
    assert.equal(media.status, 'completed');
  });

  it('should preserve existing episode watched progress when updating media metadata without episode list', async () => {
    await dbModule.saveMediaItem(mockTvShowItem, mockTvEpisodes);
    await dbModule.toggleEpisodeWatched(mockTvShowItem.id, 1, 1);

    // Update show notes and overview without re-passing episodes
    const updated = await dbModule.saveMediaItem({
      id: mockTvShowItem.id,
      overview: 'Updated overview description'
    });

    assert.equal(updated.overview, 'Updated overview description');
    assert.equal(updated.watchedEpisodesCount, 1);
    assert.equal(updated.totalEpisodes, 5);

    const episodes = await dbModule.getEpisodesForMedia(mockTvShowItem.id);
    assert.equal(episodes.length, 5);
    const s1e1 = episodes.find(e => e.seasonNumber === 1 && e.episodeNumber === 1);
    assert.equal(s1e1.isWatched, 1);
  });

  it('should preserve existing watched status when syncing/replacing episode list', async () => {
    await dbModule.saveMediaItem(mockTvShowItem, mockTvEpisodes);
    await dbModule.toggleEpisodeWatched(mockTvShowItem.id, 1, 1);

    // Replace with new episode list that has fresh overview text
    const freshEpisodes = mockTvEpisodes.map(ep => ({
      ...ep,
      overview: ep.overview + ' (remastered)'
    }));

    await dbModule.saveMediaItem({ id: mockTvShowItem.id }, freshEpisodes);

    const episodes = await dbModule.getEpisodesForMedia(mockTvShowItem.id);
    const s1e1 = episodes.find(e => e.seasonNumber === 1 && e.episodeNumber === 1);
    assert.equal(s1e1.isWatched, 1);
    assert.ok(s1e1.overview.includes('(remastered)'));

    const s1e2 = episodes.find(e => e.seasonNumber === 1 && e.episodeNumber === 2);
    assert.equal(s1e2.isWatched, 0);
  });

  it('should filter media by status, type, and search query via getAllMedia', async () => {
    await dbModule.saveMediaItem(mockMovieItem);
    await dbModule.saveMediaItem(mockTvShowItem, mockTvEpisodes);

    // All media
    const all = await dbModule.getAllMedia();
    assert.equal(all.length, 2);

    // Filter by type
    const moviesOnly = await dbModule.getAllMedia({ type: 'movie' });
    assert.equal(moviesOnly.length, 1);
    assert.equal(moviesOnly[0].id, mockMovieItem.id);

    const tvOnly = await dbModule.getAllMedia({ type: 'tv' });
    assert.equal(tvOnly.length, 1);
    assert.equal(tvOnly[0].id, mockTvShowItem.id);

    // Filter by searchQuery
    const searchMatch = await dbModule.getAllMedia({ searchQuery: 'fight' });
    assert.equal(searchMatch.length, 1);
    assert.equal(searchMatch[0].title, 'Fight Club');

    const searchNoMatch = await dbModule.getAllMedia({ searchQuery: 'nonexistent' });
    assert.equal(searchNoMatch.length, 0);
  });

  it('should update media status to completed and mark all episodes watched', async () => {
    await dbModule.saveMediaItem(mockTvShowItem, mockTvEpisodes);
    await dbModule.updateMediaStatus(mockTvShowItem.id, 'completed');

    const media = await dbModule.getMediaById(mockTvShowItem.id);
    assert.equal(media.status, 'completed');
    assert.equal(media.watchedEpisodesCount, 5);

    const episodes = await dbModule.getEpisodesForMedia(mockTvShowItem.id);
    assert.ok(episodes.every(e => e.isWatched === 1));
  });

  it('should update user rating and notes', async () => {
    await dbModule.saveMediaItem(mockMovieItem);
    await dbModule.updateMediaRatingAndNotes(mockMovieItem.id, 9.5, 'Absolute classic masterpiece');

    const media = await dbModule.getMediaById(mockMovieItem.id);
    assert.equal(media.rating, 9.5);
    assert.equal(media.notes, 'Absolute classic masterpiece');
  });

  it('should delete media and cascade delete all associated episodes', async () => {
    await dbModule.saveMediaItem(mockTvShowItem, mockTvEpisodes);
    const beforeEps = await dbModule.getEpisodesForMedia(mockTvShowItem.id);
    assert.equal(beforeEps.length, 5);

    await dbModule.deleteMediaItem(mockTvShowItem.id);

    const afterMedia = await dbModule.getMediaById(mockTvShowItem.id);
    assert.equal(afterMedia, undefined);

    const afterEps = await dbModule.getEpisodesForMedia(mockTvShowItem.id);
    assert.equal(afterEps.length, 0);
  });

  it('should store and retrieve settings records', async () => {
    const initial = await dbModule.getSetting('tmdb_api_key');
    assert.equal(initial, null);

    await dbModule.setSetting('tmdb_api_key', 'test_key_12345');
    const updated = await dbModule.getSetting('tmdb_api_key');
    assert.equal(updated, 'test_key_12345');

    const defaultVal = await dbModule.getSetting('unknown_key', 'fallback_val');
    assert.equal(defaultVal, 'fallback_val');
  });
});
