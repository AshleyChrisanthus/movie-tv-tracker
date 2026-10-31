import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('Tier 1: Issue #52 Mobile Navigation Polish, Dedicated Upcoming Tab & Mobile Folders/Sort Sheet', () => {
  const rootDir = process.cwd();

  describe('1. Scroll-Aware Auto-Hiding Mobile Bottom Navigation Bar & Center FAB', () => {
    const bottomNavPath = path.join(rootDir, 'src', 'components', 'mobile', 'MobileBottomNav.tsx');
    const cssPath = path.join(rootDir, 'src', 'index.css');

    it('should implement scroll listener with requestAnimationFrame and hide/reveal conditions in MobileBottomNav', () => {
      assert.ok(fs.existsSync(bottomNavPath), 'MobileBottomNav.tsx must exist');
      const code = fs.readFileSync(bottomNavPath, 'utf8');

      // RequestAnimationFrame & passive scroll
      assert.ok(code.includes('requestAnimationFrame'), 'Must use requestAnimationFrame for scroll-aware state updates');
      assert.ok(code.includes('addEventListener') && code.includes("'scroll'"), 'Must register scroll listener');
      assert.ok(code.includes('passive: true'), 'Must use passive scroll listeners to avoid main thread jank');

      // Hide condition (deltaY > 10 && currentScrollY > 60)
      assert.ok(code.includes('deltaY > 10') && code.includes('currentScrollY > 60'), 'Must hide when deltaY > 10px and scrollY > 60px');
      assert.ok(code.includes('nav-hidden'), 'Must apply nav-hidden class when hidden');
      assert.ok(code.includes('translate-y-[120%]'), 'Must translate down 120% when hidden');
      assert.ok(code.includes('opacity-0'), 'Must set opacity-0 when hidden');
      assert.ok(code.includes('pointer-events-none'), 'Must disable pointer events when hidden');

      // Reveal conditions (deltaY < -8, top scroll <= 40, or bottom of page)
      assert.ok(code.includes('deltaY < -8'), 'Must reveal when scrolling up (deltaY < -8px)');
      assert.ok(code.includes('currentScrollY <= 40'), 'Must reveal when at the top (scrollY <= 40px)');
      assert.ok(code.includes('docHeight - 20'), 'Must reveal when hitting bottom of page');

      // Transition timing: 250ms cubic-bezier(0.22, 1, 0.36, 1)
      assert.ok(code.includes('250ms'), 'Must transition over 250ms');
      assert.ok(code.includes('cubic-bezier(0.22, 1, 0.36, 1)') || code.includes('cubic-bezier(0.22,1,0.36,1)'), 'Must use cubic-bezier(0.22, 1, 0.36, 1)');

      // Center FAB is inside nav so it auto-hides with the bottom bar
      assert.ok(code.includes('Plus'), 'Center + FAB must be rendered in bottom nav bar');
      assert.ok(code.includes('-translate-y-4'), 'Center + FAB must be elevated inside the nav bar container');
    });

    it('should define .nav-hidden utility in index.css', () => {
      assert.ok(fs.existsSync(cssPath), 'index.css must exist');
      const css = fs.readFileSync(cssPath, 'utf8');
      assert.ok(css.includes('.nav-hidden'), 'index.css must declare .nav-hidden');
      assert.ok(css.includes('translateY(120%)'), '.nav-hidden must translate by 120%');
      assert.ok(css.includes('pointer-events: none'), '.nav-hidden must include pointer-events: none');
    });
  });

  describe('2. Dedicated Mobile Upcoming Tab View (MobileUpcomingView.tsx)', () => {
    const upcomingPath = path.join(rootDir, 'src', 'components', 'mobile', 'MobileUpcomingView.tsx');
    const appPath = path.join(rootDir, 'src', 'App.tsx');

    it('should exist and define MobileUpcomingView with horizon chips and chronological sections', () => {
      assert.ok(fs.existsSync(upcomingPath), 'MobileUpcomingView.tsx must exist');
      const code = fs.readFileSync(upcomingPath, 'utf8');

      // Time horizon filter chips
      assert.ok(code.includes('Next 7 Days'), 'Should include "Next 7 Days" filter chip');
      assert.ok(code.includes('Next 14 Days'), 'Should include "Next 14 Days" filter chip');
      assert.ok(code.includes('Next 30 Days'), 'Should include "Next 30 Days" filter chip');
      assert.ok(code.includes('All Upcoming'), 'Should include "All Upcoming" filter chip');

      // Chronological grouping
      assert.ok(code.includes('Airing Today & Tomorrow') || code.includes('Airing Today / Tomorrow'), 'Must group Airing Today / Tomorrow');
      assert.ok(code.includes('This Week'), 'Must group This Week');
      assert.ok(code.includes('Later & Coming Soon') || code.includes('Later / Coming Soon'), 'Must group Later / Coming Soon');

      // Live countdowns
      assert.ok(code.includes('countdownText') || code.includes('In '), 'Must generate live countdown strings');
      assert.ok(code.includes('getEpisodeCountdown'), 'Must use getEpisodeCountdown for un-aired episodes');

      // Detail modal trigger
      assert.ok(code.includes('onItemClick'), 'Must trigger onItemClick when tapping upcoming cards');
    });

    it('should wire Upcoming tab in App.tsx to display MobileUpcomingView on mobile', () => {
      assert.ok(fs.existsSync(appPath), 'App.tsx must exist');
      const appCode = fs.readFileSync(appPath, 'utf8');

      assert.ok(appCode.includes('MobileUpcomingView'), 'App.tsx must import MobileUpcomingView');
      assert.ok(appCode.includes('isMobileUpcomingView'), 'App.tsx must manage isMobileUpcomingView state');
      assert.ok(appCode.includes('isUpcomingActive={isMobileUpcomingView}'), 'MobileBottomNav must receive isMobileUpcomingView');
      assert.ok(appCode.includes('upcomingCount={upcomingCount}'), 'MobileBottomNav must display upcoming count badge');
    });
  });

  describe('3. Mobile Folders / Custom Lists & Sort Bottom Sheet (MobileFilterSheet.tsx)', () => {
    const filterSheetPath = path.join(rootDir, 'src', 'components', 'mobile', 'MobileFilterSheet.tsx');
    const appPath = path.join(rootDir, 'src', 'App.tsx');

    it('should render Custom Lists & Folders with real-time item counts and manage button', () => {
      assert.ok(fs.existsSync(filterSheetPath), 'MobileFilterSheet.tsx must exist');
      const code = fs.readFileSync(filterSheetPath, 'utf8');

      // Folders & Lists
      assert.ok(code.includes('Custom Lists & Folders') || code.includes('Folders & Lists'), 'Must render Custom Lists / Folders section');
      assert.ok(code.includes('All Library'), 'Must render All Library pill');
      assert.ok(code.includes('Manage / New List') || code.includes('+ Manage / New List'), 'Must include Manage / New List button');
      assert.ok(code.includes('totalLibraryCount') || code.includes('listCounts'), 'Must compute item counts for custom lists');

      // Pinned section toggle
      assert.ok(code.includes('Pinned Section') || code.includes('Pinned Cards Section'), 'Must render Pinned Section toggle');
      assert.ok(code.includes('onTogglePinnedView'), 'Must provide toggle callback for pinned cards');

      // Sort By selector
      assert.ok(code.includes('Recently Updated'), 'Must include "Recently Updated" sort option');
      assert.ok(code.includes('Title (A–Z)'), 'Must include "Title (A–Z)" sort option');
      assert.ok(code.includes('My Rating'), 'Must include "My Rating" sort option');
      assert.ok(code.includes('Community Rating'), 'Must include "Community Rating" sort option');
      assert.ok(code.includes('Release Date'), 'Must include "Release Date" sort option');
      assert.ok(code.includes('Last Aired'), 'Must include "Last Aired" sort option');

      // Book Format Sub-Filter
      assert.ok(code.includes('Book Format Sub-Filter') || code.includes('Book Format'), 'Must support Book Format Sub-Filter');
      assert.ok(code.includes('All Books'), 'Must include "All Books" sub-filter');
      assert.ok(code.includes('📖 Reading'), 'Must include "📖 Reading" sub-filter');
      assert.ok(code.includes('🎧 Audiobooks'), 'Must include "🎧 Audiobooks" sub-filter');
    });

    it('should support triggering MobileFilterSheet from mobile header and search strip in App.tsx', () => {
      assert.ok(fs.existsSync(appPath), 'App.tsx must exist');
      const appCode = fs.readFileSync(appPath, 'utf8');

      // Trigger from header
      assert.ok(appCode.includes('onOpenFilterSheet={() => setIsMobileFilterOpen(true)}'), 'MobileHeader should trigger filter sheet');

      // Trigger from search strip
      assert.ok(appCode.includes('MobileSearchStrip') && appCode.includes('onOpenFilterSheet'), 'MobileSearchStrip should support opening filter sheet');

      // Custom list count wiring
      assert.ok(appCode.includes('items={mediaList}'), 'App.tsx must pass mediaList to MobileFilterSheet for item counts');
      assert.ok(appCode.includes('bookFormatFilter={bookFormatFilter}'), 'App.tsx must pass bookFormatFilter to MobileFilterSheet');
    });
  });
});
