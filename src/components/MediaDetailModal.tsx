import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  X, Star, Film, Tv, ChevronDown, ChevronUp, PlayCircle, Eye, RefreshCw,
  CheckCheck, CheckCircle2, Edit3, Trash2, Folder, Plus, Check, BookOpen, Globe,
  Network, Sparkles, Percent, Search, Headphones, Volume2, VolumeX, Play, Pause
} from 'lucide-react';
import { 
  getEpisodesForMedia, toggleEpisodeWatched, setExactProgress, 
  setSeasonWatched, updateMediaStatus, updateMediaRatingAndNotes, 
  deleteMediaItem, getMediaById, markEpisodesUpToWatched,
  getCustomLists, toggleMediaList, saveCustomList, updateBookProgress,
  changeBookEdition, setSetting, getAllMedia, saveMediaItem, db
} from '../db';
import { syncMediaEpisodes, fetchTMDBCollection, getTmdbApiKey, fetchOpenLibraryEditions, enrichBookSynopsis, fetchBookEditionByIsbn } from '../services/api';
import { 
  getNextFranchiseMovie, getFranchisePartsWithLibraryStatus, 
  createMediaItemFromCollectionPart, type NextFranchiseMovieInfo, type FranchisePartStatus 
} from '../utils/franchise';
import { 
  getUserTimeZone, formatEpisodeAirDate, getEpisodeCountdown, isEpisodeAired 
} from '../utils/timezone';
import { normalizeRating, denormalizeRating, formatRating, RATING_SCALE_CONFIG } from '../utils/rating';
import { parseAudioDuration, formatAudioDuration, formatAudioProgress, secondsToHoursMinutes, hoursMinutesToSeconds, isAudiobookItem } from '../utils/audioDuration';
import type { MediaItem, EpisodeItem, MediaStatus, CustomList, RatingScale, TMDBCollectionDetail, TMDBCollectionPart, BookEdition } from '../types';

export interface MediaDetailModalProps {
  media: MediaItem | null;
  isOpen?: boolean;
  onClose: () => void;
  onUpdated?: () => void;
  onUpdate?: (updated: MediaItem) => void;
  onDelete?: (id: string) => void;
  onEditCustom?: (media: MediaItem) => void;
  onOpenInCanvas?: (media: MediaItem) => void;
  ratingScale?: RatingScale;
  onRatingScaleChange?: (scale: RatingScale) => void;
}

interface NoticeStatus {
  success: boolean;
  message: string;
}

