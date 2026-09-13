import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { getDbModule, getExportServiceModule, resetDatabase } from '../helpers/setup.js';

describe('Tier 2: Corrupted & Invalid Backup JSON Parsing', () => {
  let dbModule;
  let exportModule;

  beforeEach(async () => {
    await resetDatabase();
    dbModule = await getDbModule();
    exportModule = await getExportServiceModule();
  });

  it('should throw descriptive error when backup data is missing the media array', async () => {
    await assert.rejects(
      async () => await dbModule.importData(null),
      {
        name: 'Error',
        message: 'Invalid backup file format: missing media list'
      }
    );

    await assert.rejects(
      async () => await dbModule.importData({}),
      {
        name: 'Error',
        message: 'Invalid backup file format: missing media list'
      }
    );

    await assert.rejects(
      async () => await dbModule.importData({ media: 'not an array' }),
      {
        name: 'Error',
        message: 'Invalid backup file format: missing media list'
      }
    );
  });

  it('should handle backup where episodes and settings arrays are null or omitted', async () => {
    const minimalData = {
      app: 'BingeLog',
      version: 1,
      media: [
        { id: 'movie_solo', title: 'Solo Movie', type: 'movie' }
      ]
      // episodes and settings omitted
    };

    const result = await dbModule.importData(minimalData);
    assert.equal(result.mediaCount, 1);
    assert.equal(result.episodesCount, 0);

    const saved = await dbModule.getMediaById('movie_solo');
    assert.ok(saved);
    assert.equal(saved.title, 'Solo Movie');
  });

  it('should handle importBackupFile rejection on syntactically invalid JSON', async () => {
    // Mock a File-like object with corrupted content
    const corruptFile = {
      name: 'corrupt-backup.json',
      size: 25,
      content: '{ invalid json syntax !!!'
    };

    // Polyfill FileReader in global scope for importBackupFile
    globalThis.FileReader = class {
      readAsText(file) {
        setTimeout(() => {
          try {
            if (this.onload) {
              this.onload({ target: { result: file.content } });
            }
          } catch (e) {
            if (this.onerror) this.onerror(e);
          }
        }, 5);
      }
    };

    await assert.rejects(
      async () => await exportModule.importBackupFile(corruptFile),
      (err) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes('Failed to import backup'));
        return true;
      }
    );
  });

  it('should safely import backup with unexpected extra properties without database corruption', async () => {
    const payloadWithExtras = {
      app: 'BingeLog',
      version: 999, // future version
      unexpectedGlobalField: 'unexpected',
      media: [
        {
          id: 'media_extra_props',
          title: 'Extra Props Show',
          type: 'tv',
          customPluginData: { foo: 'bar' },
          extraUnknownArray: [1, 2, 3]
        }
      ],
      episodes: [
        {
          id: 'media_extra_props_S1E1',
          mediaId: 'media_extra_props',
          seasonNumber: 1,
          episodeNumber: 1,
          title: 'Ep 1',
          isWatched: 1,
          unrecognizedField: true
        }
      ]
    };

    const result = await dbModule.importData(payloadWithExtras);
    assert.equal(result.mediaCount, 1);
    assert.equal(result.episodesCount, 1);

    const media = await dbModule.getMediaById('media_extra_props');
    assert.ok(media);
    assert.equal(media.title, 'Extra Props Show');
    assert.equal(media.customPluginData.foo, 'bar');

    const eps = await dbModule.getEpisodesForMedia('media_extra_props');
    assert.equal(eps.length, 1);
    assert.equal(eps[0].isWatched, 1);
  });
});
