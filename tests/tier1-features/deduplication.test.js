import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { getDbModule, resetDatabase } from '../helpers/setup.js';
import { mockTvShowItem, mockTvEpisodes } from '../helpers/fixtures.js';
import { isMediaMatch } from '../../src/utils/mediaMatch.ts';

describe('Tier 1: Issue #17 Media Deduplication on Add', () => {
  let dbModule;

  beforeEach(async () => {
    await resetDatabase();
    dbModule = await getDbModule();
  });

  it('should not create duplicate entries when adding media with matching externalId and source', async () => {
    const item1 = await dbModule.saveMediaItem({
      title: 'Breaking Bad',
      type: 'tv',
      source: 'tvmaze',
      externalId: '169',
      status: 'watching'
    });

    const allBefore = await dbModule.getAllMedia();
    assert.equal(allBefore.length, 1);

    // Try adding the same media again with same externalId and source
    const item2 = await dbModule.saveMediaItem({
      title: 'Breaking Bad (Updated Name)',
      type: 'tv',
      source: 'tvmaze',
      externalId: '169',
      status: 'completed'
    });

    const allAfter = await dbModule.getAllMedia();
    assert.equal(allAfter.length, 1, 'Should not create a duplicate record in DB');
    assert.equal(item2.id, item1.id, 'Should update existing media id');
    assert.equal(allAfter[0].id, item1.id);
  });

  it('should not create duplicate entries when adding media with matching title and type', async () => {
    const item1 = await dbModule.saveMediaItem({
      title: 'Inception',
      type: 'movie',
      year: 2010,
      source: 'tmdb',
      externalId: '27205',
      status: 'plan_to_watch'
    });

    const allBefore = await dbModule.getAllMedia();
    assert.equal(allBefore.length, 1);

    // Custom or secondary search add with case-insensitive matching title
    const item2 = await dbModule.saveMediaItem({
      title: '  inception  ',
      type: 'movie',
      year: 2010,
      source: 'custom',
      externalId: 'custom_12345',
      status: 'completed'
    });

    const allAfter = await dbModule.getAllMedia();
    assert.equal(allAfter.length, 1, 'Should deduplicate by normalized title and type');
    assert.equal(item2.id, item1.id, 'Should preserve the original ID');
  });

  it('should preserve watched progress when deduplicating and merging episodes', async () => {
    await dbModule.saveMediaItem(mockTvShowItem, mockTvEpisodes);
    await dbModule.toggleEpisodeWatched(mockTvShowItem.id, 1, 1);

    const mediaBefore = await dbModule.getMediaById(mockTvShowItem.id);
    assert.equal(mediaBefore.watchedEpisodesCount, 1);

    // Re-add show with same externalId
    await dbModule.saveMediaItem({
      ...mockTvShowItem,
      title: 'Severance (Season 2 Confirmed)'
    }, mockTvEpisodes);

    const all = await dbModule.getAllMedia();
    assert.equal(all.length, 1);
    const mediaAfter = await dbModule.getMediaById(mockTvShowItem.id);
    assert.equal(mediaAfter.watchedEpisodesCount, 1, 'Existing watched episodes must be preserved');
  });

  it('should NOT merge reboots/remakes with identical titles when externalIds differ (Issue #36)', async () => {
    // 1. Add Doctor Who (2023)
    const doctorWho2023 = await dbModule.saveMediaItem({
      title: 'Doctor Who',
      type: 'tv',
      year: 2023,
      source: 'tvmaze',
      externalId: '239770',
      status: 'watching'
    }, [
      { seasonNumber: 1, episodeNumber: 1, title: 'Space Babies', isWatched: 1 }
    ]);

    const allFirst = await dbModule.getAllMedia();
    assert.equal(allFirst.length, 1);

    // 2. Add Doctor Who (1963) with different externalId and different year
    const doctorWho1963 = await dbModule.saveMediaItem({
      title: 'Doctor Who',
      type: 'tv',
      year: 1963,
      source: 'tvmaze',
      externalId: '343',
      status: 'plan_to_watch'
    }, [
      { seasonNumber: 1, episodeNumber: 1, title: 'An Unearthly Child', isWatched: 0 }
    ]);

    // 3. Verify BOTH entries exist in database independently
    const allSecond = await dbModule.getAllMedia();
    assert.equal(allSecond.length, 2, 'Should create 2 distinct records for different externalIds');
    assert.notEqual(doctorWho2023.id, doctorWho1963.id, 'IDs must be distinct');

    // 4. Verify progress and metadata of both are intact
    const show2023 = await dbModule.getMediaById(doctorWho2023.id);
    const show1963 = await dbModule.getMediaById(doctorWho1963.id);
    assert.equal(show2023.year, 2023);
    assert.equal(show2023.externalId, '239770');
    assert.equal(show2023.watchedEpisodesCount, 1);

    assert.equal(show1963.year, 1963);
    assert.equal(show1963.externalId, '343');
    assert.equal(show1963.watchedEpisodesCount, 0);
  });

  it('should NOT merge custom items with identical titles when release years differ', async () => {
    const customDune1984 = await dbModule.saveMediaItem({
      title: 'Dune',
      type: 'movie',
      year: 1984,
      source: 'custom',
      externalId: 'custom_1984',
      status: 'completed'
    });

    const customDune2021 = await dbModule.saveMediaItem({
      title: 'Dune',
      type: 'movie',
      year: 2021,
      source: 'custom',
      externalId: 'custom_2021',
      status: 'plan_to_watch'
    });

    const all = await dbModule.getAllMedia();
    assert.equal(all.length, 2, 'Should not merge custom items with differing release years');
    assert.notEqual(customDune1984.id, customDune2021.id);
  });

  it('should accurately detect media matches with isMediaMatch', () => {
    // 1. Same externalId + same provider = match
    assert.equal(
      isMediaMatch(
        { title: 'Doctor Who', externalId: '239770', source: 'tvmaze', type: 'tv' },
        { title: 'Doctor Who', externalId: '239770', source: 'tvmaze', type: 'tv' }
      ),
      true
    );

    // 2. Different externalId = never a match even with same title
    assert.equal(
      isMediaMatch(
        { title: 'Doctor Who', externalId: '343', source: 'tvmaze', type: 'tv', year: 1963 },
        { title: 'Doctor Who', externalId: '239770', source: 'tvmaze', type: 'tv', year: 2023 }
      ),
      false
    );

    // 3. Custom item without ID matching API item with same title and year
    assert.equal(
      isMediaMatch(
        { title: 'Doctor Who', externalId: '239770', source: 'tvmaze', type: 'tv', year: 2023 },
        { title: 'doctor who', source: 'custom', type: 'tv', year: 2023 }
      ),
      true
    );

    // 4. Custom item matching API item with different year = NOT a match
    assert.equal(
      isMediaMatch(
        { title: 'Doctor Who', externalId: '343', source: 'tvmaze', type: 'tv', year: 1963 },
        { title: 'doctor who', source: 'custom', type: 'tv', year: 2023 }
      ),
      false
    );

    // 5. Different types = never a match
    assert.equal(
      isMediaMatch(
        { title: 'Dune', type: 'movie', source: 'tmdb', externalId: '438631' },
        { title: 'Dune', type: 'book', source: 'openlibrary', externalId: 'OL12345' }
      ),
      false
    );
  });
});
