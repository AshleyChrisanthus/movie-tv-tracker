/**
 * API Service for fetching Movie & TV Show metadata.
 * Supports:
 * 1. TMDB API (Rich Movies + TV Shows with full episode data when API key is configured)
 * 2. TVMaze API (TV Shows with zero API key configuration needed)
 * 3. iTunes Search API (Free fallback for movie search when no TMDB key is set)
 */

import { getSetting, getEpisodesForMedia, saveMediaItem, touchMediaSyncedAt, getFranchiseCollection, saveFranchiseCollection } from '../db/index';
import { parseAudioDuration, extractNarrator } from '../utils/audioDuration';
import type {
  MediaItem,
  EpisodeItem,
  WatchedStatus,
  MediaSource,
  MediaType,
  SyncResult,
  SyncQueueOptions,
  SyncQueueResult,
  MediaSearchResult,
  FullMediaDetailsResponse,
  TMDBMovie,
  TMDBTV,
  TMDBSeasonDetail,
  TMDBMultiSearchResult,
  TMDBCollectionSearchResult,
  TMDBCollectionPart,
  TMDBCollectionDetail,
  CanvasNode,
  CanvasEdge,
  TVMazeShow,
  TVMazeSearchResultItem,
  TVMazeEpisode,
  ITunesResult,
  ITunesSearchResponse,
  OpenLibrarySearchResponse,
  BookEdition,
  BookSearchProvider,
  AudiobookSearchProvider,
  FallbackNotice
} from '../types';

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p';
const TVMAZE_BASE_URL = 'https://api.tvmaze.com';
const OPENLIBRARY_BASE_URL = 'https://openlibrary.org';

/**
 * Retrieve TMDB API key from IndexedDB or Vite env.
 */
export async function getTmdbApiKey(): Promise<string> {
  const savedKey = await getSetting<string>('tmdb_api_key');
  return savedKey || import.meta.env?.VITE_TMDB_API_KEY || '';
}

/**
 * Search movies, TV shows, and books.
 * Intelligently queries TMDB + Open Library (default) / Google Books or TVMaze + iTunes + Open Library / Google Books.
 */
export interface SearchMediaOptions {
  typeFilter?: 'all' | 'movie' | 'tv' | 'book' | 'audiobook';
  bookProvider?: BookSearchProvider;
  audiobookProvider?: AudiobookSearchProvider;
  onPartialResults?: (results: MediaSearchResult[]) => void;
  onFallbackNotice?: (notice: FallbackNotice) => void;
}

export async function searchMedia(
  query?: string | null,
  options: SearchMediaOptions = {}
): Promise<MediaSearchResult[]> {
  if (!query || query.trim().length === 0) return [];
  const trimmed = query.trim();
  const typeFilter = options.typeFilter || 'all';
  const bookProvider = options.bookProvider || 'openlibrary';
  const audiobookProvider = options.audiobookProvider || 'itunes';
  const apiKey = await getTmdbApiKey();

  // If user explicitly chose 'audiobook', query selected audiobook provider (Apple Books/iTunes or Open Library)
  if (typeFilter === 'audiobook') {
    if (audiobookProvider === 'openlibrary') {
      return await searchOpenLibraryAudiobooks(trimmed, 7000);
    }
    return await searchITunesAudiobooks(trimmed, 7000, options.onFallbackNotice);
  }

  // If user explicitly chose 'book', query selected book provider (Open Library, Google Books, Apple Books, or Audiobooks)
  if (typeFilter === 'book') {
    if (bookProvider === 'audiobooks') {
      return await searchITunesAudiobooks(trimmed, 7000, options.onFallbackNotice);
    }
    if (bookProvider === 'applebooks') {
      return await searchAppleBooksEbooks(trimmed, 7000);
    }
    if (bookProvider === 'googlebooks') {
      return await searchGoogleBooks(trimmed, 7000, options.onFallbackNotice);
    }
    return await searchOpenLibraryBooks(trimmed, 7000);
  }

  // If user chose 'tv' or 'movie', query video providers exclusively
  if (typeFilter === 'tv') {
    if (apiKey) {
      try {
        const results = await searchTMDB(trimmed, apiKey);
        return results.filter(r => r.type === 'tv');
      } catch (err) {
        console.warn('TMDB TV search failed, falling back to TVMaze:', err);
      }
    }
    return await searchTVMaze(trimmed);
  }

  if (typeFilter === 'movie') {
    if (apiKey) {
      try {
        const results = await searchTMDB(trimmed, apiKey);
        return results.filter(r => r.type === 'movie');
      } catch (err) {
        console.warn('TMDB Movie search failed, falling back to iTunes:', err);
      }
    }
    return await searchITunesMovies(trimmed);
  }

  // Type filter is 'all': stream results!
  const videoSearchPromise = (async (): Promise<MediaSearchResult[]> => {
    if (apiKey) {
      try {
        return await searchTMDB(trimmed, apiKey);
      } catch (err) {
        console.warn('TMDB search failed, falling back to free providers:', err);
      }
    }
    const [tvResults, movieResults] = await Promise.allSettled([
      searchTVMaze(trimmed),
      searchITunesMovies(trimmed)
    ]);
    const tv = tvResults.status === 'fulfilled' ? tvResults.value : [];
    const movies = movieResults.status === 'fulfilled' ? movieResults.value : [];
    return [...tv, ...movies];
  })();

  const bookSearchPromise = (
    bookProvider === 'applebooks'
      ? searchAppleBooksEbooks(trimmed, 7000)
      : bookProvider === 'googlebooks'
        ? searchGoogleBooks(trimmed, 7000)
        : searchOpenLibraryBooks(trimmed, 7000)
  ).catch(() => []);

  // Dispatch video results as soon as available if streaming callback provided
  if (options.onPartialResults) {
    videoSearchPromise.then(videoResults => {
      if (options.onPartialResults && videoResults.length > 0) {
        options.onPartialResults(videoResults);
      }
    });
  }

  const [videoResults, bookResults] = await Promise.all([
    videoSearchPromise,
    bookSearchPromise
  ]);

  return [...videoResults, ...bookResults];
}

/**
 * Search TMDB (Movies and TV Shows)
 */
async function searchTMDB(query: string, apiKey: string): Promise<MediaSearchResult[]> {
  const url = `${TMDB_BASE_URL}/search/multi?api_key=${encodeURIComponent(apiKey)}&query=${encodeURIComponent(query)}&include_adult=false`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`TMDB error: ${res.statusText}`);
  }
  const data: TMDBMultiSearchResult = await res.json();

  return (data.results || [])
    .filter((item): item is (TMDBMovie | TMDBTV) & { media_type: 'movie' | 'tv' } => item.media_type === 'tv' || item.media_type === 'movie')
    .map((item): MediaSearchResult => {
      const isTv = item.media_type === 'tv';
      const title = isTv ? (item as TMDBTV).name : (item as TMDBMovie).title;
      const releaseDate = isTv ? (item as TMDBTV).first_air_date : (item as TMDBMovie).release_date;
      const year = releaseDate ? new Date(releaseDate).getFullYear() : 'N/A';
      const posterUrl = item.poster_path ? `${TMDB_IMAGE_BASE}/w500${item.poster_path}` : null;
      const backdropUrl = item.backdrop_path ? `${TMDB_IMAGE_BASE}/original${item.backdrop_path}` : null;

      return {
        externalId: item.id,
        tmdbId: item.id,
        source: 'tmdb',
        type: isTv ? 'tv' : 'movie',
        title: title || 'Untitled',
        year,
        releaseDate: releaseDate || '',
        overview: item.overview || '',
        rating: null,
        communityRating: item.vote_average ? Number(item.vote_average.toFixed(1)) : null,
        communityRatingCount: item.vote_count || null,
        posterUrl,
        backdropUrl,
        popularity: item.popularity || 0
      };
    })
    .sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
}

/**
 * Search TVMaze (TV shows), iTunes (Movies), and Open Library (Books) with zero API keys required
 */
async function searchFreeProviders(query: string): Promise<MediaSearchResult[]> {
  const [tvResults, movieResults, bookResults] = await Promise.allSettled([
    searchTVMaze(query),
    searchITunesMovies(query),
    searchOpenLibraryBooks(query)
  ]);

  const tv = tvResults.status === 'fulfilled' ? tvResults.value : [];
  const movies = movieResults.status === 'fulfilled' ? movieResults.value : [];
  const books = bookResults.status === 'fulfilled' ? bookResults.value : [];

  return [...tv, ...movies, ...books];
}

/**
 * Free TV Show Search via TVMaze
 */
