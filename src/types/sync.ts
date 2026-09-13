import type { MediaItem, MediaStatus } from './media';

export interface SyncResult {
  hasUpdates: boolean;
  newEpisodesCount?: number;
  updatedTitlesCount?: number;
  totalEpisodes?: number;
  mediaTitle?: string;
  isCompletedWithNewEpisodes?: boolean;
  previousStatus?: MediaStatus;
  error?: string;
}

export interface SyncState {
  isActive: boolean;
  isComplete: boolean;
  isCancelled: boolean;
  completed: number;
  total: number;
  currentTitle: string;
  updatedCount: number;
}

export interface SyncQueueOptions {
  concurrency?: number;
  delayMs?: number;
  onProgress?: (
    completed: number,
    total: number,
    currentShow: MediaItem,
    result: SyncResult | null,
    isCancelled: boolean
  ) => void;
  abortSignal?: AbortSignal;
}

export interface SyncQueueResult {
  total: number;
  completed: number;
  updatedShows: Array<{ show: MediaItem; result: SyncResult }>;
  isCancelled: boolean;
}

export interface SyncAlert {
  id: string;
  title: string;
  message: string;
}
