import type { EpisodeItem, MediaItem, RuntimeDisplayFormat } from '../types';
import { isEpisodeAired } from './timezone';

/**
 * Format a duration in minutes into a readable string based on user format preference.
 *
 * @param minutes - Total duration in minutes
 * @param format - 'hours_minutes' (default) or 'days_weeks'
 * @returns Formatted duration string (e.g., '45m', '2h 15m', '3d 4h', '1w 2d 5h')
 */
export function formatRuntime(
  minutes: number | null | undefined,
  format: RuntimeDisplayFormat = 'hours_minutes'
): string {
  if (minutes === null || minutes === undefined || isNaN(minutes) || minutes < 0) {
    return '';
  }

  const rounded = Math.round(minutes);
  if (rounded === 0) return '0m';

  const totalHours = Math.floor(rounded / 60);
  const remainingMins = rounded % 60;

  if (format === 'hours_minutes' || rounded < 1440) {
    // Under 24 hours OR hours_minutes mode:
    if (totalHours === 0) return `${remainingMins}m`;
    if (remainingMins === 0) return `${totalHours}h`;
    return `${totalHours}h ${remainingMins}m`;
  }

  // Days & Weeks mode for 24+ hours (>= 1440 minutes):
  const totalDays = Math.floor(totalHours / 24);
  const remHoursInDay = totalHours % 24;

  if (totalDays >= 7) {
    const totalWeeks = Math.floor(totalDays / 7);
    const remDays = totalDays % 7;
    const parts: string[] = [`${totalWeeks}w`];
    if (remDays > 0) parts.push(`${remDays}d`);
    if (remHoursInDay > 0) parts.push(`${remHoursInDay}h`);
    if (parts.length === 1 && remainingMins > 0) parts.push(`${remainingMins}m`);
    return parts.join(' ');
  }

  // 1 to 6 days
  const parts: string[] = [`${totalDays}d`];
  if (remHoursInDay > 0) parts.push(`${remHoursInDay}h`);
  if (remainingMins > 0) parts.push(`${remainingMins}m`);
  return parts.join(' ');
}

/**
 * Calculate total runtime for an entire season by summing individual episode runtimes.
 * If individual episode runtimes are missing for some episodes, uses the show's average runtime.
 */
export function calculateSeasonRuntime(
  episodes: EpisodeItem[] | undefined | null,
  seasonNumber: number,
  fallbackAvgRuntime?: number | null
): number {
  if (!episodes || episodes.length === 0) return 0;

  const seasonEps = episodes.filter(ep => ep.seasonNumber === seasonNumber);
  if (seasonEps.length === 0) return 0;

  const knownRuntimes = seasonEps
    .map(ep => ep.runtime)
    .filter((r): r is number => typeof r === 'number' && r > 0);

  const avg = fallbackAvgRuntime && fallbackAvgRuntime > 0
    ? fallbackAvgRuntime
    : knownRuntimes.length > 0
    ? Math.round(knownRuntimes.reduce((a, b) => a + b, 0) / knownRuntimes.length)
    : 0;

  return seasonEps.reduce((total, ep) => {
    return total + (ep.runtime && ep.runtime > 0 ? ep.runtime : avg);
  }, 0);
}

/**
 * Calculate total series runtime and remaining runtime for unwatched episodes.
 */
