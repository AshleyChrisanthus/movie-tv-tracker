import { db, getCustomLists, saveCustomLists } from '../../db';
import type { EpisodeItem } from '../../types';
import type {
  SyncConfig,
  SyncProviderType,
  SyncStatus,
  SyncStatusState,
  SyncTombstone,
  SyncTombstoneType,
  DecryptedSyncPayload
} from './types';
import {
  generateSecretKey,
  generateVaultId,
  deriveKeyFromPassphrase,
  encryptPayload,
  decryptPayload
} from './crypto';
import {
  mergeSyncPayload,
  toCompactEpisode,
  getStoredTombstones,
  saveStoredTombstones,
  recordSyncTombstone,
  registerMutationHook,
  withSyncSuppressMutations,
  TOMBSTONES_STORAGE_KEY
} from './merger';
import {
  createLockerAdapter,
  RestfulApiRelayLocker,
  DEFAULT_CLOUDFLARE_WORKER_URL
} from './backend';
import {
  THEME_KEY,
  ACTIVE_PRESET_KEY,
  CUSTOM_THEME_KEY,
  GENRE_COLORS_KEY,
  applyThemeSettingsFromRecord
} from '../../styles/theme';

export const CONFIG_STORAGE_KEY = 'bingelog_sync_config_v1';
export const DEVICE_ID_KEY = 'bingelog_device_id';
export const DEFAULT_LIVE_PWA_URL = 'https://scarlet-oyster-rs75.here.now/';

/**
 * Format a sync timestamp into a compact human-readable relative label
 * (e.g. "Just now", "2m ago", "1h ago", "3d ago").
 */
