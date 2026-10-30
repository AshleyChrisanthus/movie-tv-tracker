# Feature: Implement Stitch Mobile Media Details Bottom Sheet & Episode Tracker

## 📌 Summary
Redesign `MediaDetailModal` for mobile viewports (`< 768px`) into a native-feeling **Mobile Media Details Bottom Sheet** matching the Google Stitch exploration (`web application/stitch/projects/12735524155587802631/screens/de0758698ba340bcb714c4017cdf2793`).

Includes a top navigation bar, swipeable sheet header with Franchise Canvas & Share shortcuts, compact side-by-side poster & metadata hero, scrollable status pills, a prominent **"Current Pace"** progress card with full-width `+1 Ep (S5 E3)` primary CTA and next-episode air countdown, horizontal season selector pills, touch-friendly episode cards (`Watched`, `Up Next • ✓ Log`, `Unwatched`), streaming pills, and a sticky IndexedDB status footer.

---

## 🎯 User Story
> **As a mobile user**, when I tap any show, movie, or book card, I want a clean mobile bottom sheet where I can immediately see my "Current Pace", log the next episode with one large thumb button, see when the next episode airs, browse season episodes via horizontal pill tabs, and check where to stream.

---

## 🖼️ UI Components & Stitch Specifications

### 1. Mobile Details Top Bar & Pull-Up Sheet Frame
- **Top App Bar**:
  - Left: `<` Back button (`ChevronLeft` — closes detail view) + BingeLog squircle icon + `Media Details` title.
  - Right: Bookmark / Pin toggle button (`toggleMediaPinned`) + Profile/Theme button.
- **Bottom Sheet Surface**:
  - Rounded top container (`rounded-t-3xl bg-[var(--card-bg)] border-t border-[var(--border-light)]`) with centered drag handle pill (`w-10 h-1 rounded-full bg-white/20 mx-auto`).
  - **Sheet Action Row**:
    - Left: Collapse chevron circle button (`ChevronDown`).
    - Right: `Franchise Canvas` pill button (`Network` icon + `Franchise Canvas` — jumps to `onOpenInCanvas(media)`) and native Share circle button (`Share2` — invokes `navigator.share` or copies title/link).

### 2. Side-by-Side Hero Metadata Block
- **Left Column**:
  - Rounded poster image (`w-24 sm:w-28 aspect-[2/3] rounded-xl object-cover shadow-lg`) with overlaid top-left media type pill (`📺 TV`, `🎬 Movie`, `📖 Book`).
- **Right Column**:
  - Bold title (`Abbott Elementary`, `text-xl font-bold`).
  - Compact metadata line: `{year} • {genres/type} • {certification} • {runtime}` (e.g., `2021 • TV Comedy • TV-PG • 22m`).
  - Rating & Score pills row:
    - Community / Personal rating pill: `🌐 8.3 / 10` (tappable to rate).
    - Match / Score pill: `👍 98% Score` or personal rating badge in emerald tint.
  - 3-line clamped synopsis (`line-clamp-3`) with tap-to-expand toggle.

### 3. Horizontal Status Pill Selector
- Single-row horizontally scrollable status pills directly below the hero block:
  - `● Watching` (active state styled with warm gold/amber border & translucent fill `#f59e0b`)
  - `Plan to Watch`
  - `Caught Up`
  - `Completed`
  - `On Hold`
  - `Dropped`
- Tapping any pill immediately calls `updateMediaStatus` with haptic/visual feedback.

