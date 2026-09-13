import { getSetting, setSetting } from '../db';

/**
 * Common IANA timezones curated for quick selection.
 */
export interface TimeZoneOption {
  value: string;
  label: string;
  region: string;
}

export const COMMON_TIMEZONES: TimeZoneOption[] = [
  // Australia & New Zealand
  { value: 'Australia/Sydney', label: 'Sydney, Melbourne, Canberra (AEST/AEDT)', region: 'Australia' },
  { value: 'Australia/Brisbane', label: 'Brisbane (AEST, No DST)', region: 'Australia' },
  { value: 'Australia/Adelaide', label: 'Adelaide (ACST/ACDT)', region: 'Australia' },
  { value: 'Australia/Perth', label: 'Perth (AWST)', region: 'Australia' },
  { value: 'Australia/Darwin', label: 'Darwin (ACST)', region: 'Australia' },
  { value: 'Pacific/Auckland', label: 'Auckland, Wellington (NZST/NZDT)', region: 'Pacific' },

  // Americas
  { value: 'America/New_York', label: 'New York, Toronto, Miami (Eastern Time)', region: 'North America' },
  { value: 'America/Chicago', label: 'Chicago, Dallas, Houston (Central Time)', region: 'North America' },
  { value: 'America/Denver', label: 'Denver, Phoenix, Calgary (Mountain Time)', region: 'North America' },
  { value: 'America/Los_Angeles', label: 'Los Angeles, Vancouver, Seattle (Pacific Time)', region: 'North America' },
  { value: 'America/Anchorage', label: 'Anchorage (Alaska Time)', region: 'North America' },
  { value: 'Pacific/Honolulu', label: 'Honolulu (Hawaii Time)', region: 'North America' },
  { value: 'America/Sao_Paulo', label: 'São Paulo, Rio de Janeiro (BRT)', region: 'South America' },

  // Europe & UK
  { value: 'Europe/London', label: 'London, Dublin, Edinburgh (GMT/BST)', region: 'Europe' },
  { value: 'Europe/Paris', label: 'Paris, Berlin, Rome, Madrid, Amsterdam (CET/CEST)', region: 'Europe' },
  { value: 'Europe/Athens', label: 'Athens, Helsinki, Bucharest (EET/EEST)', region: 'Europe' },

  // Asia
  { value: 'Asia/Tokyo', label: 'Tokyo, Osaka (JST)', region: 'Asia' },
  { value: 'Asia/Seoul', label: 'Seoul (KST)', region: 'Asia' },
  { value: 'Asia/Singapore', label: 'Singapore, Kuala Lumpur (SGT)', region: 'Asia' },
  { value: 'Asia/Hong_Kong', label: 'Hong Kong (HKT)', region: 'Asia' },
  { value: 'Asia/Kolkata', label: 'Mumbai, New Delhi, Kolkata (IST)', region: 'Asia' },
  { value: 'Asia/Dubai', label: 'Dubai (GST)', region: 'Asia' }
];

/**
 * Get the system detected browser timezone.
 */
export function getSystemTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/**
 * Get active user timezone from IndexedDB or fallback to browser system timezone.
 */
export async function getUserTimeZone(): Promise<string> {
  const saved = await getSetting<string>('user_timezone', '');
  return saved && saved.trim() ? saved.trim() : getSystemTimeZone();
}

/**
 * Set and persist user preferred timezone.
 */
export async function setUserTimeZone(tz: string): Promise<void> {
  await setSetting('user_timezone', tz);
}

/**
 * Determine whether an episode has officially aired, with DST awareness and timezone conversion.
 */
