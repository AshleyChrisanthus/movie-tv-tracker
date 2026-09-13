import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { getApiModule, getDbModule, resetDatabase, mockFetch, restoreFetch } from '../helpers/setup.js';

describe('Tier 1: Multi-Provider Search & Fallback Engine', () => {
  let apiModule;
  let dbModule;

  beforeEach(async () => {
    await resetDatabase();
    apiModule = await getApiModule();
    dbModule = await getDbModule();
  });

  afterEach(() => {
    restoreFetch();
  });

  it('should search TVMaze and iTunes when no TMDB API key is configured', async () => {
    mockFetch((url) => {
      if (url.includes('tvmaze.com/search/shows')) {
        return Promise.resolve({
          ok: true,
          json: async () => [
            {
              show: {
                id: 101,
                name: 'Severance',
                premiered: '2022-02-18',
                summary: '<p>Mark leads a team of office workers whose memories have been surgically divided.</p>',
                rating: { average: 8.7 },
                image: { original: 'https://tvmaze.example.com/severance.jpg' },
                genres: ['Drama', 'Sci-Fi'],
                status: 'Running'
              }
            }
          ]
        });
      }
      if (url.includes('itunes.apple.com/search')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            results: [
              {
                trackId: 202,
                trackName: 'Inception',
                releaseDate: '2010-07-16T07:00:00Z',
                longDescription: 'A thief who steals corporate secrets through dream-sharing technology.',
                artworkUrl100: 'https://itunes.example.com/inception_100x100bb.jpg',
                primaryGenreName: 'Sci-Fi'
              }
            ]
          })
        });
      }
      return Promise.reject(new Error('Unexpected URL: ' + url));
    });

    const results = await apiModule.searchMedia('scifi');
    assert.equal(results.length, 2);

    const tv = results.find(r => r.type === 'tv');
    assert.ok(tv);
    assert.equal(tv.source, 'tvmaze');
    assert.equal(tv.title, 'Severance');
    assert.equal(tv.year, 2022);
    assert.equal(tv.overview, 'Mark leads a team of office workers whose memories have been surgically divided.');
    assert.equal(tv.posterUrl, 'https://tvmaze.example.com/severance.jpg');

    const movie = results.find(r => r.type === 'movie');
    assert.ok(movie);
    assert.equal(movie.source, 'itunes');
    assert.equal(movie.title, 'Inception');
    assert.equal(movie.year, 2010);
    // Upgraded artwork check
    assert.equal(movie.posterUrl, 'https://itunes.example.com/inception_600x600bb.jpg');
  });

  it('should search TMDB when TMDB API key is present in settings', async () => {
    await dbModule.setSetting('tmdb_api_key', 'valid_tmdb_key_abc');

    mockFetch((url) => {
      if (url.includes('api.themoviedb.org/3/search/multi')) {
        assert.ok(url.includes('api_key=valid_tmdb_key_abc'));
        assert.ok(url.includes('query=interstellar'));
        return Promise.resolve({
          ok: true,
          json: async () => ({
            results: [
              {
                id: 157336,
                media_type: 'movie',
                title: 'Interstellar',
                release_date: '2014-11-05',
                overview: 'The adventures of a group of explorers who make use of a newly discovered wormhole.',
                vote_average: 8.4,
                poster_path: '/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg',
                backdrop_path: '/xJHokMbljvjADYdit5fK5VQsXEG.jpg',
                popularity: 150.5
              }
            ]
          })
        });
      }
      return Promise.reject(new Error('Unexpected URL: ' + url));
    });

    const results = await apiModule.searchMedia('interstellar');
    assert.equal(results.length, 1);
    assert.equal(results[0].title, 'Interstellar');
    assert.equal(results[0].source, 'tmdb');
    assert.equal(results[0].type, 'movie');
    assert.equal(results[0].year, 2014);
    assert.equal(results[0].posterUrl, 'https://image.tmdb.org/t/p/w500/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg');
  });

  it('should fallback to free providers if TMDB search encounters network/server error', async () => {
    await dbModule.setSetting('tmdb_api_key', 'expired_key');

    mockFetch((url) => {
      if (url.includes('api.themoviedb.org')) {
        return Promise.resolve({
          ok: false,
          statusText: 'Unauthorized'
        });
      }
      if (url.includes('tvmaze.com')) {
        return Promise.resolve({
          ok: true,
          json: async () => [
            {
              show: {
                id: 301,
                name: 'Fallback Show',
                premiered: '2023-01-01',
                summary: 'Fallback description',
                genres: ['Drama']
              }
            }
          ]
        });
      }
      if (url.includes('itunes.apple.com')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ results: [] })
        });
      }
      return Promise.reject(new Error('Unexpected URL: ' + url));
    });

    const results = await apiModule.searchMedia('fallback');
    assert.equal(results.length, 1);
    assert.equal(results[0].title, 'Fallback Show');
    assert.equal(results[0].source, 'tvmaze');
  });

  it('should fetch full media details and all episodes for a TV show via TVMaze', async () => {
    mockFetch((url) => {
      if (url.endsWith('/shows/44458')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            id: 44458,
            name: 'Ted Lasso',
            premiered: '2020-08-14',
            summary: '<p>Ted Lasso arrives in Richmond.</p>',
            image: { original: 'https://static.tvmaze.com/poster.jpg' }
          })
        });
      }
      if (url.endsWith('/shows/44458/episodes')) {
        return Promise.resolve({
          ok: true,
          json: async () => [
            { id: 1, season: 1, number: 1, name: 'Pilot', summary: '<p>Pilot summary</p>', airdate: '2020-08-14', runtime: 31 },
            { id: 2, season: 1, number: 2, name: 'Biscuits', summary: '<p>Biscuits summary</p>', airdate: '2020-08-14', runtime: 29 },
            { id: 3, season: 2, number: 1, name: 'Goodbye Earl', summary: '<p>Goodbye Earl summary</p>', airdate: '2021-07-23', runtime: 34 }
          ]
        });
      }
      return Promise.reject(new Error('Unexpected URL: ' + url));
    });

    const details = await apiModule.fetchFullMediaDetails({
      id: 'media_ted_lasso',
      externalId: 44458,
      source: 'tvmaze',
      type: 'tv'
    });

    assert.ok(details.media);
    assert.equal(details.media.title, 'Ted Lasso');
    assert.equal(details.media.totalSeasons, 2);
    assert.equal(details.media.totalEpisodes, 3);
    assert.equal(details.episodes.length, 3);
    assert.equal(details.episodes[0].title, 'Pilot');
    assert.equal(details.episodes[0].overview, 'Pilot summary');
    assert.equal(details.episodes[2].seasonNumber, 2);
    assert.equal(details.episodes[2].episodeNumber, 1);
  });
});
