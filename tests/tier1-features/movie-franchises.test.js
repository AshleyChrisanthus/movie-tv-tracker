import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { getApiModule, getDbModule, getFranchiseModule, resetDatabase, mockFetch, restoreFetch } from '../helpers/setup.js';

describe('Tier 1: Issue #34 Movie Franchises & Collections Tracking', () => {
  let apiModule;
  let dbModule;
  let franchiseModule;

  beforeEach(async () => {
    restoreFetch();
    await resetDatabase();
    apiModule = await getApiModule();
    dbModule = await getDbModule();
    franchiseModule = await getFranchiseModule();
  });

  const mockLOTRCollection = {
    id: 119,
    name: 'The Lord of the Rings Collection',
    overview: 'The heroic quest of fellowship to destroy the One Ring.',
    poster_path: '/p4A31666A1zG2rLzV7H859F5H0.jpg',
    backdrop_path: '/bccR2CGTWVbp4nu05oTe1579uQp.jpg',
    parts: [
      {
        id: 120,
        title: 'The Lord of the Rings: The Fellowship of the Ring',
        release_date: '2001-12-18',
        poster_path: '/6oom5QYQ2yQTMJIbnvbkBL9cHo6.jpg',
        vote_average: 8.4,
        vote_count: 24000,
        overview: 'Young hobbit Frodo Baggins inherits the One Ring.'
      },
      {
        id: 121,
        title: 'The Lord of the Rings: The Two Towers',
        release_date: '2002-12-18',
        poster_path: '/5VTN0pR8gcqV3EPUHHfMGnJYN9L.jpg',
        vote_average: 8.4,
        vote_count: 21000,
        overview: 'Frodo and Sam journey to Mordor.'
      },
      {
        id: 122,
        title: 'The Lord of the Rings: The Return of the King',
        release_date: '2003-12-01',
        poster_path: '/rCzpDGLbOoPwLjy3OAm5NUPOTrC.jpg',
        vote_average: 8.5,
        vote_count: 23000,
        overview: 'The final confrontation between good and evil.'
      }
    ]
  };

  it('should cache TMDB collection in IndexedDB and retrieve offline', async () => {
    // 1. Save collection cache
    const saved = await dbModule.saveFranchiseCollection(mockLOTRCollection);
    assert.equal(saved.id, 119);
    assert.equal(saved.name, 'The Lord of the Rings Collection');
    assert.equal(saved.parts.length, 3);

    // 2. Query collection directly from Dexie
    const cached = await dbModule.getFranchiseCollection(119);
    assert.ok(cached);
    assert.equal(cached.name, 'The Lord of the Rings Collection');
    assert.equal(cached.parts[0].title, 'The Lord of the Rings: The Fellowship of the Ring');

    // 3. Verify fetchTMDBCollection returns cached data when offline / no key
    const resultOffline = await apiModule.fetchTMDBCollection(119);
    assert.ok(resultOffline);
    assert.equal(resultOffline.id, 119);
    assert.equal(resultOffline.name, 'The Lord of the Rings Collection');
    assert.equal(resultOffline.parts.length, 3);
  });

  it('should recommend next uncompleted movie in sequence when preceding movie is completed', async () => {
    // Add Fellowship of the Ring as completed
    const fellowship = await dbModule.saveMediaItem({
      title: 'The Lord of the Rings: The Fellowship of the Ring',
      type: 'movie',
      status: 'completed',
      source: 'tmdb',
      externalId: 120,
      tmdbId: 120,
      collectionId: 119,
      collectionName: 'The Lord of the Rings Collection'
    });

    const library = await dbModule.getAllMedia();
    const nextInfo = franchiseModule.getNextFranchiseMovie(fellowship, mockLOTRCollection.parts, library);

    assert.ok(nextInfo);
    assert.equal(nextInfo.part.id, 121);
    assert.equal(nextInfo.part.title, 'The Lord of the Rings: The Two Towers');
    assert.equal(nextInfo.isAlreadyInLibrary, false);
    assert.equal(nextInfo.isCompleted, false);
    assert.equal(nextInfo.nextIndex, 1);
  });

  it('should skip already-completed sequels and prompt the next uncompleted movie', async () => {
    // Fellowship (Watched)
    const fellowship = await dbModule.saveMediaItem({
      title: 'The Lord of the Rings: The Fellowship of the Ring',
      type: 'movie',
      status: 'completed',
      source: 'tmdb',
      externalId: 120,
      tmdbId: 120,
      collectionId: 119
    });

    // Two Towers (Also Watched)
    await dbModule.saveMediaItem({
      title: 'The Lord of the Rings: The Two Towers',
      type: 'movie',
      status: 'completed',
      source: 'tmdb',
      externalId: 121,
      tmdbId: 121,
      collectionId: 119
    });

    const library = await dbModule.getAllMedia();
    const nextInfo = franchiseModule.getNextFranchiseMovie(fellowship, mockLOTRCollection.parts, library);

    assert.ok(nextInfo);
    // Skips Two Towers (since already completed) and recommends Return of the King!
    assert.equal(nextInfo.part.id, 122);
    assert.equal(nextInfo.part.title, 'The Lord of the Rings: The Return of the King');
    assert.equal(nextInfo.isAlreadyInLibrary, false);
  });

  it('should recognize when next movie is already in library as plan_to_watch', async () => {
    const fellowship = await dbModule.saveMediaItem({
      title: 'The Lord of the Rings: The Fellowship of the Ring',
      type: 'movie',
      status: 'completed',
      source: 'tmdb',
      externalId: 120,
      tmdbId: 120,
      collectionId: 119
    });

    // Two Towers already in user Watchlist
    const twoTowers = await dbModule.saveMediaItem({
      title: 'The Lord of the Rings: The Two Towers',
      type: 'movie',
      status: 'plan_to_watch',
      source: 'tmdb',
      externalId: 121,
      tmdbId: 121,
      collectionId: 119
    });

    const library = await dbModule.getAllMedia();
    const nextInfo = franchiseModule.getNextFranchiseMovie(fellowship, mockLOTRCollection.parts, library);

    assert.ok(nextInfo);
    assert.equal(nextInfo.part.id, 121);
    assert.equal(nextInfo.isAlreadyInLibrary, true);
    assert.equal(nextInfo.libraryStatus, 'plan_to_watch');
    assert.equal(nextInfo.libraryItem.id, twoTowers.id);
  });

  it('should return null when all subsequent movies in franchise are already completed', async () => {
    // All 3 movies watched
    const fellowship = await dbModule.saveMediaItem({
      title: 'The Lord of the Rings: The Fellowship of the Ring',
      type: 'movie',
      status: 'completed',
      source: 'tmdb',
      externalId: 120,
      tmdbId: 120
    });
    await dbModule.saveMediaItem({
      title: 'The Lord of the Rings: The Two Towers',
      type: 'movie',
      status: 'completed',
      source: 'tmdb',
      externalId: 121,
      tmdbId: 121
    });
    await dbModule.saveMediaItem({
      title: 'The Lord of the Rings: The Return of the King',
      type: 'movie',
      status: 'completed',
      source: 'tmdb',
      externalId: 122,
      tmdbId: 122
    });

    const library = await dbModule.getAllMedia();
    const nextInfo = franchiseModule.getNextFranchiseMovie(fellowship, mockLOTRCollection.parts, library);

    assert.equal(nextInfo, null);
  });

  it('should generate full franchise sequence with accurate library status for each part', async () => {
    // Current movie: Two Towers (watching)
    const twoTowers = await dbModule.saveMediaItem({
      title: 'The Lord of the Rings: The Two Towers',
      type: 'movie',
      status: 'watching',
      source: 'tmdb',
      externalId: 121,
      tmdbId: 121,
      collectionId: 119
    });

    // Fellowship is completed
    await dbModule.saveMediaItem({
      title: 'The Lord of the Rings: The Fellowship of the Ring',
      type: 'movie',
      status: 'completed',
      source: 'tmdb',
      externalId: 120,
      tmdbId: 120
    });

    // Return of the King is not in library

    const library = await dbModule.getAllMedia();
    const sequence = franchiseModule.getFranchisePartsWithLibraryStatus(mockLOTRCollection.parts, twoTowers, library);

    assert.equal(sequence.length, 3);

    // Part 1: Fellowship
    assert.equal(sequence[0].part.title, 'The Lord of the Rings: The Fellowship of the Ring');
    assert.equal(sequence[0].isCurrent, false);
    assert.equal(sequence[0].isInLibrary, true);
    assert.equal(sequence[0].status, 'completed');

    // Part 2: Two Towers
    assert.equal(sequence[1].part.title, 'The Lord of the Rings: The Two Towers');
    assert.equal(sequence[1].isCurrent, true);
    assert.equal(sequence[1].isInLibrary, true);
    assert.equal(sequence[1].status, 'watching');

    // Part 3: Return of the King
    assert.equal(sequence[2].part.title, 'The Lord of the Rings: The Return of the King');
    assert.equal(sequence[2].isCurrent, false);
    assert.equal(sequence[2].isInLibrary, false);
    assert.equal(sequence[2].status, null);
  });

  it('should quick-add next movie in sequence directly to Plan to Watch', async () => {
    const partToQuickAdd = mockLOTRCollection.parts[2]; // Return of the King
    const newMediaPayload = franchiseModule.createMediaItemFromCollectionPart(
      partToQuickAdd,
      { id: mockLOTRCollection.id, name: mockLOTRCollection.name },
      'plan_to_watch'
    );

    assert.equal(newMediaPayload.title, 'The Lord of the Rings: The Return of the King');
    assert.equal(newMediaPayload.type, 'movie');
    assert.equal(newMediaPayload.status, 'plan_to_watch');
    assert.equal(newMediaPayload.collectionId, 119);
    assert.equal(newMediaPayload.collectionName, 'The Lord of the Rings Collection');
    assert.equal(newMediaPayload.communityRating, 8.5);

    // Save into Dexie
    const saved = await dbModule.saveMediaItem(newMediaPayload);
    assert.ok(saved.id);

    const retrieved = await dbModule.getMediaById(saved.id);
    assert.ok(retrieved);
    assert.equal(retrieved.status, 'plan_to_watch');
    assert.equal(retrieved.communityRating, 8.5);
  });

  it('should backfill franchise collections for legacy movies in library missing collectionId', async () => {
    await dbModule.setSetting('tmdb_api_key', 'test_key');

    // Save legacy movie in library without collectionId or collectionName
    const legacyMovie = await dbModule.saveMediaItem({
      title: 'The Lord of the Rings: The Fellowship of the Ring',
      type: 'movie',
      status: 'completed',
      source: 'tmdb',
      externalId: 120,
      tmdbId: 120
    });

    assert.equal(legacyMovie.collectionId, undefined);

    // Mock TMDB /movie/120 endpoint returning belongs_to_collection
    mockFetch((url) => {
      if (url.includes('/movie/120')) {
        return {
          ok: true,
          json: async () => ({
            id: 120,
            title: 'The Lord of the Rings: The Fellowship of the Ring',
            belongs_to_collection: {
              id: 119,
              name: 'The Lord of the Rings Collection'
            }
          })
        };
      }
      return { ok: false, status: 404 };
    });

    const healedCount = await dbModule.backfillMovieFranchiseCollections();
    assert.equal(healedCount, 1);

    const healedMovie = await dbModule.getMediaById(legacyMovie.id);
    assert.ok(healedMovie);
    assert.equal(healedMovie.collectionId, 119);
    assert.equal(healedMovie.collectionName, 'The Lord of the Rings Collection');
  });

  it('should include collections in backup export and restore them on import', async () => {
    await dbModule.saveFranchiseCollection(mockLOTRCollection);

    // 1. Full backup export
    const backup = await dbModule.exportAllData({ mode: 'full' });
    assert.ok(backup.collections);
    assert.equal(backup.collections.length, 1);
    assert.equal(backup.collections[0].id, 119);

    // 2. Clear database
    await resetDatabase();
    const emptyCached = await dbModule.getFranchiseCollection(119);
    assert.equal(emptyCached, undefined);

    // 3. Restore backup
    await dbModule.importData(backup, true);
    const restored = await dbModule.getFranchiseCollection(119);
    assert.ok(restored);
    assert.equal(restored.name, 'The Lord of the Rings Collection');
    assert.equal(restored.parts.length, 3);
  });
});
