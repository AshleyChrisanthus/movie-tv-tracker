/**
 * Utilities for parsing, formatting, and calculating audiobook listening durations and progress (Issue #38).
 */

import type { MediaItem } from '../types/media';

/**
 * Parse an audiobook duration string or number into total seconds.
 * Supports patterns like:
 * - "8 hours and 41 minutes", "8 hrs 41 mins", "8h 41m"
 * - "8 hours", "45 minutes", "30 mins", "521 min"
 * - "08:41:00", "08:41"
 * - Numeric seconds or milliseconds (> 100000 ms)
 */
export function parseAudioDuration(input: string | number | undefined | null): number {
  if (input === undefined || input === null) return 0;

  if (typeof input === 'number') {
    if (isNaN(input) || input <= 0) return 0;
    // If it looks like milliseconds (e.g. trackTimeMillis > 100,000)
    if (input > 100000 && input % 1000 === 0) {
      return Math.round(input / 1000);
    }
    return Math.round(input);
  }

  const str = String(input).trim();
  if (!str) return 0;

  // Pattern 1: HH:MM:SS or MM:SS
  const colonMatch = str.match(/^(?:(\d+):)?(\d{1,2}):(\d{2})$/);
  if (colonMatch) {
    const hours = colonMatch[1] ? parseInt(colonMatch[1], 10) : 0;
    const minutes = parseInt(colonMatch[2], 10);
    const seconds = parseInt(colonMatch[3], 10);
    return hours * 3600 + minutes * 60 + seconds;
  }

  let totalSeconds = 0;
  let matched = false;

  // Hours: e.g. "8 hours", "8 hrs", "8 hr", "8h"
  const hoursMatch = str.match(/(\d+(?:\.\d+)?)\s*(?:hours|hour|hrs|hr|h)\b/i);
  if (hoursMatch) {
    totalSeconds += Math.round(parseFloat(hoursMatch[1]) * 3600);
    matched = true;
  }

  // Minutes: e.g. "41 minutes", "41 mins", "41 min", "41m"
  const minutesMatch = str.match(/(\d+(?:\.\d+)?)\s*(?:minutes|minute|mins|min|m)\b/i);
  if (minutesMatch) {
    totalSeconds += Math.round(parseFloat(minutesMatch[1]) * 60);
    matched = true;
  }

  // Seconds: e.g. "30 seconds", "30 secs", "30s"
  const secondsMatch = str.match(/(\d+(?:\.\d+)?)\s*(?:seconds|second|secs|sec|s)\b/i);
  if (secondsMatch) {
    totalSeconds += Math.round(parseFloat(secondsMatch[1]));
    matched = true;
  }

  if (matched) return totalSeconds;

  // Plain number string
  const plainNum = parseFloat(str);
  if (!isNaN(plainNum) && plainNum > 0) {
    // If > 100000, probably ms
    if (plainNum > 100000) return Math.round(plainNum / 1000);
    return Math.round(plainNum);
  }

  return 0;
}

/**
 * Format total seconds into a readable string: e.g. "8h 41m", "45m", "1h".
 */
export function formatAudioDuration(totalSeconds: number | undefined | null): string {
  if (!totalSeconds || isNaN(totalSeconds) || totalSeconds <= 0) return '0m';

  const secs = Math.round(totalSeconds);
  const hours = Math.floor(secs / 3600);
  const minutes = Math.floor((secs % 3600) / 60);

  if (hours > 0 && minutes > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (hours > 0) {
    return `${hours}h 0m`;
  }
  return `${Math.max(1, minutes)}m`;
}

/**
 * Format listening progress string: e.g. "4h 15m of 8h 41m".
 */
export function formatAudioProgress(currentSeconds: number = 0, totalSeconds: number = 0): string {
  const currentFormatted = formatAudioDuration(currentSeconds);
  if (totalSeconds <= 0) {
    return currentFormatted;
  }
  const totalFormatted = formatAudioDuration(totalSeconds);
  return `${currentFormatted} of ${totalFormatted}`;
}

/**
 * Convert seconds to separate hours and minutes components.
 */
export function secondsToHoursMinutes(seconds: number = 0): { hours: number; minutes: number } {
  const safeSecs = Math.max(0, Math.round(seconds));
  return {
    hours: Math.floor(safeSecs / 3600),
    minutes: Math.floor((safeSecs % 3600) / 60)
  };
}

/**
 * Convert hours and minutes back to total seconds.
 */
export function hoursMinutesToSeconds(hours: number = 0, minutes: number = 0): number {
  return Math.max(0, Math.round(hours) * 3600 + Math.round(minutes) * 60);
}

/**
 * Attempt to extract narrator from a description or text snippet.
 */
export function extractNarrator(text: string | undefined | null): string | undefined {
  if (!text) return undefined;
  const match = text.match(/(?:narrated|read|reader|narrator|performed)\s*(?:by|:)\s*([A-Za-z\s.'-]+?)(?=[,.<>\n\r\t]|\bwith\b|\bfor\b|$)/i);
  if (match && match[1]) {
    const cleaned = match[1].trim();
    if (cleaned.length > 1 && cleaned.length < 50 && !/^(the|a|an|full\s+cast)$/i.test(cleaned)) {
      return cleaned;
    }
  }
  return undefined;
}

/**
 * Check if a media item is an audiobook.
 */
export function isAudiobookItem(item: Partial<MediaItem> | undefined | null): boolean {
  if (!item || item.type !== 'book') return false;
  const format = (item.bookFormat || '').toLowerCase();
  if (format.includes('audio') || format.includes('cd') || format.includes('cassette') || format.includes('audible')) {
    return true;
  }
  if (item.totalDurationSeconds && item.totalDurationSeconds > 0) {
    return true;
  }
  if (item.progressMode === 'time') {
    return true;
  }
  if (item.narrator && item.narrator.trim().length > 0) {
    return true;
  }
  if (item.narrators && item.narrators.length > 0) {
    return true;
  }
  return false;
}
