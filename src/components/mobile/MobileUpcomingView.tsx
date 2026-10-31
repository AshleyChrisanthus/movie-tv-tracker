import React, { useMemo } from 'react';
import { Calendar, Clock, Sparkles, Film, Tv, BookOpen, Star, Plus, Flame, ChevronRight } from 'lucide-react';
import type { MediaItem, UpcomingFilter, RatingScale } from '../../types';
import { getEpisodeCountdown, formatEpisodeAirDate } from '../../utils/timezone';
import { useLiveTicker } from '../../hooks/useLiveTicker';
import { getItemReleaseDate } from '../../utils/upcoming';
import { formatRating } from '../../utils/rating';

export interface MobileUpcomingViewProps {
  items: MediaItem[];
  upcomingDays: number;
  onUpcomingDaysChange: (days: number) => void;
  upcomingFilter: UpcomingFilter;
  onUpcomingFilterChange: (filter: UpcomingFilter) => void;
  onItemClick: (item: MediaItem) => void;
  onOpenSearch?: () => void;
  ratingScale?: RatingScale;
}

interface ParsedUpcomingItem {
  item: MediaItem;
  targetDate: Date;
  diffMs: number;
  formattedDate: string;
  countdownText: string;
  isTodayOrTomorrow: boolean;
  isThisWeek: boolean;
  subtitle: string;
  badgeType: 'tv' | 'movie' | 'book';
}

