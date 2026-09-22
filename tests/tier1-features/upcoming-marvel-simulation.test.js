import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { getUpcomingModule } from '../helpers/setup.js';

describe('Tier 1: Issue #40 Marvel Universe Upcoming Releases Simulation', () => {
  let isItemUpcoming;
  let shouldShowItemForUpcomingFilter;

  // Simulated current date: September 22, 2026
  const simulationNow = new Date('2026-09-22T12:00:00.000Z');

  before(async () => {
    const upcomingModule = await getUpcomingModule();
    isItemUpcoming = upcomingModule.isItemUpcoming;
    shouldShowItemForUpcomingFilter = upcomingModule.shouldShowItemForUpcomingFilter;
  });

  const marvelLibrary = [
    {
      id: 'marvel_ironman',
      title: 'Iron Man',
      type: 'movie',
      releaseDate: '2008-05-02',
      status: 'completed'
    },
    {
      id: 'marvel_deadpool_wolverine',
      title: 'Deadpool & Wolverine',
      type: 'movie',
      releaseDate: '2024-07-26',
      status: 'completed'
    },
    {
      id: 'marvel_cap4',
      title: 'Captain America: Brave New World',
      type: 'movie',
      releaseDate: '2025-02-14',
      status: 'completed'
    },
    {
      id: 'marvel_doomsday',
      title: 'Avengers: Doomsday',
      type: 'movie',
      releaseDate: '2026-05-01',
      status: 'watching'
    },
    {
      id: 'marvel_spiderman4',
      title: 'Spider-Man 4',
      type: 'movie',
      releaseDate: '2026-09-28', // 6 days from now! (within 7-day window)
      status: 'plan_to_watch'
    },
    {
      id: 'marvel_secret_wars',
      title: 'Avengers: Secret Wars',
      type: 'movie',
      releaseDate: '2027-05-07', // 227 days away! (outside 7-day and 30-day windows)
      status: 'plan_to_watch'
    },
    {
      id: 'marvel_daredevil',
      title: 'Daredevil: Born Again',
      type: 'tv',
      releaseDate: '2025-03-04',
      lastAiredDate: '2025-04-15',
      watchedEpisodesCount: 9,
      status: 'watching'
    }
  ];

  it('correctly identifies upcoming status for each Marvel production', () => {
    // Past releases
    assert.equal(isItemUpcoming(marvelLibrary[0], simulationNow).isUpcoming, false, 'Iron Man is not upcoming');
    assert.equal(isItemUpcoming(marvelLibrary[1], simulationNow).isUpcoming, false, 'Deadpool & Wolverine is not upcoming');
    assert.equal(isItemUpcoming(marvelLibrary[2], simulationNow).isUpcoming, false, 'Cap 4 is not upcoming');
    assert.equal(isItemUpcoming(marvelLibrary[3], simulationNow).isUpcoming, false, 'Doomsday (May 2026) is already out');
    assert.equal(isItemUpcoming(marvelLibrary[6], simulationNow).isUpcoming, false, 'Daredevil TV show has aired episodes');

    // Future releases
    assert.equal(isItemUpcoming(marvelLibrary[4], simulationNow).isUpcoming, true, 'Spider-Man 4 is upcoming');
    assert.equal(isItemUpcoming(marvelLibrary[5], simulationNow).isUpcoming, true, 'Avengers: Secret Wars is upcoming');
  });

  it('Tier 1: "Show All" includes all 7 Marvel titles', () => {
    const visible = marvelLibrary.filter(item =>
      shouldShowItemForUpcomingFilter(item, 'show_all', 7, simulationNow)
    );
    assert.equal(visible.length, 7);
    assert.ok(visible.some(m => m.title === 'Spider-Man 4'));
    assert.ok(visible.some(m => m.title === 'Avengers: Secret Wars'));
  });

  it('Tier 2: "Hide Upcoming" excludes Spider-Man 4 and Secret Wars but keeps all 5 released titles', () => {
    const visible = marvelLibrary.filter(item =>
      shouldShowItemForUpcomingFilter(item, 'hide_all', 7, simulationNow)
    );
    assert.equal(visible.length, 5);
    assert.equal(visible.some(m => m.title === 'Spider-Man 4'), false);
    assert.equal(visible.some(m => m.title === 'Avengers: Secret Wars'), false);
    assert.ok(visible.some(m => m.title === 'Avengers: Doomsday'));
    assert.ok(visible.some(m => m.title === 'Daredevil: Born Again'));
  });

  it('Tier 3: "Next 7 Days" shows Spider-Man 4 (in 6 days) but hides Secret Wars (in 227 days)', () => {
    const visible = marvelLibrary.filter(item =>
      shouldShowItemForUpcomingFilter(item, 'next_n_days', 7, simulationNow)
    );
    assert.equal(visible.length, 6);
    assert.ok(visible.some(m => m.title === 'Spider-Man 4'), 'Spider-Man 4 releases in 6 days and must be visible');
    assert.equal(visible.some(m => m.title === 'Avengers: Secret Wars'), false, 'Secret Wars is 227 days away and must be hidden');
  });

  it('Tier 3: Custom window of 365 Days reveals both Spider-Man 4 and Secret Wars', () => {
    const visible = marvelLibrary.filter(item =>
      shouldShowItemForUpcomingFilter(item, 'next_n_days', 365, simulationNow)
    );
    assert.equal(visible.length, 7);
    assert.ok(visible.some(m => m.title === 'Spider-Man 4'));
    assert.ok(visible.some(m => m.title === 'Avengers: Secret Wars'));
  });

  it('Last Aired / Release Date sorting orders Marvel titles chronologically with upcoming on top', () => {
    // When sorted descending by release date
    const sortedDesc = [...marvelLibrary].sort((a, b) => {
      const timeA = new Date(a.releaseDate).getTime();
      const timeB = new Date(b.releaseDate).getTime();
      return timeB - timeA;
    });

    // Secret Wars (May 2027) is at index 0, Spider-Man 4 (Sep 2026) is at index 1
    assert.equal(sortedDesc[0].title, 'Avengers: Secret Wars');
    assert.equal(sortedDesc[1].title, 'Spider-Man 4');

    // But with "Hide Upcoming", those two disappear and Doomsday becomes top:
    const filteredDesc = sortedDesc.filter(m =>
      shouldShowItemForUpcomingFilter(m, 'hide_all', 7, simulationNow)
    );
    assert.equal(filteredDesc[0].title, 'Avengers: Doomsday');
    assert.equal(filteredDesc.length, 5);
  });
});
