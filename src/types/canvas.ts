import type { MediaType, MediaStatus, MediaSource } from './media';

/**
 * Types of relationships between canvas items.
 */
export type CanvasEdgeType =
  | 'chronological' // In-universe story order
  | 'release'       // Release year/date order
  | 'sequel'        // Direct sequel
  | 'prequel'       // Direct prequel
  | 'spinoff'       // Branching spin-off
  | 'crossover'     // Character/story crossover
  | 'custom';       // User-specified relation

/**
 * Metadata carried within a single canvas node.
 */
export interface CanvasNodeData {
  mediaId?: string;                        // Foreign key to MediaItem.id if in library
  title: string;                           // Display title
  year?: number | string;                  // Release year or 'N/A'
  releaseDate?: string;                    // ISO date or YYYY-MM-DD
  type: MediaType | 'group' | 'note';      // 'movie' | 'tv' | 'book' | 'group' | 'note'
  posterUrl?: string | null;               // Poster or cover artwork
  backdropUrl?: string | null;             // Backdrop image
  status?: MediaStatus;                    // Library status ('watching', 'completed', etc.)
  rating?: number | null;                  // User rating
  communityRating?: number | null;         // Community / IMDb / TMDB rating
  source?: MediaSource;                    // 'tmdb' | 'tvmaze' | 'itunes' | 'openlibrary' | 'custom'
  externalId?: string | number;            // TMDB or TVMaze ID
  totalEpisodes?: number;                  // Episode count for shows
  watchedEpisodesCount?: number;           // Watched episode count
  overview?: string;                       // Synopsis
  label?: string;                          // Title/label for group or note
  description?: string;                    // Subtitle or description
  color?: string;                          // Border or highlight accent color
  collectionId?: number | string;          // TMDB collection ID if imported
  collectionName?: string | null;          // TMDB collection name (e.g. 'Star Wars Collection')
  [key: string]: unknown;
}

/**
 * Graph node structure for React Flow and Dexie persistence.
 */
export interface CanvasNode {
  id: string;
  type?: 'mediaNode' | 'groupNode' | 'noteNode' | string;
  position: { x: number; y: number };
  data: CanvasNodeData;
  width?: number;
  height?: number;
  style?: Record<string, string | number>;
  selected?: boolean;
}

/**
 * Graph edge connection between two nodes.
 */
export interface CanvasEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  relationType?: CanvasEdgeType;
  label?: string;
  animated?: boolean;
  style?: Record<string, string | number>;
}

/**
 * Franchise Canvas board entity stored in Dexie `canvases` table.
 */
export interface FranchiseCanvas {
  id: string;                              // e.g. `canvas_mcu_1711234567`
  name: string;                            // e.g. "Marvel Cinematic Universe"
  description?: string;                    // e.g. "Sacred Timeline & Multiverse Spinoffs"
  coverImage?: string;                     // Board thumbnail or banner
  nodes: CanvasNode[];                     // Node elements
  edges: CanvasEdge[];                     // Connection arrows
  viewport?: { x: number; y: number; zoom: number };
  createdAt: string;                       // ISO date
  updatedAt: string;                       // ISO date
}