export function formatSyncRelativeTime(dateInput: Date | string | null | undefined): string {
  if (!dateInput) return 'Never';
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  const ms = date.getTime();
  if (isNaN(ms)) return 'Never';

  const diffSec = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (diffSec < 45) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

export class SyncManager {
  private config: SyncConfig | null = null;
  private status: SyncStatus = {
    state: 'disconnected',
    lastSyncedAt: null
  };
  private statusListeners: Array<(status: SyncStatus) => void> = [];
  private dataSyncedListeners: Array<() => void> = [];
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private isSyncing = false;

  constructor() {
    this.loadConfig();
    this.setupLifecycleListeners();
    registerMutationHook(() => {
      if (this.isConfigured() && this.config?.autoSync !== false) {
        this.schedulePush();
      }
    });
  }

  // ── Device ID ──────────────────────────────────────────────
  getDeviceId(): string {
    try {
      if (typeof localStorage !== 'undefined') {
        let id = localStorage.getItem(DEVICE_ID_KEY);
        if (!id) {
          id = 'dev_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
          localStorage.setItem(DEVICE_ID_KEY, id);
        }
        return id;
      }
    } catch {
      // ignore storage errors
    }
    return 'dev_' + Date.now().toString(36);
  }

  // ── Config Persistence ─────────────────────────────────────
  loadConfig(): SyncConfig | null {
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(CONFIG_STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as SyncConfig;
          if (parsed && parsed.vaultId && parsed.secretKey) {
            if (!parsed.provider) {
              parsed.provider = 'custom';
            }
            if (parsed.provider === 'custom' && !parsed.customEndpoint) {
              parsed.customEndpoint = DEFAULT_CLOUDFLARE_WORKER_URL;
            }
            this.config = parsed;
            if (parsed.enabled) {
              this.setStatus(
                'synced',
                parsed.lastSyncedAt ? new Date(parsed.lastSyncedAt) : null
              );
            } else {
              this.setStatus('disconnected', null);
            }
            return this.config;
          }
        }
      }
    } catch {
      // ignore parse errors
    }
    this.config = null;
    this.setStatus('disconnected', null);
    return null;
  }

  saveConfig(newConfig: SyncConfig | null): void {
    this.config = newConfig;
    try {
      if (typeof localStorage !== 'undefined') {
        if (newConfig) {
          localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(newConfig));
        } else {
          localStorage.removeItem(CONFIG_STORAGE_KEY);
        }
      }
    } catch {
      // ignore storage errors
    }

    if (newConfig && newConfig.enabled) {
      this.setStatus('synced', newConfig.lastSyncedAt ? new Date(newConfig.lastSyncedAt) : null);
    } else {
      this.setStatus('disconnected', null);
    }
  }

  getConfig(): SyncConfig | null {
    return this.config;
  }

  isConfigured(): boolean {
    return !!(this.config && this.config.enabled && this.config.vaultId && this.config.secretKey);
  }

  // ── Status & Sync Listeners ────────────────────────────────
  getStatus(): SyncStatus {
    return { ...this.status };
  }

  onStatusChange(fn: (status: SyncStatus) => void): () => void {
    this.statusListeners.push(fn);
    try {
      fn(this.getStatus());
    } catch {
      // ignore
    }
    return () => {
      this.statusListeners = this.statusListeners.filter((l) => l !== fn);
    };
  }

  onDataSynced(fn: () => void): () => void {
    this.dataSyncedListeners.push(fn);
    return () => {
      this.dataSyncedListeners = this.dataSyncedListeners.filter((l) => l !== fn);
    };
  }

  private notifyDataSynced(): void {
    for (const fn of this.dataSyncedListeners) {
      try {
        fn();
      } catch {
        // ignore listener errors
      }
    }
  }

  private setStatus(
    state: SyncStatusState,
    lastSyncedAt: Date | null,
    errorMessage?: string,
    itemCount?: number
  ): void {
    this.status = {
      state,
      lastSyncedAt,
      errorMessage,
      itemCount: itemCount !== undefined ? itemCount : this.status.itemCount
    };
    for (const listener of this.statusListeners) {
      try {
        listener(this.getStatus());
      } catch {
        // ignore
      }
    }
  }

  // ── Tombstone Management ───────────────────────────────────
  getLocalTombstones(): SyncTombstone[] {
    return getStoredTombstones();
  }

  saveLocalTombstones(tombstones: SyncTombstone[]): void {
    saveStoredTombstones(tombstones);
  }

  recordDeletion(id: string, type: SyncTombstoneType): void {
    recordSyncTombstone(id, type);
  }

  // ── Snapshot Local Dexie State ─────────────────────────────
  private async getSyncableSettings(): Promise<Record<string, unknown>> {
    const keys = [
      'rating_scale',
      'streaming_region',
      'upcoming_window_days',
      'default_book_provider',
      'grid_density',
      'grid_columns',
      'tmdb_api_key',
      'google_books_api_key',
      THEME_KEY,
      ACTIVE_PRESET_KEY,
      CUSTOM_THEME_KEY,
      GENRE_COLORS_KEY
    ];
    const settings: Record<string, unknown> = {};
    const timestamps: Record<string, string> = {};
    let latestSettingTime = 0;

    for (const k of keys) {
      const rec = await db.settings.get(k);
      let val: unknown = undefined;
      let updatedAt: string | undefined = rec?.updatedAt;

      if (rec && rec.value !== undefined) {
        val = rec.value;
      } else if (typeof localStorage !== 'undefined') {
        const localVal = localStorage.getItem(k);
        if (localVal !== null) {
          val = localVal;
          try {
            await db.settings.put({ key: k, value: localVal });
          } catch {
            // ignore
          }
        }
      }

      if (typeof localStorage !== 'undefined' && !updatedAt) {
        const localTime = localStorage.getItem(`${k}_updated_at`);
        if (localTime) updatedAt = localTime;
      }

      if (val !== undefined) {
        settings[k] = val;
        if (updatedAt) {
          timestamps[k] = updatedAt;
          const t = new Date(updatedAt).getTime();
          if (!isNaN(t) && t > latestSettingTime) latestSettingTime = t;
        }
      }
    }
    settings['_settings_timestamps'] = timestamps;
    if (latestSettingTime > 0) {
      settings['_settings_updated_at'] = new Date(latestSettingTime).toISOString();
    }
    return settings;
  }

  async buildLocalPayload(): Promise<DecryptedSyncPayload> {
    const [media, rawEpisodes, customLists, canvases, settings] = await Promise.all([
      db.media.toArray(),
      db.episodes.toArray(),
      getCustomLists(),
      db.canvases ? db.canvases.toArray() : Promise.resolve([]),
      this.getSyncableSettings()
    ]);

    return {
      version: 1,
      updatedAt: new Date().toISOString(),
      deviceId: this.config?.deviceId || this.getDeviceId(),
      media,
      episodes: rawEpisodes.map(toCompactEpisode),
      customLists,
      canvases,
      settings,
      tombstones: this.getLocalTombstones()
    };
  }

  // ── Vault Setup & Pairing ──────────────────────────────────
  async createNewVault(options: {
    provider?: SyncProviderType;
    customEndpoint?: string;
    customAuthHeader?: string;
    supabaseUrl?: string;
    supabaseAnonKey?: string;
    passphrase?: string;
  } = {}): Promise<SyncConfig> {
    let secretKey: string;
    let salt: string | undefined;

    if (options.passphrase && options.passphrase.trim()) {
      const derived = await deriveKeyFromPassphrase(options.passphrase.trim());
      secretKey = derived.secretKey;
      salt = derived.salt;
    } else {
      secretKey = await generateSecretKey();
    }

    const deviceId = this.getDeviceId();
    const provider: SyncProviderType = options.provider || 'custom';
    const customEndpoint =
      provider === 'custom'
        ? (options.customEndpoint || DEFAULT_CLOUDFLARE_WORKER_URL).trim()
        : undefined;

    let vaultId = generateVaultId();
    const initialPayload = await this.buildLocalPayload();
    initialPayload.deviceId = deviceId;

    const initialEnvelope = await encryptPayload(initialPayload, secretKey, deviceId, salt);

    if (provider === 'relay') {
      try {
        const relay = new RestfulApiRelayLocker();
        vaultId = await relay.createVault(initialEnvelope);
      } catch (err) {
        console.warn('[CloudSync] Relay vault creation fallback:', err);
      }
    }

    const nowIso = new Date().toISOString();
    const newConfig: SyncConfig = {
      enabled: true,
      vaultId,
      secretKey,
      provider,
      customEndpoint,
      customAuthHeader: options.customAuthHeader,
      supabaseUrl: options.supabaseUrl,
      supabaseAnonKey: options.supabaseAnonKey,
      autoSync: true,
      deviceId,
      lastSyncedAt: nowIso
    };

    this.saveConfig(newConfig);

    if (provider !== 'relay') {
      try {
        const adapter = createLockerAdapter(newConfig);
        await adapter.put(vaultId, initialEnvelope);
      } catch (err) {
        console.warn('[CloudSync] Initial vault upload warning:', err);
      }
    }

    this.setStatus('synced', new Date(nowIso), undefined, initialPayload.media.length);
    return newConfig;
  }

  joinVault(
    vaultId: string,
    secretKey: string,
    provider: SyncProviderType = 'custom',
    customEndpoint: string = DEFAULT_CLOUDFLARE_WORKER_URL,
    extra: {
      customAuthHeader?: string;
      supabaseUrl?: string;
      supabaseAnonKey?: string;
    } = {}
  ): SyncConfig {
    const cleanVaultId = vaultId.trim();
    const cleanSecretKey = secretKey.trim();

    if (!cleanVaultId || !cleanSecretKey) {
      throw new Error('Vault ID and Secret Key are required to pair.');
    }

    const newConfig: SyncConfig = {
      enabled: true,
      vaultId: cleanVaultId,
      secretKey: cleanSecretKey,
      provider,
      customEndpoint:
        provider === 'custom'
          ? (customEndpoint || DEFAULT_CLOUDFLARE_WORKER_URL).trim()
          : undefined,
      customAuthHeader: extra.customAuthHeader,
      supabaseUrl: extra.supabaseUrl,
      supabaseAnonKey: extra.supabaseAnonKey,
      autoSync: true,
      deviceId: this.getDeviceId()
    };

    this.saveConfig(newConfig);
    return newConfig;
  }

  disconnectVault(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.saveConfig(null);
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(TOMBSTONES_STORAGE_KEY);
      }
    } catch {
      // ignore
    }
  }

  /**
   * Generate pairing URL with `#sync=v1:<vaultId>:<secretKey>:<provider>:<encodedEndpoint>`
   * Because credentials live in window.location.hash, they never leave the browser over HTTP.
   */
  getPairingUrl(): string {
    if (!this.config) return '';

    const hasWindow = typeof window !== 'undefined' && !!window.location;
    const isLocal =
      !hasWindow ||
      window.location.protocol === 'file:' ||
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1' ||
      !window.location.origin ||
      window.location.origin === 'null';

    const base = isLocal
      ? DEFAULT_LIVE_PWA_URL
      : window.location.origin + (window.location.pathname || '/');

    const endpoint = this.config.customEndpoint || DEFAULT_CLOUDFLARE_WORKER_URL;
    const hash = `sync=v1:${this.config.vaultId}:${this.config.secretKey}:${this.config.provider}:${encodeURIComponent(endpoint)}`;

    return `${base}#${hash}`;
  }

  /**
   * Parse pairing credentials from a full pairing URL, a `#sync=v1:...` hash, or `vaultId:secretKey`.
   */
  parsePairingInput(raw: string): {
    vaultId: string;
    secretKey: string;
    provider: SyncProviderType;
    customEndpoint?: string;
  } | null {
    if (!raw || typeof raw !== 'string') return null;
    const trimmed = raw.trim();
    if (!trimmed) return null;

    if (trimmed.includes('sync=v1:')) {
      const match = trimmed.match(/sync=v1:([^:&\s#]+):([^:&\s#]+)(?::([^:&\s#]+))?(?::([^&\s#]+))?/);
      if (match) {
        const vaultId = match[1];
        const secretKey = match[2];
        const provider = ((match[3] as SyncProviderType) || 'custom');
        const customEndpoint = match[4]
          ? decodeURIComponent(match[4])
          : DEFAULT_CLOUDFLARE_WORKER_URL;
        return { vaultId, secretKey, provider, customEndpoint };
      }
    }

    if (trimmed.includes(':')) {
      const parts = trimmed.split(':');
      if (parts.length >= 2 && parts[0] && parts[1]) {
        return {
          vaultId: parts[0].trim(),
          secretKey: parts[1].trim(),
          provider: 'custom',
          customEndpoint: DEFAULT_CLOUDFLARE_WORKER_URL
        };
      }
    }

    return null;
  }

  /**
   * Checks if current page was opened with pairing hash `#sync=v1:<vaultId>:<secretKey>...`
   * Scrubs URL hash immediately via history.replaceState, joins the vault, and runs syncNow().
   */
  async checkUrlPairing(): Promise<boolean> {
    try {
      if (typeof window === 'undefined' || !window.location) return false;
      const hash = window.location.hash;
      if (!hash || !hash.includes('sync=v1:')) return false;

      const parsed = this.parsePairingInput(hash);
      if (!parsed) return false;

      // Scrub hash from URL address bar immediately for zero-knowledge privacy
      try {
        if (window.history && typeof window.history.replaceState === 'function') {
          const cleanUrl = (window.location.pathname || '/') + (window.location.search || '');
          window.history.replaceState(null, '', cleanUrl);
        }
        window.location.hash = '';
      } catch {
        // Fallback if replaceState is restricted on file://
        try {
          window.location.hash = '';
        } catch {
          // ignore
        }
      }

      this.joinVault(
        parsed.vaultId,
        parsed.secretKey,
        parsed.provider,
        parsed.customEndpoint
      );

      await this.syncNow();
      return true;
    } catch (err) {
      console.warn('[CloudSync] URL hash pairing error:', err);
      return false;
    }
  }

  checkUrlHashForPairing(): Promise<boolean> {
    return this.checkUrlPairing();
  }

  // ── Explicit Directional Cloud Controls (Issue #54) ─────────
  /**
   * Explicitly push current local IndexedDB library to cloud vault.
   * When forceOverwrite is true (default), this bypasses remote merging completely and overwrites
   * the cloud vault envelope with the exact local library state.
   */
  async pushToCloud(options: { forceOverwrite?: boolean } = { forceOverwrite: true }): Promise<boolean> {
    if (!this.isConfigured() || !this.config) return false;
    if (this.isSyncing) return false;

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      this.setStatus(
        'offline',
        this.config.lastSyncedAt ? new Date(this.config.lastSyncedAt) : null
      );
      return false;
    }

    this.isSyncing = true;
    this.setStatus(
      'syncing',
      this.config.lastSyncedAt ? new Date(this.config.lastSyncedAt) : null
    );

    try {
      const adapter = createLockerAdapter(this.config);
      const nowIso = new Date().toISOString();

      if (options.forceOverwrite) {
        // Bump timestamps locally under suppression so other devices treat this push as authoritative
        await withSyncSuppressMutations(async () => {
          await db.transaction('rw', db.media, db.episodes, async () => {
            const allMedia = await db.media.toArray();
            for (const m of allMedia) {
              m.updatedAt = nowIso;
            }
            if (allMedia.length > 0) {
              await db.media.bulkPut(allMedia);
            }

            const allEpisodes = await db.episodes.toArray();
            for (const ep of allEpisodes) {
              ep.updatedAt = nowIso;
            }
            if (allEpisodes.length > 0) {
              await db.episodes.bulkPut(allEpisodes);
            }
          });
        });
      }

      const payload = await this.buildLocalPayload();
      payload.updatedAt = nowIso;
      payload.deviceId = this.config.deviceId;

      const encryptedEnvelope = await encryptPayload(
        payload,
        this.config.secretKey,
        this.config.deviceId
      );

      await adapter.put(this.config.vaultId, encryptedEnvelope);

      const now = new Date();
      this.config.lastSyncedAt = now.toISOString();
      this.saveConfig(this.config);
      this.setStatus('synced', now, undefined, payload.media.length);
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Push to cloud failed';
      console.warn('[CloudSync] Push to cloud failed:', msg);
      this.setStatus(
        'error',
        this.config.lastSyncedAt ? new Date(this.config.lastSyncedAt) : null,
        msg
      );
      throw err;
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Explicitly pull from the cloud vault into local IndexedDB.
   * When forceOverwrite is true (default), this replaces the local library completely
   * with the cloud vault payload.
   */
  async pullFromCloud(options: { forceOverwrite?: boolean } = { forceOverwrite: true }): Promise<boolean> {
    if (!this.isConfigured() || !this.config) return false;
    if (this.isSyncing) return false;

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      this.setStatus(
        'offline',
        this.config.lastSyncedAt ? new Date(this.config.lastSyncedAt) : null
      );
      return false;
    }

    if (!options.forceOverwrite) {
      return await this.syncNow();
    }

    this.isSyncing = true;
    this.setStatus(
      'syncing',
      this.config.lastSyncedAt ? new Date(this.config.lastSyncedAt) : null
    );

    try {
      const adapter = createLockerAdapter(this.config);
      const remoteEnvelope = await adapter.get(this.config.vaultId);

      if (!remoteEnvelope) {
        throw new Error('Cloud vault is empty or could not be found.');
      }

      let remotePayload: DecryptedSyncPayload;
      try {
        remotePayload = await decryptPayload(remoteEnvelope, this.config.secretKey);
      } catch (decryptErr: unknown) {
        const msg = decryptErr instanceof Error ? decryptErr.message : String(decryptErr);
        throw new Error(`Decryption failed: Incorrect secret key or corrupted data. (${msg})`);
      }

      const fullEpisodes: EpisodeItem[] = (remotePayload.episodes || []).map((ep) => ({
        id: ep.id,
        mediaId: ep.mediaId,
        seasonNumber: Number(ep.seasonNumber) || 1,
        episodeNumber: Number(ep.episodeNumber) || 1,
        title: ep.title || `Episode ${ep.episodeNumber}`,
        overview: '',
        airDate: ep.airDate || '',
        airstamp: ep.airstamp || null,
        runtime: ep.runtime ?? null,
        stillUrl: '',
        isWatched: ep.isWatched,
        watchedAt: ep.watchedAt || null,
        updatedAt: ep.updatedAt || ep.watchedAt || null
      }));

      await withSyncSuppressMutations(async () => {
        await db.transaction(
          'rw',
          db.media,
          db.episodes,
          db.settings,
          db.canvases,
          async () => {
            await db.media.clear();
            await db.episodes.clear();
            if (db.canvases) await db.canvases.clear();

            const mediaToPut = (remotePayload.media || []).map((m) => ({
              ...m,
              updatedAt: m.updatedAt || remotePayload.updatedAt || new Date().toISOString()
            }));

            if (mediaToPut.length > 0) {
              await db.media.bulkPut(mediaToPut);
            }
            if (fullEpisodes.length > 0) {
              await db.episodes.bulkPut(fullEpisodes);
            }
            if (remotePayload.canvases && remotePayload.canvases.length > 0 && db.canvases) {
              await db.canvases.bulkPut(remotePayload.canvases);
            }

            if (remotePayload.customLists) {
              await saveCustomLists(remotePayload.customLists);
            }

            if (remotePayload.settings) {
              const timestamps = (remotePayload.settings['_settings_timestamps'] as Record<string, string>) || {};
              for (const [k, v] of Object.entries(remotePayload.settings)) {
                if (k.startsWith('_')) continue;
                if (v !== undefined) {
                  const updatedAt = timestamps[k] || remotePayload.updatedAt;
                  await db.settings.put({ key: k, value: v, updatedAt });
                  if (typeof localStorage !== 'undefined' && updatedAt) {
                    localStorage.setItem(`${k}_updated_at`, updatedAt);
                  }
                }
              }
            }
          }
        );
      });

      if (remotePayload.settings) {
        applyThemeSettingsFromRecord(remotePayload.settings);
      }

      if (remotePayload.tombstones) {
        this.saveLocalTombstones(remotePayload.tombstones);
      }

      const now = new Date();
      this.config.lastSyncedAt = now.toISOString();
      this.saveConfig(this.config);
      this.setStatus('synced', now, undefined, remotePayload.media ? remotePayload.media.length : 0);
      this.notifyDataSynced();
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Pull from cloud failed';
      console.warn('[CloudSync] Pull from cloud failed:', msg);
      this.setStatus(
        'error',
        this.config.lastSyncedAt ? new Date(this.config.lastSyncedAt) : null,
        msg
      );
      throw err;
    } finally {
      this.isSyncing = false;
    }
  }

  // ── Bi-Directional E2EE Sync Engine ────────────────────────
  async syncNow(): Promise<boolean> {
    if (!this.isConfigured() || !this.config) return false;
    if (this.isSyncing) return false;

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      this.setStatus(
        'offline',
        this.config.lastSyncedAt ? new Date(this.config.lastSyncedAt) : null
      );
      return false;
    }

    this.isSyncing = true;
    this.setStatus(
      'syncing',
      this.config.lastSyncedAt ? new Date(this.config.lastSyncedAt) : null
    );

    try {
      const adapter = createLockerAdapter(this.config);
      const remoteEnvelope = await adapter.get(this.config.vaultId);

      let remotePayload: DecryptedSyncPayload | null = null;
      if (remoteEnvelope) {
        try {
          remotePayload = await decryptPayload(remoteEnvelope, this.config.secretKey);
        } catch (decryptErr: unknown) {
          const msg = decryptErr instanceof Error ? decryptErr.message : String(decryptErr);
          throw new Error(`Decryption failed: Incorrect secret key or corrupted data. (${msg})`);
        }
      }

      const [localMedia, localEpisodes, localCustomLists, localCanvases, localSettings] =
        await Promise.all([
          db.media.toArray(),
          db.episodes.toArray(),
          getCustomLists(),
          db.canvases ? db.canvases.toArray() : Promise.resolve([]),
          this.getSyncableSettings()
        ]);
      const localTombstones = this.getLocalTombstones();

      let mergedMedia = localMedia;
      let mergedCompactEpisodes = localEpisodes.map(toCompactEpisode);
      let mergedCustomLists = localCustomLists;
      let mergedCanvases = localCanvases;
      let mergedTombstones = localTombstones;
      let mergedSettings = localSettings;
      let hasChanges = false;

      if (remotePayload) {
        const mergeResult = mergeSyncPayload(
          {
            media: localMedia,
            episodes: localEpisodes,
            customLists: localCustomLists,
            canvases: localCanvases,
            tombstones: localTombstones,
            settings: localSettings
          },
          remotePayload
        );

        mergedMedia = mergeResult.mergedMedia;
        mergedCompactEpisodes = mergeResult.mergedCompactEpisodes;
        mergedCustomLists = mergeResult.mergedCustomLists;
        mergedCanvases = mergeResult.mergedCanvases;
        mergedTombstones = mergeResult.mergedTombstones;
        mergedSettings = mergeResult.mergedSettings;
        hasChanges = mergeResult.hasChanges;

        if (hasChanges || mergeResult.deletedMediaIds.length > 0 || mergeResult.deletedCanvasIds.length > 0) {
          await withSyncSuppressMutations(async () => {
            await db.transaction(
              'rw',
              db.media,
              db.episodes,
              db.settings,
              db.canvases,
              async () => {
                // Remove tombstoned or deduplicated media items and their episodes
                const survivingMediaIds = new Set(mergedMedia.map((m) => m.id));
                for (const oldItem of localMedia) {
                  if (!survivingMediaIds.has(oldItem.id)) {
                    await db.media.delete(oldItem.id);
                    await db.episodes.where('mediaId').equals(oldItem.id).delete();
                  }
                }
                for (const delId of mergeResult.deletedMediaIds) {
                  if (!survivingMediaIds.has(delId)) {
                    await db.media.delete(delId);
                    await db.episodes.where('mediaId').equals(delId).delete();
                  }
                }

                if (mergedMedia.length > 0) {
                  await db.media.bulkPut(mergedMedia);
                }

                if (mergeResult.mergedEpisodes.length > 0) {
                  await db.episodes.bulkPut(mergeResult.mergedEpisodes);
                }

                // Update custom lists
                await saveCustomLists(mergedCustomLists);

                // Remove tombstoned canvases and put merged canvases
                const survivingCanvasIds = new Set(mergedCanvases.map((c) => c.id));
                for (const oldCanvas of localCanvases) {
                  if (!survivingCanvasIds.has(oldCanvas.id)) {
                    await db.canvases.delete(oldCanvas.id);
                  }
                }
                for (const delCanvasId of mergeResult.deletedCanvasIds) {
                  if (!survivingCanvasIds.has(delCanvasId)) {
                    await db.canvases.delete(delCanvasId);
                  }
                }
                if (mergedCanvases.length > 0) {
                  await db.canvases.bulkPut(mergedCanvases);
                }

                // Sync settings
                const mergedTimestamps = (mergedSettings['_settings_timestamps'] as Record<string, string>) || {};
                for (const [k, v] of Object.entries(mergedSettings)) {
                  if (k.startsWith('_')) continue;
                  if (v !== undefined) {
                    const updatedAt = mergedTimestamps[k];
                    await db.settings.put({ key: k, value: v, updatedAt });
                    if (typeof localStorage !== 'undefined' && updatedAt) {
                      localStorage.setItem(`${k}_updated_at`, updatedAt);
                    }
                  }
                }
              }
            );
          });

          applyThemeSettingsFromRecord(mergedSettings);
          this.saveLocalTombstones(mergedTombstones);
          this.notifyDataSynced();
        } else {
          applyThemeSettingsFromRecord(mergedSettings);
          this.saveLocalTombstones(mergedTombstones);
        }
      }

      // Encrypt and push merged state back to cloud with a fresh 12-byte IV
      const newPayload: DecryptedSyncPayload = {
        version: 1,
        updatedAt: new Date().toISOString(),
        deviceId: this.config.deviceId,
        media: mergedMedia,
        episodes: mergedCompactEpisodes,
        customLists: mergedCustomLists,
        canvases: mergedCanvases,
        settings: mergedSettings,
        tombstones: mergedTombstones
      };

      const encryptedEnvelope = await encryptPayload(
        newPayload,
        this.config.secretKey,
        this.config.deviceId
      );

      await adapter.put(this.config.vaultId, encryptedEnvelope);

      const now = new Date();
      this.config.lastSyncedAt = now.toISOString();
      this.saveConfig(this.config);
      this.setStatus('synced', now, undefined, mergedMedia.length);
      return hasChanges;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Sync error';
      console.warn('[CloudSync] Sync failed:', msg);
      this.setStatus(
        'error',
        this.config.lastSyncedAt ? new Date(this.config.lastSyncedAt) : null,
        msg
      );
      throw err;
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Debounced auto-push (1500ms default) after any local Dexie mutation.
   */
  schedulePush(delayMs: number = 1500): void {
    if (!this.isConfigured()) return;
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      this.syncNow().catch((err) => {
        console.warn('[CloudSync] Scheduled push failed:', err);
      });
    }, delayMs);
  }

  private setupLifecycleListeners(): void {
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('online', () => {
        if (this.isConfigured()) {
          this.syncNow().catch(() => {});
        }
      });

      window.addEventListener('offline', () => {
        if (this.isConfigured()) {
          this.setStatus(
            'offline',
            this.config?.lastSyncedAt ? new Date(this.config.lastSyncedAt) : null
          );
        }
      });
    }

    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && this.isConfigured()) {
          this.syncNow().catch(() => {});
        }
      });
    }
  }
}

export const syncManager = new SyncManager();
