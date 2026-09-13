import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { getDbModule, getExportServiceModule, resetDatabase } from '../helpers/setup.js';
import { mockTvShowItem, mockTvEpisodes, mockCustomMediaItem, mockCustomEpisodes } from '../helpers/fixtures.js';

describe('Tier 1: 3-Tier Backup Export & Restore Architecture (Issues #15 & #16)', () => {
  let dbModule;
  let exportModule;

  beforeEach(async () => {
    await resetDatabase();
    dbModule = await getDbModule();
    exportModule = await getExportServiceModule();
  });

  it('should export minimal backup containing ONLY watched episodes and custom media episodes', async () => {
    // Save standard TV show where only S1E1 is watched
    const tvEps = mockTvEpisodes.map(ep => ({
      ...ep,
      isWatched: ep.episodeNumber === 1 && ep.seasonNumber === 1 ? 1 : 0
    }));
    await dbModule.saveMediaItem(mockTvShowItem, tvEps);

    // Save custom show where S1E1 is watched, S1E2 is unwatched
    await dbModule.saveMediaItem(mockCustomMediaItem, mockCustomEpisodes);

    const backup = await dbModule.exportAllData({ mode: 'minimal' });

    assert.equal(backup.app, 'BingeLog');
    assert.equal(backup.backupMode, 'minimal');
    assert.equal(backup.media.length, 2);

    // Minimal should only include:
    // 1 episode from TV show (S1E1 watched)
    // 2 episodes from custom show (custom user content is NEVER lost)
    assert.equal(backup.episodes.length, 3);

    const tvBackupEps = backup.episodes.filter(e => e.mediaId === mockTvShowItem.id);
    assert.equal(tvBackupEps.length, 1);
    assert.equal(tvBackupEps[0].isWatched, 1);

    const customBackupEps = backup.episodes.filter(e => e.mediaId === mockCustomMediaItem.id);
    assert.equal(customBackupEps.length, 2);

    // Verify heavy synopses & screenshots are stripped
    assert.equal(backup.episodes[0].overview, undefined);
    assert.equal(backup.episodes[0].stillUrl, undefined);
  });

  it('should export compact backup containing all episode checklist items stripped of synopses', async () => {
    await dbModule.saveMediaItem(mockTvShowItem, mockTvEpisodes);

    const backup = await dbModule.exportAllData({ mode: 'compact' });

    assert.equal(backup.backupMode, 'compact');
    assert.equal(backup.episodes.length, 5); // All 5 episodes included

    // Verify stripped synopses
    assert.equal(backup.episodes[0].overview, undefined);
    assert.equal(backup.episodes[0].stillUrl, undefined);
    assert.ok(backup.episodes[0].title);
  });

  it('should export full backup containing cached synopses and screenshots', async () => {
    await dbModule.saveMediaItem(mockTvShowItem, mockTvEpisodes);

    const backup = await dbModule.exportAllData({ mode: 'full' });

    assert.equal(backup.backupMode, 'full');
    assert.equal(backup.episodes.length, 5);
    assert.ok(backup.episodes[0].overview);
    assert.ok(backup.episodes[0].stillUrl);
  });

  it('should restore backup with overwrite = true (clean wipe and restore)', async () => {
    // Initial state: show A
    await dbModule.saveMediaItem({ id: 'show_a', title: 'Old Show A', type: 'movie' });

    // Backup to import: show B with 2 episodes
    const backupData = {
      app: 'BingeLog',
      version: 1,
      backupMode: 'compact',
      media: [
        { id: 'show_b', title: 'Restored Show B', type: 'tv', totalEpisodes: 2, watchedEpisodesCount: 1 }
      ],
      episodes: [
        { id: 'show_b_S1E1', mediaId: 'show_b', seasonNumber: 1, episodeNumber: 1, title: 'Ep 1', isWatched: 1 },
        { id: 'show_b_S1E2', mediaId: 'show_b', seasonNumber: 1, episodeNumber: 2, title: 'Ep 2', isWatched: 0 }
      ],
      settings: [
        { key: 'theme', value: 'midnight-sapphire' }
      ]
    };

    const result = await dbModule.importData(backupData, true);
    assert.equal(result.mediaCount, 1);
    assert.equal(result.episodesCount, 2);

    // Verify show A was wiped
    const oldMedia = await dbModule.getMediaById('show_a');
    assert.equal(oldMedia, undefined);

    // Verify show B exists
    const newMedia = await dbModule.getMediaById('show_b');
    assert.equal(newMedia.title, 'Restored Show B');

    const eps = await dbModule.getEpisodesForMedia('show_b');
    assert.equal(eps.length, 2);

    const themeSetting = await dbModule.getSetting('theme');
    assert.equal(themeSetting, 'midnight-sapphire');
  });

  it('should restore backup with overwrite = false (merge without wiping)', async () => {
    await dbModule.saveMediaItem({ id: 'existing_show', title: 'Existing Show', type: 'movie' });

    const backupData = {
      app: 'BingeLog',
      version: 1,
      backupMode: 'minimal',
      media: [
        { id: 'merged_show', title: 'Merged Show', type: 'movie' }
      ],
      episodes: []
    };

    await dbModule.importData(backupData, false);

    const existing = await dbModule.getMediaById('existing_show');
    assert.ok(existing);
    assert.equal(existing.title, 'Existing Show');

    const merged = await dbModule.getMediaById('merged_show');
    assert.ok(merged);
    assert.equal(merged.title, 'Merged Show');
  });

  it('should generate correct timestamped backup filenames matching tier mode', () => {
    const minName = exportModule.generateBackupFilename('minimal');
    assert.ok(minName.startsWith('watch-history-minimal-'));
    assert.ok(minName.endsWith('.json'));

    const compactName = exportModule.generateBackupFilename('compact');
    assert.ok(compactName.startsWith('watch-history-compact-'));
    assert.ok(compactName.endsWith('.json'));

    const fullName = exportModule.generateBackupFilename('full');
    assert.ok(fullName.startsWith('watch-history-full-'));
    assert.ok(fullName.endsWith('.json'));
  });
});
