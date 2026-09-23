import type { MediaItem, EpisodeItem, MediaType, MediaSource } from './media';

/**
 * Normalized search result across all providers (TMDB, TVMaze, iTunes).
 */
export interface MediaSearchResult {
  externalId: string | number;
  source: MediaSource;
  type: MediaType;
  title: string;
  year: number | string;
  releaseDate: string;
  overview: string;
  rating: number | null;
  communityRating?: number | null;
  communityRatingCount?: number | null;
  posterUrl: string | null;
  backdropUrl: string | null;
  popularity?: number;
  genres?: string[];
  status?: string;
  author?: string;
  totalPages?: number;
  isbn?: string;
  imdbId?: string | null;
  tmdbId?: string | number | null;
  tvmazeId?: string | number | null;
  thetvdbId?: string | number | null;
}

export interface OpenLibraryDoc {
  key: string;
  title: string;
  author_name?: string[];
  first_publish_year?: number;
  cover_i?: number;
  number_of_pages_median?: number;
  isbn?: string[];
  publisher?: string[];
  subject?: string[];
  first_sentence?: string | string[];
  ratings_average?: number;
  ratings_count?: number;
}

export interface OpenLibrarySearchResponse {
  numFound: number;
  docs: OpenLibraryDoc[];
}

/**
 * Full details response returned by provider detail fetchers.
 */
export interface FullMediaDetailsResponse {
  media: Partial<MediaItem>;
  episodes: EpisodeItem[] | Omit<EpisodeItem, 'id' | 'mediaId'>[];
}

/**
 * Raw TMDB Movie response item.
 */
export interface TMDBMovie {
  id: number;
  title: string;
  overview: string;
  release_date?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  vote_average?: number;
  vote_count?: number;
  popularity?: number;
  genre_ids?: number[];
  runtime?: number | null;
  media_type?: 'movie';
}

/**
 * Raw TMDB TV response item.
 */
export interface TMDBTV {
  id: number;
  name: string;
  overview: string;
  first_air_date?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  vote_average?: number;
  vote_count?: number;
  popularity?: number;
  genre_ids?: number[];
  number_of_seasons?: number;
  number_of_episodes?: number;
  status?: string;
  seasons?: TMDBSeasonOverview[];
  media_type?: 'tv';
}

export interface TMDBSeasonOverview {
  id: number;
  season_number: number;
  name: string;
  episode_count?: number;
  air_date?: string | null;
}

export interface TMDBEpisode {
  id: number;
  season_number: number;
  episode_number: number;
  name: string;
  overview?: string;
  air_date?: string;
  runtime?: number | null;
  still_path?: string | null;
  vote_average?: number;
}

export interface TMDBSeasonDetail {
  id: number;
  season_number: number;
  name: string;
  episodes: TMDBEpisode[];
}

export interface TMDBMultiSearchResult {
  page: number;
  results: Array<(TMDBMovie | TMDBTV) & { media_type: 'movie' | 'tv' | 'person' }>;
  total_pages: number;
  total_results: number;
}

/**
 * Raw TVMaze Show model.
 */
export interface TVMazeShow {
  id: number;
  name: string;
  summary?: string | null;
  premiered?: string | null;
  genres?: string[];
  status?: string;
  image?: {
    medium?: string;
    original?: string;
  } | null;
  rating?: {
    average?: number | null;
  };
  network?: {
    country?: {
      timezone?: string;
    };
  } | null;
  webChannel?: {
    country?: {
      timezone?: string;
    } | null;
  } | null;
  schedule?: {
    time?: string;
    days?: string[];
  };
  externals?: {
    imdb?: string | null;
    thetvdb?: number | null;
    tvrage?: number | null;
    themoviedb?: number | null;
  } | null;
}

export interface TVMazeSearchResultItem {
  score: number;
  show: TVMazeShow;
}

/**
 * Raw TVMaze Episode model.
 */
export interface TVMazeEpisode {
  id: number;
  season: number;
  number: number;
  name: string;
  summary?: string | null;
  airdate?: string;
  airstamp?: string | null;
  runtime?: number | null;
  image?: {
    medium?: string;
    original?: string;
  } | null;
}

/**
 * Raw iTunes Movie result.
 */
export interface ITunesResult {
  trackId: number;
  trackName: string;
  releaseDate?: string;
  artworkUrl100?: string;
  longDescription?: string;
  shortDescription?: string;
  primaryGenreName?: string;
  trackTimeMillis?: number;
  contentAdvisoryRating?: string;
}

export interface ITunesSearchResponse {
  resultCount: number;
  results: ITunesResult[];
}

/**
 * Raw TMDB Collection Search Result item.
 */
export interface TMDBCollectionSearchResult {
  id: number;
  name: string;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
}

/**
 * Movie part within a TMDB Collection.
 */
export interface TMDBCollectionPart {
  id: number;
  title: string;
  overview?: string;
  release_date?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  vote_average?: number;
  vote_count?: number;
  popularity?: number;
  genre_ids?: number[];
  media_type?: 'movie';
}

/**
 * Complete TMDB Collection detail response.
 */
export interface TMDBCollectionDetail {
  id: number;
  name: string;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  parts: TMDBCollectionPart[];
}
