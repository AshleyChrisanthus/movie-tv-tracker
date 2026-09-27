/**
 * Media types supported by BingeLog.
 */
export type MediaType = 'movie' | 'tv' | 'book';

/**
 * User rating scale options (Issue #29).
 */
export type RatingScale = '10' | '5' | '100';

/**
 * View presentation mode and density (Issue #31).
 */
export type ViewMode = 'grid' | 'list';
export type GridDensity = 'comfortable' | 'compact';
export type GridColumns = 'auto' | '4' | '5' | '6' | '7' | '8';

/**
 * Upcoming release filter tiers (Issue #40).
 */
export type UpcomingFilter = 'hide_all' | 'next_n_days' | 'show_all';

/**
 * Watch status lifecycle states.
 */
export type MediaStatus =
  | 'watching'
  | 'caught_up'
  | 'plan_to_watch'
  | 'completed'
  | 'on_hold'
  | 'dropped';

/**
 * Origin source of metadata.
 */
export type MediaSource = 'tmdb' | 'tvmaze' | 'itunes' | 'openlibrary' | 'googlebooks' | 'custom';

/**
 * Supported book search providers (Issue #27, #38).
 */
export type BookSearchProvider = 'openlibrary' | 'googlebooks' | 'applebooks' | 'audiobooks';

/**
 * Supported audiobook search providers (Issue #38).
 */
export type AudiobookSearchProvider = 'itunes' | 'openlibrary';

/**
 * Sub-tab format filter for Books view (Issue #38).
 */
export type BookFormatFilter = 'all' | 'reading' | 'audiobook';

/**
 * Series broadcast air status (e.g., 'Returning Series', 'Ended', 'Running', 'Canceled').
 */
export type SeriesAirStatus = 'Ended' | 'Returning Series' | 'In Production' | 'Running' | 'Canceled' | 'Pilot' | string;

/**
 * Watched state representation in IndexedDB (0 for unwatched, 1 for watched).
 */
export type WatchedStatus = 0 | 1;

/**
 * Canonical MediaItem record stored in Dexie `media` table.
 */
