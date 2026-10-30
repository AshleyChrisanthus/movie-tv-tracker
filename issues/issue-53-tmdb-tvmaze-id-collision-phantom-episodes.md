# Bug: Cross-Provider TMDB → TVMaze ID Collision Injects Phantom Episodes into Completed Shows (e.g., *Ms. Marvel* Getting 150 Episodes)

## 📌 Summary
Completed and tracked TV shows added via **TMDB** (`source: "tmdb"`) are getting polluted with phantom episodes from completely unrelated TV shows during background/manual episode sync when a device lacks a local `tmdb_api_key` (most commonly after pairing a second device or Mobile PWA via E2EE Cloud Sync).

For example, Marvel's ***Ms. Marvel*** (6 episodes, `source: "tmdb"`, `externalId: 92782`) suddenly receives **150 episodes** (`6/150` watched) and gets downgraded from `completed` to `watching` because TMDB ID `92782` collides with **TVMaze Show ID `92782` (*Amor Secreto*, a Spanish telenovela with 150 Season 1 episodes)**.

---

## 🔍 Root Cause Analysis

### 1. Unsafe Fallback from TMDB ID to TVMaze ID Namespace (`src/services/api.ts`)
In [`fetchFullMediaDetails`](../src/services/api.ts#L1343-L1353):
```ts
if (item.source === 'tmdb' && apiKey && item.externalId) {
  if (item.type === 'movie') {
    return await fetchTMDBMovieDetails(item.externalId, apiKey, item);
  } else {
    return await fetchTMDBTVDetails(item.externalId, apiKey, item);
  }
}

if (item.source === 'tvmaze' || item.type === 'tv') {
  return await fetchTVMazeDetails(item.externalId || item.id || '', item);
}
```
- When `item.source === 'tmdb'` and `item.type === 'tv'`, if `apiKey` is empty/missing on the current device, the first `if` block is skipped.
- Execution falls through to `if (item.source === 'tvmaze' || item.type === 'tv')`, which calls `fetchTVMazeDetails(item.externalId, item)` — passing a **TMDB numeric ID** directly into `https://api.tvmaze.com/shows/${showId}/episodes`.
- Because TMDB and TVMaze have completely independent numeric ID namespaces, `https://api.tvmaze.com/shows/92782/episodes` returns 150 episodes of ***Amor Secreto*** instead of ***Ms. Marvel*** (whose true TVMaze ID via `imdbId: "tt10857164"` is `43519`).
- Additionally, inside [`fetchTVMazeDetails`](../src/services/api.ts#L1426-L1432), the returned `media` object sets `source: 'tvmaze'` and `tvmazeId: showId` (`92782`).

### 2. `tmdb_api_key` Omitted from E2EE Cloud Sync Settings (`src/services/cloudSync/syncManager.ts`)
In [`SyncManager.getSyncableSettings`](../src/services/cloudSync/syncManager.ts#L229-L246):
```ts
const keys = [
  'rating_scale',
  'streaming_region',
  'upcoming_window_days',
  'default_book_provider',
  'grid_density',
  'grid_columns'
];
```
- `tmdb_api_key` (and `google_books_api_key`) is not included in the E2EE-encrypted settings payload.
- When a user pairs their phone/secondary browser via QR code, that device receives all `source: 'tmdb'` TV shows without the user's `tmdb_api_key`.
- 2.5 seconds after startup ([`App.tsx`](../src/App.tsx#L256-L310)), `checkEligibleShowsForUpdates()` runs `syncMediaEpisodes(show)` on the secondary device without an API key, triggering the TMDB → TVMaze ID collision across the library.

### 3. Corruption Propagation via `syncMediaEpisodes` & E2EE Cloud Sync (`src/services/api.ts` & `src/services/cloudSync/merger.ts`)
- In [`syncMediaEpisodes`](../src/services/api.ts#L1813-L1869), the 150 episodes from TVMaze `92782` are merged with *Ms. Marvel*'s 6 existing episodes:
  - `S1E1`–`S1E6` keep `isWatched: 1`, but their episode titles, synopses, and air dates are overwritten with *Amor Secreto*'s episodes.
  - `S1E7`–`S1E150` are inserted as 144 new unwatched episodes (`newEpisodesCount = 144`).
- [`saveMediaItem`](../src/db/index.ts#L158-L190) recalculates status via `computeAutoStatus` (`6/150` watched → status downgraded from `'completed'` to `'watching'`) and calls `notifyLocalMutation()`.
- `syncManager` then pushes the 150 corrupted episodes to the cloud vault, and because [`mergeSyncPayload`](../src/services/cloudSync/merger.ts#L446-L536) unions episodes by `${mediaId}_S${seasonNumber}E${episodeNumber}`, the phantom episodes propagate back to the primary desktop device as well.

---

## 📊 Audited Collisions in User Library (46 TMDB TV Shows)
Out of 46 `source: 'tmdb'` TV shows in the library, **12 shows** have TMDB IDs that collide with active TVMaze show IDs:

| Library Show (`source: "tmdb"`) | TMDB `externalId` | Actual Episodes | Colliding TVMaze Show (`/shows/{externalId}`) | Colliding TVMaze Episodes | Impact on Sync Without TMDB Key |
| :--- | :---: | :---: | :--- | :---: | :--- |
| **Ms. Marvel** | `92782` | 6 | *Amor Secreto* | **150** | +144 phantom episodes (`6/150`), downgraded to `watching` |
| **Mythic Quest** | `94951` | 40 | *Falling Beyond the Rules* | **82** | +76 phantom S1 episodes, titles overwritten |
| **Hawkeye** | `88329` | 6 | *Tales of Wumeng* | **28** | +22 phantom episodes (`6/28`), downgraded to `watching` |
| **She-Hulk: Attorney at Law** | `92783` | 9 | *Death is Coming* | **27** | +18 phantom episodes (`9/27`), downgraded to `watching` |
| **The Falcon and the Winter Soldier** | `88396` | 6 | *ЛАЙВ* | **10** | +4 phantom episodes (`6/10`), downgraded to `watching` |
| **What If...?** | `91363` | 26 | *The Floor* | **16** | S1–S2 episode titles/dates overwritten with *The Floor* |
| **Loki** | `84958` | 12 | *Die Festspiele der Reality Stars* | **5** | S1E1–S1E5 titles/dates overwritten; S2 episodes dropped on save |
| **Stranger Things** | `66732` | 42 | *Zane's The Jump Off* | **13** | S1–S2 overwritten; S3–S5 episodes dropped on save |
| **Bob's Burgers** | `32726` | 313 | *Helikopterrånet* | **6** | S1E1–S1E6 overwritten; 307 episodes dropped on save |
| **Rick and Morty** | `60625` | 91 | *Технарь* | **8** | S1E1–S1E8 overwritten; 83 episodes dropped on save |
| **Dimension 404** | `70690` | 6 | *Popporn* | **6** | S1E1–S1E6 titles/dates overwritten |
| **Moon Knight** | `92749` | 6 | *Adventure Time: Bubblegum and Marceline* | **0** | Returns 0 episodes |

---

## 🛠️ Proposed Fix & Self-Healing Plan

1. **Prevent Cross-Provider ID Collisions in `fetchFullMediaDetails` & `fetchTVMazeDetails` (`src/services/api.ts`)**:
   - **Never** pass a `source === 'tmdb'` item's `externalId` (or `tmdbId`) directly to `/shows/${id}` on TVMaze.
   - If `item.source === 'tmdb'` and `apiKey` is unavailable:
     - Only query TVMaze if we already have a verified `item.tvmazeId`, **OR** resolve the true TVMaze ID first via `https://api.tvmaze.com/lookup/shows?imdb=${item.imdbId}` or `https://api.tvmaze.com/lookup/shows?thetvdb=${item.thetvdbId}`.
     - Preserve `source: 'tmdb'` and `externalId: item.externalId` (do not overwrite `source` with `'tvmaze'` when using TVMaze as a metadata fallback), and store the resolved `tvmazeId` in `item.tvmazeId`.
     - If neither `apiKey` nor a verified TVMaze lookup is available, throw/abort in `syncMediaEpisodes` so existing episodes and watch status are left untouched.
2. **Sync `tmdb_api_key` & `google_books_api_key` in E2EE Cloud Sync (`src/services/cloudSync/syncManager.ts`)**:
   - Include `'tmdb_api_key'` and `'google_books_api_key'` in `getSyncableSettings()` so paired devices ( encrypted with AES-GCM 256-bit) automatically inherit the user's API keys upon QR pairing.
3. **Guard Against Empty/Shrinking Episode Lists in `syncMediaEpisodes` (`src/services/api.ts`)**:
   - If `freshData.episodes` is empty (`0` episodes) when `existingEpisodes.length > 0`, abort the sync update rather than wiping out the show's episodes.
   - When `freshData.episodes.length < existingEpisodes.length` on a legitimate TMDB/TVMaze re-sync (or repair), prune stale phantom episodes that no longer exist in the authoritative provider response.
4. **Automatic Library Self-Healing Migration (`src/db/index.ts` / `src/App.tsx`)**:
   - Add a one-time self-healing repair (`healCorruptedTmdbShows`) on startup that detects `source: 'tmdb'` TV shows (or shows whose `tvmazeId === tmdbId`) where phantom episodes or overwritten titles were injected, re-fetches authoritative episode lists from TMDB (or verified IMDb/TheTVDB lookup), deletes phantom episodes (such as `S1E7`–`S1E150` on *Ms. Marvel*), restores `completed` / `caught_up` status, and pushes the repaired state to E2EE Cloud Sync (fixing Episode union in `mergeSyncPayload` so deleted phantom episodes don't resurrect from the remote vault).

---

## ✅ Acceptance Criteria
- [ ] `fetchFullMediaDetails` and `syncMediaEpisodes` never query `api.tvmaze.com/shows/{tmdbId}` with a TMDB ID.
- [ ] When `tmdb_api_key` is missing, `source: 'tmdb'` TV shows resolve their TVMaze ID via `imdbId` / `thetvdbId` lookup (or skip sync safely if unresolvable) without overwriting `source` or `externalId`.
- [ ] `tmdb_api_key` is included in E2EE Cloud Sync `getSyncableSettings()` so paired mobile/secondary devices use TMDB directly.
- [ ] Corrupted shows like *Ms. Marvel* (150 episodes → 6 episodes) are automatically healed, restoring their true episode count, episode titles, and `completed` status across local IndexedDB and E2EE Cloud Sync.
