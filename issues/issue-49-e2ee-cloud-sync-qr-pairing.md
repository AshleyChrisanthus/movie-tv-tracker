# Feature: End-to-End Encrypted (E2EE) Zero-Knowledge Cloud Sync & QR Device Pairing

## 📌 Summary
Link the Desktop Web App (both local `file://` / `localhost` and hosted) and the Mobile PWA using an **End-to-End Encrypted (E2EE) zero-knowledge cloud sync layer** modeled directly after [App-Directory Issue #58](https://github.com/AshleyChrisanthus/App-Directory/issues/58) (`src/modules/sync/*` & `server/cloudflare-sync-worker.js`).

All media items, episode watch history, book/audiobook progress, custom lists, and Franchise Canvas graphs are encrypted client-side in browser memory using **AES-GCM (256-bit)** before leaving the device, with 1-second QR code pairing between desktop and phone.

---

## 🎯 User Story
> **As a user**, I want to pair my phone's Mobile PWA with my desktop BingeLog library by scanning a QR code in 1 second so that logging `+1 Ep` on my phone or adding a movie on my desktop stays automatically synchronized across devices.  
> **As a privacy-conscious user**, I want all synced library data to be encrypted client-side with a zero-knowledge secret key that never touches any server logs.

---

## 🏗️ Architecture & Technical Specifications

### 1. Client-Side Cryptography (`src/services/cloudSync/crypto.ts`)
- Built exclusively on the native Web Crypto API (`window.crypto.subtle`):
  - **Algorithm**: `AES-GCM` (256-bit key length, 128-bit authentication tag).
  - **Initialization Vector (IV)**: Fresh cryptographically random 12-byte IV (`crypto.getRandomValues(new Uint8Array(12))`) generated on every push.
  - **Secret Key Format**: 32-byte raw key encoded as RFC 4648 Base64URL (`43` characters) for safe embedding in URL hash fragments.
  - **Passphrase Derivation**: Optional PBKDF2 key derivation (`100,000` iterations, `SHA-256`, random 16-byte salt) for human-readable passphrases.
- **Envelope Schema (`EncryptedVaultEnvelope`)**:
  ```typescript
  export interface EncryptedVaultEnvelope {
    v: 1;
    iv: string;          // Base64 12-byte IV
    salt?: string;       // Optional Base64 PBKDF2 salt
    ciphertext: string;  // Base64 AES-GCM ciphertext
    updatedAt: string;   // ISO 8601 timestamp
    deviceId: string;    // Originating device identifier
  }
  ```

### 2. Cloud Locker Adapters (`src/services/cloudSync/backend.ts` & `server/cloudflare-sync-worker.js`)
- Provide `server/cloudflare-sync-worker.js` (reference Cloudflare Worker + KV `SYNC_VAULTS` store supporting `GET /api/vault/:vaultId`, `PUT /api/vault/:vaultId`, and `OPTIONS` CORS preflight for `file://`, `localhost`, and `here.now`).
- Implement `CloudLockerAdapter` interface in `src/services/cloudSync/backend.ts`:
  1. **`CustomWorkerLocker`**: Default Cloudflare Worker / custom REST endpoint (`GET` & `PUT /api/vault/:vaultId`).
  2. **`RestfulApiRelayLocker`**: Zero-config public REST relay fallback for instant testing.
  3. **`SupabaseLocker`**: Optional PostgREST `sync_vaults` table adapter.

### 3. Bi-Directional Merge Engine & Tombstones (`src/services/cloudSync/merger.ts`)
- **Decrypted Payload Schema (`DecryptedSyncPayload`)**:
  ```typescript
  export interface SyncTombstone {
    id: string;
    type: 'media' | 'list' | 'canvas';
    deletedAt: string; // ISO 8601 timestamp (pruned after 30 days)
  }

  export interface DecryptedSyncPayload {
    version: 1;
    updatedAt: string;
    deviceId: string;
    media: MediaItem[];
    episodes: CompactEpisodeItem[]; // Compact representation to keep encrypted payload lightweight
    customLists: CustomList[];
    canvases: FranchiseCanvas[];
    settings?: Record<string, unknown>; // Rating scale, theme preset, streaming region
    tombstones: SyncTombstone[];
  }
  ```
- **Conflict Resolution Rules**:
  - **Tombstones**: Record deletions of `media`, `customLists`, and `canvases` in `localStorage` (`bingelog_sync_tombstones_v1`) whenever `deleteMediaItem`, `deleteCustomList`, or `deleteCanvas` is invoked in [src/db/index.ts](file:///c:/Users/Ashley%20Chrisanthus/Documents/antigravity/clever-noether/src/db/index.ts). Prune tombstones older than 30 days.
  - **Media Items**: Merge by `id` (and cross-provider deduplication fallback via `isMediaMatch`). Compare `updatedAt` timestamps (Last-Write-Wins); discard if a tombstone has `deletedAt >= updatedAt`.
  - **Episodes Progress**: Merge per `[mediaId + seasonNumber + episodeNumber]`. Preserve watched status and `watchedAt` timestamp from whichever side was most recently updated, recalculating parent show `watchedEpisodesCount`, `currentSeason`, `currentEpisode`, and `status` (`watching` / `caught_up` / `completed`).
  - **Custom Lists & Franchise Canvases**: Merge by `id` using `updatedAt` LWW while respecting tombstones.

### 4. Frictionless QR Code Pairing & Auto-Sync Lifecycle (`src/services/cloudSync/qr.ts`, `scanner.ts`, `syncManager.ts`)
- **Zero-Dependency QR Generator (`qr.ts`)**: Pure TypeScript Reed-Solomon SVG QR code generator (ported from `App-Directory/src/modules/sync/qr.ts`).
- **Mobile Camera QR Scanner (`scanner.ts`)**: Uses `navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })` with `BarcodeDetector` and canvas fallback for one-step mobile pairing.
- **URL Hash Pairing (`#sync=v1:...`)**:
  - Pairing URL format: `https://<site>.here.now/#sync=v1:<vaultId>:<secretKey>:<provider>:<encodedEndpoint>`
  - Because the credentials live in `window.location.hash`, they are **never transmitted over the network** to the web host.
  - On app load (`checkUrlPairing()`), BingeLog parses the hash, scrubs it immediately via `history.replaceState`, joins the vault, and runs `syncNow()`.
- **Automatic Sync Triggers**:
  - Startup check on app load.
  - Debounced auto-push (`1500ms`) after any local Dexie mutation (`saveMediaItem`, `toggleEpisodeWatched`, `updateBookProgress`, `updateMediaStatus`, `toggleMediaPinned`, etc.).
  - `document.addEventListener('visibilitychange')` when returning to the app/PWA tab.
  - `window.addEventListener('online')` when network connectivity resumes.

### 5. Cloud Sync Modal & Status Indicators (`src/components/CloudSyncModal.tsx`)
- **Unconfigured View**:
  - *"Create New Vault"* card (generates 256-bit key, pushes initial encrypted library, and displays QR code).
  - *"Join Existing Vault"* card (camera QR scanner + paste pairing link/key input + provider config).
- **Active Vault View**:
  - Live sync status badge (`● Synced`, `↻ Syncing...`, `● Offline`, `⚠️ Error`), last synced relative timestamp (`Synced 2m ago`), `Sync Now` button, collapsible QR code & pairing link copy button to pair additional devices, and `Disconnect Vault` option.
- **Header & Mobile Banner Integration**:
  - Desktop `Navbar` and Mobile Stitch Header (`● SYNCED` badge & `● Offline IndexedDB • Synced 2m ago` strip) display live status from `syncManager` and trigger `syncNow()` or open `CloudSyncModal`.

---

## ✅ Acceptance Criteria
- [ ] Creating a sync vault on Desktop encrypts the Dexie library with AES-GCM 256-bit and uploads ciphertext to the configured locker.
- [ ] Scanning the Desktop QR code (or opening the `#sync=v1:...` link) on the Mobile PWA immediately pairs the device, scrubs the URL hash, and downloads/decrypts the library.
- [ ] Marking `+1 Ep` or adding a movie/book on the Mobile PWA automatically pushes an encrypted update within 1.5s and merges cleanly on Desktop without data loss or duplicate entries.
- [ ] Deleting an item on one device records a tombstone and removes it on the paired device during the next sync instead of resurrecting it.
- [ ] Works seamlessly across standalone `file:///index.html`, `localhost`, and `here.now`.
