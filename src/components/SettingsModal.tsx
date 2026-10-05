import React, { useState, useEffect } from 'react';
import { 
  X, Key, Download, Upload, Folder, FolderCheck, CheckCircle, 
  AlertCircle, ExternalLink, HardDrive, RefreshCw, FileText, Link2, Unlink,
  Zap, Archive, Sparkles, Globe, Clock, Star, Calendar, BookOpen, Tv, Play
} from 'lucide-react';
import { getSetting, setSetting, clearAllPersonalRatings } from '../db';
import { 
  saveExportToLocal, downloadExportToBrowser, 
  getLocalExportsList, importBackupFile,
  isFileSystemAccessSupported, linkBackupDirectory, 
  getLinkedDirectoryHandle, unlinkBackupDirectory 
} from '../services/exportService';
import { 
  getUserTimeZone, setUserTimeZone, getSystemTimeZone, 
  COMMON_TIMEZONES, type TimeZoneOption 
} from '../utils/timezone';
import { STREAMING_REGIONS, getBrowserRegion } from '../utils/region';
import type { BackupMode, ExportFileInfo, RatingScale, BookSearchProvider } from '../types';

export interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDataRestored?: () => void;
  ratingScale?: RatingScale;
  onRatingScaleChange?: (scale: RatingScale) => void;
  upcomingDays?: number;
  onUpcomingDaysChange?: (days: number) => void;
}

interface NoticeStatus {
  success: boolean;
  message: string;
}

