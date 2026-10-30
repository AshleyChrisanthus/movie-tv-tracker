import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function computeFileHash(filePath, length = 8) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, length);
}

export function updateCacheBusting(rootDir = path.resolve(__dirname, '..')) {
  const distIndexPath = path.join(rootDir, 'dist', 'index.html');
  const rootIndexPath = path.join(rootDir, 'index.html');
  const indexPath = fs.existsSync(distIndexPath) ? distIndexPath : rootIndexPath;

  if (!fs.existsSync(indexPath)) {
    throw new Error(`index.html not found in: ${rootDir}`);
  }

  const indexHash = computeFileHash(indexPath, 8);

  const manifestCandidates = [
    path.join(rootDir, 'public', 'manifest.webmanifest'),
    path.join(rootDir, 'dist', 'manifest.webmanifest'),
    path.join(rootDir, 'manifest.webmanifest')
  ];
  const manifestPath = manifestCandidates.find(p => fs.existsSync(p));
  const manifestHash = manifestPath ? computeFileHash(manifestPath, 6) : '000000';

  const cacheName = `bingelog-${indexHash}-${manifestHash}`;
  const swCacheRegex = /const CACHE_NAME = ['"][^'"]+['"];/;
  const newSwCacheLine = `const CACHE_NAME = '${cacheName}';`;

  const swTargets = [
    path.join(rootDir, 'public', 'sw.js'),
    path.join(rootDir, 'dist', 'sw.js')
  ];

  let updated = false;
  for (const swPath of swTargets) {
    if (fs.existsSync(swPath)) {
      let swContent = fs.readFileSync(swPath, 'utf8');
      if (swCacheRegex.test(swContent)) {
        if (!swContent.includes(newSwCacheLine)) {
          swContent = swContent.replace(swCacheRegex, newSwCacheLine);
          fs.writeFileSync(swPath, swContent, 'utf8');
          updated = true;
          console.log(`[Cache-Bust] Updated ${path.relative(rootDir, swPath)} CACHE_NAME -> ${cacheName}`);
        } else {
          console.log(`[Cache-Bust] ${path.relative(rootDir, swPath)} already at ${cacheName}`);
        }
      }
    }
  }

  // Ensure dist/ has the latest manifest.webmanifest and sw.js if dist/ exists
  const distDir = path.join(rootDir, 'dist');
  const publicSwPath = path.join(rootDir, 'public', 'sw.js');
  const publicManifestPath = path.join(rootDir, 'public', 'manifest.webmanifest');
  if (fs.existsSync(distDir)) {
    if (fs.existsSync(publicSwPath)) {
      fs.copyFileSync(publicSwPath, path.join(distDir, 'sw.js'));
    }
    if (fs.existsSync(publicManifestPath)) {
      fs.copyFileSync(publicManifestPath, path.join(distDir, 'manifest.webmanifest'));
    }
  }

  return { cacheName, indexHash, manifestHash, updated };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isMain) {
  try {
    updateCacheBusting();
  } catch (err) {
    console.error('[Cache-Bust] Error:', err.message);
    process.exit(1);
  }
}