async function searchTVMaze(query: string): Promise<MediaSearchResult[]> {
  try {
    const res = await fetch(`${TVMAZE_BASE_URL}/search/shows?q=${encodeURIComponent(query)}`);
    if (!res.ok) return [];
    const data: TVMazeSearchResultItem[] = await res.json();

    return data.map(({ show }): MediaSearchResult => {
      const year = show.premiered ? new Date(show.premiered).getFullYear() : 'N/A';
      // Strip HTML tags from TVMaze summary
      const cleanOverview = show.summary ? show.summary.replace(/<[^>]*>?/gm, '') : '';

      return {
        externalId: show.id,
        tvmazeId: show.id,
        source: 'tvmaze',
        type: 'tv',
        title: show.name,
        year,
        releaseDate: show.premiered || '',
        overview: cleanOverview,
        rating: null,
        communityRating: show.rating?.average ? Number(show.rating.average) : null,
        communityRatingCount: null,
        posterUrl: show.image?.medium || show.image?.original || null,
        backdropUrl: show.image?.original || null,
        genres: show.genres || [],
        status: show.status,
        imdbId: show.externals?.imdb || null,
        tmdbId: show.externals?.themoviedb || null,
        thetvdbId: show.externals?.thetvdb || null
      };
    });
  } catch (err) {
    console.error('TVMaze search error:', err);
    return [];
  }
}

/**
 * Browser JSONP loader for Apple iTunes API.
 * Bypasses CORS and opaque-origin restrictions when running locally via file:/// or restricted origins.
 */