export default function SettingsModal({
  isOpen,
  onClose,
  onDataRestored,
  ratingScale: propRatingScale,
  onRatingScaleChange,
  upcomingDays: propUpcomingDays,
  onUpcomingDaysChange
}: SettingsModalProps): React.JSX.Element | null {
  const [apiKey, setApiKey] = useState<string>('');
  const [isTestingKey, setIsTestingKey] = useState<boolean>(false);
  const [keyStatus, setKeyStatus] = useState<NoticeStatus | null>(null);

  // User Rating Scale (Issue #29)
  const [ratingScale, setRatingScale] = useState<RatingScale>(propRatingScale || '10');
  const [ratingNotice, setRatingNotice] = useState<NoticeStatus | null>(null);
  const [isClearingRatings, setIsClearingRatings] = useState<boolean>(false);

  // Upcoming Releases Window Days (Issue #40)
  const [upcomingDays, setUpcomingDays] = useState<number>(propUpcomingDays || 7);
  const [customDaysInput, setCustomDaysInput] = useState<string>(String(propUpcomingDays || 7));

  // Book Search Provider & Key (Issue #27)
  const [defaultBookProvider, setDefaultBookProvider] = useState<BookSearchProvider>('openlibrary');
  const [googleBooksApiKey, setGoogleBooksApiKey] = useState<string>('');
  const [bookSettingNotice, setBookSettingNotice] = useState<NoticeStatus | null>(null);

  // Timezone & Locale State
  const [userTimezone, setUserTimezone] = useState<string>(getSystemTimeZone());
  const [timezoneNotice, setTimezoneNotice] = useState<NoticeStatus | null>(null);

  // Streaming Region (Issue #46)
  const [streamingRegion, setStreamingRegion] = useState<string>('auto');
  const [regionNotice, setRegionNotice] = useState<NoticeStatus | null>(null);
  
  // File System Access & Export State
  const [fsSupported, setFsSupported] = useState<boolean>(false);
  const [linkedDirHandle, setLinkedDirHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [backupMode, setBackupMode] = useState<BackupMode>('compact');
  const [isLinking, setIsLinking] = useState<boolean>(false);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [isDownloading, setIsDownloading] = useState<boolean>(false);
  const [exportNotice, setExportNotice] = useState<NoticeStatus | null>(null);
  
  // Backups list
  const [localExports, setLocalExports] = useState<ExportFileInfo[]>([]);
  
  // Import state
  const [importFile, setImportFile] = useState<File | null>(null);
  const [overwriteMode, setOverwriteMode] = useState<boolean>(false);
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const [importNotice, setImportNotice] = useState<NoticeStatus | null>(null);

  // Load state on modal open
  useEffect(() => {
    if (isOpen) {
      setFsSupported(isFileSystemAccessSupported());
      getSetting<string>('tmdb_api_key', '').then(k => setApiKey(k || ''));
      getSetting<BackupMode>('backup_mode', 'compact').then(m => setBackupMode(m || 'compact'));
      getSetting<BookSearchProvider>('default_book_provider', 'openlibrary').then(p => setDefaultBookProvider(p || 'openlibrary'));
      getSetting<string>('google_books_api_key', '').then(k => setGoogleBooksApiKey(k || ''));
      if (propRatingScale) {
        setRatingScale(propRatingScale);
      } else {
        getSetting<RatingScale>('rating_scale', '10').then(s => setRatingScale(s || '10'));
      }
      if (propUpcomingDays) {
        setUpcomingDays(propUpcomingDays);
      } else {
        getSetting<number>('upcoming_window_days', 7).then(d => setUpcomingDays(d || 7));
      }
      getUserTimeZone().then(tz => setUserTimezone(tz));
      getSetting<string>('streaming_region', 'auto').then(r => setStreamingRegion(r || 'auto'));
      checkLinkedDirectory();
      loadExportsList();
    } else {
      setKeyStatus(null);
      setExportNotice(null);
      setImportNotice(null);
      setTimezoneNotice(null);
      setRegionNotice(null);
      setRatingNotice(null);
      setBookSettingNotice(null);
    }
  }, [isOpen, propRatingScale, propUpcomingDays]);

  // Handle Escape key to exit settings modal
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleRatingScaleChange = async (scale: RatingScale) => {
    setRatingScale(scale);
    await setSetting('rating_scale', scale);
    localStorage.setItem('bingelog_rating_scale', scale);
    if (onRatingScaleChange) onRatingScaleChange(scale);
  };

  const handleClearPersonalRatings = async () => {
    if (!window.confirm('Are you sure you want to reset all your personal ratings to unrated across your library? Public/community ratings will NOT be touched.')) {
      return;
    }
    setIsClearingRatings(true);
    try {
      const count = await clearAllPersonalRatings();
      setRatingNotice({
        success: true,
        message: `Successfully reset personal ratings to unrated on ${count} item(s).`
      });
      if (onDataRestored) onDataRestored();
      setTimeout(() => setRatingNotice(null), 4000);
    } catch (err) {
      setRatingNotice({
        success: false,
        message: 'Failed to reset personal ratings: ' + String(err)
      });
    } finally {
      setIsClearingRatings(false);
    }
  };

  const handleUpcomingDaysChange = async (days: number) => {
    const val = Math.max(1, Math.min(365, days));
    setUpcomingDays(val);
    setCustomDaysInput(String(val));
    await setSetting('upcoming_window_days', val);
    localStorage.setItem('bingelog_upcoming_days', String(val));
    if (onUpcomingDaysChange) onUpcomingDaysChange(val);
  };

  const handleBookProviderChange = async (provider: BookSearchProvider) => {
    setDefaultBookProvider(provider);
    await setSetting('default_book_provider', provider);
    setBookSettingNotice({ success: true, message: `Default book provider set to ${provider === 'googlebooks' ? 'Google Books' : 'Open Library'}.` });
    setTimeout(() => setBookSettingNotice(null), 3000);
  };

  const handleSaveGoogleBooksApiKey = async () => {
    await setSetting('google_books_api_key', googleBooksApiKey.trim());
    setBookSettingNotice({ success: true, message: 'Google Books API Key saved.' });
    setTimeout(() => setBookSettingNotice(null), 3000);
  };

  const checkLinkedDirectory = async () => {
    const handle = await getLinkedDirectoryHandle();
    setLinkedDirHandle(handle);
  };

  const loadExportsList = async () => {
    const list = await getLocalExportsList();
    setLocalExports(list);
  };

  if (!isOpen) return null;

  // TMDB API Key Handlers
  const handleSaveApiKey = async () => {
    await setSetting('tmdb_api_key', apiKey.trim());
    setKeyStatus({ success: true, message: 'TMDB API key saved successfully!' });
  };

  const handleTestApiKey = async () => {
    if (!apiKey.trim()) {
      setKeyStatus({ success: false, message: 'Please enter an API key first' });
      return;
    }

    setIsTestingKey(true);
    setKeyStatus(null);
    try {
      const res = await fetch(`https://api.themoviedb.org/3/authentication?api_key=${encodeURIComponent(apiKey.trim())}`);
      const data = await res.json() as { success?: boolean; status_message?: string };
      if (res.ok && data.success) {
        await setSetting('tmdb_api_key', apiKey.trim());
        setKeyStatus({ success: true, message: 'TMDB API connection verified & saved!' });
      } else {
        setKeyStatus({ success: false, message: `Verification failed: ${data.status_message || 'Invalid key'}` });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setKeyStatus({ success: false, message: `Connection error: ${message}` });
    } finally {
      setIsTestingKey(false);
    }
  };

  // Link Folder Handler (One-Time Setup)
  const handleLinkDirectory = async () => {
    setIsLinking(true);
    setExportNotice(null);
    try {
      const handle = await linkBackupDirectory();
      setLinkedDirHandle(handle);
      setExportNotice({
        success: true,
        message: `Successfully linked folder "${handle.name}". Future backups will save straight into it!`
      });
      await loadExportsList();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setExportNotice({
        success: false,
        message
      });
    } finally {
      setIsLinking(false);
    }
  };

  // Unlink Folder Handler
  const handleUnlinkDirectory = async () => {
    await unlinkBackupDirectory();
    setLinkedDirHandle(null);
    setExportNotice({
      success: true,
      message: 'Folder unlinked. You can link a new folder anytime.'
    });
    await loadExportsList();
  };

  // Backup Mode Handler
  const handleSetBackupMode = async (mode: BackupMode) => {
    setBackupMode(mode);
    await setSetting('backup_mode', mode);
  };

  // Save Export Handler
  const handleSaveExport = async () => {
    setIsExporting(true);
    setExportNotice(null);
    try {
      const res = await saveExportToLocal(undefined, { mode: backupMode });
      let msg = '';
      const sizeStr = res.fileSize ? ` (${(res.fileSize / 1024).toFixed(1)} KB)` : '';
      if (res.method === 'linked_folder') {
        msg = `Saved to "${res.folderName}/${res.filename}"${sizeStr} directly on your hard drive!`;
      } else if (res.method === 'local_server') {
        msg = `Saved to ${res.filePath}${sizeStr} via local server.`;
      } else if (res.method === 'file_picker') {
        msg = `Saved ${res.filename}${sizeStr} to chosen location.`;
      } else {
        msg = `Downloaded ${res.filename}${sizeStr} to your Downloads folder.`;
      }

      setExportNotice({ success: true, message: msg });
      await loadExportsList();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setExportNotice({ success: false, message });
    } finally {
      setIsExporting(false);
    }
  };

  // Download directly to browser Downloads folder
  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      const res = await downloadExportToBrowser(undefined, { mode: backupMode });
      setExportNotice({
        success: true,
        message: `Downloaded ${res.filename} to your browser Downloads folder.`
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setExportNotice({
        success: false,
        message: `Download failed: ${message}`
      });
    } finally {
      setIsDownloading(false);
    }
  };

  // Import JSON backup
  const handleImport = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!importFile) return;

    if (overwriteMode && !window.confirm('WARNING: Overwrite mode will replace all existing movies and TV shows. Are you sure?')) {
      return;
    }

    setIsImporting(true);
    setImportNotice(null);
    try {
      const res = await importBackupFile(importFile, overwriteMode);
      setImportNotice({
        success: true,
        message: `Successfully imported ${res.mediaCount} media items and ${res.episodesCount} episodes!`
      });
      if (onDataRestored) onDataRestored();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setImportNotice({
        success: false,
        message
      });
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div 
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/65 backdrop-blur-md overflow-y-auto animate-fadeIn"
    >
      <div className="relative w-full max-w-2xl bg-[var(--card-bg)] border border-[var(--border-light)] rounded-2xl shadow-2xl overflow-hidden my-auto flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="p-4 border-b border-[var(--border-light)] bg-[var(--bg-primary)] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[var(--accent-bg)] text-[var(--accent)]">
              <HardDrive className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[var(--text-primary)]">Settings & Data Management</h2>
              <p className="text-xs text-[var(--text-secondary)]">API configuration, IndexedDB storage, and folder backups</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          
          {/* TMDB API KEY SECTION */}
          <div className="p-4 bg-[var(--bg-primary)] rounded-xl border border-[var(--border-light)] space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Key className="w-4 h-4 text-[var(--accent)]" />
                <h3 className="text-sm font-bold text-[var(--text-primary)]">TMDB API Configuration</h3>
              </div>
              <a
                href="https://www.themoviedb.org/settings/api"
                target="_blank"
                rel="noreferrer"
                className="text-[11px] text-[var(--accent)] hover:brightness-110 flex items-center gap-1 hover:underline font-semibold"
              >
                <span>Get a free key</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              TMDB provides high-resolution posters, backdrops, and complete episode guides. 
              If left blank, TVMaze will automatically handle TV shows without requiring any key.
            </p>

            <div className="flex items-center gap-2">
              <input
                type="text"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Enter TMDB API Key (v3 auth)"
                className="flex-1 px-3 py-2 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl text-xs text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:outline-none focus:border-[var(--input-focus)] font-mono"
              />
              <button
                type="button"
                onClick={handleSaveApiKey}
                className="px-3.5 py-2 rounded-xl bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] text-xs font-semibold transition-all border border-[var(--border-light)]"
              >
                Save
              </button>
              <button
                type="button"
                onClick={handleTestApiKey}
                disabled={isTestingKey}
                className="px-3.5 py-2 rounded-xl bg-[var(--accent)] hover:brightness-110 text-white text-xs font-bold transition-all shadow-md shadow-[var(--accent)]/25 active:scale-95 disabled:opacity-50"
              >
                {isTestingKey ? 'Testing...' : 'Test & Save'}
              </button>
            </div>

            {keyStatus && (
              <div className={`p-2.5 rounded-lg text-xs flex items-center gap-2 ${
                keyStatus.success ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-800/60' : 'bg-red-950/60 text-red-300 border border-red-800/60'
              }`}>
                {keyStatus.success ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                <span>{keyStatus.message}</span>
              </div>
            )}
          </div>

          {/* TIMEZONE & LOCALE CONFIGURATION SECTION */}
          <div className="p-4 bg-[var(--bg-primary)] rounded-xl border border-[var(--border-light)] space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-sky-400" />
                <h3 className="text-sm font-bold text-[var(--text-primary)]">Timezone & Release Schedules</h3>
              </div>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/30 font-medium">
                DST-Aware
              </span>
            </div>

            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              Show release countdowns and episode air dates are automatically converted from origin networks (e.g. US Eastern) to your local time.
            </p>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <select
                value={userTimezone}
                onChange={async (e) => {
                  const tz = e.target.value;
                  setUserTimezone(tz);
                  await setUserTimeZone(tz);
                  setTimezoneNotice({
                    success: true,
                    message: `Timezone updated to ${tz}. All release countdowns will use this schedule.`
                  });
                  setTimeout(() => setTimezoneNotice(null), 3000);
                }}
                className="flex-1 px-3 py-2 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--input-focus)] font-medium cursor-pointer"
              >
                <option value={getSystemTimeZone()}>Auto-Detect (System: {getSystemTimeZone()})</option>
                {COMMON_TIMEZONES.map(tz => (
                  <option key={tz.value} value={tz.value}>
                    {tz.label}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={async () => {
                  const sysTz = getSystemTimeZone();
                  setUserTimezone(sysTz);
                  await setUserTimeZone(sysTz);
                  setTimezoneNotice({
                    success: true,
                    message: `Reset to system browser timezone (${sysTz}).`
                  });
                  setTimeout(() => setTimezoneNotice(null), 3000);
                }}
                className="px-3.5 py-2 rounded-xl bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] text-xs font-semibold transition-all border border-[var(--border-light)] shrink-0"
              >
                Use System
              </button>
            </div>

            {timezoneNotice && (
              <div className="p-2.5 rounded-lg text-xs flex items-center gap-2 bg-sky-950/60 text-sky-300 border border-sky-800/60">
                <CheckCircle className="w-4 h-4 text-sky-400" />
                <span>{timezoneNotice.message}</span>
              </div>
            )}
          </div>

          {/* STREAMING REGION & WATCH PROVIDERS SECTION (Issue #46) */}
          <div className="p-4 bg-[var(--bg-primary)] rounded-xl border border-[var(--border-light)] space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Tv className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-bold text-[var(--text-primary)]">Streaming Region & Providers</h3>
              </div>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-medium">
                TMDB & JustWatch
              </span>
            </div>

            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              Determines theatrical-to-streaming drop dates and subscription platforms (e.g. Netflix, Max, Disney+) displayed on movie cards and media details.
            </p>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <select
                value={streamingRegion}
                onChange={async (e) => {
                  const reg = e.target.value;
                  setStreamingRegion(reg);
                  await setSetting('streaming_region', reg);
                  setRegionNotice({
                    success: true,
                    message: `Streaming region updated to ${reg === 'auto' ? `Auto (${getBrowserRegion()})` : reg}. All movie cards will localize streaming to this region.`
                  });
                  setTimeout(() => setRegionNotice(null), 3500);
                }}
                className="flex-1 px-3 py-2 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--input-focus)] font-medium cursor-pointer"
              >
                <option value="auto">Auto-Detect (Browser: {getBrowserRegion()})</option>
                {STREAMING_REGIONS.map(reg => (
                  <option key={reg.code} value={reg.code}>
                    {reg.flag} {reg.name} ({reg.code})
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={async () => {
                  setStreamingRegion('auto');
                  await setSetting('streaming_region', 'auto');
                  setRegionNotice({
                    success: true,
                    message: `Reset to Auto-Detect (Browser: ${getBrowserRegion()}).`
                  });
                  setTimeout(() => setRegionNotice(null), 3500);
                }}
                className="px-3.5 py-2 rounded-xl bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] text-xs font-semibold transition-all border border-[var(--border-light)] shrink-0"
              >
                Use Auto
              </button>
            </div>

            {regionNotice && (
              <div className="p-2.5 rounded-lg text-xs flex items-center gap-2 bg-emerald-950/60 text-emerald-300 border border-emerald-800/60">
                <CheckCircle className="w-4 h-4 text-emerald-400" />
                <span>{regionNotice.message}</span>
              </div>
            )}
          </div>

          {/* USER RATINGS & SCALE SECTION (Issue #29) */}
          <div className="p-4 bg-[var(--bg-primary)] rounded-xl border border-[var(--border-light)] space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
                <h3 className="text-sm font-bold text-[var(--text-primary)]">User Rating Scale</h3>
              </div>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30 font-medium">
                Active: /{ratingScale}
              </span>
            </div>

            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              Choose your preferred rating scale. Ratings are normalized internally, preserving fidelity when switching scales.
            </p>

            <div className="grid grid-cols-3 gap-2">
              {[
                { scale: '10' as const, label: '10-Point Scale', sub: 'e.g. 8.4 / 10' },
                { scale: '5' as const, label: '5-Point Scale', sub: 'e.g. 4.2 / 5' },
                { scale: '100' as const, label: '100-Point Scale', sub: 'e.g. 84 / 100' },
              ].map(({ scale, label, sub }) => (
                <button
                  key={scale}
                  type="button"
                  onClick={() => handleRatingScaleChange(scale)}
                  className={`p-2.5 rounded-xl border text-left transition-all ${
                    ratingScale === scale
                      ? 'bg-[var(--accent)] text-white border-[var(--accent)] shadow-sm'
                      : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border-[var(--border-light)]'
                  }`}
                >
                  <div className="text-xs font-bold">{label}</div>
                  <div className={`text-[10px] mt-0.5 ${ratingScale === scale ? 'text-white/80' : 'text-[var(--text-secondary)] font-mono'}`}>
                    {sub}
                  </div>
                </button>
              ))}
            </div>

            {/* Reset personal ratings housekeeping */}
            <div className="pt-3 border-t border-[var(--border-light)] flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-semibold text-[var(--text-primary)]">Personal Ratings Reset</div>
                <div className="text-[11px] text-[var(--text-secondary)]">
                  Reset all "My Rating" values to unrated across your library. Public community ratings will be preserved.
                </div>
              </div>
              <button
                type="button"
                onClick={handleClearPersonalRatings}
                disabled={isClearingRatings}
                className="px-3 py-1.5 rounded-xl bg-[var(--bg-tertiary)] hover:bg-rose-500/10 hover:text-rose-400 hover:border-rose-500/30 text-[var(--text-secondary)] text-xs font-semibold transition-all border border-[var(--border-light)] shrink-0 disabled:opacity-50"
              >
                {isClearingRatings ? 'Resetting...' : 'Reset My Ratings'}
              </button>
            </div>

            {ratingNotice && (
              <div className={`p-2.5 rounded-lg text-xs flex items-center gap-2 ${
                ratingNotice.success ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-800/60' : 'bg-rose-950/60 text-rose-300 border border-rose-800/60'
              }`}>
                {ratingNotice.success ? <CheckCircle className="w-4 h-4 text-emerald-400" /> : <AlertCircle className="w-4 h-4 text-rose-400" />}
                <span>{ratingNotice.message}</span>
              </div>
            )}
          </div>

          {/* BOOK SEARCH PROVIDER SECTION (Issue #27) */}
          <div className="p-4 bg-[var(--bg-primary)] rounded-xl border border-[var(--border-light)] space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-[var(--accent)]" />
                <h3 className="text-sm font-bold text-[var(--text-primary)]">Book Search Provider</h3>
              </div>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-[var(--accent)]/10 text-[var(--accent)] border border-[var(--accent)]/30 font-medium capitalize">
                {defaultBookProvider === 'googlebooks' ? 'Google Books' : defaultBookProvider === 'applebooks' ? 'Apple Books (eBooks)' : 'Open Library'}
              </span>
            </div>

            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              Select your default search provider for books. Open Library provides structured Works and Editions hierarchy. Google Books offers rich synopses. Apple Books provides a fast, zero-key commercial eBook catalog.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => handleBookProviderChange('openlibrary')}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  defaultBookProvider === 'openlibrary'
                    ? 'bg-[var(--accent)] text-white border-[var(--accent)] shadow-sm'
                    : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border-[var(--border-light)]'
                }`}
              >
                <div className="text-xs font-bold">Open Library (Default)</div>
                <div className={`text-[10px] mt-0.5 ${defaultBookProvider === 'openlibrary' ? 'text-white/80' : 'text-[var(--text-secondary)]'}`}>
                  Structured works, print editions & ISBNs
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleBookProviderChange('googlebooks')}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  defaultBookProvider === 'googlebooks'
                    ? 'bg-[var(--accent)] text-white border-[var(--accent)] shadow-sm'
                    : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border-[var(--border-light)]'
                }`}
              >
                <div className="text-xs font-bold">Google Books</div>
                <div className={`text-[10px] mt-0.5 ${defaultBookProvider === 'googlebooks' ? 'text-white/80' : 'text-[var(--text-secondary)]'}`}>
                  Rich descriptions (Key recommended)
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleBookProviderChange('applebooks')}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  defaultBookProvider === 'applebooks'
                    ? 'bg-[var(--accent)] text-white border-[var(--accent)] shadow-sm'
                    : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border-[var(--border-light)]'
                }`}
              >
                <div className="text-xs font-bold">Apple Books (eBooks)</div>
                <div className={`text-[10px] mt-0.5 ${defaultBookProvider === 'applebooks' ? 'text-white/80' : 'text-[var(--text-secondary)]'}`}>
                  Zero keys required (Digital eBooks only, no physical ISBNs)
                </div>
              </button>
            </div>

            {/* Optional Google Books API Key */}
            <div className="pt-2 border-t border-[var(--border-light)] space-y-1.5">
              <div className="flex items-center justify-between text-xs font-semibold text-[var(--text-primary)]">
                <span>Google Books API Key (Optional)</span>
                <span className="text-[10px] text-[var(--text-secondary)]">Useful if hitting quota limits</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="password"
                  value={googleBooksApiKey}
                  onChange={(e) => setGoogleBooksApiKey(e.target.value)}
                  placeholder="Leave empty for public zero-key access"
                  className="flex-1 bg-[var(--card-bg)] px-3 py-1.5 rounded-lg text-xs text-[var(--text-primary)] placeholder-[var(--text-secondary)] border border-[var(--border-light)] focus:outline-none focus:border-[var(--accent)]"
                />
                <button
                  type="button"
                  onClick={handleSaveGoogleBooksApiKey}
                  className="px-3 py-1.5 rounded-lg bg-[var(--accent)] text-white text-xs font-semibold hover:brightness-110 active:scale-95 transition-all shadow-xs cursor-pointer"
                >
                  Save Key
                </button>
              </div>
            </div>

            {bookSettingNotice && (
              <div className="p-2.5 rounded-lg text-xs flex items-center gap-2 bg-emerald-950/60 text-emerald-300 border border-emerald-800/60">
                <CheckCircle className="w-4 h-4 text-emerald-400" />
                <span>{bookSettingNotice.message}</span>
              </div>
            )}
          </div>

          {/* UPCOMING RELEASES WINDOW SECTION (Issue #40) */}
          <div className="p-4 bg-[var(--bg-primary)] rounded-xl border border-[var(--border-light)] space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-bold text-[var(--text-primary)]">Upcoming Releases Window</h3>
              </div>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-medium">
                {upcomingDays} Days
              </span>
            </div>

            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              When the library filter is set to "Coming Soon", only releases within this time window are displayed.
            </p>

            <div className="flex items-center gap-2 flex-wrap">
              {[7, 14, 30, 60].map(days => (
                <button
                  key={days}
                  type="button"
                  onClick={() => handleUpcomingDaysChange(days)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                    upcomingDays === days
                      ? 'bg-[var(--accent)] text-white border-[var(--accent)] shadow-sm'
                      : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border-[var(--border-light)]'
                  }`}
                >
                  {days} Days
                </button>
              ))}
              <div className="flex items-center gap-1.5 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl px-2.5 py-1 text-xs">
                <span className="text-[var(--text-secondary)]">Custom:</span>
                <input
                  type="number"
                  min="1"
                  max="365"
                  value={customDaysInput}
                  onChange={(e) => {
                    const raw = e.target.value;
                    setCustomDaysInput(raw);
                    if (raw.trim() !== '') {
                      const parsed = parseInt(raw, 10);
                      if (!isNaN(parsed) && parsed >= 1) {
                        const clamped = Math.min(365, parsed);
                        setUpcomingDays(clamped);
                        setSetting('upcoming_window_days', clamped);
                        localStorage.setItem('bingelog_upcoming_days', String(clamped));
                        if (onUpcomingDaysChange) onUpcomingDaysChange(clamped);
                      }
                    }
                  }}
                  onBlur={() => {
                    if (customDaysInput.trim() === '' || parseInt(customDaysInput, 10) < 1) {
                      handleUpcomingDaysChange(7);
                    } else {
                      const parsed = parseInt(customDaysInput, 10);
                      handleUpcomingDaysChange(parsed);
                    }
                  }}
                  className="w-12 bg-transparent text-xs text-[var(--text-primary)] font-bold focus:outline-none"
                />
                <span className="text-[var(--text-secondary)]">days</span>
              </div>
            </div>
          </div>

          {/* BACKUP & DIRECTORY LINKING SECTION */}
          <div className="p-4 bg-[var(--bg-primary)] rounded-xl border border-[var(--border-light)] space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Folder className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-bold text-[var(--text-primary)]">Direct Hard Drive Backup</h3>
              </div>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-[var(--accent-bg)] text-[var(--accent)] border border-[var(--accent)]/30 font-medium">
                Serverless & Offline
              </span>
            </div>

            {/* Folder Linking Card */}
            {fsSupported && (
              <div className="p-3.5 rounded-xl bg-[var(--card-bg)] border border-[var(--border-light)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-xl ${linkedDirHandle ? 'bg-emerald-600/20 text-emerald-400' : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'}`}>
                    {linkedDirHandle ? <FolderCheck className="w-5 h-5" /> : <Link2 className="w-5 h-5" />}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-[var(--text-primary)]">
                        {linkedDirHandle ? `Linked: 📁 ${linkedDirHandle.name}` : 'No Folder Linked Yet'}
                      </span>
                      {linkedDirHandle && (
                        <span className="text-[10px] bg-emerald-950 text-emerald-400 border border-emerald-800/60 px-1.5 py-0.2 rounded font-semibold">
                          Active
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-[var(--text-secondary)]">
                      {linkedDirHandle
                        ? 'Backups will be written straight to this folder with one click.'
                        : 'Link your project "exports/" folder once so backups write straight into it.'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {linkedDirHandle ? (
                    <button
                      type="button"
                      onClick={handleUnlinkDirectory}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-xs font-medium transition-all"
                    >
                      <Unlink className="w-3.5 h-3.5" />
                      <span>Unlink</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleLinkDirectory}
                      disabled={isLinking}
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[var(--accent)] hover:brightness-110 text-white text-xs font-bold transition-all shadow-md shadow-[var(--accent)]/25 active:scale-95 disabled:opacity-50"
                    >
                      <Link2 className="w-3.5 h-3.5" />
                      <span>{isLinking ? 'Selecting...' : 'Link exports/ Folder'}</span>
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Backup Mode Selector (Minimal vs Compact vs Full) */}
            <div className="p-3.5 rounded-xl bg-[var(--card-bg)] border border-[var(--border-light)] space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[var(--text-primary)]">Backup Mode</span>
                <span className="text-[11px] text-[var(--text-secondary)] font-mono">
                  {backupMode === 'minimal' ? 'Ultra-Light (~15–80 KB)' : backupMode === 'compact' ? 'Checklist (~120–200 KB)' : 'Full Archive (~500 KB+)'}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {/* Minimal Mode Card */}
                <button
                  type="button"
                  onClick={() => handleSetBackupMode('minimal')}
                  className={`p-2.5 rounded-xl border text-left transition-all ${
                    backupMode === 'minimal'
                      ? 'bg-[var(--accent-bg)] border-[var(--accent)] text-[var(--text-primary)] shadow-sm'
                      : 'bg-[var(--bg-secondary)] border-[var(--border-light)] text-[var(--text-secondary)] hover:border-[var(--accent)]/50'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                      <Zap className="w-3.5 h-3.5 text-amber-400" />
                      <span>Ultra-Light</span>
                    </span>
                    <span className="text-[9px] px-1.5 py-0.2 rounded font-semibold bg-amber-950 text-amber-400 border border-amber-800/60">
                      Smallest
                    </span>
                  </div>
                  <p className="text-[10px] text-[var(--text-secondary)] leading-relaxed">
                    History only. Stores watched episodes, ratings, and notes. Excludes all unwatched episodes.
                  </p>
                </button>

                {/* Compact Mode Card */}
                <button
                  type="button"
                  onClick={() => handleSetBackupMode('compact')}
                  className={`p-2.5 rounded-xl border text-left transition-all ${
                    backupMode === 'compact'
                      ? 'bg-[var(--accent-bg)] border-[var(--accent)] text-[var(--text-primary)] shadow-sm'
                      : 'bg-[var(--bg-secondary)] border-[var(--border-light)] text-[var(--text-secondary)] hover:border-[var(--accent)]/50'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-[var(--accent)]" />
                      <span>Compact</span>
                    </span>
                    <span className="text-[9px] px-1.5 py-0.2 rounded font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800/60">
                      Recommended
                    </span>
                  </div>
                  <p className="text-[10px] text-[var(--text-secondary)] leading-relaxed">
                    Offline checklist. Stores all episode titles & numbers without heavy synopses or images.
                  </p>
                </button>

                {/* Full Snapshot Card */}
                <button
                  type="button"
                  onClick={() => handleSetBackupMode('full')}
                  className={`p-2.5 rounded-xl border text-left transition-all ${
                    backupMode === 'full'
                      ? 'bg-[var(--accent-bg)] border-[var(--accent)] text-[var(--text-primary)] shadow-sm'
                      : 'bg-[var(--bg-secondary)] border-[var(--border-light)] text-[var(--text-secondary)] hover:border-[var(--accent)]/50'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                      <Archive className="w-3.5 h-3.5 text-blue-400" />
                      <span>Full Archive</span>
                    </span>
                    <span className="text-[9px] px-1.5 py-0.2 rounded font-semibold bg-[var(--bg-tertiary)] text-[var(--text-secondary)]">
                      Complete
                    </span>
                  </div>
                  <p className="text-[10px] text-[var(--text-secondary)] leading-relaxed">
                    Complete dump. Includes all episode plot summaries and image URLs for 100% cold restoration.
                  </p>
                </button>
              </div>
            </div>

            {/* Export Buttons */}
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleSaveExport}
                disabled={isExporting}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow-lg shadow-emerald-900/30 active:scale-95 disabled:opacity-50"
              >
                <Folder className="w-4 h-4" />
                <span>
                  {isExporting
                    ? 'Saving...'
                    : linkedDirHandle
                    ? `Save ${backupMode === 'minimal' ? 'Ultra-Light' : backupMode === 'compact' ? 'Compact' : 'Full'} Backup to ${linkedDirHandle.name}/`
                    : `Save ${backupMode === 'minimal' ? 'Ultra-Light' : backupMode === 'compact' ? 'Compact' : 'Full'} Backup (exports/)`}
                </span>
              </button>

              <button
                type="button"
                onClick={handleDownload}
                disabled={isDownloading}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] text-xs font-semibold transition-all border border-[var(--border-light)] active:scale-95 disabled:opacity-50"
              >
                <Download className="w-4 h-4 text-[var(--accent)]" />
                <span>{isDownloading ? 'Preparing...' : `Download ${backupMode === 'minimal' ? 'Ultra-Light' : backupMode === 'compact' ? 'Compact' : 'Full'} Backup`}</span>
              </button>
            </div>

            {exportNotice && (
              <div className={`p-2.5 rounded-lg text-xs flex items-center gap-2 ${
                exportNotice.success ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-800/60' : 'bg-red-950/60 text-red-300 border border-red-800/60'
              }`}>
                {exportNotice.success ? <CheckCircle className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                <span>{exportNotice.message}</span>
              </div>
            )}

            {/* Backups List */}
            {localExports.length > 0 && (
              <div className="pt-2 border-t border-[var(--border-light)]">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">
                    Found Backups ({localExports.length})
                  </span>
                  <button
                    type="button"
                    onClick={loadExportsList}
                    className="text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center gap-1"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Refresh</span>
                  </button>
                </div>

                <div className="space-y-1.5 max-h-36 overflow-y-auto">
                  {localExports.map(file => {
                    const isMinimal = file.filename.includes('minimal');
                    const isCompact = file.filename.includes('compact');
                    const isFull = file.filename.includes('full');

                    return (
                      <div
                        key={file.filename}
                        className="flex items-center justify-between p-2 rounded-lg bg-[var(--card-bg)] border border-[var(--border-light)] text-xs"
                      >
                        <div className="flex items-center gap-2 truncate">
                          <FileText className="w-3.5 h-3.5 text-[var(--text-secondary)] shrink-0" />
                          <span className="font-mono text-[var(--text-primary)] truncate">{file.filename}</span>
                          {isMinimal && (
                            <span className="text-[9px] px-1.5 py-0.2 rounded font-semibold bg-amber-950 text-amber-400 border border-amber-800/50 shrink-0">
                              Ultra-Light
                            </span>
                          )}
                          {isCompact && (
                            <span className="text-[9px] px-1.5 py-0.2 rounded font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800/50 shrink-0">
                              Compact
                            </span>
                          )}
                          {isFull && (
                            <span className="text-[9px] px-1.5 py-0.2 rounded font-semibold bg-[var(--bg-tertiary)] text-[var(--text-secondary)] shrink-0">
                              Full
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-[var(--text-secondary)] font-mono shrink-0 ml-2">
                          {(file.size / 1024).toFixed(1)} KB
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* RESTORE & IMPORT SECTION */}
          <div className="p-4 bg-[var(--bg-primary)] rounded-xl border border-[var(--border-light)] space-y-3">
            <div className="flex items-center gap-2">
              <Upload className="w-4 h-4 text-[var(--accent)]" />
              <h3 className="text-sm font-bold text-[var(--text-primary)]">Import Watch History Backup</h3>
            </div>

            <p className="text-xs text-[var(--text-secondary)]">
              Compatible with <strong>Ultra-Light</strong>, <strong>Compact</strong>, and <strong>Full</strong> backup files.
            </p>

            <form onSubmit={handleImport} className="space-y-3">
              <input
                type="file"
                accept=".json"
                onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                className="block w-full text-xs text-[var(--text-secondary)] file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-[var(--bg-tertiary)] file:text-[var(--text-primary)] hover:file:bg-[var(--bg-hover)] cursor-pointer"
              />

              <label className="flex items-center gap-2 cursor-pointer text-xs text-[var(--text-secondary)] select-none">
                <input
                  type="checkbox"
                  checked={overwriteMode}
                  onChange={(e) => setOverwriteMode(e.target.checked)}
                  className="rounded text-[var(--accent)] bg-[var(--input-bg)] border-[var(--input-border)] focus:ring-0 accent-[var(--accent)]"
                />
                <span>Overwrite existing library (unchecked merges with current list)</span>
              </label>

              <button
                type="submit"
                disabled={!importFile || isImporting}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--accent)] hover:brightness-110 text-white text-xs font-bold transition-all shadow-md shadow-[var(--accent)]/25 active:scale-95 disabled:opacity-50"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>{isImporting ? 'Importing...' : 'Restore Backup'}</span>
              </button>
            </form>

            {importNotice && (
              <div className={`p-2.5 rounded-lg text-xs flex items-center gap-2 ${
                importNotice.success ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-800/60' : 'bg-red-950/60 text-red-300 border border-red-800/60'
              }`}>
                {importNotice.success ? <CheckCircle className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                <span>{importNotice.message}</span>
              </div>
            )}
          </div>

        </div>

      </div>
    </div>
  );
}
