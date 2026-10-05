import { getSetting } from '../db';
import type { WatchProvider, MediaItem } from '../types';

export interface RegionOption {
  code: string;
  name: string;
  flag: string;
}

export const STREAMING_REGIONS: RegionOption[] = [
  { code: 'US', name: 'United States', flag: '🇺🇸' },
  { code: 'GB', name: 'United Kingdom', flag: '🇬🇧' },
  { code: 'CA', name: 'Canada', flag: '🇨🇦' },
  { code: 'AU', name: 'Australia', flag: '🇦🇺' },
  { code: 'DE', name: 'Germany', flag: '🇩🇪' },
  { code: 'FR', name: 'France', flag: '🇫🇷' },
  { code: 'IT', name: 'Italy', flag: '🇮🇹' },
  { code: 'ES', name: 'Spain', flag: '🇪🇸' },
  { code: 'JP', name: 'Japan', flag: '🇯🇵' },
  { code: 'KR', name: 'South Korea', flag: '🇰🇷' },
  { code: 'IN', name: 'India', flag: '🇮🇳' },
  { code: 'BR', name: 'Brazil', flag: '🇧🇷' },
  { code: 'MX', name: 'Mexico', flag: '🇲🇽' },
  { code: 'NL', name: 'Netherlands', flag: '🇳🇱' },
  { code: 'SE', name: 'Sweden', flag: '🇸🇪' },
  { code: 'NZ', name: 'New Zealand', flag: '🇳🇿' },
];

/**
 * Detects default 2-letter uppercase ISO country code from browser locale.
 * Defaults to 'US' if indeterminable.
 */
export function getBrowserRegion(): string {
  try {
    if (typeof navigator !== 'undefined' && navigator.language) {
      const parts = navigator.language.split('-');
      if (parts.length > 1 && parts[1].length === 2) {
        return parts[1].toUpperCase();
      }
    }
  } catch {
    // Fallback if navigator is unavailable
  }
  return 'US';
}

/**
 * Retrieves the effective streaming region (user setting or browser locale fallback).
 */
export async function getEffectiveStreamingRegion(): Promise<string> {
  try {
    const saved = await getSetting<string>('streaming_region', 'auto');
    if (saved && saved !== 'auto') {
      return saved.toUpperCase();
    }
  } catch {
    // Dexie might be uninitialized in some test environments
  }
  return getBrowserRegion();
}

export interface ParsedReleaseDates {
  theatricalReleaseDate: string | null;
  digitalReleaseDate: string | null;
}

interface TMDBReleaseDateItem {
  certification?: string;
  note?: string;
  release_date: string;
  type: number; // 1: Premiere, 2: Theatrical (Ltd), 3: Theatrical, 4: Digital, 5: Physical, 6: TV
}

interface TMDBCountryReleaseDates {
  iso_3166_1: string;
  release_dates: TMDBReleaseDateItem[];
}

/**
 * Parses TMDB movie `release_dates` payload for a given target region.
 * Type 3/2 -> Theatrical release
 * Type 4 -> Digital / Streaming drop date
 */
export function parseTMDBReleaseDates(
  results: TMDBCountryReleaseDates[] | undefined | null,
  targetRegion: string = 'US'
): ParsedReleaseDates {
  if (!results || !Array.isArray(results) || results.length === 0) {
    return { theatricalReleaseDate: null, digitalReleaseDate: null };
  }

  const regionUpper = targetRegion.toUpperCase();
  // Find country matching targetRegion, or fallback to US, or fallback to first available
  const countryEntry =
    results.find(r => r.iso_3166_1?.toUpperCase() === regionUpper) ||
    results.find(r => r.iso_3166_1?.toUpperCase() === 'US') ||
    results[0];

  if (!countryEntry || !countryEntry.release_dates || countryEntry.release_dates.length === 0) {
    return { theatricalReleaseDate: null, digitalReleaseDate: null };
  }

  const dates = countryEntry.release_dates;

  // Find theatrical release dates (Type 3 preferred, then Type 2, then Type 1)
  const theatricalEntries = dates
    .filter(d => d.type === 3 || d.type === 2 || d.type === 1)
    .sort((a, b) => a.release_date.localeCompare(b.release_date));

  let theatricalReleaseDate: string | null = null;
  if (theatricalEntries.length > 0) {
    // Extract YYYY-MM-DD
    theatricalReleaseDate = theatricalEntries[0].release_date.split('T')[0];
  }

  // Find digital release dates (Type 4)
  const digitalEntries = dates
    .filter(d => d.type === 4)
    .sort((a, b) => a.release_date.localeCompare(b.release_date));

  let digitalReleaseDate: string | null = null;
  if (digitalEntries.length > 0) {
    digitalReleaseDate = digitalEntries[0].release_date.split('T')[0];
  }

  return { theatricalReleaseDate, digitalReleaseDate };
}

interface TMDBProviderRaw {
  provider_id: number;
  provider_name: string;
  logo_path?: string;
  display_priority?: number;
}

interface TMDBWatchProvidersCountry {
  flatrate?: TMDBProviderRaw[];
  free?: TMDBProviderRaw[];
  ads?: TMDBProviderRaw[];
  rent?: TMDBProviderRaw[];
  buy?: TMDBProviderRaw[];
}

/**
 * Parses TMDB `watch/providers` payload for subscription/flatrate streaming platforms.
 */