export default function MediaDetailModal({
  media,
  isOpen = true,
  onClose,
  onUpdated,
  onUpdate,
  onDelete,
  onEditCustom,
  onOpenInCanvas,
  ratingScale = '10',
  onRatingScaleChange
}: MediaDetailModalProps): React.JSX.Element | null {
  const [episodes, setEpisodes] = useState<EpisodeItem[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null);
  const [status, setStatus] = useState<MediaStatus>(media?.status || 'plan_to_watch');
  const [rating, setRating] = useState<number>(media?.rating || 0);
  const [activeScale, setActiveScale] = useState<RatingScale>(ratingScale || '10');
  const [ratingInput, setRatingInput] = useState<string>(() => {
    const denorm = denormalizeRating(media?.rating, ratingScale || '10');
    return denorm !== null ? String(denorm) : '';
  });
  const [notes, setNotes] = useState<string>(media?.notes || '');
  const [isSavingNotes, setIsSavingNotes] = useState<boolean>(false);
  const [notesSavedNotice, setNotesSavedNotice] = useState<boolean>(false);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncNotice, setSyncNotice] = useState<NoticeStatus | null>(null);

  useEffect(() => {
    if (ratingScale) {
      setActiveScale(ratingScale);
    }
  }, [ratingScale]);

  useEffect(() => {
    const denorm = denormalizeRating(media?.rating, activeScale);
    setRatingInput(denorm !== null ? String(denorm) : '');
    setRating(media?.rating || 0);
  }, [media?.rating, activeScale]);

  const handleScaleChange = async (newScale: RatingScale) => {
    setActiveScale(newScale);
    await setSetting('rating_scale', newScale);
    localStorage.setItem('bingelog_rating_scale', newScale);
    const denorm = denormalizeRating(rating, newScale);
    setRatingInput(denorm !== null ? String(denorm) : '');
    if (onRatingScaleChange) onRatingScaleChange(newScale);
  };

  const handleRatingCommit = async (valStr: string) => {
    const normalized = normalizeRating(valStr, activeScale);
    const finalVal = normalized !== null ? normalized : 0;
    setRating(finalVal);
    if (!media) return;
    await updateMediaRatingAndNotes(media.id, finalVal, notes);
    if (onUpdated) onUpdated();
    if (onUpdate) {
      const u = await getMediaById(media.id);
      if (u) onUpdate(u);
    }
  };

  // Precise Season/Episode input state
  const [inputSeason, setInputSeason] = useState<number | string>(media?.currentSeason || 1);
  const [inputEpisode, setInputEpisode] = useState<number | string>(media?.currentEpisode || 0);

  // Expanded episode synopses
  const [expandedEpisodes, setExpandedEpisodes] = useState<Record<string, boolean>>({});

  // Custom Folders & Lists State
  const [allLists, setAllLists] = useState<CustomList[]>([]);
  const [mediaLists, setMediaLists] = useState<string[]>(media?.lists || []);
  const [isCreatingList, setIsCreatingList] = useState<boolean>(false);
  const [newListName, setNewListName] = useState<string>('');

  // Book Reading & Audiobook Progress state (Issue #22, #38)
  const isAudio = isAudiobookItem(media);
  const [bookProgressMode, setBookProgressMode] = useState<'pages' | 'chapters' | 'time'>((media?.progressMode as any) || (isAudio ? 'time' : 'pages'));
  const [inputBookPage, setInputBookPage] = useState<number | string>(media?.currentPage || 0);
  const [inputBookTotalPages, setInputBookTotalPages] = useState<number | string>(media?.totalPages || '');
  const [inputBookChapter, setInputBookChapter] = useState<number | string>(media?.currentChapter || 0);
  const [inputBookTotalChapters, setInputBookTotalChapters] = useState<number | string>(media?.totalChapters || '');
  const [inputAudioHours, setInputAudioHours] = useState<number | string>(0);
  const [inputAudioMinutes, setInputAudioMinutes] = useState<number | string>(0);
  const [inputAudioTotalHours, setInputAudioTotalHours] = useState<number | string>('');
  const [inputAudioTotalMinutes, setInputAudioTotalMinutes] = useState<number | string>('');
  const [inputPercentage, setInputPercentage] = useState<string>('');
  const [isPlayingSample, setIsPlayingSample] = useState<boolean>(false);
  const audioSampleRef = useRef<HTMLAudioElement | null>(null);

  // Book Edition Switching & Synopsis Enrichment state (Issue #25, #38)
  const [showEditionSelector, setShowEditionSelector] = useState<boolean>(false);
  const [availableEditions, setAvailableEditions] = useState<BookEdition[]>([]);
  const [isLoadingEditions, setIsLoadingEditions] = useState<boolean>(false);
  const [isChangingEdition, setIsChangingEdition] = useState<boolean>(false);
  const [isEnrichingSynopsis, setIsEnrichingSynopsis] = useState<boolean>(false);
  const [editionSearchQuery, setEditionSearchQuery] = useState<string>('');
  const [isLookingUpIsbn, setIsLookingUpIsbn] = useState<boolean>(false);
  const [isbnLookupMessage, setIsbnLookupMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  // Handle Escape key to close modal (or inner edition selector first)
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showEditionSelector) {
          setShowEditionSelector(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, showEditionSelector, onClose]);

  // Localized User Timezone
  const [userTz, setUserTz] = useState<string>('');

  // Franchise & Collection State (Issue #34)
  const [collection, setCollection] = useState<TMDBCollectionDetail | null>(null);
  const [isLoadingCollection, setIsLoadingCollection] = useState<boolean>(false);
  const [libraryMovies, setLibraryMovies] = useState<MediaItem[]>([]);
  const [isAddingFranchisePartId, setIsAddingFranchisePartId] = useState<number | null>(null);

  const isTv = media?.type === 'tv';
  const isBook = media?.type === 'book';

  const bookCurrentTotal = bookProgressMode === 'chapters'
    ? (Number(media?.totalChapters) || Number(inputBookTotalChapters) || 0)
    : bookProgressMode === 'time'
    ? (Number(media?.totalDurationSeconds) || hoursMinutesToSeconds(Number(inputAudioTotalHours) || 0, Number(inputAudioTotalMinutes) || 0))
    : (Number(media?.totalPages) || Number(inputBookTotalPages) || 0);

  const bookCurrentProgress = bookProgressMode === 'chapters'
    ? (Number(media?.currentChapter) || 0)
    : bookProgressMode === 'time'
    ? (Number(media?.currentDurationSeconds) || hoursMinutesToSeconds(Number(inputAudioHours) || 0, Number(inputAudioMinutes) || 0))
    : (Number(media?.currentPage) || 0);

  const currentPercentage = bookCurrentTotal > 0
    ? Math.min(100, Math.max(0, Math.round((bookCurrentProgress / bookCurrentTotal) * 100)))
    : 0;

  useEffect(() => {
    if (media) {
      getCustomLists().then(setAllLists);
      setMediaLists(media.lists || []);
      const audio = isAudiobookItem(media);
      setBookProgressMode(media.progressMode || (audio ? 'time' : 'pages'));
      setInputBookPage(media.currentPage || 0);
      setInputBookTotalPages(media.totalPages || '');
      setInputBookChapter(media.currentChapter || 0);
      setInputBookTotalChapters(media.totalChapters || '');
      if (media.totalDurationSeconds) {
        const { hours: th, minutes: tm } = secondsToHoursMinutes(media.totalDurationSeconds);
        setInputAudioTotalHours(th);
        setInputAudioTotalMinutes(tm);
      } else {
        setInputAudioTotalHours('');
        setInputAudioTotalMinutes('');
      }
      if (media.currentDurationSeconds !== undefined) {
        const { hours: ch, minutes: cm } = secondsToHoursMinutes(media.currentDurationSeconds);
        setInputAudioHours(ch);
        setInputAudioMinutes(cm);
      } else {
        setInputAudioHours(0);
        setInputAudioMinutes(0);
      }
      setInputPercentage('');
      setIsPlayingSample(false);
    }
  }, [media?.id, media?.currentPage, media?.totalPages, media?.currentChapter, media?.totalChapters, media?.currentDurationSeconds, media?.totalDurationSeconds, media?.progressMode]);

  const handleApplyBookProgress = async (options: {
    currentPage?: number;
    totalPages?: number;
    currentChapter?: number;
    totalChapters?: number;
    currentDurationSeconds?: number;
    totalDurationSeconds?: number;
    narrator?: string;
    progressMode?: 'pages' | 'chapters' | 'time';
    percentage?: number;
  }) => {
    if (!media) return;
    const updated = await updateBookProgress(media.id, options);
    if (updated) {
      setBookProgressMode(updated.progressMode || 'pages');
      setInputBookPage(updated.currentPage || 0);
      setInputBookTotalPages(updated.totalPages || '');
      setInputBookChapter(updated.currentChapter || 0);
      setInputBookTotalChapters(updated.totalChapters || '');
      if (updated.totalDurationSeconds) {
        const { hours: th, minutes: tm } = secondsToHoursMinutes(updated.totalDurationSeconds);
        setInputAudioTotalHours(th);
        setInputAudioTotalMinutes(tm);
      }
      if (updated.currentDurationSeconds !== undefined) {
        const { hours: ch, minutes: cm } = secondsToHoursMinutes(updated.currentDurationSeconds);
        setInputAudioHours(ch);
        setInputAudioMinutes(cm);
      }
      setInputPercentage('');
      setStatus(updated.status);
      if (onUpdated) onUpdated();
      if (onUpdate) onUpdate(updated);
    }
  };

  const handleApplyPercentage = async (pct: number) => {
    if (!media) return;
    const clamped = Math.max(0, Math.min(100, pct));
    if (clamped >= 100) {
      await handleFinishBook();
      return;
    }
    await handleApplyBookProgress({
      percentage: clamped,
      progressMode: bookProgressMode
    });
  };

  const handleOpenEditionSelector = async () => {
    if (!media) return;
    setShowEditionSelector(true);
    setEditionSearchQuery('');
    setIsbnLookupMessage(null);
    const workId = media.workId || (media.source === 'openlibrary' && media.externalId ? String(media.externalId) : null);
    if (workId) {
      setIsLoadingEditions(true);
      try {
        const editions = await fetchOpenLibraryEditions(workId, 35);
        setAvailableEditions(editions);
      } catch (err) {
        console.error('Failed to load editions:', err);
      } finally {
        setIsLoadingEditions(false);
      }
    }
  };

  const handleIsbnLookup = async () => {
    const raw = editionSearchQuery.trim();
    if (!raw) return;
    const cleanDigits = raw.replace(/[^0-9X]/gi, '').toUpperCase();
    const isKey = /^OL\d+M$/i.test(raw) || /^\/books\/OL\d+M$/i.test(raw);
    if (!isKey && cleanDigits.length !== 10 && cleanDigits.length !== 13) {
      setIsbnLookupMessage({
        type: 'error',
        text: 'Please enter a valid 10 or 13-digit ISBN (or Open Library edition ID).'
      });
      return;
    }

    setIsLookingUpIsbn(true);
    setIsbnLookupMessage(null);
    try {
      const existing = availableEditions.find(ed => 
        (ed.isbn && ed.isbn.replace(/[^0-9X]/gi, '').toUpperCase() === cleanDigits) ||
        (ed.isbn10 && ed.isbn10.replace(/[^0-9X]/gi, '').toUpperCase() === cleanDigits) ||
        (ed.isbn13 && ed.isbn13.replace(/[^0-9X]/gi, '').toUpperCase() === cleanDigits) ||
        (ed.id && ed.id.toLowerCase() === raw.toLowerCase())
      );

      if (existing) {
        setIsbnLookupMessage({
          type: 'success',
          text: `Found in edition list: "${existing.title}" (${existing.physicalFormat || 'Edition'})`
        });
        return;
      }

      const fetched = await fetchBookEditionByIsbn(raw);
      if (fetched) {
        setAvailableEditions(prev => [fetched, ...prev.filter(x => x.id !== fetched.id)]);
        setIsbnLookupMessage({
          type: 'success',
          text: `Found edition: "${fetched.title}" (${fetched.totalPages ? `${fetched.totalPages} pages` : 'pages unlisted'})`
        });
      } else {
        setIsbnLookupMessage({
          type: 'error',
          text: `No edition found for "${raw}" on Open Library or Google Books.`
        });
      }
    } catch {
      setIsbnLookupMessage({
        type: 'error',
        text: 'Failed to lookup ISBN. Please check your connection.'
      });
    } finally {
      setIsLookingUpIsbn(false);
    }
  };

  const filteredAvailableEditions = useMemo(() => {
    const q = editionSearchQuery.trim().toLowerCase();
    if (!q) return availableEditions;
    const cleanQ = q.replace(/[^0-9x]/gi, '');
    return availableEditions.filter(ed => {
      const matchTitle = ed.title?.toLowerCase().includes(q);
      const matchPublisher = ed.publishers?.some(p => p.toLowerCase().includes(q));
      const matchYear = ed.year?.includes(q);
      const matchFormat = ed.physicalFormat?.toLowerCase().includes(q);
      const matchIsbn = cleanQ && (
        (ed.isbn && ed.isbn.replace(/[^0-9x]/gi, '').toLowerCase().includes(cleanQ)) ||
        (ed.isbn10 && ed.isbn10.replace(/[^0-9x]/gi, '').toLowerCase().includes(cleanQ)) ||
        (ed.isbn13 && ed.isbn13.replace(/[^0-9x]/gi, '').toLowerCase().includes(cleanQ))
      );
      const matchId = ed.id?.toLowerCase().includes(q);
      return matchTitle || matchPublisher || matchYear || matchFormat || matchIsbn || matchId;
    });
  }, [availableEditions, editionSearchQuery]);

  const handleSelectEdition = async (edition: BookEdition) => {
    if (!media) return;
    setIsChangingEdition(true);
    try {
      const updated = await changeBookEdition(media.id, {
        totalPages: edition.totalPages,
        isbn: edition.isbn,
        publisher: edition.publishers?.[0],
        year: edition.year,
        bookFormat: edition.physicalFormat,
        posterUrl: edition.coverUrl,
        editionId: edition.id,
        totalDurationSeconds: edition.totalDurationSeconds,
        narrator: edition.narrator
      });
      if (updated) {
        setBookProgressMode(updated.progressMode || 'pages');
        setInputBookTotalPages(updated.totalPages || '');
        setInputBookPage(updated.currentPage || 0);
        if (updated.totalDurationSeconds) {
          const { hours: th, minutes: tm } = secondsToHoursMinutes(updated.totalDurationSeconds);
          setInputAudioTotalHours(th);
          setInputAudioTotalMinutes(tm);
        }
        if (updated.currentDurationSeconds !== undefined) {
          const { hours: ch, minutes: cm } = secondsToHoursMinutes(updated.currentDurationSeconds);
          setInputAudioHours(ch);
          setInputAudioMinutes(cm);
        }
        if (onUpdated) onUpdated();
        if (onUpdate) onUpdate(updated);
        setShowEditionSelector(false);
      }
    } finally {
      setIsChangingEdition(false);
    }
  };

  const handleToggleSamplePlayback = () => {
    if (!media?.audioPreviewUrl) return;
    if (!audioSampleRef.current) {
      audioSampleRef.current = new Audio(media.audioPreviewUrl);
      audioSampleRef.current.onended = () => setIsPlayingSample(false);
      audioSampleRef.current.onerror = () => setIsPlayingSample(false);
    }
    if (isPlayingSample) {
      audioSampleRef.current.pause();
      setIsPlayingSample(false);
    } else {
      audioSampleRef.current.play().catch(err => {
        console.warn('Audio playback failed:', err);
        setIsPlayingSample(false);
      });
      setIsPlayingSample(true);
    }
  };

  useEffect(() => {
    return () => {
      if (audioSampleRef.current) {
        audioSampleRef.current.pause();
        audioSampleRef.current = null;
      }
    };
  }, []);

  const handleQuickAudioIncrement = async (secondsToAdd: number) => {
    if (!media) return;
    const current = media.currentDurationSeconds || hoursMinutesToSeconds(Number(inputAudioHours) || 0, Number(inputAudioMinutes) || 0);
    const total = media.totalDurationSeconds || hoursMinutesToSeconds(Number(inputAudioTotalHours) || 0, Number(inputAudioTotalMinutes) || 0);
    const newSec = Math.max(0, current + secondsToAdd);
    await handleApplyBookProgress({
      currentDurationSeconds: newSec,
      totalDurationSeconds: total || undefined,
      progressMode: 'time'
    });
  };

  const handleEnrichSynopsis = async () => {
    if (!media) return;
    setIsEnrichingSynopsis(true);
    try {
      const workId = media.workId || (media.source === 'openlibrary' && media.externalId ? String(media.externalId) : undefined);
      const enriched = await enrichBookSynopsis({
        isbn: media.isbn,
        title: media.title,
        author: media.author,
        workId
      });
      if (enriched) {
        const updates: Partial<MediaItem> = {
          updatedAt: new Date().toISOString()
        };
        if (enriched.overview) updates.overview = enriched.overview;
        if (enriched.genres && (!media.genres || media.genres.length === 0)) updates.genres = enriched.genres;
        if (media.communityRating == null && enriched.communityRating != null) {
          updates.communityRating = enriched.communityRating;
          updates.communityRatingCount = enriched.communityRatingCount;
        }
        await db.media.update(media.id, updates);
        const fresh = await db.media.get(media.id);
        if (fresh) {
          if (onUpdated) onUpdated();
          if (onUpdate) onUpdate(fresh);
        }
      }
    } finally {
      setIsEnrichingSynopsis(false);
    }
  };

  const handleFinishBook = async () => {
    if (!media) return;
    const targetPage = Number(inputBookTotalPages) || media.totalPages || 0;
    const targetChapter = Number(inputBookTotalChapters) || media.totalChapters || 0;
    const targetDuration = Number(media.totalDurationSeconds) || hoursMinutesToSeconds(Number(inputAudioTotalHours) || 0, Number(inputAudioTotalMinutes) || 0);
    await handleApplyBookProgress({
      currentPage: targetPage > 0 ? targetPage : undefined,
      currentChapter: targetChapter > 0 ? targetChapter : undefined,
      totalPages: targetPage > 0 ? targetPage : undefined,
      totalChapters: targetChapter > 0 ? targetChapter : undefined,
      currentDurationSeconds: targetDuration > 0 ? targetDuration : undefined,
      totalDurationSeconds: targetDuration > 0 ? targetDuration : undefined,
      progressMode: bookProgressMode
    });
  };

  const handleToggleList = async (listName: string) => {
    if (!media) return;
    const updated = await toggleMediaList(media.id, listName);
    setMediaLists(updated);
    if (onUpdated) onUpdated();
    if (onUpdate) {
      const refreshed = await getMediaById(media.id);
      if (refreshed) onUpdate(refreshed);
    }
  };

  const handleCreateAndAddList = async () => {
    if (!newListName.trim() || !media) return;
    const created = await saveCustomList({ name: newListName.trim() });
    setAllLists(prev => [...prev.filter(l => l.id !== created.id), created]);
    const updated = await toggleMediaList(media.id, created.name);
    setMediaLists(updated);
    setNewListName('');
    setIsCreatingList(false);
    if (onUpdated) onUpdated();
    if (onUpdate) {
      const refreshed = await getMediaById(media.id);
      if (refreshed) onUpdate(refreshed);
    }
  };

  // Load episodes from IndexedDB while preserving current active season (Issue #13)
  const loadEpisodes = async (targetSeason: number | null = null) => {
    if (!isTv) return;
    const [eps, latestMedia] = await Promise.all([
      getEpisodesForMedia(media.id),
      getMediaById(media.id)
    ]);
    setEpisodes(eps);

    if (eps.length > 0) {
      setSelectedSeason(prev => {
        // If explicitly requested to switch to targetSeason (and it exists)
        if (targetSeason !== null && targetSeason !== undefined) {
          const exists = eps.some(e => e.seasonNumber === targetSeason);
          if (exists) return targetSeason;
        }

        // If user already has an active season selection that exists in this show, PRESERVE IT!
        if (prev !== null && prev !== undefined && eps.some(e => e.seasonNumber === prev)) {
          return prev;
        }

        // Default on initial load or fallback:
        const current = latestMedia?.currentSeason || media.currentSeason || 1;
        const currentExists = eps.some(e => e.seasonNumber === current);
        return currentExists ? current : (eps[0]?.seasonNumber || 1);
      });

      if (latestMedia) {
        setInputSeason(latestMedia.currentSeason || 1);
        setInputEpisode(latestMedia.currentEpisode || 0);
      }
    }
  };

  // Sync latest episodes from TVMaze/TMDB
  const handleSync = async (silent = false) => {
    if (!isTv || !media.externalId || isSyncing) return;
    if (!silent) setIsSyncing(true);
    setSyncNotice(null);

    try {
      const result = await syncMediaEpisodes(media);
      if (result.hasUpdates) {
        let msg = '';
        if (result.newEpisodesCount && result.newEpisodesCount > 0 && result.updatedTitlesCount && result.updatedTitlesCount > 0) {
          msg = `🎉 Added ${result.newEpisodesCount} new episode(s) and updated ${result.updatedTitlesCount} title(s)!`;
        } else if (result.newEpisodesCount && result.newEpisodesCount > 0) {
          msg = `🎉 Added ${result.newEpisodesCount} newly dropped episode(s)!`;
        } else if (result.updatedTitlesCount && result.updatedTitlesCount > 0) {
          msg = `✨ Updated ${result.updatedTitlesCount} newly revealed episode title(s)!`;
        } else {
          msg = `✨ Updated episode release schedules and broadcast times!`;
        }
        setSyncNotice({ success: true, message: msg });
        await loadEpisodes();
        if (onUpdated) onUpdated();
        if (onUpdate) {
          const updated = await getMediaById(media.id);
          if (updated) onUpdate(updated);
        }
      } else if (!silent) {
        setSyncNotice({ success: true, message: 'All episodes and seasons are already up to date!' });
      }
    } catch (err) {
      if (!silent) {
        const message = err instanceof Error ? err.message : String(err);
        setSyncNotice({ success: false, message: `Sync failed: ${message}` });
      }
    } finally {
      if (!silent) setIsSyncing(false);
    }
  };

  useEffect(() => {
    if (!isOpen || !media) return;
    getUserTimeZone().then(tz => setUserTz(tz));
    setSelectedSeason(null);
    loadEpisodes();
    // Silently check for new episodes if watching a TV show with external ID
    if (isTv && media.status === 'watching' && media.externalId) {
      handleSync(true);
    }
    // Load Franchise Collection and library movies for movies in a franchise (Issue #34)
    if (media.type === 'movie') {
      const loadMovieFranchise = async () => {
        setIsLoadingCollection(true);
        try {
          let colId = media.collectionId;
          let colName = media.collectionName;

          // If collectionId is not yet linked on this library item, check TMDB on-demand
          if (!colId) {
            const apiKey = await getTmdbApiKey();
            let tmdbId = media.tmdbId || (media.source === 'tmdb' ? media.externalId : null);

            if (!tmdbId && apiKey && media.title) {
              const yearParam = media.year && media.year !== 'N/A' ? `&year=${media.year}` : '';
              const searchRes = await fetch(
                `https://api.themoviedb.org/3/search/movie?query=${encodeURIComponent(media.title)}&api_key=${encodeURIComponent(apiKey)}${yearParam}`
              ).catch(() => null);
              if (searchRes && searchRes.ok) {
                const sData = await searchRes.json();
                if (sData.results?.[0]?.id) {
                  tmdbId = sData.results[0].id;
                }
              }
            }

            if (tmdbId && apiKey) {
              const res = await fetch(`https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${encodeURIComponent(apiKey)}`).catch(() => null);
              if (res && res.ok) {
                const data = await res.json();
                const col = data.belongs_to_collection;
                if (col && col.id) {
                  colId = col.id;
                  colName = col.name;
                  await db.media.update(media.id, {
                    collectionId: col.id,
                    collectionName: col.name,
                    tmdbId: media.tmdbId || tmdbId,
                    updatedAt: new Date().toISOString()
                  });
                  media.collectionId = col.id;
                  media.collectionName = col.name;
                  if (onUpdated) onUpdated();
                }
              }
            }
          }

          if (colId) {
            const [col, allMedia] = await Promise.all([
              fetchTMDBCollection(colId),
              getAllMedia()
            ]);
            setCollection(col);
            setLibraryMovies(allMedia.filter(m => m.type === 'movie'));
          } else {
            setCollection(null);
          }
        } catch (err) {
          console.error('Failed to load franchise collection:', err);
        } finally {
          setIsLoadingCollection(false);
        }
      };

      loadMovieFranchise();
    } else {
      setCollection(null);
    }
  }, [media?.id, media?.collectionId, isOpen]);

  if (!isOpen || !media) return null;

  // Handle status change
  const handleStatusChange = async (newStatus: MediaStatus) => {
    setStatus(newStatus);
    await updateMediaStatus(media.id, newStatus);
    await loadEpisodes();
    if (onUpdated) onUpdated();
    if (onUpdate) {
      const updated = await getMediaById(media.id);
      if (updated) onUpdate(updated);
    }
    if (media.type === 'movie') {
      const all = await getAllMedia();
      setLibraryMovies(all.filter(m => m.type === 'movie'));
    }
  };

  // Franchise Next Movie & Sequence calculations (Issue #34)
  const nextFranchiseMovie: NextFranchiseMovieInfo | null = useMemo(() => {
    if (!media || media.type !== 'movie' || !collection || !collection.parts) return null;
    return getNextFranchiseMovie(media, collection.parts, libraryMovies);
  }, [media, collection, libraryMovies]);

  const franchiseSequence: FranchisePartStatus[] = useMemo(() => {
    if (!media || media.type !== 'movie' || !collection || !collection.parts) return [];
    return getFranchisePartsWithLibraryStatus(collection.parts, media, libraryMovies);
  }, [media, collection, libraryMovies]);

  const handleAddFranchisePart = async (part: TMDBCollectionPart, targetStatus: MediaStatus = 'plan_to_watch') => {
    if (!collection) return;
    setIsAddingFranchisePartId(part.id);
    try {
      const newMediaData = createMediaItemFromCollectionPart(part, collection, targetStatus);
      const saved = await saveMediaItem(newMediaData, []);
      setSyncNotice({
        success: true,
        message: `🎉 Added "${part.title}" to ${targetStatus === 'plan_to_watch' ? 'Plan to Watch' : 'Library'}!`
      });
      if (onUpdated) onUpdated();
      const all = await getAllMedia();
      setLibraryMovies(all.filter(m => m.type === 'movie'));
      syncMediaEpisodes(saved).catch(() => {});
    } catch (err) {
      setSyncNotice({
        success: false,
        message: `Failed to add "${part.title}": ${err instanceof Error ? err.message : String(err)}`
      });
    } finally {
      setIsAddingFranchisePartId(null);
    }
  };

  const handleSelectFranchiseMovie = (matched: MediaItem) => {
    if (onUpdate) {
      onUpdate(matched);
    }
  };

  // Handle rating & notes save
  const handleSaveNotes = async () => {
    setIsSavingNotes(true);
    const normalized = normalizeRating(ratingInput, activeScale);
    const finalRating = normalized !== null ? normalized : 0;
    setRating(finalRating);
    await updateMediaRatingAndNotes(media.id, finalRating, notes);
    setIsSavingNotes(false);
    setNotesSavedNotice(true);
    setTimeout(() => setNotesSavedNotice(false), 2000);
    if (onUpdated) onUpdated();
    if (onUpdate) {
      const updated = await getMediaById(media.id);
      if (updated) onUpdate(updated);
    }
  };

  // Derived season lists and activeSeason pointer
  const seasonNumbers = Array.from(
    new Set(episodes.map(ep => ep.seasonNumber))
  ).sort((a, b) => a - b);

  const activeSeason = (selectedSeason !== null && selectedSeason !== undefined)
    ? selectedSeason
    : (media.currentSeason || seasonNumbers[0] || 1);

  // Toggle single episode (Issue #13: preserve active season)
  const handleToggleEpisode = async (ep: EpisodeItem) => {
    await toggleEpisodeWatched(media.id, ep.seasonNumber, ep.episodeNumber);
    await loadEpisodes(activeSeason);
    if (onUpdated) onUpdated();
    if (onUpdate) {
      const updated = await getMediaById(media.id);
      if (updated) onUpdate(updated);
    }
  };

  // Strike off / mark all episodes up to and including a specific episode (Issue #14)
  const handleMarkUpTo = async (ep: EpisodeItem) => {
    await markEpisodesUpToWatched(media.id, ep.seasonNumber, ep.episodeNumber);
    await loadEpisodes(activeSeason);
    if (onUpdated) onUpdated();
    if (onUpdate) {
      const updated = await getMediaById(media.id);
      if (updated) onUpdate(updated);
    }
  };

  // Apply exact progress input (User requested: precise to season and episode numbers)
  const handleApplyExactProgress = async (markPrevious = true) => {
    const s = Math.max(1, parseInt(String(inputSeason), 10) || 1);
    const e = Math.max(0, parseInt(String(inputEpisode), 10) || 0);

    await setExactProgress(media.id, s, e, markPrevious);
    await loadEpisodes(s);
    if (onUpdated) onUpdated();
    if (onUpdate) {
      const updated = await getMediaById(media.id);
      if (updated) onUpdate(updated);
    }
  };

  // Mark full season watched or unwatched
  const handleToggleSeason = async (seasonNum: number, markAsWatched: boolean) => {
    await setSeasonWatched(media.id, seasonNum, markAsWatched);
    await loadEpisodes(seasonNum);
    if (onUpdated) onUpdated();
    if (onUpdate) {
      const updated = await getMediaById(media.id);
      if (updated) onUpdate(updated);
    }
  };

  // Delete media item
  const handleDelete = async () => {
    if (window.confirm(`Are you sure you want to remove "${media.title}" from your library?`)) {
      await deleteMediaItem(media.id);
      if (onUpdated) onUpdated();
      if (onDelete) onDelete(media.id);
      onClose();
    }
  };

  const currentSeasonEpisodes = episodes.filter(ep => ep.seasonNumber === activeSeason);
  const currentSeasonWatchedCount = currentSeasonEpisodes.filter(ep => ep.isWatched === 1).length;
  const isSeasonFullyWatched = currentSeasonEpisodes.length > 0 && currentSeasonWatchedCount === currentSeasonEpisodes.length;

  // Next up episode finder
  const nextUpEpisode = episodes.find(ep => ep.isWatched === 0);

  const toggleExpand = (epId: string) => {
    setExpandedEpisodes(prev => ({ ...prev, [epId]: !prev[epId] }));
  };

  return (
    <div 
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-sm overflow-y-auto animate-fadeIn"
    >
      <div className="relative w-full max-w-4xl bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden my-auto flex flex-col max-h-[92vh]">
        
        {/* Backdrop & Header Banner */}
        <div className="relative h-48 sm:h-64 w-full bg-zinc-950 shrink-0">
          {media.backdropUrl || media.posterUrl ? (
            <img
              src={media.backdropUrl || media.posterUrl || ''}
              alt={media.title}
              className="w-full h-full object-cover opacity-35"
            />
          ) : null}
          <div className="absolute inset-0 bg-gradient-to-t from-zinc-900 via-zinc-900/60 to-transparent" />

          {/* Close button */}
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-full bg-black/60 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-white/10 backdrop-blur-md transition-all z-10"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Title & metadata on top of banner */}
          <div className="absolute bottom-4 left-4 right-4 flex items-end gap-4 sm:gap-6">
            {/* Poster Thumbnail */}
            <div className="w-20 sm:w-28 aspect-[2/3] rounded-xl overflow-hidden shadow-2xl border border-white/10 shrink-0 bg-zinc-950 hidden xs:block">
              {media.posterUrl ? (
                <img src={media.posterUrl} alt={media.title} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-zinc-800 text-zinc-600">
                  {isTv ? <Tv className="w-8 h-8" /> : isBook ? <BookOpen className="w-8 h-8" /> : <Film className="w-8 h-8" />}
                </div>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="px-2 py-0.5 rounded-lg bg-[var(--accent)] text-white text-[11px] font-bold">
                  {isTv ? 'TV Series' : isBook ? 'Book' : 'Movie'}
                </span>
                {media.year && (
                  <span className="text-zinc-300 text-xs font-medium">
                    {media.year}
                  </span>
                )}
                {isBook && media.author && (
                  <span className="text-zinc-300 text-xs font-medium">
                    by {media.author}
                  </span>
                )}
                {isBook && (media.progressMode === 'chapters' ? (
                  Number(media.totalChapters) > 0 ? (
                    <span className="text-zinc-400 text-xs">
                      • {media.totalChapters} chapters
                    </span>
                  ) : null
                ) : (
                  Number(media.totalPages) > 0 ? (
                    <span className="text-zinc-400 text-xs">
                      • {media.totalPages} pages
                    </span>
                  ) : null
                ))}
                {isBook && media.isbn && (
                  <span className="text-zinc-400 text-xs">
                    • ISBN {media.isbn}
                  </span>
                )}
                {media.genres && media.genres.length > 0 && (
                  <span className="text-zinc-400 text-xs truncate max-w-xs">
                    • {Array.isArray(media.genres) ? media.genres.join(', ') : media.genres}
                  </span>
                )}
                {media.communityRating !== undefined && media.communityRating !== null && (
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-md border border-white/20 text-xs font-semibold text-white shrink-0 ml-1" title={`Public / Community Rating: ${formatRating(media.communityRating, activeScale)} / ${activeScale}${media.communityRatingCount ? ` (${media.communityRatingCount.toLocaleString()} votes)` : ''} [${media.source.toUpperCase()}]`}>
                    <Globe className="w-3 h-3 text-sky-400 shrink-0" />
                    <span>Public: <strong className="text-[#ffd60a]">{formatRating(media.communityRating, activeScale)}</strong> / {activeScale}</span>
                    {media.communityRatingCount ? (
                      <span className="text-[10px] text-zinc-300 font-normal">({media.communityRatingCount.toLocaleString()})</span>
                    ) : null}
                  </span>
                )}
              </div>

              <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-white tracking-tight truncate" title={media.title}>
                {media.title}
              </h1>
            </div>
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">

          {/* Next in Franchise Prompt Banner (Issue #34) */}
          {nextFranchiseMovie && (
            <div className="relative overflow-hidden p-4 rounded-xl bg-gradient-to-r from-purple-950/50 via-purple-900/25 to-zinc-900/60 border border-purple-500/40 shadow-lg">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3.5 min-w-0">
                  {nextFranchiseMovie.part.poster_path ? (
                    <img
                      src={nextFranchiseMovie.part.poster_path.startsWith('http') ? nextFranchiseMovie.part.poster_path : `https://image.tmdb.org/t/p/w200${nextFranchiseMovie.part.poster_path}`}
                      alt={nextFranchiseMovie.part.title}
                      className="w-12 h-16 sm:w-14 sm:h-20 object-cover rounded-lg shadow-md shrink-0 border border-white/10"
                    />
                  ) : (
                    <div className="w-12 h-16 sm:w-14 sm:h-20 bg-purple-900/40 rounded-lg flex items-center justify-center text-purple-300 shrink-0 border border-purple-500/20">
                      <Film className="w-6 h-6" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="flex items-center gap-1 text-[11px] font-bold text-purple-300 bg-purple-500/20 border border-purple-500/35 px-2 py-0.5 rounded-full">
                        <Sparkles className="w-3 h-3 text-amber-400" />
                        Next in Franchise
                      </span>
                      <span className="text-[11px] text-zinc-400 font-medium">
                        Part {nextFranchiseMovie.nextIndex + 1} of {nextFranchiseMovie.totalParts}
                      </span>
                    </div>
                    <h4 className="text-sm sm:text-base font-bold text-white truncate" title={nextFranchiseMovie.part.title}>
                      {nextFranchiseMovie.part.title}
                    </h4>
                    <div className="flex items-center gap-2 text-xs text-zinc-400 mt-0.5">
                      <span>{nextFranchiseMovie.part.release_date ? nextFranchiseMovie.part.release_date.slice(0, 4) : 'Upcoming'}</span>
                      {nextFranchiseMovie.part.vote_average ? (
                        <>
                          <span>•</span>
                          <span className="flex items-center gap-0.5 text-amber-300 font-semibold">
                            <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                            {nextFranchiseMovie.part.vote_average.toFixed(1)}
                          </span>
                        </>
                      ) : null}
                    </div>
                    {nextFranchiseMovie.part.overview && (
                      <p className="text-[11px] text-zinc-400 line-clamp-1 mt-1 max-w-xl">
                        {nextFranchiseMovie.part.overview}
                      </p>
                    )}
                  </div>
                </div>

                {/* Quick Add or View action */}
                <div className="flex items-center gap-2 shrink-0 self-end sm:self-center w-full sm:w-auto">
                  {nextFranchiseMovie.isAlreadyInLibrary && nextFranchiseMovie.libraryItem ? (
                    <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap sm:flex-nowrap">
                      {nextFranchiseMovie.libraryStatus !== 'completed' && (
                        <button
                          type="button"
                          onClick={async () => {
                            await updateMediaStatus(nextFranchiseMovie.libraryItem!.id, 'completed');
                            setSyncNotice({ success: true, message: `🎉 Marked "${nextFranchiseMovie.part.title}" as Watched!` });
                            if (onUpdated) onUpdated();
                            const all = await getAllMedia();
                            setLibraryMovies(all.filter(m => m.type === 'movie'));
                          }}
                          className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-all shadow-md active:scale-95 cursor-pointer"
                          title="Mark as Watched"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Mark Watched</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleSelectFranchiseMovie(nextFranchiseMovie.libraryItem!)}
                        className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs transition-all shadow-md active:scale-95 cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>View Movie ({nextFranchiseMovie.libraryStatus === 'completed' ? 'Completed' : nextFranchiseMovie.libraryStatus === 'watching' ? 'Watching' : 'Plan to Watch'})</span>
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap sm:flex-nowrap">
                      <button
                        type="button"
                        disabled={isAddingFranchisePartId === nextFranchiseMovie.part.id}
                        onClick={() => handleAddFranchisePart(nextFranchiseMovie.part, 'plan_to_watch')}
                        className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-white font-semibold text-xs border border-zinc-700 transition-all shadow-md active:scale-95 cursor-pointer"
                        title="Add to Plan to Watch"
                      >
                        {isAddingFranchisePartId === nextFranchiseMovie.part.id ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Plus className="w-3.5 h-3.5" />
                        )}
                        <span>Plan to Watch</span>
                      </button>
                      <button
                        type="button"
                        disabled={isAddingFranchisePartId === nextFranchiseMovie.part.id}
                        onClick={() => handleAddFranchisePart(nextFranchiseMovie.part, 'watching')}
                        className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-[var(--accent)] hover:brightness-110 disabled:opacity-50 text-white font-bold text-xs transition-all shadow-md active:scale-95 cursor-pointer"
                        title="Add to Library & Start Watching"
                      >
                        <PlayCircle className="w-3.5 h-3.5" />
                        <span>Watching</span>
                      </button>
                      <button
                        type="button"
                        disabled={isAddingFranchisePartId === nextFranchiseMovie.part.id}
                        onClick={() => handleAddFranchisePart(nextFranchiseMovie.part, 'completed')}
                        className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs transition-all shadow-md active:scale-95 cursor-pointer"
                        title="Add to Library and Mark as Watched"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Watched</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Franchise / Series Collection Full Sequence (Issue #34) */}
          {(collection || media.collectionName) && (
            <div className="p-4 rounded-xl bg-zinc-950/60 border border-zinc-800/80 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-purple-500/20 text-purple-400 flex items-center justify-center shrink-0">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-xs sm:text-sm font-bold text-purple-300 flex items-center gap-1.5 truncate">
                      <span>{collection ? collection.name : media.collectionName}</span>
                      {collection && (
                        <span className="text-[10px] text-zinc-400 font-normal">
                          ({collection.parts.length} movies)
                        </span>
                      )}
                    </h3>
                    <p className="text-[10px] text-zinc-400">
                      Official TMDB Movie Franchise Sequence
                    </p>
                  </div>
                </div>

                {onOpenInCanvas && (
                  <button
                    type="button"
                    onClick={() => {
                      onOpenInCanvas(media);
                      onClose();
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs transition-all shadow-xs cursor-pointer"
                  >
                    <Network className="w-3.5 h-3.5" />
                    <span>Open in Canvas</span>
                  </button>
                )}
              </div>

              {/* Sequence Carousel */}
              {isLoadingCollection ? (
                <div className="flex items-center justify-center py-6 text-zinc-400 text-xs">
                  <RefreshCw className="w-4 h-4 animate-spin mr-2 text-purple-400" />
                  <span>Loading franchise collection sequence...</span>
                </div>
              ) : franchiseSequence.length > 0 ? (
                <div className="flex gap-3 overflow-x-auto pb-2 pt-1 scrollbar-thin">
                  {franchiseSequence.map(({ part, index, isCurrent, isInLibrary, libraryItem, status: partStatus }) => {
                    const posterUrl = part.poster_path 
                      ? (part.poster_path.startsWith('http') ? part.poster_path : `https://image.tmdb.org/t/p/w200${part.poster_path}`)
                      : null;
                    const year = part.release_date ? part.release_date.slice(0, 4) : 'N/A';

                    return (
                      <div
                        key={part.id}
                        className={`group relative flex flex-col w-32 sm:w-36 shrink-0 rounded-xl overflow-hidden bg-zinc-900 border transition-all ${
                          isCurrent
                            ? 'border-purple-500 ring-2 ring-purple-500/40 shadow-lg shadow-purple-500/10'
                            : isInLibrary
                            ? 'border-zinc-700 hover:border-zinc-500 cursor-pointer'
                            : 'border-zinc-800/80 hover:border-zinc-700'
                        }`}
                        onClick={() => {
                          if (!isCurrent && isInLibrary && libraryItem) {
                            handleSelectFranchiseMovie(libraryItem);
                          }
                        }}
                      >
                        {/* Poster */}
                        <div className="relative aspect-[2/3] w-full bg-zinc-950 overflow-hidden">
                          {posterUrl ? (
                            <img
                              src={posterUrl}
                              alt={part.title}
                              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                              loading="lazy"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-zinc-600">
                              <Film className="w-8 h-8 opacity-40" />
                            </div>
                          )}

                          {/* Part Index Badge */}
                          <div className="absolute top-1.5 left-1.5">
                            <span className="px-1.5 py-0.5 rounded bg-black/70 backdrop-blur-xs text-[9px] font-bold text-white border border-white/10">
                              #{index + 1}
                            </span>
                          </div>

                          {/* Year Badge */}
                          <div className="absolute top-1.5 right-1.5">
                            <span className="px-1.5 py-0.5 rounded bg-black/70 backdrop-blur-xs text-[9px] font-medium text-zinc-300 border border-white/10">
                              {year}
                            </span>
                          </div>

                          {/* Rating Pill */}
                          {part.vote_average ? (
                            <div className="absolute bottom-1.5 left-1.5">
                              <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-black/75 backdrop-blur-xs text-[9px] font-bold text-[#ffd60a] border border-white/10">
                                <Star className="w-2 h-2 fill-[#ffd60a]" />
                                {part.vote_average.toFixed(1)}
                              </span>
                            </div>
                          ) : null}
                        </div>

                        {/* Title & Status */}
                        <div className="p-2 flex flex-col flex-1 justify-between gap-1.5">
                          <h5 className="text-[11px] font-bold text-white truncate" title={part.title}>
                            {part.title}
                          </h5>

                          {/* Status Pill or Quick Add */}
                          {isCurrent ? (
                            <span className="text-center text-[9px] font-bold py-0.5 px-1 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                              Viewing Now
                            </span>
                          ) : isInLibrary && libraryItem ? (
                            <div className="flex items-center justify-between gap-1">
                              <span className={`text-[9px] font-bold py-0.5 px-1.5 rounded border truncate ${
                                partStatus === 'completed'
                                  ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                                  : partStatus === 'watching'
                                  ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                                  : 'bg-[var(--accent-bg)] text-[var(--accent)] border-[var(--accent)]/30'
                              }`}>
                                {partStatus === 'completed' ? 'Watched' : partStatus === 'watching' ? 'Watching' : 'Plan to Watch'}
                              </span>
                              {partStatus !== 'completed' ? (
                                <button
                                  type="button"
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    await updateMediaStatus(libraryItem.id, 'completed');
                                    setSyncNotice({ success: true, message: `🎉 Marked "${part.title}" as Watched!` });
                                    if (onUpdated) onUpdated();
                                    const all = await getAllMedia();
                                    setLibraryMovies(all.filter(m => m.type === 'movie'));
                                  }}
                                  className="p-1 rounded bg-emerald-600/20 hover:bg-emerald-600 text-emerald-400 hover:text-white border border-emerald-500/30 transition-all cursor-pointer shrink-0"
                                  title="Mark as Watched"
                                >
                                  <Check className="w-2.5 h-2.5" />
                                </button>
                              ) : (
                                <Eye className="w-3 h-3 text-zinc-500 group-hover:text-white transition-colors shrink-0" />
                              )}
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 w-full">
                              <button
                                type="button"
                                disabled={isAddingFranchisePartId === part.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleAddFranchisePart(part, 'plan_to_watch');
                                }}
                                className="flex items-center justify-center gap-1 flex-1 py-1 px-1 rounded-lg bg-[var(--accent)]/20 hover:bg-[var(--accent)] text-[var(--accent)] hover:text-white border border-[var(--accent)]/30 text-[10px] font-bold transition-all shadow-xs cursor-pointer"
                                title="Add to Watchlist"
                              >
                                {isAddingFranchisePartId === part.id ? (
                                  <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                                ) : (
                                  <Plus className="w-2.5 h-2.5" />
                                )}
                                <span>Add</span>
                              </button>
                              <button
                                type="button"
                                disabled={isAddingFranchisePartId === part.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleAddFranchisePart(part, 'completed');
                                }}
                                className="flex items-center justify-center p-1 rounded-lg bg-emerald-600/25 hover:bg-emerald-600 text-emerald-400 hover:text-white border border-emerald-500/30 text-[10px] font-bold transition-all shadow-xs cursor-pointer"
                                title="Add and mark as Watched"
                              >
                                <Check className="w-2.5 h-2.5" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          )}
          
          {/* Controls Bar: Status, Rating, and Quick Actions */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 bg-zinc-950/60 rounded-xl border border-zinc-800/80">
            {/* Status Selector */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-[var(--text-secondary)] font-medium">Status:</span>
              <select
                value={status}
                onChange={(e) => handleStatusChange(e.target.value as MediaStatus)}
                className="px-3 py-1.5 bg-[var(--bg-secondary)] border border-[var(--border-light)] rounded-lg text-xs font-semibold text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] cursor-pointer"
              >
                {isBook ? (
                  <>
                    <option value="watching">Reading</option>
                    <option value="plan_to_watch">Plan to Read</option>
                    <option value="completed">Read</option>
                    <option value="on_hold">On Hold</option>
                    <option value="dropped">Did Not Finish (DNF)</option>
                  </>
                ) : (
                  <>
                    <option value="watching">Watching</option>
                    {isTv && <option value="caught_up">Caught Up</option>}
                    <option value="plan_to_watch">Plan to Watch</option>
                    <option value="completed">Completed</option>
                    <option value="on_hold">On Hold</option>
                    <option value="dropped">Dropped</option>
                  </>
                )}
              </select>
            </div>

            {/* Quick Rating with Direct Decimal Input & Scale Selector */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-[var(--text-secondary)] font-medium flex items-center gap-1">
                <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                <span>My Rating:</span>
              </span>
              <div className="flex items-center bg-[var(--bg-secondary)] border border-[var(--border-light)] rounded-lg px-2 py-1 focus-within:border-[var(--accent)] transition-all">
                <input
                  type="number"
                  min="0"
                  max={RATING_SCALE_CONFIG[activeScale].max}
                  step={RATING_SCALE_CONFIG[activeScale].step}
                  placeholder="Unrated"
                  value={ratingInput}
                  onChange={(e) => setRatingInput(e.target.value)}
                  onBlur={() => handleRatingCommit(ratingInput)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      (e.target as HTMLInputElement).blur();
                    }
                  }}
                  className="w-16 bg-transparent text-xs font-semibold text-amber-300 placeholder-[var(--text-secondary)] focus:outline-none"
                />
                <select
                  value={activeScale}
                  onChange={(e) => handleScaleChange(e.target.value as RatingScale)}
                  className="bg-transparent text-[11px] font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] focus:outline-none cursor-pointer border-l border-[var(--border-light)] pl-1.5"
                  title="Switch rating scale"
                >
                  <option value="10" className="bg-[var(--card-bg)] text-[var(--text-primary)]">/ 10</option>
                  <option value="5" className="bg-[var(--card-bg)] text-[var(--text-primary)]">/ 5</option>
                  <option value="100" className="bg-[var(--card-bg)] text-[var(--text-primary)]">/ 100</option>
                </select>
              </div>
            </div>

            {/* Action buttons (Sync / Canvas / Edit Custom / Delete) */}
            <div className="flex items-center gap-2 ml-auto">
              {onOpenInCanvas && (
                <button
                  type="button"
                  onClick={() => {
                    onOpenInCanvas(media);
                    onClose();
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--accent)]/15 hover:bg-[var(--accent)]/25 text-[var(--accent)] border border-[var(--accent)]/30 text-xs font-semibold transition-all shadow-xs"
                  title="View in Franchise Canvas"
                >
                  <Network className="w-3.5 h-3.5" />
                  <span>Franchise Canvas</span>
                </button>
              )}

              {isTv && media.externalId && (
                <button
                  type="button"
                  onClick={() => handleSync(false)}
                  disabled={isSyncing}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--bg-secondary)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-light)] text-xs font-medium transition-all disabled:opacity-50"
                  title="Check TVMaze/TMDB for new seasons, episodes, and updated titles"
                >
                  <RefreshCw className={`w-3.5 h-3.5 text-emerald-400 ${isSyncing ? 'animate-spin' : ''}`} />
                  <span>{isSyncing ? 'Checking...' : 'Sync Episodes'}</span>
                </button>
              )}

              {onEditCustom && (
                <button
                  type="button"
                  onClick={() => onEditCustom(media)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--bg-secondary)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-light)] text-xs font-medium transition-all"
                  title="Edit metadata or custom episodes"
                >
                  <Edit3 className="w-3.5 h-3.5 text-[var(--accent)]" />
                  <span>Edit</span>
                </button>
              )}
              <button
                type="button"
                onClick={handleDelete}
                className="p-1.5 rounded-lg bg-zinc-900 hover:bg-red-950/60 text-zinc-400 hover:text-red-400 border border-zinc-800 hover:border-red-800/60 text-xs transition-all"
                title="Delete from library"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Folders & Custom Lists assignment */}
          <div className="p-3.5 bg-zinc-950/60 rounded-xl border border-zinc-800/80 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[var(--text-secondary)] flex items-center gap-1.5">
                <Folder className="w-3.5 h-3.5 text-[var(--accent)]" />
                <span>Folders & Custom Lists:</span>
              </span>
              {isCreatingList ? (
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    value={newListName}
                    onChange={(e) => setNewListName(e.target.value)}
                    placeholder="New list name..."
                    className="px-2 py-0.5 bg-[var(--input-bg)] border border-[var(--input-border)] rounded text-xs text-[var(--text-primary)] focus:outline-none"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleCreateAndAddList();
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleCreateAndAddList}
                    className="px-2 py-0.5 rounded bg-[var(--accent)] text-white text-xs font-semibold"
                  >
                    Add
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsCreatingList(false)}
                    className="p-0.5 text-zinc-400 hover:text-white"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsCreatingList(true)}
                  className="text-xs text-[var(--accent)] hover:underline flex items-center gap-1 font-semibold"
                >
                  <Plus className="w-3 h-3" />
                  <span>New Folder</span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-1.5 flex-wrap pt-1">
              {allLists.length === 0 && !isCreatingList && (
                <span className="text-xs text-zinc-500 italic">
                  No folders created yet. Click "+ New Folder" to organize!
                </span>
              )}
              {allLists.map(list => {
                const isMember = mediaLists.includes(list.name);
                return (
                  <button
                    key={list.id}
                    type="button"
                    onClick={() => handleToggleList(list.name)}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
                      isMember
                        ? 'bg-[var(--accent)] text-white border-[var(--accent)] shadow-sm'
                        : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] border-[var(--border-light)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    {isMember && <Check className="w-3 h-3" />}
                    <span>{list.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Sync Notice Banner */}
          {syncNotice && (
            <div className={`p-3 rounded-xl text-xs flex items-center justify-between gap-2 border animate-fadeIn ${
              syncNotice.success ? 'bg-emerald-950/50 text-emerald-300 border-emerald-800/60' : 'bg-red-950/50 text-red-300 border-red-800/60'
            }`}>
              <span>{syncNotice.message}</span>
              <button type="button" onClick={() => setSyncNotice(null)} className="text-zinc-400 hover:text-white text-xs px-1">✕</button>
            </div>
          )}

          {/* Overview / Synopsis */}
          {(media.overview || isBook) && (
            <div>
              <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Overview</h3>
                {isBook && (
                  <button
                    type="button"
                    disabled={isEnrichingSynopsis}
                    onClick={handleEnrichSynopsis}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] text-[var(--accent)] hover:brightness-110 border border-[var(--border-light)] text-[11px] font-semibold transition-all active:scale-95 disabled:opacity-50 cursor-pointer shadow-xs"
                    title="Enrich plot synopsis and genres from Google Books or Open Library"
                  >
                    {isEnrichingSynopsis ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3 text-amber-400" />}
                    <span>{isEnrichingSynopsis ? 'Enriching...' : (media.overview ? 'Enrich Blurb & Genres' : 'Fetch Blurb & Genres')}</span>
                  </button>
                )}
              </div>
              {media.overview ? (
                <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-line">{media.overview}</p>
              ) : (
                <p className="text-xs italic text-zinc-500 py-1">
                  No synopsis available yet. Click "Fetch Blurb & Genres" above to retrieve one.
                </p>
              )}
            </div>
          )}

          {/* BOOK READING PROGRESS TRACKING */}
          {isBook && (
            <div className="space-y-4 pt-2 border-t border-zinc-800">
              <div className="p-4 bg-[var(--accent-bg)] rounded-xl border border-[var(--accent)]/30 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    {bookProgressMode === 'time' ? (
                      <Headphones className="w-4 h-4 text-[var(--accent)]" />
                    ) : (
                      <BookOpen className="w-4 h-4 text-[var(--accent)]" />
                    )}
                    <h3 className="text-sm font-bold text-[var(--text-primary)]">
                      {bookProgressMode === 'time' ? 'Listening Progress' : 'Reading Progress'}
                    </h3>
                    {media.narrator && (
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-[var(--bg-tertiary)] border border-[var(--border-light)] text-[var(--text-secondary)] font-medium flex items-center gap-1">
                        <Volume2 className="w-3 h-3 text-[var(--accent)]" />
                        {media.narrator}
                      </span>
                    )}
                  </div>

                  {/* Mode Selector Toggle: Pages vs Chapters vs Listening Time */}
                  <div className="flex items-center bg-[var(--bg-primary)] p-0.5 rounded-lg border border-[var(--border-light)] text-xs">
                    <button
                      type="button"
                      onClick={() => {
                        setBookProgressMode('pages');
                        handleApplyBookProgress({ progressMode: 'pages' });
                      }}
                      className={`px-2.5 py-1 rounded-md font-semibold transition-all ${
                        bookProgressMode === 'pages'
                          ? 'bg-[var(--accent)] text-white shadow-sm'
                          : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      Pages
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setBookProgressMode('chapters');
                        handleApplyBookProgress({ progressMode: 'chapters' });
                      }}
                      className={`px-2.5 py-1 rounded-md font-semibold transition-all ${
                        bookProgressMode === 'chapters'
                          ? 'bg-[var(--accent)] text-white shadow-sm'
                          : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      Chapters
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setBookProgressMode('time');
                        handleApplyBookProgress({ progressMode: 'time' });
                      }}
                      className={`px-2.5 py-1 rounded-md font-semibold transition-all flex items-center gap-1 ${
                        bookProgressMode === 'time'
                          ? 'bg-[var(--accent)] text-white shadow-sm'
                          : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      <Headphones className="w-3 h-3" />
                      <span>Time</span>
                    </button>
                  </div>
                </div>

                {/* Progress Stats & Bar */}
                {bookProgressMode === 'time' ? (
                  <>
                    <div className="flex items-center justify-between text-xs text-[var(--text-secondary)] font-mono flex-wrap gap-2">
                      <span>
                        {(Number(media.totalDurationSeconds) || 0) > 0
                          ? `${formatAudioProgress(media.currentDurationSeconds || 0, media.totalDurationSeconds || 0)} (${Math.min(100, Math.round(((media.currentDurationSeconds || 0) / (media.totalDurationSeconds || 1)) * 100))}%)`
                          : `${formatAudioDuration(media.currentDurationSeconds || 0)} listened (Total runtime not set)`}
                      </span>
                      {media.audioPreviewUrl && (
                        <button
                          type="button"
                          onClick={handleToggleSamplePlayback}
                          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                            isPlayingSample
                              ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 animate-pulse'
                              : 'bg-[var(--bg-primary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border-[var(--border-light)]'
                          }`}
                          title="Listen to 30s sample preview"
                        >
                          {isPlayingSample ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3 fill-current" />}
                          <span>{isPlayingSample ? 'Playing Sample...' : 'Sample Audio'}</span>
                        </button>
                      )}
                    </div>

                    {(Number(media.totalDurationSeconds) || 0) > 0 ? (
                      <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all duration-300 rounded-full ${
                            (media.currentDurationSeconds || 0) >= (media.totalDurationSeconds || 0)
                              ? 'bg-emerald-500'
                              : 'bg-gradient-to-r from-[var(--accent)] to-[#30d158]'
                          }`}
                          style={{ width: `${Math.min(100, Math.round(((media.currentDurationSeconds || 0) / (media.totalDurationSeconds || 1)) * 100))}%` }}
                        />
                      </div>
                    ) : null}

                    {/* Listening Position and Total Inputs */}
                    <div className="flex flex-wrap items-center gap-3 pt-1">
                      <div className="flex items-center gap-2 bg-[var(--bg-primary)] px-3 py-1.5 rounded-lg border border-[var(--border-light)]">
                        <span className="text-xs text-[var(--text-secondary)] font-medium">Position:</span>
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            min="0"
                            value={inputAudioHours}
                            onChange={(e) => setInputAudioHours(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                const curSec = hoursMinutesToSeconds(Number(inputAudioHours) || 0, Number(inputAudioMinutes) || 0);
                                const totSec = hoursMinutesToSeconds(Number(inputAudioTotalHours) || 0, Number(inputAudioTotalMinutes) || 0);
                                handleApplyBookProgress({
                                  currentDurationSeconds: curSec,
                                  totalDurationSeconds: totSec || undefined,
                                  progressMode: 'time'
                                });
                              }
                            }}
                            className="w-12 bg-[var(--card-bg)] px-1.5 py-1 rounded text-xs text-center font-bold text-[var(--accent)] border border-[var(--border-light)] focus:outline-none focus:border-[var(--accent)]"
                            placeholder="0"
                          />
                          <span className="text-xs text-[var(--text-secondary)] font-medium">h</span>
                          <input
                            type="number"
                            min="0"
                            max="59"
                            value={inputAudioMinutes}
                            onChange={(e) => setInputAudioMinutes(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                const curSec = hoursMinutesToSeconds(Number(inputAudioHours) || 0, Number(inputAudioMinutes) || 0);
                                const totSec = hoursMinutesToSeconds(Number(inputAudioTotalHours) || 0, Number(inputAudioTotalMinutes) || 0);
                                handleApplyBookProgress({
                                  currentDurationSeconds: curSec,
                                  totalDurationSeconds: totSec || undefined,
                                  progressMode: 'time'
                                });
                              }
                            }}
                            className="w-12 bg-[var(--card-bg)] px-1.5 py-1 rounded text-xs text-center font-bold text-[var(--accent)] border border-[var(--border-light)] focus:outline-none focus:border-[var(--accent)]"
                            placeholder="0"
                          />
                          <span className="text-xs text-[var(--text-secondary)] font-medium">m</span>
                        </div>
                        <span className="text-xs text-[var(--text-secondary)] font-mono">/</span>
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            min="0"
                            value={inputAudioTotalHours}
                            onChange={(e) => setInputAudioTotalHours(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                const curSec = hoursMinutesToSeconds(Number(inputAudioHours) || 0, Number(inputAudioMinutes) || 0);
                                const totSec = hoursMinutesToSeconds(Number(inputAudioTotalHours) || 0, Number(inputAudioTotalMinutes) || 0);
                                handleApplyBookProgress({
                                  currentDurationSeconds: curSec,
                                  totalDurationSeconds: totSec || undefined,
                                  progressMode: 'time'
                                });
                              }
                            }}
                            className="w-12 bg-[var(--card-bg)] px-1.5 py-1 rounded text-xs text-center font-semibold text-[var(--text-primary)] border border-[var(--border-light)] focus:outline-none focus:border-[var(--accent)]"
                            placeholder="Total"
                            title="Total Hours"
                          />
                          <span className="text-xs text-[var(--text-secondary)] font-medium">h</span>
                          <input
                            type="number"
                            min="0"
                            max="59"
                            value={inputAudioTotalMinutes}
                            onChange={(e) => setInputAudioTotalMinutes(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                const curSec = hoursMinutesToSeconds(Number(inputAudioHours) || 0, Number(inputAudioMinutes) || 0);
                                const totSec = hoursMinutesToSeconds(Number(inputAudioTotalHours) || 0, Number(inputAudioTotalMinutes) || 0);
                                handleApplyBookProgress({
                                  currentDurationSeconds: curSec,
                                  totalDurationSeconds: totSec || undefined,
                                  progressMode: 'time'
                                });
                              }
                            }}
                            className="w-12 bg-[var(--card-bg)] px-1.5 py-1 rounded text-xs text-center font-semibold text-[var(--text-primary)] border border-[var(--border-light)] focus:outline-none focus:border-[var(--accent)]"
                            placeholder="Total"
                            title="Total Minutes"
                          />
                          <span className="text-xs text-[var(--text-secondary)] font-medium">m</span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          const curSec = hoursMinutesToSeconds(Number(inputAudioHours) || 0, Number(inputAudioMinutes) || 0);
                          const totSec = hoursMinutesToSeconds(Number(inputAudioTotalHours) || 0, Number(inputAudioTotalMinutes) || 0);
                          handleApplyBookProgress({
                            currentDurationSeconds: curSec,
                            totalDurationSeconds: totSec || undefined,
                            progressMode: 'time'
                          });
                        }}
                        className="px-3 py-2 rounded-lg bg-[var(--accent)] hover:brightness-110 text-white text-xs font-bold transition-all shadow-md shadow-[var(--accent)]/25 active:scale-95"
                      >
                        Set Time
                      </button>

                      <div className="flex items-center gap-1.5 flex-wrap">
                        <button
                          type="button"
                          onClick={() => handleQuickAudioIncrement(15 * 60)}
                          className="px-2.5 py-1.5 rounded-lg bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-xs font-semibold border border-[var(--border-light)] transition-all active:scale-95"
                          title="Listen 15 minutes more"
                        >
                          +15m
                        </button>
                        <button
                          type="button"
                          onClick={() => handleQuickAudioIncrement(30 * 60)}
                          className="px-2.5 py-1.5 rounded-lg bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-xs font-semibold border border-[var(--border-light)] transition-all active:scale-95"
                          title="Listen 30 minutes more"
                        >
                          +30m
                        </button>
                        <button
                          type="button"
                          onClick={() => handleQuickAudioIncrement(60 * 60)}
                          className="px-2.5 py-1.5 rounded-lg bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-xs font-semibold border border-[var(--border-light)] transition-all active:scale-95"
                          title="Listen 1 hour more"
                        >
                          +1h
                        </button>
                        {(Number(media.totalDurationSeconds) > 0 || Number(inputAudioTotalHours) > 0 || Number(inputAudioTotalMinutes) > 0) && (
                          <button
                            type="button"
                            onClick={handleFinishBook}
                            className="px-3 py-1.5 rounded-lg bg-emerald-900/50 hover:bg-emerald-800 text-emerald-300 text-xs font-semibold border border-emerald-700/50 transition-all active:scale-95"
                            title="Mark audiobook as finished"
                          >
                            Finished Audiobook
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Companion Print Pages Notice if duration is unset */}
                    {Number(media.totalPages) > 0 && !(Number(media.totalDurationSeconds) > 0) && (
                      <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)] bg-[var(--bg-primary)] px-3 py-2 rounded-lg border border-[var(--border-light)] mt-1">
                        <BookOpen className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                        <span>
                          Companion edition has <strong>{media.totalPages} pages</strong>. You can enter total listening hours &amp; minutes above if you know the audio length, or switch to <strong>Pages</strong> mode to track reading.
                        </span>
                      </div>
                    )}
                  </>
                ) : bookProgressMode === 'chapters' ? (
                  <>
                    <div className="flex items-center justify-between text-xs text-[var(--text-secondary)] font-mono">
                      <span>
                        {(Number(media.totalChapters) || 0) > 0
                          ? `Chapter ${media.currentChapter || 0} of ${media.totalChapters} (${Math.min(100, Math.round(((media.currentChapter || 0) / (media.totalChapters || 1)) * 100))}%)`
                          : `${media.currentChapter || 0} chapters read (Total chapters not set)`}
                      </span>
                    </div>
                    {(Number(media.totalChapters) || 0) > 0 ? (
                      <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all duration-300 rounded-full ${
                            (media.currentChapter || 0) >= (media.totalChapters || 0)
                              ? 'bg-emerald-500'
                              : 'bg-gradient-to-r from-[var(--accent)] to-[#30d158]'
                          }`}
                          style={{ width: `${Math.min(100, Math.round(((media.currentChapter || 0) / (media.totalChapters || 1)) * 100))}%` }}
                        />
                      </div>
                    ) : null}

                    {/* Chapter input and Quick increments */}
                    <div className="flex flex-wrap items-center gap-3 pt-1">
                      <div className="flex items-center gap-1.5 bg-[var(--bg-primary)] px-3 py-1.5 rounded-lg border border-[var(--border-light)]">
                        <span className="text-xs text-[var(--text-secondary)] font-medium">Chapter:</span>
                        <input
                          type="number"
                          min="0"
                          value={inputBookChapter}
                          onChange={(e) => setInputBookChapter(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              handleApplyBookProgress({
                                currentChapter: Math.max(0, parseInt(String(inputBookChapter), 10) || 0),
                                totalChapters: parseInt(String(inputBookTotalChapters), 10) || undefined,
                                progressMode: 'chapters'
                              });
                            }
                          }}
                          className="w-14 bg-[var(--card-bg)] px-2 py-1 rounded text-xs text-center font-bold text-[var(--accent)] border border-[var(--border-light)] focus:outline-none focus:border-[var(--accent)]"
                          placeholder="0"
                        />
                        <span className="text-xs text-[var(--text-secondary)] font-mono">/</span>
                        <input
                          type="number"
                          min="0"
                          value={inputBookTotalChapters}
                          onChange={(e) => setInputBookTotalChapters(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              handleApplyBookProgress({
                                currentChapter: Math.max(0, parseInt(String(inputBookChapter), 10) || 0),
                                totalChapters: parseInt(String(inputBookTotalChapters), 10) || undefined,
                                progressMode: 'chapters'
                              });
                            }
                          }}
                          placeholder="Total"
                          title="Total Chapters (editable)"
                          className="w-16 bg-[var(--card-bg)] px-2 py-1 rounded text-xs text-center font-semibold text-[var(--text-primary)] border border-[var(--border-light)] focus:outline-none focus:border-[var(--accent)]"
                        />
                      </div>

                      <button
                        type="button"
                        onClick={() => handleApplyBookProgress({
                          currentChapter: Math.max(0, parseInt(String(inputBookChapter), 10) || 0),
                          totalChapters: parseInt(String(inputBookTotalChapters), 10) || undefined,
                          progressMode: 'chapters'
                        })}
                        className="px-3 py-2 rounded-lg bg-[var(--accent)] hover:brightness-110 text-white text-xs font-bold transition-all shadow-md shadow-[var(--accent)]/25 active:scale-95"
                      >
                        Set Chapter
                      </button>

                      <div className="flex items-center gap-1.5 flex-wrap">
                        <button
                          type="button"
                          onClick={() => handleApplyBookProgress({
                            currentChapter: (media.currentChapter || 0) + 1,
                            progressMode: 'chapters'
                          })}
                          className="px-2.5 py-1.5 rounded-lg bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-xs font-semibold border border-[var(--border-light)] transition-all active:scale-95"
                          title="Read 1 more chapter"
                        >
                          +1 Ch
                        </button>
                        <button
                          type="button"
                          onClick={() => handleApplyBookProgress({
                            currentChapter: (media.currentChapter || 0) + 5,
                            progressMode: 'chapters'
                          })}
                          className="px-2.5 py-1.5 rounded-lg bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-xs font-semibold border border-[var(--border-light)] transition-all active:scale-95"
                          title="Read 5 more chapters"
                        >
                          +5 Ch
                        </button>
                        {(Number(media.totalChapters) > 0 || Number(media.totalPages) > 0 || Number(inputBookTotalChapters) > 0 || Number(inputBookTotalPages) > 0) && (
                          <button
                            type="button"
                            onClick={handleFinishBook}
                            className="px-3 py-1.5 rounded-lg bg-emerald-900/50 hover:bg-emerald-800 text-emerald-300 text-xs font-semibold border border-emerald-700/50 transition-all active:scale-95"
                            title="Mark entire book as finished (completes both chapters and pages)"
                          >
                            Finished Book
                          </button>
                        )}
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center justify-between text-xs text-[var(--text-secondary)] font-mono">
                      <span>
                        {(Number(media.totalPages) || 0) > 0
                          ? `Page ${media.currentPage || 0} of ${media.totalPages} (${Math.min(100, Math.round(((media.currentPage || 0) / (media.totalPages || 1)) * 100))}%)`
                          : `${media.currentPage || 0} pages read (Total pages not set)`}
                      </span>
                    </div>

                    {/* Progress Bar */}
                    {(Number(media.totalPages) || 0) > 0 ? (
                      <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all duration-300 rounded-full ${
                            (media.currentPage || 0) >= (media.totalPages || 0)
                              ? 'bg-emerald-500'
                              : 'bg-gradient-to-r from-[var(--accent)] to-[#30d158]'
                          }`}
                          style={{ width: `${Math.min(100, Math.round(((media.currentPage || 0) / (media.totalPages || 1)) * 100))}%` }}
                        />
                      </div>
                    ) : null}

                    {/* Page input and Quick increments */}
                    <div className="flex flex-wrap items-center gap-3 pt-1">
                      <div className="flex items-center gap-1.5 bg-[var(--bg-primary)] px-3 py-1.5 rounded-lg border border-[var(--border-light)]">
                        <span className="text-xs text-[var(--text-secondary)] font-medium">Page:</span>
                        <input
                          type="number"
                          min="0"
                          value={inputBookPage}
                          onChange={(e) => setInputBookPage(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              handleApplyBookProgress({
                                currentPage: Math.max(0, parseInt(String(inputBookPage), 10) || 0),
                                totalPages: parseInt(String(inputBookTotalPages), 10) || undefined,
                                progressMode: 'pages'
                              });
                            }
                          }}
                          className="w-16 bg-[var(--card-bg)] px-2 py-1 rounded text-xs text-center font-bold text-[var(--accent)] border border-[var(--border-light)] focus:outline-none focus:border-[var(--accent)]"
                          placeholder="0"
                        />
                        <span className="text-xs text-[var(--text-secondary)] font-mono">/</span>
                        <input
                          type="number"
                          min="0"
                          value={inputBookTotalPages}
                          onChange={(e) => setInputBookTotalPages(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              handleApplyBookProgress({
                                currentPage: Math.max(0, parseInt(String(inputBookPage), 10) || 0),
                                totalPages: parseInt(String(inputBookTotalPages), 10) || undefined,
                                progressMode: 'pages'
                              });
                            }
                          }}
                          placeholder="Total"
                          title="Total Pages (editable - adjust for your book edition)"
                          className="w-16 bg-[var(--card-bg)] px-2 py-1 rounded text-xs text-center font-semibold text-[var(--text-primary)] border border-[var(--border-light)] focus:outline-none focus:border-[var(--accent)]"
                        />
                      </div>

                      <button
                        type="button"
                        onClick={() => handleApplyBookProgress({
                          currentPage: Math.max(0, parseInt(String(inputBookPage), 10) || 0),
                          totalPages: parseInt(String(inputBookTotalPages), 10) || undefined,
                          progressMode: 'pages'
                        })}
                        className="px-3 py-2 rounded-lg bg-[var(--accent)] hover:brightness-110 text-white text-xs font-bold transition-all shadow-md shadow-[var(--accent)]/25 active:scale-95"
                      >
                        Set Page
                      </button>

                      <div className="flex items-center gap-1.5 flex-wrap">
                        <button
                          type="button"
                          onClick={() => handleApplyBookProgress({
                            currentPage: (media.currentPage || 0) + 10,
                            progressMode: 'pages'
                          })}
                          className="px-2.5 py-1.5 rounded-lg bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-xs font-semibold border border-[var(--border-light)] transition-all active:scale-95"
                          title="Read 10 more pages"
                        >
                          +10 p
                        </button>
                        <button
                          type="button"
                          onClick={() => handleApplyBookProgress({
                            currentPage: (media.currentPage || 0) + 25,
                            progressMode: 'pages'
                          })}
                          className="px-2.5 py-1.5 rounded-lg bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-xs font-semibold border border-[var(--border-light)] transition-all active:scale-95"
                          title="Read 25 more pages"
                        >
                          +25 p
                        </button>
                        <button
                          type="button"
                          onClick={() => handleApplyBookProgress({
                            currentPage: (media.currentPage || 0) + 50,
                            progressMode: 'pages'
                          })}
                          className="px-2.5 py-1.5 rounded-lg bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-xs font-semibold border border-[var(--border-light)] transition-all active:scale-95"
                          title="Read 50 more pages"
                        >
                          +50 p
                        </button>
                        {(Number(media.totalPages) > 0 || Number(media.totalChapters) > 0 || Number(inputBookTotalPages) > 0 || Number(inputBookTotalChapters) > 0) && (
                          <button
                            type="button"
                            onClick={handleFinishBook}
                            className="px-3 py-1.5 rounded-lg bg-emerald-900/50 hover:bg-emerald-800 text-emerald-300 text-xs font-semibold border border-emerald-700/50 transition-all active:scale-95"
                            title="Mark entire book as finished (completes both pages and chapters)"
                          >
                            Finished Book
                          </button>
                        )}
                      </div>
                    </div>
                  </>
                )}

                {/* Percentage Progress Stepper / Direct Input (Issue #26) */}
                <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-[var(--border-light)]/40 mt-1">
                  <div className="flex items-center gap-1.5 bg-[var(--bg-primary)] px-3 py-1.5 rounded-lg border border-[var(--border-light)]">
                    <Percent className="w-3.5 h-3.5 text-[var(--accent)]" />
                    <span className="text-xs text-[var(--text-secondary)] font-medium">Percent:</span>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={inputPercentage !== '' ? inputPercentage : (bookCurrentTotal > 0 ? currentPercentage : '')}
                      onChange={(e) => setInputPercentage(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          const val = parseFloat(inputPercentage !== '' ? inputPercentage : String(currentPercentage));
                          if (!isNaN(val)) handleApplyPercentage(val);
                        }
                      }}
                      placeholder={bookCurrentTotal > 0 ? String(currentPercentage) : '0'}
                      className="w-14 bg-[var(--card-bg)] px-2 py-1 rounded text-xs text-center font-bold text-[var(--accent)] border border-[var(--border-light)] focus:outline-none focus:border-[var(--accent)]"
                    />
                    <span className="text-xs text-[var(--text-secondary)] font-mono">%</span>
                  </div>

                  <button
                    type="button"
                    disabled={bookCurrentTotal <= 0}
                    onClick={() => {
                      const val = parseFloat(inputPercentage !== '' ? inputPercentage : String(currentPercentage));
                      if (!isNaN(val)) handleApplyPercentage(val);
                    }}
                    className="px-3 py-2 rounded-lg bg-[var(--accent)] hover:brightness-110 text-white text-xs font-bold transition-all shadow-md shadow-[var(--accent)]/25 active:scale-95 disabled:opacity-50 cursor-pointer"
                    title={bookCurrentTotal <= 0 ? "Set total pages or chapters first" : "Set percentage progress"}
                  >
                    Set %
                  </button>

                  {/* Quick percentage chips */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {[25, 50, 75, 100].map(pct => (
                      <button
                        key={pct}
                        type="button"
                        disabled={bookCurrentTotal <= 0}
                        onClick={() => {
                          setInputPercentage(String(pct));
                          handleApplyPercentage(pct);
                        }}
                        className={`px-2 py-1 rounded-md text-xs font-semibold border transition-all active:scale-95 disabled:opacity-50 cursor-pointer ${
                          currentPercentage === pct && bookCurrentTotal > 0
                            ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                            : 'bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border-[var(--border-light)]'
                        }`}
                        title={`Jump to ${pct}%`}
                      >
                        {pct}%
                      </button>
                    ))}
                  </div>
                  {bookCurrentTotal <= 0 && (
                    <span className="text-[11px] text-amber-400">
                      Set total {bookProgressMode === 'chapters' ? 'chapters' : 'pages'} above to enable percentage tracking.
                    </span>
                  )}
                </div>
              </div>

              {/* Book Metadata details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                {media.author && (
                  <div className="p-3 bg-zinc-950/60 rounded-xl border border-zinc-800/80">
                    <span className="text-zinc-400 block mb-0.5">Author(s)</span>
                    <span className="text-white font-medium">{media.author}</span>
                  </div>
                )}
                {media.publisher && (
                  <div className="p-3 bg-zinc-950/60 rounded-xl border border-zinc-800/80">
                    <span className="text-zinc-400 block mb-0.5">Publisher</span>
                    <span className="text-white font-medium">{media.publisher}</span>
                  </div>
                )}
                {media.isbn && (
                  <div className="p-3 bg-zinc-950/60 rounded-xl border border-zinc-800/80">
                    <span className="text-zinc-400 block mb-0.5">ISBN</span>
                    <span className="text-white font-mono">{media.isbn}</span>
                  </div>
                )}
                {media.bookFormat && (
                  <div className="p-3 bg-zinc-950/60 rounded-xl border border-zinc-800/80">
                    <span className="text-zinc-400 block mb-0.5">Format</span>
                    <span className="text-white capitalize">{media.bookFormat}</span>
                  </div>
                )}
              </div>

              {/* Edition Switching Action (Issue #25) */}
              <div className="flex items-center justify-between gap-2 flex-wrap pt-1">
                <div className="flex items-center gap-2 flex-wrap">
                  {(media.workId || media.source === 'openlibrary' || media.isbn || isBook) && (
                    <button
                      type="button"
                      onClick={handleOpenEditionSelector}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--accent)]/15 hover:bg-[var(--accent)] text-[var(--accent)] hover:text-white border border-[var(--accent)]/30 text-xs font-semibold transition-all active:scale-95 cursor-pointer shadow-xs"
                      title="Browse alternative editions (paperback, hardcover, ebook) and adjust pages while keeping progress"
                    >
                      <BookOpen className="w-3.5 h-3.5" />
                      <span>Change Edition</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Edition Selector Modal with ISBN Search & Direct Lookup (Issue #25) */}
              {showEditionSelector && (
                <div 
                  onClick={(e) => {
                    if (e.target === e.currentTarget) setShowEditionSelector(false);
                  }}
                  className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-fadeIn"
                >
                  <div className="relative w-full max-w-lg bg-[var(--card-bg)] border border-[var(--border-light)] rounded-2xl shadow-2xl p-4 flex flex-col max-h-[80vh]">
                    <div className="flex items-center justify-between pb-3 border-b border-[var(--border-light)]">
                      <div className="flex items-center gap-2">
                        <BookOpen className="w-4 h-4 text-[var(--accent)]" />
                        <h4 className="font-bold text-sm text-[var(--text-primary)]">Select Book Edition</h4>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowEditionSelector(false)}
                        className="p-1 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <p className="text-xs text-[var(--text-secondary)] py-1.5">
                      Switching editions updates your total page count and cover while automatically preserving your reading progress percentage.
                    </p>

                    {/* ISBN Search & Direct Lookup Bar */}
                    <div className="space-y-1.5 my-2">
                      <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                          <input
                            type="text"
                            value={editionSearchQuery}
                            onChange={(e) => {
                              setEditionSearchQuery(e.target.value);
                              setIsbnLookupMessage(null);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleIsbnLookup();
                              }
                            }}
                            placeholder="Filter editions or lookup ISBN (e.g. 9780441172719)..."
                            className="w-full pl-8 pr-7 py-1.5 text-xs bg-[var(--bg-primary)] border border-[var(--border-light)] rounded-lg text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:outline-none focus:border-[var(--accent)]"
                          />
                          {editionSearchQuery && (
                            <button
                              type="button"
                              onClick={() => {
                                setEditionSearchQuery('');
                                setIsbnLookupMessage(null);
                              }}
                              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200 text-xs cursor-pointer"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={handleIsbnLookup}
                          disabled={isLookingUpIsbn || !editionSearchQuery.trim()}
                          className="px-3 py-1.5 rounded-lg bg-[var(--accent)] hover:brightness-110 text-white text-xs font-semibold shrink-0 disabled:opacity-40 transition-all flex items-center gap-1 cursor-pointer shadow-xs"
                          title="Directly fetch edition by ISBN (10 or 13 digits) or Open Library edition ID"
                        >
                          {isLookingUpIsbn ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                          <span>Lookup ISBN</span>
                        </button>
                      </div>

                      {isbnLookupMessage && (
                        <p className={`text-[11px] flex items-center gap-1 ${
                          isbnLookupMessage.type === 'success' ? 'text-emerald-400' : 'text-amber-400'
                        }`}>
                          <span>{isbnLookupMessage.type === 'success' ? '✓' : '⚠'}</span>
                          <span>{isbnLookupMessage.text}</span>
                        </p>
                      )}
                    </div>

                    <div className="flex-1 overflow-y-auto space-y-2 py-1 pr-1">
                      {isLoadingEditions && (
                        <div className="flex flex-col items-center justify-center py-10 gap-2 text-xs text-[var(--text-secondary)]">
                          <RefreshCw className="w-5 h-5 animate-spin text-[var(--accent)]" />
                          <span>Loading available editions from Open Library...</span>
                        </div>
                      )}

                      {!isLoadingEditions && filteredAvailableEditions.length === 0 && (
                        <div className="text-center py-8 text-xs text-[var(--text-secondary)] space-y-1">
                          <p>{editionSearchQuery ? 'No editions match your search filter.' : 'No other editions found for this book work.'}</p>
                          {editionSearchQuery && (
                            <p className="text-[11px] text-zinc-400">
                              Tip: Click "Lookup ISBN" above to fetch this specific edition directly from Open Library or Google Books.
                            </p>
                          )}
                        </div>
                      )}

                      {!isLoadingEditions && filteredAvailableEditions.map(ed => (
                        <div
                          key={ed.id}
                          className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-light)] hover:border-[var(--accent)] transition-all"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-9 aspect-[2/3] rounded bg-zinc-800 overflow-hidden shrink-0 border border-[var(--border-light)]">
                              {ed.coverUrl ? (
                                <img src={ed.coverUrl} alt={ed.title} className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-zinc-500">
                                  {ed.physicalFormat === 'Audiobook' ? <Headphones className="w-4 h-4" /> : <BookOpen className="w-4 h-4" />}
                                </div>
                              )}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-bold text-xs text-[var(--text-primary)] truncate max-w-xs">{ed.title}</span>
                                <span className="text-[10px] px-1.5 py-0.2 rounded font-semibold bg-[var(--accent)]/15 text-[var(--accent)] capitalize flex items-center gap-1">
                                  {ed.physicalFormat === 'Audiobook' && <Headphones className="w-3 h-3" />}
                                  {ed.physicalFormat || 'Edition'}
                                </span>
                              </div>
                              <div className="text-[11px] text-[var(--text-secondary)] flex items-center gap-2 flex-wrap mt-0.5 font-mono">
                                {ed.totalDurationSeconds ? (
                                  <span>{formatAudioDuration(ed.totalDurationSeconds)}</span>
                                ) : ed.totalPages ? (
                                  <span>{ed.totalPages} pages</span>
                                ) : (
                                  <span>Length unlisted</span>
                                )}
                                {ed.narrator ? <span>• Narrated by {ed.narrator}</span> : null}
                                {ed.publishers?.[0] ? <span>• {ed.publishers[0]}</span> : null}
                                {ed.year ? <span>({ed.year})</span> : null}
                                {ed.isbn ? <span>ISBN: {ed.isbn}</span> : null}
                              </div>
                            </div>
                          </div>

                          <button
                            type="button"
                            disabled={isChangingEdition}
                            onClick={() => handleSelectEdition(ed)}
                            className="px-3 py-1.5 rounded-lg bg-[var(--accent)] hover:brightness-110 text-white text-xs font-semibold shrink-0 transition-all active:scale-95 disabled:opacity-50 cursor-pointer shadow-xs"
                          >
                            {isChangingEdition ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : 'Switch'}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TV SERIES SPECIFIC TRACKING */}
          {isTv && (
            <div className="space-y-6 pt-2 border-t border-zinc-800">
              
              {/* 1. PRECISE SEASON & EPISODE INSERTION TOOL */}
              <div className="p-4 bg-[var(--accent-bg)] rounded-xl border border-[var(--accent)]/30 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <Eye className="w-4 h-4 text-[var(--accent)]" />
                    <h3 className="text-sm font-bold text-[var(--text-primary)]">Precise Progress Setter</h3>
                  </div>
                  <span className="text-xs text-[var(--text-secondary)] font-mono">
                    Currently at: {media.currentSeason ? `S${media.currentSeason}` : 'S1'} {media.currentEpisode ? `E${media.currentEpisode}` : 'E0'}
                  </span>
                </div>

                <p className="text-xs text-[var(--text-secondary)]">
                  Quickly set the exact season and episode you have reached:
                </p>

                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2 bg-[var(--bg-primary)] px-3 py-1.5 rounded-lg border border-[var(--border-light)]">
                    <span className="text-xs text-[var(--text-secondary)] font-medium">Season:</span>
                    <input
                      type="number"
                      min="1"
                      max={seasonNumbers[seasonNumbers.length - 1] || 50}
                      value={inputSeason}
                      onChange={(e) => setInputSeason(e.target.value)}
                      className="w-14 bg-[var(--card-bg)] px-2 py-1 rounded text-xs text-center font-bold text-[var(--accent)] border border-[var(--border-light)] focus:outline-none focus:border-[var(--accent)]"
                    />
                  </div>

                  <div className="flex items-center gap-2 bg-[var(--bg-primary)] px-3 py-1.5 rounded-lg border border-[var(--border-light)]">
                    <span className="text-xs text-[var(--text-secondary)] font-medium">Episode:</span>
                    <input
                      type="number"
                      min="0"
                      max="200"
                      value={inputEpisode}
                      onChange={(e) => setInputEpisode(e.target.value)}
                      className="w-14 bg-[var(--card-bg)] px-2 py-1 rounded text-xs text-center font-bold text-[var(--accent)] border border-[var(--border-light)] focus:outline-none focus:border-[var(--accent)]"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => handleApplyExactProgress(true)}
                    className="px-3.5 py-2 rounded-lg bg-[var(--accent)] hover:brightness-110 text-white text-xs font-bold transition-all shadow-md shadow-[var(--accent)]/25 active:scale-95"
                  >
                    Set & Mark Watched
                  </button>

                  <button
                    type="button"
                    onClick={() => handleApplyExactProgress(false)}
                    className="px-3 py-2 rounded-lg bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-xs font-medium border border-[var(--border-light)] transition-all"
                    title="Update current pointer without altering episode checkboxes"
                  >
                    Set Pointer Only
                  </button>
                </div>
              </div>

              {/* 2. NEXT UP TO WATCH HIGHLIGHT OR CAUGHT UP BANNER */}
              {nextUpEpisode ? (
                <div className="flex items-center justify-between gap-3 p-3.5 rounded-xl bg-[var(--accent-bg)] border border-[var(--accent)]/30 text-xs">
                  <div className="flex items-center gap-2.5">
                    <PlayCircle className="w-5 h-5 text-[var(--accent)] shrink-0" />
                    <div>
                      <span className="font-semibold text-[var(--accent)]">Up Next: </span>
                      <span className="text-[var(--text-primary)] font-bold">
                        S{nextUpEpisode.seasonNumber}E{nextUpEpisode.episodeNumber}
                      </span>
                      <span className="text-[var(--text-secondary)] font-medium ml-1">
                        — "{nextUpEpisode.title}"
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleToggleEpisode(nextUpEpisode)}
                    className="px-3 py-1.5 rounded-lg bg-[var(--accent)] hover:brightness-110 text-white font-bold text-xs shrink-0 transition-all shadow-sm"
                  >
                    Mark Watched
                  </button>
                </div>
              ) : status === 'caught_up' ? (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-sky-500/15 border border-sky-500/30 text-xs">
                  <div className="flex items-center gap-2.5">
                    <CheckCircle2 className="w-5 h-5 text-sky-400 shrink-0" />
                    <div>
                      <span className="font-bold text-sky-400">All Caught Up! </span>
                      <span className="text-[var(--text-secondary)] font-medium ml-1">
                        {episodes.find(e => !isEpisodeAired(e, media?.networkTimezone)) ? (
                          <>
                            Next up: <strong className="text-[var(--text-primary)]">S{episodes.find(e => !isEpisodeAired(e, media?.networkTimezone))?.seasonNumber}E{episodes.find(e => !isEpisodeAired(e, media?.networkTimezone))?.episodeNumber}</strong> dropping on{' '}
                            <strong className="text-sky-300">{formatEpisodeAirDate(episodes.find(e => !isEpisodeAired(e, media?.networkTimezone))?.airDate, episodes.find(e => !isEpisodeAired(e, media?.networkTimezone))?.airstamp, userTz, media?.networkTimezone)}</strong>{' '}
                            ({getEpisodeCountdown(episodes.find(e => !isEpisodeAired(e, media?.networkTimezone))?.airDate, episodes.find(e => !isEpisodeAired(e, media?.networkTimezone))?.airstamp, media?.networkTimezone).label})
                          </>
                        ) : (
                          "You've watched every released episode. Awaiting new episodes or seasons to air!"
                        )}
                      </span>
                    </div>
                  </div>
                </div>
              ) : null}

              {/* 3. SEASON TABS & EPISODE CHECKLIST WITH TITLES */}
              <div>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <h3 className="text-sm font-bold text-[var(--text-primary)]">Episodes & Seasons</h3>
                  <span className="text-xs text-[var(--text-secondary)]">
                    Total: {episodes.length} episodes
                  </span>
                </div>

                {/* Season selector tabs */}
                {seasonNumbers.length > 0 ? (
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-2 mb-3 scrollbar-none">
                    {seasonNumbers.map(sNum => {
                      const seasonEps = episodes.filter(e => e.seasonNumber === sNum);
                      const watched = seasonEps.filter(e => e.isWatched === 1).length;
                      const isDone = seasonEps.length > 0 && watched === seasonEps.length;
                      const isSelected = activeSeason === sNum;

                      return (
                        <button
                          key={sNum}
                          type="button"
                          onClick={() => setSelectedSeason(sNum)}
                          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all border ${
                            isSelected
                              ? 'bg-[var(--accent)] text-white border-[var(--accent)] shadow-sm'
                              : 'bg-[var(--card-bg)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border-[var(--border-light)]'
                          }`}
                        >
                          <span>Season {sNum}</span>
                          <span
                            className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                              isDone ? 'bg-emerald-950 text-emerald-400' : isSelected ? 'bg-black/20 text-white' : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'
                            }`}
                          >
                            {watched}/{seasonEps.length}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-xs text-zinc-500 py-3">
                    No episode breakdowns loaded yet. You can click "Edit" to generate seasons and episodes.
                  </div>
                )}

                {/* Selected Season Header Actions */}
                {currentSeasonEpisodes.length > 0 && (
                  <div className="flex items-center justify-between bg-zinc-950 px-3.5 py-2 rounded-xl border border-zinc-800/80 mb-3">
                    <span className="text-xs font-semibold text-zinc-300">
                      Season {activeSeason} ({currentSeasonWatchedCount}/{currentSeasonEpisodes.length} watched)
                    </span>

                    <button
                      type="button"
                      onClick={() => handleToggleSeason(activeSeason, !isSeasonFullyWatched)}
                      className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-all ${
                        isSeasonFullyWatched
                          ? 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                          : 'bg-emerald-900/40 text-emerald-300 hover:bg-emerald-800/50 border border-emerald-700/50'
                      }`}
                    >
                      {isSeasonFullyWatched ? 'Mark Season Unwatched' : 'Mark Season Watched'}
                    </button>
                  </div>
                )}

                {/* Episode List with Titles & Checkboxes */}
                <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                  {currentSeasonEpisodes.map(ep => {
                    const isWatched = ep.isWatched === 1;
                    const isExpanded = !!expandedEpisodes[ep.id];

                    return (
                      <div
                        key={ep.id}
                        className={`p-3 rounded-xl border transition-all ${
                          isWatched
                            ? 'bg-zinc-950/40 border-zinc-800/60 opacity-80'
                            : 'bg-zinc-950 border-zinc-800/90 hover:border-zinc-700'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <label className="flex items-center gap-3 cursor-pointer flex-1 min-w-0">
                            <input
                              type="checkbox"
                              checked={isWatched}
                              onChange={() => handleToggleEpisode(ep)}
                              className="w-4 h-4 rounded bg-[var(--card-bg)] border-[var(--border-light)] accent-[var(--accent)] cursor-pointer"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-bold font-mono text-[var(--text-secondary)]">
                                  E{String(ep.episodeNumber).padStart(2, '0')}
                                </span>
                                <span className={`text-xs font-semibold truncate ${isWatched ? 'line-through text-[var(--text-secondary)] opacity-60' : 'text-[var(--text-primary)]'}`}>
                                  {ep.title}
                                </span>
                              </div>
                              {ep.airDate && (
                                <div className="flex items-center gap-1.5 flex-wrap text-[11px] text-[var(--text-secondary)]">
                                  <span>
                                    {isEpisodeAired(ep, media?.networkTimezone) ? 'Aired: ' : 'Drops: '}
                                    {formatEpisodeAirDate(ep.airDate, ep.airstamp, userTz, media?.networkTimezone)}
                                  </span>
                                  {!isEpisodeAired(ep, media?.networkTimezone) && (
                                    <span className="px-1.5 py-0.2 rounded bg-sky-500/15 text-sky-400 font-medium text-[10px] border border-sky-500/30">
                                      {getEpisodeCountdown(ep.airDate, ep.airstamp, media?.networkTimezone).label}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          </label>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {/* Issue #14: Bulk Episode Strike-Off Button */}
                            <button
                              type="button"
                              onClick={() => handleMarkUpTo(ep)}
                              className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium bg-[var(--bg-tertiary)] hover:bg-[var(--accent)] text-[var(--text-secondary)] hover:text-white border border-[var(--border-light)] hover:border-[var(--accent)] transition-all active:scale-95 group/btn"
                              title={`Strike off / mark all episodes up to S${ep.seasonNumber}E${ep.episodeNumber} as watched`}
                            >
                              <CheckCheck className="w-3.5 h-3.5 text-[var(--accent)] group-hover/btn:text-white transition-colors" />
                              <span className="hidden sm:inline">Up to here</span>
                            </button>

                            {ep.overview && (
                              <button
                                type="button"
                                onClick={() => toggleExpand(ep.id)}
                                className="p-1 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                                title="Toggle episode synopsis"
                              >
                                {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Expandable episode summary */}
                        {isExpanded && ep.overview && (
                          <div className="mt-2.5 pt-2 border-t border-[var(--border-light)] text-xs text-[var(--text-secondary)] leading-relaxed">
                            {ep.overview}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

              </div>
            </div>
          )}

          {/* User Notes Section */}
          <div className="pt-4 border-t border-[var(--border-light)]">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">My Notes & Thoughts</h3>
              {notesSavedNotice && (
                <span className="text-xs text-emerald-400 font-medium animate-fadeIn">
                  Saved!
                </span>
              )}
            </div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add your personal review, where you left off, favorite character, or comments..."
              rows={3}
              className="w-full p-3 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl text-xs text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:outline-none focus:border-[var(--input-focus)] leading-relaxed"
            />
            <div className="flex justify-end mt-2">
              <button
                type="button"
                onClick={handleSaveNotes}
                disabled={isSavingNotes}
                className="px-3.5 py-1.5 rounded-lg bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] text-xs font-medium border border-[var(--border-light)] transition-all"
              >
                {isSavingNotes ? 'Saving...' : 'Save Notes'}
              </button>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
