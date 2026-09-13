import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { getApiModule, resetDatabase, mockFetch, restoreFetch } from '../helpers/setup.js';

describe('Tier 2: Provider API Network Failures & Search Edge Cases', () => {
  let apiModule;

  beforeEach(async () => {
    await resetDatabase();
    apiModule = await getApiModule();
  });

  afterEach(() => {
    restoreFetch();
  });

  it('should immediately return empty array for empty, whitespace, or invalid search queries without network calls', async () => {
    let networkCallMade = false;
    mockFetch(() => {
      networkCallMade = true;
      return Promise.resolve({ ok: true, json: async () => [] });
    });

    const empty = await apiModule.searchMedia('');
    assert.deepEqual(empty, []);
    assert.equal(networkCallMade, false);

    const spaces = await apiModule.searchMedia('     ');
    assert.deepEqual(spaces, []);
    assert.equal(networkCallMade, false);

    const nullVal = await apiModule.searchMedia(null);
    assert.deepEqual(nullVal, []);
    assert.equal(networkCallMade, false);

    const undefVal = await apiModule.searchMedia(undefined);
    assert.deepEqual(undefVal, []);
    assert.equal(networkCallMade, false);
  });

  it('should handle network fetch exceptions (offline, DNS failure, timeout) gracefully and return empty array', async () => {
    mockFetch(() => {
      return Promise.reject(new TypeError('Failed to fetch (Network offline)'));
    });

    const results = await apiModule.searchMedia('offline-query');
    assert.deepEqual(results, []);
  });

  it('should handle HTTP 500 server errors from providers without crashing', async () => {
    mockFetch(() => {
      return Promise.resolve({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      });
    });

    const results = await apiModule.searchMedia('server-error-query');
    assert.deepEqual(results, []);
  });

  it('should handle TVMaze show details when episode list returns 404 or empty array', async () => {
    mockFetch((url) => {
      if (url.endsWith('/shows/99999')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            id: 99999,
            name: 'Upcoming Show',
            premiered: '2026-01-01',
            summary: '<p>Episodes not yet announced.</p>'
          })
        });
      }
      if (url.endsWith('/shows/99999/episodes')) {
        return Promise.resolve({
          ok: false,
          status: 404,
          statusText: 'Not Found'
        });
      }
      return Promise.reject(new Error('Unexpected URL: ' + url));
    });

    const details = await apiModule.fetchFullMediaDetails({
      id: 'media_upcoming',
      externalId: 99999,
      source: 'tvmaze',
      type: 'tv'
    });

    assert.ok(details.media);
    assert.equal(details.media.title, 'Upcoming Show');
    assert.equal(details.media.totalEpisodes, 0);
    assert.deepEqual(details.episodes, []);
  });
});
