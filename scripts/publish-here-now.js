import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { updateCacheBusting } from './cache-bust.js';
import { generatePwaIcons } from './generate-pwa-icons.js';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const PWA_FILE_DEFS = [
  { path: 'index.html', contentType: 'text/html; charset=utf-8' },
  { path: 'manifest.webmanifest', contentType: 'application/manifest+json; charset=utf-8' },
  { path: 'sw.js', contentType: 'text/javascript; charset=utf-8' },
  { path: 'icons/icon-192.png', contentType: 'image/png' },
  { path: 'icons/icon-512.png', contentType: 'image/png' },
  { path: 'icons/icon-512-maskable.png', contentType: 'image/png' },
  { path: 'icons/apple-touch-icon.png', contentType: 'image/png' },
  { path: 'icons/favicon-32.png', contentType: 'image/png' }
];

export function resolveAssetPath(relPath, rootDir = path.resolve(__dirname, '..')) {
  const candidates = [
    path.resolve(rootDir, relPath),
    path.resolve(rootDir, 'dist', relPath),
    path.resolve(rootDir, 'public', relPath)
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error(`Required PWA asset "${relPath}" not found in root, dist/, or public/. Run npm run build first.`);
}

export function buildMultiAssetManifest(rootDir = path.resolve(__dirname, '..')) {
  const filesPayload = [];
  const fileBuffers = {};
  const filePaths = {};

  for (const def of PWA_FILE_DEFS) {
    const resolvedPath = resolveAssetPath(def.path, rootDir);
    const buffer = fs.readFileSync(resolvedPath);
    const hash = crypto.createHash('sha256').update(buffer).digest('hex');

    fileBuffers[def.path] = buffer;
    filePaths[def.path] = resolvedPath;
    filesPayload.push({
      path: def.path,
      size: buffer.length,
      contentType: def.contentType,
      hash
    });
  }

  return { filesPayload, fileBuffers, filePaths };
}

function getApiKey() {
  if (process.env.HERENOW_API_KEY) return process.env.HERENOW_API_KEY.trim();
  const keyPath = path.join(os.homedir(), '.herenow', 'credentials');
  if (fs.existsSync(keyPath)) {
    return fs.readFileSync(keyPath, 'utf8').trim();
  }
  throw new Error(`here.now credentials not found at ${keyPath}`);
}

export async function publishHereNow(targetSlugArg) {
  const rootDir = path.resolve(__dirname, '..');

  // Ensure icons exist and sw.js CACHE_NAME reflects the current index.html SHA-256
  const iconCheck = path.join(rootDir, 'public', 'icons', 'icon-192.png');
  if (!fs.existsSync(iconCheck)) {
    generatePwaIcons(rootDir);
  }
  updateCacheBusting(rootDir);

  const apiKey = getApiKey();
  const { filesPayload, fileBuffers, filePaths } = buildMultiAssetManifest(rootDir);

  const stateDir = path.resolve(rootDir, '.herenow');
  const stateFile = path.join(stateDir, 'state.json');
  let state = { publishes: {} };
  if (fs.existsSync(stateFile)) {
    try {
      state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    } catch {
      // ignore invalid state file
    }
  }

  const existingSlug = targetSlugArg || Object.keys(state.publishes || {})[0] || 'oaken-lasso-3vh8';
  const existingVersion = state.publishes?.[existingSlug]?.versionId;

  const totalBytes = filesPayload.reduce((sum, f) => sum + f.size, 0);
  console.log(`[here.now] Publishing ${filesPayload.length} PWA assets (${totalBytes} bytes total) to slug: ${existingSlug}...`);

  const url = existingSlug ? `https://here.now/api/v1/publish/${existingSlug}` : 'https://here.now/api/v1/publish';
  const method = existingSlug ? 'PUT' : 'POST';

  const bodyPayload = {
    files: filesPayload,
    viewer: {
      title: 'BingeLog — Media Tracker',
      description: 'Local-first privacy-focused PWA tracker for Movies, TV Shows, Books, and Audiobooks.'
    }
  };

  if (existingVersion) {
    bodyPayload.baseVersionId = existingVersion;
  }

  const createRes = await fetch(url, {
    method,
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'x-herenow-client': 'antigravity/publish',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(bodyPayload)
  });

  if (!createRes.ok) {
    const errText = await createRes.text();
    throw new Error(`Create/Update failed (${createRes.status}): ${errText}`);
  }

  const createData = await createRes.json();
  const slug = createData.slug || existingSlug;
  const siteUrl = createData.siteUrl || `https://${slug}.here.now/`;

  const uploadPlan = createData.upload || {};
  const uploads = uploadPlan.uploads || [];
  const skipped = uploadPlan.skipped || [];

  if (skipped.length > 0) {
    console.log(`[here.now] Skipped unchanged files (${skipped.length}): ${skipped.join(', ')}`);
  }

  if (uploads.length > 0) {
    console.log(`[here.now] Uploading ${uploads.length} changed file(s)...`);
    for (const up of uploads) {
      const assetPath = up.path || 'index.html';
      const buffer = fileBuffers[assetPath];
      const diskPath = filePaths[assetPath];
      const ct = up.headers?.['Content-Type'] || filesPayload.find(f => f.path === assetPath)?.contentType || 'application/octet-stream';

      console.log(`[here.now] Uploading ${assetPath}...`);
      try {
        const upRes = await fetch(up.url, {
          method: up.method || 'PUT',
          headers: up.headers || { 'Content-Type': ct },
          body: buffer
        });
        if (!upRes.ok) {
          throw new Error(`HTTP ${upRes.status}`);
        }
      } catch {
        // Fallback to curl.exe if direct fetch upload encounters TLS/socket issues on Windows
        execSync(
          `curl.exe -sS -X PUT ${JSON.stringify(up.url)} -H ${JSON.stringify(`Content-Type: ${ct}`)} --data-binary @${JSON.stringify(diskPath)}`,
          { stdio: 'inherit' }
        );
      }
    }
  } else {
    console.log('[here.now] All PWA assets match remote SHA-256 hashes; nothing new to upload.');
  }

  const finRes = await fetch(uploadPlan.finalizeUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'x-herenow-client': 'antigravity/publish',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      versionId: uploadPlan.versionId
    })
  });

  if (!finRes.ok) {
    const finErr = await finRes.text();
    throw new Error(`Finalize failed (${finRes.status}): ${finErr}`);
  }

  const finData = await finRes.json();
  const finalUrl = finData.siteUrl || siteUrl;
  console.log(`[here.now] SUCCESS! Live PWA URL: ${finalUrl}`);

  if (!fs.existsSync(stateDir)) fs.mkdirSync(stateDir, { recursive: true });
  state.publishes = state.publishes || {};
  state.publishes[slug] = {
    versionId: finData.versionId || uploadPlan.versionId,
    path: filePaths['index.html'],
    assets: filesPayload.map(f => f.path),
    siteUrl: finalUrl,
    publishedAt: new Date().toISOString()
  };
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));

  return finalUrl;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isMain) {
  publishHereNow(process.argv[2]).catch(err => {
    console.error(err);
    process.exit(1);
  });
}