function fetchITunesJsonp<T>(url: string, timeoutMs: number = 6000): Promise<T> {
  return new Promise((resolve, reject) => {
    if (typeof document === 'undefined') {
      return reject(new Error('JSONP only supported in browser environment'));
    }
    const callbackName = `__itunes_cb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const script = document.createElement('script');
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('iTunes JSONP timed out'));
    }, timeoutMs);

    const cleanup = () => {
      clearTimeout(timer);
      if (script.parentNode) script.parentNode.removeChild(script);
      delete (window as any)[callbackName];
    };

    (window as any)[callbackName] = (data: T) => {
      cleanup();
      resolve(data);
    };

    script.onerror = () => {
      cleanup();
      reject(new Error('iTunes JSONP script load failed'));
    };

    const separator = url.includes('?') ? '&' : '?';
    script.src = `${url}${separator}callback=${callbackName}`;
    document.body.appendChild(script);
  });
}

/**
 * Free Movie Search via iTunes API (Fallback when no TMDB key is provided)
 */
async function searchITunesMovies(query: string): Promise<MediaSearchResult[]> {
  try {
    const movieUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=movie&entity=movie&limit=8`;
    let data: ITunesSearchResponse | null = null;
    try {
      const res = await fetch(movieUrl);
      if (res.ok) data = await res.json();
    } catch {
      // Fallback to JSONP if fetch blocked locally
      data = await fetchITunesJsonp<ITunesSearchResponse>(movieUrl, 5000);
    }
    if (!data) return [];

    return (data.results || []).map((movie: ITunesResult): MediaSearchResult => {
      const year = movie.releaseDate ? new Date(movie.releaseDate).getFullYear() : 'N/A';
      // Upgrade iTunes 100x100 artwork to higher resolution (600x600)
      const posterUrl = movie.artworkUrl100
        ? movie.artworkUrl100.replace('100x100bb.jpg', '600x600bb.jpg')
        : null;

      return {
        externalId: movie.trackId,
        source: 'itunes',
        type: 'movie',
        title: movie.trackName,
        year,
        releaseDate: movie.releaseDate ? movie.releaseDate.split('T')[0] : '',
        overview: movie.longDescription || movie.shortDescription || '',
        rating: null,
        posterUrl,
        backdropUrl: posterUrl,
        genres: movie.primaryGenreName ? [movie.primaryGenreName] : []
      };
    });
  } catch (err) {
    console.error('iTunes movie search error:', err);
    return [];
  }
}

/**
 * Free Audiobook Search via Apple iTunes Search API (zero keys required) (Issue #38)
 */
export async function searchITunesAudiobooks(
  query: string,
  timeoutMs: number = 7000,
  onFallbackNotice?: (notice: FallbackNotice) => void
): Promise<MediaSearchResult[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const fetchItunesData = async (reqUrl: string): Promise<any> => {
    try {
      const res = await fetch(reqUrl, { signal: controller.signal });
      if (res.ok) {
        return await res.json();
      }
    } catch (fetchErr) {
      // If standard fetch failed (e.g. file:/// protocol in local browser or CORS block), attempt JSONP
      try {
        return await fetchITunesJsonp<any>(reqUrl, 5000);
      } catch {
        throw fetchErr;
      }
    }
    return null;
  };

  try {
    // 1. Try US catalog first (broadest global audiobook licensing coverage)
    let data = await fetchItunesData(
      `https://itunes.apple.com/search?media=audiobook&entity=audiobook&country=US&limit=25&term=${encodeURIComponent(query)}`
    );
    let items = Array.isArray(data?.results) ? data.results : [];

    // 2. If US catalog returned 0 results, query local storefront (e.g. Australia, UK)
    if (items.length === 0) {
      try {
        const localData = await fetchItunesData(
          `https://itunes.apple.com/search?media=audiobook&entity=audiobook&limit=25&term=${encodeURIComponent(query)}`
        );
        if (Array.isArray(localData?.results) && localData.results.length > 0) {
          items = localData.results;
        }
      } catch {
        // proceed
      }
    }
    clearTimeout(timer);

    if (items.length === 0) {
      console.warn('iTunes audiobooks returned 0 results, falling back to Open Library audiobooks');
      onFallbackNotice?.({
        provider: 'itunes',
        reason: 'iTunes returned 0 results in your region',
        fallbackTo: 'Open Library'
      });
      return await searchOpenLibraryAudiobooks(query, timeoutMs);
    }

    return items.map((item: any): MediaSearchResult => {
      const year = item.releaseDate ? new Date(item.releaseDate).getFullYear() : 'N/A';
      // Upgrade artwork to high-resolution (600x600)
      const posterUrl = item.artworkUrl100
        ? item.artworkUrl100.replace('100x100bb', '600x600bb')
        : (item.artworkUrl60 || null);

      // Clean HTML tags from iTunes description
      const rawDesc = item.description || '';
      const cleanDesc = rawDesc.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim();

      // Extract narrator if present in description
      const narrator = extractNarrator(cleanDesc) || extractNarrator(rawDesc);

      return {
        externalId: `itunes_audio_${item.collectionId || item.trackId}`,
        source: 'itunes',
        type: 'book',
        title: item.collectionName || item.trackName || 'Untitled Audiobook',
        year,
        releaseDate: item.releaseDate ? item.releaseDate.split('T')[0] : '',
        overview: cleanDesc || (narrator ? `Narrated by ${narrator}` : `Audiobook by ${item.artistName || 'Unknown'}`),
        rating: null,
        posterUrl,
        backdropUrl: posterUrl,
        author: item.artistName || undefined,
        narrator,
        bookFormat: 'Audiobook',
        audioPreviewUrl: item.previewUrl || undefined,
        genres: item.primaryGenreName ? [item.primaryGenreName] : ['Audiobook'],
        totalPages: 0,
        totalDurationSeconds: item.trackTimeMillis ? Math.round(item.trackTimeMillis / 1000) : undefined
      };
    });
  } catch (err) {
    clearTimeout(timer);
    console.warn('iTunes audiobook search failed, falling back to Open Library audiobooks:', err);
    onFallbackNotice?.({
      provider: 'itunes',
      reason: 'iTunes connection failed or is restricted on this network',
      fallbackTo: 'Open Library'
    });
    return await searchOpenLibraryAudiobooks(query, timeoutMs);
  }
}

/**
 * Free eBook Search via Apple Books / iTunes Search API (zero keys required) (Issue #45)
 */
export async function searchAppleBooksEbooks(
  query: string,
  timeoutMs: number = 7000
): Promise<MediaSearchResult[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const fetchItunesData = async (reqUrl: string): Promise<any> => {
    try {
      const res = await fetch(reqUrl, { signal: controller.signal });
      if (res.ok) {
        return await res.json();
      }
    } catch (fetchErr) {
      // If standard fetch failed (e.g. file:/// protocol in local browser or CORS block), attempt JSONP
      try {
        return await fetchITunesJsonp<any>(reqUrl, 5000);
      } catch {
        throw fetchErr;
      }
    }
    return null;
  };

  try {
    // 1. Query US store first for broadest eBook catalog
    let data = await fetchItunesData(
      `https://itunes.apple.com/search?media=ebook&entity=ebook&country=US&limit=25&term=${encodeURIComponent(query)}`
    );
    let items = Array.isArray(data?.results) ? data.results : [];

    // 2. If US catalog returned 0 results, query local storefront (e.g. Australia, UK)
    if (items.length === 0) {
      try {
        const localData = await fetchItunesData(
          `https://itunes.apple.com/search?media=ebook&entity=ebook&limit=25&term=${encodeURIComponent(query)}`
        );
        if (Array.isArray(localData?.results) && localData.results.length > 0) {
          items = localData.results;
        }
      } catch {
        // proceed
      }
    }
    clearTimeout(timer);

    return items.map((item: any): MediaSearchResult => {
      const year = item.releaseDate ? new Date(item.releaseDate).getFullYear() : 'N/A';
      // Upgrade artwork to high-resolution (600x600)
      const posterUrl = item.artworkUrl100
        ? item.artworkUrl100.replace('100x100bb', '600x600bb')
        : (item.artworkUrl60 || null);

      const rawDesc = item.description || '';
      const cleanDesc = rawDesc.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim();

      // Extract potential ISBN from artwork URL or description
      let isbn: string | undefined;
      const urlIsbnMatch = item.artworkUrl100?.match(/(\d{10}|\d{13})\.[a-z]+(\.jpg)?/i);
      if (urlIsbnMatch) {
        isbn = urlIsbnMatch[1];
      } else {
        const descIsbnMatch = cleanDesc.match(/ISBN(?:-1[03])?:?\s*([0-9X-]{10,17})/i);
        if (descIsbnMatch) {
          isbn = descIsbnMatch[1].replace(/[^0-9X]/gi, '');
        }
      }

      const communityRating = typeof item.averageUserRating === 'number'
        ? Math.round(item.averageUserRating * 2 * 10) / 10
        : null;
      const communityRatingCount = typeof item.userRatingCount === 'number' ? item.userRatingCount : null;

      const genres = Array.isArray(item.genres) && item.genres.length > 0
        ? item.genres.filter((g: string) => g !== 'Books')
        : (item.primaryGenreName ? [item.primaryGenreName] : ['E-book']);

      return {
        externalId: `itunes_ebook_${item.trackId}`,
        source: 'itunes',
        type: 'book',
        title: item.trackName || 'Untitled eBook',
        year,
        releaseDate: item.releaseDate ? item.releaseDate.split('T')[0] : '',
        overview: cleanDesc || `Digital eBook by ${item.artistName || 'Unknown'}`,
        rating: null,
        communityRating,
        communityRatingCount,
        posterUrl,
        backdropUrl: posterUrl,
        author: item.artistName || undefined,
        bookFormat: 'E-book',
        genres: genres.length > 0 ? genres : ['E-book'],
        totalPages: 0,
        isbn
      };
    });
  } catch (err) {
    clearTimeout(timer);
    console.warn('Apple Books eBook search failed:', err);
    return [];
  }
}

/**
 * Free Audiobook Search via Open Library API (zero keys required)
 * Strictly searches and filters for works that have verified audio editions (Audio CD, Audio Cassette, Audiobook).
 */
export async function searchOpenLibraryAudiobooks(query: string, timeoutMs: number = 7000): Promise<MediaSearchResult[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const fields = 'key,title,author_name,first_publish_year,format,number_of_pages_median,cover_i,isbn,publisher,subject,first_sentence,ratings_average,ratings_count,edition_count';
    const res = await fetch(`${OPENLIBRARY_BASE_URL}/search.json?q=${encodeURIComponent(query)}&limit=35&fields=${fields}`, {
      signal: controller.signal
    });
    clearTimeout(timer);
    if (!res.ok) return [];
    const data: OpenLibrarySearchResponse = await res.json();

    const isAudioDoc = (doc: any): boolean => {
      const hasAudioFormat = Array.isArray(doc.format) && doc.format.some((f: string) =>
        /audio|cd|cassette|sound|spoken|mp3|player/i.test(f)
      );
      const hasAudioTitle = /audio\s*(book|cd|cassette)|unabridged|abridged/i.test(doc.title || '');
      const hasAudioSubject = Array.isArray(doc.subject) && doc.subject.some((s: string) =>
        /audiobook|audio\s*book|sound\s*recording/i.test(s)
      );
      return Boolean(hasAudioFormat || hasAudioTitle || hasAudioSubject);
    };

    const queryNorm = query.trim().toLowerCase();
    const queryTokens = queryNorm.split(/\s+/).filter(w => w.length > 1);

    const audioDocs = (data.docs || []).filter((doc: any) => {
      if (!isAudioDoc(doc)) return false;
      const titleLower = (doc.title || '').toLowerCase();
      const authorLower = Array.isArray(doc.author_name) ? doc.author_name.join(' ').toLowerCase() : '';
      if (titleLower.includes(queryNorm) || authorLower.includes(queryNorm)) return true;
      if (queryTokens.length > 0 && queryTokens.some(tok => titleLower.includes(tok) || authorLower.includes(tok))) return true;
      return false;
    });

    return audioDocs.map((doc: any): MediaSearchResult => {
      const author = Array.isArray(doc.author_name) && doc.author_name.length > 0
        ? doc.author_name.join(', ')
        : 'Unknown Author';
      const year = doc.first_publish_year ? String(doc.first_publish_year) : 'N/A';
      const posterUrl = doc.cover_i
        ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg`
        : null;
      const totalPages = doc.number_of_pages_median || 0;
      const isbn = Array.isArray(doc.isbn) && doc.isbn.length > 0 ? doc.isbn[0] : undefined;
      const publisher = Array.isArray(doc.publisher) && doc.publisher.length > 0 ? doc.publisher[0] : undefined;

      let detectedFormat = 'Audiobook';
      if (Array.isArray(doc.format)) {
        if (doc.format.some((f: string) => /audio\s*cd|cd/i.test(f))) detectedFormat = 'Audio CD';
        else if (doc.format.some((f: string) => /cassette/i.test(f))) detectedFormat = 'Audio Cassette';
        else if (doc.format.some((f: string) => /mp3/i.test(f))) detectedFormat = 'MP3 CD';
      }

      const overview = `Audiobook (${detectedFormat}) by ${author}${totalPages ? ` • (Companion print: ${totalPages} pages)` : ''}${publisher ? ` • Published by ${publisher}` : ''}`;
      const communityRating = typeof doc.ratings_average === 'number'
        ? Math.round((doc.ratings_average * 2) * 10) / 10
        : null;
      const communityRatingCount = typeof doc.ratings_count === 'number' ? doc.ratings_count : null;
      const workId = doc.key.replace('/works/', '');

      return {
        externalId: workId,
        workId,
        editionCount: doc.edition_count || undefined,
        source: 'openlibrary',
        type: 'book',
        title: doc.title || 'Untitled Audiobook',
        year,
        releaseDate: doc.first_publish_year ? `${doc.first_publish_year}-01-01` : '',
        overview,
        rating: null,
        communityRating,
        communityRatingCount,
        posterUrl,
        backdropUrl: posterUrl,
        author,
        totalPages,
        isbn,
        publisher,
        bookFormat: detectedFormat,
        genres: Array.isArray(doc.subject) ? doc.subject.slice(0, 5) : ['Audiobook']
      };
    });
  } catch (err) {
    clearTimeout(timer);
    return [];
  }
}

/**
 * Free Book Search via Open Library API (zero keys required)
 */
export async function searchOpenLibraryBooks(query: string, timeoutMs: number = 7000): Promise<MediaSearchResult[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const fields = 'key,title,author_name,first_publish_year,number_of_pages_median,cover_i,isbn,publisher,subject,first_sentence,ratings_average,ratings_count,edition_count';
    const res = await fetch(`${OPENLIBRARY_BASE_URL}/search.json?q=${encodeURIComponent(query)}&limit=8&fields=${fields}`, {
      signal: controller.signal
    });
    clearTimeout(timer);
    if (!res.ok) return [];
    const data: OpenLibrarySearchResponse = await res.json();

    return (data.docs || []).map((doc): MediaSearchResult => {
      const author = Array.isArray(doc.author_name) && doc.author_name.length > 0
        ? doc.author_name.join(', ')
        : 'Unknown Author';
      const year = doc.first_publish_year ? String(doc.first_publish_year) : 'N/A';
      const posterUrl = doc.cover_i
        ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg`
        : null;
      const totalPages = doc.number_of_pages_median || 0;
      const isbn = Array.isArray(doc.isbn) && doc.isbn.length > 0 ? doc.isbn[0] : undefined;
      const publisher = Array.isArray(doc.publisher) && doc.publisher.length > 0 ? doc.publisher[0] : undefined;
      const firstSentence = Array.isArray(doc.first_sentence)
        ? doc.first_sentence[0]
        : (typeof doc.first_sentence === 'string' ? doc.first_sentence : '');
      const overview = firstSentence
        ? `"${firstSentence}" — By ${author}`
        : `By ${author}${totalPages ? ` • ${totalPages} pages` : ''}${publisher ? ` • Published by ${publisher}` : ''}`;
      const communityRating = typeof doc.ratings_average === 'number'
        ? Math.round((doc.ratings_average * 2) * 10) / 10
        : null;
      const communityRatingCount = typeof doc.ratings_count === 'number' ? doc.ratings_count : null;
      const workId = doc.key.replace('/works/', '');

      return {
        externalId: workId,
        workId,
        editionCount: (doc as any).edition_count || undefined,
        source: 'openlibrary',
        type: 'book',
        title: doc.title || 'Untitled Book',
        year,
        releaseDate: doc.first_publish_year ? `${doc.first_publish_year}-01-01` : '',
        overview,
        rating: null,
        communityRating,
        communityRatingCount,
        posterUrl,
        backdropUrl: posterUrl,
        author,
        totalPages,
        isbn,
        publisher,
        genres: Array.isArray(doc.subject) ? doc.subject.slice(0, 5) : []
      };
    });
  } catch (err) {
    clearTimeout(timer);
    // Silent catch on abort or network error
    return [];
  }
}

