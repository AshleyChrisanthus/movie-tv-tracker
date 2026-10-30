import type { MediaItem, CompactEpisodeItem, CustomList, FranchiseCanvas } from '../../types';

export type SyncProviderType = 'relay' | 'custom' | 'supabase';

export interface SyncConfig {
  enabled: boolean;
  vaultId: string;
  secretKey: string; // Base64URL-encoded 256-bit AES key (43 chars)
  provider: SyncProviderType;
  customEndpoint?: string;
  customAuthHeader?: string;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  autoSync: boolean;
  lastSyncedAt?: string;
  deviceId: string;
}

export interface EncryptedVaultEnvelope {
  v: 1;
  iv: string;          // Base64 12-byte IV
  salt?: string;       // Optional Base64 PBKDF2 salt
  ciphertext: string;  // Base64 AES-GCM ciphertext
  updatedAt: string;   // ISO 8601 timestamp
  deviceId: string;    // Originating device identifier
}

export type SyncTombstoneType = 'media' | 'list' | 'canvas';

export interface SyncTombstone {
  id: string;
  type: SyncTombstoneType;
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

export type SyncStatusState = 'disconnected' | 'syncing' | 'synced' | 'error' | 'offline';

export interface SyncStatus {
  state: SyncStatusState;
  lastSyncedAt: Date | null;
  errorMessage?: string;
  itemCount?: number;
}
