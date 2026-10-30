# Feature: PWA Installation, Offline Service Worker, Native Share Sheet & Multi-Asset Deployment

## 📌 Summary
Transform **BingeLog** into an installable Progressive Web App (PWA) for iOS and Android with full offline launch capability, native mobile Share Sheet integration (`share_target`), automated PWA icon generation, content-hash cache busting, and multi-asset deployment to `here.now` — following the proven architecture from [App-Directory Issue #57](https://github.com/AshleyChrisanthus/App-Directory/issues/57).

---

## 🎯 User Story
> **As a mobile user**, I want to install BingeLog onto my home screen as a standalone full-screen app that launches instantly even when offline.  
> **As a mobile user**, I want to share links or titles directly from IMDb, Letterboxd, TMDB, Goodreads, or Safari/Chrome via my phone's native Share Sheet and have BingeLog open with the Search & Add modal pre-filled.

---

## 🛠️ Key Requirements & Specifications

### 1. Web App Manifest (`public/manifest.webmanifest`)
- Configure `manifest.webmanifest` at the root:
  - `id`: `"/"`
  - `name`: `"BingeLog — Media Tracker"`
  - `short_name`: `"BingeLog"`
  - `description`: `"Local-first privacy-focused tracker for Movies, TV Shows, Books, and Audiobooks"`
  - `start_url`: `"/"`
  - `scope`: `"/"`
  - `display`: `"standalone"` (removes browser URL bar and navigation chrome)
  - `orientation`: `"portrait-primary"` / `"any"`
  - `theme_color`: `"#0d0d0f"`
  - `background_color`: `"#0d0d0f"`
  - `categories`: `["entertainment", "lifestyle", "utilities"]`
- Link manifest and Apple iOS meta tags in `index.dev.html` (and generated `index.html`):
  - `<link rel="manifest" href="/manifest.webmanifest" />`
  - `<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />`
  - `<meta name="apple-mobile-web-app-capable" content="yes" />`
  - `<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />`
  - `<meta name="apple-mobile-web-app-title" content="BingeLog" />`
  - `<meta name="theme-color" content="#0d0d0f" />`
  - Viewport updated with `viewport-fit=cover` for iOS notch / Dynamic Island / home indicator safe-area insets.

### 2. PWA Icons & Automated Icon Generator (`scripts/generate-pwa-icons.js`)
- Create `scripts/generate-pwa-icons.js` (mirroring `App-Directory`'s `scripts/generate_pwa_icons.js`) to generate crisp PNG icons in `public/icons/` (and copied to `dist/icons/`):
  - `icons/icon-192.png` (`192x192`, `purpose: "any"`)
  - `icons/icon-512.png` (`512x512`, `purpose: "any"`)
  - `icons/icon-512-maskable.png` (`512x512`, `purpose: "maskable"` with safe-zone padding)
  - `icons/apple-touch-icon.png` (`180x180`)
  - `icons/favicon-32.png` (`32x32`)
- Design matches the BingeLog brand icon in Stitch Screen 1 (`#0a84ff` rounded squircle badge with white play/film glyph on deep `#0d0d0f` background).

### 3. Native Mobile Share Sheet Integration (`share_target`)
- Add `share_target` configuration to `manifest.webmanifest`:
  ```json
  "share_target": {
    "action": "/",
    "method": "GET",
    "params": {
      "title": "share_title",
      "text": "share_text",
      "url": "share_url"
    }
  }
  ```
- In [src/App.tsx](file:///c:/Users/Ashley%20Chrisanthus/Documents/antigravity/clever-noether/src/App.tsx):
  - On startup, inspect `window.location.search` for `share_title`, `share_text`, or `share_url`.
  - Extract media title or IMDb ID (`tt\d+`) / TMDB ID / Goodreads title from the shared parameters, scrub the query parameters via `history.replaceState`, and automatically open `SearchModal` pre-populated with the extracted query.

### 4. Offline Service Worker (`public/sw.js`) & Cache Busting (`scripts/cache-bust.js`)
- Create `public/sw.js` with versioned `CACHE_NAME`:
  - **Pre-cache assets**: `/`, `/index.html`, `/manifest.webmanifest`, and all `/icons/*.png`.
  - **Navigation requests (`req.mode === 'navigate'`)**: Network-first with automatic cache update and instant offline fallback to cached `/index.html` (supporting query params like `/?share_url=...`).
  - **Static assets**: Cache-first with background stale-while-revalidate refresh.
- Register the service worker in [src/main.tsx](file:///c:/Users/Ashley%20Chrisanthus/Documents/antigravity/clever-noether/src/main.tsx) **only when protocol is `http:` or `https:`** so standalone local `file:///index.html` usage on desktop never throws ServiceWorker origin errors.
- Create `scripts/cache-bust.js` to compute SHA-256 hashes of the built `index.html` and stamp `CACHE_NAME` in `sw.js` during `npm run build`.

### 5. Multi-Asset Deployment to `here.now` (`scripts/publish-here-now.js`)
- Upgrade [scripts/publish-here-now.js](file:///c:/Users/Ashley%20Chrisanthus/Documents/antigravity/clever-noether/scripts/publish-here-now.js) (following `App-Directory/scripts/deploy_herenow.js`) to publish the complete PWA file manifest instead of only `index.html`:
  - `index.html` (`text/html; charset=utf-8`)
  - `manifest.webmanifest` (`application/manifest+json; charset=utf-8`)
  - `sw.js` (`text/javascript; charset=utf-8`)
  - `icons/icon-192.png`, `icons/icon-512.png`, `icons/icon-512-maskable.png`, `icons/apple-touch-icon.png`, `icons/favicon-32.png` (`image/png`)
- Support SHA-256 content diffing so unchanged icons/files are skipped during `here.now` upload plans.

---

## ✅ Acceptance Criteria
- [ ] `manifest.webmanifest` and all 5 PWA icons are generated and linked in `index.dev.html` and built `index.html`.
- [ ] BingeLog passes PWA installability checks on iOS Safari ("Add to Home Screen") and Android Chrome ("Install App") and launches in standalone full-screen mode.
- [ ] Service worker caches the app shell for instant offline launch while remaining silent on `file://` desktop protocol.
- [ ] Sharing a link or title from mobile apps via the OS Share Sheet opens BingeLog's `SearchModal` pre-populated with the shared media title/ID.
- [ ] `npm run deploy:herenow` uploads `index.html`, `manifest.webmanifest`, `sw.js`, and `icons/*` to `here.now`.
