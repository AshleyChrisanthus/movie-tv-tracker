import React, { useState, useEffect } from 'react';
import { 
  X, Key, Download, Upload, Folder, FolderCheck, CheckCircle, 
  AlertCircle, ExternalLink, HardDrive, RefreshCw, FileText, Link2, Unlink,
  Zap, Archive, Sparkles
} from 'lucide-react';
import { getSetting, setSetting } from '../db';
import { 
  saveExportToLocal, downloadExportToBrowser, 
  getLocalExportsList, importBackupFile,
  isFileSystemAccessSupported, linkBackupDirectory, 
  getLinkedDirectoryHandle, unlinkBackupDirectory 
} from '../services/exportService';
import type { BackupMode, ExportFileInfo } from '../types';

export interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDataRestored?: () => void;
}

interface NoticeStatus {
  success: boolean;
  message: string;
}

export default function SettingsModal({
  isOpen,
  onClose,
  onDataRestored
}: SettingsModalProps): React.JSX.Element | null {
  const [apiKey, setApiKey] = useState<string>('');
  const [isTestingKey, setIsTestingKey] = useState<boolean>(false);
  const [keyStatus, setKeyStatus] = useState<NoticeStatus | null>(null);
  
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
      checkLinkedDirectory();
      loadExportsList();
    } else {
      setKeyStatus(null);
      setExportNotice(null);
      setImportNotice(null);
    }
  }, [isOpen]);

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/65 backdrop-blur-md overflow-y-auto animate-fadeIn">
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
