import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { getDbModule, resetDatabase } from '../helpers/setup.js';
import { isMediaMatch } from '../../src/utils/mediaMatch.ts';

describe('Tier 1: Issue #37 Cross-Provider Media Reconciliation', () => {
  let dbModule;

  beforeEach(async () => {
    await resetDatabase();
    dbModule = await getDbModule();
  });

  it('should match TVMaze and TMDB items with same title, type, and release year (e.g. Silo)', () => {
    const siloTvMaze = {
      externalId: '54152',
      source: 'tvmaze',
      type: 'tv',
      title: 'Silo',
      year: 2023
    };

    const siloTmdb = {
      externalId: '125988',
      source: 'tmdb',
      type: 'tv',
      title: 'Silo',
      year: 2023
    };

    assert.equal(isMediaMatch(siloTvMaze, siloTmdb), true, 'Should recognize Silo across providers');
    assert.equal(isMediaMatch(siloTmdb, siloTvMaze), true, 'Matching must be symmetric');
  });

  it('should match TVMaze and TMDB items via shared imdbId', () => {
    const showA = {
      externalId: '169',
      source: 'tvmaze',
      type: 'tv',
      title: 'Breaking Bad',
      imdbId: 'tt0903747'
    };

    const showB = {
      externalId: '1396',
      source: 'tmdb',
      type: 'tv',
      title: 'Breaking Bad (US)',
      imdbId: 'tt0903747'
    };

    assert.equal(isMediaMatch(showA, showB), true, 'Should match by shared IMDb ID');
  });

  it('should match TVMaze item containing tmdbId against TMDB item', () => {
    const showFromTvMaze = {
      externalId: '54152',
      source: 'tvmaze',
      type: 'tv',
      title: 'Silo',
      tmdbId: 125988
    };

    const showFromTmdb = {
      externalId: '125988',
      source: 'tmdb',
      type: 'tv',
      title: 'Silo'
    };

    assert.equal(isMediaMatch(showFromTvMaze, showFromTmdb), true);
  });

  it('should NOT match cross-provider items with identical titles when release years differ', () => {
    const doctorWho1963 = {
      externalId: '343',
      source: 'tvmaze',
      type: 'tv',
      title: 'Doctor Who',
      year: 1963
    };

    const doctorWho2023 = {
      externalId: '239770',
      source: 'tmdb',
      type: 'tv',
      title: 'Doctor Who',
      year: 2023
    };

    assert.equal(isMediaMatch(doctorWho1963, doctorWho2023), false, 'Different release years must not match');
  });

  it('should deduplicate and preserve records when saving cross-provider matching item in DB', async () => {
    // 1. Add Silo originally from TVMaze
    const tvMazeSilo = await dbModule.saveMediaItem({
      title: 'Silo',
      type: 'tv',
      year: 2023,
      source: 'tvmaze',
      externalId: '54152',
      imdbId: 'tt14688458',
      status: 'watching'
    }, [
      { seasonNumber: 1, episodeNumber: 1, title: 'Freedom Day', isWatched: 1 }
    ]);

    const before = await dbModule.getAllMedia();
    assert.equal(before.length, 1);

    // 2. Later, add or merge Silo from TMDB search
    const tmdbSilo = await dbModule.saveMediaItem({
      title: 'Silo',
      type: 'tv',
      year: 2023,
      source: 'tmdb',
      externalId: '125988',
      imdbId: 'tt14688458',
      tmdbId: '125988',
      status: 'watching'
    }, [
      { seasonNumber: 1, episodeNumber: 1, title: 'Freedom Day', isWatched: 0 },
      { seasonNumber: 1, episodeNumber: 2, title: 'Holston\'s Pick', isWatched: 0 }
    ]);

    const after = await dbModule.getAllMedia();
    assert.equal(after.length, 1, 'Must deduplicate into single record');
    assert.equal(tmdbSilo.id, tvMazeSilo.id, 'Must preserve original item ID');

    // 3. Verify cross-reference IDs and watched progress were preserved
    const saved = await dbModule.getMediaById(tvMazeSilo.id);
    assert.equal(saved.watchedEpisodesCount, 1, 'Watched progress must be preserved');
    assert.equal(saved.imdbId, 'tt14688458');
    assert.equal(saved.tmdbId, '125988');
  });

  it('should backfill cross-reference IDs for existing library items', async () => {
    // Save an item without cross-ref IDs
    const show = await dbModule.saveMediaItem({
      title: 'Silo',
      type: 'tv',
      year: 2023,
      source: 'tvmaze',
      externalId: '54152',
      status: 'watching'
    });

    const initial = await dbModule.getMediaById(show.id);
    assert.equal(initial.imdbId, null);

    // Mock global fetch for TVMaze show details
    const origFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
      if (String(url).includes('api.tvmaze.com/shows/54152')) {
        return {
          ok: true,
          json: async () => ({
            id: 54152,
            name: 'Silo',
            externals: {
              imdb: 'tt14688458',
              thetvdb: 403276,
              themoviedb: 125988
            }
          })
        };
      }
      return origFetch(url);
    };

    try {
      const updatedCount = await dbModule.backfillMediaCrossReferences();
      assert.equal(updatedCount, 1, 'Should update 1 media record');

      const updated = await dbModule.getMediaById(show.id);
      assert.equal(updated.imdbId, 'tt14688458');
      assert.equal(updated.thetvdbId, 403276);
      assert.equal(updated.tmdbId, 125988);
      assert.equal(updated.tvmazeId, '54152');
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});
