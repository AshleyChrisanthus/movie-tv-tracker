# Feature Request: Pinned Cards Section with Collapsible Top View

## 📌 Summary
Add the ability to pin any media card (TV show, movie, book, audiobook) to a dedicated **Pinned Section** at the very top of the library. Pinned cards retain 100% feature and visual parity with current cards (quick +1 increments, detail modal inspection, watch status toggling, countdowns, rating badges), but are prominently showcased at the top. 

A dedicated toggle button situated **immediately to the right of the Folders dropdown** in the Filter Bar allows users to quickly reveal or hide the pinned section.

---

## 🎯 User Story
> **As a user**, I want to pin my highest-priority shows, current reads, or actively watched movies to the top of my library so I don't have to scroll or search for them each time.  
> **As a user**, I want to be able to collapse or reveal this pinned section with a single click next to the folder selector so my library layout stays clean and flexible.

---

## 🖼️ User Experience & UI Specifications

### 1. Pinned View Toggle Button (In Filter Bar)
- **Placement**: Situated directly to the right of the **Folders dropdown** (`select` element for folders/custom lists) on Row 2 of [FilterBar.tsx](file:///c:/Users/Ashley%20Chrisanthus/Documents/antigravity/clever-noether/src/components/FilterBar.tsx#L315-L341).
- **Appearance**: Apple-inspired glassmorphism pill button matching the type and folder controls:
  - **Inactive (Hidden / Collapsed)**: Muted background (`var(--bg-tertiary)`), subtle border (`var(--border-light)`), secondary text with a pin outline icon (`Pin` from `lucide-react`).
  - **Active (Revealed / Expanded)**: Tinted accent background (`var(--accent-bg)` or `var(--accent)`), vibrant pin icon, accent border, and high-contrast text.
  - **Badge / Counter**: A small pill badge showing the count of currently pinned items (e.g., `📌 Pinned (3)` or `Pin 3`).
  - **Tooltip**: *"Show / hide pinned items at top of library"*.

### 2. Pinned Cards Section (Top of Library)
- **Placement**: In [App.tsx](file:///c:/Users/Ashley%20Chrisanthus/Documents/antigravity/clever-noether/src/App.tsx#L734), positioned right below the `FilterBar` and right above the main media grid/list.
- **Header**:
  - Title: `📌 Pinned` with item count pill.
  - Quick action: "Hide" / "Collapse" chevron button, or "Unpin all" shortcut.
- **Card Rendering & Feature Parity**:
  - Cards in this section are rendered using the existing `MediaCard` (or `MediaListView` item when in list mode).
  - All existing capabilities work identically:
    - Single click opens the `MediaDetailModal`.
    - Quick +1 episode / +10 pages / +15m audio button on poster overlay.
    - Movie watched / unwatched checkmark button.
    - Countdown badges for upcoming airing episodes.
    - Public and personal rating stars.
    - Streaming availability badges.
  - Responsive layout: Adheres to the user's selected `gridDensity` (Compact vs Comfortable) and `gridColumns` (Auto, 4, 5, 6, 7, 8).
- **Empty State**:
  - If the user turns ON the pinned view but has no pinned cards yet, display a subtle dashed glassmorphic hint: *"No pinned items yet. Click the pin icon on any card to keep it here."*

### 3. Pin / Unpin Interactions on Cards
- **Poster Overlay Icon Button**:
  - Add a subtle `Pin` button on the top-right corner of each card (opposite the type badge on top-left).
  - Unpinned: Appears on hover (`group-hover:opacity-100 opacity-0` on desktop, or visible on mobile/touch) as a translucent glass circle button with an outline pin icon.
  - Pinned: Permanently visible with filled pin icon and accent tint (`bg-[var(--accent)] text-white`).
- **Detail Modal Action**:
  - In `MediaDetailModal.tsx`, add a "Pin to Top" / "Unpin from Top" toggle in the header actions bar alongside Edit and Delete.

---

## 💾 Data Architecture & Persistence

### 1. Database Schema
- Update `MediaItem` interface in [src/types/media.ts](file:///c:/Users/Ashley%20Chrisanthus/Documents/antigravity/clever-noether/src/types/media.ts):
  ```typescript
  export interface MediaItem {
    // ... existing fields
    isPinned?: boolean;
    pinnedAt?: string; // Optional: ISO timestamp to allow ordering pinned cards by pin date
  }
  ```
- Update Dexie database schema in [src/db/index.ts](file:///c:/Users/Ashley%20Chrisanthus/Documents/antigravity/clever-noether/src/db/index.ts):
  - Add index `isPinned` to the `media` store for fast querying.
  - Provide helper functions: `toggleMediaPinned(id: string): Promise<boolean>` and `getPinnedMedia(): Promise<MediaItem[]>`.
- Ensure export/import backup services in `exportService.ts` and `backup.ts` preserve `isPinned`.

### 2. View Toggle Persistence
- Persist the visibility of the pinned section in `localStorage` under `bingelog_show_pinned_view`:
  - `true` (default if user has pinned items) or `false`.

---

## 🔍 Interaction with Existing Filters & Search

| Scenario | Behavior |
| :--- | :--- |
| **Status Filter (e.g. 'Watching', 'Plan to Watch')** | Pinned items should respect the active filter OR always remain visible at the top regardless of status filter (configurable or defaults to showing pinned items matching active status/type filter). |
| **Type Filter (TV / Movies / Books)** | Pinned section reflects the active media type filter, only showing pinned items of that type (or all pinned if 'All Types' is active). |
| **Search Query** | When filtering library by search text, pinned section either filters along with the query or remains accessible. |
| **List vs Grid View** | Pinned section seamlessly renders in list format when `viewMode === 'list'`, and in grid format when `viewMode === 'grid'`. |

---

## ✅ Acceptance Criteria

- [ ] Users can pin/unpin any card directly from the card poster overlay.
- [ ] Users can pin/unpin any item from inside the detail modal.
- [ ] A "Pinned" toggle button is visible immediately to the right of the Folders dropdown in `FilterBar`.
- [ ] The button shows active state and the total count of pinned items.
- [ ] Clicking the button toggles visibility of the pinned section with smooth collapse/expand animation.
- [ ] Pinned section cards have 100% interaction parity (+1 ep, watch toggle, click to open details, countdowns, streaming badges).
- [ ] Pinned state persists across app reloads, browser restarts, and JSON backup/restore.
- [ ] Design adheres to the Apple-inspired Glassmorphism design system (`design.md`).
