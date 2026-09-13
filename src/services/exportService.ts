import { exportAllData, importData, getSetting, setSetting } from '../db/index';
import type {
  BackupFile,
  BackupMode,
  ExportResult,
  ExportFileInfo,
  ImportResult
} from '../types';

const BACKUP_DIR_SETTING_KEY = 'backup_directory_handle';

/**
 * Check if the browser supports the File System Access API.
 */
export function isFileSystemAccessSupported(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

/**
 * Prompt user once to select a backup directory (e.g. project's exports/ folder)
 * and persist the handle in IndexedDB.
 */
export async function linkBackupDirectory(): Promise<FileSystemDirectoryHandle> {
  if (!isFileSystemAccessSupported() || !window.showDirectoryPicker) {
    throw new Error('Your browser does not support the File System Access API. Please use Chrome, Edge, or Brave.');
  }

  const dirHandle = await window.showDirectoryPicker({
    id: 'bingelog_exports_dir',
    mode: 'readwrite',
    startIn: 'documents'
  });

  // Verify permission
  const permission = await dirHandle.requestPermission({ mode: 'readwrite' });
  if (permission !== 'granted') {
    throw new Error('Permission to write to the selected folder was denied.');
  }

  // Store in IndexedDB
  await setSetting(BACKUP_DIR_SETTING_KEY, dirHandle);
  return dirHandle;
}

/**
 * Retrieve saved directory handle and verify permission.
 */
export async function getLinkedDirectoryHandle(): Promise<FileSystemDirectoryHandle | null> {
  if (!isFileSystemAccessSupported()) return null;

  try {
    const dirHandle = await getSetting<FileSystemDirectoryHandle>(BACKUP_DIR_SETTING_KEY);
    if (!dirHandle) return null;

    // Check if permission is still valid
    const permission = await dirHandle.queryPermission({ mode: 'readwrite' });
    if (permission === 'granted') {
      return dirHandle;
    }

    // Attempt to request permission if promptable
    if (permission === 'prompt') {
      const requested = await dirHandle.requestPermission({ mode: 'readwrite' });
      if (requested === 'granted') return dirHandle;
    }

    return dirHandle; // Return handle even if permission prompt might be needed during write
  } catch (err) {
    console.warn('Could not retrieve linked directory handle:', err);
    return null;
  }
}

/**
 * Unlink the saved backup folder.
 */
export async function unlinkBackupDirectory(): Promise<void> {
  await setSetting(BACKUP_DIR_SETTING_KEY, null);
}

/**
 * Generate timestamped filename reflecting backup mode.
 */
export function generateBackupFilename(mode: BackupMode = 'compact'): string {
  const now = new Date();
  const pad = (n: number): string => String(n).padStart(2, '0');
  const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
  const prefix = mode === 'full' 
    ? 'watch-history-full' 
    : mode === 'minimal' 
    ? 'watch-history-minimal' 
    : 'watch-history-compact';
  return `${prefix}-${timestamp}.json`;
}

/**
 * Save export:
 * 1. If a directory handle is linked, writes directly via File System Access API (no server needed!).
 * 2. If no directory linked, attempts local Vite server /api/export endpoint.
 * 3. Falls back to window.showSaveFilePicker or standard browser download.
 */
export async function saveExportToLocal(
  customFilename?: string | null,
  options: { mode?: BackupMode } = {}
): Promise<ExportResult> {
  const mode: BackupMode = options?.mode || (await getSetting<BackupMode>('backup_mode')) || 'compact';
  const data = await exportAllData({ mode });
  const filename = customFilename || generateBackupFilename(mode);
  const content = (mode === 'compact' || mode === 'minimal') ? JSON.stringify(data) : JSON.stringify(data, null, 2);

  // 1. Try Linked Directory Handle (Serverless direct folder writing)
  try {
    const dirHandle = await getLinkedDirectoryHandle();
    if (dirHandle) {
      // Ensure readwrite permission
      const perm = await dirHandle.requestPermission({ mode: 'readwrite' });
      if (perm === 'granted') {
        const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(content);
        await writable.close();

        return {
          success: true,
          method: 'linked_folder',
          filename,
          folderName: dirHandle.name,
          filePath: `${dirHandle.name}/${filename}`,
          fileSize: content.length,
          savedAt: new Date().toISOString()
        };
      }
    }
  } catch (dirErr) {
    console.warn('Direct directory save failed, attempting fallback:', dirErr);
  }

  // 2. Try Local Vite Server endpoint (if running npm run dev)
  try {
    const res = await fetch('/api/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename, payload: data })
    });

    if (res.ok) {
      const serverResult: Partial<ExportResult> = await res.json();
      return {
        success: true,
        filename,
        ...serverResult,
        method: 'local_server'
      };
    }
  } catch {
    // Server is not running
  }

  // 3. Fallback: Native Save File Picker or Browser Download
  if (typeof window !== 'undefined' && window.showSaveFilePicker) {
    try {
      const fileHandle = await window.showSaveFilePicker({
        suggestedName: filename,
        types: [{
          description: 'JSON Backup File',
          accept: { 'application/json': ['.json'] }
        }]
      });
      const writable = await fileHandle.createWritable();
      await writable.write(content);
      await writable.close();

      return {
        success: true,
        method: 'file_picker',
        filename: fileHandle.name,
        filePath: fileHandle.name,
        fileSize: content.length,
        savedAt: new Date().toISOString()
      };
    } catch (err: unknown) {
      if ((err as Error)?.name === 'AbortError') {
        throw new Error('Export cancelled by user.');
      }
    }
  }

  // Final fallback: Standard browser download
  return await downloadExportToBrowser(filename, options);
}