export function parseTMDBWatchProviders(
  results: Record<string, TMDBWatchProvidersCountry> | undefined | null,
  targetRegion: string = 'US'
): WatchProvider[] {
  if (!results || typeof results !== 'object') return [];

  const regionUpper = targetRegion.toUpperCase();
  const countryData = results[regionUpper] || results['US'] || Object.values(results)[0];

  if (!countryData) return [];

  const providers: WatchProvider[] = [];
  const seenIds = new Set<number>();

  // Prioritize flatrate (subscription streaming), then free
  const rawList = [...(countryData.flatrate || []), ...(countryData.free || [])];

  for (const raw of rawList) {
    if (!raw.provider_id || seenIds.has(raw.provider_id)) continue;
    seenIds.add(raw.provider_id);
    providers.push({
      id: raw.provider_id,
      name: raw.provider_name,
      logoUrl: raw.logo_path ? `https://image.tmdb.org/t/p/w92${raw.logo_path}` : undefined,
      type: 'flatrate'
    });
  }

  return providers;
}

export type MovieStreamingState =
  | 'streaming'          // Available right now on subscription streaming
  | 'digital_upcoming'    // Theatrical passed, digital drop date is scheduled & upcoming
  | 'in_theaters'        // Released theatrically, not yet available or scheduled on streaming
  | 'theaters_upcoming'  // Unreleased even in theaters
  | 'released'           // Released in the past, no streaming provider recorded
  | 'unknown';

export interface MovieStreamingStatus {
  state: MovieStreamingState;
  badgeLabel: string;
  badgeDetail?: string;
  countdownDays?: number;
  primaryProvider?: WatchProvider;
  providers: WatchProvider[];
  theatricalDate?: Date | null;
  digitalDate?: Date | null;
}

/**
 * Computes human-friendly movie release and streaming availability status.
 */
export function getMovieStreamingStatus(
  item: Partial<MediaItem>,
  now: Date = new Date()
): MovieStreamingStatus {
  const providers = item.streamingProviders || [];
  const primaryProvider = providers.length > 0 ? providers[0] : undefined;

  // 1. If currently available on subscription streaming
  if (providers.length > 0) {
    const extra = providers.length > 1 ? ` +${providers.length - 1}` : '';
    return {
      state: 'streaming',
      badgeLabel: `Streaming on ${primaryProvider!.name}${extra}`,
      badgeDetail: providers.map(p => p.name).join(', '),
      primaryProvider,
      providers
    };
  }

  // Parse dates
  let theatricalDate: Date | null = null;
  const rawTheatrical = item.theatricalReleaseDate || item.releaseDate;
  if (rawTheatrical) {
    const d = new Date(rawTheatrical);
    if (!isNaN(d.getTime())) theatricalDate = d;
  }

  let digitalDate: Date | null = null;
  if (item.digitalReleaseDate) {
    const d = new Date(item.digitalReleaseDate);
    if (!isNaN(d.getTime())) digitalDate = d;
  }

  const nowDateOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // 2. If digital / streaming drop date is announced and in the future
  if (digitalDate) {
    const digDateOnly = new Date(digitalDate.getFullYear(), digitalDate.getMonth(), digitalDate.getDate());
    const diffMs = digDateOnly.getTime() - nowDateOnly.getTime();
    const daysUntilDigital = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (daysUntilDigital > 0) {
      const dropLabel =
        daysUntilDigital === 1
          ? 'drops tomorrow'
          : `drops in ${daysUntilDigital}d`;
      return {
        state: 'digital_upcoming',
        badgeLabel: `Digital ${dropLabel}`,
        badgeDetail: `Available on digital ${digitalDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`,
        countdownDays: daysUntilDigital,
        providers,
        theatricalDate,
        digitalDate
      };
    } else {
      // Digital date is today or in the past
      return {
        state: 'streaming',
        badgeLabel: 'Available on Digital',
        badgeDetail: `Released on digital ${digitalDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`,
        providers,
        theatricalDate,
        digitalDate
      };
    }
  }

  // 3. Theatrical evaluation
  if (theatricalDate) {
    const theatDateOnly = new Date(theatricalDate.getFullYear(), theatricalDate.getMonth(), theatricalDate.getDate());
    const diffMs = theatDateOnly.getTime() - nowDateOnly.getTime();
    const daysUntilTheatrical = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (daysUntilTheatrical > 0) {
      const dropLabel =
        daysUntilTheatrical === 1
          ? 'in theaters tomorrow'
          : `in theaters in ${daysUntilTheatrical}d`;
      return {
        state: 'theaters_upcoming',
        badgeLabel: dropLabel,
        badgeDetail: `Theatrical release ${theatricalDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`,
        countdownDays: daysUntilTheatrical,
        providers,
        theatricalDate,
        digitalDate
      };
    }

    // Theatrical was in the past (e.g. within last 90-120 days or older)
    // If theatrical was within last 120 days, it's typically "In Theaters"
    const daysSinceTheatrical = Math.abs(daysUntilTheatrical);
    if (daysSinceTheatrical <= 120) {
      return {
        state: 'in_theaters',
        badgeLabel: 'In Theaters',
        badgeDetail: `Released in theaters ${theatricalDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}. Streaming date TBA.`,
        providers,
        theatricalDate,
        digitalDate
      };
    }

    return {
      state: 'released',
      badgeLabel: `Released (${theatricalDate.getFullYear()})`,
      providers,
      theatricalDate,
      digitalDate
    };
  }

  return {
    state: 'unknown',
    badgeLabel: 'No release data',
    providers
  };
}
