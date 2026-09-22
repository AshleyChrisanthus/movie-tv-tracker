import type { RatingScale } from '../types';

/**
 * Normalizes a rating entered in a given scale to standard internal 10-point floating scale (0.0 to 10.0).
 * If unrated or 0 or invalid, returns null.
 */
export function normalizeRating(value: number | string | null | undefined, scale: RatingScale = '10'): number | null {
  if (value === null || value === undefined || value === '') return null;
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num) || num <= 0) return null;

  let normalized: number;
  if (scale === '5') {
    normalized = (num / 5) * 10;
  } else if (scale === '100') {
    normalized = (num / 100) * 10;
  } else {
    normalized = num;
  }

  // Bound to 0.0 .. 10.0 and round to 2 decimal places
  normalized = Math.min(10, Math.max(0, Math.round(normalized * 100) / 100));
  return normalized;
}

/**
 * Converts a normalized 10-point rating to the active user scale for display and editing.
 */
export function denormalizeRating(normalizedRating: number | null | undefined, scale: RatingScale = '10'): number | null {
  if (normalizedRating === null || normalizedRating === undefined || isNaN(normalizedRating) || normalizedRating <= 0) {
    return null;
  }

  if (scale === '5') {
    return Math.round((normalizedRating / 10) * 5 * 10) / 10;
  } else if (scale === '100') {
    return Math.round((normalizedRating / 10) * 100);
  } else {
    return Math.round(normalizedRating * 10) / 10;
  }
}

/**
 * Formats a normalized rating for display in UI based on active scale.
 */
export function formatRating(normalizedRating: number | null | undefined, scale: RatingScale = '10', withScaleSuffix: boolean = false): string {
  const denorm = denormalizeRating(normalizedRating, scale);
  if (denorm === null) return '';
  if (withScaleSuffix) {
    return `${denorm} / ${scale}`;
  }
  return `${denorm}`;
}

export const RATING_SCALE_CONFIG: Record<RatingScale, { label: string; max: number; step: number; placeholder: string; suffix: string }> = {
  '10': { label: '10-point scale (/10)', max: 10, step: 0.1, placeholder: 'e.g. 8.4', suffix: '/ 10' },
  '5': { label: '5-point scale (/5)', max: 5, step: 0.1, placeholder: 'e.g. 4.2', suffix: '/ 5' },
  '100': { label: '100-point scale (/100)', max: 100, step: 1, placeholder: 'e.g. 84', suffix: '/ 100' },
};
