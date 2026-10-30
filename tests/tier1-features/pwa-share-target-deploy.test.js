import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  parseShareTargetParams,
  scrubShareParamsFromUrl,
  consumeShareTargetFromWindow
} from '../../src/utils/shareTarget.ts';
import { generatePwaIcons, ICON_TARGETS } from '../../scripts/generate-pwa-icons.js';
import { updateCacheBusting, computeFileHash } from '../../scripts/cache-bust.js';
import { buildMultiAssetManifest, PWA_FILE_DEFS } from '../../scripts/publish-here-now.js';

describe('Issue #48: PWA Manifest, Icons, Share Target, Offline Service Worker & Multi-Asset Deployment', () => {
  const rootDir = process.cwd();

  it('should have a valid Web App Manifest (public/manifest.webmanifest) with standalone display and share_target', () => {
    const manifestPath = path.join(rootDir, 'public', 'manifest.webmanifest');
    assert.ok(fs.existsSync(manifestPath), 'public/manifest.webmanifest must exist');

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    assert.equal(manifest.id, '/');
    assert.equal(manifest.name, 'BingeLog — Media Tracker');
    assert.equal(manifest.short_name, 'BingeLog');
    assert.equal(manifest.start_url, '/');
    assert.equal(manifest.scope, '/');
    assert.equal(manifest.display, 'standalone');
    assert.equal(manifest.theme_color, '#0d0d0f');
    assert.equal(manifest.background_color, '#0d0d0f');
    assert.ok(Array.isArray(manifest.categories));
    assert.ok(manifest.categories.includes('entertainment'));

    // Icons check
    assert.ok(Array.isArray(manifest.icons));
    assert.equal(manifest.icons.length, 3);
    assert.ok(manifest.icons.some(i => i.src === '/icons/icon-192.png' && i.sizes === '192x192' && i.purpose === 'any'));
    assert.ok(manifest.icons.some(i => i.src === '/icons/icon-512.png' && i.sizes === '512x512' && i.purpose === 'any'));
    assert.ok(manifest.icons.some(i => i.src === '/icons/icon-512-maskable.png' && i.sizes === '512x512' && i.purpose === 'maskable'));

    // Share target check
    assert.ok(manifest.share_target);
    assert.equal(manifest.share_target.action, '/');
    assert.equal(manifest.share_target.method, 'GET');
    assert.deepEqual(manifest.share_target.params, {
      title: 'share_title',
      text: 'share_text',
      url: 'share_url'
    });
  });

  it('should link manifest, Apple touch icon, iOS standalone meta tags, and viewport-fit=cover in index.dev.html and built index.html', () => {
    const devHtml = fs.readFileSync(path.join(rootDir, 'index.dev.html'), 'utf8');
    const builtHtml = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');

    for (const [label, html] of [['index.dev.html', devHtml], ['index.html', builtHtml]]) {
      assert.match(html, /<link\s+rel=["']manifest["']\s+href=["']\/manifest\.webmanifest["']/i, `${label} missing manifest link`);
      assert.match(html, /<link\s+rel=["']apple-touch-icon["']\s+href=["']\/icons\/apple-touch-icon\.png["']/i, `${label} missing apple-touch-icon`);
      assert.match(html, /<meta\s+name=["']apple-mobile-web-app-capable["']\s+content=["']yes["']/i, `${label} missing apple-mobile-web-app-capable`);
      assert.match(html, /<meta\s+name=["']apple-mobile-web-app-status-bar-style["']\s+content=["']black-translucent["']/i, `${label} missing status-bar-style`);
      assert.match(html, /<meta\s+name=["']apple-mobile-web-app-title["']\s+content=["']BingeLog["']/i, `${label} missing apple-mobile-web-app-title`);
      assert.match(html, /<meta\s+name=["']theme-color["']\s+content=["']#0d0d0f["']/i, `${label} missing theme-color`);
      assert.match(html, /viewport-fit=cover/i, `${label} missing viewport-fit=cover`);
    }
  });

  it('should generate all 5 crisp PNG icons with valid PNG headers and exact dimensions', () => {
    const generated = generatePwaIcons(rootDir);
    assert.equal(generated.length, 5);

    const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

    for (const target of ICON_TARGETS) {
      const iconPath = path.join(rootDir, 'public', 'icons', target.file);
      assert.ok(fs.existsSync(iconPath), `Missing generated icon: ${target.file}`);

      const buf = fs.readFileSync(iconPath);
      assert.ok(buf.length > 100, `Icon ${target.file} should be non-empty`);
      assert.deepEqual(buf.subarray(0, 8), pngSignature, `Invalid PNG signature in ${target.file}`);

      // Verify IHDR width and height at byte offsets 16 and 20
      const width = buf.readUInt32BE(16);
      const height = buf.readUInt32BE(20);
      assert.equal(width, target.size, `Unexpected width in ${target.file}`);
      assert.equal(height, target.size, `Unexpected height in ${target.file}`);
    }
  });

  it('should extract media titles, IMDb IDs, TMDB slugs, Letterboxd slugs, and Goodreads titles from Share Sheet params', () => {
    // 1. IMDb URL only -> extracts IMDb ID
    const imdbOnly = parseShareTargetParams('?share_url=https%3A%2F%2Fwww.imdb.com%2Ftitle%2Ftt15239678%2F%3Fref_%3Dext_shr_lnk');
    assert.ok(imdbOnly);
    assert.equal(imdbOnly.query, 'tt15239678');
    assert.equal(imdbOnly.imdbId, 'tt15239678');

    // 2. IMDb title + URL -> extracts clean title + preserves imdbId
    const imdbWithTitle = parseShareTargetParams({
      share_title: 'Dune: Part Two (2024) - IMDb',
      share_url: 'https://www.imdb.com/title/tt15239678/'
    });
    assert.ok(imdbWithTitle);
    assert.equal(imdbWithTitle.query, 'Dune: Part Two');
    assert.equal(imdbWithTitle.imdbId, 'tt15239678');

    // 3. Android share_text with embedded URL and "Check out ... on IMDb" wrapper
    const androidShare = parseShareTargetParams({
      share_text: 'Check out Severance on IMDb https://m.imdb.com/title/tt11280740/'
    });
    assert.ok(androidShare);
    assert.equal(androidShare.query, 'Severance');
    assert.equal(androidShare.imdbId, 'tt11280740');

    // 4. Letterboxd share with directional marks and director credit
    const letterboxdShare = parseShareTargetParams({
      share_title: '\u200eOppenheimer (2023) directed by Christopher Nolan • Reviews, film + cast • Letterboxd',
      share_url: 'https://letterboxd.com/film/oppenheimer-2023/'
    });
    assert.ok(letterboxdShare);
    assert.equal(letterboxdShare.query, 'Oppenheimer');
    assert.equal(letterboxdShare.mediaType, 'movie');

    // 5. TMDB TV URL without share_title -> humanizes slug
    const tmdbTvShare = parseShareTargetParams('?share_url=https://www.themoviedb.org/tv/1396-breaking-bad');
    assert.ok(tmdbTvShare);
    assert.equal(tmdbTvShare.query, 'Breaking Bad');
    assert.equal(tmdbTvShare.mediaType, 'tv');
    assert.equal(tmdbTvShare.tmdbId, 1396);

    // 6. Goodreads book share -> extracts clean book title and mediaType: 'book'
    const goodreadsShare = parseShareTargetParams({
      share_title: 'Project Hail Mary by Andy Weir | Goodreads',
      share_url: 'https://www.goodreads.com/book/show/54493401-project-hail-mary'
    });
    assert.ok(goodreadsShare);
    assert.equal(goodreadsShare.query, 'Project Hail Mary');
    assert.equal(goodreadsShare.mediaType, 'book');

    // 7. Non-share URL params return null
    assert.equal(parseShareTargetParams('?tab=canvas'), null);
    assert.equal(parseShareTargetParams(''), null);
  });

  it('should scrub share_title, share_text, and share_url via history.replaceState on startup', () => {
    const cleaned = scrubShareParamsFromUrl('https://oaken-lasso-3vh8.here.now/?share_title=Severance&share_url=https%3A%2F%2Fimdb.com%2Ftitle%2Ftt11280740&keep=1#top');
    assert.equal(cleaned, '/?keep=1#top');

    let replacedUrl = null;
    const mockWin = {
      location: {
        search: '?share_title=Breaking%20Bad%20(TV%20Series%202008%E2%80%932013)%20-%20IMDb&share_url=https%3A%2F%2Fwww.imdb.com%2Ftitle%2Ftt0903747%2F',
        href: 'https://oaken-lasso-3vh8.here.now/?share_title=Breaking%20Bad%20(TV%20Series%202008%E2%80%932013)%20-%20IMDb&share_url=https%3A%2F%2Fwww.imdb.com%2Ftitle%2Ftt0903747%2F'
      },
      document: { title: 'BingeLog' },
      history: {
        replaceState(_state, _title, url) {
          replacedUrl = url;
        }
      }
    };

    const consumed = consumeShareTargetFromWindow(mockWin);
    assert.ok(consumed);
    assert.equal(consumed.query, 'Breaking Bad');
    assert.equal(consumed.imdbId, 'tt0903747');
    assert.equal(replacedUrl, '/');
  });

  it('should configure Service Worker precache and stamp CACHE_NAME via cache-bust.js while guarding file:// protocol', () => {
    const bustResult = updateCacheBusting(rootDir);
    const expectedIndexHash = computeFileHash(
      fs.existsSync(path.join(rootDir, 'dist', 'index.html'))
        ? path.join(rootDir, 'dist', 'index.html')
        : path.join(rootDir, 'index.html'),
      8
    );
    assert.equal(bustResult.indexHash, expectedIndexHash);
    assert.ok(bustResult.cacheName.startsWith(`bingelog-${expectedIndexHash}-`));

    const swContent = fs.readFileSync(path.join(rootDir, 'public', 'sw.js'), 'utf8');
    assert.ok(swContent.includes(`const CACHE_NAME = '${bustResult.cacheName}';`), 'sw.js must have stamped CACHE_NAME');
    assert.ok(swContent.includes("'/manifest.webmanifest'"));
    assert.ok(swContent.includes("'/icons/icon-192.png'"));
    assert.ok(swContent.includes("'/icons/icon-512.png'"));
    assert.ok(swContent.includes("'/icons/icon-512-maskable.png'"));
    assert.ok(swContent.includes("'/icons/apple-touch-icon.png'"));
    assert.ok(swContent.includes("'/icons/favicon-32.png'"));
    assert.ok(swContent.includes("req.mode === 'navigate'"));

    // Verify src/main.tsx guards Service Worker registration behind http: / https: protocol
    const mainTsx = fs.readFileSync(path.join(rootDir, 'src', 'main.tsx'), 'utf8');
    assert.ok(mainTsx.includes("window.location.protocol === 'http:' || window.location.protocol === 'https:'"));
    assert.ok(mainTsx.includes("navigator.serviceWorker.register('/sw.js')"));
  });

  it('should build the complete multi-asset PWA deployment manifest with SHA-256 hashes for here.now', () => {
    const { filesPayload, fileBuffers } = buildMultiAssetManifest(rootDir);
    assert.equal(filesPayload.length, PWA_FILE_DEFS.length);
    assert.equal(filesPayload.length, 8);

    const expectedPaths = [
      'index.html',
      'manifest.webmanifest',
      'sw.js',
      'icons/icon-192.png',
      'icons/icon-512.png',
      'icons/icon-512-maskable.png',
      'icons/apple-touch-icon.png',
      'icons/favicon-32.png'
    ];

    for (const expectedPath of expectedPaths) {
      const entry = filesPayload.find(f => f.path === expectedPath);
      assert.ok(entry, `Missing ${expectedPath} in here.now publish payload`);
      assert.ok(entry.size > 0, `${expectedPath} size must be > 0`);
      assert.match(entry.hash, /^[a-f0-9]{64}$/, `${expectedPath} must have a 64-char SHA-256 hex hash`);
      assert.ok(Buffer.isBuffer(fileBuffers[expectedPath]));
    }
  });
});