/**
 * Strip HTML tags from a text blurb.
 */
function stripHtml(html?: string): string {
  if (!html) return '';
  return html.replace(/<[^>]*>?/gm, '').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').trim();
}

/**
 * Search books via Google Books API (Issue #27).
 * Fallback provider and alternative search option.
 */
export async function searchGoogleBooks(
  query: string,
  timeoutMs: number = 7000,
  onFallbackNotice?: (notice: FallbackNotice) => void
): Promise<MediaSearchResult[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const apiKey = await getSetting<string>('google_books_api_key', '');
    const keyParam = apiKey ? `&key=${encodeURIComponent(apiKey)}` : '';
    const res = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=12${keyParam}`, {
      signal: controller.signal
    });
    clearTimeout(timer);
    if (!res.ok) {
      const reason = res.status === 429 ? 'Daily quota limit reached (HTTP 429)' : `Google Books returned HTTP ${res.status}`;
      console.warn(`Google Books API returned status ${res.status}, falling back to Open Library`);
      onFallbackNotice?.({
        provider: 'googlebooks',
        reason,
        fallbackTo: 'Open Library'
      });
      return await searchOpenLibraryBooks(query, timeoutMs);
    }
    const data = await res.json();
    const items = Array.isArray(data?.items) ? data.items : [];

    return items.map((item: any): MediaSearchResult => {
      const vi = item.volumeInfo || {};
      const author = Array.isArray(vi.authors) && vi.authors.length > 0
        ? vi.authors.join(', ')
        : 'Unknown Author';
      const year = vi.publishedDate ? vi.publishedDate.slice(0, 4) : 'N/A';
      const totalPages = typeof vi.pageCount === 'number' ? vi.pageCount : 0;
      const rawCover = vi.imageLinks?.thumbnail || vi.imageLinks?.smallThumbnail || null;
      const posterUrl = rawCover ? String(rawCover).replace('http://', 'https://') : null;
      
      let isbn: string | undefined;
      if (Array.isArray(vi.industryIdentifiers)) {
        const isbn13 = vi.industryIdentifiers.find((i: any) => i.type === 'ISBN_13')?.identifier;
        const isbn10 = vi.industryIdentifiers.find((i: any) => i.type === 'ISBN_10')?.identifier;
        isbn = isbn13 || isbn10;
      }

      const description = stripHtml(vi.description);
      const overview = description || `By ${author}${totalPages ? ` • ${totalPages} pages` : ''}${vi.publisher ? ` • Published by ${vi.publisher}` : ''}`;
      
      const communityRating = typeof vi.averageRating === 'number'
        ? Math.round(vi.averageRating * 2 * 10) / 10
        : null;
      const communityRatingCount = typeof vi.ratingsCount === 'number' ? vi.ratingsCount : null;

      return {
        externalId: item.id || `gb_${Math.random().toString(36).slice(2, 9)}`,
        source: 'googlebooks',
        type: 'book',
        title: vi.title || 'Untitled Book',
        year,
        releaseDate: vi.publishedDate || '',
        overview,
        rating: null,
        communityRating,
        communityRatingCount,
        posterUrl,
        backdropUrl: posterUrl,
        author,
        totalPages,
        isbn,
        publisher: vi.publisher,
        genres: Array.isArray(vi.categories) ? vi.categories : []
      };
    });
  } catch (err) {
    clearTimeout(timer);
    console.warn('Google Books search failed, falling back to Open Library:', err);
    onFallbackNotice?.({
      provider: 'googlebooks',
      reason: 'Network connection or service unavailable',
      fallbackTo: 'Open Library'
    });
    return await searchOpenLibraryBooks(query, timeoutMs);
  }
}

/**
 * Fetch editions for an Open Library work (Issue #25).
 */
export async function fetchOpenLibraryEditions(
  workKeyOrId: string,
  limit: number = 30,
  timeoutMs: number = 8000
): Promise<BookEdition[]> {
  const cleanId = String(workKeyOrId).replace(/^\/works\//, '').replace(/^works\//, '');
  if (!cleanId) return [];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${OPENLIBRARY_BASE_URL}/works/${encodeURIComponent(cleanId)}/editions.json?limit=${limit}`, {
      signal: controller.signal
    });
    clearTimeout(timer);
    if (!res.ok) return [];
    const data = await res.json();
    const entries = Array.isArray(data?.entries) ? data.entries : [];

    const editions: BookEdition[] = entries.map((entry: any): BookEdition => {
      const id = entry.key ? String(entry.key).replace('/books/', '') : '';
      const coverId = Array.isArray(entry.covers) && entry.covers.length > 0 && entry.covers[0] > 0
        ? entry.covers[0]
        : null;
      const coverUrl = coverId ? `https://covers.openlibrary.org/b/id/${coverId}-M.jpg` : null;
      const publishers = Array.isArray(entry.publishers) ? entry.publishers : [];
      const isbn10 = Array.isArray(entry.isbn_10) && entry.isbn_10.length > 0 ? String(entry.isbn_10[0]) : undefined;
      const isbn13 = Array.isArray(entry.isbn_13) && entry.isbn_13.length > 0 ? String(entry.isbn_13[0]) : undefined;
      const isbn = isbn13 || isbn10;
      const rawFormat = entry.physical_format || '';
      const isAudio = /audio|cd|cassette|spoken/i.test(rawFormat) ||
                      /audiobook/i.test(entry.title || '') ||
                      /listening length/i.test(String(entry.notes || ''));
      const physicalFormat = entry.physical_format || (isAudio ? 'Audiobook' : (entry.number_of_pages ? 'Print' : 'Edition'));

      let narrator: string | undefined;
      if (Array.isArray(entry.contributors)) {
        const narratorContributor = entry.contributors.find((c: any) =>
          /narrat|reader/i.test(String(c?.role || ''))
        );
        if (narratorContributor?.name) narrator = String(narratorContributor.name).trim();
      }

      let totalDurationSeconds: number | undefined;
      const notesStr = typeof entry.notes === 'string' ? entry.notes : (entry.notes?.value || '');
      const paginationStr = typeof entry.pagination === 'string' ? entry.pagination : '';
      if (notesStr || paginationStr) {
        const dur = parseAudioDuration(notesStr) || parseAudioDuration(paginationStr);
        if (dur > 0) totalDurationSeconds = dur;
      }
      if (!narrator && (notesStr || entry.description)) {
        narrator = extractNarrator(notesStr) || extractNarrator(typeof entry.description === 'string' ? entry.description : entry.description?.value);
      }

      let year = '';
      if (entry.publish_date) {
        const yearMatch = String(entry.publish_date).match(/\b(19\d\d|20\d\d)\b/);
        if (yearMatch) year = yearMatch[1];
      }

      return {
        id,
        key: entry.key || `/books/${id}`,
        title: entry.title || 'Untitled Edition',
        publishers,
        publishDate: entry.publish_date,
        year,
        totalPages: typeof entry.number_of_pages === 'number' ? entry.number_of_pages : undefined,
        totalDurationSeconds,
        narrator,
        isbn10,
        isbn13,
        isbn,
        physicalFormat,
        coverUrl,
        language: Array.isArray(entry.languages) && entry.languages[0]?.key
          ? String(entry.languages[0].key).replace('/languages/', '')
          : undefined
      };
    });

    // Sort to prioritize editions that have both covers and known page counts or audio duration
    return editions.sort((a, b) => {
      const scoreA = (a.coverUrl ? 2 : 0) + (a.totalPages || a.totalDurationSeconds ? 1 : 0);
      const scoreB = (b.coverUrl ? 2 : 0) + (b.totalPages || b.totalDurationSeconds ? 1 : 0);
      return scoreB - scoreA;
    });
  } catch {
    clearTimeout(timer);
    return [];
  }
}

/**
 * Directly lookup a specific book edition by ISBN (10 or 13 digits) or Open Library edition ID (Issue #25).
 * Queries Open Library ISBN endpoint first, then falls back to Google Books.
 */
