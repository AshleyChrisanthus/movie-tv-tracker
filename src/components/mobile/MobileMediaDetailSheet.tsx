import React, { useState, useEffect, useMemo } from 'react';
import {
  ChevronLeft, ChevronDown, Pin, Palette, Network, Share2, Play, PlayCircle,
  Clock, Bell, Check, CheckCircle2, CheckCheck, Globe, ThumbsUp, RefreshCw,
  Film, Tv, BookOpen, Headphones, Star, X
} from 'lucide-react';
import type { MediaItem, EpisodeItem, MediaStatus, RatingScale, WatchProvider, BookEdition, TMDBCollectionPart, RuntimeDisplayFormat } from '../../types';
import {
  getEpisodesForMedia, toggleEpisodeWatched, setExactProgress,
  setSeasonWatched, updateMediaStatus, updateMediaRatingAndNotes,
  deleteMediaItem, getMediaById, markEpisodesUpToWatched,
  updateBookProgress, toggleMediaPinned
} from '../../db';
import { syncMediaEpisodes, syncMovieStreamingDetails } from '../../services/api';
import { formatEpisodeAirDate, getEpisodeCountdown, isEpisodeAired } from '../../utils/timezone';
import { useLiveTicker } from '../../hooks/useLiveTicker';
import { formatRating, normalizeRating, denormalizeRating } from '../../utils/rating';
import { formatAudioDuration, isAudiobookItem } from '../../utils/audioDuration';
import { formatRuntime, calculateSeasonRuntime, isSeasonActivelyAiring } from '../../utils/duration';

export interface MobileMediaDetailSheetProps {
  media: MediaItem;
  isOpen?: boolean;
  onClose: () => void;
  onUpdated?: () => void;
  onUpdate?: (updated: MediaItem) => void;
  onDelete?: (id: string) => void;
  onEditCustom?: (media: MediaItem) => void;
  onOpenInCanvas?: (media: MediaItem) => void;
  ratingScale?: RatingScale;
  onRatingScaleChange?: (scale: RatingScale) => void;
  onOpenThemeModal?: () => void;
  runtimeDisplayFormat?: RuntimeDisplayFormat;

  // Optional lifted state and handlers from MediaDetailModal
  episodes?: EpisodeItem[];
  selectedSeason?: number | null;
  onSelectSeason?: (sNum: number) => void;
  onToggleEpisode?: (ep: EpisodeItem) => Promise<void> | void;
  onMarkUpTo?: (ep: EpisodeItem) => Promise<void> | void;
  onToggleSeason?: (sNum: number, markWatched: boolean) => Promise<void> | void;
  onApplyExactProgress?: (s: number, e: number) => Promise<void> | void;
  onStatusChange?: (status: MediaStatus) => Promise<void> | void;
  onTogglePin?: () => Promise<void> | void;
  isPinned?: boolean;
  onSync?: () => Promise<void> | void;
  isSyncing?: boolean;
  onApplyBookProgress?: (options: { currentPage?: number; currentChapter?: number; currentDurationSeconds?: number }) => Promise<void> | void;
  onQuickAudioIncrement?: (seconds: number) => Promise<void> | void;
  onRatingCommit?: (valStr: string) => Promise<void> | void;
}

