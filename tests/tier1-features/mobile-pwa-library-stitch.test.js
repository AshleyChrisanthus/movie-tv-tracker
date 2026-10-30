import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('Tier 1: Issue #50 Mobile PWA Library Stitch Redesign', () => {
  const rootDir = process.cwd();

  describe('1. Mobile Header Bar (< 768px)', () => {
    const headerPath = path.join(rootDir, 'src', 'components', 'mobile', 'MobileHeader.tsx');

    it('should exist and define responsive mobile header component', () => {
      assert.ok(fs.existsSync(headerPath), 'MobileHeader.tsx must exist');
      const code = fs.readFileSync(headerPath, 'utf8');

      // Check brand and title
      assert.ok(code.includes('BingeLog'), 'Header should render BingeLog brand');
      assert.ok(code.includes('MOBILE'), 'Header should render MOBILE badge');
      assert.ok(code.includes('md:hidden'), 'Header must be hidden on desktop (md:hidden)');
      assert.ok(code.includes('sticky top-0'), 'Header should be sticky at top');

      // Check actions: Cloud sync pill, Sliders button, Theme button
      assert.ok(code.includes('cloudSyncStatus'), 'Header should accept cloudSyncStatus');
      assert.ok(code.includes('SlidersHorizontal'), 'Header should render SlidersHorizontal button');
      assert.ok(code.includes('Palette'), 'Header should render theme/profile Palette button');
      assert.ok(code.includes('SYNCED'), 'Header should render SYNCED badge');
    });
  });

  describe('2. Mobile Search Bar & Sync Status Strip', () => {
    const searchPath = path.join(rootDir, 'src', 'components', 'mobile', 'MobileSearchStrip.tsx');

    it('should exist and render full-width search input with ⌘K badge and sync status strip', () => {
      assert.ok(fs.existsSync(searchPath), 'MobileSearchStrip.tsx must exist');
      const code = fs.readFileSync(searchPath, 'utf8');

      assert.ok(code.includes('Search'), 'SearchStrip should render search input');
      assert.ok(code.includes('⌘K'), 'SearchStrip should render ⌘K quick action badge');
      assert.ok(code.includes('Offline IndexedDB'), 'SearchStrip should display Offline IndexedDB status');
      assert.ok(code.includes('SYNC NOW'), 'SearchStrip should display SYNC NOW trigger');
      assert.ok(code.includes('PAIR DEVICE'), 'SearchStrip should display PAIR DEVICE when unconfigured');
    });
  });

  describe('3. Dual-Row Horizontally Scrollable Filter Chips', () => {
    const chipsPath = path.join(rootDir, 'src', 'components', 'mobile', 'MobileFilterChips.tsx');

    it('should exist and render Track 1 Media Types and Track 2 Watch Statuses with Semantic Dots', () => {
      assert.ok(fs.existsSync(chipsPath), 'MobileFilterChips.tsx must exist');
      const code = fs.readFileSync(chipsPath, 'utf8');

      // Track 1 — Media Types
      assert.ok(code.includes('All Items'), 'Should include All Items pill');
      assert.ok(code.includes('📺 TV Shows'), 'Should include TV Shows pill');
      assert.ok(code.includes('🎬 Movies'), 'Should include Movies pill');
      assert.ok(code.includes('📖 Books'), 'Should include Books pill');
      assert.ok(code.includes('🎧 Audio'), 'Should include Audio pill');

      // Track 2 — Statuses
      assert.ok(code.includes('Watching'), 'Should include Watching status pill');
      assert.ok(code.includes('Caught Up'), 'Should include Caught Up status pill');
      assert.ok(code.includes('Plan to Watch'), 'Should include Plan to Watch status pill');
      assert.ok(code.includes('Completed'), 'Should include Completed status pill');
      assert.ok(code.includes('On Hold'), 'Should include On Hold status pill');
      assert.ok(code.includes('Dropped'), 'Should include Dropped status pill');

      // Horizontal scrolling
      assert.ok(code.includes('overflow-x-auto'), 'Pills tracks should support horizontal scrolling');
      assert.ok(code.includes('scrollbar-none') || code.includes('no-scrollbar'), 'Pills tracks should hide scrollbars');
    });
  });

  describe('4. "Now In Progress" Horizontal Carousel', () => {
    const carouselPath = path.join(rootDir, 'src', 'components', 'mobile', 'NowInProgressCarousel.tsx');

    it('should exist and render 16:10 landscape header, progress bar, and 1-tap logging CTA', () => {
      assert.ok(fs.existsSync(carouselPath), 'NowInProgressCarousel.tsx must exist');
      const code = fs.readFileSync(carouselPath, 'utf8');

      assert.ok(code.includes('Now In Progress'), 'Should render Now In Progress title');
      assert.ok(code.includes('active'), 'Should render active badge');
      assert.ok(code.includes('aspect-[16/10]'), 'Cards must have 16:10 landscape image header');
      assert.ok(code.includes('backdropUrl') && code.includes('posterUrl'), 'Cards should use backdropUrl with fallback to posterUrl');
      assert.ok(code.includes('+1 Ep'), 'Should render +1 Ep logging button');
      assert.ok(code.includes('+10 p'), 'Should render +10 p book button');
      assert.ok(code.includes('+15m'), 'Should render +15m audio button');
      assert.ok(code.includes('snap-x'), 'Carousel should use horizontal snap scrolling');
    });
  });

  describe('5. "Your Media Collection" 2-Column Mobile Poster Grid & MediaCard Badges', () => {
    const cardPath = path.join(rootDir, 'src', 'components', 'MediaCard.tsx');

    it('should render rating badge overlay, TV caught-up status indicator, and circular movie checkmark', () => {
      assert.ok(fs.existsSync(cardPath), 'MediaCard.tsx must exist');
      const code = fs.readFileSync(cardPath, 'utf8');

      // Rating overlay on poster
      assert.ok(code.includes('communityRating') || code.includes('rating'), 'MediaCard should render rating badge overlay');

      // Caught-up badge
      assert.ok(code.includes('caught_up') && code.includes('📈'), 'MediaCard should render 📈 caught up indicator');

      // Circular checkmark button for movies
      assert.ok(code.includes('rounded-full') && code.includes('Check'), 'MediaCard movie checkmark button should be circular (rounded-full)');
    });
  });

  describe('6. Mobile Bottom Navigation Bar with Center + FAB', () => {
    const navPath = path.join(rootDir, 'src', 'components', 'mobile', 'MobileBottomNav.tsx');

    it('should exist and render 5 navigation destinations with elevated center 52x52px FAB', () => {
      assert.ok(fs.existsSync(navPath), 'MobileBottomNav.tsx must exist');
      const code = fs.readFileSync(navPath, 'utf8');

      assert.ok(code.includes('Library'), 'Nav must include Library tab');
      assert.ok(code.includes('Graph'), 'Nav must include Graph tab');
      assert.ok(code.includes('Upcoming'), 'Nav must include Upcoming tab');
      assert.ok(code.includes('Settings'), 'Nav must include Settings tab');

      // 52x52px elevated center button
      assert.ok(code.includes('w-[52px] h-[52px]'), 'Center FAB must be 52x52px');
      assert.ok(code.includes('-translate-y-4') || code.includes('-translate-y-3'), 'Center FAB must be elevated');
      assert.ok(code.includes('fixed bottom-0'), 'Nav must be fixed at bottom');
      assert.ok(code.includes('md:hidden'), 'Nav must be hidden on desktop (md:hidden)');
    });
  });

  describe('7. App Integration & Desktop Preservation', () => {
    const appPath = path.join(rootDir, 'src', 'App.tsx');
    const navbarPath = path.join(rootDir, 'src', 'components', 'Navbar.tsx');

    it('should integrate all Stitch mobile components in App.tsx while preserving desktop layout', () => {
      const appCode = fs.readFileSync(appPath, 'utf8');
      const navCode = fs.readFileSync(navbarPath, 'utf8');

      // App imports and uses mobile components
      assert.ok(appCode.includes('MobileHeader'), 'App should import MobileHeader');
      assert.ok(appCode.includes('MobileSearchStrip'), 'App should import MobileSearchStrip');
      assert.ok(appCode.includes('MobileFilterChips'), 'App should import MobileFilterChips');
      assert.ok(appCode.includes('NowInProgressCarousel'), 'App should import NowInProgressCarousel');
      assert.ok(appCode.includes('MobileBottomNav'), 'App should import MobileBottomNav');
      assert.ok(appCode.includes('MobileFilterSheet'), 'App should import MobileFilterSheet');

      // Mobile Collection Section Header
      assert.ok(appCode.includes('Your Media Collection'), 'App should render Your Media Collection header on mobile');

      // Desktop Navbar preservation
      assert.ok(navCode.includes('hidden md:block'), 'Navbar must be hidden on mobile and visible on desktop (hidden md:block)');

      // Desktop FilterBar preservation
      assert.ok(appCode.includes('hidden md:block') && appCode.includes('<FilterBar'), 'Desktop FilterBar must be hidden on mobile');
    });

    it('should provide no-scrollbar utilities in index.css', () => {
      const cssPath = path.join(rootDir, 'src', 'index.css');
      const css = fs.readFileSync(cssPath, 'utf8');
      assert.ok(css.includes('.no-scrollbar') && css.includes('.scrollbar-none'), 'index.css must provide no-scrollbar utilities');
    });
  });
});