export async function fetchBookEditionByIsbn(
  isbnOrIdRaw: string,
  timeoutMs: number = 7000
): Promise<BookEdition | null> {
  const query = isbnOrIdRaw.trim();
  if (!query) return null;

  const cleanIsbn = query.replace(/[^0-9X]/gi, '').toUpperCase();
  const isEditionKey = /^OL\d+M$/i.test(query) || /^\/books\/OL\d+M$/i.test(query);
  const isValidIsbn = cleanIsbn.length === 10 || cleanIsbn.length === 13;

  if (!isValidIsbn && !isEditionKey) {
    return null;
  }

  // 1. Try Open Library endpoint (either /books/{id}.json or /isbn/{isbn}.json)
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const url = isEditionKey
      ? `${OPENLIBRARY_BASE_URL}/books/${encodeURIComponent(query.replace('/books/', ''))}.json`
      : `${OPENLIBRARY_BASE_URL}/isbn/${encodeURIComponent(cleanIsbn)}.json`;

    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);

    if (res.ok) {
      const entry = await res.json();
      const id = entry.key ? String(entry.key).replace('/books/', '') : (isEditionKey ? query.replace('/books/', '') : `isbn_${cleanIsbn}`);
      const coverId = Array.isArray(entry.covers) && entry.covers.length > 0 && entry.covers[0] > 0
        ? entry.covers[0]
        : null;
      const coverUrl = coverId
        ? `https://covers.openlibrary.org/b/id/${coverId}-M.jpg`
        : (isValidIsbn ? `https://covers.openlibrary.org/b/isbn/${cleanIsbn}-M.jpg` : null);
      const publishers = Array.isArray(entry.publishers) ? entry.publishers : [];
      const isbn10 = Array.isArray(entry.isbn_10) && entry.isbn_10.length > 0
        ? String(entry.isbn_10[0])
        : (cleanIsbn.length === 10 ? cleanIsbn : undefined);
      const isbn13 = Array.isArray(entry.isbn_13) && entry.isbn_13.length > 0
        ? String(entry.isbn_13[0])
        : (cleanIsbn.length === 13 ? cleanIsbn : undefined);
      const isbn = isbn13 || isbn10 || (isValidIsbn ? cleanIsbn : undefined);
      const rawFormat = entry.physical_format || '';
      const isAudio = /audio|cd|cassette|spoken/i.test(rawFormat) ||
                      /audiobook/i.test(entry.title || '') ||
                      /listening length/i.test(String(entry.notes || ''));
      const physicalFormat = entry.physical_format || (isAudio ? 'Audiobook' : (entry.number_of_pages ? 'Print' : 'Edition'));

      let narrator: string | undefined;
      if (Array.isArray(entry.contributors)) {
        const narratorContributor = entry.contributors.find((c: any) =>
          /narrat|reader/i.test(String(c?.role || ''))
        );
        if (narratorContributor?.name) narrator = String(narratorContributor.name).trim();
      }

      let totalDurationSeconds: number | undefined;
      const notesStr = typeof entry.notes === 'string' ? entry.notes : (entry.notes?.value || '');
      const paginationStr = typeof entry.pagination === 'string' ? entry.pagination : '';
      if (notesStr || paginationStr) {
        const dur = parseAudioDuration(notesStr) || parseAudioDuration(paginationStr);
        if (dur > 0) totalDurationSeconds = dur;
      }
      if (!narrator && (notesStr || entry.description)) {
        narrator = extractNarrator(notesStr) || extractNarrator(typeof entry.description === 'string' ? entry.description : entry.description?.value);
      }

      let year = '';
      if (entry.publish_date) {
        const yearMatch = String(entry.publish_date).match(/\b(19\d\d|20\d\d)\b/);
        if (yearMatch) year = yearMatch[1];
      }

      return {
        id,
        key: entry.key || `/books/${id}`,
        title: entry.title || 'Untitled Edition',
        publishers,
        publishDate: entry.publish_date,
        year,
        totalPages: typeof entry.number_of_pages === 'number' ? entry.number_of_pages : undefined,
        totalDurationSeconds,
        narrator,
        isbn10,
        isbn13,
        isbn,
        physicalFormat,
        coverUrl,
        language: Array.isArray(entry.languages) && entry.languages[0]?.key
          ? String(entry.languages[0].key).replace('/languages/', '')
          : undefined
      };
    }
  } catch {
    clearTimeout(timer);
  }

  // 2. Fallback to Google Books for ISBN lookup
  if (isValidIsbn) {
    try {
      const apiKey = await getSetting<string>('google_books_api_key', '');
      const keyParam = apiKey ? `&key=${encodeURIComponent(apiKey)}` : '';
      const gbController = new AbortController();
      const gbTimer = setTimeout(() => gbController.abort(), timeoutMs);

      const res = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${encodeURIComponent(cleanIsbn)}${keyParam}`, {
        signal: gbController.signal
      });
      clearTimeout(gbTimer);

      if (res.ok) {
        const data = await res.json();
        const item = data?.items?.[0];
        const volume = item?.volumeInfo;
        if (volume) {
          const id = item.id || `gb_${cleanIsbn}`;
          const publishers = volume.publisher ? [volume.publisher] : [];
          let year = '';
          if (volume.publishedDate) {
            const yearMatch = String(volume.publishedDate).match(/\b(19\d\d|20\d\d)\b/);
            if (yearMatch) year = yearMatch[1];
          }
          let coverUrl: string | null = null;
          if (volume.imageLinks?.thumbnail) {
            coverUrl = volume.imageLinks.thumbnail.replace('http://', 'https://');
          }

          return {
            id,
            key: `/books/${id}`,
            title: volume.title || 'Untitled Edition',
            publishers,
            publishDate: volume.publishedDate,
            year,
            totalPages: typeof volume.pageCount === 'number' ? volume.pageCount : undefined,
            isbn: cleanIsbn,
            isbn10: cleanIsbn.length === 10 ? cleanIsbn : undefined,
            isbn13: cleanIsbn.length === 13 ? cleanIsbn : undefined,
            physicalFormat: volume.printType === 'BOOK' ? 'Print' : volume.printType,
            coverUrl
          };
        }
      }
    } catch {
      // ignore
    }
  }

  return null;
}

/**
 * Enrich book synopsis and categories via Google Books or Open Library Works API (Issue #25).
 */
export async function enrichBookSynopsis(params: {
  isbn?: string;
  title?: string;
  author?: string;
  workId?: string;
}): Promise<{
  overview?: string;
  genres?: string[];
  communityRating?: number | null;
  communityRatingCount?: number | null;
} | null> {
  const { isbn, title, author, workId } = params;

  // 1. Try Google Books by ISBN or title + author
  try {
    const apiKey = await getSetting<string>('google_books_api_key', '');
    const keyParam = apiKey ? `&key=${encodeURIComponent(apiKey)}` : '';
    let url = '';
    if (isbn && isbn.trim()) {
      url = `https://www.googleapis.com/books/v1/volumes?q=isbn:${encodeURIComponent(isbn.trim())}${keyParam}`;
    } else if (title && title.trim()) {
      url = `https://www.googleapis.com/books/v1/volumes?q=intitle:${encodeURIComponent(title.trim())}${author ? `+inauthor:${encodeURIComponent(author.trim())}` : ''}${keyParam}`;
    }

    if (url) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);

      if (res.ok) {
        const data = await res.json();
        const firstItem = data?.items?.[0]?.volumeInfo;
        if (firstItem) {
          const description = stripHtml(firstItem.description);
          const genres = Array.isArray(firstItem.categories) ? firstItem.categories : [];
          const communityRating = typeof firstItem.averageRating === 'number'
            ? Math.round(firstItem.averageRating * 2 * 10) / 10
            : null;
          const communityRatingCount = typeof firstItem.ratingsCount === 'number' ? firstItem.ratingsCount : null;

          if (description || genres.length > 0) {
            return {
              overview: description || undefined,
              genres: genres.length > 0 ? genres : undefined,
              communityRating,
              communityRatingCount
            };
          }
        }
      }
    }
  } catch {
    // ignore Google Books failure and try Open Library work
  }

  // 2. Fallback to Open Library Work details if workId exists
  if (workId) {
    try {
      const cleanWorkId = String(workId).replace(/^\/works\//, '').replace(/^works\//, '');
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(`${OPENLIBRARY_BASE_URL}/works/${encodeURIComponent(cleanWorkId)}.json`, {
        signal: controller.signal
      });
      clearTimeout(timer);

      if (res.ok) {
        const data = await res.json();
        let description = '';
        if (typeof data.description === 'string') {
          description = data.description;
        } else if (data.description && typeof data.description.value === 'string') {
          description = data.description.value;
        }

        const genres = Array.isArray(data.subjects) ? data.subjects.slice(0, 5) : [];
        if (description || genres.length > 0) {
          return {
            overview: description ? stripHtml(description) : undefined,
            genres: genres.length > 0 ? genres : undefined
          };
        }
      }
    } catch {
      // ignore
    }
  }

  return null;
}

/**
 * Fetch complete media details along with full season and episode lists.
 */
