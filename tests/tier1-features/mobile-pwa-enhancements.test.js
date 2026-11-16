import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { getDbModule, resetDatabase, getThemeModule, getCloudSyncModule, getTimezoneModule } from '../helpers/setup.js';

describe('Tier 1: Mobile PWA Enhancements (Issues #56, #57, #58, #59)', () => {
  const rootDir = process.cwd();
  let db;

  beforeEach(async () => {
    await resetDatabase();
    const dbModule = await getDbModule();
    db = dbModule.db;
  });

  // ── 1. Issue #56: Theme Cross-Device Sync ──────────────────────────────
  describe('Issue #56: Theme & Color Presets Cloud Sync', () => {
    it('persists theme mode, presets, and custom colors to Dexie settings and localStorage', async () => {
      const themeModule = await getThemeModule();
      const {
        THEME_KEY,
        ACTIVE_PRESET_KEY,
        CUSTOM_THEME_KEY,
        GENRE_COLORS_KEY,
        persistThemeSetting,
        applyThemeSettingsFromRecord
      } = themeModule;

      await persistThemeSetting(THEME_KEY, 'light');
      await persistThemeSetting(ACTIVE_PRESET_KEY, 'midnight-sapphire');
      await persistThemeSetting(CUSTOM_THEME_KEY, JSON.stringify({ light: { '--accent': '#123456' } }));
      await persistThemeSetting(GENRE_COLORS_KEY, JSON.stringify({ scifi: '#00ffcc' }));

      // Verify in Dexie
      const savedTheme = await db.settings.get(THEME_KEY);
      assert.equal(savedTheme?.value, 'light');

      const savedPreset = await db.settings.get(ACTIVE_PRESET_KEY);
      assert.equal(savedPreset?.value, 'midnight-sapphire');

      const savedCustom = await db.settings.get(CUSTOM_THEME_KEY);
      assert.ok(savedCustom?.value.includes('#123456'));

      const savedGenre = await db.settings.get(GENRE_COLORS_KEY);
      assert.ok(savedGenre?.value.includes('#00ffcc'));

      // Test applyThemeSettingsFromRecord
      const newMode = applyThemeSettingsFromRecord({
        [THEME_KEY]: 'dark',
        [ACTIVE_PRESET_KEY]: 'cyberpunk-neon'
      });
      assert.equal(newMode, 'dark');
      assert.equal(localStorage.getItem(THEME_KEY), 'dark');
      assert.equal(localStorage.getItem(ACTIVE_PRESET_KEY), 'cyberpunk-neon');
    });

    it('includes theme settings in Cloud Sync payload and applies incoming settings', async () => {
      const themeModule = await getThemeModule();
      const { THEME_KEY, ACTIVE_PRESET_KEY, persistThemeSetting } = themeModule;
      await persistThemeSetting(THEME_KEY, 'light');
      await persistThemeSetting(ACTIVE_PRESET_KEY, 'emerald-forest');

      const { syncManager } = await getCloudSyncModule();
      const payload = await syncManager.buildLocalPayload();

      assert.ok(payload.settings, 'Payload must include settings');
      assert.equal(payload.settings[THEME_KEY], 'light');
      assert.equal(payload.settings[ACTIVE_PRESET_KEY], 'emerald-forest');
    });

    it('merges remote theme settings and triggers hasChanges when settings change', async () => {
      const { mergeSyncPayload } = await import('../../src/services/cloudSync/merger.ts');
      const themeModule = await getThemeModule();
      const { THEME_KEY, ACTIVE_PRESET_KEY } = themeModule;

      const localState = {
        media: [{ id: 'm1', title: 'Local Media', updatedAt: '2026-11-01T12:00:00Z' }],
        episodes: [],
        customLists: [],
        canvases: [],
        tombstones: [],
        settings: {
          [THEME_KEY]: 'dark',
          [ACTIVE_PRESET_KEY]: 'default'
        }
      };

      const remotePayload = {
        version: 1,
        updatedAt: '2026-11-01T13:00:00Z',
        deviceId: 'dev_laptop',
        media: [{ id: 'm1', title: 'Local Media', updatedAt: '2026-11-01T12:00:00Z' }],
        episodes: [],
        customLists: [],
        canvases: [],
        tombstones: [],
        settings: {
          [THEME_KEY]: 'light',
          [ACTIVE_PRESET_KEY]: 'midnight-sapphire',
          _settings_timestamps: {
            [ACTIVE_PRESET_KEY]: '2026-11-01T13:00:00Z'
          }
        }
      };

      const result = mergeSyncPayload(localState, remotePayload);
      assert.equal(result.hasChanges, true, 'Must flag hasChanges: true when settings differ');
      assert.equal(result.mergedSettings[THEME_KEY], 'light');
      assert.equal(result.mergedSettings[ACTIVE_PRESET_KEY], 'midnight-sapphire');
    });

    it('preserves local theme settings when locally modified more recently than remote (never reverts to default)', async () => {
      const { mergeSyncPayload } = await import('../../src/services/cloudSync/merger.ts');
      const themeModule = await getThemeModule();
      const { THEME_KEY, ACTIVE_PRESET_KEY } = themeModule;

      const localState = {
        media: [],
        episodes: [],
        customLists: [],
        canvases: [],
        tombstones: [],
        settings: {
          [THEME_KEY]: 'dark',
          [ACTIVE_PRESET_KEY]: 'nordic-frost',
          _settings_timestamps: {
            [ACTIVE_PRESET_KEY]: '2026-11-01T14:30:00Z'
          }
        }
      };

      // Remote cloud vault was synced at 14:00:00Z with older 'default' preset
      const remotePayload = {
        version: 1,
        updatedAt: '2026-11-01T14:00:00Z',
        deviceId: 'dev_other',
        media: [],
        episodes: [],
        customLists: [],
        canvases: [],
        tombstones: [],
        settings: {
          [THEME_KEY]: 'dark',
          [ACTIVE_PRESET_KEY]: 'default',
          _settings_timestamps: {
            [ACTIVE_PRESET_KEY]: '2026-11-01T14:00:00Z'
          }
        }
      };

      const result = mergeSyncPayload(localState, remotePayload);
      assert.equal(
        result.mergedSettings[ACTIVE_PRESET_KEY],
        'nordic-frost',
        'Locally updated preset must win over older remote preset'
      );
    });

    it('prefers remote custom preset over local default when untimed or tied', async () => {
      const { mergeSyncPayload } = await import('../../src/services/cloudSync/merger.ts');
      const themeModule = await getThemeModule();
      const { ACTIVE_PRESET_KEY } = themeModule;

      const localState = {
        media: [],
        episodes: [],
        customLists: [],
        canvases: [],
        tombstones: [],
        settings: {
          [ACTIVE_PRESET_KEY]: 'default'
        }
      };

      const remotePayload = {
        version: 1,
        updatedAt: '2026-11-01T12:00:00Z',
        deviceId: 'dev_laptop',
        media: [],
        episodes: [],
        customLists: [],
        canvases: [],
        tombstones: [],
        settings: {
          [ACTIVE_PRESET_KEY]: 'cyberpunk-neon'
        }
      };

      const result = mergeSyncPayload(localState, remotePayload);
      assert.equal(
        result.mergedSettings[ACTIVE_PRESET_KEY],
        'cyberpunk-neon',
        'Remote custom preset must take precedence over default preset'
      );
    });
  });

  // ── 2. Issue #57: Upcoming as Dedicated Tab ───────────────────────────
  describe('Issue #57: Dedicated Upcoming Tab Navigation', () => {
    it('defines upcoming as a first-class tab in MobileBottomNav.tsx', () => {
      const navPath = path.join(rootDir, 'src', 'components', 'mobile', 'MobileBottomNav.tsx');
      assert.ok(fs.existsSync(navPath), 'MobileBottomNav.tsx must exist');
      const code = fs.readFileSync(navPath, 'utf8');

      // Check currentTab type definition includes 'upcoming'
      assert.ok(
        code.includes("'library' | 'canvas' | 'upcoming'"),
        'MobileBottomNavProps must accept "upcoming" as a valid tab'
      );

      // Check that clicking Upcoming selects the tab rather than toggling
      assert.ok(
        code.includes("onSelectTab('upcoming')"),
        'Clicking Upcoming must call onSelectTab("upcoming")'
      );
    });

    it('supports switching to upcoming tab from MobileFilterSheet.tsx', () => {
      const filterSheetPath = path.join(rootDir, 'src', 'components', 'mobile', 'MobileFilterSheet.tsx');
      assert.ok(fs.existsSync(filterSheetPath), 'MobileFilterSheet.tsx must exist');
      const code = fs.readFileSync(filterSheetPath, 'utf8');

      assert.ok(
        code.includes('onSelectUpcomingTab'),
        'MobileFilterSheet must support onSelectUpcomingTab callback'
      );
      assert.ok(
        code.includes('Switch to Upcoming Tab') || code.includes('Upcoming Releases'),
        'MobileFilterSheet must provide dedicated Upcoming Tab link'
      );
    });

    it('wires mainTab to handle "upcoming" as a first-class view in App.tsx', () => {
      const appPath = path.join(rootDir, 'src', 'App.tsx');
      const code = fs.readFileSync(appPath, 'utf8');

      assert.ok(
        code.includes("mainTab, setMainTab] = useState<'library' | 'canvas' | 'upcoming'>"),
        'App.tsx must define mainTab with "upcoming"'
      );
      assert.ok(
        code.includes("onSelectUpcomingTab={() => handleMainTabChange('upcoming')}"),
        'App.tsx must pass onSelectUpcomingTab to MobileFilterSheet'
      );
    });
  });

  // ── 3. Issue #58: Pinned Section Above Now In Progress ─────────────────
  describe('Issue #58: Pinned Section Above Now In Progress', () => {
    it('renders Pinned Cards Section before NowInProgressCarousel in mobile flow in App.tsx', () => {
      const appPath = path.join(rootDir, 'src', 'App.tsx');
      const code = fs.readFileSync(appPath, 'utf8');

      const pinnedIndex = code.indexOf('{/* Pinned Cards Section');
      const inProgressIndex = code.indexOf('<NowInProgressCarousel');

      assert.ok(pinnedIndex > -1, 'App.tsx must contain Pinned Cards Section');
      assert.ok(inProgressIndex > -1, 'App.tsx must contain <NowInProgressCarousel');

      assert.ok(
        pinnedIndex < inProgressIndex,
        'Pinned Cards Section must appear before NowInProgressCarousel in the document tree'
      );
    });
  });

  // ── 4. Issue #59: Books Use Reading Tag in Now In Progress ─────────────
  describe('Issue #59: Book In-Progress Tag in NowInProgressCarousel', () => {
    it('uses Reading tag for books and Listening for audiobooks in NowInProgressCarousel.tsx', () => {
      const carouselPath = path.join(rootDir, 'src', 'components', 'mobile', 'NowInProgressCarousel.tsx');
      assert.ok(fs.existsSync(carouselPath), 'NowInProgressCarousel.tsx must exist');
      const code = fs.readFileSync(carouselPath, 'utf8');

      assert.ok(
        code.includes("isAudio ? 'Listening' : isBook ? 'Reading' : 'Watching'"),
        'NowInProgressCarousel must determine in-progress tag label based on media type'
      );
      assert.ok(
        code.includes('{inProgressTag}'),
        'NowInProgressCarousel must render inProgressTag variable in status badge'
      );
    });
  });

  // ── 5. Humanized Upcoming Relative Countdowns ──────────────────────────
  describe('Humanized Upcoming Relative Countdowns', () => {
    it('formats countdowns across hours, days, weeks, months, and years correctly', async () => {
      const tzModule = await getTimezoneModule();
      const { formatHumanCountdown } = tzModule;

      const HOUR = 3600 * 1000;
      const DAY = 24 * HOUR;

      // Under 1 hour
      assert.equal(formatHumanCountdown(45 * 60 * 1000, { capitalize: true }), 'In 45m');

      // Under 24 hours
      assert.equal(formatHumanCountdown(5 * HOUR + 20 * 60 * 1000, { capitalize: true }), 'In 5h 20m');

      // More than 24 hours away (1 day 7 hours)
      assert.equal(formatHumanCountdown(1 * DAY + 7 * HOUR, { capitalize: true }), 'In 1 day 7 hours');
      assert.equal(formatHumanCountdown(3 * DAY + 1 * HOUR, { capitalize: true }), 'In 3 days 1 hour');
      assert.equal(formatHumanCountdown(4 * DAY, { capitalize: true }), 'In 4 days');

      // More than 7 days away (1 week 2 days)
      assert.equal(formatHumanCountdown(9 * DAY, { capitalize: true }), 'In 1 week 2 days');
      assert.equal(formatHumanCountdown(14 * DAY, { capitalize: true }), 'In 2 weeks');
      assert.equal(formatHumanCountdown(22 * DAY, { capitalize: true }), 'In 3 weeks 1 day');

      // Months away (1 month 2 weeks / 2 months 1 week)
      assert.equal(formatHumanCountdown(45 * DAY, { capitalize: true }), 'In 1 month 2 weeks');
      assert.equal(formatHumanCountdown(75 * DAY, { capitalize: true }), 'In 2 months 2 weeks');

      // Years away (1 year 3 months / 2 years)
      assert.equal(formatHumanCountdown(460 * DAY, { capitalize: true }), 'In 1 year 3 months');
      assert.equal(formatHumanCountdown(730 * DAY, { capitalize: true }), 'In 2 years');
    });
  });
});
