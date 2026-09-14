import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { getDbModule, resetDatabase } from '../helpers/setup.js';

describe('Tier 1: Issue #21 Sorting by Initial Release Date & Last Aired', () => {
  let dbModule;

  beforeEach(async () => {
    await resetDatabase();
    dbModule = await getDbModule();
  });

  it('should automatically compute and persist lastAiredDate from episodes when saving a TV show', async () => {
    const show = await dbModule.saveMediaItem({
      title: 'Severance',
      type: 'tv',
      releaseDate: '2022-02-18',
      year: 2022
    }, [
      { seasonNumber: 1, episodeNumber: 1, title: 'Good News About Hell', airDate: '2022-02-18', isWatched: 1 },
      { seasonNumber: 1, episodeNumber: 2, title: 'Half Loop', airDate: '2022-02-18', isWatched: 1 },
      { seasonNumber: 1, episodeNumber: 9, title: 'The We We Are', airDate: '2022-04-08', isWatched: 1 }
    ]);

    assert.equal(show.releaseDate, '2022-02-18');
    assert.equal(show.lastAiredDate, '2022-04-08');

    const retrieved = await dbModule.getMediaById(show.id);
    assert.equal(retrieved.lastAiredDate, '2022-04-08');
  });

  it('should backfill missing lastAiredDate for shows with existing episodes', async () => {
    // Insert raw show without lastAiredDate
    const show = await dbModule.saveMediaItem({
      title: 'Breaking Bad',
      type: 'tv',
      releaseDate: '2008-01-20',
      year: 2008
    }, [
      { seasonNumber: 5, episodeNumber: 16, title: 'Felina', airDate: '2013-09-29', isWatched: 1 }
    ]);

    // Force clear lastAiredDate to test backfill
    await dbModule.db.media.update(show.id, { lastAiredDate: null });
    const cleared = await dbModule.getMediaById(show.id);
    assert.equal(cleared.lastAiredDate, null);

    const healed = await dbModule.backfillMissingMediaMetadata();
    assert.ok(healed >= 1);

    const healedShow = await dbModule.getMediaById(show.id);
    assert.equal(healedShow.lastAiredDate, '2013-09-29');
  });

  it('should sort items correctly by release date (descending and ascending)', () => {
    const items = [
      { id: '1', title: 'Older Show', releaseDate: '2010-05-15', year: 2010 },
      { id: '2', title: 'Newer Show', releaseDate: '2023-11-01', year: 2023 },
      { id: '3', title: 'Mid Show', releaseDate: '2018-03-20', year: 2018 }
    ];

    const getReleaseTime = (item) => {
      if (item.releaseDate) {
        const t = new Date(item.releaseDate).getTime();
        if (!isNaN(t)) return t;
      }
      const y = parseInt(String(item.year), 10);
      return !isNaN(y) && y > 1800 ? new Date(`${y}-01-01`).getTime() : 0;
    };

    const desc = [...items].sort((a, b) => getReleaseTime(b) - getReleaseTime(a));
    assert.equal(desc[0].title, 'Newer Show');
    assert.equal(desc[1].title, 'Mid Show');
    assert.equal(desc[2].title, 'Older Show');

    const asc = [...items].sort((a, b) => getReleaseTime(a) - getReleaseTime(b));
    assert.equal(asc[0].title, 'Older Show');
    assert.equal(asc[1].title, 'Mid Show');
    assert.equal(asc[2].title, 'Newer Show');
  });

  it('should sort items correctly by last aired date (descending and ascending)', () => {
    const items = [
      { id: '1', title: 'Show Finished Long Ago', releaseDate: '2005-01-01', lastAiredDate: '2010-05-23' },
      { id: '2', title: 'Currently Active Show', releaseDate: '2015-01-01', lastAiredDate: '2026-03-10' },
      { id: '3', title: 'Show Ended Mid Way', releaseDate: '2012-01-01', lastAiredDate: '2019-12-15' }
    ];

    const getLastAiredTime = (item) => {
      if (item.lastAiredDate) {
        const t = new Date(item.lastAiredDate).getTime();
        if (!isNaN(t)) return t;
      }
      if (item.releaseDate) {
        const t = new Date(item.releaseDate).getTime();
        if (!isNaN(t)) return t;
      }
      const y = parseInt(String(item.year), 10);
      return !isNaN(y) && y > 1800 ? new Date(`${y}-01-01`).getTime() : 0;
    };

    const desc = [...items].sort((a, b) => getLastAiredTime(b) - getLastAiredTime(a));
    assert.equal(desc[0].title, 'Currently Active Show');
    assert.equal(desc[1].title, 'Show Ended Mid Way');
    assert.equal(desc[2].title, 'Show Finished Long Ago');

    const asc = [...items].sort((a, b) => getLastAiredTime(a) - getLastAiredTime(b));
    assert.equal(asc[0].title, 'Show Finished Long Ago');
    assert.equal(asc[1].title, 'Show Ended Mid Way');
    assert.equal(asc[2].title, 'Currently Active Show');
  });
});