export async function fetchFullMediaDetails(
  item: Partial<MediaItem> & { externalId?: string | number; source?: MediaSource; type?: MediaType }
): Promise<FullMediaDetailsResponse> {
  const apiKey = await getTmdbApiKey();

  if (item.source === 'openlibrary' || item.source === 'googlebooks' || item.type === 'book' || item.bookFormat === 'Audiobook') {
    const totalPages = item.totalPages || 0;
    const currentPage = item.currentPage || 0;
    const totalChapters = item.totalChapters || 0;
    const currentChapter = item.currentChapter || 0;
    const totalDurationSeconds = item.totalDurationSeconds || 0;
    const currentDurationSeconds = item.currentDurationSeconds || 0;
    const isAudio = (item.bookFormat && item.bookFormat.toLowerCase().includes('audio')) ||
                    totalDurationSeconds > 0 ||
                    item.progressMode === 'time';
    const progressMode = item.progressMode || (isAudio ? 'time' : 'pages');
    const bookFormat = item.bookFormat || (isAudio ? 'Audiobook' : undefined);

    let totalEpisodes = totalPages || 1;
    let watchedEpisodesCount = currentPage;
    if (progressMode === 'chapters') {
      totalEpisodes = totalChapters || 1;
      watchedEpisodesCount = currentChapter;
    } else if (progressMode === 'time') {
      totalEpisodes = totalDurationSeconds > 0 ? Math.max(1, Math.round(totalDurationSeconds / 60)) : 1;
      watchedEpisodesCount = Math.round(currentDurationSeconds / 60);
    }

    let communityRating = item.communityRating ?? null;
    let communityRatingCount = item.communityRatingCount ?? null;
    if (communityRating == null && item.externalId && (item.source === 'openlibrary' || !item.source)) {
      try {
        const ratingsRes = await fetch(`${OPENLIBRARY_BASE_URL}/works/${item.externalId}/ratings.json`);
        if (ratingsRes.ok) {
          const rData = await ratingsRes.json();
          if (typeof rData?.summary?.average === 'number') {
            communityRating = Math.round((rData.summary.average * 2) * 10) / 10;
            communityRatingCount = typeof rData.summary.count === 'number' ? rData.summary.count : null;
          }
        }
      } catch {
        // ignore rating fetch errors
      }
    }

    let finalOverview = item.overview;
    let finalGenres = item.genres;
    const workId = item.workId || (item.source === 'openlibrary' && item.externalId ? String(item.externalId) : undefined);

    // Auto-enrich synopsis and categories if synopsis is short or placeholder (Issue #25)
    if (!finalOverview || finalOverview.startsWith('By ') || finalOverview.length < 80) {
      try {
        const enriched = await enrichBookSynopsis({
          isbn: item.isbn,
          title: item.title,
          author: item.author,
          workId
        });
        if (enriched?.overview) finalOverview = enriched.overview;
        if (enriched?.genres && (!finalGenres || finalGenres.length === 0)) finalGenres = enriched.genres;
        if (communityRating == null && enriched?.communityRating != null) {
          communityRating = enriched.communityRating;
          communityRatingCount = enriched.communityRatingCount || null;
        }
      } catch {
        // ignore enrichment error
      }
    }

    return {
      media: {
        ...item,
        type: 'book',
        source: item.source || 'openlibrary',
        overview: finalOverview,
        genres: finalGenres,
        workId: workId || item.workId,
        progressMode,
        bookFormat,
        narrator: item.narrator,
        totalDurationSeconds,
        currentDurationSeconds,
        audioPreviewUrl: item.audioPreviewUrl,
        totalSeasons: 0,
        totalEpisodes,
        totalPages,
        currentPage,
        totalChapters,
        currentChapter,
        author: item.author || '',
        watchedEpisodesCount,
        rating: item.rating ?? null,
        communityRating,
        communityRatingCount
      },
      episodes: []
    };
  }

  if (item.source === 'tmdb' && apiKey && item.externalId) {
    if (item.type === 'movie') {
      return await fetchTMDBMovieDetails(item.externalId, apiKey, item);
    } else {
      return await fetchTMDBTVDetails(item.externalId, apiKey, item);
    }
  }

  if (item.source === 'tvmaze' || item.type === 'tv') {
    return await fetchTVMazeDetails(item.externalId || item.id || '', item);
  }

  // Standalone movie without TMDB key
  return {
    media: {
      ...item,
      totalSeasons: 0,
      totalEpisodes: 1,
      watchedEpisodesCount: 0
    },
    episodes: []
  };
}

/**
 * Fetch full TV show details and episodes from TVMaze
 */
async function fetchTVMazeDetails(
  showId: string | number,
  fallbackItem: Partial<MediaItem> = {}
): Promise<FullMediaDetailsResponse> {
  const [showRes, episodesRes] = await Promise.all([
    fetch(`${TVMAZE_BASE_URL}/shows/${showId}`).catch(() => null),
    fetch(`${TVMAZE_BASE_URL}/shows/${showId}/episodes`).catch(() => null)
  ]);

  let showData: TVMazeShow | null = null;
  if (showRes && showRes.ok) {
    showData = await showRes.json();
  }

  let episodesData: TVMazeEpisode[] = [];
  if (episodesRes && episodesRes.ok) {
    episodesData = await episodesRes.json();
  }

  const cleanOverview = showData?.summary
    ? showData.summary.replace(/<[^>]*>?/gm, '')
    : fallbackItem.overview || '';

  // Process episodes
  const formattedEpisodes: Omit<EpisodeItem, 'id' | 'mediaId'>[] = episodesData.map(ep => {
    const epCleanSummary = ep.summary ? ep.summary.replace(/<[^>]*>?/gm, '') : '';
    return {
      seasonNumber: ep.season,
      episodeNumber: ep.number,
      title: ep.name || `Episode ${ep.number}`,
      overview: epCleanSummary,
      airDate: ep.airdate || '',
      airstamp: ep.airstamp || null,
      runtime: ep.runtime || null,
      stillUrl: ep.image?.medium || ep.image?.original || null,
      isWatched: 0 as WatchedStatus
    };
  });

  // Calculate highest season number
  const maxSeason = formattedEpisodes.reduce((max, ep) => Math.max(max, ep.seasonNumber), 1);
  const networkTimezone = showData?.network?.country?.timezone || showData?.webChannel?.country?.timezone || 'America/New_York';

  const communityRating = showData?.rating?.average ? Number(showData.rating.average) : (fallbackItem.communityRating ?? null);

  const media: Partial<MediaItem> = {
    ...fallbackItem,
    rating: fallbackItem.rating ?? null,
    communityRating,
    communityRatingCount: fallbackItem.communityRatingCount ?? null,
    title: showData?.name || fallbackItem.title,
    year: showData?.premiered ? new Date(showData.premiered).getFullYear() : fallbackItem.year,
    releaseDate: showData?.premiered || fallbackItem.releaseDate || '',
    overview: cleanOverview,
    posterUrl: showData?.image?.original || showData?.image?.medium || fallbackItem.posterUrl,
    backdropUrl: showData?.image?.original || fallbackItem.backdropUrl,
    type: 'tv',
    source: 'tvmaze',
    airStatus: showData?.status || fallbackItem.airStatus,
    networkTimezone: networkTimezone || fallbackItem.networkTimezone,
    schedule: showData?.schedule || fallbackItem.schedule,
    externalId: showId,
    tvmazeId: showId,
    imdbId: showData?.externals?.imdb || fallbackItem.imdbId || null,
    tmdbId: showData?.externals?.themoviedb || fallbackItem.tmdbId || null,
    thetvdbId: showData?.externals?.thetvdb || fallbackItem.thetvdbId || null,
    totalSeasons: maxSeason,
    totalEpisodes: formattedEpisodes.length,
    watchedEpisodesCount: 0,
    currentSeason: 1,
    currentEpisode: 0
  };

  return { media, episodes: formattedEpisodes };
}

/**
 * Fetch TV show details and all episodes for all seasons from TMDB
 */
async function fetchTMDBTVDetails(
  showId: string | number,
  apiKey: string,
  fallbackItem: Partial<MediaItem> = {}
): Promise<FullMediaDetailsResponse> {
  const res = await fetch(`${TMDB_BASE_URL}/tv/${showId}?api_key=${encodeURIComponent(apiKey)}&append_to_response=external_ids`);
  if (!res.ok) throw new Error('Failed to fetch TMDB TV details');
  const data: TMDBTV = await res.json();

  const regularSeasons = (data.seasons || []).filter(s => s.season_number > 0);

  // Fetch episodes for all seasons concurrently
  const seasonPromises = regularSeasons.map(async season => {
    try {
      const sRes = await fetch(`${TMDB_BASE_URL}/tv/${showId}/season/${season.season_number}?api_key=${encodeURIComponent(apiKey)}`);
      if (!sRes.ok) return [];
      const sData: TMDBSeasonDetail = await sRes.json();
      return (sData.episodes || []).map((ep): Omit<EpisodeItem, 'id' | 'mediaId'> => ({
        seasonNumber: ep.season_number,
        episodeNumber: ep.episode_number,
        title: ep.name || `Episode ${ep.episode_number}`,
        overview: ep.overview || '',
        airDate: ep.air_date || '',
        runtime: ep.runtime || null,
        stillUrl: ep.still_path ? `${TMDB_IMAGE_BASE}/w500${ep.still_path}` : null,
        isWatched: 0 as WatchedStatus
      }));
    } catch {
      return [];
    }
  });

  const seasonEpisodesArrays = await Promise.all(seasonPromises);
  const allEpisodes = seasonEpisodesArrays.flat();

  const communityRating = data.vote_average ? Number(data.vote_average.toFixed(1)) : (fallbackItem.communityRating ?? null);
  const communityRatingCount = data.vote_count || fallbackItem.communityRatingCount || null;

  const media: Partial<MediaItem> = {
    ...fallbackItem,
    rating: fallbackItem.rating ?? null,
    communityRating,
    communityRatingCount,
    title: data.name || fallbackItem.title,
    year: data.first_air_date ? new Date(data.first_air_date).getFullYear() : fallbackItem.year,
    releaseDate: data.first_air_date || fallbackItem.releaseDate || '',
    overview: data.overview || fallbackItem.overview,
    posterUrl: data.poster_path ? `${TMDB_IMAGE_BASE}/w500${data.poster_path}` : fallbackItem.posterUrl,
    backdropUrl: data.backdrop_path ? `${TMDB_IMAGE_BASE}/original${data.backdrop_path}` : fallbackItem.backdropUrl,
    type: 'tv',
    source: 'tmdb',
    airStatus: data.status || fallbackItem.airStatus,
    externalId: showId,
    tmdbId: showId,
    imdbId: (data as { external_ids?: { imdb_id?: string } })?.external_ids?.imdb_id || fallbackItem.imdbId || null,
    thetvdbId: (data as { external_ids?: { tvdb_id?: number } })?.external_ids?.tvdb_id || fallbackItem.thetvdbId || null,
    totalSeasons: regularSeasons.length || data.number_of_seasons || 1,
    totalEpisodes: allEpisodes.length || data.number_of_episodes || 0,
    watchedEpisodesCount: 0,
    currentSeason: 1,
    currentEpisode: 0
  };

  return { media, episodes: allEpisodes };
}

