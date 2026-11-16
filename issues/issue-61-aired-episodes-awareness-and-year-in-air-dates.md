# Issue #61: Aired vs. Future Un-Aired Episode Awareness & 4-Digit Year in Air Dates

## Problem Statement
1. **Un-Aired Future Episodes Causing Premature Episode Counts & Remaining Time**:
   - For TV shows that announce future release dates, episode titles, and runtimes (e.g., VisionQuest with 6 aired episodes and 2 future episodes dropping months or days away):
     - The cards previously showed `6/8 eps (75%)`, badge `6/8`, and `Remaining 1h 44m left` even though the user had watched all 6 released episodes and was fully caught up.
     - The countdown banner already accurately tracked future drops (`S1E7 drops in 1 day 17h`), but the progress track and remaining watch time treated un-aired future episodes as overdue watch backlog.
2. **Missing Year in Air Dates**:
   - Air date formatting throughout episode details, lists, and modals omitted the 4-digit year (e.g. showing "Nov 4" without the year), making it ambiguous whether an announced episode was dropping in 2026, 2027, or beyond.

## Solution Architecture
1. **`airedEpisodesCount` Tracking & Persistence**:
   - Added `airedEpisodesCount?: number` to `MediaItem`.
   - In `saveMediaItem`, `toggleEpisodeWatched`, `setExactProgress`, `markEpisodesUpToWatched`, `setSeasonWatched`, and `backfillMissingMediaMetadata`:
     - Dynamically calculated `airedCount = episodes.filter(e => isEpisodeAired(e, networkTz)).length`.
     - Saved `airedEpisodesCount` to Dexie on the media item record.
2. **Accurate Progress & Caught-Up UI Display (Distinguishing Actively Airing vs. Future Season Premiere)**:
   - Added `isSeasonActivelyAiring(media, episodes)` in `src/utils/duration.ts`:
     - Checks if the season containing upcoming episodes has already premiered (`nextEpisodeNumber > 1` or Season 1 Episode 1 has aired).
     - **Actively Airing Season (e.g. VisionQuest S1: 6 aired, E7/E8 upcoming)**:
       - Uses `totalEpisodes` (e.g. `6/8 eps (75%)`, progress bar at 75%) so the user visually sees that the active season is in progress and has upcoming episodes.
       - When caught up on all aired episodes, remaining watch time backlog is `0` (no false watch backlog), prominently featuring the countdown banner (e.g. `S1E7 drops in 1 day 17h`).
     - **Upcoming Future Season Premiere (e.g. 30 aired across S1–S3, S4E1 upcoming)**:
       - `nextEpisodeNumber === 1` (premiere has not dropped yet).
       - Uses `airedEpisodesCount` (e.g. `30/30 aired (100%)`, progress bar full), preventing an unreleased future season from artificially lowering completion to 96% before premiere day.
3. **4-Digit Year in All Air Dates**:
   - Updated `formatEpisodeAirDate` in `src/utils/timezone.ts` to include `year: 'numeric'` for both UTC `airstamp` and date-only `airDate`.
   - Updated episode rows in `MobileMediaDetailSheet.tsx` (lines 972 and 1047) and `MediaDetailModal.tsx` to format air dates through `formatEpisodeAirDate`.
4. **Movie Runtime Repositioning & Card Header De-cluttering**:
   - Cleaned up movie card layout in `MediaCard.tsx` by moving runtime from crowded header metadata into bottom details row (`Runtime 2h 7m` with clock icon), identical in placement and styling to TV series cards.
   - Removed duplicate rating pill from the poster top-right overlay and from the title line.
   - Title line now has 100% width, eliminating premature title truncation (e.g. *Matchbox the Movie*).
   - Spread metadata across full width using `justify-between` to eliminate left-side cramming:
     - Line 2: Year/Narrator on the left, Status badge (`[Plan to Watch]`, `[Caught Up]`) on the right.
     - Line 3: Content Rating (`[PG-13]`, `[TV-MA]`) on the left, Scores (`[⭐ 9.0]`, `[🌐 8.6]`) on the right.
