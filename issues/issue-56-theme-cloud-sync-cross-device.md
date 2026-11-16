# Bug: Theme & Color Presets Do Not Sync Between Devices (Issue #56)

## 📌 Summary
When users customize their theme family (e.g. Modern Apple, Ocean Sapphire, Cyberpunk Neon, Emerald Forest, Sunset Amber, Rose Velvet, Nordic Frost), customize granular CSS variable colors, customize genre tags, or toggle dark/light mode on one device (such as a laptop), these customizations are not synchronized to their other paired devices (such as a mobile PWA or tablet) via End-to-End Encrypted (E2EE) Cloud Sync.

As a result, a user who pairs their mobile phone with their laptop sees the default dark theme on mobile, and any theme adjustments made on one device never propagate to the other.

---

## 🔍 Root Cause Analysis
1. **Omission in Syncable Settings Whitelist:**
   In `src/services/cloudSync/syncManager.ts`, `getSyncableSettings()` extracted settings from Dexie for backup and synchronization using a hardcoded list of keys (`rating_scale`, `streaming_region`, `upcoming_window_days`, `default_book_provider`, `grid_density`, `grid_columns`, `tmdb_api_key`, `google_books_api_key`). The theme keys (`bingelog_theme`, `bingelog_active_preset`, `bingelog_custom_colors`, `bingelog_genre_colors`) were absent.
2. **Local Storage-Only Persistence in UI:**
   In `src/styles/theme.ts` and `src/components/ThemeModal.tsx`, theme mode toggling and preset selection wrote only to `window.localStorage` and did not persist to `db.settings`.
3. **Missing Mutation Notification for Theme Changes:**
   `notifyLocalMutation()` in `src/services/cloudSync/merger.ts` was not dispatched when themes or presets changed, meaning Cloud Sync was never notified to schedule an automatic vault push.
4. **Sync Ingestion Lacked LocalStorage & DOM Application:**
   When Cloud Sync received remote settings payloads during sync or QR device pairing, `syncManager.ts` wrote values to `db.settings` without writing them to `localStorage` or calling `applyPresetPaletteForMode()`, leaving the active DOM styles untouched.

---

## 🛠️ Implementation Plan
1. **Theme Setting Persistence & Synchronization Helpers (`src/styles/theme.ts`):**
   - Export helper `persistThemeSetting(key, value)` that writes to `localStorage`, `db.settings`, and triggers `notifyLocalMutation()`.
   - Update `toggleThemeMode()` to persist using `persistThemeSetting`.
   - Export `applyThemeSettingsFromRecord(settings)` to update `localStorage`, update `document.documentElement` attributes (`data-theme`), apply preset palette CSS variables, and return the new theme mode.
2. **Theme Modal Integration (`src/components/ThemeModal.tsx`):**
   - Update preset selection, custom color changes, genre tag colors, and theme reset/import routines to persist settings to Dexie and notify Cloud Sync.
3. **Cloud Sync Manager Enhancement (`src/services/cloudSync/syncManager.ts`):**
   - Whitelist `THEME_KEY`, `ACTIVE_PRESET_KEY`, `CUSTOM_THEME_KEY`, and `GENRE_COLORS_KEY` in `getSyncableSettings()`. Fall back to `localStorage` if not yet written to Dexie.
   - When pulling or merging settings in `syncNow()` and `pullFromCloud()`, invoke `applyThemeSettingsFromRecord(mergedSettings)`.
4. **App Level Reactive Update (`src/App.tsx`):**
   - Hydrate theme settings from Dexie on initial mount if available.
   - In `onDataSynced` and post-QR pairing, re-evaluate active `themeMode` so React state re-renders header and toggle indicators.
5. **Automated Testing:**
   - Add unit test suite verifying theme settings serialization, merge precedence, and cross-device propagation.

---

## ✅ Acceptance Criteria
- [x] Changing theme presets or toggling dark/light mode on desktop/laptop persists settings to Dexie and dispatches local sync mutation.
- [x] E2EE sync payload includes theme mode, active preset, custom overrides, and genre tag colors with per-setting LWW timestamps (`_settings_timestamps`).
- [x] Setting merge conflict resolution compares `localTime` and `remoteTime` per key so newly selected local themes are never clobbered by older remote 'default' presets.
- [x] Remote sync or QR device pairing applies the incoming theme settings to `localStorage` and `document.documentElement` immediately.
- [x] All automated tests pass without regression.
