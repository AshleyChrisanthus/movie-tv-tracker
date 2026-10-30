# Feature & Fix: Dedicated Force Push to Cloud and Force Pull from Cloud Controls (Issue #54)

## 📌 Summary
Users running BingeLog on multiple devices (Desktop browser and Mobile PWA) can experience synchronization loops where an outdated or corrupted cloud vault payload continuously re-injects obsolete or corrupted data into clean local libraries.

Currently, BingeLog only provides a single, automatic bi-directional merge operation (`syncNow()`). In situations where:
1. Local data has been repaired or updated (e.g. self-healing corrupted episode lists from TVMaze/TMDB), but the cloud vault still holds an older corrupted payload;
2. A secondary device (Mobile PWA) opens and syncs from that older cloud vault, blending outdated records;
3. Or a user intentionally wishes to make one device the authoritative source of truth across all devices;

There is no way to explicitly **Push to Cloud (overwrite remote cloud vault with local library)** or **Pull from Cloud (overwrite local library with cloud vault)**.

---

## 🔍 Root Cause Analysis & Sync Vulnerabilities

### 1. Lack of Explicit Directional Controls (`src/services/cloudSync/syncManager.ts`)
- `SyncManager` only implements `syncNow()`, which downloads the remote encrypted envelope, executes `mergeSyncPayload()` (a union merge), writes changes back to Dexie, and uploads the merged payload back to the cloud.
- If the cloud vault contains stale/corrupted episodes (such as 150 phantom episodes or truncated season data), bi-directional merging can union or resurrect those episodes instead of wiping them out.
- Users cannot enforce that their current device's clean state should completely overwrite the cloud vault, nor can they forcibly refresh a device by pulling cleanly from the cloud.

### 2. Phantom Episode Resurrection in Bi-Directional Merge (`src/services/cloudSync/merger.ts`)
- In `mergeSyncPayload`:
  ```ts
  if (localKeys && localKeys.size > 0 && localMediaTime > remoteMediaTime && !localKeys.has(epKey)) {
    continue;
  }
  ```
- If `localMediaTime <= remoteMediaTime` (e.g., if local episodes were watched weeks ago, while remote cloud vault was uploaded yesterday), `localMediaTime > remoteMediaTime` evaluates to `false`.
- As a result, any episode present in the remote payload that was pruned or deleted locally is added straight back into `episodeMap.set(key, remoteEp)`, undoing local repairs.

### 3. Missing Auto-Push Post-Heal in `App.tsx` & `db/index.ts`
- When `healCorruptedTmdbShows()` repairs corrupted TV shows on startup, the clean state remains strictly in local IndexedDB until the next debounced mutation or manual sync.
- If a secondary device connects or if startup sync runs concurrently with healing, the unhealed cloud envelope can be pulled before the local heal is pushed.

---

## 🛠️ Required Implementation Plan

### 1. `SyncManager` Directional Sync API (`src/services/cloudSync/syncManager.ts`)
- Implement `pushToCloud(options?: { forceOverwrite?: boolean })`:
  - Captures current local Dexie state (`media`, `compactEpisodes`, `customLists`, `canvases`, `settings`, `tombstones`).
  - Sets fresh `updatedAt` timestamps on all items so they are authoritative.
  - Encrypts into a fresh AES-GCM (256-bit) envelope with a new 12-byte IV.
  - Uploads directly to the cloud locker adapter (`adapter.put()`), completely replacing the remote envelope.
  - Updates `lastSyncedAt`, saves config, and sets status to `'synced'`.
- Implement `pullFromCloud(options?: { forceOverwrite?: boolean })`:
  - Retrieves the encrypted envelope from the cloud locker adapter (`adapter.get()`).
  - Decrypts with the vault's 256-bit secret key.
  - When `forceOverwrite: true`, completely replaces local Dexie tables (`db.media`, `db.episodes`, `customLists`, `canvases`, `settings`) with the remote payload.
  - Saves remote tombstones, updates `lastSyncedAt`, and triggers `notifyDataSynced()`.

### 2. Strengthen Bi-Directional Merge Pruning (`src/services/cloudSync/merger.ts`)
- Update episode resurrection prevention to check `localMediaTime >= remoteMediaTime`.
- If local has verified episodes and local show has been updated/healed, prune remote episodes that exceed or contradict the authoritative local episode list.

### 3. Automatic Cloud Push on Library Auto-Healing (`src/App.tsx`)
- When `healCorruptedTmdbShows()` successfully heals one or more shows on startup and `syncManager.isConfigured()` is true:
  - Immediately call `syncManager.pushToCloud({ forceOverwrite: true })` to overwrite the cloud vault with the healed library.

### 4. UI Controls in `CloudSyncModal.tsx` & Desktop/Mobile Strips
- In `CloudSyncModal.tsx`:
  - Add a dedicated **Sync Controls** panel under Active Vault:
    - **Sync (Bi-Directional Merge)**: Keep both sides up to date.
    - **Push to Cloud (Overwrite Cloud)**: Upload current local library directly to cloud vault with confirmation modal/prompt.
    - **Pull from Cloud (Overwrite Local)**: Replace local library with cloud vault data with confirmation modal/prompt.
  - Provide real-time feedback with badges and success/error alerts.
