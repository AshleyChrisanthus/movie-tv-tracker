import type { MediaItem, EpisodeItem, CompactEpisodeItem } from './media';

export type BackupMode = 'minimal' | 'compact' | 'full';

export interface SettingItem {
  key: string;
  // Settings can store strings (e.g. API keys), directory handles, mode strings, etc.
  value: unknown;
}

export interface BaseBackupFile {
  app: 'BingeLog';
  version: 1;
  backupMode: BackupMode;
  exportedAt: string;                       // ISO timestamp
  totalMedia: number;
  totalEpisodes: number;
  media: MediaItem[];
  settings: SettingItem[];
}

export interface MinimalBackupFile extends BaseBackupFile {
  backupMode: 'minimal';
  // Contains only watched episodes (isWatched === 1) or custom media episodes
  episodes: CompactEpisodeItem[];
}

export interface CompactBackupFile extends BaseBackupFile {
  backupMode: 'compact';
  // Contains all episodes without synopses or screenshots
  episodes: CompactEpisodeItem[];
}

export interface FullBackupFile extends BaseBackupFile {
  backupMode: 'full';
  // Complete offline snapshot including synopses and screenshots
  episodes: EpisodeItem[];
}

export type BackupFile = MinimalBackupFile | CompactBackupFile | FullBackupFile;

export interface ExportResult {
  success: boolean;
  method: 'linked_folder' | 'local_server' | 'file_picker' | 'browser_download';
  filename: string;
  folderName?: string;
  filePath?: string;
  fileSize?: number;
  savedAt?: string;
}

export interface ExportFileInfo {
  filename: string;
  size: number;
  createdAt?: Date | string;
  modifiedAt: string;
  source: 'linked_folder' | 'local_server';
}

export interface ImportResult {
  mediaCount: number;
  episodesCount: number;
}
