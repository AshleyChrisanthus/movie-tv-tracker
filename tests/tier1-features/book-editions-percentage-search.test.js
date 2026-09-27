import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { getApiModule, getDbModule, resetDatabase, mockFetch, restoreFetch } from '../helpers/setup.js';

describe('Tier 1: Issues #25, #26, #27 - Book Editions, Percentage Progress & Multi-Source Search', () => {
  let apiModule;
  let dbModule;

  beforeEach(async () => {
    restoreFetch();
    await resetDatabase();
    apiModule = await getApiModule();
    dbModule = await getDbModule();
  });

  // =========================================================================
  // ISSUE #26: Direct Percentage Progress Input for Books
  // =========================================================================
  describe('Issue #26: Direct Percentage Progress Input', () => {
    it('should set reading progress based on percentage in pages mode', async () => {
      const book = await dbModule.saveMediaItem({
        title: 'Dune',
        type: 'book',
        author: 'Frank Herbert',
        totalPages: 600,
        currentPage: 0,
        progressMode: 'pages',
        status: 'plan_to_watch'
      });

      // 1. Set 50% on 600 pages -> page 300, status watching
      const p50 = await dbModule.updateBookProgress(book.id, {
        percentage: 50,
        progressMode: 'pages'
      });
      assert.ok(p50);
      assert.equal(p50.currentPage, 300);
      assert.equal(p50.watchedEpisodesCount, 300);
      assert.equal(p50.status, 'watching');

      // 2. Set 25% on 600 pages -> page 150
      const p25 = await dbModule.updateBookProgress(book.id, {
        percentage: 25,
        progressMode: 'pages'
      });
      assert.ok(p25);
      assert.equal(p25.currentPage, 150);

      // 3. Set 75% on 600 pages -> page 450
      const p75 = await dbModule.updateBookProgress(book.id, {
        percentage: 75,
        progressMode: 'pages'
      });
      assert.ok(p75);
      assert.equal(p75.currentPage, 450);
    });

    it('should set reading progress based on percentage in chapters mode', async () => {
      const book = await dbModule.saveMediaItem({
        title: 'The Hobbit',
        type: 'book',
        author: 'J.R.R. Tolkien',
        totalChapters: 19,
        currentChapter: 0,
        progressMode: 'chapters',
        status: 'plan_to_watch'
      });

      // Set 50% on 19 chapters -> Math.round(19 * 0.5) = 10
      const p50 = await dbModule.updateBookProgress(book.id, {
        percentage: 50,
        progressMode: 'chapters'
      });
      assert.ok(p50);
      assert.equal(p50.currentChapter, 10);
      assert.equal(p50.watchedEpisodesCount, 10);
      assert.equal(p50.status, 'watching');
    });

    it('should mark book as completed when entering 100% in either mode', async () => {
      const book = await dbModule.saveMediaItem({
        title: 'Project Hail Mary',
        type: 'book',
        author: 'Andy Weir',
        totalPages: 496,
        totalChapters: 30,
        currentPage: 100,
        currentChapter: 6,
        progressMode: 'pages',
        status: 'watching'
      });

      // Set 100% in pages mode
      const finished = await dbModule.updateBookProgress(book.id, {
        percentage: 100,
        progressMode: 'pages'
      });
      assert.ok(finished);
      assert.equal(finished.status, 'completed');
      assert.equal(finished.currentPage, 496);
      assert.equal(finished.currentChapter, 30);
    });

    it('should clamp percentage safely and handle 0/unset totals without crashing', async () => {
      const bookNoTotal = await dbModule.saveMediaItem({
        title: 'Mysterious Manuscript',
        type: 'book',
        author: 'Anonymous',
        status: 'plan_to_watch'
      });

      // No total pages or chapters set -> setting percentage should not crash or produce NaN
      const res = await dbModule.updateBookProgress(bookNoTotal.id, {
        percentage: 50,
        progressMode: 'pages'
      });
      assert.ok(res);
      assert.equal(res.currentPage, 0);

      // Percentage clamping: values > 100 should clamp to total
      const bookWithPages = await dbModule.saveMediaItem({
        title: 'Short Story',
        type: 'book',
        totalPages: 100,
        currentPage: 0
      });
      const overclamped = await dbModule.updateBookProgress(bookWithPages.id, {
        percentage: 180
      });
      assert.equal(overclamped.currentPage, 100);
      assert.equal(overclamped.status, 'completed');

      // Percentage clamping: negative values clamp to 0
      const underclamped = await dbModule.updateBookProgress(bookWithPages.id, {
        percentage: -25
      });
      assert.equal(underclamped.currentPage, 0);
    });
  });

  // =========================================================================
  // ISSUE #25: Book Editions & Synopsis Enrichment
  // =========================================================================
  describe('Issue #25: Book Editions & Synopsis Enrichment', () => {
    it('should switch editions and recalculate reading page while preserving percentage', async () => {
      // User has Paperback edition with 300 pages, currently at page 150 (exactly 50%)
      const originalBook = await dbModule.saveMediaItem({
        title: 'Neuromancer',
        type: 'book',
        author: 'William Gibson',
        totalPages: 300,
        currentPage: 150,
        isbn: '9780441569595',
        bookFormat: 'Paperback',
        publisher: 'Ace Books',
        year: '1984',
        status: 'watching'
      });

      // User switches to Hardcover / 20th Anniversary Edition with 450 pages
      const switched = await dbModule.changeBookEdition(originalBook.id, {
        totalPages: 450,
        isbn: '9780441012039',
        bookFormat: 'Hardcover',
        publisher: 'Penguin Publishing',
        year: '2004',
        editionId: 'OL12345M',
        posterUrl: 'https://covers.openlibrary.org/b/id/12345-M.jpg'
      });

      assert.ok(switched);
      // 50% of 450 pages is 225 pages!
      assert.equal(switched.totalPages, 450);
      assert.equal(switched.currentPage, 225);
      assert.equal(switched.watchedEpisodesCount, 225);
      assert.equal(switched.bookFormat, 'Hardcover');
      assert.equal(switched.publisher, 'Penguin Publishing');
      assert.equal(switched.year, '2004');
      assert.equal(switched.isbn, '9780441012039');
      assert.equal(switched.posterUrl, 'https://covers.openlibrary.org/b/id/12345-M.jpg');
      assert.equal(switched.status, 'watching');
    });

    it('should parse Open Library editions response accurately', async () => {
      mockFetch(async (url) => {
        if (url.includes('/works/OL45804W/editions.json')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              size: 2,
              entries: [
                {
                  key: '/books/OL7353617M',
                  title: 'Fantastic Mr. Fox (Paperback)',
                  publishers: ['Puffin'],
                  publish_date: 'May 2002',
                  number_of_pages: 96,
                  physical_format: 'Paperback',
                  isbn_13: ['9780141301136'],
                  covers: [1029384]
                },
                {
                  key: '/books/OL9999999M',
                  title: 'Fantastic Mr. Fox (Hardcover)',
                  publishers: ['George Allen & Unwin'],
                  publish_date: '1970',
                  number_of_pages: 110,
                  physical_format: 'Hardcover',
                  isbn_10: ['0048230983'],
                  covers: [9876543]
                }
              ]
            })
          };
        }
        return { ok: false, status: 404 };
      });

      const editions = await apiModule.fetchOpenLibraryEditions('OL45804W', 10);
      assert.equal(editions.length, 2);

      const pb = editions.find(e => e.id === 'OL7353617M');
      assert.ok(pb);
      assert.equal(pb.title, 'Fantastic Mr. Fox (Paperback)');
      assert.equal(pb.totalPages, 96);
      assert.equal(pb.physicalFormat, 'Paperback');
      assert.equal(pb.isbn, '9780141301136');
      assert.equal(pb.coverUrl, 'https://covers.openlibrary.org/b/id/1029384-M.jpg');
      assert.equal(pb.year, '2002');
    });

    it('should enrich book synopsis from Google Books and Open Library fallback', async () => {
      mockFetch(async (url) => {
        if (url.includes('googleapis.com/books/v1/volumes') && url.includes('isbn:9780593135204')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              totalItems: 1,
              items: [
                {
                  volumeInfo: {
                    title: 'Project Hail Mary',
                    description: '<p>A lone astronaut must save the earth from disaster in this exhilarating new adventure.</p>',
                    categories: ['Science Fiction', 'Space Exploration'],
                    averageRating: 4.6,
                    ratingsCount: 3500
                  }
                }
              ]
            })
          };
        }
        return { ok: false, status: 404 };
      });

      const enriched = await apiModule.enrichBookSynopsis({
        isbn: '9780593135204',
        title: 'Project Hail Mary',
        author: 'Andy Weir'
      });

      assert.ok(enriched);
      assert.ok(enriched.overview.includes('A lone astronaut must save the earth'));
      // HTML tags stripped
      assert.ok(!enriched.overview.includes('<p>'));
      assert.deepEqual(enriched.genres, ['Science Fiction', 'Space Exploration']);
      assert.equal(enriched.communityRating, 9.2); // (4.6 * 2)
      assert.equal(enriched.communityRatingCount, 3500);
    });

    it('should lookup specific book edition directly by ISBN via Open Library or Google Books fallback', async () => {
      mockFetch(async (url) => {
        if (url.includes('openlibrary.org/isbn/9780441172719.json')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              key: '/books/OL22597282M',
              title: 'Dune (Special Ace Edition)',
              publishers: ['Ace Books'],
              publish_date: '1990',
              number_of_pages: 535,
              isbn_10: ['0441172717'],
              isbn_13: ['9780441172719'],
              physical_format: 'Paperback',
              covers: [15166231]
            })
          };
        }
        return { ok: false, status: 404 };
      });

      const edition = await apiModule.fetchBookEditionByIsbn('978-0441172719');
      assert.ok(edition);
      assert.equal(edition.id, 'OL22597282M');
      assert.equal(edition.title, 'Dune (Special Ace Edition)');
      assert.equal(edition.totalPages, 535);
      assert.equal(edition.isbn, '9780441172719');
      assert.equal(edition.physicalFormat, 'Paperback');
      assert.equal(edition.publishers[0], 'Ace Books');
      assert.equal(edition.coverUrl, 'https://covers.openlibrary.org/b/id/15166231-M.jpg');

      // Test invalid ISBN format returns null without making network calls
      const invalid = await apiModule.fetchBookEditionByIsbn('not-an-isbn');
      assert.equal(invalid, null);
    });
  });

  // =========================================================================
  // ISSUE #27: Multi-Source Book Search & Settings
  // =========================================================================
  describe('Issue #27: Multi-Source Book Search & Fallback', () => {
    it('should persist and retrieve default book provider setting', async () => {
      // Default should be openlibrary
      const initial = await dbModule.getSetting('default_book_provider', 'openlibrary');
      assert.equal(initial, 'openlibrary');

      // Change to googlebooks
      await dbModule.setSetting('default_book_provider', 'googlebooks');
      const updated = await dbModule.getSetting('default_book_provider', 'openlibrary');
      assert.equal(updated, 'googlebooks');
    });

    it('should search Google Books and normalize results to MediaSearchResult', async () => {
      mockFetch(async (url) => {
        if (url.includes('googleapis.com/books/v1/volumes')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              items: [
                {
                  id: 'gb_test_123',
                  volumeInfo: {
                    title: 'Brave New World',
                    authors: ['Aldous Huxley'],
                    publishedDate: '1932-01-01',
                    pageCount: 268,
                    description: 'A dystopian social science fiction novel.',
                    categories: ['Classics', 'Dystopian'],
                    imageLinks: {
                      thumbnail: 'http://books.google.com/books/content?id=123&printsec=frontcover'
                    },
                    industryIdentifiers: [
                      { type: 'ISBN_13', identifier: '9780060850524' }
                    ],
                    averageRating: 4.1,
                    ratingsCount: 2800
                  }
                }
              ]
            })
          };
        }
        return { ok: false, status: 404 };
      });

      const results = await apiModule.searchGoogleBooks('Brave New World');
      assert.equal(results.length, 1);
      const book = results[0];
      assert.equal(book.externalId, 'gb_test_123');
      assert.equal(book.source, 'googlebooks');
      assert.equal(book.type, 'book');
      assert.equal(book.title, 'Brave New World');
      assert.equal(book.author, 'Aldous Huxley');
      assert.equal(book.year, '1932');
      assert.equal(book.totalPages, 268);
      assert.equal(book.isbn, '9780060850524');
      assert.equal(book.posterUrl, 'https://books.google.com/books/content?id=123&printsec=frontcover');
      assert.equal(book.communityRating, 8.2);
    });

    it('should respect bookProvider in searchMedia', async () => {
      let queriedGoogle = false;
      let queriedOpenLibrary = false;

      mockFetch(async (url) => {
        if (url.includes('googleapis.com/books/v1/volumes')) {
          queriedGoogle = true;
          return { ok: true, status: 200, json: async () => ({ items: [] }) };
        }
        if (url.includes('openlibrary.org/search.json')) {
          queriedOpenLibrary = true;
          return { ok: true, status: 200, json: async () => ({ docs: [] }) };
        }
        return { ok: false, status: 404 };
      });

      // 1. Default (or openlibrary explicitly)
      await apiModule.searchMedia('Foundation', { typeFilter: 'book', bookProvider: 'openlibrary' });
      assert.equal(queriedOpenLibrary, true);
      assert.equal(queriedGoogle, false);

      // 2. Google Books explicitly
      queriedOpenLibrary = false;
      await apiModule.searchMedia('Foundation', { typeFilter: 'book', bookProvider: 'googlebooks' });
      assert.equal(queriedGoogle, true);
      assert.equal(queriedOpenLibrary, false);
    });

    it('should search Apple Books eBooks and normalize results (Issue #45)', async () => {
      mockFetch(async (url) => {
        if (url.includes('itunes.apple.com/search') && url.includes('media=ebook')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              resultCount: 1,
              results: [
                {
                  trackId: 987654321,
                  trackName: 'Dune',
                  artistName: 'Frank Herbert',
                  releaseDate: '1965-08-01T07:00:00Z',
                  description: 'Set on the desert planet Arrakis.<br /><br />A masterpiece of science fiction.',
                  artworkUrl100: 'https://is1-ssl.mzstatic.com/image/thumb/Publication/v4/9780441013593.jpg/100x100bb.jpg',
                  averageUserRating: 4.65,
                  userRatingCount: 1240,
                  genres: ['Science Fiction', 'Fiction'],
                  primaryGenreName: 'Sci-Fi & Fantasy'
                }
              ]
            })
          };
        }
        return { ok: false, status: 404 };
      });

      const results = await apiModule.searchAppleBooksEbooks('Dune');
      assert.equal(results.length, 1);
      const book = results[0];
      assert.equal(book.externalId, 'itunes_ebook_987654321');
      assert.equal(book.source, 'itunes');
      assert.equal(book.type, 'book');
      assert.equal(book.title, 'Dune');
      assert.equal(book.author, 'Frank Herbert');
      assert.equal(book.year, 1965);
      assert.equal(book.releaseDate, '1965-08-01');
      assert.equal(book.bookFormat, 'E-book');
      assert.equal(book.isbn, '9780441013593');
      assert.equal(book.posterUrl, 'https://is1-ssl.mzstatic.com/image/thumb/Publication/v4/9780441013593.jpg/600x600bb.jpg');
      assert.equal(book.communityRating, 9.3);
      assert.equal(book.communityRatingCount, 1240);
      assert.ok(book.overview.includes('Set on the desert planet Arrakis.'));
      assert.ok(!book.overview.includes('<br'));
    });

    it('should route searchMedia to Apple Books eBooks when bookProvider is applebooks (Issue #45)', async () => {
      let queriedAppleBooks = false;

      mockFetch(async (url) => {
        if (url.includes('itunes.apple.com/search') && url.includes('media=ebook')) {
          queriedAppleBooks = true;
          return {
            ok: true,
            status: 200,
            json: async () => ({
              resultCount: 1,
              results: [
                {
                  trackId: 112233,
                  trackName: 'Neuromancer',
                  artistName: 'William Gibson',
                  releaseDate: '1984-07-01T00:00:00Z',
                  genres: ['Cyberpunk']
                }
              ]
            })
          };
        }
        return { ok: false, status: 404 };
      });

      const results = await apiModule.searchMedia('Neuromancer', {
        typeFilter: 'book',
        bookProvider: 'applebooks'
      });

      assert.equal(queriedAppleBooks, true);
      assert.equal(results.length, 1);
      assert.equal(results[0].title, 'Neuromancer');
      assert.equal(results[0].bookFormat, 'E-book');
      assert.equal(results[0].source, 'itunes');
    });

    it('should fallback to local storefront when US catalog returns zero results (Issue #45)', async () => {
      const queriedUrls = [];

      mockFetch(async (url) => {
        if (url.includes('itunes.apple.com/search') && url.includes('media=ebook')) {
          queriedUrls.push(url);
          if (url.includes('country=US')) {
            // US has 0 results for this localized book
            return {
              ok: true,
              status: 200,
              json: async () => ({ resultCount: 0, results: [] })
            };
          }
          // Global/local storefront fallback returns result
          return {
            ok: true,
            status: 200,
            json: async () => ({
              resultCount: 1,
              results: [
                {
                  trackId: 445566,
                  trackName: 'Regional Aussie Title',
                  artistName: 'Local Author',
                  releaseDate: '2023-01-01T00:00:00Z'
                }
              ]
            })
          };
        }
        return { ok: false, status: 404 };
      });

      const results = await apiModule.searchAppleBooksEbooks('Regional Aussie Title');
      assert.equal(results.length, 1);
      assert.equal(results[0].title, 'Regional Aussie Title');
      assert.equal(queriedUrls.length, 2);
      assert.ok(queriedUrls[0].includes('country=US'));
      assert.ok(!queriedUrls[1].includes('country=US'));
    });
  });
});

