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
 * Compute the UTC drop timestamp (ms) for an episode, using `airstamp` when available
 * or falling back to 20:00 in `networkTz` for date-only `airDate` strings.
 */
export function getEpisodeDropTimestamp(
  airDate?: string,
  airstamp?: string | null,
  networkTz: string = 'America/New_York'
): number | null {
  if (airstamp) {
    const dropTime = new Date(airstamp).getTime();
    if (!Number.isNaN(dropTime)) {
      return dropTime;
    }
  }

  if (!airDate) {
    return null;
  }

  const [yearStr, monthStr, dayStr] = airDate.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);

  if (!year || !month || !day) {
    return null;
  }

  const approxUtcDrop = Date.UTC(year, month - 1, day, 20, 0, 0);

  try {
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
    return approxUtcDrop + hourDiff * 60 * 60 * 1000;
  } catch {
    return approxUtcDrop;
  }
}

/**
 * Determine whether an episode has officially aired, with DST awareness and timezone conversion.
 */
export function isEpisodeAired(
  episode: { airDate?: string; airstamp?: string | null },
  networkTz: string = 'America/New_York',
  nowTime?: number | Date
): boolean {
  const now = typeof nowTime === 'number'
    ? nowTime
    : nowTime instanceof Date
    ? nowTime.getTime()
    : Date.now();

  const dropTimestamp = getEpisodeDropTimestamp(episode.airDate, episode.airstamp, networkTz);
  if (dropTimestamp === null) {
    return true; // Assume aired if no valid air date is recorded
  }

  return now >= dropTimestamp;
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
          year: 'numeric',
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
          day: 'numeric',
          year: 'numeric'
        }).format(new Date(utcGuess));
      }
    } catch {
      return airDate;
    }
    return airDate;
  }

  return 'TBA';
}

export interface FormatCountdownOptions {
  capitalize?: boolean;
}

/**
 * Format milliseconds until drop into human-friendly relative units:
 * - < 1 hour: "in 45m" / "In 45m"
 * - < 24 hours: "in 5h 20m" / "In 5h 20m"
 * - 1 to 6 days: "in 1 day 7 hours" / "In 1 day 7 hours"
 * - 7 to 29 days: "in 1 week 2 days" / "In 1 week 2 days"
 * - 30 to 364 days: "in 1 month 2 weeks" / "In 1 month 2 weeks"
 * - >= 365 days: "in 1 year 3 months" / "In 1 year 3 months"
 */
export function formatHumanCountdown(diffMs: number, options: FormatCountdownOptions = {}): string {
  if (diffMs <= 0) return 'Aired';

  const prefix = options.capitalize ? 'In ' : 'in ';
  const totalMin = Math.floor(diffMs / (60 * 1000));
  const totalHours = Math.floor(diffMs / (60 * 60 * 1000));
  const totalDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));

  // 1. Years tier (>= 365 days)
  if (totalDays >= 365) {
    const years = Math.floor(totalDays / 365);
    const remDays = totalDays % 365;
    const months = Math.floor(remDays / 30);
    const yrStr = `${years} ${years === 1 ? 'year' : 'years'}`;
    if (months > 0) {
      const moStr = `${months} ${months === 1 ? 'month' : 'months'}`;
      return `${prefix}${yrStr} ${moStr}`;
    }
    return `${prefix}${yrStr}`;
  }

  // 2. Months tier (>= 30 days)
  if (totalDays >= 30) {
    const months = Math.floor(totalDays / 30);
    const remDays = totalDays % 30;
    const weeks = Math.floor(remDays / 7);
    const days = remDays % 7;
    const moStr = `${months} ${months === 1 ? 'month' : 'months'}`;
    if (weeks > 0) {
      const wkStr = `${weeks} ${weeks === 1 ? 'week' : 'weeks'}`;
      return `${prefix}${moStr} ${wkStr}`;
    }
    if (days > 0) {
      const dayStr = `${days} ${days === 1 ? 'day' : 'days'}`;
      return `${prefix}${moStr} ${dayStr}`;
    }
    return `${prefix}${moStr}`;
  }

  // 3. Weeks tier (>= 7 days)
  if (totalDays >= 7) {
    const weeks = Math.floor(totalDays / 7);
    const days = totalDays % 7;
    const wkStr = `${weeks} ${weeks === 1 ? 'week' : 'weeks'}`;
    if (days > 0) {
      const dayStr = `${days} ${days === 1 ? 'day' : 'days'}`;
      return `${prefix}${wkStr} ${dayStr}`;
    }
    return `${prefix}${wkStr}`;
  }

  // 4. Days tier (>= 1 day)
  if (totalDays >= 1) {
    const days = totalDays;
    const remHours = totalHours % 24;
    const dayStr = `${days} ${days === 1 ? 'day' : 'days'}`;
    if (remHours > 0) {
      const hrStr = `${remHours} ${remHours === 1 ? 'hour' : 'hours'}`;
      return `${prefix}${dayStr} ${hrStr}`;
    }
    return `${prefix}${dayStr}`;
  }

  // 5. Hours tier (>= 1 hour)
  if (totalHours >= 1) {
    const hours = totalHours;
    const remMins = totalMin % 60;
    if (remMins > 0) {
      return `${prefix}${hours}h ${remMins}m`;
    }
    return `${prefix}${hours}h`;
  }

  // 6. Minutes tier (< 1 hour)
  const minutes = Math.max(1, totalMin);
  return `${prefix}${minutes}m`;
}

/**
 * Get humanized countdown string for an upcoming un-aired episode.
 */
export function getEpisodeCountdown(
  airDate?: string,
  airstamp?: string | null,
  networkTz: string = 'America/New_York',
  nowTime?: number | Date
): { isAired: boolean; label: string; hoursRemaining: number } {
  const dropTimestamp = getEpisodeDropTimestamp(airDate, airstamp, networkTz);

  if (dropTimestamp === null) {
    return { isAired: true, label: '', hoursRemaining: 0 };
  }

  const now = typeof nowTime === 'number'
    ? nowTime
    : nowTime instanceof Date
    ? nowTime.getTime()
    : Date.now();
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
