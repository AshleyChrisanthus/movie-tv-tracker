import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { getDbModule, resetDatabase } from '../helpers/setup.js';

describe('Tier 4: Realistic Multi-Tier Library Import Workload', () => {
  let dbModule;

  beforeEach(async () => {
    await resetDatabase();
    dbModule = await getDbModule();
  });

  it('should import the real-world 9-show 423-episode backup and execute library queries', async () => {
    const backupPath = path.resolve(process.cwd(), 'exports/watch-history-minimal-2026-09-10_18-50-02.json');
    assert.ok(fs.existsSync(backupPath), 'Sample backup file must exist in exports/');

    const rawJson = fs.readFileSync(backupPath, 'utf8');
    const backupData = JSON.parse(rawJson);

    assert.equal(backupData.app, 'BingeLog');
    assert.equal(backupData.totalMedia, 9);
    assert.equal(backupData.totalEpisodes, 423);

    // Import the backup
    const importResult = await dbModule.importData(backupData, true);
    assert.equal(importResult.mediaCount, 9);
    assert.equal(importResult.episodesCount, 423);

    // Verify all 9 media items exist in Dexie
    const allMedia = await dbModule.getAllMedia();
    assert.equal(allMedia.length, 9);

    // Verify specific real-world shows
    const tedLasso = allMedia.find(m => m.title === 'Ted Lasso');
    assert.ok(tedLasso);
    assert.equal(tedLasso.totalEpisodes, 44);
    assert.equal(tedLasso.watchedEpisodesCount, 34);
    assert.equal(tedLasso.status, 'watching');
    assert.equal(tedLasso.currentSeason, 3);
    assert.equal(tedLasso.currentEpisode, 2);

    const theMiddle = allMedia.find(m => m.title === 'The Middle');
    assert.ok(theMiddle);
    assert.equal(theMiddle.totalEpisodes, 215);
    assert.equal(theMiddle.watchedEpisodesCount, 142);
    assert.equal(theMiddle.currentSeason, 7);
    assert.equal(theMiddle.currentEpisode, 21);

    const lastOfUs = allMedia.find(m => m.title === 'The Last of Us');
    assert.ok(lastOfUs);
    assert.equal(lastOfUs.status, 'dropped');
    assert.equal(lastOfUs.watchedEpisodesCount, 9);

    // Verify status filter queries
    const watchingShows = await dbModule.getAllMedia({ status: 'watching' });
    assert.equal(watchingShows.length, 7);

    const droppedShows = await dbModule.getAllMedia({ status: 'dropped' });
    assert.equal(droppedShows.length, 2);

    // Verify title search query
    const searchTed = await dbModule.getAllMedia({ searchQuery: 'Ted' });
    assert.equal(searchTed.length, 1);
    assert.equal(searchTed[0].title, 'Ted Lasso');

    const searchBigBang = await dbModule.getAllMedia({ searchQuery: 'Big Bang' });
    assert.equal(searchBigBang.length, 1);
    assert.equal(searchBigBang[0].title, 'The Big Bang Theory');

    // Verify episodes for Ted Lasso
    const tedEpisodes = await dbModule.getEpisodesForMedia(tedLasso.id);
    assert.equal(tedEpisodes.length, 34); // In minimal backup, only the 34 watched episodes were saved
    assert.ok(tedEpisodes.every(e => e.isWatched === 1));

    // Re-export as compact
    const reExported = await dbModule.exportAllData({ mode: 'compact' });
    assert.equal(reExported.totalMedia, 9);
    assert.equal(reExported.totalEpisodes, 423);
  });
});
