import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { getDbModule, resetDatabase } from '../helpers/setup.js';
import { mockMovieItem, mockTvShowItem } from '../helpers/fixtures.js';

describe('Tier 1: Issue #47 Pinned Cards Section & Persistence', () => {
  let dbModule;

  beforeEach(async () => {
    await resetDatabase();
    dbModule = await getDbModule();
  });

  describe('Database Schema & CRUD Operations', () => {
    it('should save media items and default isPinned to false if omitted', async () => {
      const item = await dbModule.saveMediaItem(mockMovieItem);
      assert.ok(item);
      assert.equal(item.isPinned, false);
      assert.equal(item.pinnedAt, undefined);

      const retrieved = await dbModule.getMediaById(item.id);
      assert.equal(retrieved.isPinned, false);
    });

    it('should preserve isPinned and pinnedAt when provided to saveMediaItem', async () => {
      const pinDate = '2026-10-18T00:00:00.000Z';
      const item = await dbModule.saveMediaItem({
        ...mockMovieItem,
        isPinned: true,
        pinnedAt: pinDate
      });
      assert.equal(item.isPinned, true);
      assert.equal(item.pinnedAt, pinDate);

      const retrieved = await dbModule.getMediaById(item.id);
      assert.equal(retrieved.isPinned, true);
      assert.equal(retrieved.pinnedAt, pinDate);
    });

    it('should toggle media pinned state from unpinned to pinned', async () => {
      const item = await dbModule.saveMediaItem(mockMovieItem);
      const isPinned = await dbModule.toggleMediaPinned(item.id);

      assert.equal(isPinned, true);
      const updated = await dbModule.getMediaById(item.id);
      assert.equal(updated.isPinned, true);
      assert.ok(updated.pinnedAt);
      assert.ok(new Date(updated.pinnedAt).getTime() > 0);
    });

    it('should toggle media pinned state from pinned to unpinned', async () => {
      const item = await dbModule.saveMediaItem({
        ...mockMovieItem,
        isPinned: true,
        pinnedAt: '2026-10-18T00:00:00.000Z'
      });

      const isPinned = await dbModule.toggleMediaPinned(item.id);
      assert.equal(isPinned, false);

      const updated = await dbModule.getMediaById(item.id);
      assert.equal(updated.isPinned, false);
      assert.equal(updated.pinnedAt, undefined);
    });

    it('should throw an error when toggling pinned on non-existent media id', async () => {
      await assert.rejects(
        () => dbModule.toggleMediaPinned('non_existent_id'),
        /MediaItem with id "non_existent_id" not found/
      );
    });

    it('should retrieve all pinned media items sorted by pinnedAt descending', async () => {
      const movie1 = await dbModule.saveMediaItem({
        ...mockMovieItem,
        id: 'media_pin_1',
        externalId: 551,
        title: 'Movie 1',
        isPinned: true,
        pinnedAt: '2026-10-17T10:00:00.000Z'
      });

      const movie2 = await dbModule.saveMediaItem({
        ...mockMovieItem,
        id: 'media_pin_2',
        externalId: 552,
        title: 'Movie 2',
        isPinned: true,
        pinnedAt: '2026-10-17T12:00:00.000Z'
      });

      const movie3 = await dbModule.saveMediaItem({
        ...mockMovieItem,
        id: 'media_pin_3',
        externalId: 553,
        title: 'Movie 3',
        isPinned: false
      });

      const pinned = await dbModule.getPinnedMedia();
      assert.equal(pinned.length, 2);
      assert.equal(pinned[0].id, 'media_pin_2'); // More recent pin date first
      assert.equal(pinned[1].id, 'media_pin_1');
    });

    it('should unpin all pinned media items via unpinAllMedia', async () => {
      await dbModule.saveMediaItem({
        ...mockMovieItem,
        id: 'media_pin_1',
        externalId: 551,
        title: 'Movie 1',
        isPinned: true,
        pinnedAt: '2026-10-17T10:00:00.000Z'
      });
      await dbModule.saveMediaItem({
        ...mockMovieItem,
        id: 'media_pin_2',
        externalId: 552,
        title: 'Movie 2',
        isPinned: true,
        pinnedAt: '2026-10-17T12:00:00.000Z'
      });

      const count = await dbModule.unpinAllMedia();
      assert.equal(count, 2);

      const pinned = await dbModule.getPinnedMedia();
      assert.equal(pinned.length, 0);
    });

    it('should preserve isPinned status during partial updates (status, ratings, episodes)', async () => {
      const item = await dbModule.saveMediaItem({
        ...mockMovieItem,
        isPinned: true,
        pinnedAt: '2026-10-17T10:00:00.000Z'
      });

      await dbModule.updateMediaStatus(item.id, 'completed');
      let current = await dbModule.getMediaById(item.id);
      assert.equal(current.status, 'completed');
      assert.equal(current.isPinned, true);
      assert.equal(current.pinnedAt, '2026-10-17T10:00:00.000Z');

      await dbModule.updateMediaRatingAndNotes(item.id, 9.5, 'Masterpiece');
      current = await dbModule.getMediaById(item.id);
      assert.equal(current.rating, 9.5);
      assert.equal(current.isPinned, true);
      assert.equal(current.pinnedAt, '2026-10-17T10:00:00.000Z');
    });
  });

  describe('Backup & Restore Persistence', () => {
    it('should export and restore isPinned and pinnedAt across backup modes', async () => {
      const pinnedShow = await dbModule.saveMediaItem({
        ...mockTvShowItem,
        id: 'show_pin_backup',
        title: 'Pinned Show',
        isPinned: true,
        pinnedAt: '2026-10-17T14:00:00.000Z'
      });

      const unpinnedMovie = await dbModule.saveMediaItem({
        ...mockMovieItem,
        id: 'movie_unpin_backup',
        title: 'Unpinned Movie',
        isPinned: false
      });

      // Export full backup
      const backup = await dbModule.exportAllData({ mode: 'full' });
      assert.ok(backup);
      const exportedPinned = backup.media.find(m => m.id === 'show_pin_backup');
      assert.ok(exportedPinned);
      assert.equal(exportedPinned.isPinned, true);
      assert.equal(exportedPinned.pinnedAt, '2026-10-17T14:00:00.000Z');

      // Clear DB and restore
      await resetDatabase();
      const freshDb = await getDbModule();
      await freshDb.importData(backup, true);

      const restoredPinned = await freshDb.getMediaById('show_pin_backup');
      assert.ok(restoredPinned);
      assert.equal(restoredPinned.isPinned, true);
      assert.equal(restoredPinned.pinnedAt, '2026-10-17T14:00:00.000Z');

      const restoredUnpinned = await freshDb.getMediaById('movie_unpin_backup');
      assert.ok(restoredUnpinned);
      assert.equal(Boolean(restoredUnpinned.isPinned), false);
    });
  });

  describe('Pin Button Card Visibility (Always Visible without Hover)', () => {
    it('MediaCard source should keep pin button visible all the time (opacity-100)', async () => {
      const fs = await import('fs');
      const cardSource = fs.readFileSync('src/components/MediaCard.tsx', 'utf8');

      // Assert that unpinned button does not use opacity-0 or group-hover:opacity-100 to hide
      assert.ok(
        !cardSource.includes('opacity-0 group-hover:opacity-100'),
        'Pin button must not be hidden with opacity-0 group-hover:opacity-100'
      );
      assert.ok(
        cardSource.includes("item.isPinned\n                  ? 'opacity-100 bg-[var(--accent)] text-white") ||
        cardSource.includes("item.isPinned ? 'opacity-100 bg-[var(--accent)] text-white") ||
        cardSource.includes("opacity-100 bg-black/50 hover:bg-black/80"),
        'Pin button must have opacity-100 and remain visible all the time'
      );
    });
  });
});
