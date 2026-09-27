import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { getApiModule, getDbModule, getAudioDurationModule, resetDatabase, mockFetch, restoreFetch } from '../helpers/setup.js';

describe('Tier 1: Issue #38 - Audiobooks Tracking, Listening Progress & iTunes Search', () => {
  let apiModule;
  let dbModule;
  let audioModule;

  beforeEach(async () => {
    restoreFetch();
    await resetDatabase();
    apiModule = await getApiModule();
    dbModule = await getDbModule();
    audioModule = await getAudioDurationModule();
  });

  // =========================================================================
  // 1. Audio Duration & Narrator Utility Functions
  // =========================================================================
  describe('Audio Duration & Metadata Helpers', () => {
    it('should parse human duration strings into total seconds', () => {
      assert.equal(audioModule.parseAudioDuration('8 hours 41 minutes'), 8 * 3600 + 41 * 60);
      assert.equal(audioModule.parseAudioDuration('12h 30m'), 12 * 3600 + 30 * 60);
      assert.equal(audioModule.parseAudioDuration('45m'), 45 * 60);
      assert.equal(audioModule.parseAudioDuration('2 hours'), 2 * 3600);
      assert.equal(audioModule.parseAudioDuration('1 hr, 15 min'), 1 * 3600 + 15 * 60);
      assert.equal(audioModule.parseAudioDuration('01:30:00'), 1 * 3600 + 30 * 60);
      assert.equal(audioModule.parseAudioDuration(7200), 7200);
      assert.equal(audioModule.parseAudioDuration(null), 0);
    });

    it('should format seconds into clean hours and minutes strings', () => {
      assert.equal(audioModule.formatAudioDuration(8 * 3600 + 41 * 60), '8h 41m');
      assert.equal(audioModule.formatAudioDuration(3600), '1h 0m');
      assert.equal(audioModule.formatAudioDuration(45 * 60), '45m');
      assert.equal(audioModule.formatAudioDuration(0), '0m');
      assert.equal(audioModule.formatAudioDuration(undefined), '0m');
    });

    it('should format listening progress string', () => {
      const current = 2 * 3600 + 15 * 60;
      const total = 8 * 3600 + 40 * 60;
      assert.equal(audioModule.formatAudioProgress(current, total), '2h 15m of 8h 40m');
      assert.equal(audioModule.formatAudioProgress(current, 0), '2h 15m');
    });

    it('should convert between hours/minutes and seconds bidirectionally', () => {
      const sec = audioModule.hoursMinutesToSeconds(5, 35);
      assert.equal(sec, 5 * 3600 + 35 * 60);
      const hm = audioModule.secondsToHoursMinutes(sec);
      assert.deepEqual(hm, { hours: 5, minutes: 35 });
    });

    it('should extract narrator names from descriptions and credit strings', () => {
      assert.equal(audioModule.extractNarrator('Narrated by Stephen Fry for Pottermore'), 'Stephen Fry');
      assert.equal(audioModule.extractNarrator('Read by Michael Kramer and Kate Reading'), 'Michael Kramer and Kate Reading');
      assert.equal(audioModule.extractNarrator('Performed by Jim Dale'), 'Jim Dale');
      assert.equal(audioModule.extractNarrator('Just a normal book overview with no narrator mention'), undefined);
    });

    it('should accurately detect audiobook items', () => {
      assert.equal(audioModule.isAudiobookItem({ type: 'book', bookFormat: 'Audiobook' }), true);
      assert.equal(audioModule.isAudiobookItem({ type: 'book', totalDurationSeconds: 15000 }), true);
      assert.equal(audioModule.isAudiobookItem({ type: 'book', narrator: 'Stephen Fry' }), true);
      assert.equal(audioModule.isAudiobookItem({ type: 'book', bookFormat: 'Paperback', totalPages: 350 }), false);
      assert.equal(audioModule.isAudiobookItem({ type: 'tv', title: 'TV Show' }), false);
    });
  });

  // =========================================================================
  // 2. Database Audio Progress Tracking
  // =========================================================================
  describe('Database Audio Progress Tracking', () => {
    it('should save an audiobook and default progressMode to time', async () => {
      const totalSec = 10 * 3600 + 30 * 60; // 10h 30m
      const audiobook = await dbModule.saveMediaItem({
        title: 'Project Hail Mary',
        type: 'book',
        bookFormat: 'Audiobook',
        author: 'Andy Weir',
        narrator: 'Ray Porter',
        totalDurationSeconds: totalSec,
        currentDurationSeconds: 0,
        status: 'plan_to_watch'
      });

      assert.ok(audiobook.id);
      assert.equal(audiobook.progressMode, 'time');
      assert.equal(audiobook.narrator, 'Ray Porter');
      assert.equal(audiobook.totalDurationSeconds, totalSec);
      assert.equal(audiobook.currentDurationSeconds, 0);
    });

    it('should advance listening progress and update status from plan_to_watch to watching', async () => {
      const totalSec = 8 * 3600; // 8 hours
      const audiobook = await dbModule.saveMediaItem({
        title: 'The Way of Kings (Audiobook)',
        type: 'book',
        bookFormat: 'Audiobook',
        author: 'Brandon Sanderson',
        narrator: 'Michael Kramer',
        totalDurationSeconds: totalSec,
        currentDurationSeconds: 0,
        status: 'plan_to_watch'
      });

      // Advance by 1 hour (3600s)
      const updated = await dbModule.updateBookProgress(audiobook.id, {
        currentDurationSeconds: 3600,
        progressMode: 'time'
      });

      assert.ok(updated);
      assert.equal(updated.currentDurationSeconds, 3600);
      assert.equal(updated.status, 'watching');
      assert.equal(updated.watchedEpisodesCount, 60); // 60 minutes watched
    });

    it('should update listening progress by direct percentage', async () => {
      const totalSec = 10 * 3600; // 10 hours = 36000s
      const audiobook = await dbModule.saveMediaItem({
        title: 'Atomic Habits',
        type: 'book',
        bookFormat: 'Audiobook',
        totalDurationSeconds: totalSec,
        currentDurationSeconds: 0,
        status: 'plan_to_watch'
      });

      // Set to 50%
      const p50 = await dbModule.updateBookProgress(audiobook.id, {
        percentage: 50,
        progressMode: 'time'
      });

      assert.ok(p50);
      assert.equal(p50.currentDurationSeconds, 18000); // 5 hours
      assert.equal(p50.status, 'watching');

      // Set to 100% -> should auto complete
      const p100 = await dbModule.updateBookProgress(audiobook.id, {
        percentage: 100,
        progressMode: 'time'
      });

      assert.ok(p100);
      assert.equal(p100.currentDurationSeconds, 36000);
      assert.equal(p100.status, 'completed');
    });
  });

  // =========================================================================
  // 3. Proportional Edition Switching with Audiobooks
  // =========================================================================
  describe('Proportional Edition Switching between Books & Audiobooks', () => {
    it('should scale progress proportionally when switching from paperback to audiobook', async () => {
      // Create paperback book with 400 pages, currently at page 200 (50% progress)
      const book = await dbModule.saveMediaItem({
        title: 'Harry Potter and the Sorcerer Stone',
        type: 'book',
        bookFormat: 'Paperback',
        totalPages: 400,
        currentPage: 200,
        progressMode: 'pages',
        status: 'watching'
      });

      // Switch to 8-hour audiobook edition (28,800 seconds)
      const audioSec = 8 * 3600;
      const switched = await dbModule.changeBookEdition(book.id, {
        bookFormat: 'Audiobook',
        narrator: 'Jim Dale',
        totalDurationSeconds: audioSec,
        editionId: 'OL_AUDIO_1'
      });

      assert.ok(switched);
      assert.equal(switched.bookFormat, 'Audiobook');
      assert.equal(switched.narrator, 'Jim Dale');
      assert.equal(switched.progressMode, 'time');
      assert.equal(switched.totalDurationSeconds, audioSec);
      // Exactly 50% of 28,800 seconds is 14,400 seconds (4 hours)
      assert.equal(switched.currentDurationSeconds, 14400);
      assert.equal(switched.status, 'watching');
    });

    it('should scale progress proportionally when switching from audiobook back to paperback', async () => {
      // Audiobook 10 hours (36,000s), currently 7.5 hours listened (27,000s = 75%)
      const audiobook = await dbModule.saveMediaItem({
        title: 'Project Hail Mary',
        type: 'book',
        bookFormat: 'Audiobook',
        totalDurationSeconds: 36000,
        currentDurationSeconds: 27000,
        progressMode: 'time',
        status: 'watching'
      });

      // Switch to paperback with 500 pages
      const switched = await dbModule.changeBookEdition(audiobook.id, {
        bookFormat: 'Paperback',
        totalPages: 500,
        editionId: 'OL_BOOK_2'
      });

      assert.ok(switched);
      assert.equal(switched.bookFormat, 'Paperback');
      assert.equal(switched.progressMode, 'pages');
      assert.equal(switched.totalPages, 500);
      // 75% of 500 pages is 375 pages
      assert.equal(switched.currentPage, 375);
    });
  });

  // =========================================================================
  // 4. iTunes Audiobook Search Provider
  // =========================================================================
  describe('iTunes Audiobooks Search API Integration', () => {
    it('should search iTunes audiobooks and normalize results', async () => {
      mockFetch((url) => {
        if (url.includes('itunes.apple.com/search') && url.includes('audiobook')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              resultCount: 1,
              results: [
                {
                  wrapperType: 'audiobook',
                  artistId: 1234,
                  collectionId: 998877,
                  trackId: 998877,
                  artistName: 'Andy Weir',
                  collectionName: 'Project Hail Mary (Unabridged)',
                  artworkUrl100: 'https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/cover/100x100bb.jpg',
                  releaseDate: '2021-05-04T07:00:00Z',
                  primaryGenreName: 'Sci-Fi & Fantasy',
                  description: 'Narrated by Ray Porter.<br/>A lone astronaut must save the earth.',
                  previewUrl: 'https://audio-ssl.itunes.apple.com/preview.m4a',
                  trackTimeMillis: 57900000 // 16h 5m in ms
                }
              ]
            })
          };
        }
        return { ok: true, status: 200, json: async () => ({ resultCount: 0, results: [] }) };
      });

      const results = await apiModule.searchITunesAudiobooks('Project Hail Mary');
      assert.equal(results.length, 1);
      const item = results[0];
      assert.equal(item.title, 'Project Hail Mary (Unabridged)');
      assert.equal(item.author, 'Andy Weir');
      assert.equal(item.narrator, 'Ray Porter');
      assert.equal(item.bookFormat, 'Audiobook');
      assert.equal(item.totalDurationSeconds, 57900);
      assert.equal(item.audioPreviewUrl, 'https://audio-ssl.itunes.apple.com/preview.m4a');
      assert.ok(item.posterUrl.includes('600x600bb.jpg'));
    });

    it('should route searchMedia to audiobooks when bookProvider is audiobooks', async () => {
      mockFetch((url) => {
        if (url.includes('itunes.apple.com/search') && url.includes('audiobook')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              resultCount: 1,
              results: [
                {
                  collectionId: 554433,
                  artistName: 'Stephen King',
                  collectionName: 'The Shining (Audiobook)',
                  artworkUrl100: 'https://is1-ssl.mzstatic.com/image/thumb/100x100bb.jpg',
                  description: 'Narrated by Campbell Scott.',
                  trackTimeMillis: 57600000
                }
              ]
            })
          };
        }
        return { ok: true, status: 200, json: async () => ({ resultCount: 0, results: [] }) };
      });

      const results = await apiModule.searchMedia('The Shining', {
        typeFilter: 'book',
        bookProvider: 'audiobooks'
      });

      assert.equal(results.length, 1);
      assert.equal(results[0].title, 'The Shining (Audiobook)');
      assert.equal(results[0].narrator, 'Campbell Scott');
      assert.equal(results[0].bookFormat, 'Audiobook');
    });
  });
});
