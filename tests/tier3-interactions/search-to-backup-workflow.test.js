import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { getApiModule, getDbModule, resetDatabase, mockFetch, restoreFetch } from '../helpers/setup.js';

describe('Tier 3: Search-to-Backup End-to-End Workflow', () => {
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

  it('should execute full lifecycle: search -> add show -> mark episodes -> export minimal backup -> wipe DB -> restore -> verify exact counts', async () => {
    // 1. Mock search and details responses for 'Severance'
    mockFetch((url) => {
      if (url.includes('/search/shows')) {
        return Promise.resolve({
          ok: true,
          json: async () => [
            {
              show: {
                id: 5001,
                name: 'Severance',
                premiered: '2022-02-18',
                summary: '<p>Office workers memory separation.</p>',
                image: { original: 'https://example.com/severance.jpg' }
              }
            }
          ]
        });
      }
      if (url.includes('/search?term=')) {
        return Promise.resolve({ ok: true, json: async () => ({ results: [] }) });
      }
      if (url.endsWith('/shows/5001')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            id: 5001,
            name: 'Severance',
            premiered: '2022-02-18',
            summary: '<p>Office workers memory separation.</p>',
            image: { original: 'https://example.com/severance.jpg' }
          })
        });
      }
      if (url.endsWith('/shows/5001/episodes')) {
        return Promise.resolve({
          ok: true,
          json: async () => Array.from({ length: 9 }, (_, i) => ({
            id: 50010 + i + 1,
            season: 1,
            number: i + 1,
            name: 'Severance Episode ' + (i + 1),
            summary: 'Summary of episode ' + (i + 1),
            airdate: '2022-02-18',
            runtime: 50
          }))
        });
      }
      return Promise.reject(new Error('Unexpected URL: ' + url));
    });

    // 2. User searches for 'Severance'
    const searchResults = await apiModule.searchMedia('Severance');
    assert.equal(searchResults.length, 1);
    const selectedShow = searchResults[0];
    assert.equal(selectedShow.title, 'Severance');

    // 3. User selects show -> app fetches full details
    const fullDetails = await apiModule.fetchFullMediaDetails(selectedShow);
    assert.equal(fullDetails.episodes.length, 9);

    // 4. Save to Dexie
    const saved = await dbModule.saveMediaItem(fullDetails.media, fullDetails.episodes);
    assert.equal(saved.totalEpisodes, 9);
    assert.equal(saved.watchedEpisodesCount, 0);
    assert.equal(saved.status, 'plan_to_watch');

    // 5. User watches episodes 1 to 5 via bulk strike-off
    await dbModule.markEpisodesUpToWatched(saved.id, 1, 5);

    // User also watches episode 6 individually
    await dbModule.toggleEpisodeWatched(saved.id, 1, 6);

    // Verify state before export
    const mediaBefore = await dbModule.getMediaById(saved.id);
    assert.equal(mediaBefore.watchedEpisodesCount, 6);
    assert.equal(mediaBefore.status, 'watching');

    // 6. User exports minimal backup
    const backup = await dbModule.exportAllData({ mode: 'minimal' });
    assert.equal(backup.backupMode, 'minimal');
    assert.equal(backup.media.length, 1);
    // Minimal backup must contain ONLY the 6 watched episodes
    assert.equal(backup.episodes.length, 6);
    assert.ok(backup.episodes.every(e => e.isWatched === 1));

    // 7. Clean wipe the database (simulate clean install)
    await resetDatabase();
    const emptyCheck = await dbModule.getAllMedia();
    assert.equal(emptyCheck.length, 0);

    // 8. Restore minimal backup into clean database
    const importResult = await dbModule.importData(backup, true);
    assert.equal(importResult.mediaCount, 1);
    assert.equal(importResult.episodesCount, 6);

    // 9. Verify restored state
    const restoredMedia = await dbModule.getMediaById(saved.id);
    assert.ok(restoredMedia);
    assert.equal(restoredMedia.title, 'Severance');
    assert.equal(restoredMedia.watchedEpisodesCount, 6);
    assert.equal(restoredMedia.status, 'watching');

    const restoredEpisodes = await dbModule.getEpisodesForMedia(saved.id);
    assert.equal(restoredEpisodes.length, 6);
    assert.ok(restoredEpisodes.every(e => e.isWatched === 1));
    assert.equal(restoredEpisodes[0].episodeNumber, 1);
    assert.equal(restoredEpisodes[5].episodeNumber, 6);
  });
});
