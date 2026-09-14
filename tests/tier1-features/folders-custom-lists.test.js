import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { getDbModule, resetDatabase } from '../helpers/setup.js';
import { mockTvShowItem, mockMovieItem } from '../helpers/fixtures.js';

describe('Tier 1: Issue #20 Folder & Custom List-based Organisation', () => {
  let dbModule;

  beforeEach(async () => {
    await resetDatabase();
    dbModule = await getDbModule();
  });

  it('should initialize with empty custom lists and allow creating and editing lists', async () => {
    const initialLists = await dbModule.getCustomLists();
    assert.deepEqual(initialLists, []);

    // Create a list
    const list1 = await dbModule.saveCustomList({
      name: 'Sci-Fi Favorites',
      color: '#3b82f6',
      description: 'Top sci-fi movies and shows'
    });

    assert.ok(list1.id);
    assert.equal(list1.name, 'Sci-Fi Favorites');
    assert.equal(list1.color, '#3b82f6');

    const listsAfter = await dbModule.getCustomLists();
    assert.equal(listsAfter.length, 1);
    assert.equal(listsAfter[0].name, 'Sci-Fi Favorites');

    // Edit the list name and color
    await dbModule.saveCustomList({
      id: list1.id,
      name: 'Sci-Fi & Cyberpunk',
      color: '#8b5cf6'
    });

    const updated = await dbModule.getCustomLists();
    assert.equal(updated.length, 1);
    assert.equal(updated[0].name, 'Sci-Fi & Cyberpunk');
    assert.equal(updated[0].color, '#8b5cf6');
  });

  it('should toggle and assign media items to custom lists', async () => {
    const media = await dbModule.saveMediaItem(mockMovieItem);
    assert.deepEqual(media.lists || [], []);

    // Add to 'Must Watch' list
    const lists1 = await dbModule.toggleMediaList(media.id, 'Must Watch');
    assert.deepEqual(lists1, ['Must Watch']);

    const retrieved1 = await dbModule.getMediaById(media.id);
    assert.deepEqual(retrieved1.lists, ['Must Watch']);

    // Add to another list 'Weekend Marathon'
    const lists2 = await dbModule.toggleMediaList(media.id, 'Weekend Marathon');
    assert.equal(lists2.length, 2);
    assert.ok(lists2.includes('Must Watch'));
    assert.ok(lists2.includes('Weekend Marathon'));

    // Toggle off 'Must Watch'
    const lists3 = await dbModule.toggleMediaList(media.id, 'Must Watch');
    assert.deepEqual(lists3, ['Weekend Marathon']);

    const retrieved3 = await dbModule.getMediaById(media.id);
    assert.deepEqual(retrieved3.lists, ['Weekend Marathon']);
  });

  it('should delete a custom list and strip it from all associated media items', async () => {
    const list = await dbModule.saveCustomList({ name: 'Comfort Shows' });
    const media1 = await dbModule.saveMediaItem({ ...mockTvShowItem, id: 'show_1' });
    const media2 = await dbModule.saveMediaItem({ ...mockMovieItem, id: 'movie_1' });

    await dbModule.toggleMediaList(media1.id, 'Comfort Shows');
    await dbModule.toggleMediaList(media1.id, 'Other List');
    await dbModule.toggleMediaList(media2.id, 'Comfort Shows');

    let check1 = await dbModule.getMediaById(media1.id);
    let check2 = await dbModule.getMediaById(media2.id);
    assert.ok(check1.lists.includes('Comfort Shows'));
    assert.ok(check2.lists.includes('Comfort Shows'));

    // Delete list
    await dbModule.deleteCustomList(list.id);

    const remainingLists = await dbModule.getCustomLists();
    assert.equal(remainingLists.length, 0);

    // Verify it was stripped from both media records
    check1 = await dbModule.getMediaById(media1.id);
    check2 = await dbModule.getMediaById(media2.id);
    assert.deepEqual(check1.lists, ['Other List']);
    assert.deepEqual(check2.lists, []);
  });

  it('should preserve custom lists and media item list tags during 3-tier backup export and restore', async () => {
    await dbModule.saveCustomList({ name: 'Anime Collection', color: '#ec4899' });
    const media = await dbModule.saveMediaItem({
      title: 'Death Note',
      type: 'tv',
      lists: ['Anime Collection']
    });

    // Export full backup
    const backup = await dbModule.exportAllData({ mode: 'full' });
    assert.ok(backup.settings.some(s => s.key === 'custom_lists'));
    assert.ok(backup.media.some(m => m.lists && m.lists.includes('Anime Collection')));

    // Wipe DB and restore
    await resetDatabase();
    dbModule = await getDbModule();
    const beforeRestore = await dbModule.getAllMedia();
    assert.equal(beforeRestore.length, 0);

    await dbModule.importData(backup, true);

    const restoredLists = await dbModule.getCustomLists();
    assert.equal(restoredLists.length, 1);
    assert.equal(restoredLists[0].name, 'Anime Collection');

    const restoredMedia = await dbModule.getMediaById(media.id);
    assert.ok(restoredMedia);
    assert.deepEqual(restoredMedia.lists, ['Anime Collection']);
  });
});