### 4. "Current Pace" Progress & Next-Up Action Card
- Dedicated rounded glass card (`rounded-2xl bg-[var(--bg-secondary)] border border-[var(--border-light)] p-4`):
  - **Header Row**:
    - Left: Accent play circle icon + `Current Pace` bold label.
    - Right: Current pointer label in sky/accent blue (`Season 5, Ep 2` for TV, `Page 142 of 350` for Books, `2h 15m / 8h 40m` for Audiobooks).
  - **Progress Bar & Stats**:
    - Slim full-width progress track (`h-2 rounded-full`) with glowing accent fill.
    - Sub-caption row: `79 / 100 episodes watched` on left, `79% complete` in bold white on right.
  - **Primary Thumb CTA Row**:
    - Full-width large accent button (`h-12 rounded-xl bg-[#38bdf8] text-slate-950 font-bold`):
      - TV Shows: `✓+  +1 Ep (S5 E3)` (dynamically shows the exact next unwatched season & episode code).
      - Books: `✓+  +10 Pages` (or opens quick page/percentage input).
      - Movies: `✓  Mark as Watched`.
    - Secondary square icon button on the right (`CalendarCheck` / `CheckCheck`): Opens quick batch actions (*Mark Current Season Watched*, *Set Exact Episode/Page*).
  - **Embedded Next Episode Air Countdown Box** (shown when an upcoming episode exists):
    - Dark inset sub-card (`rounded-xl bg-black/30 border border-white/5 p-3 flex items-center justify-between`):
      - Left: Circular clock icon (`Clock` in accent blue).
      - Center:
        - Title line: `S5 E3: "Parent Conference"` (bold white).
        - Subtitle line: `Airs tomorrow at 9:00 PM EST • In 23h 14m` (localized via [src/utils/timezone.ts](file:///c:/Users/Ashley%20Chrisanthus/Documents/antigravity/clever-noether/src/utils/timezone.ts)).
      - Right: Bell icon (`Bell`).

### 5. "Season Episodes" Horizontal Pill Tabs & Episode Log List (TV Shows)
- **Section Header**:
  - Left: `Season Episodes` bold heading.
  - Right: `{count} Episodes` count label.
- **Season Selector Track**:
  - Horizontally scrollable pill buttons: `S1`, `S2`, `S3`, `S4`, `S5 (Current)` (current/selected season styled in solid accent blue `bg-[#38bdf8] text-slate-950 font-bold`).
- **Episode List Cards**:
  - Each episode rendered as a clean rounded row card (`rounded-2xl p-3.5 border transition-all`):
    1. **Watched Episode State**:
       - Left: Green circle with checkmark (`bg-emerald-500/20 text-emerald-400`).
       - Center: `E1 Career Day: Part 1` + `22m • Logged {date}` (or air date).
       - Right: `Watched` emerald badge (`bg-emerald-500/15 text-emerald-400`).
    2. **Up Next Episode State (Highlighted)**:
       - Highlighted card border (`border-[#38bdf8]/60 bg-[#38bdf8]/5`).
       - Left: Solid accent blue circle with play icon (`bg-[#38bdf8] text-slate-950`).
       - Center: Bold white title `E3 Gregory's Garden Party` + `Up Next • 22m` in accent blue.
       - Right: Interactive `✓ Log` pill button (`border border-[#38bdf8]/40 bg-[#38bdf8]/15 text-[#38bdf8]`) that marks the episode watched on tap.
    3. **Unwatched / Upcoming Episode State**:
       - Left: Muted outline circle (`border-2 border-white/20`).
       - Center: Muted title `E4 Costume Contest` + `22m • Nov 2`.
       - Right: `Unwatched` muted pill button (tappable to toggle watched or "Mark up to here").

### 6. "Where to Watch" & Sticky Bottom Storage Bar
- **Where to Watch Section**:
  - Displays regional streaming providers from `media.watchProviders` as rounded pills with colored indicator dots (`● Hulu (Subscription)`, `● Disney+ Hotstar`, `● ABC App`) plus a refresh streaming button.
- **Sticky Bottom Footer Bar**:
  - Left: Green check icon + `Saved locally (IndexedDB)` (or Cloud Sync timestamp).
  - Right: Franchise / Collection name (`ABC Mockumentary Universe` or `media.collectionName`) — tappable to view franchise sequence.

---

## ✅ Acceptance Criteria
- [ ] Tapping a media card on mobile (`< 768px`) opens the Stitch Mobile Media Details Bottom Sheet.
- [ ] "Current Pace" card accurately reflects current episode/page/audio progress and logs the next increment in 1 tap via the primary `+1 Ep (S# E#)` button.
- [ ] Next airing episode countdown banner displays inside the Current Pace card when an unaired episode is scheduled.
- [ ] Season selector renders as horizontal scrollable pills (`S1`, `S2`, `S5 (Current)`) and highlights the `Up Next` episode card with a `✓ Log` button.
- [ ] Movies and Books/Audiobooks adapt the "Current Pace" and edition/franchise sections cleanly within the same mobile sheet layout.
