/**
 * Media types supported by BingeLog.
 */
export type MediaType = 'movie' | 'tv';

/**
 * Watch status lifecycle states.
 */
export type MediaStatus =
  | 'watching'
  | 'plan_to_watch'
  | 'completed'
  | 'on_hold'
  | 'dropped';

/**
 * Origin source of metadata.
 */
export type MediaSource = 'tmdb' | 'tvmaze' | 'itunes' | 'custom';

/**
 * Watched state representation in IndexedDB (0 for unwatched, 1 for watched).
 */
export type WatchedStatus = 0 | 1;

/**
 * Canonical MediaItem record stored in Dexie `media` table.
 */
export interface MediaItem {
  id: string;                               // Primary key: `media_${timestamp}_${hash}`
  type: MediaType;                          // 'movie' | 'tv'
  status: MediaStatus;                      // Tracking status
  title: string;                            // Title of the movie or TV show
  year: number | string;                    // Release year or 'N/A'
  releaseDate?: string;                     // ISO date or YYYY-MM-DD
  overview?: string;                        // Synopsis / premise
  rating?: number | null;                   // 1-10 user rating or TMDB vote average
  posterUrl?: string | null;                // Poster image URL
  backdropUrl?: string | null;              // Banner / backdrop image URL
  genres?: string[];                        // Array of genre names
  source: MediaSource;                      // 'tmdb' | 'tvmaze' | 'itunes' | 'custom'
  externalId?: string | number;             // API provider ID or custom ID
  totalSeasons?: number;                    // Total number of seasons
  totalEpisodes: number;                    // Total episode count (1 for movies)
  watchedEpisodesCount: number;             // Count of episodes marked watched
  currentSeason?: number;                   // Last active season pointer (1-based)
  currentEpisode?: number;                  // Last active episode pointer
  activeSeason?: number;                    // Navigation persistence pointer (Issue #13)
  runtime?: number | null;                  // Movie runtime in minutes
  notes?: string;                           // Personal user review / notes
  lastSyncedAt?: string;                    // ISO timestamp of last successful sync
  createdAt: string;                        // ISO creation timestamp
  updatedAt: string;                        // ISO modification timestamp
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
  runtime?: number | null;
  isWatched: WatchedStatus;
  watchedAt?: string | null;
}
