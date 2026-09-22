import type { MediaItem, UpcomingFilter } from '../types';

/**
 * Extracts a comparable Date object from media release or premiere date.
 */
export function getItemReleaseDate(item: MediaItem): Date | null {
  if (item.releaseDate) {
    const d = new Date(item.releaseDate);
    if (!isNaN(d.getTime())) return d;
  }
  const y = parseInt(String(item.year), 10);
  if (!isNaN(y) && y > 1800) {
    return new Date(`${y}-01-01`);
  }
  return null;
}

/**
 * Determines whether a media item is an upcoming unreleased title.
 */
export function isItemUpcoming(item: MediaItem, now: Date = new Date()): { isUpcoming: boolean; releaseDate: Date | null } {
  // If user completed it, it's not upcoming
  if (item.status === 'completed') {
    return { isUpcoming: false, releaseDate: null };
  }

  // If TV show has already aired episodes in the past, the show itself is not an upcoming release
  if (item.type === 'tv' && item.watchedEpisodesCount && item.watchedEpisodesCount > 0) {
    return { isUpcoming: false, releaseDate: null };
  }

  if (item.type === 'tv' && item.lastAiredDate) {
    const lastAired = new Date(item.lastAiredDate);
    if (!isNaN(lastAired.getTime()) && lastAired.getTime() <= now.getTime()) {
      return { isUpcoming: false, releaseDate: lastAired };
    }
  }

  const relDate = getItemReleaseDate(item);
  if (relDate && relDate.getTime() > now.getTime()) {
    return { isUpcoming: true, releaseDate: relDate };
  }

  return { isUpcoming: false, releaseDate: relDate };
}

/**
 * Checks whether an item should be included based on active upcoming filter tier.
 */
export function shouldShowItemForUpcomingFilter(
  item: MediaItem,
  filter: UpcomingFilter = 'show_all',
  windowDays: number = 7,
  now: Date = new Date()
): boolean {
  if (filter === 'show_all') return true;

  const { isUpcoming, releaseDate } = isItemUpcoming(item, now);
  if (!isUpcoming) return true;

  // It is upcoming
  if (filter === 'hide_all') {
    return false;
  }

  if (filter === 'next_n_days') {
    if (!releaseDate) return false;
    const windowEnd = new Date(now.getTime() + windowDays * 24 * 60 * 60 * 1000);
    return releaseDate.getTime() <= windowEnd.getTime();
  }

  return true;
}