export function isEpisodeAired(
  episode: { airDate?: string; airstamp?: string | null },
  networkTz: string = 'America/New_York'
): boolean {
  const now = Date.now();

  // 1. Direct UTC timestamp comparison
  if (episode.airstamp) {
    const dropTime = new Date(episode.airstamp).getTime();
    if (!Number.isNaN(dropTime)) {
      return now >= dropTime;
    }
  }

  // 2. Air date fallback (YYYY-MM-DD)
  if (!episode.airDate) {
    return true; // Assume aired if no air date is recorded
  }

  try {
    const [yearStr, monthStr, dayStr] = episode.airDate.split('-');
    const year = Number(yearStr);
    const month = Number(monthStr);
    const day = Number(dayStr);

    if (!year || !month || !day) return true;

    // Use Date.UTC approximation then adjust for origin timezone offset
    // Most US prime-time broadcast drops occur at 20:00 (8:00 PM)
    const approxUtcDrop = Date.UTC(year, month - 1, day, 20, 0, 0);

    const testDate = new Date(approxUtcDrop);
    const originFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: networkTz,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hour12: false
    });

    const parts = originFormatter.formatToParts(testDate);
    const originHour = Number(parts.find(p => p.type === 'hour')?.value || 20);
    const hourDiff = 20 - originHour;
    const exactDropTime = approxUtcDrop + hourDiff * 60 * 60 * 1000;

    return now >= exactDropTime;
  } catch {
    const todayIso = new Date().toISOString().slice(0, 10);
    return episode.airDate <= todayIso;
  }
}

/**
 * Format an episode release date/time in the user's localized timezone.
 */
export function formatEpisodeAirDate(
  airDate?: string,
  airstamp?: string | null,
  userTimeZone?: string,
  networkTz: string = 'America/New_York'
): string {
  const tz = userTimeZone || getSystemTimeZone();

  if (airstamp) {
    const d = new Date(airstamp);
    if (!Number.isNaN(d.getTime())) {
      try {
        return new Intl.DateTimeFormat('en-US', {
          timeZone: tz,
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          timeZoneName: 'short'
        }).format(d);
      } catch {
        return d.toLocaleString();
      }
    }
  }

  if (airDate) {
    try {
      const [year, month, day] = airDate.split('-').map(Number);
      if (year && month && day) {
        const utcGuess = Date.UTC(year, month - 1, day, 20, 0, 0);
        return new Intl.DateTimeFormat('en-US', {
          timeZone: tz,
          weekday: 'short',
          month: 'short',
          day: 'numeric'
        }).format(new Date(utcGuess));
      }
    } catch {
      return airDate;
    }
    return airDate;
  }

  return 'TBA';
}

/**
 * Get humanized countdown string for an upcoming un-aired episode.
 */
export function getEpisodeCountdown(
  airDate?: string,
  airstamp?: string | null,
  networkTz: string = 'America/New_York'
): { isAired: boolean; label: string; hoursRemaining: number } {
  let dropTimestamp: number | null = null;

  if (airstamp) {
    const t = new Date(airstamp).getTime();
    if (!Number.isNaN(t)) dropTimestamp = t;
  }

  if (dropTimestamp === null && airDate) {
    const [year, month, day] = airDate.split('-').map(Number);
    if (year && month && day) {
      dropTimestamp = Date.UTC(year, month - 1, day, 20, 0, 0);
    }
  }

  if (dropTimestamp === null) {
    return { isAired: true, label: '', hoursRemaining: 0 };
  }

  const now = Date.now();
  const diffMs = dropTimestamp - now;

  if (diffMs <= 0) {
    return { isAired: true, label: 'Aired', hoursRemaining: 0 };
  }

  const totalHours = Math.floor(diffMs / (1000 * 60 * 60));
  const days = Math.floor(totalHours / 24);
  const remainingHours = totalHours % 24;

  let label = '';
  if (days > 1) {
    label = `in ${days} days`;
  } else if (days === 1) {
    label = `in 1 day ${remainingHours}h`;
  } else if (totalHours > 0) {
    label = `in ${totalHours}h`;
  } else {
    const minutes = Math.max(1, Math.floor(diffMs / (1000 * 60)));
    label = `in ${minutes}m`;
  }

  return { isAired: false, label, hoursRemaining: totalHours };
}
