import { exportAllData, importData } from '../db';

/**
 * Save export directly into project's `exports/` folder via Vite backend middleware.
 */
export async function saveExportToProjectFolder(customFilename = null) {
  const data = await exportAllData();
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
  const filename = customFilename || `watch-history-backup-${timestamp}.json`;

  const res = await fetch('/api/export', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename, payload: data })
  });

  if (!res.ok) {
    throw new Error('Failed to save export to local project directory');
  }

  return await res.json();
}

/**
 * Download export directly to the user's browser Downloads directory.
 */
export async function downloadExportToBrowser(customFilename = null) {
  const data = await exportAllData();
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
  const filename = customFilename || `bingelog-backup-${timestamp}.json`;

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  return { success: true, filename };
}

/**
 * List all backup files saved in the project `exports/` folder.
 */
export async function getLocalExportsList() {
  try {
    const res = await fetch('/api/exports');
    if (!res.ok) return [];
    const data = await res.json();
    return data.files || [];
  } catch (err) {
    console.warn('Could not fetch local exports list:', err);
    return [];
  }
}

/**
 * Read and import a backup file from user selection.
 */
export async function importBackupFile(file, overwrite = false) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const parsed = JSON.parse(e.target.result);
        const result = await importData(parsed, overwrite);
        resolve(result);
      } catch (err) {
        reject(new Error(`Failed to import backup: ${err.message}`));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read backup file'));
    reader.readAsText(file);
  });
}
