import 'fake-indexeddb/auto';
import { register } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';

// Register module hook for import.meta.env & .ts/.js resolution
try {
  register(new URL('./loader-hook.mjs', import.meta.url));
} catch {}

// Initialize global importMetaEnv
globalThis.importMetaEnv = globalThis.importMetaEnv || {};

// Polyfill in-memory localStorage
const localStorageStore = new Map();
globalThis.localStorage = {
  getItem: (key) => localStorageStore.get(key) || null,
  setItem: (key, val) => localStorageStore.set(key, String(val)),
  removeItem: (key) => localStorageStore.delete(key),
  clear: () => localStorageStore.clear(),
  get length() { return localStorageStore.size; },
  key: (i) => Array.from(localStorageStore.keys())[i] || null
};

// Polyfill minimal document / DOM
const domAttributes = new Map();
const domStyles = new Map();
globalThis.document = {
  documentElement: {
    setAttribute: (k, v) => domAttributes.set(k, String(v)),
    getAttribute: (k) => domAttributes.get(k) || null,
    removeAttribute: (k) => domAttributes.delete(k),
    style: {
      setProperty: (k, v) => domStyles.set(k, String(v)),
      removeProperty: (k) => domStyles.delete(k),
      getPropertyValue: (k) => domStyles.get(k) || ''
    }
  },
  createElement: (tag) => {
    return {
      tagName: tag.toUpperCase(),
      href: '',
      download: '',
      click: () => {},
      style: {}
    };
  },
  body: {
    appendChild: () => {},
    removeChild: () => {}
  }
};

// Polyfill window
globalThis.window = globalThis;
if (!globalThis.URL.createObjectURL) {
  globalThis.URL.createObjectURL = () => 'blob:mock-url-' + Math.random().toString(36).slice(2);
  globalThis.URL.revokeObjectURL = () => {};
}

// Helper to dynamically import application modules (supporting .js or .ts)
export async function getDbModule() {
  const tsPath = path.resolve(process.cwd(), 'src/db/index.ts');
  if (fs.existsSync(tsPath)) {
    return await import('../../src/db/index.ts');
  }
  return await import('../../src/db/index.js');
}

export async function getApiModule() {
  const tsPath = path.resolve(process.cwd(), 'src/services/api.ts');
  if (fs.existsSync(tsPath)) {
    return await import('../../src/services/api.ts');
  }
  return await import('../../src/services/api.js');
}

export async function getExportServiceModule() {
  const tsPath = path.resolve(process.cwd(), 'src/services/exportService.ts');
  if (fs.existsSync(tsPath)) {
    return await import('../../src/services/exportService.ts');
  }
  return await import('../../src/services/exportService.js');
}

export async function getThemeModule() {
  const tsPath = path.resolve(process.cwd(), 'src/styles/theme.ts');
  if (fs.existsSync(tsPath)) {
    return await import('../../src/styles/theme.ts');
  }
  return await import('../../src/styles/theme.js');
}

export async function getTimezoneModule() {
  const tsPath = path.resolve(process.cwd(), 'src/utils/timezone.ts');
  if (fs.existsSync(tsPath)) {
    return await import('../../src/utils/timezone.ts');
  }
  return await import('../../src/utils/timezone.js');
}

export async function getUpcomingModule() {
  const tsPath = path.resolve(process.cwd(), 'src/utils/upcoming.ts');
  if (fs.existsSync(tsPath)) {
    return await import('../../src/utils/upcoming.ts');
  }
  return await import('../../src/utils/upcoming.js');
}

export async function getFranchiseModule() {
  const tsPath = path.resolve(process.cwd(), 'src/utils/franchise.ts');
  if (fs.existsSync(tsPath)) {
    return await import('../../src/utils/franchise.ts');
  }
  return await import('../../src/utils/franchise.js');
}

export async function getAudioDurationModule() {
  const tsPath = path.resolve(process.cwd(), 'src/utils/audioDuration.ts');
  if (fs.existsSync(tsPath)) {
    return await import('../../src/utils/audioDuration.ts');
  }
  return await import('../../src/utils/audioDuration.js');
}

export async function getRegionModule() {
  const tsPath = path.resolve(process.cwd(), 'src/utils/region.ts');
  if (fs.existsSync(tsPath)) {
    return await import('../../src/utils/region.ts');
  }
  return await import('../../src/utils/region.js');
}

// Reset database tables between tests
export async function resetDatabase() {
  const { db } = await getDbModule();
  if (db && db.isOpen()) {
    await db.media.clear();
    await db.episodes.clear();
    await db.settings.clear();
    if (db.canvases) {
      await db.canvases.clear();
    }
    if (db.collections) {
      await db.collections.clear();
    }
  }
  localStorageStore.clear();
  domAttributes.clear();
  domStyles.clear();
  globalThis.importMetaEnv = {};
}

// Mock Fetch Helper for deterministic unit/e2e testing
let originalFetch = globalThis.fetch;

export function mockFetch(handler) {
  globalThis.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input.url;
    return handler(url, init);
  };
}

export function restoreFetch() {
  globalThis.fetch = originalFetch;
}
