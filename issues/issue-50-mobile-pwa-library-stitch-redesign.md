# Feature: Implement Stitch Mobile PWA Library UI Redesign (Header, Sync Banner, "Now In Progress" Carousel, 2-Column Grid & Bottom Nav)

## 📌 Summary
Redesign the mobile viewport (`< 768px`) of **BingeLog** to match the Google Stitch Mobile Home Screen exploration (`web application/stitch/projects/12735524155587802631/screens/277ab21abd9a4d1baf1747459fa96f1d`) while preserving the existing desktop experience on larger screens (`>= 768px`) — following the responsive approach from [App-Directory Issue #69](https://github.com/AshleyChrisanthus/App-Directory/issues/69).

---

## 🎯 User Story
> **As a mobile PWA user**, I want a thumb-friendly, native-feeling home screen with a horizontal "Now In Progress" carousel for quick `+1 Ep` logging, horizontally scrollable filter chips, a compact 2-column media poster grid, and a bottom navigation bar with a prominent center `+` button.

---

## 🖼️ UI Components & Stitch Specifications

### 1. Mobile Header Bar (`< 768px`)
- **Left**:
  - Rounded squircle brand icon (`#0a84ff` accent with play/film badge).
  - App Title (`BingeLog`) in bold white + `MOBILE` pill badge (`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-[var(--accent)]/15 text-[var(--accent)]`).
- **Right**:
  - **Cloud Sync Status Pill**: Compact status badge (`● SYNCED` with emerald green dot, `↻ SYNCING`, or `● OFFLINE`) that opens `CloudSyncModal` on tap.
  - **Filter / Sliders Button**: Circular glass icon button (`SlidersHorizontal`) opening the mobile sort/folders/options sheet.
  - **Theme / Profile Button**: Circular accent-tinted icon button opening `ThemeModal`.

### 2. Mobile Search Bar & Offline/Sync Status Strip
- **Search Input Pill**:
  - Full-width rounded pill bar (`rounded-2xl bg-[var(--bg-secondary)] border border-[var(--border-light)]`) with search icon, dynamic placeholder `Search {total} items or add...`, inline filter icon, and `⌘K` badge.
  - Tapping either filters the library inline or provides a 1-tap jump into `SearchModal` to add new media.
- **Sync & Storage Status Strip**:
  - Slim horizontal bar directly below search:
    - Left: Green status dot + `Offline IndexedDB • Synced {timeAgo}` (or `Local IndexedDB • {count} items` when cloud sync is unconfigured).
    - Right: `↻ SYNC NOW` action button in accent blue that triggers E2EE cloud sync + episode metadata refresh.

### 3. Dual-Row Horizontally Scrollable Filter Chips
- Replace the tall multi-row desktop `FilterBar` on mobile (`< 768px`) with two sleek, horizontally scrollable (`overflow-x-auto no-scrollbar`) chip tracks:
  - **Track 1 — Media Type Pills**:
    - `All Items {count}` (solid sky/accent fill `#38bdf8` / `var(--accent)` with dark/high-contrast text when active)
    - `📺 TV Shows {count}`
    - `🎬 Movies {count}`
    - `📖 Books {count}`
    - `🎧 Audio {count}`
  - **Track 2 — Watch Status Pills with Colored Semantic Dots**:
    - `● Watching ({count})` (amber dot `#f59e0b`, warm amber border/tint when active)
    - `● Caught Up ({count})` (emerald dot `#10b981`)
    - `● Plan to Watch ({count})` (sky blue dot `#38bdf8`)
    - `● Completed ({count})` (green dot)
    - `● On Hold ({count})` (purple/slate dot)
    - `● Dropped ({count})` (rose dot)

### 4. "Now In Progress" Horizontal Carousel (`src/components/mobile/NowInProgressCarousel.tsx`)
- Displayed near the top of the mobile Library view when the user has active `watching` (or pinned) items:
  - **Section Header**:
    - Left: Play circle icon + `Now In Progress` bold title + `{count} active` pill badge.
    - Right: `See All >` link in accent blue (filters collection to `watching`).
  - **Horizontal Snap Carousel (`flex gap-3.5 overflow-x-auto snap-x snap-mandatory`)**:
    - Each card (`w-[270px] sm:w-[300px] shrink-0 snap-start rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] overflow-hidden`):
      - **16:10 Landscape Image Header** (uses `backdropUrl` with fallback to `posterUrl`):
        - Top-left: Media type badge (`📺 TV`, `📖 Book`, `🎧 Audio`).
        - Top-right: Rating badge (`🌐 8.3`).
        - Bottom-left: Next episode countdown pill (`🕒 S5 E4 in 1d 12h`) or `● Watching` status badge.
      - **Card Body**:
        - Title (`Abbott Elementary`) + current pointer subtitle (`S5 E2 • {episodeTitle}` or `Page 142 • Reading`).
        - Progress label row (`79 / 100 eps` on left, `79%` in accent blue on right) + slim rounded progress bar.
      - **Card Footer**:
        - Left: Primary streaming provider pill (`● Hulu +3`, `● Netflix`, etc.) or format badge.
        - Right: Prominent accent pill button (`+ 1 Ep`, `+ 10 p`, or `+ 15m`) for 1-tap progress logging without leaving the home screen.

### 5. "Your Media Collection" 2-Column Mobile Poster Grid
- **Section Header**:
  - Left: Pin/Collection icon + `Your Media Collection` + `{total} total` subtitle.
  - Right: Segmented Grid (`LayoutGrid`) vs Compact List (`List`) toggle buttons.
- **2-Column Poster Grid (`grid-cols-2 gap-3` on `< 640px`)**:
  - **Poster Container (`aspect-[2/3]`)**:
    - Top-left: Media type badge (`🎬 Movie`, `📺 TV`, `📖 Book`).
    - Top-right: Community/user rating badge (`🌐 8.0`).
    - Bottom-right Quick Action Overlay:
      - Movies: Circular checkmark button (`✓`) — dark translucent when unwatched, solid emerald green (`#10b981`) when completed.
      - TV Shows (Watching): Solid accent blue pill `+ 1 Ep`.
      - TV Shows (Caught Up): Solid emerald pill `📈 8/8`.
      - Books / Audiobooks: Solid emerald/accent pill `+ 10 p` or `+ 15m`.
  - **Card Details Footer**:
    - 1-line truncated bold title (`Matchbox`, `Lanterns`, `Dune: Part Two`, `X-Men '97`).
    - Metadata + Status pill row (`2026 • [Plan to Watch]`, `2026 • [Caught Up]`, `J.K. Rowling • [Reading]`).
    - Bottom tag row: Streaming provider / format pills (`► Digital`, `DCU`, `HBO Max`, `Disney+`, `● Netflix`) or book page progress (`0 / 302 p` and `0%`).

### 6. Mobile Bottom Navigation Bar with Center `+` FAB (`src/components/mobile/MobileBottomNav.tsx`)
- Fixed bottom navigation bar (`fixed bottom-0 inset-x-0 z-40 md:hidden`) with frosted glass backdrop (`bg-[#0d0d0f]/90 backdrop-blur-2xl border-t border-[var(--border-light)]`) and safe-area bottom padding:
  1. **Library** (`Library` / `Film` icon) — Main media collection view.
  2. **Graph** (`Network` icon) — Switches to `FranchiseCanvasView`.
  3. **Center Glowing `+` FAB** — Elevated circular `52x52px` primary accent button (`bg-[var(--accent)] text-white shadow-lg shadow-[var(--accent)]/40`) that opens `SearchModal` (with quick toggle to Manual Entry).
  4. **Upcoming** (`Clock` / `Calendar` icon with notification dot) — Switches to Upcoming Releases view.
  5. **Settings** (`Settings` icon with status dot) — Opens `SettingsModal`.

---

## ✅ Acceptance Criteria
- [ ] On viewports `< 768px`, the Stitch mobile header, search bar, sync status strip, and 2-row horizontal filter chips render cleanly.
- [ ] "Now In Progress" horizontal carousel displays active `watching` items with landscape artwork, countdown badges, progress bars, streaming tags, and working `+ 1 Ep` / `+ 10 p` buttons.
- [ ] "Your Media Collection" renders in a 2-column poster grid on mobile with Stitch badge placements, quick action overlays, status pills, and streaming tags.
- [ ] Fixed 5-item bottom navigation bar with center glowing `+` FAB switches seamlessly between Library, Graph, Add/Search, Upcoming, and Settings.
- [ ] Desktop layout (`>= 768px`) remains unchanged.
