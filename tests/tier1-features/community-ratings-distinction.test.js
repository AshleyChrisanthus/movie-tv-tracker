import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { getDbModule, resetDatabase, mockFetch, restoreFetch } from '../helpers/setup.js';

describe('Tier 1: Community Ratings Separation & Backfill', () => {
  let dbModule;

  beforeEach(async () => {
    await resetDatabase();
    dbModule = await getDbModule();
  });

  it('preserves communityRating separately from user rating on saveMediaItem', async () => {
    const item = await dbModule.saveMediaItem({
      title: 'Dune',
      type: 'book',
      source: 'openlibrary',
      externalId: 'OL893414W',
      rating: null,
      communityRating: 8.6,
      communityRatingCount: 446
    });

    assert.equal(item.rating, null);
    assert.equal(item.communityRating, 8.6);
    assert.equal(item.communityRatingCount, 446);

    const fromDb = await dbModule.getMediaById(item.id);
    assert.equal(fromDb.rating, null);
    assert.equal(fromDb.communityRating, 8.6);
    assert.equal(fromDb.communityRatingCount, 446);
  });

  it('allows user to set their personal rating without overwriting communityRating', async () => {
    const item = await dbModule.saveMediaItem({
      title: 'Severance',
      type: 'tv',
      source: 'tvmaze',
      externalId: '54152',
      rating: null,
      communityRating: 8.5
    });

    // User rates the show 9.2 with a note
    await dbModule.updateMediaRatingAndNotes(item.id, 9.2, 'Masterpiece of television!');

    const updated = await dbModule.getMediaById(item.id);
    assert.equal(updated.rating, 9.2);
    assert.equal(updated.communityRating, 8.5);
    assert.equal(updated.notes, 'Masterpiece of television!');
  });

  it('backfills missing community ratings for existing books from Open Library', async () => {
    // Save book without community rating
    const book = await dbModule.saveMediaItem({
      title: 'Dune',
      type: 'book',
      author: 'Frank Herbert',
      source: 'openlibrary',
      externalId: 'OL893414W',
      rating: null
    });
    assert.equal(book.communityRating, null);

    mockFetch(async (url) => {
      if (url.includes('/works/OL893414W/ratings.json')) {
        return {
          ok: true,
          json: async () => ({
            summary: { average: 4.3, count: 450 }
          })
        };
      }
      return { ok: false };
    });

    const healedCount = await dbModule.backfillCommunityRatings();
    restoreFetch();

    assert.ok(healedCount >= 1);
    const healedBook = await dbModule.getMediaById(book.id);
    assert.equal(healedBook.communityRating, 8.6); // 4.3 * 2 = 8.6 on standard 10-point scale
    assert.equal(healedBook.communityRatingCount, 450);
  });

  it('backfills missing community ratings for TV shows from TVMaze', async () => {
    const show = await dbModule.saveMediaItem({
      title: 'Breaking Bad',
      type: 'tv',
      source: 'tvmaze',
      externalId: '169',
      tvmazeId: '169',
      rating: null
    });

    mockFetch(async (url) => {
      if (url.includes('api.tvmaze.com/shows/169')) {
        return {
          ok: true,
          json: async () => ({
            name: 'Breaking Bad',
            rating: { average: 9.2 }
          })
        };
      }
      return { ok: false };
    });

    const healed = await dbModule.backfillCommunityRatings();
    restoreFetch();

    assert.ok(healed >= 1);
    const healedShow = await dbModule.getMediaById(show.id);
    assert.equal(healedShow.communityRating, 9.2);
  });
});
