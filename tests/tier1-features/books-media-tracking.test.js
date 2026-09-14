import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { getDbModule, resetDatabase } from '../helpers/setup.js';

describe('Tier 1: Issue #22 Books as 3rd Media Type & Reading Progress', () => {
  let dbModule;

  beforeEach(async () => {
    await resetDatabase();
    dbModule = await getDbModule();
  });

  it('should save a book item with author, totalPages, and currentPage', async () => {
    const book = await dbModule.saveMediaItem({
      title: 'Project Hail Mary',
      type: 'book',
      author: 'Andy Weir',
      year: '2021',
      totalPages: 496,
      currentPage: 0,
      isbn: '9780593135204',
      status: 'plan_to_watch'
    });

    assert.ok(book.id);
    assert.equal(book.type, 'book');
    assert.equal(book.title, 'Project Hail Mary');
    assert.equal(book.author, 'Andy Weir');
    assert.equal(book.totalPages, 496);
    assert.equal(book.currentPage, 0);
    assert.equal(book.isbn, '9780593135204');
    assert.equal(book.status, 'plan_to_watch');

    const retrieved = await dbModule.getMediaById(book.id);
    assert.ok(retrieved);
    assert.equal(retrieved.type, 'book');
    assert.equal(retrieved.author, 'Andy Weir');
    assert.equal(retrieved.totalPages, 496);
  });

  it('should auto-transition status to watching or completed based on page count on save', async () => {
    // 1. Partial progress -> watching
    const readingBook = await dbModule.saveMediaItem({
      title: 'Dune',
      type: 'book',
      author: 'Frank Herbert',
      totalPages: 600,
      currentPage: 150
    });
    assert.equal(readingBook.status, 'watching');
    assert.equal(readingBook.watchedEpisodesCount, 150);

    // 2. Full progress -> completed
    const finishedBook = await dbModule.saveMediaItem({
      title: 'The Hobbit',
      type: 'book',
      author: 'J.R.R. Tolkien',
      totalPages: 310,
      currentPage: 310
    });
    assert.equal(finishedBook.status, 'completed');
    assert.equal(finishedBook.watchedEpisodesCount, 310);
  });

  it('should update reading progress with updateBookProgress and transition status', async () => {
    const book = await dbModule.saveMediaItem({
      title: 'Neuromancer',
      type: 'book',
      author: 'William Gibson',
      totalPages: 271,
      currentPage: 0,
      status: 'plan_to_watch'
    });

    // Start reading: set page to 50
    const step1 = await dbModule.updateBookProgress(book.id, 50);
    assert.ok(step1);
    assert.equal(step1.currentPage, 50);
    assert.equal(step1.watchedEpisodesCount, 50);
    assert.equal(step1.status, 'watching');

    // Continue reading: set page to 271 (finished)
    const step2 = await dbModule.updateBookProgress(book.id, 271);
    assert.ok(step2);
    assert.equal(step2.currentPage, 271);
    assert.equal(step2.watchedEpisodesCount, 271);
    assert.equal(step2.status, 'completed');

    // Clamping test: should not exceed totalPages
    const clamped = await dbModule.updateBookProgress(book.id, 500);
    assert.ok(clamped);
    assert.equal(clamped.currentPage, 271);

    // Clamping test: should not go below 0
    const clampedZero = await dbModule.updateBookProgress(book.id, -10);
    assert.ok(clampedZero);
    assert.equal(clampedZero.currentPage, 0);
  });

  it('should deduplicate books when re-adding the same title and type', async () => {
    const first = await dbModule.saveMediaItem({
      title: '1984',
      type: 'book',
      author: 'George Orwell',
      totalPages: 328
    });

    const second = await dbModule.saveMediaItem({
      title: '1984',
      type: 'book',
      author: 'George Orwell',
      totalPages: 328,
      notes: 'New notes'
    });

    assert.equal(second.id, first.id);
    const all = await dbModule.getAllMedia();
    const books = all.filter(m => m.type === 'book');
    assert.equal(books.length, 1);
  });

  it('should export and restore books seamlessly across backup tiers', async () => {
    await dbModule.saveMediaItem({
      title: 'Foundation',
      type: 'book',
      author: 'Isaac Asimov',
      totalPages: 255,
      currentPage: 120,
      isbn: '9780553293357',
      lists: ['Classic Sci-Fi']
    });

    // 1. Test full export
    const backupFull = await dbModule.exportAllData({ mode: 'full' });
    assert.ok(backupFull.media.some(m => m.type === 'book' && m.title === 'Foundation'));
    const bookEntry = backupFull.media.find(m => m.title === 'Foundation');
    assert.equal(bookEntry.author, 'Isaac Asimov');
    assert.equal(bookEntry.totalPages, 255);
    assert.equal(bookEntry.currentPage, 120);
    assert.equal(bookEntry.isbn, '9780553293357');
    assert.deepEqual(bookEntry.lists, ['Classic Sci-Fi']);

    // 2. Wipe and restore
    await resetDatabase();
    dbModule = await getDbModule();
    assert.equal((await dbModule.getAllMedia()).length, 0);

    await dbModule.importData(backupFull, true);
    const restored = await dbModule.getAllMedia();
    assert.equal(restored.length, 1);
    assert.equal(restored[0].type, 'book');
    assert.equal(restored[0].author, 'Isaac Asimov');
    assert.equal(restored[0].currentPage, 120);
    assert.equal(restored[0].totalPages, 255);
    assert.deepEqual(restored[0].lists, ['Classic Sci-Fi']);
  });

  it('should support chapter-based tracking and status transitions', async () => {
    const book = await dbModule.saveMediaItem({
      title: 'The Way of Kings',
      type: 'book',
      author: 'Brandon Sanderson',
      progressMode: 'chapters',
      totalChapters: 75,
      currentChapter: 0,
      status: 'plan_to_watch'
    });

    assert.equal(book.progressMode, 'chapters');
    assert.equal(book.totalChapters, 75);
    assert.equal(book.currentChapter, 0);

    // Read chapter 10
    const step1 = await dbModule.updateBookProgress(book.id, {
      currentChapter: 10,
      progressMode: 'chapters'
    });
    assert.equal(step1.currentChapter, 10);
    assert.equal(step1.watchedEpisodesCount, 10);
    assert.equal(step1.status, 'watching');

    // Read to chapter 75 (finish book)
    const step2 = await dbModule.updateBookProgress(book.id, {
      currentChapter: 75,
      progressMode: 'chapters'
    });
    assert.equal(step2.currentChapter, 75);
    assert.equal(step2.watchedEpisodesCount, 75);
    assert.equal(step2.status, 'completed');
  });

  it('should allow editing totalPages and totalChapters dynamically', async () => {
    const book = await dbModule.saveMediaItem({
      title: 'Mistborn: The Final Empire',
      type: 'book',
      author: 'Brandon Sanderson',
      totalPages: 541, // Median from open library
      currentPage: 50
    });

    // User has a different edition with 672 pages and edits totalPages
    const updated = await dbModule.updateBookProgress(book.id, {
      totalPages: 672,
      currentPage: 100
    });

    assert.equal(updated.totalPages, 672);
    assert.equal(updated.totalEpisodes, 672);
    assert.equal(updated.currentPage, 100);
    assert.equal(updated.watchedEpisodesCount, 100);
    assert.equal(updated.status, 'watching');

    // Switch to chapters mode with custom chapter total
    const chaptersUpdated = await dbModule.updateBookProgress(book.id, {
      progressMode: 'chapters',
      totalChapters: 38,
      currentChapter: 5
    });

    assert.equal(chaptersUpdated.progressMode, 'chapters');
    assert.equal(chaptersUpdated.totalChapters, 38);
    assert.equal(chaptersUpdated.totalEpisodes, 38);
    assert.equal(chaptersUpdated.currentChapter, 5);
    assert.equal(chaptersUpdated.watchedEpisodesCount, 5);
  });
});
