import React from 'react';
import { Film, Tv, Star, Plus, Check, Clock, BookOpen, Globe, Headphones } from 'lucide-react';
import type { MediaItem, MediaStatus, RatingScale } from '../types';
import { getEpisodeCountdown } from '../utils/timezone';
import { formatRating } from '../utils/rating';
import { isAudiobookItem, formatAudioDuration } from '../utils/audioDuration';

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

const BOOK_STATUS_CONFIG: Record<MediaStatus, StatusStyle> = {
  watching: { label: 'Reading', bg: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
  caught_up: { label: 'Caught Up', bg: 'bg-sky-500/15 text-sky-400 border-sky-500/30' },
  completed: { label: 'Read', bg: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  plan_to_watch: { label: 'Plan to Read', bg: 'bg-[var(--accent-bg)] text-[var(--accent)] border-[var(--accent)]/30' },
  on_hold: { label: 'On Hold', bg: 'bg-orange-500/15 text-orange-400 border-orange-500/30' },
  dropped: { label: 'Did Not Finish', bg: 'bg-red-500/15 text-red-400 border-red-500/30' },
};

const AUDIOBOOK_STATUS_CONFIG: Record<MediaStatus, StatusStyle> = {
  watching: { label: 'Listening', bg: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
  caught_up: { label: 'Caught Up', bg: 'bg-sky-500/15 text-sky-400 border-sky-500/30' },
  completed: { label: 'Finished', bg: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  plan_to_watch: { label: 'Plan to Listen', bg: 'bg-[var(--accent-bg)] text-[var(--accent)] border-[var(--accent)]/30' },
  on_hold: { label: 'On Hold', bg: 'bg-orange-500/15 text-orange-400 border-orange-500/30' },
  dropped: { label: 'Did Not Finish', bg: 'bg-red-500/15 text-red-400 border-red-500/30' },
};

export interface MediaListViewProps {
  items: MediaItem[];
  onClick: (item: MediaItem) => void;
  onQuickIncrement?: (item: MediaItem) => void;
  onQuickToggleMovie?: (item: MediaItem) => void;
  ratingScale?: RatingScale;
}

export default function MediaListView({
  items,
  onClick,
  onQuickIncrement,
  onQuickToggleMovie,
  ratingScale = '10'
}: MediaListViewProps): React.JSX.Element {
  return (
    <div className="flex flex-col gap-2">
      {items.map(item => {
        const isTv = item.type === 'tv';
        const isBook = item.type === 'book';
        const isAudio = isAudiobookItem(item);
        const statusCfg = isAudio
          ? (AUDIOBOOK_STATUS_CONFIG[item.status] || AUDIOBOOK_STATUS_CONFIG.plan_to_watch)
          : (isBook ? BOOK_STATUS_CONFIG[item.status] : STATUS_CONFIG[item.status]) || (isBook ? BOOK_STATUS_CONFIG.plan_to_watch : STATUS_CONFIG.plan_to_watch);

        const isChapters = isBook && item.progressMode === 'chapters';
        const isTimeMode = isBook && (item.progressMode === 'time' || isAudio);
        const totalEps = item.totalEpisodes || 0;
        const watchedEps = item.watchedEpisodesCount || 0;
        const totalPages = item.totalPages || 0;
        const currentPage = item.currentPage || 0;
        const totalChapters = item.totalChapters || 0;
        const currentChapter = item.currentChapter || 0;
        const totalDuration = item.totalDurationSeconds || 0;
        const currentDuration = item.currentDurationSeconds || 0;

        const progressPercent = isTv
          ? (totalEps > 0 ? Math.min(100, Math.round((watchedEps / totalEps) * 100)) : 0)
          : isBook
          ? isTimeMode
            ? (totalDuration > 0 ? Math.min(100, Math.round((currentDuration / totalDuration) * 100)) : 0)
            : isChapters
            ? (totalChapters > 0 ? Math.min(100, Math.round((currentChapter / totalChapters) * 100)) : 0)
            : (totalPages > 0 ? Math.min(100, Math.round((currentPage / totalPages) * 100)) : 0)
          : 0;

        const isCompleted = isTv
          ? (totalEps > 0 && watchedEps >= totalEps)
          : isBook
          ? isTimeMode
            ? (totalDuration > 0 && currentDuration >= totalDuration) || item.status === 'completed'
            : isChapters
            ? (totalChapters > 0 && currentChapter >= totalChapters) || item.status === 'completed'
            : (totalPages > 0 && currentPage >= totalPages) || item.status === 'completed'
          : item.status === 'completed';

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

        const userRatingFormatted = formatRating(item.rating, ratingScale);
        const communityRatingFormatted = formatRating(item.communityRating, ratingScale);

        return (
          <div
            key={item.id}
            role="button"
            tabIndex={0}
            onClick={() => onClick(item)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick(item);
              }
            }}
            className="group flex items-center gap-3 sm:gap-4 p-2.5 sm:p-3 rounded-xl bg-[var(--card-bg)] hover:bg-[var(--bg-hover)] border border-[var(--border-light)] hover:border-[var(--accent)] transition-all cursor-pointer select-none"
          >
            {/* Poster Thumbnail */}
            <div className="w-10 sm:w-12 aspect-[2/3] rounded-lg overflow-hidden bg-[var(--bg-primary)] shrink-0 border border-[var(--border-light)]">
              {item.posterUrl ? (
                <img
                  src={item.posterUrl}
                  alt={item.title}
                  className="w-full h-full object-cover transition-transform group-hover:scale-105"
                  loading="lazy"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-[var(--text-secondary)]">
                  {isTv ? <Tv className="w-4 h-4 opacity-50" /> : isBook ? <BookOpen className="w-4 h-4 opacity-50" /> : <Film className="w-4 h-4 opacity-50" />}
                </div>
              )}
            </div>

            {/* Title & Metadata */}
            <div className="flex-1 min-w-0 flex flex-col justify-center">
              <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                <span className="font-semibold text-sm text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors truncate">
                  {item.title}
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold bg-[var(--bg-tertiary)] text-[var(--text-secondary)] shrink-0 flex items-center gap-1">
                  {isAudio ? <Headphones className="w-2.5 h-2.5 text-[var(--accent)]" /> : null}
                  <span>{isAudio ? 'Audiobook' : isTv ? 'TV' : isBook ? 'Book' : 'Movie'}</span>
                </span>
                <span className="text-xs text-[var(--text-secondary)] font-mono shrink-0">
                  ({isAudio && item.narrator ? `🎙️ ${item.narrator}` : (isBook && item.author ? item.author : item.year || 'N/A')})
                </span>
              </div>

              {/* Status pill & countdown */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`px-2 py-0.5 rounded text-[10px] font-medium border ${statusCfg.bg}`}>
                  {statusCfg.label}
                </span>

                {countdown && !countdown.isAired && (
                  <span className="flex items-center gap-1 text-[10px] text-sky-400 font-medium truncate">
                    <Clock className="w-2.5 h-2.5" />
                    <span>Next: {countdown.label}</span>
                  </span>
                )}

                {item.lists && item.lists.length > 0 && (
                  <span className="text-[10px] text-[var(--accent)] font-medium truncate hidden md:inline">
                    📁 {item.lists[0]}{item.lists.length > 1 ? ` +${item.lists.length - 1}` : ''}
                  </span>
                )}

                {item.collectionName && (
                  <span className="text-[10px] text-purple-400 font-medium truncate hidden lg:inline" title={`Part of ${item.collectionName}`}>
                    ✨ {item.nextFranchiseMovieTitle ? `Next: ${item.nextFranchiseMovieTitle}` : item.collectionName}
                  </span>
                )}
              </div>
            </div>

            {/* Progress Section */}
            <div className="w-32 sm:w-44 shrink-0 hidden xs:flex flex-col justify-center gap-1">
              <div className="flex items-center justify-between text-[11px] text-[var(--text-secondary)] font-medium">
                <span className="truncate">
                  {isTv ? (
                    item.currentSeason ? `S${item.currentSeason}E${item.currentEpisode || 0}` : 'Not started'
                  ) : isBook ? (
                    isTimeMode ? (
                      totalDuration > 0
                        ? `${formatAudioDuration(currentDuration)}/${formatAudioDuration(totalDuration)}`
                        : `${formatAudioDuration(currentDuration)}`
                    ) : isChapters ? (
                      `Ch ${currentChapter}`
                    ) : (
                      `${currentPage} p`
                    )
                  ) : (
                    item.status === 'completed' ? 'Watched' : 'Watchlist'
                  )}
                </span>
                {(isTv || isBook) && (
                  <span className="font-mono text-[var(--text-primary)] text-[10px]">
                    {progressPercent}%
                  </span>
                )}
              </div>

              {(isTv || isBook) && (
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
              )}
            </div>

            {/* Rating Column */}
            <div className="w-16 sm:w-20 shrink-0 flex items-center justify-end gap-1.5">
              {userRatingFormatted ? (
                <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-[var(--accent)]/15 border border-[var(--accent)]/30 text-xs font-bold text-[#ffd60a]" title={`My Rating: ${userRatingFormatted} / ${ratingScale}`}>
                  <Star className="w-3 h-3 fill-[#ffd60a] text-[#ffd60a]" />
                  <span>{userRatingFormatted}</span>
                </span>
              ) : communityRatingFormatted ? (
                <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-[var(--bg-tertiary)] border border-[var(--border-light)] text-xs font-medium text-[var(--text-secondary)]" title={`Public / Community Rating: ${communityRatingFormatted} / ${ratingScale}${item.communityRatingCount ? ` (${item.communityRatingCount.toLocaleString()} votes)` : ''}`}>
                  <Globe className="w-3 h-3 text-sky-400" />
                  <span className="font-bold text-[var(--text-primary)]">{communityRatingFormatted}</span>
                </span>
              ) : null}
            </div>

            {/* Quick Action Button */}
            <div className="shrink-0 flex items-center">
              {isTv && !isCompleted && item.status !== 'caught_up' && (
                <button
                  type="button"
                  onClick={handleQuickAction}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[var(--accent)] hover:brightness-110 text-white text-xs font-bold transition-all active:scale-95"
                  title="Quick mark +1 episode watched"
                >
                  <Plus className="w-3 h-3" />
                  <span className="hidden sm:inline">+1 Ep</span>
                </button>
              )}

              {isBook && !isCompleted && (
                <button
                  type="button"
                  onClick={handleQuickAction}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[var(--accent)] hover:brightness-110 text-white text-xs font-bold transition-all active:scale-95"
                  title={isTimeMode ? 'Quick listen +15 mins' : (isChapters ? 'Quick read +1 chapter' : 'Quick read +10 pages')}
                >
                  <Plus className="w-3 h-3" />
                  <span className="hidden sm:inline">{isTimeMode ? '+15m' : (isChapters ? '+1 Ch' : '+10 p')}</span>
                </button>
              )}

              {!isTv && !isBook && (
                <button
                  type="button"
                  onClick={handleQuickAction}
                  className={`flex items-center gap-1 p-1.5 rounded-lg text-xs font-bold transition-all active:scale-95 ${
                    item.status === 'completed'
                      ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                      : 'bg-[var(--bg-tertiary)] hover:bg-[var(--accent)] text-[var(--text-secondary)] hover:text-white border border-[var(--border-light)]'
                  }`}
                  title={item.status === 'completed' ? 'Mark as Unwatched' : 'Mark as Watched'}
                >
                  <Check className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
