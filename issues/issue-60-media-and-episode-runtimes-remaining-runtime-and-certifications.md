# Feature: Media & Episode Runtimes, Remaining TV Runtime Calculation & Content Certifications (Issue #60)

## 📌 Summary
Enhance the BingeLog movie and TV tracking system with first-class runtime and content rating metadata across data ingestion, persistence, and presentation layers:
1. **Accurate Data Ingestion & Fallbacks**:
   - Extract movie runtime (`trackTimeMillis`) from iTunes search API when TMDB key is not present.
   - Extract TV series-level average episode runtime from TVMaze (`averageRuntime` / `runtime`) and TMDB (`episode_run_time`).
   - Extract content certification/ratings (e.g. PG-13, TV-MA, R, TV-PG) for movies and TV shows from TMDB (`release_dates` / `content_ratings`).
   - Support manual runtime entry (hours and minutes) when creating or editing movies in `ManualMediaModal`.
2. **Dynamic Runtime Calculations**:
   - Calculate total season runtime by aggregating individual episode runtimes (with series average fallback if some episodes lack individual metadata).
   - Calculate remaining TV watch time (unwatched episodes' accumulated runtimes) and persist on `MediaItem` (`remainingRuntimeMinutes`, `totalRuntimeMinutes`).
   - Provide an automatic startup backfill for existing TV shows in Dexie to populate remaining runtime immediately.
3. **Flexible Runtime Display Settings**:
   - Introduce a user setting (`runtime_display_format`) with two options:
     - `hours_minutes` (Default): e.g. "48h 30m"
     - `days_weeks`: Converts to days after 24 hours ("2d 4h"), and weeks after 7 days ("1w 2d 4h").
4. **Desktop & Mobile UI Parity**:
   - Remove all hardcoded placeholder strings (`'2h'`, `'22m'`, `'PG-13'`, `'TV-PG'`) from `MobileMediaDetailSheet` and other views.
   - Display certification badges and movie/series runtimes in Desktop `MediaDetailModal`.
   - Display episode runtimes next to air dates in `MediaDetailModal`.
   - Display remaining runtime on `MediaCard` and `MediaListView` for in-progress and planned TV series.
   - Display season total runtime in `MediaDetailModal` and `MobileMediaDetailSheet`.

---

## 🛠️ Implementation Plan
1. **Types (`src/types/media.ts`, `src/types/api.ts`, `src/types/index.ts`)**:
   - Add `certification?: string | null`, `remainingRuntimeMinutes?: number | null`, `totalRuntimeMinutes?: number | null` to `MediaItem`.
   - Add `RuntimeDisplayFormat = 'hours_minutes' | 'days_weeks'`.
   - Add `certification?: string | null` to `ParsedReleaseDates`.
   - Add `runtime?: number | null` to `MediaSearchResult`.
2. **Duration Utility (`src/utils/duration.ts`)**:
   - Create `formatRuntime(minutes, format)` with support for hours+minutes and days+weeks modes.
   - Create `calculateShowRuntimes(media, episodes)` helper.
3. **Data Ingestion (`src/services/api.ts`, `src/utils/region.ts`)**:
   - In `searchITunesMovies`: map `movie.trackTimeMillis` to `runtime` (minutes).
   - In `fetchTMDBMovieDetails`: store `certification` from release dates.
   - In `fetchTMDBTVDetails`: append `content_ratings` and extract certification for region/US; store `media.runtime` from `episode_run_time`.
   - In `fetchTVMazeDetails`: store `media.runtime` from `showData.averageRuntime || showData.runtime`.
4. **Database Operations & Backfill (`src/db/index.ts`)**:
   - Update `saveMediaItem`, `toggleEpisodeWatched`, `markEpisodesUpToWatched`, `setSeasonWatched`, `setExactProgress`, `syncMediaEpisodes` to recalculate and persist `remainingRuntimeMinutes` and `totalRuntimeMinutes`.
   - Add runtime backfill to `backfillMissingMediaMetadata`.
5. **UI Components**:
   - `ManualMediaModal.tsx`: Add movie runtime input fields (hours + minutes).
   - `SettingsModal.tsx`: Add "Runtime Display Format" setting toggle.
   - `MediaDetailModal.tsx`: Display certification badge, movie runtime, series runtime, season total runtime, and episode runtimes.
   - `MediaCard.tsx`: Display remaining runtime for TV shows and runtime badge for movies.
   - `MobileMediaDetailSheet.tsx`: Eliminate fake placeholder strings and use real certification and runtime data.
6. **Testing**:
   - Unit tests for `formatRuntime` (both formatting modes, boundary values).
   - Unit tests for remaining runtime calculations and season runtime aggregation.
   - Integration tests verifying runtime ingestion from providers and persistence in Dexie.

---

## ✅ Acceptance Criteria
- [ ] No hardcoded placeholder strings appear in mobile or desktop when runtime or certification data is absent.
- [ ] TV episodes display individual runtimes in both desktop modal and mobile sheet.
- [ ] Season total runtime is computed from individual episode runtimes and displayed in season view.
- [ ] TV show cards display remaining runtime left for unwatched episodes.
- [ ] Users can toggle between "Hours & Minutes" and "Days & Weeks" format in Settings.
- [ ] Manual media modal supports entering movie runtime.
- [ ] Movie and TV certifications (e.g. PG-13, TV-MA) display on desktop and mobile.
- [ ] All automated tests pass without regressions.
