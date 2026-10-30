# Feature: Mobile Navigation Polish — Scroll-Aware Auto-Hiding Bottom Bar, Dedicated Upcoming Tab & Mobile Folders/Sort Sheet

## 📌 Summary
Complete the mobile PWA experience by implementing:
1. **Scroll-aware auto-hiding** for the Mobile Bottom Navigation Bar and center `+` FAB when scrolling down (matching [App-Directory Issue #70](https://github.com/AshleyChrisanthus/App-Directory/issues/70)).
2. A dedicated **Mobile `Upcoming` Tab View** (triggered from the `Upcoming` tab in the Stitch Bottom Navigation Bar) showing airing episodes and upcoming movies/books grouped chronologically.
3. A **Mobile Folders / Custom Lists & Sort Bottom Sheet** (matching [App-Directory Issue #71](https://github.com/AshleyChrisanthus/App-Directory/issues/71)) triggered from the mobile header sliders button so mobile users can switch custom lists/folders, create lists, and change sort orders.

---

## 🎯 User Story
> **As a mobile user**, I want the bottom navigation bar and floating `+` button to smoothly slide out of the way when I scroll down through my 2-column poster collection, and reappear immediately when I scroll up.  
> **As a mobile user**, I want the `Upcoming` tab in the bottom bar to show me a chronological schedule of upcoming episodes and releases, and I want to access my custom lists/folders and sort options via a clean mobile bottom sheet.

---

## 🛠️ Key Requirements & Specifications

### 1. Scroll-Aware Auto-Hiding Bottom Bar & Center FAB
- Track `window.scrollY` (and main scroll container position) using a passive `scroll` listener with `requestAnimationFrame`:
  - **Hide Condition**: Scrolling down with `deltaY > 10px` once `scrollY > 60px` adds a `.nav-hidden` state (`translate-y-[120%] opacity-0 pointer-events-none`) to `MobileBottomNav`.
  - **Reveal Condition**: Scrolling up (`deltaY < -8px`), reaching the top (`scrollY <= 40px`), or reaching the bottom of the page immediately removes `.nav-hidden` with a smooth `250ms cubic-bezier(0.22, 1, 0.36, 1)` transition.

### 2. Dedicated Mobile `Upcoming` Tab View (`src/components/mobile/MobileUpcomingView.tsx`)
- Activated when tapping the **`Upcoming`** tab (with live notification dot badge) in `MobileBottomNav`:
  - **Time Horizon Filter Chips**: `Next 7 Days`, `Next 14 Days`, `Next 30 Days`, `All Upcoming` (wired to `upcomingDays` and `upcomingFilter`).
  - **Chronological Grouping**:
    - **Airing Today / Tomorrow**: Highlighted cards with live countdowns (`In 23h 14m`).
    - **This Week**: TV shows with `nextEpisodeAirDate` and movies/books releasing within 7 days.
    - **Later / Coming Soon**: Future scheduled releases sorted chronologically by release/air date.
  - Clicking any upcoming card opens `MediaDetailModal` directly to its upcoming season/release info.

### 3. Mobile Folders / Custom Lists & Sort Bottom Sheet (`src/components/mobile/MobileFilterSheet.tsx`)
- Triggered by tapping the **Sliders / Filter icon button** in the top-right of the Stitch Mobile Header (or the filter icon inside the mobile search bar):
  - **Custom Lists / Folders Section**:
    - Displays `All Library` + all user `customLists` as tappable pills/rows with item counts.
    - Includes `+ Manage / New List` button opening `ListManagerModal`.
  - **Pinned Section Toggle**:
    - Quick switch to show/hide pinned cards (`showPinnedView`).
  - **Sort By Selector**:
    - Touch-friendly radio pills for `Recently Updated`, `Title (A–Z)`, `My Rating`, `Community Rating`, `Release Date`, and `Last Aired`.
  - **Book Format Sub-Filter** (when `Books` is active):
    - Toggle between `All Books`, `📖 Reading`, and `🎧 Audiobooks`.

---

## ✅ Acceptance Criteria
- [ ] Scrolling down on mobile smoothly hides the bottom navigation bar and center `+` FAB; scrolling up immediately reveals them without jitter.
- [ ] Tapping `Upcoming` in the mobile bottom bar displays the chronological upcoming episodes and releases feed with notification count badge.
- [ ] Tapping the filter/sliders button in the mobile header opens the Mobile Folders & Sort Bottom Sheet, allowing full access to Custom Lists, Sort Order, and Pinned visibility on mobile.
