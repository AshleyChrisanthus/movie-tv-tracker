import React, { useState, useEffect } from 'react';
import { 
  X, Key, Download, Upload, Folder, CheckCircle, 
  AlertCircle, ExternalLink, HardDrive, RefreshCw, FileText
} from 'lucide-react';
import { getSetting, setSetting } from '../db';
import { 
  saveExportToProjectFolder, downloadExportToBrowser, 
  getLocalExportsList, importBackupFile 
} from '../services/exportService';

export default function SettingsModal({ isOpen, onClose, onDataRestored }) {
  const [apiKey, setApiKey] = useState('');
  const [isTestingKey, setIsTestingKey] = useState(false);
  const [keyStatus, setKeyStatus] = useState(null); // { success: boolean, message: string }
  
  // Export status
  const [isExportingLocal, setIsExportingLocal] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [exportNotice, setExportNotice] = useState(null);
  
  // Existing files in exports/
  const [localExports, setLocalExports] = useState([]);
  
  // Import state
  const [importFile, setImportFile] = useState(null);
  const [overwriteMode, setOverwriteMode] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importNotice, setImportNotice] = useState(null);

  // Load API key and local exports on modal open
  useEffect(() => {
    if (isOpen) {
      getSetting('tmdb_api_key', '').then(k => setApiKey(k || ''));
      loadExportsList();
    } else {
      setKeyStatus(null);
      setExportNotice(null);
      setImportNotice(null);
    }
  }, [isOpen]);

  const loadExportsList = async () => {
    const list = await getLocalExportsList();
    setLocalExports(list);
  };

  if (!isOpen) return null;

  // Save API Key
  const handleSaveApiKey = async () => {
    await setSetting('tmdb_api_key', apiKey.trim());
    setKeyStatus({ success: true, message: 'TMDB API key saved successfully!' });
  };

  // Test TMDB API Key
  const handleTestApiKey = async () => {
    if (!apiKey.trim()) {
      setKeyStatus({ success: false, message: 'Please enter an API key first' });
      return;
    }

    setIsTestingKey(true);
    setKeyStatus(null);
    try {
      const res = await fetch(`https://api.themoviedb.org/3/authentication?api_key=${encodeURIComponent(apiKey.trim())}`);
      const data = await res.json();
      if (res.ok && data.success) {
        await setSetting('tmdb_api_key', apiKey.trim());
        setKeyStatus({ success: true, message: 'TMDB API connection verified & saved!' });
      } else {
        setKeyStatus({ success: false, message: `Verification failed: ${data.status_message || 'Invalid key'}` });
      }
    } catch (err) {
      setKeyStatus({ success: false, message: `Connection error: ${err.message}` });
    } finally {
      setIsTestingKey(false);
    }
  };

  // Export to local exports/ folder
  const handleSaveLocal = async () => {
    setIsExportingLocal(true);
    setExportNotice(null);
    try {
      const res = await saveExportToProjectFolder();
      setExportNotice({
        success: true,
        message: `Successfully saved backup to ${res.filePath} (${(res.fileSize / 1024).toFixed(1)} KB)`
      });
      await loadExportsList();
    } catch (err) {
      setExportNotice({
        success: false,
        message: `Failed to save to exports folder: ${err.message}`
      });
    } finally {
      setIsExportingLocal(false);
    }
  };

  // Download directly to browser Downloads folder
  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      const res = await downloadExportToBrowser();
      setExportNotice({
        success: true,
        message: `Downloaded ${res.filename} to your browser Downloads folder.`
      });
    } catch (err) {
      setExportNotice({
        success: false,
        message: `Download failed: ${err.message}`
      });
    } finally {
      setIsDownloading(false);
    }
  };

  // Import JSON backup
  const handleImport = async (e) => {
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
      setImportNotice({
        success: false,
        message: err.message
      });
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-sm overflow-y-auto animate-fadeIn">
      <div className="relative w-full max-w-2xl bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden my-auto flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="p-4 border-b border-zinc-800 bg-zinc-950 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-indigo-600/20 text-indigo-400">
              <HardDrive className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Settings & Data Management</h2>
              <p className="text-xs text-zinc-400">API configuration, IndexedDB storage, and backup exports</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          
          {/* TMDB API KEY SECTION */}
          <div className="p-4 bg-zinc-950 rounded-xl border border-zinc-800 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Key className="w-4 h-4 text-indigo-400" />
                <h3 className="text-sm font-bold text-white">TMDB API Configuration</h3>
              </div>
              <a
                href="https://www.themoviedb.org/settings/api"
                target="_blank"
                rel="noreferrer"
                className="text-[11px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1 hover:underline"
              >
                <span>Get a free key</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            <p className="text-xs text-zinc-400 leading-relaxed">
              TMDB provides high-resolution posters, backdrops, and complete episode guides for both movies and series. 
              If left blank, TVMaze will automatically handle TV shows without requiring any key.
            </p>

            <div className="flex items-center gap-2">
              <input
                type="text"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Enter TMDB API Key (v3 auth)"
                className="flex-1 px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500 font-mono"
              />
              <button
                onClick={handleSaveApiKey}
                className="px-3.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold transition-all"
              >
                Save
              </button>
              <button
                onClick={handleTestApiKey}
                disabled={isTestingKey}
                className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow-md shadow-indigo-600/30 active:scale-95 disabled:opacity-50"
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

          {/* BACKUP & EXPORT SECTION */}
          <div className="p-4 bg-zinc-950 rounded-xl border border-zinc-800 space-y-4">
            <div className="flex items-center gap-2">
              <Folder className="w-4 h-4 text-emerald-400" />
              <h3 className="text-sm font-bold text-white">Export & Backup Watch History</h3>
            </div>

            <p className="text-xs text-zinc-400 leading-relaxed">
              All your records are stored safely in browser IndexedDB (avoiding local storage limits). You can save a backup snapshot directly to your project's <code className="text-indigo-300 bg-zinc-900 px-1 py-0.5 rounded">exports/</code> folder, or download it immediately to your Downloads folder.
            </p>

            <div className="flex flex-wrap items-center gap-3">
              {/* Default Export to Project Folder */}
              <button
                onClick={handleSaveLocal}
                disabled={isExportingLocal}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow-lg shadow-emerald-900/30 active:scale-95 disabled:opacity-50"
              >
                <Folder className="w-4 h-4" />
                <span>{isExportingLocal ? 'Saving to exports/...' : 'Save to Project (exports/)'}</span>
              </button>

              {/* Option to Download directly */}
              <button
                onClick={handleDownload}
                disabled={isDownloading}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold transition-all border border-zinc-700 active:scale-95 disabled:opacity-50"
              >
                <Download className="w-4 h-4" />
                <span>{isDownloading ? 'Preparing...' : 'Download to Downloads Folder'}</span>
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

            {/* Existing local backups in exports/ folder */}
            {localExports.length > 0 && (
              <div className="pt-2 border-t border-zinc-800">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
                    Backups in exports/ folder ({localExports.length})
                  </span>
                  <button
                    onClick={loadExportsList}
                    className="text-[11px] text-zinc-500 hover:text-zinc-300 flex items-center gap-1"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Refresh</span>
                  </button>
                </div>

                <div className="space-y-1.5 max-h-36 overflow-y-auto">
                  {localExports.map(file => (
                    <div
                      key={file.filename}
                      className="flex items-center justify-between p-2 rounded-lg bg-zinc-900/80 border border-zinc-800 text-xs"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <FileText className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                        <span className="font-mono text-zinc-200 truncate">{file.filename}</span>
                      </div>
                      <span className="text-[11px] text-zinc-500 font-mono shrink-0 ml-2">
                        {(file.size / 1024).toFixed(1)} KB
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* RESTORE & IMPORT SECTION */}
          <div className="p-4 bg-zinc-950 rounded-xl border border-zinc-800 space-y-3">
            <div className="flex items-center gap-2">
              <Upload className="w-4 h-4 text-violet-400" />
              <h3 className="text-sm font-bold text-white">Import Watch History Backup</h3>
            </div>

            <form onSubmit={handleImport} className="space-y-3">
              <input
                type="file"
                accept=".json"
                onChange={(e) => setImportFile(e.target.files[0] || null)}
                className="block w-full text-xs text-zinc-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-zinc-800 file:text-zinc-200 hover:file:bg-zinc-700 cursor-pointer"
              />

              <label className="flex items-center gap-2 cursor-pointer text-xs text-zinc-300 select-none">
                <input
                  type="checkbox"
                  checked={overwriteMode}
                  onChange={(e) => setOverwriteMode(e.target.checked)}
                  className="rounded text-violet-600 bg-zinc-900 border-zinc-700 focus:ring-0"
                />
                <span>Overwrite existing library (unchecked merges with current list)</span>
              </label>

              <button
                type="submit"
                disabled={!importFile || isImporting}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold transition-all shadow-md shadow-violet-600/30 active:scale-95 disabled:opacity-50"
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
