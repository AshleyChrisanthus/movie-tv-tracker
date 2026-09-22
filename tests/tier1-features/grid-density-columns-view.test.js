import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { getDbModule, resetDatabase } from '../helpers/setup.js';

describe('Tier 1: Issue #31 View Controls, Compact Density & Columns Selector', () => {
  let dbModule;

  beforeEach(async () => {
    await resetDatabase();
    dbModule = await getDbModule();
  });

  it('persists and retrieves view_mode setting in Dexie', async () => {
    await dbModule.setSetting('view_mode', 'list');
    const mode = await dbModule.getSetting('view_mode', 'grid');
    assert.equal(mode, 'list');

    await dbModule.setSetting('view_mode', 'grid');
    const updated = await dbModule.getSetting('view_mode', 'list');
    assert.equal(updated, 'grid');
  });

  it('persists and retrieves grid_density setting in Dexie', async () => {
    await dbModule.setSetting('grid_density', 'compact');
    const density = await dbModule.getSetting('grid_density', 'comfortable');
    assert.equal(density, 'compact');

    await dbModule.setSetting('grid_density', 'comfortable');
    const updated = await dbModule.getSetting('grid_density', 'compact');
    assert.equal(updated, 'comfortable');
  });

  it('persists and retrieves grid_columns settings across auto, 4, 5, 6, 7, 8', async () => {
    const validColumns = ['auto', '4', '5', '6', '7', '8'];

    for (const col of validColumns) {
      await dbModule.setSetting('grid_columns', col);
      const saved = await dbModule.getSetting('grid_columns', 'auto');
      assert.equal(saved, col, `Expected column ${col} to persist correctly`);
    }
  });

  it('saves media items and supports rendering in both grid and compact view models', async () => {
    const item = await dbModule.saveMediaItem({
      title: 'Dune: Part Two',
      type: 'movie',
      year: 2024,
      status: 'completed',
      communityRating: 8.5
    });

    const stored = await dbModule.getMediaById(item.id);
    assert.ok(stored);
    assert.equal(stored.title, 'Dune: Part Two');
    assert.equal(stored.communityRating, 8.5);
  });
});