export interface MediaItem {
  id: string;                               // Primary key: `media_${timestamp}_${hash}`
  type: MediaType;                          // 'movie' | 'tv' | 'book'
  status: MediaStatus;                      // Tracking status
  airStatus?: SeriesAirStatus;              // Ongoing/ended broadcast status ('Returning Series', 'Ended', etc.)
  title: string;                            // Title of the movie, TV show, or book
  year: number | string;                    // Release year or 'N/A'
  releaseDate?: string;                     // ISO date or YYYY-MM-DD
  overview?: string;                        // Synopsis / premise
  rating?: number | null;                   // User's personal rating (0.0 - 10.0 scale normalized)
  communityRating?: number | null;          // Fetched public / community rating (0.0 - 10.0 scale normalized)
  communityRatingCount?: number | null;     // Fetched public vote count / review count
  posterUrl?: string | null;                // Poster or book cover image URL
  backdropUrl?: string | null;              // Banner / backdrop image URL
  genres?: string[];                        // Array of genre names
  source: MediaSource;                      // 'tmdb' | 'tvmaze' | 'itunes' | 'openlibrary' | 'custom'
  externalId?: string | number;             // API provider ID or custom ID
  imdbId?: string | null;                   // IMDb ID (e.g. 'tt14688458')
  tmdbId?: string | number | null;          // TMDB ID
  tvmazeId?: string | number | null;        // TVMaze ID
  thetvdbId?: string | number | null;       // TheTVDB ID
  totalSeasons?: number;                    // Total number of seasons
  totalEpisodes: number;                    // Total episode count (1 for movies)
  watchedEpisodesCount: number;             // Count of episodes marked watched
  currentSeason?: number;                   // Last active season pointer (1-based)
  currentEpisode?: number;                  // Last active episode pointer
  activeSeason?: number;                    // Navigation persistence pointer (Issue #13)
  author?: string;                          // Book author (Issue #22)
  authors?: string[];                       // Book authors array
  narrator?: string;                        // Audiobook narrator / reader (Issue #38)
  narrators?: string[];                     // Audiobook narrators array (Issue #38)
  progressMode?: 'pages' | 'chapters' | 'time'; // Book/audiobook tracking mode
  totalPages?: number;                      // Total book pages (Issue #22)
  currentPage?: number;                     // Current page reading progress (Issue #22)
  totalChapters?: number;                   // Total chapters for book chapter tracking
  currentChapter?: number;                  // Current chapter reading progress
  totalDurationSeconds?: number;            // Total audiobook runtime in seconds (Issue #38)
  currentDurationSeconds?: number;          // Current listened runtime in seconds (Issue #38)
  audioPreviewUrl?: string;                 // Sample audio snippet preview URL (Issue #38)
  isbn?: string;                            // ISBN-10 or ISBN-13
  workId?: string;                          // Open Library Work ID (e.g. 'OL45804W') (Issue #25)
  editionId?: string;                       // Open Library Edition ID (e.g. 'OL7353617M') (Issue #25)
  publisher?: string;                       // Book publisher
  bookFormat?: 'paperback' | 'hardcover' | 'ebook' | 'audiobook' | string;
  networkTimezone?: string;                 // e.g. 'America/New_York'
  schedule?: {                              // Broadcast schedule
    time?: string;                          // e.g. '20:30'
    days?: string[];                        // e.g. ['Wednesday']
  };
  nextAirDate?: string | null;              // YYYY-MM-DD of next un-aired episode
  nextAirstamp?: string | null;             // UTC ISO string of next un-aired episode
  nextEpisodeSeason?: number | null;        // Season number of next un-aired episode
  nextEpisodeNumber?: number | null;        // Episode number of next un-aired episode
  lastAiredDate?: string | null;            // ISO date or YYYY-MM-DD of most recent aired episode/release
  lists?: string[];                         // Custom lists / folders (Issue #20)
  runtime?: number | null;                  // Movie runtime in minutes
  collectionId?: number | string | null;    // TMDB Collection / Franchise ID (e.g. 10 for Star Wars Collection)
  collectionName?: string | null;           // TMDB Collection Name (e.g. 'Star Wars Collection')
  nextFranchiseMovieTitle?: string | null;  // Next sequel/prequel title in franchise
  nextFranchiseMovieId?: number | string | null; // Next sequel/prequel externalId in franchise
  notes?: string;                           // Personal user review / notes
  lastSyncedAt?: string;                    // ISO timestamp of last successful sync
  createdAt: string;                        // ISO creation timestamp
  updatedAt: string;                        // ISO modification timestamp
}

/**
 * Custom folder / list definition (Issue #20).
 */
export interface CustomList {
  id: string;
  name: string;
  color?: string;
  description?: string;
  createdAt: string;
}

/**
 * Full episode item stored in Dexie `episodes` table and full backups.
 */
export interface EpisodeItem {
  id: string;                               // Composite key: `${mediaId}_S${seasonNumber}E${episodeNumber}`
  mediaId: string;                          // Foreign key pointing to MediaItem.id
  seasonNumber: number;                     // Season number (1-based)
  episodeNumber: number;                    // Episode number within season (1-based)
  title: string;                            // Episode title
  overview?: string;                        // Episode summary / synopsis
  airDate?: string;                         // Air date YYYY-MM-DD
  airstamp?: string | null;                 // ISO-8601 UTC release timestamp e.g. '2026-10-08T00:30:00+00:00'
  runtime?: number | null;                  // Runtime in minutes
  stillUrl?: string | null;                 // Screenshot thumbnail URL
  isWatched: WatchedStatus;                 // 1 if watched, 0 if unwatched
  watchedAt?: string | null;                // ISO timestamp when marked watched
}

/**
 * Stripped episode item used in 'compact' and 'minimal' backups.
 */
export interface CompactEpisodeItem {
  id: string;
  mediaId: string;
  seasonNumber: number;
  episodeNumber: number;
  title: string;
  airDate?: string;
  airstamp?: string | null;
  runtime?: number | null;
  isWatched: WatchedStatus;
  watchedAt?: string | null;
}
