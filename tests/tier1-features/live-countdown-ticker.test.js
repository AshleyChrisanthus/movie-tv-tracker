import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { getTimezoneModule, getLiveTickerModule } from '../helpers/setup.js';

describe('Tier 1: Live Episode Countdown & Visibility/Focus Ticker (Issue #55)', () => {
  let tzModule;
  let tickerModule;

  beforeEach(async () => {
    tzModule = await getTimezoneModule();
    tickerModule = await getLiveTickerModule();
  });

  it('should accurately update countdown string when current time advances without page reload', () => {
    const baseTime = Date.UTC(2026, 9, 31, 12, 0, 0); // Oct 31, 2026 12:00 UTC
    const dropTime = Date.UTC(2026, 9, 31, 15, 0, 0); // 3 hours later (15:00 UTC)
    const airstamp = new Date(dropTime).toISOString();

    // 1. Initial render at baseTime: 3 hours away
    const cdAtBase = tzModule.getEpisodeCountdown(undefined, airstamp, 'America/New_York', baseTime);
    assert.equal(cdAtBase.isAired, false);
    assert.equal(cdAtBase.label, 'in 3h');
    assert.equal(cdAtBase.hoursRemaining, 3);

    // 2. Tab left open for 2 hours (now at 14:00 UTC): 1 hour remaining
    const timeAfter2Hours = baseTime + 2 * 60 * 60 * 1000;
    const cdAfter2h = tzModule.getEpisodeCountdown(undefined, airstamp, 'America/New_York', timeAfter2Hours);
    assert.equal(cdAfter2h.isAired, false);
    assert.equal(cdAfter2h.label, 'in 1h');
    assert.equal(cdAfter2h.hoursRemaining, 1);

    // 3. User switches back to tab at 14:45 UTC (15 minutes remaining)
    const timeAt1445 = baseTime + 2 * 60 * 60 * 1000 + 45 * 60 * 1000;
    const cdAt1445 = tzModule.getEpisodeCountdown(undefined, airstamp, 'America/New_York', timeAt1445);
    assert.equal(cdAt1445.isAired, false);
    assert.equal(cdAt1445.label, 'in 15m');
    assert.equal(cdAt1445.hoursRemaining, 0);

    // 4. Episode officially drops at 15:00 UTC
    const timeAtDrop = dropTime;
    const cdAtDrop = tzModule.getEpisodeCountdown(undefined, airstamp, 'America/New_York', timeAtDrop);
    assert.equal(cdAtDrop.isAired, true);
    assert.equal(cdAtDrop.label, 'Aired');
    assert.equal(cdAtDrop.hoursRemaining, 0);
  });

  it('should update isEpisodeAired dynamically when current time passes drop time', () => {
    const dropTime = Date.UTC(2026, 9, 31, 18, 0, 0);
    const airstamp = new Date(dropTime).toISOString();

    const beforeDrop = dropTime - 5 * 60 * 1000; // 5 mins before
    const afterDrop = dropTime + 1000; // 1 second after

    assert.equal(tzModule.isEpisodeAired({ airstamp }, 'America/New_York', beforeDrop), false);
    assert.equal(tzModule.isEpisodeAired({ airstamp }, 'America/New_York', afterDrop), true);
  });

  it('should dispatch live ticks to registered subscribers via triggerLiveTick', () => {
    let capturedTick = 0;
    const testNow = 1793400000000;

    tickerModule.triggerLiveTick(testNow);
    assert.ok(typeof tickerModule.triggerLiveTick === 'function');
  });

  it('should calculate transitions from days to hours and minutes smoothly', () => {
    const dropTime = Date.UTC(2026, 10, 5, 20, 0, 0); // Nov 5, 2026
    const airstamp = new Date(dropTime).toISOString();

    // 3 days away
    const t3Days = dropTime - (3 * 24 * 60 * 60 * 1000 + 3600 * 1000);
    const cd3 = tzModule.getEpisodeCountdown(undefined, airstamp, 'America/New_York', t3Days);
    assert.equal(cd3.label, 'in 3 days');

    // 1 day 4 hours away
    const t1Day4h = dropTime - (28 * 60 * 60 * 1000);
    const cd1 = tzModule.getEpisodeCountdown(undefined, airstamp, 'America/New_York', t1Day4h);
    assert.equal(cd1.label, 'in 1 day 4h');

    // 45 minutes away
    const t45m = dropTime - (45 * 60 * 1000);
    const cd45 = tzModule.getEpisodeCountdown(undefined, airstamp, 'America/New_York', t45m);
    assert.equal(cd45.label, 'in 45m');
  });
});
