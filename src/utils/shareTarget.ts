export interface ParsedShareTarget {
  query: string;
  mediaType: 'all' | 'movie' | 'tv' | 'book' | 'audiobook';
  imdbId?: string;
  tmdbId?: number;
  rawUrl?: string;
}

const SHARE_PARAM_KEYS = ['share_title', 'share_text', 'share_url'] as const;

const GENERIC_SITE_TITLES = new Set([
  'imdb',
  'letterboxd',
  'tmdb',
  'the movie database',
  'goodreads',
  'open library',
  'tvmaze',
  'trakt',
  'apple tv',
  'apple books',
  'netflix',
  'bingelog'
]);

function humanizeSlug(slug: string): string {
  return decodeURIComponent(slug)
    .replace(/^[\d]+[-._]/, '') // strip leading numeric ID like "693134-dune-part-two" or "44767458.Dune"
    .replace(/[-_]+/g, ' ')
    .replace(/\b(19\d{2}|20\d{2})\b$/, '') // strip trailing year on trakt slugs like "dune-part-two-2024"
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b[a-z]/g, ch => ch.toUpperCase());
}

function cleanSharedTitleText(raw: string): string {
  let text = raw
    // Remove invisible directional formatting characters (e.g. Letterboxd iOS shares include \u200e)
    .replace(/[\u200B-\u200F\u202A-\u202E\uFEFF]/g, '')
    // Strip embedded URLs
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!text) return '';

  // Unwrap common mobile share phrases: "Check out Dune: Part Two on IMDb" or "Watch Severance on Apple TV+"
  text = text
    .replace(/^(?:check\s+out|watch|read|listening\s+to)\s+["“]?(.+?)["”]?(?:\s+on\s+(?:imdb|letterboxd|tmdb|goodreads|apple\s*tv\+?|netflix|max|disney\+|prime\s*video|hulu))?$/i, '$1')
    .trim();

  // Letterboxd pattern: "Dune: Part Two (2024) directed by Denis Villeneuve • Reviews, film + cast • Letterboxd"
  text = text.replace(/\s+directed\s+by\s+.+$/i, '');

  // Strip site branding suffixes separated by -, —, |, or •
  text = text.replace(
    /\s*(?:[-–—|•·])\s*(?:IMDb|Letterboxd|The Movie Database(?:\s*\(TMDB\))?|TMDB|Goodreads|Open Library|TVMaze|Trakt|Apple\s*TV\+?|Apple\s*Books|Netflix(?:\s+Official\s+Site)?).*$/i,
    ''
  );

  // Goodreads pattern: "Project Hail Mary by Andy Weir"
  text = text.replace(/\s+by\s+[A-Z][A-Za-z.\s'-]{2,40}$/, '');

  // IMDb parenthetical suffixes: "(TV Series 2008–2013)", "(TV Mini Series 2019)", "(2024)"
  text = text.replace(/\s*\((?:TV\s+(?:Mini\s+)?Series\s+)?(?:19\d{2}|20\d{2})(?:[–-](?:19\d{2}|20\d{2}|\s*))?\)\s*$/i, '');

  // Strip surrounding quotes if present
  text = text.replace(/^["“']+|["”']+$/g, '').trim();

  if (GENERIC_SITE_TITLES.has(text.toLowerCase())) {
    return '';
  }

  return text;
}

function parseMediaUrl(urlStr: string): {
  slugTitle?: string;
  imdbId?: string;
  tmdbId?: number;
  mediaType?: 'movie' | 'tv' | 'book' | 'audiobook';
} {
  const result: {
    slugTitle?: string;
    imdbId?: string;
    tmdbId?: number;
    mediaType?: 'movie' | 'tv' | 'book' | 'audiobook';
  } = {};

  // Check for IMDb title ID anywhere in the URL
  const imdbMatch = urlStr.match(/\b(tt\d{5,10})\b/i);
  if (imdbMatch) {
    result.imdbId = imdbMatch[1].toLowerCase();
  }

  let parsed: URL;
  try {
    parsed = new URL(urlStr);
  } catch {
    return result;
  }

  const host = parsed.hostname.toLowerCase().replace(/^www\.|^m\./, '');
  const pathname = parsed.pathname;

  // TMDB: /movie/693134-dune-part-two or /tv/1396-breaking-bad
  if (host === 'themoviedb.org') {
    const tmdbMatch = pathname.match(/^\/(movie|tv)\/(\d+)(?:[-/]([^/?#]+))?/i);
    if (tmdbMatch) {
      result.mediaType = tmdbMatch[1].toLowerCase() === 'tv' ? 'tv' : 'movie';
      result.tmdbId = Number(tmdbMatch[2]);
      if (tmdbMatch[3]) {
        result.slugTitle = humanizeSlug(tmdbMatch[3]);
      }
    }
  }

  // Letterboxd: /film/dune-part-two/
  if (host === 'letterboxd.com') {
    const lbMatch = pathname.match(/\/film\/([^/?#]+)/i);
    if (lbMatch) {
      result.mediaType = 'movie';
      result.slugTitle = humanizeSlug(lbMatch[1]);
    }
  }

  // Goodreads: /book/show/44767458-dune or /book/show/44767458.Dune
  if (host === 'goodreads.com') {
    result.mediaType = 'book';
    const grMatch = pathname.match(/\/book\/show\/\d+[-._]([^/?#]+)/i);
    if (grMatch) {
      result.slugTitle = humanizeSlug(grMatch[1]);
    }
  }

  // Open Library: /works/OL82563W/Dune or /books/OL.../Dune
  if (host === 'openlibrary.org') {
    result.mediaType = 'book';
    const olMatch = pathname.match(/\/(?:works|books)\/OL\d+[WM]\/([^/?#]+)/i);
    if (olMatch) {
      result.slugTitle = humanizeSlug(olMatch[1]);
    }
  }

  // TVMaze: /shows/169/breaking-bad
  if (host === 'tvmaze.com') {
    result.mediaType = 'tv';
    const tvmMatch = pathname.match(/\/shows\/\d+\/([^/?#]+)/i);
    if (tvmMatch) {
      result.slugTitle = humanizeSlug(tvmMatch[1]);
    }
  }

  // Trakt: /movies/dune-part-two-2024 or /shows/severance
  if (host === 'trakt.tv') {
    const traktMatch = pathname.match(/^\/(movies|shows)\/([^/?#]+)/i);
    if (traktMatch) {
      result.mediaType = traktMatch[1].toLowerCase() === 'shows' ? 'tv' : 'movie';
      result.slugTitle = humanizeSlug(traktMatch[2]);
    }
  }

  return result;
}

/**
 * Extracts a clean media search query and optional metadata from Web Share Target query parameters.
 */
export function parseShareTargetParams(
  input: string | URLSearchParams | Record<string, string | null | undefined>
): ParsedShareTarget | null {
  let params: URLSearchParams;
  if (typeof input === 'string') {
    params = new URLSearchParams(input.startsWith('?') ? input.slice(1) : input);
  } else if (input instanceof URLSearchParams) {
    params = input;
  } else {
    params = new URLSearchParams();
    for (const [k, v] of Object.entries(input || {})) {
      if (typeof v === 'string') params.set(k, v);
    }
  }

  const hasShareKey = SHARE_PARAM_KEYS.some(key => params.has(key));
  if (!hasShareKey) return null;

  const rawTitle = (params.get('share_title') || '').trim();
  const rawText = (params.get('share_text') || '').trim();
  const rawUrlParam = (params.get('share_url') || '').trim();

  if (!rawTitle && !rawText && !rawUrlParam) {
    return null;
  }

  // Find URL from share_url or embedded in share_text / share_title
  const embeddedUrlMatch = (rawUrlParam || rawText || rawTitle).match(/https?:\/\/\S+/i);
  const effectiveUrl = rawUrlParam || (embeddedUrlMatch ? embeddedUrlMatch[0] : '');

  const urlInfo = effectiveUrl ? parseMediaUrl(effectiveUrl) : {};

  // Also check if an IMDb ID is directly in share_text or share_title
  const textImdbMatch = `${rawTitle} ${rawText}`.match(/\b(tt\d{5,10})\b/i);
  const imdbId = urlInfo.imdbId || (textImdbMatch ? textImdbMatch[1].toLowerCase() : undefined);

  const cleanedTitle = cleanSharedTitleText(rawTitle);
  const cleanedText = cleanSharedTitleText(rawText);

  // Pick the most descriptive query:
  // 1. Cleaned share_title (unless it's just an IMDb ID when a slug title exists)
  // 2. URL slug title (from TMDB, Letterboxd, Goodreads, Open Library, TVMaze, Trakt)
  // 3. Cleaned share_text
  // 4. IMDb ID (tt\d+) or TMDB ID
  let query = '';
  if (cleanedTitle && !/^tt\d+$/i.test(cleanedTitle)) {
    query = cleanedTitle;
  } else if (urlInfo.slugTitle) {
    query = urlInfo.slugTitle;
  } else if (cleanedText && !/^tt\d+$/i.test(cleanedText)) {
    query = cleanedText;
  } else if (imdbId) {
    query = imdbId;
  } else if (cleanedTitle) {
    query = cleanedTitle;
  } else if (cleanedText) {
    query = cleanedText;
  } else if (urlInfo.tmdbId) {
    query = String(urlInfo.tmdbId);
  }

  if (!query) return null;

  return {
    query,
    mediaType: urlInfo.mediaType || 'all',
    ...(imdbId ? { imdbId } : {}),
    ...(urlInfo.tmdbId ? { tmdbId: urlInfo.tmdbId } : {}),
    ...(effectiveUrl ? { rawUrl: effectiveUrl } : {})
  };
}

/**
 * Scrubs share_title, share_text, and share_url from a URL string and returns the relative path + remaining search + hash.
 */
export function scrubShareParamsFromUrl(href: string): string {
  try {
    const url = new URL(href, 'https://bingelog.local');
    for (const key of SHARE_PARAM_KEYS) {
      url.searchParams.delete(key);
    }
    const search = url.searchParams.toString();
    return `${url.pathname}${search ? `?${search}` : ''}${url.hash || ''}`;
  } catch {
    return '/';
  }
}

/**
 * Inspects window.location.search for Web Share Target parameters, scrubs them via history.replaceState,
 * and returns the parsed share payload if present.
 */
export function consumeShareTargetFromWindow(win: Window = window): ParsedShareTarget | null {
  if (!win || !win.location) return null;
  const parsed = parseShareTargetParams(win.location.search);
  const hasShareParams = SHARE_PARAM_KEYS.some(k => new URLSearchParams(win.location.search).has(k));
  if (hasShareParams && win.history && typeof win.history.replaceState === 'function') {
    const cleanUrl = scrubShareParamsFromUrl(win.location.href);
    win.history.replaceState({}, win.document?.title || 'BingeLog', cleanUrl);
  }
  return parsed;
}