/**
 * Fetch Movie details from TMDB
 */
async function fetchTMDBMovieDetails(
  movieId: string | number,
  apiKey: string,
  fallbackItem: Partial<MediaItem> = {}
): Promise<FullMediaDetailsResponse> {
  const res = await fetch(`${TMDB_BASE_URL}/movie/${movieId}?api_key=${encodeURIComponent(apiKey)}&append_to_response=external_ids`);
  if (!res.ok) throw new Error('Failed to fetch TMDB movie details');
  const data: TMDBMovie = await res.json();

  const communityRating = data.vote_average ? Number(data.vote_average.toFixed(1)) : (fallbackItem.communityRating ?? null);
  const communityRatingCount = data.vote_count || fallbackItem.communityRatingCount || null;

  const belongsToCollection = (data as { belongs_to_collection?: { id: number; name: string } | null })?.belongs_to_collection;
  const collectionId = belongsToCollection?.id || fallbackItem.collectionId || null;
  const collectionName = belongsToCollection?.name || fallbackItem.collectionName || null;

  // Background cache collection info if movie belongs to a franchise
  if (belongsToCollection?.id) {
    fetchTMDBCollection(belongsToCollection.id).catch(() => {});
  }

  const media: Partial<MediaItem> = {
    ...fallbackItem,
    rating: fallbackItem.rating ?? null,
    communityRating,
    communityRatingCount,
    title: data.title || fallbackItem.title,
    year: data.release_date ? new Date(data.release_date).getFullYear() : fallbackItem.year,
    releaseDate: data.release_date || fallbackItem.releaseDate || '',
    overview: data.overview || fallbackItem.overview,
    posterUrl: data.poster_path ? `${TMDB_IMAGE_BASE}/w500${data.poster_path}` : fallbackItem.posterUrl,
    backdropUrl: data.backdrop_path ? `${TMDB_IMAGE_BASE}/original${data.backdrop_path}` : fallbackItem.backdropUrl,
    type: 'movie',
    source: 'tmdb',
    externalId: movieId,
    tmdbId: movieId,
    collectionId,
    collectionName,
    imdbId: (data as { external_ids?: { imdb_id?: string } })?.external_ids?.imdb_id || (data as { imdb_id?: string })?.imdb_id || fallbackItem.imdbId || null,
    totalSeasons: 0,
    totalEpisodes: 1,
    watchedEpisodesCount: 0,
    runtime: data.runtime || null
  };

  return { media, episodes: [] };
}

/**
 * Search TMDB for movie series / franchise collections (e.g. "Star Wars Collection", "Avengers").
 */
export async function searchTMDBCollections(query: string): Promise<TMDBCollectionSearchResult[]> {
  if (!query || !query.trim()) return [];
  const apiKey = await getTmdbApiKey();
  if (!apiKey) return [];

  try {
    const res = await fetch(
      `${TMDB_BASE_URL}/search/collection?query=${encodeURIComponent(query.trim())}&api_key=${encodeURIComponent(apiKey)}`
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.results || []).map((col: { id: number; name: string; overview?: string; poster_path?: string | null; backdrop_path?: string | null }): TMDBCollectionSearchResult => ({
      id: col.id,
      name: col.name,
      overview: col.overview || '',
      poster_path: col.poster_path ? `${TMDB_IMAGE_BASE}/w500${col.poster_path}` : null,
      backdrop_path: col.backdrop_path ? `${TMDB_IMAGE_BASE}/original${col.backdrop_path}` : null
    }));
  } catch (err) {
    console.error('searchTMDBCollections error:', err);
    return [];
  }
}

/**
 * Fetch complete movie series / collection details and all parts from TMDB (with IndexedDB offline cache).
 */
export async function fetchTMDBCollection(collectionId: number | string): Promise<TMDBCollectionDetail | null> {
  if (!collectionId) return null;
  const cached = await getFranchiseCollection(collectionId);
  const apiKey = await getTmdbApiKey();

  // If no apiKey configured, return cached if present
  if (!apiKey) {
    if (cached) {
      return {
        id: cached.id,
        name: cached.name,
        overview: cached.overview || '',
        poster_path: cached.poster_path || null,
        backdrop_path: cached.backdrop_path || null,
        parts: cached.parts || []
      };
    }
    return null;
  }

  try {
    const res = await fetch(`${TMDB_BASE_URL}/collection/${collectionId}?api_key=${encodeURIComponent(apiKey)}`);
    if (!res.ok) {
      if (cached) {
        return {
          id: cached.id,
          name: cached.name,
          overview: cached.overview || '',
          poster_path: cached.poster_path || null,
          backdrop_path: cached.backdrop_path || null,
          parts: cached.parts || []
        };
      }
      return null;
    }
    const data = await res.json();
    const parts: TMDBCollectionPart[] = (data.parts || []).map((part: {
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
    }): TMDBCollectionPart => ({
      id: part.id,
      title: part.title,
      overview: part.overview || '',
      release_date: part.release_date || '',
      poster_path: part.poster_path ? `${TMDB_IMAGE_BASE}/w500${part.poster_path}` : null,
      backdrop_path: part.backdrop_path ? `${TMDB_IMAGE_BASE}/original${part.backdrop_path}` : null,
      vote_average: part.vote_average,
      vote_count: part.vote_count,
      popularity: part.popularity,
      genre_ids: part.genre_ids,
      media_type: 'movie'
    }));

    // Sort parts chronologically by release_date
    parts.sort((a, b) => {
      if (!a.release_date) return 1;
      if (!b.release_date) return -1;
      return a.release_date.localeCompare(b.release_date);
    });

    const detail: TMDBCollectionDetail = {
      id: data.id,
      name: data.name,
      overview: data.overview || '',
      poster_path: data.poster_path ? `${TMDB_IMAGE_BASE}/w500${data.poster_path}` : null,
      backdrop_path: data.backdrop_path ? `${TMDB_IMAGE_BASE}/original${data.backdrop_path}` : null,
      parts
    };

    // Save to IndexedDB cache
    await saveFranchiseCollection(detail);

    return detail;
  } catch (err) {
    if (cached) {
      return {
        id: cached.id,
        name: cached.name,
        overview: cached.overview || '',
        poster_path: cached.poster_path || null,
        backdrop_path: cached.backdrop_path || null,
        parts: cached.parts || []
      };
    }
    console.error('fetchTMDBCollection error:', err);
    return null;
  }
}

/**
 * Convert a TMDB Collection into connected Canvas nodes and sequential edges.
 */