export default function MobileMediaDetailSheet({
  media,
  isOpen = true,
  onClose,
  onUpdated,
  onUpdate,
  onDelete,
  onEditCustom,
  onOpenInCanvas,
  ratingScale = '10',
  onRatingScaleChange,
  onOpenThemeModal,
  runtimeDisplayFormat = 'hours_minutes',

  episodes: propsEpisodes,
  selectedSeason: propsSelectedSeason,
  onSelectSeason: propsOnSelectSeason,
  onToggleEpisode: propsOnToggleEpisode,
  onMarkUpTo: propsOnMarkUpTo,
  onToggleSeason: propsOnToggleSeason,
  onApplyExactProgress: propsOnApplyExactProgress,
  onStatusChange: propsOnStatusChange,
  onTogglePin: propsOnTogglePin,
  isPinned: propsIsPinned,
  onSync: propsOnSync,
  isSyncing: propsIsSyncing,
  onApplyBookProgress: propsOnApplyBookProgress,
  onQuickAudioIncrement: propsOnQuickAudioIncrement,
  onRatingCommit: propsOnRatingCommit
}: MobileMediaDetailSheetProps): React.JSX.Element | null {
  if (!isOpen || !media) return null;

  // Live episode countdown ticker & tab wake listener (Issue #55)
  useLiveTicker();

  const isTv = media.type === 'tv';
  const isBook = media.type === 'book';
  const isMovie = media.type === 'movie';
  const isAudio = isAudiobookItem(media);
  const isChapters = isBook && media.progressMode === 'chapters';
  const isTimeMode = isBook && (media.progressMode === 'time' || isAudio);

  // Local fallback states if not provided by parent
  const [internalEpisodes, setInternalEpisodes] = useState<EpisodeItem[]>([]);
  const [internalSelectedSeason, setInternalSelectedSeason] = useState<number | null>(media.currentSeason || 1);
  const [currentStatus, setCurrentStatus] = useState<MediaStatus>(media.status || 'plan_to_watch');
  const [currentPinned, setCurrentPinned] = useState<boolean>(Boolean(media.isPinned));
  const [internalIsSyncing, setInternalIsSyncing] = useState<boolean>(false);
  const [isSynopsisExpanded, setIsSynopsisExpanded] = useState<boolean>(false);
  const [shareCopied, setShareCopied] = useState<boolean>(false);
  const [showBatchActions, setShowBatchActions] = useState<boolean>(false);
  const [showRatingSheet, setShowRatingSheet] = useState<boolean>(false);
  const [ratingInput, setRatingInput] = useState<string>(() => {
    const denorm = denormalizeRating(media.rating, ratingScale);
    return denorm !== null ? String(denorm) : '';
  });
  const [customSeasonInput, setCustomSeasonInput] = useState<number>(media.currentSeason || 1);
  const [customEpisodeInput, setCustomEpisodeInput] = useState<number>(media.currentEpisode || 0);
  const [customPageInput, setCustomPageInput] = useState<number>(media.currentPage || 0);

  // Load episodes if not provided
  useEffect(() => {
    if (propsEpisodes !== undefined) return;
    if (!isTv) return;

    let mounted = true;
    getEpisodesForMedia(media.id).then((eps) => {
      if (mounted) {
        setInternalEpisodes(eps);
        if (eps.length > 0 && !internalSelectedSeason) {
          const current = media.currentSeason || 1;
          const currentExists = eps.some(e => e.seasonNumber === current);
          setInternalSelectedSeason(currentExists ? current : (eps[0]?.seasonNumber || 1));
        }
      }
    });

    return () => {
      mounted = false;
    };
  }, [media.id, isTv, propsEpisodes]);

  // Keep pinned and status in sync with media prop
  useEffect(() => {
    setCurrentStatus(media.status || 'plan_to_watch');
    setCurrentPinned(Boolean(media.isPinned));
  }, [media.status, media.isPinned]);

  const episodes = propsEpisodes !== undefined ? propsEpisodes : internalEpisodes;
  const isSyncing = propsIsSyncing !== undefined ? propsIsSyncing : internalIsSyncing;

  // Season calculations
  const seasonNumbers = useMemo(() => {
    return Array.from(new Set(episodes.map(ep => ep.seasonNumber))).sort((a, b) => a - b);
  }, [episodes]);

  const activeSeason = propsSelectedSeason !== undefined && propsSelectedSeason !== null
    ? propsSelectedSeason
    : (internalSelectedSeason !== null ? internalSelectedSeason : (media.currentSeason || seasonNumbers[0] || 1));

  const setSelectedSeason = (sNum: number) => {
    if (propsOnSelectSeason) {
      propsOnSelectSeason(sNum);
    } else {
      setInternalSelectedSeason(sNum);
    }
  };

  const currentSeasonEpisodes = useMemo(() => {
    return episodes.filter(ep => ep.seasonNumber === activeSeason);
  }, [episodes, activeSeason]);

  // Find next unwatched episode
  const nextUpEpisode = useMemo(() => {
    return episodes.find(ep => ep.isWatched === 0);
  }, [episodes]);

  // Find upcoming scheduled episode (airing in future)
  const upcomingEp = useMemo(() => {
    return episodes.find(e => !isEpisodeAired(e, media.networkTimezone));
  }, [episodes, media.networkTimezone]);

  // Progress computations
  const totalEps = media.totalEpisodes || episodes.length || 0;
  const airedEpisodes = episodes.length > 0 ? episodes.filter(e => isEpisodeAired(e, media.networkTimezone)) : [];
  const airedEps = episodes.length > 0
    ? airedEpisodes.length
    : (media.airedEpisodesCount ?? totalEps);
  const isActivelyAiring = isTv && isSeasonActivelyAiring(media, episodes);
  const hasFutureUnaired = airedEps < totalEps && airedEps > 0;
  const effectiveTvTarget = (hasFutureUnaired && !isActivelyAiring) ? airedEps : totalEps;
  const watchedEps = media.watchedEpisodesCount || episodes.filter(e => e.isWatched === 1).length;
  const totalPages = media.totalPages || 0;
  const currentPage = media.currentPage || 0;
  const totalChapters = media.totalChapters || 0;
  const currentChapter = media.currentChapter || 0;
  const totalDuration = media.totalDurationSeconds || 0;
  const currentDuration = media.currentDurationSeconds || 0;

  const progressPercent = isTv
    ? (effectiveTvTarget > 0 ? Math.min(100, Math.round((watchedEps / effectiveTvTarget) * 100)) : 0)
    : isBook
    ? isTimeMode
      ? (totalDuration > 0 ? Math.min(100, Math.round((currentDuration / totalDuration) * 100)) : 0)
      : isChapters
      ? (totalChapters > 0 ? Math.min(100, Math.round((currentChapter / totalChapters) * 100)) : 0)
      : (totalPages > 0 ? Math.min(100, Math.round((currentPage / totalPages) * 100)) : 0)
    : isMovie
    ? (currentStatus === 'completed' ? 100 : 0)
    : 0;

  // Metadata line calculations
  const year = media.year || (media.releaseDate ? media.releaseDate.substring(0, 4) : '');
  const genreStr = Array.isArray(media.genres) && media.genres.length > 0
    ? media.genres.slice(0, 2).join(', ')
    : (media.genres || (isTv ? 'TV Series' : isBook ? 'Book' : 'Movie'));
  const cert = media.certification ? media.certification.trim() : '';
  const seasonRuntimeMinutes = isTv ? calculateSeasonRuntime(episodes, activeSeason, media.runtime) : 0;
  const runtime = isTv
    ? (media.runtime ? `~${media.runtime}m/ep` : (seasonRuntimeMinutes > 0 ? formatRuntime(seasonRuntimeMinutes, runtimeDisplayFormat) : ''))
    : isBook
    ? (isAudio ? (totalDuration > 0 ? formatAudioDuration(totalDuration) : '') : (totalPages && totalPages > 0 ? `${totalPages}p` : ''))
    : (media.runtime && media.runtime > 0 ? formatRuntime(media.runtime, runtimeDisplayFormat) : '');
  const remainingRuntimeStr = Boolean(media.remainingRuntimeMinutes && media.remainingRuntimeMinutes > 0 && currentStatus !== 'completed' && currentStatus !== 'caught_up')
    ? `${formatRuntime(media.remainingRuntimeMinutes, runtimeDisplayFormat)} left`
    : '';

  // Rating and scores
  const formattedPersonal = formatRating(media.rating, ratingScale);
  const formattedCommunity = formatRating(media.communityRating, ratingScale);
  const scorePct = Math.round(
    media.communityRating !== undefined && media.communityRating !== null
      ? (media.communityRating / 10) * 100
      : 98
  );

  // Status pills definitions
  const statusOptions: { key: MediaStatus; label: string; dotColor: string }[] = [
    { key: 'watching', label: 'Watching', dotColor: '#f59e0b' },
    { key: 'plan_to_watch', label: 'Plan to Watch', dotColor: '#38bdf8' },
    { key: 'caught_up', label: 'Caught Up', dotColor: '#10b981' },
    { key: 'completed', label: 'Completed', dotColor: '#22c55e' },
    { key: 'on_hold', label: 'On Hold', dotColor: '#a855f7' },
    { key: 'dropped', label: 'Dropped', dotColor: '#f43f5e' },
  ];

  // Action handlers
  const handleShare = async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({
          title: media.title,
          text: `Check out ${media.title} on BingeLog!`,
          url: window.location.href,
        });
      } else if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(`${media.title} - ${window.location.href}`);
        setShareCopied(true);
        setTimeout(() => setShareCopied(false), 2500);
      }
    } catch {
      // User cancelled share
    }
  };

  const doTogglePin = async () => {
    if (propsOnTogglePin) {
      await propsOnTogglePin();
      setCurrentPinned(!currentPinned);
      return;
    }
    const next = await toggleMediaPinned(media.id);
    setCurrentPinned(next);
    const updated = { ...media, isPinned: next, pinnedAt: next ? new Date().toISOString() : undefined };
    if (onUpdated) onUpdated();
    if (onUpdate) onUpdate(updated);
  };

  const doStatusChange = async (newStatus: MediaStatus) => {
    try {
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(15);
      }
    } catch {}

    setCurrentStatus(newStatus);
    if (propsOnStatusChange) {
      await propsOnStatusChange(newStatus);
      return;
    }
    await updateMediaStatus(media.id, newStatus);
    const updated = await getMediaById(media.id);
    if (onUpdated) onUpdated();
    if (onUpdate && updated) onUpdate(updated);
  };

  const doToggleEpisode = async (ep: EpisodeItem) => {
    try {
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(12);
      }
    } catch {}

    if (propsOnToggleEpisode) {
      await propsOnToggleEpisode(ep);
      return;
    }

    await toggleEpisodeWatched(media.id, ep.seasonNumber, ep.episodeNumber);
    const [refreshedEps, updated] = await Promise.all([
      getEpisodesForMedia(media.id),
      getMediaById(media.id)
    ]);
    setInternalEpisodes(refreshedEps);
    if (onUpdated) onUpdated();
    if (onUpdate && updated) onUpdate(updated);
  };

  const doMarkUpTo = async (ep: EpisodeItem) => {
    if (propsOnMarkUpTo) {
      await propsOnMarkUpTo(ep);
      return;
    }

    await markEpisodesUpToWatched(media.id, ep.seasonNumber, ep.episodeNumber);
    const [refreshedEps, updated] = await Promise.all([
      getEpisodesForMedia(media.id),
      getMediaById(media.id)
    ]);
    setInternalEpisodes(refreshedEps);
    if (onUpdated) onUpdated();
    if (onUpdate && updated) onUpdate(updated);
  };

  const doToggleSeason = async (seasonNum: number, markWatched: boolean) => {
    if (propsOnToggleSeason) {
      await propsOnToggleSeason(seasonNum, markWatched);
      setShowBatchActions(false);
      return;
    }

    await setSeasonWatched(media.id, seasonNum, markWatched);
    const [refreshedEps, updated] = await Promise.all([
      getEpisodesForMedia(media.id),
      getMediaById(media.id)
    ]);
    setInternalEpisodes(refreshedEps);
    setShowBatchActions(false);
    if (onUpdated) onUpdated();
    if (onUpdate && updated) onUpdate(updated);
  };

  const doApplyExactProgress = async (s: number, e: number) => {
    if (propsOnApplyExactProgress) {
      await propsOnApplyExactProgress(s, e);
      setShowBatchActions(false);
      return;
    }

    await setExactProgress(media.id, s, e, true);
    const [refreshedEps, updated] = await Promise.all([
      getEpisodesForMedia(media.id),
      getMediaById(media.id)
    ]);
    setInternalEpisodes(refreshedEps);
    setShowBatchActions(false);
    if (onUpdated) onUpdated();
    if (onUpdate && updated) onUpdate(updated);
  };

  const doSync = async () => {
    if (propsOnSync) {
      await propsOnSync();
      return;
    }

    if (isTv) {
      setInternalIsSyncing(true);
      try {
        await syncMediaEpisodes(media);
        const [refreshedEps, updated] = await Promise.all([
          getEpisodesForMedia(media.id),
          getMediaById(media.id)
        ]);
        setInternalEpisodes(refreshedEps);
        if (onUpdated) onUpdated();
        if (onUpdate && updated) onUpdate(updated);
      } finally {
        setInternalIsSyncing(false);
      }
    } else if (isMovie) {
      setInternalIsSyncing(true);
      try {
        await syncMovieStreamingDetails(media);
        const updated = await getMediaById(media.id);
        if (onUpdated) onUpdated();
        if (onUpdate && updated) onUpdate(updated);
      } finally {
        setInternalIsSyncing(false);
      }
    }
  };

  const doRatingCommit = async () => {
    if (propsOnRatingCommit) {
      await propsOnRatingCommit(ratingInput);
      setShowRatingSheet(false);
      return;
    }

    const norm = normalizeRating(ratingInput, ratingScale);
    await updateMediaRatingAndNotes(media.id, norm !== null ? norm : 0, media.notes || '');
    setShowRatingSheet(false);
    const updated = await getMediaById(media.id);
    if (onUpdated) onUpdated();
    if (onUpdate && updated) onUpdate(updated);
  };

  // Primary thumb CTA click handler
  const handlePrimaryCtaClick = async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(20);
      }
    } catch {}

    if (isTv) {
      if (nextUpEpisode) {
        await doToggleEpisode(nextUpEpisode);
      } else {
        // All caught up, toggle or mark watching
        await doStatusChange('completed');
      }
    } else if (isBook) {
      if (isAudio) {
        if (propsOnQuickAudioIncrement) {
          await propsOnQuickAudioIncrement(900); // +15 mins
        } else {
          const next = Math.min(totalDuration, currentDuration + 900);
          await updateBookProgress(media.id, { currentDurationSeconds: next, totalDurationSeconds: totalDuration, progressMode: 'time' });
          const updated = await getMediaById(media.id);
          if (onUpdated) onUpdated();
          if (onUpdate && updated) onUpdate(updated);
        }
      } else if (isChapters) {
        if (propsOnApplyBookProgress) {
          await propsOnApplyBookProgress({ currentChapter: currentChapter + 1 });
        } else {
          const next = Math.min(totalChapters, currentChapter + 1);
          await updateBookProgress(media.id, { currentChapter: next, totalChapters, progressMode: 'chapters' });
          const updated = await getMediaById(media.id);
          if (onUpdated) onUpdated();
          if (onUpdate && updated) onUpdate(updated);
        }
      } else {
        if (propsOnApplyBookProgress) {
          await propsOnApplyBookProgress({ currentPage: currentPage + 10 });
        } else {
          const next = Math.min(totalPages, currentPage + 10);
          await updateBookProgress(media.id, { currentPage: next, totalPages, progressMode: 'pages' });
          const updated = await getMediaById(media.id);
          if (onUpdated) onUpdated();
          if (onUpdate && updated) onUpdate(updated);
        }
      }
    } else if (isMovie) {
      const nextStatus: MediaStatus = currentStatus === 'completed' ? 'watching' : 'completed';
      await doStatusChange(nextStatus);
    }
  };

  // Streaming watch providers
  const watchProviders: WatchProvider[] = (media.streamingProviders || (media as unknown as { watchProviders?: WatchProvider[] }).watchProviders || []);

  return (
    <div className="fixed inset-0 z-50 md:hidden flex flex-col justify-end bg-black/75 backdrop-blur-sm animate-fadeIn">
      {/* 1. Mobile Top Navigation Bar */}
      <div className="sticky top-0 z-30 flex items-center justify-between px-4 py-3 bg-[var(--card-bg)]/95 backdrop-blur-md border-b border-[var(--border-light)] shrink-0">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            aria-label="Back"
            className="p-1.5 -ml-1.5 rounded-full text-[var(--text-secondary)] hover:text-white hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-sky-600 to-blue-500 flex items-center justify-center text-white shadow-sm shadow-blue-500/20 shrink-0">
            <Play className="w-3.5 h-3.5 fill-white ml-0.5" />
          </div>
          <h1 className="text-sm font-bold text-white tracking-tight">
            Media Details
          </h1>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={doTogglePin}
            aria-label="Pin"
            title={currentPinned ? 'Unpin' : 'Pin'}
            className="p-2 rounded-full text-[var(--text-secondary)] hover:text-white hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
          >
            <Pin className={`w-4 h-4 ${currentPinned ? 'fill-[var(--accent)] text-[var(--accent)]' : ''}`} />
          </button>

          <button
            type="button"
            onClick={() => onOpenThemeModal && onOpenThemeModal()}
            aria-label="Theme"
            className="p-2 rounded-full text-[var(--text-secondary)] hover:text-white hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
          >
            <Palette className="w-4 h-4 text-[var(--accent)]" />
          </button>
        </div>
      </div>

      {/* Bottom Sheet Surface */}
      <div className="relative z-10 w-full max-h-[92vh] overflow-y-auto bg-[var(--card-bg)] border-t border-[var(--border-light)] rounded-t-3xl shadow-2xl flex flex-col no-scrollbar scrollbar-none animate-slideUp">
        {/* Centered Drag Handle Pill */}
        <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mt-2.5 mb-1.5 shrink-0" />

        {/* Sheet Action Row */}
        <div className="flex items-center justify-between px-4 pb-2.5 border-b border-[var(--border-light)] shrink-0">
          <button
            type="button"
            onClick={onClose}
            aria-label="Collapse"
            className="p-1.5 rounded-full bg-[var(--bg-secondary)] border border-[var(--border-light)] text-[var(--text-secondary)] hover:text-white transition-all cursor-pointer"
          >
            <ChevronDown className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onOpenInCanvas && onOpenInCanvas(media)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-[var(--bg-secondary)] hover:bg-[var(--bg-hover)] border border-[var(--border-light)] text-[var(--text-primary)] transition-all cursor-pointer"
            >
              <Network className="w-3.5 h-3.5 text-purple-400" />
              <span>Franchise Canvas</span>
            </button>

            <button
              type="button"
              onClick={handleShare}
              aria-label="Share"
              title={shareCopied ? 'Link copied!' : 'Share'}
              className="p-1.5 rounded-full bg-[var(--bg-secondary)] border border-[var(--border-light)] text-[var(--text-secondary)] hover:text-white transition-all cursor-pointer"
            >
              <Share2 className={`w-4 h-4 ${shareCopied ? 'text-emerald-400' : ''}`} />
            </button>
          </div>
        </div>

        {/* 2. Side-by-Side Hero Metadata Block */}
        <div className="flex items-start gap-3.5 p-4 shrink-0">
          {/* Left Column Poster */}
          <div className="relative w-24 sm:w-28 aspect-[2/3] rounded-xl overflow-hidden shadow-lg border border-white/10 shrink-0 bg-zinc-950">
            {media.posterUrl ? (
              <img src={media.posterUrl} alt={media.title} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-zinc-800 text-zinc-500">
                {isTv ? <Tv className="w-8 h-8" /> : isBook ? <BookOpen className="w-8 h-8" /> : <Film className="w-8 h-8" />}
              </div>
            )}
            <div className="absolute top-1.5 left-1.5 px-2 py-0.5 rounded-md bg-black/80 backdrop-blur-md border border-white/15 text-[10px] font-bold text-white shadow-sm flex items-center gap-1">
              {isTv ? '📺 TV' : isBook ? (isAudio ? '🎧 Audio' : '📖 Book') : '🎬 Movie'}
            </div>
          </div>

          {/* Right Column Details */}
          <div className="flex-1 min-w-0 flex flex-col gap-1.5">
            <h2 className="text-xl font-bold text-white leading-tight break-words" title={media.title}>
              {media.title}
            </h2>

            <div className="text-xs text-[var(--text-secondary)] font-medium truncate">
              {[year, genreStr, cert, runtime, remainingRuntimeStr].filter(Boolean).join(' • ')}
            </div>

            {/* Rating & Score Pills Row */}
            <div className="flex items-center gap-2 flex-wrap text-xs pt-0.5">
              <button
                type="button"
                onClick={() => setShowRatingSheet(!showRatingSheet)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-black/60 border border-white/15 text-white font-medium hover:border-[var(--accent)] transition-all cursor-pointer"
                title="Rate or update personal score"
              >
                <Globe className="w-3.5 h-3.5 text-sky-400" />
                <span>{formattedCommunity || formattedPersonal || 'Rate'}</span>
                <span className="text-[10px] text-zinc-400">/ {ratingScale}</span>
              </button>

              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-semibold text-xs">
                <ThumbsUp className="w-3 h-3 text-emerald-400" />
                <span>{scorePct}% Score</span>
              </span>
            </div>

            {/* Clamped Synopsis with Read More Toggle */}
            <div onClick={() => setIsSynopsisExpanded(!isSynopsisExpanded)} className="cursor-pointer group pt-1">
              <p className={`text-xs text-[var(--text-secondary)] leading-relaxed transition-all ${isSynopsisExpanded ? 'line-clamp-none' : 'line-clamp-3'}`}>
                {(media as unknown as { synopsis?: string }).synopsis || media.overview || 'No synopsis available for this media item.'}
              </p>
              <span className="text-[10px] text-[var(--accent)] font-semibold mt-0.5 inline-block group-hover:underline">
                {isSynopsisExpanded ? 'Show less' : 'Read more'}
              </span>
            </div>
          </div>
        </div>

        {/* Rating Adjustment Drawer (when tapped) */}
        {showRatingSheet && (
          <div className="mx-4 mb-3 p-3 rounded-2xl bg-[var(--bg-secondary)] border border-[var(--accent)]/40 flex items-center justify-between gap-3 text-xs animate-fadeIn">
            <div className="flex items-center gap-2">
              <Star className="w-4 h-4 text-[var(--accent)] shrink-0" />
              <span className="text-white font-medium">Your Rating (/{ratingScale}):</span>
              <input
                type="number"
                step="any"
                min="0"
                max={ratingScale === '100' ? 100 : ratingScale === '5' ? 5 : 10}
                value={ratingInput}
                onChange={(e) => setRatingInput(e.target.value)}
                placeholder="0"
                className="w-16 px-2 py-1 rounded-lg bg-[var(--input-bg)] border border-[var(--input-border)] text-white text-center font-bold"
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={doRatingCommit}
                className="px-3 py-1 rounded-lg bg-[var(--accent)] text-white font-bold text-xs cursor-pointer"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => setShowRatingSheet(false)}
                className="p-1 rounded-full text-zinc-400 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* 3. Horizontal Status Pill Selector */}
        <div className="px-4 pb-3 shrink-0">
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar scrollbar-none py-1">
            {statusOptions.map((opt) => {
              const isActive = currentStatus === opt.key;
              const isWatchingActive = isActive && opt.key === 'watching';

              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => doStatusChange(opt.key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold shrink-0 transition-all cursor-pointer ${
                    isWatchingActive
                      ? 'border border-amber-500/60 bg-amber-500/15 text-amber-300 font-bold shadow-sm shadow-amber-500/10'
                      : isActive
                      ? 'border border-[var(--accent)]/60 bg-[var(--accent)]/15 text-[var(--accent)] font-bold shadow-sm'
                      : 'bg-[var(--bg-secondary)] border border-[var(--border-light)] text-[var(--text-secondary)] hover:text-white'
                  }`}
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: opt.dotColor }}
                  />
                  <span>{opt.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 4. "Current Pace" Progress & Next-Up Action Card */}
        <div className="mx-4 mb-4 p-4 rounded-2xl bg-[var(--bg-secondary)] border border-[var(--border-light)] space-y-3 shadow-sm shrink-0">
          {/* Header Row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <PlayCircle className="w-4 h-4 text-[var(--accent)]" />
              <span className="text-sm font-bold text-white">Current Pace</span>
            </div>

            <span className="text-xs font-semibold text-[#38bdf8]">
              {isTv ? (
                media.currentSeason ? `Season ${media.currentSeason}, Ep ${media.currentEpisode || 1}` : 'Up Next'
              ) : isBook ? (
                isAudio ? (
                  `${formatAudioDuration(currentDuration)} / ${formatAudioDuration(totalDuration)}`
                ) : isChapters ? (
                  `Chapter ${currentChapter} of ${totalChapters}`
                ) : (
                  `Page ${currentPage} of ${totalPages}`
                )
              ) : (
                currentStatus === 'completed' ? 'Watched' : 'Not Watched'
              )}
            </span>
          </div>

          {/* Progress Bar & Stats */}
          <div className="space-y-1.5">
            <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full bg-[var(--accent)] transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
              <span>
                {isTv
                  ? (hasFutureUnaired && !isActivelyAiring)
                    ? `${watchedEps} / ${airedEps} aired episodes watched`
                    : `${watchedEps} / ${totalEps} episodes watched`
                  : isBook
                  ? isAudio
                    ? `${formatAudioDuration(currentDuration)} / ${formatAudioDuration(totalDuration)} listened`
                    : isChapters
                    ? `${currentChapter} / ${totalChapters} chapters read`
                    : `${currentPage} / ${totalPages} pages read`
                  : currentStatus === 'completed'
                  ? '1 / 1 movie watched'
                  : '0 / 1 movie watched'}
              </span>
              <span className="font-bold text-white">{progressPercent}% complete</span>
            </div>
          </div>

          {/* Primary Thumb CTA Row */}
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={handlePrimaryCtaClick}
              className="flex-1 h-12 rounded-xl bg-[#38bdf8] hover:bg-[#0ea5e9] text-slate-950 font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-md active:scale-[0.98] cursor-pointer"
            >
              {isTv ? (
                nextUpEpisode ? (
                  <>
                    <span>✓+</span>
                    <span>+1 Ep (S{nextUpEpisode.seasonNumber} E{nextUpEpisode.episodeNumber})</span>
                  </>
                ) : (
                  <>
                    <span>✓</span>
                    <span>All Caught Up!</span>
                  </>
                )
              ) : isBook ? (
                isAudio ? (
                  <>
                    <span>✓+</span>
                    <span>+15m</span>
                  </>
                ) : isChapters ? (
                  <>
                    <span>✓+</span>
                    <span>+1 Chapter</span>
                  </>
                ) : (
                  <>
                    <span>✓+</span>
                    <span>+10 Pages</span>
                  </>
                )
              ) : (
                currentStatus === 'completed' ? (
                  <>
                    <span>✓</span>
                    <span>Watched</span>
                  </>
                ) : (
                  <>
                    <span>✓</span>
                    <span>Mark as Watched</span>
                  </>
                )
              )}
            </button>

            <button
              type="button"
              onClick={() => setShowBatchActions(!showBatchActions)}
              aria-label="Batch Actions"
              title="Batch Actions / Precise Progress"
              className="w-12 h-12 rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border-light)] text-[var(--text-secondary)] hover:text-white flex items-center justify-center shrink-0 transition-all cursor-pointer"
            >
              <CheckCheck className="w-5 h-5" />
            </button>
          </div>

          {/* Batch Actions Drawer */}
          {showBatchActions && (
            <div className="p-3 rounded-xl bg-black/40 border border-white/10 space-y-2.5 text-xs animate-fadeIn">
              <div className="font-bold text-white pb-1 border-b border-white/10">
                Quick Actions
              </div>
              {isTv ? (
                <>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => doToggleSeason(activeSeason, true)}
                      className="flex-1 py-1.5 px-2.5 rounded-lg bg-emerald-500/20 text-emerald-400 font-semibold border border-emerald-500/30 text-center hover:bg-emerald-500/30"
                    >
                      ✓ Mark Season {activeSeason} Watched
                    </button>
                    <button
                      type="button"
                      onClick={() => doToggleSeason(activeSeason, false)}
                      className="flex-1 py-1.5 px-2.5 rounded-lg bg-rose-500/20 text-rose-400 font-semibold border border-rose-500/30 text-center hover:bg-rose-500/30"
                    >
                      ✗ Mark S{activeSeason} Unwatched
                    </button>
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <span className="text-zinc-400">Set exact:</span>
                    <input
                      type="number"
                      min="1"
                      value={customSeasonInput}
                      onChange={(e) => setCustomSeasonInput(parseInt(e.target.value, 10) || 1)}
                      className="w-12 px-2 py-1 rounded bg-[var(--input-bg)] border border-[var(--input-border)] text-white text-center"
                      title="Season"
                    />
                    <input
                      type="number"
                      min="0"
                      value={customEpisodeInput}
                      onChange={(e) => setCustomEpisodeInput(parseInt(e.target.value, 10) || 0)}
                      className="w-12 px-2 py-1 rounded bg-[var(--input-bg)] border border-[var(--input-border)] text-white text-center"
                      title="Episode"
                    />
                    <button
                      type="button"
                      onClick={() => doApplyExactProgress(customSeasonInput, customEpisodeInput)}
                      className="px-3 py-1 rounded bg-[var(--accent)] text-white font-bold ml-auto"
                    >
                      Apply
                    </button>
                  </div>
                </>
              ) : isBook ? (
                <div className="flex items-center gap-2">
                  <span className="text-zinc-400">Set page:</span>
                  <input
                    type="number"
                    min="0"
                    max={totalPages || 9999}
                    value={customPageInput}
                    onChange={(e) => setCustomPageInput(parseInt(e.target.value, 10) || 0)}
                    className="w-20 px-2 py-1 rounded bg-[var(--input-bg)] border border-[var(--input-border)] text-white text-center"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (propsOnApplyBookProgress) {
                        propsOnApplyBookProgress({ currentPage: customPageInput });
                      } else {
                        updateBookProgress(media.id, { currentPage: customPageInput, totalPages, progressMode: 'pages' });
                      }
                      setShowBatchActions(false);
                    }}
                    className="px-3 py-1 rounded bg-[var(--accent)] text-white font-bold ml-auto"
                  >
                    Save
                  </button>
                </div>
              ) : null}
            </div>
          )}

          {/* Embedded Next Episode Air Countdown Box */}
          {upcomingEp && (
            <div className="rounded-xl bg-black/30 border border-white/5 p-3 flex items-center justify-between gap-3 text-xs">
              <div className="w-8 h-8 rounded-full bg-[#38bdf8]/15 text-[#38bdf8] flex items-center justify-center shrink-0">
                <Clock className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-white truncate">
                  S{upcomingEp.seasonNumber} E{upcomingEp.episodeNumber}: "{upcomingEp.title}"
                </div>
                <div className="text-[11px] text-[var(--text-secondary)] truncate">
                  Airs {formatEpisodeAirDate(upcomingEp.airDate, upcomingEp.airstamp, undefined, media.networkTimezone)} • In {getEpisodeCountdown(upcomingEp.airDate, upcomingEp.airstamp, media.networkTimezone).label}
                </div>
              </div>
              <button
                type="button"
                className="p-1.5 rounded-full text-zinc-400 hover:text-white"
                title="Episode reminders"
              >
                <Bell className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* 5. "Season Episodes" Horizontal Pill Tabs & Episode Log List (TV Shows) */}
        {isTv && (
          <div className="space-y-3 pb-3">
            {/* Section Header */}
            <div className="flex items-center justify-between px-4">
              <h3 className="font-bold text-sm text-[var(--text-primary)]">
                Season Episodes
              </h3>
              <span className="text-xs text-[var(--text-secondary)] font-medium">
                {currentSeasonEpisodes.length} Episodes
              </span>
            </div>

            {/* Season Selector Track */}
            <div className="flex items-center gap-2 px-4 overflow-x-auto no-scrollbar scrollbar-none pb-1">
              {seasonNumbers.map((sNum) => {
                const isCurrent = sNum === (media.currentSeason || 1);
                const isSelected = sNum === activeSeason;

                return (
                  <button
                    key={sNum}
                    type="button"
                    onClick={() => setSelectedSeason(sNum)}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 ${
                      isSelected
                        ? 'bg-[#38bdf8] text-slate-950 shadow-sm'
                        : 'bg-[var(--bg-secondary)] border border-[var(--border-light)] text-[var(--text-secondary)] hover:text-white'
                    }`}
                  >
                    S{sNum}{isCurrent ? ' (Current)' : ''}
                  </button>
                );
              })}
            </div>

            {/* Season Runtime & Progress Summary Header (Issue #60) */}
            {currentSeasonEpisodes.length > 0 && (
              <div className="px-4 pb-1 flex items-center justify-between text-xs text-[var(--text-secondary)]">
                <span>
                  Season {activeSeason} • {currentSeasonEpisodes.length} eps
                  {seasonRuntimeMinutes > 0 ? ` • ${formatRuntime(seasonRuntimeMinutes, runtimeDisplayFormat)}` : ''}
                </span>
                <span className="font-mono text-zinc-300 text-[11px]">
                  {currentSeasonEpisodes.filter(e => e.isWatched === 1).length}/{currentSeasonEpisodes.length} watched
                </span>
              </div>
            )}

            {/* Episode List Cards */}
            <div className="px-4 space-y-2.5">
              {currentSeasonEpisodes.map((ep) => {
                const isWatched = ep.isWatched === 1;
                const isNextUp = !isWatched && nextUpEpisode?.id === ep.id;

                if (isWatched) {
                  // State 1: Watched Episode State
                  return (
                    <div
                      key={ep.id}
                      className="rounded-2xl p-3.5 bg-[var(--bg-secondary)] border border-[var(--border-light)] flex items-center justify-between gap-3 transition-all"
                    >
                      <button
                        type="button"
                        onClick={() => doToggleEpisode(ep)}
                        className="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 cursor-pointer"
                        title="Mark unwatched"
                      >
                        <Check className="w-4 h-4 stroke-[2.5]" />
                      </button>

                      <div
                        className="flex-1 min-w-0 cursor-pointer"
                        onClick={() => doToggleEpisode(ep)}
                      >
                        <div className="font-medium text-xs text-white truncate">
                          E{ep.episodeNumber} {ep.title}
                        </div>
                        <div className="text-[11px] text-[var(--text-secondary)]">
                          {ep.runtime && ep.runtime > 0 ? `${ep.runtime}m • ` : ''}{ep.airDate ? `Aired ${formatEpisodeAirDate(ep.airDate, ep.airstamp, undefined, media.networkTimezone)}` : 'Watched'}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => doToggleEpisode(ep)}
                        className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shrink-0 cursor-pointer"
                      >
                        Watched
                      </button>
                    </div>
                  );
                }

                if (isNextUp) {
                  // State 2: Up Next Episode State (Highlighted)
                  return (
                    <div
                      key={ep.id}
                      className="rounded-2xl p-3.5 bg-[#38bdf8]/5 border border-[#38bdf8]/60 shadow-sm flex items-center justify-between gap-3 transition-all"
                    >
                      <button
                        type="button"
                        onClick={() => doToggleEpisode(ep)}
                        className="w-8 h-8 rounded-full bg-[#38bdf8] text-slate-950 flex items-center justify-center shrink-0 cursor-pointer"
                        title="Mark watched"
                      >
                        <Play className="w-4 h-4 fill-slate-950 ml-0.5" />
                      </button>

                      <div
                        className="flex-1 min-w-0 cursor-pointer"
                        onClick={() => doToggleEpisode(ep)}
                      >
                        <div className="font-bold text-xs text-white truncate">
                          E{ep.episodeNumber} {ep.title}
                        </div>
                        <div className="text-[11px] font-semibold text-[#38bdf8]">
                          Up Next{ep.runtime && ep.runtime > 0 ? ` • ${ep.runtime}m` : ''}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => doToggleEpisode(ep)}
                        className="px-3 py-1 rounded-full text-xs font-bold border border-[#38bdf8]/40 bg-[#38bdf8]/15 text-[#38bdf8] hover:bg-[#38bdf8] hover:text-slate-950 transition-all cursor-pointer shrink-0"
                      >
                        ✓ Log
                      </button>
                    </div>
                  );
                }

                // State 3: Unwatched / Upcoming Episode State
                return (
                  <div
                    key={ep.id}
                    className="rounded-2xl p-3.5 bg-[var(--bg-secondary)] border border-[var(--border-light)] opacity-85 flex items-center justify-between gap-3 transition-all"
                  >
                    <button
                      type="button"
                      onClick={() => doToggleEpisode(ep)}
                      className="w-8 h-8 rounded-full border-2 border-white/20 text-white/40 flex items-center justify-center shrink-0 cursor-pointer"
                      title="Mark watched"
                    />

                    <div
                      className="flex-1 min-w-0 cursor-pointer"
                      onClick={() => doToggleEpisode(ep)}
                    >
                      <div className="font-medium text-xs text-zinc-300 truncate">
                        E{ep.episodeNumber} {ep.title}
                      </div>
                      <div className="text-[11px] text-[var(--text-secondary)]">
                        {ep.runtime && ep.runtime > 0 ? `${ep.runtime}m • ` : ''}{ep.airDate ? formatEpisodeAirDate(ep.airDate, ep.airstamp, undefined, media.networkTimezone) : 'TBA'}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => doMarkUpTo(ep)}
                        title={`Strike off up to E${ep.episodeNumber}`}
                        className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 text-[10px] font-medium transition-colors"
                      >
                        Mark up to here
                      </button>

                      <button
                        type="button"
                        onClick={() => doToggleEpisode(ep)}
                        className="px-2.5 py-1 rounded-full text-xs font-medium border border-white/10 bg-white/5 text-zinc-400 hover:text-white transition-all cursor-pointer"
                      >
                        Unwatched
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 6. "Where to Watch" Section */}
        <div className="px-4 py-3 border-t border-[var(--border-light)] mt-2 shrink-0">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
              Where to Watch
            </h4>
            <button
              type="button"
              onClick={doSync}
              className="text-xs text-[var(--accent)] hover:underline flex items-center gap-1 cursor-pointer"
            >
              <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>

          {watchProviders.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {watchProviders.map((provider) => (
                <div
                  key={provider.id || provider.name}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[var(--bg-secondary)] border border-[var(--border-light)] text-xs text-white"
                >
                  <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                  <span>{provider.name}</span>
                  {provider.type && (
                    <span className="text-[10px] text-zinc-400">
                      ({provider.type === 'flatrate' ? 'Subscription' : provider.type})
                    </span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-[var(--text-secondary)]">
              No subscription streaming providers currently listed for your region.
            </p>
          )}
        </div>

        {/* 7. Sticky Bottom Storage Bar */}
        <div className="sticky bottom-0 inset-x-0 z-20 bg-[#0d0d0f]/95 backdrop-blur-xl border-t border-[var(--border-light)] px-4 py-3 flex items-center justify-between text-xs mt-auto shrink-0">
          <div className="flex items-center gap-1.5 text-zinc-400">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>Saved locally (IndexedDB)</span>
          </div>

          {media.collectionName ? (
            <button
              type="button"
              onClick={() => onOpenInCanvas && onOpenInCanvas(media)}
              className="flex items-center gap-1 font-semibold text-[var(--accent)] hover:underline truncate max-w-[180px] cursor-pointer"
            >
              <Network className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{media.collectionName}</span>
            </button>
          ) : (
            <span className="text-zinc-500 font-mono text-[11px]">BingeLog PWA</span>
          )}
        </div>
      </div>
    </div>
  );
}
