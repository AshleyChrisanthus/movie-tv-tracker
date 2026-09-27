import React from 'react';
import { Film, Tv, Star, Plus, Check, Clock, BookOpen, Globe, Headphones } from 'lucide-react';
import type { MediaItem, MediaStatus, RatingScale, GridDensity } from '../types';
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

export interface MediaCardProps {
  item: MediaItem;
  onClick: (item: MediaItem) => void;
  onQuickIncrement?: (item: MediaItem) => void;
  onQuickToggleMovie?: (item: MediaItem) => void;
  ratingScale?: RatingScale;
  density?: GridDensity;
}

export default function MediaCard({
  item,
  onClick,
  onQuickIncrement,
  onQuickToggleMovie,
  ratingScale = '10',
  density = 'comfortable'
}: MediaCardProps): React.JSX.Element {
  const isTv = item.type === 'tv';
  const isBook = item.type === 'book';
  const isAudio = isAudiobookItem(item);
  const statusCfg = isAudio
    ? (AUDIOBOOK_STATUS_CONFIG[item.status] || AUDIOBOOK_STATUS_CONFIG.plan_to_watch)
    : (isBook ? BOOK_STATUS_CONFIG[item.status] : STATUS_CONFIG[item.status]) || (isBook ? BOOK_STATUS_CONFIG.plan_to_watch : STATUS_CONFIG.plan_to_watch);

  // TV / Book / Audiobook progress calculation
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
      className={`group relative flex flex-col bg-[var(--card-bg)] hover:bg-[var(--bg-hover)] border border-[var(--border-light)] hover:border-[var(--accent)] ${
        density === 'compact' ? 'rounded-xl' : 'rounded-2xl'
      } overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-xl hover:-translate-y-1`}
    >
      {/* Poster Container */}
      <div className={`relative w-full overflow-hidden bg-[var(--bg-primary)] ${
        density === 'compact' ? 'aspect-[3/4] max-h-[175px] sm:max-h-[195px]' : 'aspect-[2/3]'
      }`}>
        {item.posterUrl ? (
          <img
            src={item.posterUrl}
            alt={item.title}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-[var(--bg-secondary)] text-[var(--text-secondary)] p-3 text-center">
            {isTv ? <Tv className="w-8 h-8 mb-1.5 opacity-40" /> : isBook ? <BookOpen className="w-8 h-8 mb-1.5 opacity-40" /> : <Film className="w-8 h-8 mb-1.5 opacity-40" />}
            <span className="text-[11px] font-medium text-[var(--text-secondary)] line-clamp-2">{item.title}</span>
          </div>
        )}

        {/* Type Badge */}
        <div className={`absolute pointer-events-none ${density === 'compact' ? 'top-1.5 left-1.5' : 'top-2.5 left-2.5'}`}>
          <span className={`flex items-center gap-1 rounded-lg bg-black/65 backdrop-blur-md border border-white/10 font-semibold text-white ${
            density === 'compact' ? 'px-1.5 py-0.5 text-[9px]' : 'px-2 py-0.5 text-[11px]'
          }`}>
            {isAudio ? (
              <Headphones className={density === 'compact' ? 'w-2.5 h-2.5 text-[var(--accent)]' : 'w-3 h-3 text-[var(--accent)]'} />
            ) : isTv ? (
              <Tv className={density === 'compact' ? 'w-2.5 h-2.5 text-[var(--accent)]' : 'w-3 h-3 text-[var(--accent)]'} />
            ) : isBook ? (
              <BookOpen className={density === 'compact' ? 'w-2.5 h-2.5 text-[var(--accent)]' : 'w-3 h-3 text-[var(--accent)]'} />
            ) : (
              <Film className={density === 'compact' ? 'w-2.5 h-2.5 text-[var(--accent)]' : 'w-3 h-3 text-[var(--accent)]'} />
            )}
            <span>{isAudio ? 'Audiobook' : isTv ? 'TV' : isBook ? 'Book' : 'Movie'}</span>
          </span>
        </div>

        {/* Quick Action Button overlay at bottom right of poster */}
        <div className={`absolute z-10 ${density === 'compact' ? 'bottom-1.5 right-1.5' : 'bottom-2.5 right-2.5'}`}>
          {isTv && !isCompleted && item.status !== 'caught_up' && (
            <button
              type="button"
              onClick={handleQuickAction}
              className={`flex items-center gap-1 rounded-xl bg-[var(--accent)] hover:brightness-110 text-white font-bold shadow-lg shadow-[var(--accent)]/30 backdrop-blur-sm transition-all active:scale-95 ${
                density === 'compact' ? 'px-2 py-1 text-[11px]' : 'px-2.5 py-1.5 text-xs'
              }`}
              title="Quick mark +1 episode watched"
            >
              <Plus className={density === 'compact' ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
              <span>+1 Ep</span>
            </button>
          )}

          {isBook && !isCompleted && (
            <button
              type="button"
              onClick={handleQuickAction}
              className={`flex items-center gap-1 rounded-xl bg-[var(--accent)] hover:brightness-110 text-white font-bold shadow-lg shadow-[var(--accent)]/30 backdrop-blur-sm transition-all active:scale-95 ${
                density === 'compact' ? 'px-2 py-1 text-[11px]' : 'px-2.5 py-1.5 text-xs'
              }`}
              title={isTimeMode ? 'Quick listen +15 mins' : (isChapters ? 'Quick read +1 chapter' : 'Quick read +10 pages')}
            >
              <Plus className={density === 'compact' ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
              <span>{isTimeMode ? '+15m' : (isChapters ? '+1 Ch' : '+10 p')}</span>
            </button>
          )}

          {!isTv && !isBook && (
            <button
              type="button"
              onClick={handleQuickAction}
              className={`flex items-center gap-1 rounded-xl font-bold shadow-lg backdrop-blur-sm transition-all active:scale-95 ${
                density === 'compact' ? 'p-1.5 text-[11px]' : 'p-2 text-xs'
              } ${
                item.status === 'completed'
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                  : 'bg-[var(--card-bg)]/90 hover:bg-[var(--accent)] text-[var(--text-primary)] hover:text-white border border-white/15'
              }`}
              title={item.status === 'completed' ? 'Mark as Unwatched' : 'Mark as Watched'}
            >
              <Check className={density === 'compact' ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className={`${density === 'compact' ? 'p-2 gap-1' : 'p-3.5 gap-2.5'} flex flex-col flex-1 justify-between`}>
        <div>
          <div className="flex items-start justify-between gap-1 mb-0.5">
            <h3 className={`font-semibold ${density === 'compact' ? 'text-[11px] sm:text-xs leading-snug' : 'text-sm'} text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors line-clamp-1`} title={item.title}>
              {item.title}
            </h3>
            {formatRating(item.rating, ratingScale) ? (
              <span className={`flex items-center gap-0.5 rounded-md bg-[var(--accent)]/15 border border-[var(--accent)]/30 ${density === 'compact' ? 'text-[9px] px-1 py-0' : 'text-[11px] px-1.5 py-0.5'} font-bold text-[#ffd60a] shrink-0`} title={`My Rating: ${formatRating(item.rating, ratingScale)} / ${ratingScale}`}>
                <Star className={`${density === 'compact' ? 'w-2 h-2' : 'w-3 h-3'} fill-[#ffd60a] text-[#ffd60a]`} />
                <span>{formatRating(item.rating, ratingScale)}</span>
              </span>
            ) : formatRating(item.communityRating, ratingScale) ? (
              <span className={`flex items-center gap-0.5 rounded-md bg-[var(--bg-tertiary)] border border-[var(--border-light)] ${density === 'compact' ? 'text-[9px] px-1 py-0' : 'text-[11px] px-1.5 py-0.5'} font-medium text-[var(--text-secondary)] shrink-0`} title={`Public / Community Rating: ${formatRating(item.communityRating, ratingScale)} / ${ratingScale}${item.communityRatingCount ? ` (${item.communityRatingCount.toLocaleString()} votes)` : ''}`}>
                <Globe className={`${density === 'compact' ? 'w-2 h-2 text-sky-400' : 'w-3 h-3 text-sky-400'}`} />
                <span className="font-bold text-[var(--text-primary)]">{formatRating(item.communityRating, ratingScale)}</span>
              </span>
            ) : null}
          </div>

          <div className={`flex items-center ${density === 'compact' ? 'gap-1 text-[10px]' : 'gap-2 text-xs'} text-[var(--text-secondary)]`}>
            <span className="truncate max-w-[100px]" title={isAudio && item.narrator ? `Narrated by ${item.narrator}` : (isBook && item.author ? item.author : undefined)}>
              {isAudio && item.narrator ? `🎙️ ${item.narrator}` : (isBook && item.author ? item.author : item.year || 'N/A')}
            </span>
            <span>•</span>
            <span className={`rounded-md font-medium border ${statusCfg.bg} ${density === 'compact' ? 'px-1 py-0 text-[9px]' : 'px-2 py-0.2 text-[10px]'}`}>
              {statusCfg.label}
            </span>
            {item.rating && item.communityRating ? (
              <>
                <span>•</span>
                <span className="flex items-center gap-0.5 text-[var(--text-secondary)]" title={`Public Rating: ${formatRating(item.communityRating, ratingScale)} / ${ratingScale}`}>
                  <Globe className="w-2.5 h-2.5 text-sky-400 shrink-0" />
                  <span>{formatRating(item.communityRating, ratingScale)}</span>
                </span>
              </>
            ) : null}
          </div>

          {item.lists && item.lists.length > 0 && (
            <div className={`flex items-center gap-1 ${density === 'compact' ? 'mt-1' : 'mt-1.5'} flex-wrap`}>
              {item.lists.slice(0, 2).map(listName => (
                <span
                  key={listName}
                  className={`rounded font-medium bg-[var(--bg-tertiary)] text-[var(--accent)] border border-[var(--border-light)] truncate max-w-[100px] ${
                    density === 'compact' ? 'px-1 py-0 text-[9px]' : 'px-1.5 py-0.5 text-[10px]'
                  }`}
                >
                  📁 {listName}
                </span>
              ))}
              {item.lists.length > 2 && (
                <span className="text-[9px] text-[var(--text-secondary)] font-mono">
                  +{item.lists.length - 2}
                </span>
              )}
            </div>
          )}
        </div>

        {/* TV Progress Details (App Directory slim track) */}
        {isTv && (
          <div className={`${density === 'compact' ? 'pt-1' : 'pt-2'} border-t border-[var(--border-light)]`}>
            <div className={`flex items-center justify-between text-[var(--text-secondary)] font-medium ${
              density === 'compact' ? 'text-[9px] sm:text-[10px] mb-1' : 'text-[11px] mb-1.5'
            }`}>
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
            <div className={`w-full bg-[var(--bg-tertiary)] rounded-full overflow-hidden ${density === 'compact' ? 'h-1' : 'h-1.5'}`}>
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
              <div className={`flex items-center gap-1 rounded-md bg-sky-500/10 border border-sky-500/20 text-sky-400 font-medium ${
                density === 'compact' ? 'mt-1 px-1.5 py-0.5 text-[9px]' : 'mt-2 px-2 py-1 text-[10px]'
              }`}>
                <Clock className="w-2.5 h-2.5 shrink-0 text-sky-400" />
                <span className="truncate">
                  {item.nextEpisodeSeason && item.nextEpisodeNumber
                    ? `S${item.nextEpisodeSeason}E${item.nextEpisodeNumber} drops ${countdown.label}`
                    : `Next ep drops ${countdown.label}`}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Book / Audiobook Progress Details */}
        {isBook && (
          <div className={`${density === 'compact' ? 'pt-1' : 'pt-2'} border-t border-[var(--border-light)]`}>
            <div className={`flex items-center justify-between text-[var(--text-secondary)] font-medium ${
              density === 'compact' ? 'text-[9px] sm:text-[10px] mb-1' : 'text-[11px] mb-1.5'
            }`}>
              <span>{isCompleted ? 'Finished' : (isAudio ? 'Listening' : 'Reading')}</span>
              <span className="font-mono text-[var(--text-primary)]">
                {isTimeMode ? (
                  totalDuration > 0
                    ? `${formatAudioDuration(currentDuration)}/${formatAudioDuration(totalDuration)} (${progressPercent}%)`
                    : `${formatAudioDuration(currentDuration)} listened`
                ) : isChapters ? (
                  totalChapters > 0
                    ? `Ch ${currentChapter}/${totalChapters} (${progressPercent}%)`
                    : `${currentChapter} ch read`
                ) : (
                  totalPages > 0
                    ? `${currentPage}/${totalPages} p (${progressPercent}%)`
                    : `${currentPage} p read`
                )}
              </span>
            </div>

            {/* Slim Reading / Listening Progress Track */}
            {(totalPages > 0 || totalChapters > 0 || totalDuration > 0) && (
              <div className={`w-full bg-[var(--bg-tertiary)] rounded-full overflow-hidden ${density === 'compact' ? 'h-1' : 'h-1.5'}`}>
                <div
                  className={`h-full transition-all duration-300 rounded-full ${
                    isCompleted
                      ? 'bg-emerald-500'
                      : 'bg-gradient-to-r from-[var(--accent)] to-[#30d158]'
                  }`}
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            )}

            {/* Total count not set hint */}
            {((isTimeMode && totalDuration === 0) || (isChapters && totalChapters === 0) || (!isTimeMode && !isChapters && totalPages === 0)) && (
              <div className="mt-0.5 text-[9px] text-[var(--text-secondary)] italic">
                Total {isTimeMode ? 'runtime' : isChapters ? 'chapters' : 'pages'} not set
              </div>
            )}
          </div>
        )}

        {/* Movie status hint & Franchise info (Issue #34) */}
        {!isTv && !isBook && (
          <div className={`${density === 'compact' ? 'pt-0.5 text-[10px]' : 'pt-1 text-[11px]'} text-[var(--text-secondary)] flex items-center justify-between gap-1`}>
            <span>{item.status === 'completed' ? 'Watched' : 'In Watchlist'}</span>
            {item.collectionName && (
              <span
                className="truncate text-[var(--accent)] font-medium text-[9px] sm:text-[10px] max-w-[130px]"
                title={`Part of ${item.collectionName}`}
              >
                {item.nextFranchiseMovieTitle ? `Next: ${item.nextFranchiseMovieTitle}` : item.collectionName}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