/**
 * List files from linked folder or local server.
 */
export async function getLocalExportsList(): Promise<ExportFileInfo[]> {
  const files: ExportFileInfo[] = [];

  // 1. Check Linked Directory handle
  try {
    const dirHandle = await getLinkedDirectoryHandle();
    if (dirHandle) {
      const perm = await dirHandle.queryPermission({ mode: 'read' });
      if (perm === 'granted') {
        for await (const entry of dirHandle.values()) {
          if (entry.kind === 'file' && entry.name.endsWith('.json')) {
            const fileHandle = entry as FileSystemFileHandle;
            const file = await fileHandle.getFile();
            files.push({
              filename: entry.name,
              size: file.size,
              modifiedAt: new Date(file.lastModified).toISOString(),
              source: 'linked_folder'
            });
          }
        }
        return files.sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime());
      }
    }
  } catch (err) {
    console.warn('Could not read from linked folder:', err);
  }

  // 2. Fallback to local server endpoint
  try {
    const res = await fetch('/api/exports');
    if (res.ok) {
      const data = await res.json();
      return (data.files || []).map((f: ExportFileInfo) => ({ ...f, source: 'local_server' as const }));
    }
  } catch {
    // server not running
  }

  return files;
}

/**
 * Direct browser download
 */
export async function downloadExportToBrowser(
  customFilename?: string | null,
  options: { mode?: BackupMode } = {}
): Promise<ExportResult> {
  const mode: BackupMode = options?.mode || (await getSetting<BackupMode>('backup_mode')) || 'compact';
  const data = await exportAllData({ mode });
  const filename = customFilename || generateBackupFilename(mode);

  const content = (mode === 'compact' || mode === 'minimal') ? JSON.stringify(data) : JSON.stringify(data, null, 2);
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  return { success: true, method: 'browser_download', filename };
}

/**
 * Read and import a backup file from user selection.
 */
export async function importBackupFile(
  file: File | Blob | { name?: string; size?: number; content?: string },
  overwrite: boolean = false
): Promise<ImportResult> {
  return new Promise<ImportResult>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e: ProgressEvent<FileReader>) => {
      try {
        const text = e.target?.result as string;
        const parsed = JSON.parse(text) as BackupFile;
        const result = await importData(parsed, overwrite);
        resolve(result);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        reject(new Error(`Failed to import backup: ${msg}`));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read backup file'));
    reader.readAsText(file as Blob);
  });
}