export function collectionToCanvasGraph(
  collection: TMDBCollectionDetail,
  existingLibrary: MediaItem[] = [],
  startPos: { x: number; y: number } = { x: 80, y: 120 }
): { nodes: CanvasNode[]; edges: CanvasEdge[] } {
  const nodes: CanvasNode[] = [];
  const edges: CanvasEdge[] = [];

  const parts = [...(collection.parts || [])].sort((a, b) => {
    if (!a.release_date) return 1;
    if (!b.release_date) return -1;
    return a.release_date.localeCompare(b.release_date);
  });

  const nodeWidth = 240;
  const nodeGapX = 100;
  const nodeGapY = 140;

  parts.forEach((part, index) => {
    const nodeId = `node_${part.id}_${Date.now()}_${index}`;
    // Check if this part matches an existing item in user library
    const matched = existingLibrary.find(
      m => (m.tmdbId && String(m.tmdbId) === String(part.id)) ||
           (m.title && part.title && m.title.trim().toLowerCase() === part.title.trim().toLowerCase())
    );

    const year = part.release_date ? new Date(part.release_date).getFullYear() : 'N/A';
    const posterUrl = part.poster_path || (matched?.posterUrl ? matched.posterUrl : null);
    const backdropUrl = part.backdrop_path || (matched?.backdropUrl ? matched.backdropUrl : null);

    const col = index % 4;
    const row = Math.floor(index / 4);
    const x = startPos.x + col * (nodeWidth + nodeGapX);
    const y = startPos.y + row * (300 + nodeGapY);

    nodes.push({
      id: nodeId,
      type: 'mediaNode',
      position: { x, y },
      data: {
        mediaId: matched?.id,
        title: part.title,
        year,
        releaseDate: part.release_date || '',
        type: 'movie',
        posterUrl,
        backdropUrl,
        status: matched?.status || 'plan_to_watch',
        rating: matched?.rating ?? null,
        communityRating: part.vote_average ? Number(part.vote_average.toFixed(1)) : (matched?.communityRating ?? null),
        source: 'tmdb',
        externalId: part.id,
        totalEpisodes: 1,
        watchedEpisodesCount: matched ? (matched.status === 'completed' ? 1 : 0) : 0,
        overview: part.overview || '',
        collectionId: collection.id,
        collectionName: collection.name
      }
    });

    // Create sequential sequel edge
    if (index > 0) {
      const prevNodeId = nodes[index - 1].id;
      edges.push({
        id: `edge_${prevNodeId}_to_${nodeId}`,
        source: prevNodeId,
        target: nodeId,
        relationType: 'sequel',
        label: 'Sequel',
        animated: false
      });
    }
  });

  return { nodes, edges };
}

/**
 * Smart Sync: Check TVMaze/TMDB for newly dropped seasons or updated episode titles,
 * and merge them into IndexedDB while strictly preserving all existing watch progress and notes.
 */
export async function syncMediaEpisodes(mediaItem: MediaItem): Promise<SyncResult> {
  if (!mediaItem || mediaItem.type !== 'tv' || !mediaItem.externalId) {
    return { hasUpdates: false, newEpisodesCount: 0, updatedTitlesCount: 0 };
  }

  try {
    const freshData = await fetchFullMediaDetails(mediaItem);
    const existingEpisodes = await getEpisodesForMedia(mediaItem.id);

    const existingMap = new Map<string, EpisodeItem>();
    for (const ep of existingEpisodes) {
      existingMap.set(`${ep.seasonNumber}_${ep.episodeNumber}`, ep);
    }

    let newEpisodesCount = 0;
    let updatedTitlesCount = 0;
    let updatedAirstampsCount = 0;

    const mergedEpisodes: EpisodeItem[] = (freshData.episodes || []).map(freshEp => {
      const key = `${freshEp.seasonNumber}_${freshEp.episodeNumber}`;
      const existing = existingMap.get(key);

      if (existing) {
        // Check if title was updated from a generic placeholder to an official title
        if (existing.title !== freshEp.title && freshEp.title && !existing.title?.startsWith('Custom')) {
          updatedTitlesCount++;
        }
        // Check if airstamp was newly populated or updated
        if (freshEp.airstamp && freshEp.airstamp !== existing.airstamp) {
          updatedAirstampsCount++;
        }
        return {
          ...freshEp,
          id: existing.id,
          mediaId: mediaItem.id,
          // Strictly retain watched state and timestamp!
          isWatched: existing.isWatched,
          watchedAt: existing.watchedAt,
          // Update title, synopsis, and airstamp if newly published
          title: freshEp.title || existing.title,
          overview: freshEp.overview || existing.overview,
          airDate: freshEp.airDate || existing.airDate,
          airstamp: freshEp.airstamp || existing.airstamp
        };
      } else {
        // Completely new episode or newly dropped season!
        newEpisodesCount++;
        return {
          ...freshEp,
          id: `${mediaItem.id}_S${freshEp.seasonNumber}E${freshEp.episodeNumber}`,
          mediaId: mediaItem.id,
          isWatched: 0 as WatchedStatus,
          watchedAt: null
        };
      }
    });

    const hasUpdates = newEpisodesCount > 0 || updatedTitlesCount > 0 || updatedAirstampsCount > 0;

    if (hasUpdates) {
      const updatedMedia: Partial<MediaItem> = {
        ...mediaItem,
        totalSeasons: freshData.media.totalSeasons || mediaItem.totalSeasons,
        totalEpisodes: mergedEpisodes.length,
        airStatus: freshData.media.airStatus || mediaItem.airStatus,
        networkTimezone: freshData.media.networkTimezone || mediaItem.networkTimezone,
        schedule: freshData.media.schedule || mediaItem.schedule,
        communityRating: freshData.media.communityRating !== undefined ? freshData.media.communityRating : mediaItem.communityRating,
        communityRatingCount: freshData.media.communityRatingCount !== undefined ? freshData.media.communityRatingCount : mediaItem.communityRatingCount,
        lastSyncedAt: new Date().toISOString()
      };
      await saveMediaItem(updatedMedia, mergedEpisodes);
    } else {
      if (
        (freshData.media.airStatus && freshData.media.airStatus !== mediaItem.airStatus) ||
        (freshData.media.networkTimezone && freshData.media.networkTimezone !== mediaItem.networkTimezone) ||
        (freshData.media.communityRating && freshData.media.communityRating !== mediaItem.communityRating)
      ) {
        await saveMediaItem({
          ...mediaItem,
          airStatus: freshData.media.airStatus || mediaItem.airStatus,
          networkTimezone: freshData.media.networkTimezone || mediaItem.networkTimezone,
          communityRating: freshData.media.communityRating || mediaItem.communityRating,
          communityRatingCount: freshData.media.communityRatingCount || mediaItem.communityRatingCount
        });
      }
      await touchMediaSyncedAt(mediaItem.id);
    }

    return {
      hasUpdates,
      newEpisodesCount,
      updatedTitlesCount,
      totalEpisodes: mergedEpisodes.length,
      mediaTitle: mediaItem.title,
      isCompletedWithNewEpisodes: ((mediaItem.status === 'completed' || mediaItem.status === 'caught_up') && newEpisodesCount > 0),
      previousStatus: mediaItem.status
    };
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.warn(`Failed to sync episodes for ${mediaItem.title}:`, err);
    return { hasUpdates: false, error: errorMessage, mediaTitle: mediaItem.title };
  }
}

export interface EligibleSyncOptions {
  forceAll?: boolean;
  cooldownDays?: number;
}

/**
 * Filter library items to find TV shows eligible for background or manual sync.
 */
export function getShowsEligibleForSync(
  items: MediaItem[],
  { forceAll = false, cooldownDays = 5 }: EligibleSyncOptions = {}
): MediaItem[] {
  const tvShows = (items || []).filter(m => m.type === 'tv' && m.externalId);
  if (forceAll) return tvShows;

  const cooldownMs = cooldownDays * 24 * 60 * 60 * 1000;
  const now = Date.now();

  return tvShows.filter(show => {
    // Dropped shows are skipped in automatic sync
    if (show.status === 'dropped') return false;

    // Active watching and caught-up shows are always eligible
    if (show.status === 'watching' || show.status === 'caught_up') return true;

    // Completed, Plan to Watch, and On Hold shows: sync if never synced or past cooldown
    if (!show.lastSyncedAt) return true;
    const lastSyncTime = new Date(show.lastSyncedAt).getTime();
    return (now - lastSyncTime) > cooldownMs;
  });
}

/**
 * Run a concurrent worker pool to sync multiple TV shows safely with rate limiting,
 * live progress reporting, and cancellation support.
 */
export async function runSyncQueue(
  shows: MediaItem[],
  options: SyncQueueOptions = {}
): Promise<SyncQueueResult> {
  const {
    concurrency = 2,
    delayMs = 250,
    onProgress,
    abortSignal
  } = options;

  let index = 0;
  let completed = 0;
  const total = shows.length;
  if (total === 0) {
    return { total: 0, completed: 0, updatedShows: [], isCancelled: false };
  }

  const updatedShows: Array<{ show: MediaItem; result: SyncResult }> = [];
  const workerCount = Math.min(concurrency || 2, total);

  const workers = Array.from({ length: workerCount }, async () => {
    while (index < total) {
      if (abortSignal?.aborted) break;

      const i = index++;
      const show = shows[i];

      let result: SyncResult | null = null;
      try {
        result = await syncMediaEpisodes(show);
        if (result?.hasUpdates && ((result.newEpisodesCount ?? 0) > 0 || (result.updatedTitlesCount ?? 0) > 0)) {
          updatedShows.push({ show, result });
        }
      } catch (err) {
        console.warn(`Sync queue error on ${show.title}:`, err);
      }

      completed++;
      if (onProgress) {
        onProgress(completed, total, show, result, abortSignal?.aborted || false);
      }

      if (delayMs > 0 && !abortSignal?.aborted) {
        await new Promise(r => setTimeout(r, delayMs));
      }
    }
  });

  await Promise.all(workers);

  return {
    total,
    completed,
    updatedShows,
    isCancelled: abortSignal?.aborted || false
  };
}
