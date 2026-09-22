import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { getUpcomingModule } from '../helpers/setup.js';

describe('Tier 1: Issue #40 3-Tier Upcoming Releases Filter & View Persistence', () => {
  let isItemUpcoming;
  let shouldShowItemForUpcomingFilter;
  let getItemReleaseDate;
  const mockNow = new Date('2026-09-22T00:00:00.000Z');

  before(async () => {
    const upcomingModule = await getUpcomingModule();
    isItemUpcoming = upcomingModule.isItemUpcoming;
    shouldShowItemForUpcomingFilter = upcomingModule.shouldShowItemForUpcomingFilter;
    getItemReleaseDate = upcomingModule.getItemReleaseDate;
  });

  it('correctly parses release dates from releaseDate string or year', () => {
    const movieWithFullDate = { title: 'Movie A', releaseDate: '2026-11-05', year: 2026 };
    const movieWithYearOnly = { title: 'Movie B', year: 2027 };
    const movieWithInvalidDate = { title: 'Movie C', releaseDate: 'invalid' };

    assert.equal(getItemReleaseDate(movieWithFullDate)?.toISOString().slice(0, 10), '2026-11-05');
    assert.equal(getItemReleaseDate(movieWithYearOnly)?.toISOString().slice(0, 10), '2027-01-01');
    assert.equal(getItemReleaseDate(movieWithInvalidDate), null);
  });

  it('identifies unreleased movie as upcoming', () => {
    const unreleasedMovie = {
      id: 'm1',
      title: 'Avengers: Secret Wars',
      type: 'movie',
      releaseDate: '2027-05-07',
      status: 'plan_to_watch'
    };

    const { isUpcoming, releaseDate } = isItemUpcoming(unreleasedMovie, mockNow);
    assert.equal(isUpcoming, true);
    assert.ok(releaseDate);
    assert.equal(releaseDate.toISOString().slice(0, 10), '2027-05-07');
  });

  it('does not treat completed items or past releases as upcoming', () => {
    const completedMovie = {
      id: 'm2',
      title: 'Past Movie',
      type: 'movie',
      releaseDate: '2027-01-01',
      status: 'completed'
    };
    assert.equal(isItemUpcoming(completedMovie, mockNow).isUpcoming, false);

    const releasedMovie = {
      id: 'm3',
      title: 'Iron Man',
      type: 'movie',
      releaseDate: '2008-05-02',
      status: 'plan_to_watch'
    };
    assert.equal(isItemUpcoming(releasedMovie, mockNow).isUpcoming, false);
  });

  it('does not treat TV shows with watched episodes or aired episodes in the past as upcoming', () => {
    const showWithWatched = {
      id: 'tv1',
      title: 'Existing Series',
      type: 'tv',
      releaseDate: '2027-01-01',
      watchedEpisodesCount: 3,
      status: 'watching'
    };
    assert.equal(isItemUpcoming(showWithWatched, mockNow).isUpcoming, false);

    const showWithPastAirDate = {
      id: 'tv2',
      title: 'Aired Series',
      type: 'tv',
      releaseDate: '2027-01-01',
      lastAiredDate: '2025-10-10',
      status: 'plan_to_watch'
    };
    assert.equal(isItemUpcoming(showWithPastAirDate, mockNow).isUpcoming, false);
  });

  it('filters items correctly across all 3 tiers: show_all, hide_all, and next_n_days', () => {
    const released = { id: '1', title: 'Already Released', releaseDate: '2025-01-01', status: 'watching' };
    const upcomingIn3Days = { id: '2', title: 'Releasing in 3 Days', releaseDate: '2026-09-25', status: 'plan_to_watch' };
    const upcomingIn20Days = { id: '3', title: 'Releasing in 20 Days', releaseDate: '2026-10-12', status: 'plan_to_watch' };

    // Tier 1: show_all should show all items
    assert.equal(shouldShowItemForUpcomingFilter(released, 'show_all', 7, mockNow), true);
    assert.equal(shouldShowItemForUpcomingFilter(upcomingIn3Days, 'show_all', 7, mockNow), true);
    assert.equal(shouldShowItemForUpcomingFilter(upcomingIn20Days, 'show_all', 7, mockNow), true);

    // Tier 2: hide_all should hide unreleased/upcoming items but keep already released
    assert.equal(shouldShowItemForUpcomingFilter(released, 'hide_all', 7, mockNow), true);
    assert.equal(shouldShowItemForUpcomingFilter(upcomingIn3Days, 'hide_all', 7, mockNow), false);
    assert.equal(shouldShowItemForUpcomingFilter(upcomingIn20Days, 'hide_all', 7, mockNow), false);

    // Tier 3: next_n_days (window: 7 days) should include released + items within 7 days
    assert.equal(shouldShowItemForUpcomingFilter(released, 'next_n_days', 7, mockNow), true);
    assert.equal(shouldShowItemForUpcomingFilter(upcomingIn3Days, 'next_n_days', 7, mockNow), true);
    assert.equal(shouldShowItemForUpcomingFilter(upcomingIn20Days, 'next_n_days', 7, mockNow), false);

    // Tier 3: next_n_days (window: 30 days) should include item in 20 days
    assert.equal(shouldShowItemForUpcomingFilter(upcomingIn20Days, 'next_n_days', 30, mockNow), true);
  });
});
