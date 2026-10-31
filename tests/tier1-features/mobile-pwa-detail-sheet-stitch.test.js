import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('Tier 1: Issue #51 Stitch Mobile Media Details Bottom Sheet & Episode Tracker', () => {
  const rootDir = process.cwd();
  const sheetPath = path.join(rootDir, 'src', 'components', 'mobile', 'MobileMediaDetailSheet.tsx');
  const modalPath = path.join(rootDir, 'src', 'components', 'MediaDetailModal.tsx');

  describe('1. Mobile Details Top Bar & Pull-Up Sheet Frame (< 768px)', () => {
    it('should exist and define responsive mobile bottom sheet component', () => {
      assert.ok(fs.existsSync(sheetPath), 'MobileMediaDetailSheet.tsx must exist');
      const code = fs.readFileSync(sheetPath, 'utf8');

      // Hidden on desktop, visible on mobile
      assert.ok(code.includes('md:hidden'), 'Sheet must be hidden on desktop (md:hidden)');

      // Top app bar elements
      assert.ok(code.includes('ChevronLeft'), 'Top bar must have ChevronLeft back button');
      assert.ok(code.includes('Media Details'), 'Top bar must render Media Details heading');
      assert.ok(code.includes('Pin'), 'Top bar must render bookmark/pin toggle button');
      assert.ok(code.includes('Palette'), 'Top bar must render theme/palette button');

      // Pull-up sheet surface & handle
      assert.ok(code.includes('rounded-t-3xl'), 'Sheet surface must have rounded-t-3xl top container');
      assert.ok(code.includes('w-10 h-1 rounded-full bg-white/20'), 'Sheet surface must render centered drag handle pill');
      assert.ok(code.includes('ChevronDown'), 'Sheet must have collapse ChevronDown button');
      assert.ok(code.includes('Franchise Canvas'), 'Sheet action row must include Franchise Canvas pill shortcut');
      assert.ok(code.includes('Share2'), 'Sheet action row must include Share2 button');
    });
  });

  describe('2. Side-by-Side Hero Metadata Block', () => {
    it('should render poster with media type overlay, bold title, compact metadata, rating/score pills and expandable synopsis', () => {
      const code = fs.readFileSync(sheetPath, 'utf8');

      // Left Column Poster & badge
      assert.ok(code.includes('aspect-[2/3]'), 'Hero poster must have aspect-[2/3]');
      assert.ok(code.includes('📺 TV') && code.includes('🎬 Movie') && code.includes('📖 Book'), 'Poster must overlay media type pill');

      // Right Column Metadata
      assert.ok(code.includes('text-xl font-bold'), 'Title must be bold text-xl');
      assert.ok(code.includes('Score') && code.includes('ThumbsUp'), 'Must render match/score pill');
      assert.ok(code.includes('Globe'), 'Must render public/community rating pill');
      assert.ok(code.includes('line-clamp-3'), 'Synopsis must clamp to 3 lines by default');
      assert.ok(code.includes('Read more') && code.includes('Show less'), 'Synopsis must support tap-to-expand');
    });
  });

  describe('3. Horizontal Status Pill Selector', () => {
    it('should render single-row scrollable status track with semantic dots and amber watching highlight', () => {
      const code = fs.readFileSync(sheetPath, 'utf8');

      // Status options
      assert.ok(code.includes('Watching'), 'Should include Watching status pill');
      assert.ok(code.includes('Plan to Watch'), 'Should include Plan to Watch status pill');
      assert.ok(code.includes('Caught Up'), 'Should include Caught Up status pill');
      assert.ok(code.includes('Completed'), 'Should include Completed status pill');
      assert.ok(code.includes('On Hold'), 'Should include On Hold status pill');
      assert.ok(code.includes('Dropped'), 'Should include Dropped status pill');

      // Semantic warm amber highlight for Watching
      assert.ok(code.includes('#f59e0b') || code.includes('border-amber-500'), 'Watching status must use warm gold/amber styling');
      assert.ok(code.includes('overflow-x-auto'), 'Status pills track must support horizontal scrolling');
      assert.ok(code.includes('no-scrollbar') || code.includes('scrollbar-none'), 'Status pills track must hide scrollbars');
    });
  });

  describe('4. "Current Pace" Progress & Next-Up Action Card', () => {
    it('should render Current Pace card, progress track, full-width primary CTA and next-episode countdown banner', () => {
      const code = fs.readFileSync(sheetPath, 'utf8');

      // Header row
      assert.ok(code.includes('Current Pace'), 'Card must have Current Pace label');
      assert.ok(code.includes('PlayCircle'), 'Card header must have PlayCircle icon');

      // Progress bar & stats
      assert.ok(code.includes('complete'), 'Must display percentage complete');
      assert.ok(code.includes('rounded-full bg-white/10'), 'Must render rounded progress track');

      // Primary thumb CTA button
      assert.ok(code.includes('h-12 rounded-xl bg-[#38bdf8]'), 'Primary CTA must be full-width 48px (h-12) accent button in bg-[#38bdf8]');
      assert.ok(code.includes('+1 Ep'), 'Primary CTA should render dynamic +1 Ep for TV');
      assert.ok(code.includes('+10 Pages') || code.includes('+15m'), 'Primary CTA should support books and audiobooks');
      assert.ok(code.includes('Mark as Watched') || code.includes('Watched'), 'Primary CTA should support movie completion');

      // Secondary batch action button
      assert.ok(code.includes('CheckCheck'), 'Must render secondary CheckCheck button for quick batch actions');

      // Next Episode countdown box
      assert.ok(code.includes('Clock'), 'Countdown box must have Clock icon');
      assert.ok(code.includes('Bell'), 'Countdown box must have Bell icon');
    });
  });

  describe('5. "Season Episodes" Horizontal Pill Tabs & Episode Log List (TV Shows)', () => {
    it('should render horizontal season selector with (Current) badge and 3 episode card states', () => {
      const code = fs.readFileSync(sheetPath, 'utf8');

      assert.ok(code.includes('Season Episodes'), 'Must render Season Episodes header');
      assert.ok(code.includes('(Current)'), 'Season selector must indicate current season with (Current)');
      assert.ok(code.includes('bg-[#38bdf8] text-slate-950'), 'Selected season pill must be styled in solid accent blue');

      // State 1: Watched
      assert.ok(code.includes('bg-emerald-500/20 text-emerald-400'), 'Watched episode must render emerald check circle');
      assert.ok(code.includes('Watched'), 'Watched episode must display Watched badge');

      // State 2: Up Next (Highlighted)
      assert.ok(code.includes('border-[#38bdf8]/60') && code.includes('bg-[#38bdf8]/5'), 'Up Next episode must have highlighted accent border and tint');
      assert.ok(code.includes('Up Next'), 'Up Next episode must display Up Next label');
      assert.ok(code.includes('✓ Log'), 'Up Next episode must render interactive ✓ Log button');

      // State 3: Unwatched
      assert.ok(code.includes('Unwatched'), 'Unwatched episode must display Unwatched badge');
      assert.ok(code.includes('Mark up to here'), 'Unwatched episode must provide Mark up to here strike-off');
    });
  });

  describe('6. "Where to Watch" & Sticky Bottom Storage Bar', () => {
    it('should render streaming provider pills with refresh button and sticky IndexedDB status footer', () => {
      const code = fs.readFileSync(sheetPath, 'utf8');

      // Where to Watch
      assert.ok(code.includes('Where to Watch'), 'Must render Where to Watch section');
      assert.ok(code.includes('RefreshCw'), 'Where to Watch must render RefreshCw button');
      assert.ok(code.includes('watchProviders') || code.includes('streamingProviders'), 'Must render streaming providers');

      // Sticky Bottom Footer Bar
      assert.ok(code.includes('sticky bottom-0'), 'Storage bar must be sticky at bottom');
      assert.ok(code.includes('Saved locally (IndexedDB)'), 'Must indicate Saved locally (IndexedDB)');
      assert.ok(code.includes('CheckCircle2'), 'Must render CheckCircle2 icon in status footer');
    });
  });

  describe('7. MediaDetailModal Integration & Desktop Preservation', () => {
    it('should import and render MobileMediaDetailSheet on mobile while preserving desktop modal', () => {
      assert.ok(fs.existsSync(modalPath), 'MediaDetailModal.tsx must exist');
      const modalCode = fs.readFileSync(modalPath, 'utf8');

      // Mobile import & integration
      assert.ok(modalCode.includes('MobileMediaDetailSheet'), 'MediaDetailModal must import MobileMediaDetailSheet');
      assert.ok(modalCode.includes('<MobileMediaDetailSheet'), 'MediaDetailModal must render MobileMediaDetailSheet');

      // Desktop layout preservation
      assert.ok(modalCode.includes('hidden md:flex'), 'Desktop modal must be hidden on mobile and visible on desktop (hidden md:flex)');
    });
  });
});
