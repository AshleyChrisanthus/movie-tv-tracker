import React from 'react';
import { PlayCircle, Clock, Tv, Film, BookOpen, Headphones, Star, Globe, Plus, Check } from 'lucide-react';
import type { MediaItem, RatingScale } from '../../types';
import { getEpisodeCountdown } from '../../utils/timezone';
import { formatRating } from '../../utils/rating';
import { isAudiobookItem, formatAudioDuration } from '../../utils/audioDuration';
import { isSeasonActivelyAiring } from '../../utils/duration';

export interface NowInProgressCarouselProps {
  items: MediaItem[];
  onClick: (item: MediaItem) => void;
  onQuickIncrement?: (item: MediaItem) => void;
  onQuickToggleMovie?: (item: MediaItem) => void;
  ratingScale?: RatingScale;
  onSeeAllWatching?: () => void;
}

export default function NowInProgressCarousel({
  items,
  onClick,
  onQuickIncrement,
  onQuickToggleMovie,
  ratingScale = '10',
  onSeeAllWatching
}: NowInProgressCarouselProps): React.JSX.Element | null {
  if (!items || items.length === 0) {
    return null;
  }

  return (
    <section className="md:hidden mb-5 animate-fadeIn select-none">
      {/* Section Header */}
      <div className="flex items-center justify-between pb-2 mb-2.5 border-b border-[var(--border-light)]">
        <div className="flex items-center gap-2">
          <PlayCircle className="w-4 h-4 text-[var(--accent)]" />
          <h2 className="text-sm font-bold text-[var(--text-primary)]">
            Now In Progress
          </h2>
          <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-[var(--accent)]/15 text-[var(--accent)] border border-[var(--accent)]/30">
            {items.length} active
          </span>
        </div>

        {onSeeAllWatching && (
          <button
            type="button"
            onClick={onSeeAllWatching}
            className="text-xs font-semibold text-[var(--accent)] hover:brightness-110 flex items-center gap-0.5 transition-colors cursor-pointer"
          >
            <span>See All</span>
            <span>&gt;</span>
          </button>
        )}
      </div>

      {/* Horizontal Snap Carousel */}
      <div className="flex gap-3.5 overflow-x-auto snap-x snap-mandatory no-scrollbar scrollbar-none pb-2 -mx-1 px-1">
        {items.map((item) => {
          const isTv = item.type === 'tv';
          const isBook = item.type === 'book';
          const isAudio = isAudiobookItem(item);
          const inProgressTag = isAudio ? 'Listening' : isBook ? 'Reading' : 'Watching';
          const isChapters = isBook && item.progressMode === 'chapters';
          const isTimeMode = isBook && (item.progressMode === 'time' || isAudio);

          const totalEps = item.totalEpisodes || 0;
          const airedEps = (item.airedEpisodesCount !== undefined && item.airedEpisodesCount !== null)
            ? item.airedEpisodesCount
            : totalEps;
          const isActivelyAiring = isTv && isSeasonActivelyAiring(item);
          const hasFutureUnaired = airedEps < totalEps && airedEps > 0;
          const effectiveTvTarget = (hasFutureUnaired && !isActivelyAiring) ? airedEps : totalEps;
          const watchedEps = item.watchedEpisodesCount || 0;
          const totalPages = item.totalPages || 0;
          const currentPage = item.currentPage || 0;
          const totalChapters = item.totalChapters || 0;
          const currentChapter = item.currentChapter || 0;
          const totalDuration = item.totalDurationSeconds || 0;
          const currentDuration = item.currentDurationSeconds || 0;

          const progressPercent = isTv
            ? (effectiveTvTarget > 0 ? Math.min(100, Math.round((watchedEps / effectiveTvTarget) * 100)) : 0)
            : isBook
            ? isTimeMode
              ? (totalDuration > 0 ? Math.min(100, Math.round((currentDuration / totalDuration) * 100)) : 0)
              : isChapters
              ? (totalChapters > 0 ? Math.min(100, Math.round((currentChapter / totalChapters) * 100)) : 0)
              : (totalPages > 0 ? Math.min(100, Math.round((currentPage / totalPages) * 100)) : 0)
            : 0;

          // Next episode countdown
          const countdown = isTv && (item.nextAirDate || item.nextAirstamp)
            ? getEpisodeCountdown(item.nextAirDate || undefined, item.nextAirstamp, item.networkTimezone)
            : null;

          const formattedPersonal = formatRating(item.rating, ratingScale);
          const formattedCommunity = formatRating(item.communityRating, ratingScale);
          const displayRating = formattedPersonal || formattedCommunity;

          // Pointer subtitle
          let subtitle = '';
          if (isTv) {
            const seasonEp = item.currentSeason
              ? `S${item.currentSeason} E${item.currentEpisode || 1}`
              : 'Up Next';
            subtitle = seasonEp;
          } else if (isAudio) {
            subtitle = `${formatAudioDuration(currentDuration)} • Listening`;
          } else if (isChapters) {
            subtitle = `Chapter ${currentChapter || 1} • Reading`;
          } else if (isBook) {
            subtitle = `Page ${currentPage} • Reading`;
          } else {
            subtitle = item.year ? `${item.year} • In Progress` : 'In Progress';
          }

          // Progress label
          let progressLabel = '';
          if (isTv) {
            progressLabel = (hasFutureUnaired && !isActivelyAiring)
              ? `${watchedEps} / ${airedEps} aired`
              : `${watchedEps} / ${totalEps} eps`;
          } else if (isAudio || isTimeMode) {
            progressLabel = `${formatAudioDuration(currentDuration)} / ${formatAudioDuration(totalDuration)}`;
          } else if (isChapters) {
            progressLabel = `${currentChapter} / ${totalChapters} ch`;
          } else if (isBook) {
            progressLabel = `${currentPage} / ${totalPages} p`;
          }

          const handleQuickAction = (e: React.MouseEvent) => {
            e.stopPropagation();
            if (isTv || isBook) {
              onQuickIncrement?.(item);
            } else {
              onQuickToggleMovie?.(item);
            }
          };

          const artworkUrl = item.backdropUrl || item.posterUrl;
          const streamingProvider = item.streamingProviders?.[0];
          const extraProvidersCount = (item.streamingProviders?.length || 0) - 1;

          return (
            <div
              key={`progress_${item.id}`}
              onClick={() => onClick(item)}
              className="w-[270px] sm:w-[300px] shrink-0 snap-start rounded-2xl bg-[var(--card-bg)] border border-[var(--border-light)] overflow-hidden shadow-lg transition-all active:scale-[0.99] cursor-pointer flex flex-col justify-between group"
            >
              {/* 16:10 Landscape Image Header */}
              <div className="relative aspect-[16/10] w-full overflow-hidden bg-[var(--bg-secondary)]">
                {artworkUrl ? (
                  <img
                    src={artworkUrl}
                    alt={item.title}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center p-4 bg-gradient-to-br from-[var(--bg-secondary)] to-[var(--bg-tertiary)] text-[var(--text-secondary)]">
                    {isAudio ? (
                      <Headphones className="w-8 h-8 opacity-40 text-[var(--accent)]" />
                    ) : isTv ? (
                      <Tv className="w-8 h-8 opacity-40 text-[var(--accent)]" />
                    ) : isBook ? (
                      <BookOpen className="w-8 h-8 opacity-40 text-[var(--accent)]" />
                    ) : (
                      <Film className="w-8 h-8 opacity-40 text-[var(--accent)]" />
                    )}
                    <span className="text-xs font-semibold mt-2 line-clamp-1">{item.title}</span>
                  </div>
                )}

                {/* Scrim Overlays */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-black/60 pointer-events-none" />

                {/* Top-Left Media Type Badge */}
                <div className="absolute top-2.5 left-2.5 z-10 pointer-events-none">
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-black/65 backdrop-blur-md border border-white/15 text-[10px] font-bold text-white">
                    {isAudio ? (
                      <Headphones className="w-3 h-3 text-[var(--accent)]" />
                    ) : isTv ? (
                      <Tv className="w-3 h-3 text-[var(--accent)]" />
                    ) : isBook ? (
                      <BookOpen className="w-3 h-3 text-[var(--accent)]" />
                    ) : (
                      <Film className="w-3 h-3 text-[var(--accent)]" />
                    )}
                    <span>{isAudio ? 'Audio' : isTv ? 'TV' : isBook ? 'Book' : 'Movie'}</span>
                  </span>
                </div>

                {/* Top-Right Rating Badge */}
                {displayRating && (
                  <div className="absolute top-2.5 right-2.5 z-10 pointer-events-none">
                    <span className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-black/65 backdrop-blur-md border border-white/15 text-[10px] font-bold text-white">
                      {formattedPersonal ? (
                        <Star className="w-3 h-3 fill-[#ffd60a] text-[#ffd60a]" />
                      ) : (
                        <Globe className="w-3 h-3 text-sky-400" />
                      )}
                      <span>{displayRating}</span>
                    </span>
                  </div>
                )}

                {/* Bottom-Left Countdown or Watching Badge */}
                <div className="absolute bottom-2 left-2.5 right-2.5 z-10 pointer-events-none">
                  {countdown && !countdown.isAired ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-sky-500/85 backdrop-blur-md text-white text-[10px] font-semibold max-w-full truncate shadow-sm">
                      <Clock className="w-2.5 h-2.5 shrink-0" />
                      <span className="truncate">
                        {item.nextEpisodeSeason && item.nextEpisodeNumber
                          ? `S${item.nextEpisodeSeason} E${item.nextEpisodeNumber} in ${countdown.label}`
                          : `Drops in ${countdown.label}`}
                      </span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-amber-500/80 backdrop-blur-md text-white text-[10px] font-bold tracking-wide shadow-sm">
                      <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                      <span>{inProgressTag}</span>
                    </span>
                  )}
                </div>
              </div>

              {/* Card Body */}
              <div className="p-3 flex flex-col gap-1.5">
                <div className="flex flex-col">
                  <h3 className="font-bold text-xs sm:text-sm text-[var(--text-primary)] truncate group-hover:text-[var(--accent)] transition-colors">
                    {item.title}
                  </h3>
                  <span className="text-[11px] font-medium text-[var(--text-secondary)] truncate">
                    {subtitle}
                  </span>
                </div>

                {/* Progress Row */}
                <div className="mt-0.5">
                  <div className="flex items-center justify-between text-[10px] font-mono text-[var(--text-secondary)] mb-1">
                    <span>{progressLabel}</span>
                    <span className="font-bold text-[var(--accent)]">{progressPercent}%</span>
                  </div>
                  <div className="w-full bg-[var(--bg-tertiary)] rounded-full h-1.5 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-[var(--accent)] to-[#30d158] rounded-full transition-all duration-300"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </div>

                {/* Card Footer */}
                <div className="flex items-center justify-between pt-2 mt-1 border-t border-[var(--border-light)]">
                  {/* Left: Primary Streaming Provider / Tag */}
                  <div className="min-w-0 pr-1">
                    {streamingProvider ? (
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[10px] font-semibold truncate max-w-[140px]"
                        title={streamingProvider.name}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                        <span className="truncate">{streamingProvider.name}</span>
                        {extraProvidersCount > 0 && (
                          <span className="text-[9px] opacity-80">+{extraProvidersCount}</span>
                        )}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] text-[var(--text-tertiary)] font-medium">
                        <span>{item.year || (isBook ? 'Book' : 'Media')}</span>
                      </span>
                    )}
                  </div>

                  {/* Right: Prominent Accent 1-Tap Action Button */}
                  <button
                    type="button"
                    onClick={handleQuickAction}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-[var(--accent)] hover:brightness-110 text-white font-bold text-xs shadow-md shadow-[var(--accent)]/30 active:scale-95 transition-all cursor-pointer shrink-0"
                    title={
                      isTv
                        ? 'Quick log +1 Episode'
                        : isAudio
                        ? 'Quick log +15 minutes'
                        : isChapters
                        ? 'Quick log +1 Chapter'
                        : isBook
                        ? 'Quick log +10 Pages'
                        : 'Toggle Watched'
                    }
                  >
                    {isTv ? (
                      <>
                        <Plus className="w-3 h-3" />
                        <span>+1 Ep</span>
                      </>
                    ) : isAudio ? (
                      <>
                        <Plus className="w-3 h-3" />
                        <span>+15m</span>
                      </>
                    ) : isChapters ? (
                      <>
                        <Plus className="w-3 h-3" />
                        <span>+1 Ch</span>
                      </>
                    ) : isBook ? (
                      <>
                        <Plus className="w-3 h-3" />
                        <span>+10 p</span>
                      </>
                    ) : (
                      <>
                        <Check className="w-3 h-3" />
                        <span>Done</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
