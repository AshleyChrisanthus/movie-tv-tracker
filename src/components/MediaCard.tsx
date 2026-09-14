import React from 'react';
import { Film, Tv, Star, Plus, CheckCircle2, Check, Clock, BookOpen } from 'lucide-react';
import type { MediaItem, MediaStatus } from '../types';
import { getEpisodeCountdown } from '../utils/timezone';

interface StatusStyle {
  label: string;
  bg: string;
}

const STATUS_CONFIG: Record<MediaStatus, StatusStyle> = {
  watching: { label: 'Watching', bg: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
  caught_up: { label: 'Caught Up', bg: 'bg-sky-500/15 text-sky-400 border-sky-500/30' },
  completed: { label: 'Completed', bg: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  plan_to_watch: { label: 'Plan to Watch', bg: 'bg-[var(--accent-bg)] text-[var(--accent)] border-[var(--accent)]/30' },
  on_hold: { label: 'On Hold', bg: 'bg-orange-500/15 text-orange-400 border-orange-500/30' },
  dropped: { label: 'Dropped', bg: 'bg-red-500/15 text-red-400 border-red-500/30' },
};

export interface MediaCardProps {
  item: MediaItem;
  onClick: (item: MediaItem) => void;
  onQuickIncrement?: (item: MediaItem) => void;
  onQuickToggleMovie?: (item: MediaItem) => void;
}

export default function MediaCard({
  item,
  onClick,
  onQuickIncrement,
  onQuickToggleMovie
}: MediaCardProps): React.JSX.Element {
  const isTv = item.type === 'tv';
  const isBook = item.type === 'book';
  const statusCfg = STATUS_CONFIG[item.status] || STATUS_CONFIG.plan_to_watch;

  // TV / Book progress calculation
  const totalEps = item.totalEpisodes || 0;
  const watchedEps = item.watchedEpisodesCount || 0;
  const totalPages = item.totalPages || 0;
  const currentPage = item.currentPage || 0;

  const progressPercent = isTv
    ? (totalEps > 0 ? Math.min(100, Math.round((watchedEps / totalEps) * 100)) : 0)
    : isBook
    ? (totalPages > 0 ? Math.min(100, Math.round((currentPage / totalPages) * 100)) : 0)
    : 0;

  const isCompleted = isTv
    ? (totalEps > 0 && watchedEps >= totalEps)
    : isBook
    ? (totalPages > 0 && currentPage >= totalPages) || item.status === 'completed'
    : item.status === 'completed';

  // Next episode countdown calculation
  const countdown = isTv && (item.nextAirDate || item.nextAirstamp)
    ? getEpisodeCountdown(item.nextAirDate || undefined, item.nextAirstamp, item.networkTimezone)
    : null;

  const handleQuickAction = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (isTv || isBook) {
      if (onQuickIncrement) onQuickIncrement(item);
    } else {
      if (onQuickToggleMovie) onQuickToggleMovie(item);
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onClick(item)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick(item);
        }
      }}
      className="group relative flex flex-col bg-[var(--card-bg)] hover:bg-[var(--bg-hover)] border border-[var(--border-light)] hover:border-[var(--accent)] rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-xl hover:-translate-y-1"
    >
      {/* Poster Container */}
      <div className="relative aspect-[2/3] w-full overflow-hidden bg-[var(--bg-primary)]">
        {item.posterUrl ? (
          <img
            src={item.posterUrl}
            alt={item.title}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-[var(--bg-secondary)] text-[var(--text-secondary)] p-4 text-center">
            {isTv ? <Tv className="w-12 h-12 mb-2 opacity-40" /> : isBook ? <BookOpen className="w-12 h-12 mb-2 opacity-40" /> : <Film className="w-12 h-12 mb-2 opacity-40" />}
            <span className="text-xs font-medium text-[var(--text-secondary)] line-clamp-2">{item.title}</span>
          </div>
        )}

        {/* Top Badges */}
        <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between gap-1 pointer-events-none">
          {/* Type Badge */}
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-black/65 backdrop-blur-md border border-white/10 text-[11px] font-semibold text-white">
            {isTv ? <Tv className="w-3 h-3 text-[var(--accent)]" /> : isBook ? <BookOpen className="w-3 h-3 text-[var(--accent)]" /> : <Film className="w-3 h-3 text-[var(--accent)]" />}
            <span>{isTv ? 'TV' : isBook ? 'Book' : 'Movie'}</span>
          </span>

          {/* Rating in Apple Gold */}
          {item.rating ? (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-black/65 backdrop-blur-md border border-white/10 text-[11px] font-bold text-[#ffd60a]">
              <Star className="w-3 h-3 fill-[#ffd60a] text-[#ffd60a]" />
              <span>{item.rating}</span>
            </span>
          ) : null}
        </div>

        {/* Quick Action Button overlay at bottom right of poster */}
        <div className="absolute bottom-2.5 right-2.5 z-10">
          {isTv && !isCompleted && item.status !== 'caught_up' && (
            <button
              type="button"
              onClick={handleQuickAction}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-[var(--accent)] hover:brightness-110 text-white text-xs font-bold shadow-lg shadow-[var(--accent)]/30 backdrop-blur-sm transition-all active:scale-95"
              title="Quick mark +1 episode watched"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+1 Ep</span>
            </button>
          )}

          {isBook && !isCompleted && (
            <button
              type="button"
              onClick={handleQuickAction}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-[var(--accent)] hover:brightness-110 text-white text-xs font-bold shadow-lg shadow-[var(--accent)]/30 backdrop-blur-sm transition-all active:scale-95"
              title="Quick read +10 pages"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+10 p</span>
            </button>
          )}

          {!isTv && !isBook && (
            <button
              type="button"
              onClick={handleQuickAction}
              className={`flex items-center gap-1 p-2 rounded-xl text-xs font-bold shadow-lg backdrop-blur-sm transition-all active:scale-95 ${
                item.status === 'completed'
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                  : 'bg-[var(--card-bg)]/90 hover:bg-[var(--accent)] text-[var(--text-primary)] hover:text-white border border-white/15'
              }`}
              title={item.status === 'completed' ? 'Mark as Unwatched' : 'Mark as Watched'}
            >
              <Check className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Caught Up overlay badge */}
        {item.status === 'caught_up' && !isCompleted && (
          <div className="absolute top-2.5 right-2.5">
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-sky-950/85 backdrop-blur-md border border-sky-500/40 text-[11px] font-semibold text-sky-400 shadow-md">
              <Clock className="w-3 h-3 text-sky-400" />
              <span>Caught Up</span>
            </span>
          </div>
        )}

        {/* Completed overlay badge */}
        {isCompleted && (
          <div className="absolute top-2.5 right-2.5">
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-950/80 backdrop-blur-md border border-emerald-500/40 text-[11px] font-semibold text-emerald-400">
              <CheckCircle2 className="w-3 h-3" />
              <span>Done</span>
            </span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-3.5 flex flex-col flex-1 justify-between gap-2.5">
        <div>
          <div className="flex items-start justify-between gap-2 mb-1">
            <h3 className="font-semibold text-sm text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors line-clamp-1" title={item.title}>
              {item.title}
            </h3>
          </div>

          <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
            <span className="truncate max-w-[140px]">{isBook && item.author ? item.author : item.year || 'N/A'}</span>
            <span>•</span>
            <span className={`px-2 py-0.2 rounded-md text-[10px] font-medium border ${statusCfg.bg}`}>
              {statusCfg.label}
            </span>
          </div>

          {item.lists && item.lists.length > 0 && (
            <div className="flex items-center gap-1 mt-1.5 flex-wrap">
              {item.lists.slice(0, 2).map(listName => (
                <span
                  key={listName}
                  className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-[var(--bg-tertiary)] text-[var(--accent)] border border-[var(--border-light)] truncate max-w-[120px]"
                >
                  📁 {listName}
                </span>
              ))}
              {item.lists.length > 2 && (
                <span className="text-[10px] text-[var(--text-secondary)] font-mono">
                  +{item.lists.length - 2}
                </span>
              )}
            </div>
          )}
        </div>

        {/* TV Progress Details (App Directory slim track) */}
        {isTv && (
          <div className="pt-2 border-t border-[var(--border-light)]">
            <div className="flex items-center justify-between text-[11px] text-[var(--text-secondary)] mb-1.5 font-medium">
              <span>
                {item.currentSeason ? `S${item.currentSeason} ` : ''}
                {item.currentEpisode ? `E${item.currentEpisode}` : ''}
                {(!item.currentSeason && !item.currentEpisode) ? 'Not started' : ''}
              </span>
              <span className="font-mono text-[var(--text-primary)]">
                {watchedEps}/{totalEps} eps ({progressPercent}%)
              </span>
            </div>

            {/* Apple Slim Progress Track */}
            <div className="w-full h-1.5 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-300 rounded-full ${
                  isCompleted
                    ? 'bg-emerald-500'
                    : item.status === 'caught_up'
                    ? 'bg-sky-500'
                    : 'bg-gradient-to-r from-[var(--accent)] to-[#30d158]'
                }`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            {/* Localized Next Episode Countdown */}
            {countdown && !countdown.isAired && (
              <div className="mt-2 flex items-center gap-1.5 px-2 py-1 rounded-lg bg-sky-500/10 border border-sky-500/20 text-[10px] text-sky-400 font-medium">
                <Clock className="w-3 h-3 shrink-0 text-sky-400" />
                <span className="truncate">
                  {item.nextEpisodeSeason && item.nextEpisodeNumber
                    ? `S${item.nextEpisodeSeason}E${item.nextEpisodeNumber} drops ${countdown.label}`
                    : `Next ep drops ${countdown.label}`}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Book Progress Details */}
        {isBook && (
          <div className="pt-2 border-t border-[var(--border-light)]">
            <div className="flex items-center justify-between text-[11px] text-[var(--text-secondary)] mb-1.5 font-medium">
              <span>{isCompleted ? 'Finished' : 'Reading'}</span>
              <span className="font-mono text-[var(--text-primary)]">
                {totalPages > 0 ? `${currentPage}/${totalPages} p (${progressPercent}%)` : `${currentPage} pages`}
              </span>
            </div>

            {/* Slim Reading Progress Track */}
            <div className="w-full h-1.5 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-300 rounded-full ${
                  isCompleted
                    ? 'bg-emerald-500'
                    : 'bg-gradient-to-r from-[var(--accent)] to-[#30d158]'
                }`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        )}

        {/* Movie status hint */}
        {!isTv && !isBook && (
          <div className="pt-1 text-[11px] text-[var(--text-secondary)]">
            {item.status === 'completed' ? 'Watched' : 'In Watchlist'}
          </div>
        )}
      </div>
    </div>
  );
}