export function calculateSeriesRuntimes(
  media: Partial<MediaItem>,
  episodes?: EpisodeItem[] | null
): { remainingMinutes: number; totalMinutes: number } {
  if (media.type !== 'tv') {
    const movieRuntime = media.runtime || 0;
    const isCompleted = media.status === 'completed';
    return {
      totalMinutes: movieRuntime,
      remainingMinutes: isCompleted ? 0 : movieRuntime
    };
  }

  // Determine average runtime per episode
  let avgRuntime = media.runtime && media.runtime > 0 ? media.runtime : 0;

  if (episodes && episodes.length > 0) {
    const knownRuntimes = episodes
      .map(ep => ep.runtime)
      .filter((r): r is number => typeof r === 'number' && r > 0);

    if (knownRuntimes.length > 0 && avgRuntime === 0) {
      avgRuntime = Math.round(knownRuntimes.reduce((a, b) => a + b, 0) / knownRuntimes.length);
    }

    const totalMinutes = episodes.reduce((acc, ep) => {
      return acc + (ep.runtime && ep.runtime > 0 ? ep.runtime : avgRuntime);
    }, 0);

    if (media.status === 'completed' || media.status === 'caught_up') {
      return { remainingMinutes: 0, totalMinutes };
    }

    // Only count unwatched episodes whose air date has already passed
    const networkTz = media.networkTimezone || 'America/New_York';
    const unwatchedAired = episodes.filter(ep => ep.isWatched !== 1 && isEpisodeAired(ep, networkTz));
    const remainingMinutes = unwatchedAired.reduce((acc, ep) => {
      return acc + (ep.runtime && ep.runtime > 0 ? ep.runtime : avgRuntime);
    }, 0);

    return { remainingMinutes, totalMinutes };
  }

  // Fallback when episodes array is not directly provided
  const totalEps = media.totalEpisodes || 0;
  const airedEps = (media.airedEpisodesCount !== undefined && media.airedEpisodesCount !== null)
    ? media.airedEpisodesCount
    : totalEps;
  const watchedEps = media.watchedEpisodesCount || 0;
  const totalMinutes = totalEps * avgRuntime;

  if (media.status === 'completed' || media.status === 'caught_up' || (airedEps > 0 && watchedEps >= airedEps)) {
    return { remainingMinutes: 0, totalMinutes };
  }

  const remainingEps = Math.max(0, airedEps - watchedEps);
  const remainingMinutes = remainingEps * avgRuntime;

  return { remainingMinutes, totalMinutes };
}

/**
 * Determine whether a TV series currently has an in-progress season actively releasing episodes
 * (i.e. Episode 1 of the season with future episodes has already aired).
 *
 * When true, the current season is in progress, so the progress bar and percentage should measure
 * against total episodes to visually indicate the active season in progress.
 * When false (e.g. awaiting an un-aired season premiere like S4E1), progress measures against
 * already-aired episodes so the user is marked 100% completed on all released content.
 */
export function isSeasonActivelyAiring(
  media: Partial<MediaItem>,
  episodes?: EpisodeItem[] | null
): boolean {
  if (media.type !== 'tv') return false;

  const totalEps = media.totalEpisodes || 0;
  const airedEps = media.airedEpisodesCount !== undefined && media.airedEpisodesCount !== null
    ? media.airedEpisodesCount
    : (episodes ? episodes.filter(e => isEpisodeAired(e, media.networkTimezone || 'America/New_York')).length : totalEps);

  // If all known episodes have already aired, the season is not actively releasing
  if (airedEps >= totalEps) return false;

  // If episodes array is available, inspect the earliest un-aired episode
  if (episodes && episodes.length > 0) {
    const networkTz = media.networkTimezone || 'America/New_York';
    const futureEps = episodes.filter(e => !isEpisodeAired(e, networkTz));
    if (futureEps.length === 0) return false;

    // Check if the future episode's season has already premiered (episode 1 of that season has aired)
    const nextEp = futureEps.sort((a, b) => a.seasonNumber - b.seasonNumber || a.episodeNumber - b.episodeNumber)[0];
    const s1Aired = episodes.some(e => e.seasonNumber === nextEp.seasonNumber && e.episodeNumber === 1 && isEpisodeAired(e, networkTz));
    return s1Aired || nextEp.episodeNumber > 1;
  }

  // Fallback to media item metadata (nextEpisodeNumber > 1 means season premiere already aired)
  return Boolean(media.nextEpisodeNumber && media.nextEpisodeNumber > 1);
}