export default function MobileUpcomingView({
  items,
  upcomingDays,
  onUpcomingDaysChange,
  upcomingFilter,
  onUpcomingFilterChange,
  onItemClick,
  onOpenSearch,
  ratingScale = '10'
}: MobileUpcomingViewProps): React.JSX.Element {
  const liveTick = useLiveTicker();
  const now = useMemo(() => new Date(liveTick), [liveTick]);

  // Parse all library items and locate unreleased upcoming dates/episodes
  const parsedItems = useMemo<ParsedUpcomingItem[]>(() => {
    const list: ParsedUpcomingItem[] = [];
    const nowMs = now.getTime();

    for (const item of items) {
      if (item.status === 'completed') continue;

      let targetDate: Date | null = null;
      let subtitle = '';
      let countdownText = '';

      if (item.type === 'tv') {
        // 1. Airing episodes
        if (item.nextAirDate || item.nextAirstamp) {
          const cd = getEpisodeCountdown(item.nextAirDate || undefined, item.nextAirstamp, item.networkTimezone, nowMs);
          let dropTime: number | null = null;
          if (item.nextAirstamp) {
            const t = new Date(item.nextAirstamp).getTime();
            if (!isNaN(t)) dropTime = t;
          }
          if (dropTime === null && item.nextAirDate) {
            const [y, m, d] = item.nextAirDate.split('-').map(Number);
            if (y && m && d) dropTime = Date.UTC(y, m - 1, d, 20, 0, 0);
          }

          if (dropTime !== null) {
            const diff = dropTime - nowMs;
            // Include if not yet aired or aired within last 12 hours (today)
            if (!cd.isAired || diff >= -12 * 60 * 60 * 1000) {
              targetDate = new Date(dropTime);
              const epInfo = item.nextEpisodeSeason && item.nextEpisodeNumber
                ? `S${item.nextEpisodeSeason}E${item.nextEpisodeNumber}`
                : 'Next Episode';
              subtitle = epInfo;

              if (diff <= 0) {
                countdownText = 'Airing Today';
              } else {
                const totalMins = Math.floor(diff / (60 * 1000));
                const hours = Math.floor(totalMins / 60);
                const mins = totalMins % 60;
                countdownText = hours > 0 ? `In ${hours}h ${mins}m` : `In ${mins}m`;
              }
            }
          }
        }

        // 2. Unreleased TV show premiere fallback
        if (!targetDate && (!item.watchedEpisodesCount || item.watchedEpisodesCount === 0)) {
          const relDate = getItemReleaseDate(item);
          if (relDate && relDate.getTime() > nowMs) {
            targetDate = relDate;
            subtitle = 'Series Premiere';
            const diff = relDate.getTime() - nowMs;
            const totalMins = Math.floor(diff / (60 * 1000));
            const hours = Math.floor(totalMins / 60);
            const mins = totalMins % 60;
            countdownText = hours > 0 ? `In ${hours}h ${mins}m` : `In ${mins}m`;
          }
        }
      } else if (item.type === 'movie') {
        if (item.digitalReleaseDate) {
          const d = new Date(item.digitalReleaseDate);
          if (!isNaN(d.getTime()) && d.getTime() > nowMs) {
            targetDate = d;
            subtitle = 'Digital Drop';
          }
        }
        if (!targetDate && item.theatricalReleaseDate) {
          const d = new Date(item.theatricalReleaseDate);
          if (!isNaN(d.getTime()) && d.getTime() > nowMs) {
            targetDate = d;
            subtitle = 'Theatrical Release';
          }
        }
        if (!targetDate) {
          const relDate = getItemReleaseDate(item);
          if (relDate && relDate.getTime() > nowMs) {
            targetDate = relDate;
            subtitle = 'Movie Release';
          }
        }
        if (targetDate) {
          const diff = targetDate.getTime() - nowMs;
          const totalMins = Math.floor(diff / (60 * 1000));
          const hours = Math.floor(totalMins / 60);
          const mins = totalMins % 60;
          countdownText = hours > 0 ? `In ${hours}h ${mins}m` : `In ${mins}m`;
        }
      } else if (item.type === 'book') {
        const relDate = getItemReleaseDate(item);
        if (relDate && relDate.getTime() > nowMs) {
          targetDate = relDate;
          subtitle = 'Book Release';
          const diff = relDate.getTime() - nowMs;
          const totalMins = Math.floor(diff / (60 * 1000));
          const hours = Math.floor(totalMins / 60);
          const mins = totalMins % 60;
          countdownText = hours > 0 ? `In ${hours}h ${mins}m` : `In ${mins}m`;
        }
      }

      if (targetDate) {
        const diffMs = targetDate.getTime() - nowMs;
        const isTodayOrTomorrow = diffMs <= 48 * 60 * 60 * 1000;
        const isThisWeek = !isTodayOrTomorrow && diffMs <= 7 * 24 * 60 * 60 * 1000;

        let formattedDate = '';
        if (item.type === 'tv' && (item.nextAirDate || item.nextAirstamp)) {
          formattedDate = formatEpisodeAirDate(item.nextAirDate || undefined, item.nextAirstamp, undefined, item.networkTimezone);
        } else {
          try {
            formattedDate = new Intl.DateTimeFormat('en-US', {
              month: 'short',
              day: 'numeric',
              year: targetDate.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
            }).format(targetDate);
          } catch {
            formattedDate = targetDate.toLocaleDateString();
          }
        }

        list.push({
          item,
          targetDate,
          diffMs,
          formattedDate,
          countdownText,
          isTodayOrTomorrow,
          isThisWeek,
          subtitle,
          badgeType: item.type as 'tv' | 'movie' | 'book'
        });
      }
    }

    // Sort chronologically ascending
    return list.sort((a, b) => a.targetDate.getTime() - b.targetDate.getTime());
  }, [items, now]);

  // Active Horizon filter application
  const filteredList = useMemo(() => {
    if (upcomingFilter === 'show_all') {
      return parsedItems;
    }
    const maxMs = upcomingDays * 24 * 60 * 60 * 1000;
    return parsedItems.filter(p => p.diffMs <= maxMs);
  }, [parsedItems, upcomingFilter, upcomingDays]);

  // Group into: Today / Tomorrow, This Week, Later
  const todayTomorrowItems = useMemo(
    () => filteredList.filter(p => p.isTodayOrTomorrow),
    [filteredList]
  );
  const thisWeekItems = useMemo(
    () => filteredList.filter(p => p.isThisWeek),
    [filteredList]
  );
  const laterItems = useMemo(
    () => filteredList.filter(p => !p.isTodayOrTomorrow && !p.isThisWeek),
    [filteredList]
  );

  const horizonChips = [
    { label: 'Next 7 Days', days: 7, filter: 'next_n_days' as UpcomingFilter },
    { label: 'Next 14 Days', days: 14, filter: 'next_n_days' as UpcomingFilter },
    { label: 'Next 30 Days', days: 30, filter: 'next_n_days' as UpcomingFilter },
    { label: 'All Upcoming', days: 0, filter: 'show_all' as UpcomingFilter },
  ];

  return (
    <div className="md:hidden flex flex-col gap-4 pb-28 animate-fadeIn select-none">
      {/* Header View Banner */}
      <div className="flex items-center justify-between pt-1 pb-2 border-b border-[var(--border-light)]">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-[var(--accent)]/15 border border-[var(--accent)]/30 flex items-center justify-center text-[var(--accent)]">
            <Calendar className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-base font-extrabold text-[var(--text-primary)] leading-tight">
              Upcoming Schedule
            </h1>
            <p className="text-[11px] text-[var(--text-secondary)]">
              {filteredList.length} scheduled release{filteredList.length === 1 ? '' : 's'}
            </p>
          </div>
        </div>

        {onOpenSearch && (
          <button
            type="button"
            onClick={onOpenSearch}
            className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-[var(--accent)] text-white text-xs font-bold shadow-md shadow-[var(--accent)]/30 active:scale-95 transition-all cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Title</span>
          </button>
        )}
      </div>

      {/* Time Horizon Filter Chips */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar scrollbar-none py-1 -mx-1 px-1">
        {horizonChips.map((chip) => {
          const isActive = chip.filter === 'show_all'
            ? upcomingFilter === 'show_all'
            : upcomingFilter === 'next_n_days' && upcomingDays === chip.days;

          return (
            <button
              key={chip.label}
              type="button"
              onClick={() => {
                onUpcomingFilterChange(chip.filter);
                if (chip.days > 0) {
                  onUpcomingDaysChange(chip.days);
                }
              }}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all active:scale-95 cursor-pointer ${
                isActive
                  ? 'bg-[var(--accent)] text-white shadow-md shadow-[var(--accent)]/30'
                  : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] border border-[var(--border-light)] hover:text-[var(--text-primary)]'
              }`}
            >
              {chip.label}
            </button>
          );
        })}
      </div>

      {/* Empty State */}
      {filteredList.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-4 text-center rounded-3xl bg-[var(--card-bg)] border border-[var(--border-light)] shadow-sm my-4">
          <div className="w-14 h-14 rounded-2xl bg-[var(--accent)]/10 text-[var(--accent)] flex items-center justify-center mb-3">
            <Sparkles className="w-7 h-7" />
          </div>
          <h2 className="text-base font-bold text-[var(--text-primary)] mb-1">
            No Upcoming Releases Found
          </h2>
          <p className="text-xs text-[var(--text-secondary)] max-w-xs mb-5">
            {upcomingFilter === 'show_all'
              ? 'No upcoming episodes or future releases currently scheduled in your library.'
              : `None of your tracked titles have scheduled releases in the selected ${upcomingDays}-day horizon.`}
          </p>

          <div className="flex flex-col sm:flex-row gap-2 w-full max-w-xs">
            {upcomingFilter !== 'show_all' && (
              <button
                type="button"
                onClick={() => onUpcomingFilterChange('show_all')}
                className="w-full py-2.5 rounded-xl bg-[var(--accent)] text-white text-xs font-bold shadow-md shadow-[var(--accent)]/30 active:scale-95 transition-all cursor-pointer"
              >
                View All Upcoming
              </button>
            )}
            {onOpenSearch && (
              <button
                type="button"
                onClick={onOpenSearch}
                className="w-full py-2.5 rounded-xl bg-[var(--bg-secondary)] text-[var(--text-primary)] border border-[var(--border-light)] text-xs font-semibold hover:bg-[var(--bg-hover)] active:scale-95 transition-all cursor-pointer"
              >
                Search & Add Media
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {/* 1. Group: Airing Today / Tomorrow (Highlighted Cards with Live Countdowns) */}
          {todayTomorrowItems.length > 0 && (
            <section className="flex flex-col gap-2.5">
              <div className="flex items-center gap-1.5 pb-1">
                <Flame className="w-4 h-4 text-amber-400 fill-amber-400/20" />
                <h2 className="text-xs font-bold uppercase tracking-wider text-amber-400">
                  Airing Today & Tomorrow
                </h2>
                <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded-full bg-amber-400/15 text-amber-400 border border-amber-400/30">
                  {todayTomorrowItems.length}
                </span>
              </div>

              <div className="flex flex-col gap-2.5">
                {todayTomorrowItems.map((p) => {
                  const rating = formatRating(p.item.rating || p.item.communityRating, ratingScale);

                  return (
                    <div
                      key={`today_${p.item.id}`}
                      role="button"
                      tabIndex={0}
                      onClick={() => onItemClick(p.item)}
                      className="group relative flex gap-3 p-2.5 rounded-2xl bg-gradient-to-r from-amber-500/10 via-[var(--card-bg)] to-[var(--card-bg)] border border-amber-500/30 hover:border-amber-400 active:scale-[0.98] transition-all cursor-pointer shadow-md overflow-hidden"
                    >
                      {/* Left: Thumbnail Poster */}
                      <div className="relative w-16 h-24 rounded-xl overflow-hidden bg-[var(--bg-secondary)] shrink-0 border border-[var(--border-light)]">
                        {p.item.posterUrl ? (
                          <img
                            src={p.item.posterUrl}
                            alt={p.item.title}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-[var(--text-secondary)]">
                            {p.badgeType === 'tv' ? <Tv className="w-5 h-5" /> : <Film className="w-5 h-5" />}
                          </div>
                        )}
                        <span className="absolute top-1 left-1 px-1 py-0.5 rounded text-[8px] font-bold bg-black/70 backdrop-blur-sm text-white uppercase">
                          {p.badgeType}
                        </span>
                      </div>

                      {/* Right: Info + Live Countdown */}
                      <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
                        <div>
                          <div className="flex items-start justify-between gap-1 mb-0.5">
                            <h3 className="font-extrabold text-xs text-[var(--text-primary)] truncate group-hover:text-[var(--accent)] transition-colors">
                              {p.item.title}
                            </h3>
                            {rating && (
                              <div className="flex items-center gap-0.5 text-[10px] font-bold text-amber-400 shrink-0">
                                <Star className="w-3 h-3 fill-current" />
                                <span>{rating}</span>
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-secondary)] mb-1.5">
                            <span className="font-semibold text-[var(--accent)]">{p.subtitle}</span>
                            <span>•</span>
                            <span>{p.formattedDate}</span>
                          </div>
                        </div>

                        {/* Live Countdown Badge */}
                        <div className="flex items-center justify-between">
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[11px] font-bold shadow-xs">
                            <Clock className="w-3 h-3 text-amber-400 animate-pulse" />
                            <span>{p.countdownText}</span>
                          </div>

                          <ChevronRight className="w-4 h-4 text-[var(--text-tertiary)] group-hover:text-[var(--text-primary)] transition-colors" />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* 2. Group: This Week (Next 7 Days) */}
          {thisWeekItems.length > 0 && (
            <section className="flex flex-col gap-2.5">
              <div className="flex items-center gap-1.5 pb-1">
                <Clock className="w-4 h-4 text-sky-400" />
                <h2 className="text-xs font-bold uppercase tracking-wider text-sky-400">
                  This Week
                </h2>
                <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded-full bg-sky-400/15 text-sky-400 border border-sky-400/30">
                  {thisWeekItems.length}
                </span>
              </div>

              <div className="flex flex-col gap-2">
                {thisWeekItems.map((p) => {
                  const rating = formatRating(p.item.rating || p.item.communityRating, ratingScale);

                  return (
                    <div
                      key={`week_${p.item.id}`}
                      role="button"
                      tabIndex={0}
                      onClick={() => onItemClick(p.item)}
                      className="group flex items-center gap-3 p-2 rounded-2xl bg-[var(--card-bg)] border border-[var(--border-light)] hover:border-[var(--accent)] active:scale-[0.98] transition-all cursor-pointer shadow-xs"
                    >
                      {/* Left: Compact Thumbnail */}
                      <div className="relative w-12 h-16 rounded-xl overflow-hidden bg-[var(--bg-secondary)] shrink-0 border border-[var(--border-light)]">
                        {p.item.posterUrl ? (
                          <img
                            src={p.item.posterUrl}
                            alt={p.item.title}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-[var(--text-secondary)]">
                            {p.badgeType === 'tv' ? <Tv className="w-4 h-4" /> : <Film className="w-4 h-4" />}
                          </div>
                        )}
                      </div>

                      {/* Middle: Details */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1 mb-0.5">
                          <h3 className="font-bold text-xs text-[var(--text-primary)] truncate group-hover:text-[var(--accent)] transition-colors">
                            {p.item.title}
                          </h3>
                          {rating && (
                            <div className="flex items-center gap-0.5 text-[10px] font-semibold text-amber-400 shrink-0">
                              <Star className="w-2.5 h-2.5 fill-current" />
                              <span>{rating}</span>
                            </div>
                          )}
                        </div>

                        <p className="text-[11px] text-[var(--text-secondary)] truncate">
                          <span className="font-medium text-[var(--accent)]">{p.subtitle}</span>
                          {' • '}
                          <span>{p.formattedDate}</span>
                        </p>
                      </div>

                      {/* Right: Countdown Pill */}
                      <div className="shrink-0 flex items-center gap-1.5">
                        <span className="px-2 py-1 rounded-lg bg-sky-500/10 border border-sky-500/20 text-sky-400 text-[10px] font-bold">
                          {p.countdownText}
                        </span>
                        <ChevronRight className="w-3.5 h-3.5 text-[var(--text-tertiary)]" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* 3. Group: Later / Coming Soon */}
          {laterItems.length > 0 && (
            <section className="flex flex-col gap-2.5">
              <div className="flex items-center gap-1.5 pb-1">
                <Calendar className="w-4 h-4 text-[var(--accent)]" />
                <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                  Later & Coming Soon
                </h2>
                <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded-full bg-[var(--accent)]/15 text-[var(--accent)] border border-[var(--accent)]/30">
                  {laterItems.length}
                </span>
              </div>

              <div className="flex flex-col gap-2">
                {laterItems.map((p) => {
                  const rating = formatRating(p.item.rating || p.item.communityRating, ratingScale);

                  return (
                    <div
                      key={`later_${p.item.id}`}
                      role="button"
                      tabIndex={0}
                      onClick={() => onItemClick(p.item)}
                      className="group flex items-center gap-3 p-2 rounded-2xl bg-[var(--card-bg)] border border-[var(--border-light)] hover:border-[var(--accent)] active:scale-[0.98] transition-all cursor-pointer shadow-xs"
                    >
                      <div className="relative w-12 h-16 rounded-xl overflow-hidden bg-[var(--bg-secondary)] shrink-0 border border-[var(--border-light)]">
                        {p.item.posterUrl ? (
                          <img
                            src={p.item.posterUrl}
                            alt={p.item.title}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-[var(--text-secondary)]">
                            {p.badgeType === 'tv' ? <Tv className="w-4 h-4" /> : <Film className="w-4 h-4" />}
                          </div>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1 mb-0.5">
                          <h3 className="font-bold text-xs text-[var(--text-primary)] truncate group-hover:text-[var(--accent)] transition-colors">
                            {p.item.title}
                          </h3>
                          {rating && (
                            <div className="flex items-center gap-0.5 text-[10px] font-semibold text-amber-400 shrink-0">
                              <Star className="w-2.5 h-2.5 fill-current" />
                              <span>{rating}</span>
                            </div>
                          )}
                        </div>

                        <p className="text-[11px] text-[var(--text-secondary)] truncate">
                          <span className="font-medium text-[var(--accent)]">{p.subtitle}</span>
                          {' • '}
                          <span>{p.formattedDate}</span>
                        </p>
                      </div>

                      <div className="shrink-0 flex items-center gap-1.5">
                        <span className="px-2 py-1 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-light)] text-[var(--text-secondary)] text-[10px] font-medium">
                          {p.countdownText}
                        </span>
                        <ChevronRight className="w-3.5 h-3.5 text-[var(--text-tertiary)]" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
