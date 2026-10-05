import { run } from 'node:test';
import { spec } from 'node:test/reporters';
import path from 'node:path';
import fs from 'node:fs';

// Initialize test environment hooks and shims
import './helpers/setup.js';

const testFiles = [
  // Tier 1: Feature Coverage
  'path:/tier1-features/storage-crud.test.js',
  'path:/tier1-features/providers-search.test.js',
  'path:/tier1-features/episode-sync.test.js',
  'path:/tier1-features/multi-season-progress.test.js',
  'path:/tier1-features/bulk-strike-off.test.js',
  'path:/tier1-features/caught-up-status.test.js',
  'path:/tier1-features/timezone-countdown.test.js',
  'path:/tier1-features/backup-tier-export.test.js',
  'path:/tier1-features/theme-system.test.js',
  'path:/tier1-features/deduplication.test.js',
  'path:/tier1-features/cross-provider.test.js',
  'path:/tier1-features/sorting-release-last-aired.test.js',
  'path:/tier1-features/folders-custom-lists.test.js',
  'path:/tier1-features/books-media-tracking.test.js',
  'path:/tier1-features/upcoming-releases-filter.test.js',
  'path:/tier1-features/upcoming-marvel-simulation.test.js',
  'path:/tier1-features/community-ratings-distinction.test.js',
  'path:/tier1-features/grid-density-columns-view.test.js',
  'path:/tier1-features/canvas-crud.test.js',
  'path:/tier1-features/tmdb-collection.test.js',
  'path:/tier1-features/movie-franchises.test.js',
  'path:/tier1-features/book-editions-percentage-search.test.js',
  'path:/tier1-features/audiobooks-support.test.js',
  'path:/tier1-features/movie-streaming-releases.test.js',

  // Tier 2: Boundary & Corner Cases
  'path:/tier2-boundary/empty-and-edge-items.test.js',
  'path:/tier2-boundary/strike-off-boundaries.test.js',
  'path:/tier2-boundary/corrupt-backup-parsing.test.js',
  'path:/tier2-boundary/provider-network-edge.test.js',

  // Tier 3: Cross-Feature Interactions
  'path:/tier3-interactions/search-to-backup-workflow.test.js',
  'path:/tier3-interactions/cross-season-strike-off.test.js',

  // Tier 4: Real-World Workload Scenarios
  'path:/tier4-workloads/realistic-backup-import.test.js',
  'path:/tier4-workloads/standalone-bundle.test.js'
].map(f => path.resolve(process.cwd(), 'tests', f.replace('path:/', '')));
// Verify every test file exists
for (const file of testFiles) {
  if (!fs.existsSync(file)) {
    console.error('Test file not found:', file);
    process.exit(1);
  }
}

console.log('='.repeat(70));
console.log('BingeLog Movie & TV Tracker — Tiers 1-4 E2 Test Suite');
console.log('Executing', testFiles.length, 'test suites sequentially...');
console.log('='.repeat(70));

run({
  files: testFiles,
  concurrency: 1,
  recursive: false
})
  .on('test:fail', () => {
    process.exitCode = 1;
  })
  .pipe(new spec())
  .pipe(process.stdout);
