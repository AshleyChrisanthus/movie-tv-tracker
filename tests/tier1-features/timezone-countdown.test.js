import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { getDbModule, getTimezoneModule, resetDatabase } from '../helpers/setup.js';

describe('Tier 1: Localized Countdown & DST-Aware Timezone Engine (Issue #19)', () => {
  let dbModule;
  let tzModule;

  beforeEach(async () => {
    await resetDatabase();
    dbModule = await getDbModule();
    tzModule = await getTimezoneModule();
  });

  it('should persist and retrieve user timezone preference in IndexedDB', async () => {
    const defaultTz = await tzModule.getUserTimeZone();
    assert.ok(typeof defaultTz === 'string' && defaultTz.length > 0);

    // Explicitly set Australia/Sydney
    await tzModule.setUserTimeZone('Australia/Sydney');
    const savedTz = await tzModule.getUserTimeZone();
    assert.equal(savedTz, 'Australia/Sydney');

    // Change to America/New_York
    await tzModule.setUserTimeZone('America/New_York');
    const updatedTz = await tzModule.getUserTimeZone();
    assert.equal(updatedTz, 'America/New_York');
  });

  it('should accurately determine isEpisodeAired based on UTC airstamp regardless of client timezone', () => {
    const now = Date.now();
    const pastAirstamp = new Date(now - 3600 * 1000).toISOString(); // 1 hour ago
    const futureAirstamp = new Date(now + 3600 * 1000).toISOString(); // 1 hour in future

    assert.equal(tzModule.isEpisodeAired({ airstamp: pastAirstamp }), true);
    assert.equal(tzModule.isEpisodeAired({ airstamp: futureAirstamp }), false);
  });

  it('should accurately convert US broadcast release dates into Australian timezone with DST awareness', () => {
    // 2026-10-08 00:30 UTC:
    // In America/New_York (EDT = UTC-4): Oct 7, 2026 at 8:30 PM (20:30)
    // In Australia/Sydney (AEDT = UTC+11): Oct 8, 2026 at 11:30 AM
    const airstamp = '2026-10-08T00:30:00+00:00';

    const formattedAussie = tzModule.formatEpisodeAirDate(
      '2026-10-07',
      airstamp,
      'Australia/Sydney',
      'America/New_York'
    );

    const formattedUS = tzModule.formatEpisodeAirDate(
      '2026-10-07',
      airstamp,
      'America/New_York',
      'America/New_York'
    );

    // In Sydney, it is Oct 8 at 11:30 AM
    assert.match(formattedAussie, /Oct 8/);
    assert.match(formattedAussie, /11:30\s*AM/i);

    // In New York, it is Oct 7 at 8:30 PM
    assert.match(formattedUS, /Oct 7/);
    assert.match(formattedUS, /8:30\s*PM/i);
  });

  it('should calculate human-readable countdowns for upcoming episodes', () => {
    const now = Date.now();

    // 3 days in future
    const inThreeDays = new Date(now + 72 * 3600 * 1000 + 60000).toISOString();
    const countdownDays = tzModule.getEpisodeCountdown(undefined, inThreeDays);
    assert.equal(countdownDays.isAired, false);
    assert.match(countdownDays.label, /in 3 days/);

    // 5 hours in future
    const inFiveHours = new Date(now + 5 * 3600 * 1000 + 60000).toISOString();
    const countdownHours = tzModule.getEpisodeCountdown(undefined, inFiveHours);
    assert.equal(countdownHours.isAired, false);
    assert.match(countdownHours.label, /in (?:4|5)h/);

    // 20 minutes in future
    const inTwentyMins = new Date(now + 20 * 60 * 1000).toISOString();
    const countdownMins = tzModule.getEpisodeCountdown(undefined, inTwentyMins);
    assert.equal(countdownMins.isAired, false);
    assert.match(countdownMins.label, /in \d+m/);

    // Past episode
    const inPast = new Date(now - 10000).toISOString();
    const countdownPast = tzModule.getEpisodeCountdown(undefined, inPast);
    assert.equal(countdownPast.isAired, true);
    assert.equal(countdownPast.label, 'Aired');
  });

  it('should heal and backfill existing library shows with missing status and next episode pointers', async () => {
    const futureDate = new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const futureAirstamp = new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString();

    const legacyShow = {
      id: 'show_legacy_abbott',
      title: 'Abbott Elementary',
      type: 'tv',
      source: 'tvmaze',
      status: 'watching', // currently in watching, but user watched all aired eps
      airStatus: 'Returning Series',
      totalSeasons: 4,
      totalEpisodes: 3,
      watchedEpisodesCount: 2,
      networkTimezone: 'America/New_York'
    };

    const episodes = [
      {
        id: 'show_legacy_abbott_S3E1',
        mediaId: 'show_legacy_abbott',
        seasonNumber: 3,
        episodeNumber: 1,
        title: 'Career Day',
        airDate: '2024-02-07',
        airstamp: '2024-02-08T02:00:00+00:00',
        isWatched: 1
      },
      {
        id: 'show_legacy_abbott_S3E2',
        mediaId: 'show_legacy_abbott',
        seasonNumber: 3,
        episodeNumber: 2,
        title: 'Costume Contest',
        airDate: '2024-02-14',
        airstamp: '2024-02-15T02:00:00+00:00',
        isWatched: 1
      },
      {
        id: 'show_legacy_abbott_S4E1',
        mediaId: 'show_legacy_abbott',
        seasonNumber: 4,
        episodeNumber: 1,
        title: 'Back to School',
        airDate: futureDate,
        airstamp: futureAirstamp,
        isWatched: 0
      }
    ];

    // Seed into Dexie
    await dbModule.db.media.put(legacyShow);
    await dbModule.db.episodes.bulkPut(episodes);

    // Run backfill healer
    const healedCount = await dbModule.backfillMissingMediaMetadata();
    assert.equal(healedCount, 1);

    const healedShow = await dbModule.getMediaById('show_legacy_abbott');
    // Auto status transitioned to caught_up!
    assert.equal(healedShow.status, 'caught_up');
    // Next episode info is cleanly populated!
    assert.equal(healedShow.nextEpisodeSeason, 4);
    assert.equal(healedShow.nextEpisodeNumber, 1);
    assert.equal(healedShow.nextAirstamp, futureAirstamp);
  });
});
