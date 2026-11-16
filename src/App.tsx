import React, { useState, useEffect, useMemo, useRef } from 'react';
import Navbar from './components/Navbar';
import FilterBar from './components/FilterBar';
import MediaCard from './components/MediaCard';
import MediaListView from './components/MediaListView';
import MediaDetailModal from './components/MediaDetailModal';
import SearchModal from './components/SearchModal';
import ManualMediaModal from './components/ManualMediaModal';
import SettingsModal from './components/SettingsModal';
import SyncProgressBar from './components/SyncProgressBar';
import ThemeModal from './components/ThemeModal';
import ListManagerModal from './components/ListManagerModal';
import CloudSyncModal from './components/CloudSyncModal';
import MobileHeader from './components/mobile/MobileHeader';
import MobileSearchStrip from './components/mobile/MobileSearchStrip';
import MobileFilterChips from './components/mobile/MobileFilterChips';
import NowInProgressCarousel from './components/mobile/NowInProgressCarousel';
import MobileBottomNav from './components/mobile/MobileBottomNav';
import MobileFilterSheet from './components/mobile/MobileFilterSheet';
import MobileUpcomingView from './components/mobile/MobileUpcomingView';
import { FranchiseCanvasView } from './components/canvas/FranchiseCanvasView';
import { getAllMedia, toggleEpisodeWatched, getEpisodesForMedia, updateMediaStatus, backfillMissingMediaMetadata, backfillMediaCrossReferences, backfillCommunityRatings, clearAllPersonalRatings, getCustomLists, updateBookProgress, getSetting, setSetting, backfillMovieFranchiseCollections, toggleMediaPinned, unpinAllMedia, healCorruptedTmdbShows, db } from './db';
import { syncMediaEpisodes, runSyncQueue, getShowsEligibleForSync, fetchTMDBCollection, runStreamingSyncQueue, getMediaEligibleForStreamingSync } from './services/api';
import { syncManager, formatSyncRelativeTime } from './services/cloudSync';
import { getNextFranchiseMovie } from './utils/franchise';
import { initTheme, toggleThemeMode, applyThemeSettingsFromRecord, THEME_KEY, ACTIVE_PRESET_KEY, CUSTOM_THEME_KEY, GENRE_COLORS_KEY } from './styles/theme';
import { shouldShowItemForUpcomingFilter, isItemUpcoming } from './utils/upcoming';
import { getEpisodeCountdown } from './utils/timezone';
import { useLiveTicker } from './hooks/useLiveTicker';
import { isAudiobookItem } from './utils/audioDuration';
import { consumeShareTargetFromWindow } from './utils/shareTarget';
import { Film, Plus, Search, Sparkles, X, Pin, ChevronUp, RefreshCw, QrCode, LayoutGrid, List, UploadCloud, DownloadCloud } from 'lucide-react';
import type { MediaItem, SyncState, SyncAlert, ThemeMode, MediaStatus, CustomList, RatingScale, ViewMode, GridDensity, GridColumns, UpcomingFilter, BookFormatFilter, SyncStatus, RuntimeDisplayFormat } from './types';

export default function App(): React.JSX.Element {
  // Live ticker for episode countdowns & upcoming releases (Issue #55)
  const liveTick = useLiveTicker();
  const isRollingOverRef = useRef(false);

  const [mediaList, setMediaList] = useState<MediaItem[]>([]);
  const [customLists, setCustomLists] = useState<CustomList[]>([]);
  const [mainTab, setMainTab] = useState<'library' | 'canvas' | 'upcoming'>(
    () => (localStorage.getItem('bingelog_main_tab') as 'library' | 'canvas' | 'upcoming') || 'library'
  );
  const [statusFilter, setStatusFilter] = useState<string>(
    () => localStorage.getItem('bingelog_status_filter') || 'all'
  );
  const [typeFilter, setTypeFilter] = useState<string>(
    () => localStorage.getItem('bingelog_type_filter') || 'all'
  );
  const [bookFormatFilter, setBookFormatFilter] = useState<BookFormatFilter>(
    () => (localStorage.getItem('bingelog_book_format_filter') as BookFormatFilter) || 'all'
  );
  const [listFilter, setListFilter] = useState<string>(
    () => localStorage.getItem('bingelog_list_filter') || 'all'
  );
  const [librarySearch, setLibrarySearch] = useState<string>('');
  const [sortBy, setSortBy] = useState<string>(
    () => localStorage.getItem('bingelog_sort_by') || 'updated'
  );

  const [upcomingFilter, setUpcomingFilter] = useState<UpcomingFilter>(
    () => (localStorage.getItem('bingelog_upcoming_filter') as UpcomingFilter) || 'show_all'
  );
  const [upcomingDays, setUpcomingDays] = useState<number>(
    () => parseInt(localStorage.getItem('bingelog_upcoming_days') || '7', 10) || 7
  );
  // Dedicated Mobile Upcoming Tab view (Issue #52 & Issue #57)
  const [isMobileUpcomingView, setIsMobileUpcomingView] = useState<boolean>(() => {
    return localStorage.getItem('bingelog_main_tab') === 'upcoming';
  });

  const [showPinnedView, setShowPinnedView] = useState<boolean>(() => {
    const saved = localStorage.getItem('bingelog_show_pinned_view');
    if (saved !== null) {
      return saved === 'true';
    }
    return true;
  });

  const handleTogglePinnedView = () => {
    setShowPinnedView(prev => {
      const next = !prev;
      localStorage.setItem('bingelog_show_pinned_view', String(next));
      return next;
    });
  };

  const handleMainTabChange = (tab: 'library' | 'canvas' | 'upcoming') => {
    setMainTab(tab);
    localStorage.setItem('bingelog_main_tab', tab);
    setIsMobileUpcomingView(tab === 'upcoming');
  };

  const handleStatusChange = (status: string) => {
    setStatusFilter(status);
    localStorage.setItem('bingelog_status_filter', status);
  };

  const handleTypeChange = (type: string) => {
    setTypeFilter(type);
    localStorage.setItem('bingelog_type_filter', type);
  };

  const handleListChange = (listName: string) => {
    setListFilter(listName);
    localStorage.setItem('bingelog_list_filter', listName);
  };

  const handleSortChange = (newSort: string) => {
    setSortBy(newSort);
    localStorage.setItem('bingelog_sort_by', newSort);
  };

  const handleUpcomingFilterChange = (filter: UpcomingFilter) => {
    setUpcomingFilter(filter);
    localStorage.setItem('bingelog_upcoming_filter', filter);
  };

  const handleUpcomingDaysChange = (days: number) => {
    setUpcomingDays(days);
    localStorage.setItem('bingelog_upcoming_days', String(days));
  };

  // Modals
  const [isSearchOpen, setIsSearchOpen] = useState<boolean>(false);
  const [sharedSearchQuery, setSharedSearchQuery] = useState<string>('');
  const [sharedSearchType, setSharedSearchType] = useState<'all' | 'tv' | 'movie' | 'book' | 'audiobook'>('all');
  const [isManualOpen, setIsManualOpen] = useState<boolean>(false);
  const [manualEditItem, setManualEditItem] = useState<MediaItem | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isCloudSyncOpen, setIsCloudSyncOpen] = useState<boolean>(false);
  const [cloudSyncStatus, setCloudSyncStatus] = useState<SyncStatus>(() => syncManager.getStatus());
  const [isThemeOpen, setIsThemeOpen] = useState<boolean>(false);
  const [isListManagerOpen, setIsListManagerOpen] = useState<boolean>(false);
  const [isMobileFilterOpen, setIsMobileFilterOpen] = useState<boolean>(false);
  const [themeMode, setThemeMode] = useState<ThemeMode>('dark');
  const [selectedMedia, setSelectedMedia] = useState<MediaItem | null>(null);
  const [syncAlerts, setSyncAlerts] = useState<SyncAlert[]>([]);
  const [ratingScale, setRatingScale] = useState<RatingScale>(
    () => (localStorage.getItem('bingelog_rating_scale') as RatingScale) || '10'
  );
  const [runtimeDisplayFormat, setRuntimeDisplayFormat] = useState<RuntimeDisplayFormat>(
    () => (localStorage.getItem('bingelog_runtime_display_format') as RuntimeDisplayFormat) || 'hours_minutes'
  );

  useEffect(() => {
    getSetting<RatingScale>('rating_scale', '10').then(s => {
      if (s) {
        setRatingScale(s);
        localStorage.setItem('bingelog_rating_scale', s);
      }
    });
    getSetting<RuntimeDisplayFormat>('runtime_display_format', 'hours_minutes').then(fmt => {
      if (fmt) {
        setRuntimeDisplayFormat(fmt);
        localStorage.setItem('bingelog_runtime_display_format', fmt);
      }
    });
    getSetting<number>('upcoming_window_days', 7).then(days => {
      if (days !== undefined && days !== null) {
        setUpcomingDays(Number(days));
        localStorage.setItem('bingelog_upcoming_days', String(days));
      }
    });
    getSetting<GridColumns>('grid_columns', 'auto').then(cols => {
      if (cols) {
        setGridColumns(cols);
        localStorage.setItem('bingelog_grid_columns', cols);
      }
    });
  }, []);

  // View Mode, Grid Density & Columns (Issue #31)
  const [viewMode, setViewMode] = useState<ViewMode>(
    () => (localStorage.getItem('bingelog_view_mode') as ViewMode) || 'grid'
  );
  const [gridDensity, setGridDensity] = useState<GridDensity>(
    () => (localStorage.getItem('bingelog_grid_density') as GridDensity) || 'comfortable'
  );
  const [gridColumns, setGridColumns] = useState<GridColumns>(
    () => (localStorage.getItem('bingelog_grid_columns') as GridColumns) || 'auto'
  );

  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode);
    localStorage.setItem('bingelog_view_mode', mode);
  };

  const handleGridDensityChange = (density: GridDensity) => {
    setGridDensity(density);
    localStorage.setItem('bingelog_grid_density', density);
    setSetting('grid_density', density);
  };

  const handleGridColumnsChange = (cols: GridColumns) => {
    setGridColumns(cols);
    localStorage.setItem('bingelog_grid_columns', cols);
    setSetting('grid_columns', cols);
  };

  // Live Sync Progress State
  const [syncState, setSyncState] = useState<SyncState>({
    isActive: false,
    isComplete: false,
    isCancelled: false,
    completed: 0,
    total: 0,
    currentTitle: '',
    updatedCount: 0
  });
  const syncAbortRef = useRef<AbortController | null>(null);

  // Load library and lists from IndexedDB
  const refreshLibrary = async (): Promise<void> => {
    const [items, lists] = await Promise.all([getAllMedia(), getCustomLists()]);
    setMediaList(items);
    setCustomLists(lists);

    // If a media item is currently open in detail modal, refresh its state too
    if (selectedMedia) {
      const updated = items.find(m => m.id === selectedMedia.id);
      if (updated) setSelectedMedia(updated);
    }
  };

  // Initialize theme mode, share target, and E2EE Cloud Sync on mount
  useEffect(() => {
    initTheme();
    const currentMode = (document.documentElement.getAttribute('data-theme') || 'dark') as ThemeMode;
    setThemeMode(currentMode);

    // Hydrate theme from Dexie if available
    db.settings.bulkGet([THEME_KEY, ACTIVE_PRESET_KEY, CUSTOM_THEME_KEY, GENRE_COLORS_KEY]).then(records => {
      const map: Record<string, unknown> = {};
      records.forEach(r => {
        if (r && r.value !== undefined) map[r.key] = r.value;
      });
      if (Object.keys(map).length > 0) {
        const appliedMode = applyThemeSettingsFromRecord(map);
        if (appliedMode) setThemeMode(appliedMode);
      }
    }).catch(() => {});

    // Handle incoming PWA Web Share Target parameters (?share_title=...&share_text=...&share_url=...)
    const shared = consumeShareTargetFromWindow();
    if (shared && shared.query) {
      setSharedSearchQuery(shared.query);
      setSharedSearchType(shared.mediaType || 'all');
      setIsSearchOpen(true);
    }

    const unsubStatus = syncManager.onStatusChange((newStatus) => {
      setCloudSyncStatus(newStatus);
    });
    const unsubSynced = syncManager.onDataSynced(() => {
      void refreshLibrary();
      db.settings.bulkGet([THEME_KEY, ACTIVE_PRESET_KEY, CUSTOM_THEME_KEY, GENRE_COLORS_KEY]).then(records => {
        const map: Record<string, unknown> = {};
        records.forEach(r => {
          if (r && r.value !== undefined) map[r.key] = r.value;
        });
        if (Object.keys(map).length > 0) {
          const mode = applyThemeSettingsFromRecord(map);
          if (mode) setThemeMode(mode);
        } else {
          const mode = (document.documentElement.getAttribute('data-theme') || 'dark') as ThemeMode;
          setThemeMode(mode);
        }
      }).catch(() => {});
    });

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === THEME_KEY || e.key === ACTIVE_PRESET_KEY || e.key === CUSTOM_THEME_KEY || e.key === GENRE_COLORS_KEY) {
        initTheme();
        const mode = (document.documentElement.getAttribute('data-theme') || 'dark') as ThemeMode;
        setThemeMode(mode);
      }
    };
    window.addEventListener('storage', handleStorageChange);

    // Check for #sync=v1:... QR pairing hash or run initial E2EE sync
    syncManager.checkUrlPairing().then((pairedViaHash) => {
      if (pairedViaHash) {
        void refreshLibrary();
        db.settings.bulkGet([THEME_KEY, ACTIVE_PRESET_KEY, CUSTOM_THEME_KEY, GENRE_COLORS_KEY]).then(records => {
          const map: Record<string, unknown> = {};
          records.forEach(r => {
            if (r && r.value !== undefined) map[r.key] = r.value;
          });
          if (Object.keys(map).length > 0) {
            const mode = applyThemeSettingsFromRecord(map);
            if (mode) setThemeMode(mode);
          }
        }).catch(() => {});
        setSyncAlerts(prev => [
          ...prev,
          {
            id: `e2ee_pair_${Date.now()}`,
            title: 'E2EE Cloud Sync Paired',
            message: '🔒 Device paired and library decrypted via AES-GCM (256-bit)!'
          }
        ]);
      } else if (syncManager.isConfigured()) {
        syncManager.syncNow().catch(err => console.warn('[CloudSync] Startup sync warning:', err));
      }
    });

    return () => {
      unsubStatus();
      unsubSynced();
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  const handleToggleTheme = (): void => {
    const nextMode = toggleThemeMode();
    setThemeMode(nextMode);
  };

  useEffect(() => {
    const checkEligibleShowsForUpdates = async (): Promise<void> => {
      const items = await getAllMedia();
      // Multi-status sync: checks 'watching' always, and 'completed'/'plan_to_watch'/'on_hold' if >5 days cooldown
      const eligibleShows = getShowsEligibleForSync(items, { forceAll: false, cooldownDays: 5 });

      for (const show of eligibleShows) {
        try {
          const result = await syncMediaEpisodes(show);
          if (result.hasUpdates && (result.newEpisodesCount || 0) > 0) {
            const alertId = `sync_${show.id}_${Date.now()}`;
            const isCompleted = result.isCompletedWithNewEpisodes;
            setSyncAlerts(prev => [
              ...prev,
              {
                id: alertId,
                title: show.title,
                message: isCompleted
                  ? `🎉 Brand new episodes/season available for "${show.title}"!`
                  : `✨ ${result.newEpisodesCount} new episode(s) added to "${show.title}"!`
              }
            ]);
            await refreshLibrary();
          }
        } catch (err) {
          console.warn('Background sync check error:', err);
        }
      }
    };

    refreshLibrary().then(async () => {
      // Quietly heal existing library shows with missing status/next episode metadata and cross-references
      try {
        // Run cross-provider collision auto-healer FIRST before any backfill or background sync
        const healedTmdb = await healCorruptedTmdbShows();
        const healed = await backfillMissingMediaMetadata();
        const backfilledRefs = await backfillMediaCrossReferences();
        const backfilledRatings = await backfillCommunityRatings();
        const backfilledCollections = await backfillMovieFranchiseCollections();

        if (healedTmdb.healedCount > 0) {
          const sample = healedTmdb.healedShows[0];
          setSyncAlerts(prev => [
            ...prev,
            {
              id: `healed_tmdb_${Date.now()}`,
              title: 'Library Auto-Healed',
              message: `🛡️ Repaired ${healedTmdb.healedCount} show(s) affected by cross-provider episode collision (${sample.title}: restored ${sample.healedEpisodesCount} episodes, pruned ${sample.removedPhantomCount} phantom episodes).`
            }
          ]);

          // Automatically push the clean healed library to the cloud vault if configured (Issue #54)
          if (syncManager.isConfigured()) {
            syncManager.pushToCloud({ forceOverwrite: true }).catch(err => {
              console.warn('[CloudSync] Post-heal auto-push to cloud warning:', err);
            });
          }
        }

        // One-time housekeeping: reset legacy user ratings that were cloned from community ratings
        const ratingsResetDone = await getSetting<boolean>('personal_ratings_cleared_v1', false);
        let resetRatingsCount = 0;
        if (!ratingsResetDone) {
          resetRatingsCount = await clearAllPersonalRatings();
          await setSetting('personal_ratings_cleared_v1', true);
        }

        if (healed > 0 || backfilledRefs > 0 || backfilledRatings > 0 || backfilledCollections > 0 || resetRatingsCount > 0 || healedTmdb.healedCount > 0) {
          await refreshLibrary();
        }
      } catch (err) {
        console.warn('Metadata backfill error:', err);
      }

      // Quiet background check after initial load
      setTimeout(checkEligibleShowsForUpdates, 2500);
    });
  }, []);

  // Automatically roll over cached next-episode pointers & runtimes when liveTick passes an episode drop time
  useEffect(() => {
    if (isRollingOverRef.current || mediaList.length === 0) return;

    const hasStaleNextEpisode = mediaList.some(
      (item) =>
        item.type === 'tv' &&
        (item.nextAirDate || item.nextAirstamp) &&
        getEpisodeCountdown(item.nextAirDate || undefined, item.nextAirstamp, item.networkTimezone, liveTick).isAired
    );

    if (!hasStaleNextEpisode) return;

    isRollingOverRef.current = true;
    backfillMissingMediaMetadata()
      .then((healed) => {
        if (healed > 0) {
          return refreshLibrary();
        }
      })
      .catch((err) => {
        console.warn('Live episode rollover error:', err);
      })
      .finally(() => {
        isRollingOverRef.current = false;
      });
  }, [mediaList, liveTick]);

  // Global keyboard shortcuts (Ctrl+K or / to search)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsSearchOpen(true);
      }
      if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes((document.activeElement as HTMLElement)?.tagName)) {
        e.preventDefault();
        setIsSearchOpen(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleBookFormatChange = (format: BookFormatFilter): void => {
    setBookFormatFilter(format);
    localStorage.setItem('bingelog_book_format_filter', format);
  };

  // Compute format counts for books sub-tabs (Issue #38)
  const bookCounts = useMemo(() => {
    let all = 0;
    let reading = 0;
    let audiobook = 0;
    for (const item of mediaList) {
      if (item.type !== 'book') continue;
      if (listFilter !== 'all' && (!item.lists || !item.lists.includes(listFilter))) continue;
      if (statusFilter !== 'all' && item.status !== statusFilter) continue;
      all++;
      if (isAudiobookItem(item)) {
        audiobook++;
      } else {
        reading++;
      }
    }
    return { all, reading, audiobook };
  }, [mediaList, listFilter, statusFilter]);

  // Compute status counts for filter tabs
  const itemCounts = useMemo<Record<string, number>>(() => {
    const counts: Record<string, number> = {
      all: 0,
      watching: 0,
      caught_up: 0,
      plan_to_watch: 0,
      completed: 0,
      on_hold: 0,
      dropped: 0
    };
    for (const item of mediaList) {
      if (typeFilter !== 'all' && item.type !== typeFilter) continue;
      if (typeFilter === 'book') {
        if (bookFormatFilter === 'audiobook' && !isAudiobookItem(item)) continue;
        if (bookFormatFilter === 'reading' && isAudiobookItem(item)) continue;
      }
      if (listFilter !== 'all' && (!item.lists || !item.lists.includes(listFilter))) continue;
      if (!shouldShowItemForUpcomingFilter(item, upcomingFilter, upcomingDays)) continue;
      counts.all++;
      if (counts[item.status] !== undefined) {
        counts[item.status]++;
      }
    }
    return counts;
  }, [mediaList, typeFilter, bookFormatFilter, listFilter, upcomingFilter, upcomingDays]);

  // Compute overall stats for navbar
  const stats = useMemo(() => ({
    watching: itemCounts.watching,
    completed: itemCounts.completed,
    total: mediaList.length
  }), [itemCounts, mediaList.length]);

  // Active in-progress items for Mobile Stitch Carousel (Issue #50)
  const nowInProgressItems = useMemo(() => {
    return mediaList.filter(item => item.status === 'watching');
  }, [mediaList]);

  // Mobile Type Counts for Stitch filter chips (Issue #50)
  const mobileTypeCounts = useMemo(() => {
    let tv = 0;
    let movie = 0;
    let book = 0;
    let audio = 0;
    for (const item of mediaList) {
      if (item.type === 'tv') tv++;
      else if (item.type === 'movie') movie++;
      else if (item.type === 'book') {
        if (isAudiobookItem(item)) audio++;
        else book++;
      }
    }
    return {
      all: mediaList.length,
      tv,
      movie,
      book,
      audio
    };
  }, [mediaList]);

  // Upcoming count for Mobile Bottom Nav badge (Issue #50, #52, #55)
  const upcomingCount = useMemo(() => {
    const now = new Date(liveTick);
    const nowMs = now.getTime();
    const maxMs = upcomingDays * 24 * 60 * 60 * 1000;

    return mediaList.filter(item => {
      if (item.status === 'completed') return false;

      // 1. Airing TV episodes
      if (item.type === 'tv' && (item.nextAirDate || item.nextAirstamp)) {
        const cd = getEpisodeCountdown(item.nextAirDate || undefined, item.nextAirstamp, item.networkTimezone, nowMs);
        if (!cd.isAired) {
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
            if (diff >= -12 * 60 * 60 * 1000 && diff <= maxMs) {
              return true;
            }
          }
        }
      }

      // 2. Unreleased titles (movies, books, new TV series)
      const { isUpcoming, releaseDate } = isItemUpcoming(item, now);
      if (isUpcoming && releaseDate) {
        const diff = releaseDate.getTime() - nowMs;
        return diff >= 0 && diff <= maxMs;
      }

      return false;
    }).length;
  }, [mediaList, upcomingDays, liveTick]);

  // Filter and sort items
  const filteredItems = useMemo<MediaItem[]>(() => {
    const now = new Date(liveTick);
    return mediaList
      .filter(item => {
        if (statusFilter !== 'all' && item.status !== statusFilter) return false;
        if (typeFilter !== 'all' && item.type !== typeFilter) return false;
        if (typeFilter === 'book') {
          if (bookFormatFilter === 'audiobook' && !isAudiobookItem(item)) return false;
          if (bookFormatFilter === 'reading' && isAudiobookItem(item)) return false;
        }
        if (listFilter !== 'all' && (!item.lists || !item.lists.includes(listFilter))) return false;
        if (!shouldShowItemForUpcomingFilter(item, upcomingFilter, upcomingDays, now)) return false;
        if (librarySearch.trim()) {
          const q = librarySearch.trim().toLowerCase();
          const matchTitle = item.title?.toLowerCase().includes(q);
          const matchGenre = Array.isArray(item.genres) 
            ? item.genres.some(g => g.toLowerCase().includes(q))
            : false;
          if (!matchTitle && !matchGenre) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'release_desc' || sortBy === 'release') {
          const getReleaseTime = (item: MediaItem) => {
            if (item.releaseDate) {
              const t = new Date(item.releaseDate).getTime();
              if (!isNaN(t)) return t;
            }
            const y = parseInt(String(item.year), 10);
            return !isNaN(y) && y > 1800 ? new Date(`${y}-01-01`).getTime() : 0;
          };
          return getReleaseTime(b) - getReleaseTime(a);
        }
        if (sortBy === 'release_asc') {
          const getReleaseTime = (item: MediaItem) => {
            if (item.releaseDate) {
              const t = new Date(item.releaseDate).getTime();
              if (!isNaN(t)) return t;
            }
            const y = parseInt(String(item.year), 10);
            return !isNaN(y) && y > 1800 ? new Date(`${y}-01-01`).getTime() : 0;
          };
          return getReleaseTime(a) - getReleaseTime(b);
        }
        if (sortBy === 'last_aired_desc' || sortBy === 'last_aired') {
          const getLastAiredTime = (item: MediaItem) => {
            if (item.lastAiredDate) {
              const t = new Date(item.lastAiredDate).getTime();
              if (!isNaN(t)) return t;
            }
            if (item.releaseDate) {
              const t = new Date(item.releaseDate).getTime();
              if (!isNaN(t)) return t;
            }
            const y = parseInt(String(item.year), 10);
            return !isNaN(y) && y > 1800 ? new Date(`${y}-01-01`).getTime() : 0;
          };
          return getLastAiredTime(b) - getLastAiredTime(a);
        }
        if (sortBy === 'last_aired_asc') {
          const getLastAiredTime = (item: MediaItem) => {
            if (item.lastAiredDate) {
              const t = new Date(item.lastAiredDate).getTime();
              if (!isNaN(t)) return t;
            }
            if (item.releaseDate) {
              const t = new Date(item.releaseDate).getTime();
              if (!isNaN(t)) return t;
            }
            const y = parseInt(String(item.year), 10);
            return !isNaN(y) && y > 1800 ? new Date(`${y}-01-01`).getTime() : 0;
          };
          return getLastAiredTime(a) - getLastAiredTime(b);
        }
        if (sortBy === 'title') {
          return (a.title || '').localeCompare(b.title || '');
        }
        if (sortBy === 'my_rating') {
          const ratingA = (a.rating !== null && a.rating !== undefined) ? a.rating : -1;
          const ratingB = (b.rating !== null && b.rating !== undefined) ? b.rating : -1;
          return ratingB - ratingA;
        }
        if (sortBy === 'rating' || sortBy === 'community_rating') {
          const ratingA = (a.rating !== null && a.rating !== undefined && a.rating > 0) ? a.rating : (a.communityRating || 0);
          const ratingB = (b.rating !== null && b.rating !== undefined && b.rating > 0) ? b.rating : (b.communityRating || 0);
          return ratingB - ratingA;
        }
        if (sortBy === 'progress') {
          const progA = a.totalEpisodes ? (a.watchedEpisodesCount || 0) / a.totalEpisodes : 0;
          const progB = b.totalEpisodes ? (b.watchedEpisodesCount || 0) / b.totalEpisodes : 0;
          return progB - progA;
        }
        // default 'updated'
        return new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime();
      });
  }, [mediaList, statusFilter, typeFilter, bookFormatFilter, listFilter, librarySearch, sortBy, upcomingFilter, upcomingDays, liveTick]);

  // Total pinned items count across library (Issue #47)
  const totalPinnedCount = useMemo(() => {
    return mediaList.filter(item => Boolean(item.isPinned)).length;
  }, [mediaList]);

  // Filtered pinned items respecting active filters/search (Issue #47)
  const pinnedItems = useMemo(() => {
    return filteredItems
      .filter(item => Boolean(item.isPinned))
      .sort((a, b) => {
        const timeA = a.pinnedAt ? new Date(a.pinnedAt).getTime() : new Date(a.updatedAt || 0).getTime();
        const timeB = b.pinnedAt ? new Date(b.pinnedAt).getTime() : new Date(b.updatedAt || 0).getTime();
        return timeB - timeA;
      });
  }, [filteredItems]);

  // Main list items (excluding pinned items when pinned view is active) (Issue #47)
  const unpinnedItems = useMemo(() => {
    if (!showPinnedView) return filteredItems;
    return filteredItems.filter(item => !item.isPinned);
  }, [filteredItems, showPinnedView]);

  // Quick Action: +1 episode directly from media card (or +10 pages for books)
  const handleQuickIncrement = async (item: MediaItem): Promise<void> => {
    if (item.type === 'tv') {
      const episodes = await getEpisodesForMedia(item.id);
      const nextEp = episodes.find(e => e.isWatched === 0);
      if (nextEp) {
        await toggleEpisodeWatched(item.id, nextEp.seasonNumber, nextEp.episodeNumber);
        await refreshLibrary();
      }
    } else if (item.type === 'book') {
      const isAudio = isAudiobookItem(item);
      if (item.progressMode === 'time' || isAudio) {
        const current = item.currentDurationSeconds || 0;
        const total = item.totalDurationSeconds || 0;
        const step = 900; // +15 minutes
        const target = total > 0 ? Math.min(current + step, total) : current + step;
        await updateBookProgress(item.id, { currentDurationSeconds: target, progressMode: 'time' });
      } else if (item.progressMode === 'chapters') {
        const current = item.currentChapter || 0;
        const total = item.totalChapters || 0;
        const target = total > 0 ? Math.min(current + 1, total) : current + 1;
        await updateBookProgress(item.id, { currentChapter: target, progressMode: 'chapters' });
      } else {
        const current = item.currentPage || 0;
        const total = item.totalPages || 0;
        const step = 10;
        const target = total > 0 ? Math.min(current + step, total) : current + step;
        await updateBookProgress(item.id, { currentPage: target, progressMode: 'pages' });
      }
      await refreshLibrary();
    }
  };

  // Quick Action: Toggle movie watched status directly from media card
  const handleQuickToggleMovie = async (item: MediaItem): Promise<void> => {
    const newStatus: MediaStatus = item.status === 'completed' ? 'plan_to_watch' : 'completed';
    await updateMediaStatus(item.id, newStatus);
    await refreshLibrary();

    if (newStatus === 'completed' && item.collectionId) {
      try {
        const col = await fetchTMDBCollection(item.collectionId);
        if (col && col.parts) {
          const all = await getAllMedia();
          const next = getNextFranchiseMovie(item, col.parts, all);
          if (next) {
            const nextYear = next.part.release_date ? ` (${next.part.release_date.slice(0, 4)})` : '';
            setSyncAlerts(prev => [
              ...prev,
              {
                id: `next_franchise_${item.id}_${Date.now()}`,
                title: col.name,
                message: next.isAlreadyInLibrary
                  ? `🎉 Finished "${item.title}"! Next in series: "${next.part.title}"${nextYear} is in your library.`
                  : `🎉 Finished "${item.title}"! Next in series: "${next.part.title}"${nextYear}. Click to open details and add!`
              }
            ]);
          }
        }
      } catch (err) {
        console.warn('Franchise prompt error:', err);
      }
    }
  };

  // Quick Action: Toggle pinned state directly from card or modal (Issue #47)
  const handleTogglePin = async (item: MediaItem): Promise<void> => {
    await toggleMediaPinned(item.id);
    await refreshLibrary();
  };

  // Quick Action: Unpin all items in library (Issue #47)
  const handleUnpinAll = async (): Promise<void> => {
    await unpinAllMedia();
    await refreshLibrary();
  };

  // Open Edit Modal for an item
  const handleOpenEdit = (item: MediaItem): void => {
    setManualEditItem(item);
    setIsManualOpen(true);
  };

  // Start Sync All Library (TV Shows and Movies)
  const handleStartSyncAll = async (): Promise<void> => {
    if (syncState.isActive) return;

    const items = await getAllMedia();
    const shows = getShowsEligibleForSync(items, { forceAll: true });
    const movies = items.filter(m => m.type === 'movie' && (m.externalId || m.title));
    const allItemsToSync = [...shows, ...movies];

    if (allItemsToSync.length === 0) {
      setSyncState({
        isActive: false,
        isComplete: true,
        isCancelled: false,
        completed: 0,
        total: 0,
        currentTitle: '',
        updatedCount: 0
      });
      return;
    }

    const abortController = new AbortController();
    syncAbortRef.current = abortController;

    setSyncState({
      isActive: true,
      isComplete: false,
      isCancelled: false,
      completed: 0,
      total: allItemsToSync.length,
      currentTitle: allItemsToSync[0]?.title || '',
      updatedCount: 0,
      syncType: 'episodes'
    });

    let liveUpdatedCount = 0;

    const queueResult = await runSyncQueue(allItemsToSync, {
      concurrency: 2,
      delayMs: 250,
      abortSignal: abortController.signal,
      onProgress: (completed, total, currentItem, result, isCancelled) => {
        if (result?.hasUpdates) {
          liveUpdatedCount++;
        }
        setSyncState(prev => ({
          ...prev,
          completed,
          total,
          currentTitle: currentItem?.title || '',
          updatedCount: liveUpdatedCount,
          isCancelled
        }));
      }
    });

    setSyncState(prev => ({
      ...prev,
      isActive: false,
      isComplete: !queueResult.isCancelled,
      isCancelled: queueResult.isCancelled,
      updatedCount: liveUpdatedCount
    }));

    await refreshLibrary();
  };

  // Start Sync All Streaming Availability
  const handleStartStreamingSyncAll = async (): Promise<void> => {
    if (syncState.isActive) return;

    const items = await getAllMedia();
    const eligible = getMediaEligibleForStreamingSync(items);

    if (eligible.length === 0) {
      setSyncState({
        isActive: false,
        isComplete: true,
        isCancelled: false,
        completed: 0,
        total: 0,
        currentTitle: '',
        updatedCount: 0,
        syncType: 'streaming'
      });
      return;
    }

    const abortController = new AbortController();
    syncAbortRef.current = abortController;

    setSyncState({
      isActive: true,
      isComplete: false,
      isCancelled: false,
      completed: 0,
      total: eligible.length,
      currentTitle: eligible[0]?.title || '',
      updatedCount: 0,
      syncType: 'streaming'
    });

    let liveUpdatedCount = 0;

    const queueResult = await runStreamingSyncQueue(eligible, {
      concurrency: 2,
      delayMs: 200,
      abortSignal: abortController.signal,
      onProgress: (completed, total, currentItem, result, isCancelled) => {
        if (result?.hasUpdates) {
          liveUpdatedCount++;
        }
        setSyncState(prev => ({
          ...prev,
          completed,
          total,
          currentTitle: currentItem?.title || '',
          updatedCount: liveUpdatedCount,
          isCancelled
        }));
      }
    });

    setSyncState(prev => ({
      ...prev,
      isActive: false,
      isComplete: !queueResult.isCancelled,
      isCancelled: queueResult.isCancelled,
      updatedCount: liveUpdatedCount
    }));

    await refreshLibrary();
  };

  const handleCancelSync = (): void => {
    if (syncAbortRef.current) {
      syncAbortRef.current.abort();
    }
    setSyncState(prev => ({
      ...prev,
      isActive: false,
      isCancelled: true
    }));
  };

  const handleDismissSync = (): void => {
    setSyncState(prev => ({
      ...prev,
      isActive: false,
      isComplete: false,
      isCancelled: false
    }));
  };

  const handleDirectPushToCloud = async (): Promise<void> => {
    if (!syncManager.isConfigured()) {
      setIsCloudSyncOpen(true);
      return;
    }
    if (
      typeof window !== 'undefined' &&
      !window.confirm(
        '⚠️ Overwrite Cloud Vault?\n\nThis will push your current local library to the cloud vault, overwriting any remote data. All your paired devices will receive this clean state.'
      )
    ) {
      return;
    }
    try {
      await syncManager.pushToCloud({ forceOverwrite: true });
      setSyncAlerts(prev => [
        ...prev,
        {
          id: `push_cloud_${Date.now()}`,
          title: 'Pushed to Cloud',
          message: '☁️ Cloud vault successfully overwritten with your current local library!'
        }
      ]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(`Push to cloud failed: ${msg}`);
    }
  };

  const handleDirectPullFromCloud = async (): Promise<void> => {
    if (!syncManager.isConfigured()) {
      setIsCloudSyncOpen(true);
      return;
    }
    if (
      typeof window !== 'undefined' &&
      !window.confirm(
        '⚠️ Overwrite Local Library?\n\nThis will download the data currently stored in your cloud vault and replace your local library on this device. Any un-synced local changes will be replaced.'
      )
    ) {
      return;
    }
    try {
      await syncManager.pullFromCloud({ forceOverwrite: true });
      await refreshLibrary();
      setSyncAlerts(prev => [
        ...prev,
        {
          id: `pull_cloud_${Date.now()}`,
          title: 'Pulled from Cloud',
          message: '📥 Local library successfully overwritten with cloud vault data!'
        }
      ]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(`Pull from cloud failed: ${msg}`);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] flex flex-col selection:bg-[var(--accent)] selection:text-white transition-colors duration-200">
      {/* Mobile Header Bar (Issue #50) */}
      <MobileHeader
        cloudSyncStatus={cloudSyncStatus}
        onOpenCloudSync={() => setIsCloudSyncOpen(true)}
        onOpenTheme={() => setIsThemeOpen(true)}
        onOpenFilterSheet={() => setIsMobileFilterOpen(true)}
        onSelectTab={handleMainTabChange}
      />

      {/* Top Navbar (Desktop >= 768px) */}
      <Navbar
        onOpenSearch={() => setIsSearchOpen(true)}
        onOpenManual={() => {
          setManualEditItem(null);
          setIsManualOpen(true);
        }}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenCloudSync={() => setIsCloudSyncOpen(true)}
        cloudSyncStatus={cloudSyncStatus}
        onOpenTheme={() => setIsThemeOpen(true)}
        onToggleTheme={handleToggleTheme}
        themeMode={themeMode}
        currentTab={mainTab}
        onSelectTab={handleMainTabChange}
        onStartSyncAll={handleStartSyncAll}
        isSyncing={syncState.isActive && syncState.syncType !== 'streaming'}
        onStartStreamingSync={handleStartStreamingSyncAll}
        isSyncingStreaming={syncState.isActive && syncState.syncType === 'streaming'}
        stats={stats}
      />

      {/* Background Sync Toast Alerts */}
      {syncAlerts.length > 0 && (
        <div className="fixed top-16 right-4 z-50 flex flex-col gap-2 max-w-sm w-full animate-fadeIn pointer-events-auto">
          {syncAlerts.map(alert => (
            <div
              key={alert.id}
              className="p-3.5 rounded-2xl bg-[var(--card-bg)]/95 border border-[var(--border-light)] shadow-2xl backdrop-blur-md flex items-start gap-3 text-xs"
            >
              <div className="p-1.5 rounded-xl bg-[var(--accent)]/15 text-[var(--accent)] shrink-0">
                <Sparkles className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <span className="font-bold text-[var(--text-primary)] block mb-0.5">New Episodes Dropped!</span>
                <p className="text-[var(--text-secondary)] leading-relaxed">{alert.message}</p>
              </div>
              <button
                type="button"
                onClick={() => setSyncAlerts(prev => prev.filter(a => a.id !== alert.id))}
                className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] p-1 rounded-lg hover:bg-[var(--bg-hover)] transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Main Content Area or Franchise Canvas View */}
      {mainTab === 'canvas' ? (
        <FranchiseCanvasView
          libraryItems={mediaList}
          onInspectMedia={(clicked) => setSelectedMedia(clicked)}
          onRefreshLibrary={refreshLibrary}
        />
      ) : (
        <>
          <main className={`flex-1 max-w-7xl w-full mx-auto px-3 sm:px-4 lg:px-8 pb-28 md:pb-6 ${gridDensity === 'compact' ? 'py-3 sm:py-4' : 'py-4 sm:py-6'}`}>
            
            {/* Desktop Offline IndexedDB & E2EE Cloud Sync Status Strip (Issue #49) */}
            <div className="hidden md:flex mb-3 px-3 py-1.5 rounded-xl bg-[var(--bg-secondary)]/70 border border-[var(--border-light)] items-center justify-between gap-2 text-[11px]">
              <button
                type="button"
                onClick={() => setIsCloudSyncOpen(true)}
                className="flex items-center gap-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors truncate cursor-pointer"
              >
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${
                    cloudSyncStatus.state === 'synced'
                      ? 'bg-emerald-400'
                      : cloudSyncStatus.state === 'syncing'
                      ? 'bg-sky-400 animate-ping'
                      : cloudSyncStatus.state === 'error'
                      ? 'bg-rose-400'
                      : cloudSyncStatus.state === 'offline'
                      ? 'bg-amber-400'
                      : 'bg-emerald-500/70'
                  }`}
                />
                <span className="truncate font-medium">
                  {syncManager.isConfigured()
                    ? `Offline IndexedDB • Synced ${formatSyncRelativeTime(cloudSyncStatus.lastSyncedAt || syncManager.getConfig()?.lastSyncedAt)}`
                    : `Offline IndexedDB • ${mediaList.length} items local`}
                </span>
              </button>

              <div className="flex items-center gap-2 shrink-0">
                {syncManager.isConfigured() ? (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={cloudSyncStatus.state === 'syncing'}
                      onClick={() => {
                        syncManager.syncNow().catch(err => console.warn('[CloudSync] Manual sync error:', err));
                      }}
                      className="flex items-center gap-1 font-bold text-xs text-[var(--accent)] hover:brightness-110 disabled:opacity-50 cursor-pointer px-1.5 py-0.5 rounded-lg hover:bg-[var(--accent)]/10 transition-colors"
                      title="Bi-directional Sync (Merge local and cloud)"
                    >
                      <RefreshCw className={`w-3 h-3 ${cloudSyncStatus.state === 'syncing' ? 'animate-spin' : ''}`} />
                      <span>{cloudSyncStatus.state === 'syncing' ? 'SYNCING...' : 'SYNC'}</span>
                    </button>
                    <span className="text-[var(--border-light)] text-xs">|</span>
                    <button
                      type="button"
                      disabled={cloudSyncStatus.state === 'syncing'}
                      onClick={handleDirectPushToCloud}
                      className="flex items-center gap-1 font-bold text-xs text-sky-400 hover:text-sky-300 disabled:opacity-50 cursor-pointer px-1.5 py-0.5 rounded-lg hover:bg-sky-500/10 transition-colors"
                      title="Push to Cloud (Overwrite Cloud Vault with Local Data)"
                    >
                      <UploadCloud className="w-3 h-3" />
                      <span>PUSH</span>
                    </button>
                    <span className="text-[var(--border-light)] text-xs">|</span>
                    <button
                      type="button"
                      disabled={cloudSyncStatus.state === 'syncing'}
                      onClick={handleDirectPullFromCloud}
                      className="flex items-center gap-1 font-bold text-xs text-amber-400 hover:text-amber-300 disabled:opacity-50 cursor-pointer px-1.5 py-0.5 rounded-lg hover:bg-amber-500/10 transition-colors"
                      title="Pull from Cloud (Overwrite Local Library with Cloud Vault)"
                    >
                      <DownloadCloud className="w-3 h-3" />
                      <span>PULL</span>
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsCloudSyncOpen(true)}
                    className="flex items-center gap-1 font-bold text-[var(--accent)] hover:brightness-110 cursor-pointer"
                  >
                    <QrCode className="w-3 h-3" />
                    <span>PAIR DEVICE</span>
                  </button>
                )}
              </div>
            </div>

            {/* Mobile View: Dedicated Upcoming View or Library View (Issue #52) */}
            {isMobileUpcomingView ? (
              <MobileUpcomingView
                items={mediaList}
                upcomingDays={upcomingDays}
                onUpcomingDaysChange={handleUpcomingDaysChange}
                upcomingFilter={upcomingFilter}
                onUpcomingFilterChange={handleUpcomingFilterChange}
                onItemClick={(clicked) => setSelectedMedia(clicked)}
                onOpenSearch={() => setIsSearchOpen(true)}
                ratingScale={ratingScale}
              />
            ) : (
              <div className="md:hidden">
                {/* Mobile Stitch Search Bar & Offline/Sync Status Strip (Issue #50 & #54) */}
                <MobileSearchStrip
                  searchQuery={librarySearch}
                  onSearchChange={setLibrarySearch}
                  totalItemsCount={mediaList.length}
                  onOpenSearchModal={() => setIsSearchOpen(true)}
                  onOpenFilterSheet={() => setIsMobileFilterOpen(true)}
                  cloudSyncStatus={cloudSyncStatus}
                  onOpenCloudSync={() => setIsCloudSyncOpen(true)}
                  onTriggerSync={() => {
                    syncManager.syncNow().catch(err => console.warn('[CloudSync] Manual sync error:', err));
                  }}
                  onPushToCloud={handleDirectPushToCloud}
                  onPullFromCloud={handleDirectPullFromCloud}
                  isSyncing={cloudSyncStatus.state === 'syncing' || syncState.isActive}
                  isConfigured={syncManager.isConfigured()}
                  lastSyncedTimeAgo={formatSyncRelativeTime(cloudSyncStatus.lastSyncedAt || syncManager.getConfig()?.lastSyncedAt)}
                />

                {/* Mobile Dual-Row Horizontally Scrollable Filter Chips (Issue #50) */}
                <MobileFilterChips
                  typeFilter={typeFilter}
                  onTypeChange={handleTypeChange}
                  bookFormatFilter={bookFormatFilter}
                  onBookFormatChange={handleBookFormatChange}
                  statusFilter={statusFilter}
                  onStatusChange={handleStatusChange}
                  itemCounts={itemCounts}
                  typeCounts={mobileTypeCounts}
                />
              </div>
            )}

            {/* Live Progress Bar for Library Sync */}
            <SyncProgressBar
              syncState={syncState}
              onCancel={handleCancelSync}
              onDismiss={handleDismissSync}
            />

            {/* Desktop Filter and Search Bar (>= 768px) */}
            <div className="hidden md:block">
              <FilterBar
                statusFilter={statusFilter}
                onStatusChange={handleStatusChange}
                typeFilter={typeFilter}
                onTypeChange={handleTypeChange}
                bookFormatFilter={bookFormatFilter}
                onBookFormatChange={handleBookFormatChange}
                bookCounts={bookCounts}
                listFilter={listFilter}
                onListChange={handleListChange}
                customLists={customLists}
                onOpenListManager={() => setIsListManagerOpen(true)}
                librarySearch={librarySearch}
                onLibrarySearchChange={setLibrarySearch}
                sortBy={sortBy}
                onSortChange={handleSortChange}
                itemCounts={itemCounts}
                viewMode={viewMode}
                onViewModeChange={handleViewModeChange}
                gridDensity={gridDensity}
                onGridDensityChange={handleGridDensityChange}
                gridColumns={gridColumns}
                onGridColumnsChange={handleGridColumnsChange}
                upcomingFilter={upcomingFilter}
                onUpcomingFilterChange={handleUpcomingFilterChange}
                upcomingDays={upcomingDays}
                showPinnedView={showPinnedView}
                onTogglePinnedView={handleTogglePinnedView}
                pinnedCount={totalPinnedCount}
              />
            </div>

            {/* Pinned Cards Section (Issue #47) */}
            {showPinnedView && (
              <section className={`mb-6 animate-fadeIn transition-all ${isMobileUpcomingView ? 'hidden md:block' : ''}`}>
                <div className="flex items-center justify-between pb-2 mb-3.5 border-b border-[var(--border-light)]">
                  <div className="flex items-center gap-2">
                    <span className="flex items-center gap-1.5 text-xs sm:text-sm font-bold text-[var(--text-primary)]">
                      <Pin className="w-3.5 h-3.5 text-[var(--accent)] fill-current" />
                      <span>Pinned</span>
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-mono font-bold bg-[var(--accent)]/15 text-[var(--accent)] border border-[var(--accent)]/30">
                      {pinnedItems.length}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {pinnedItems.length > 0 && (
                      <button
                        type="button"
                        onClick={handleUnpinAll}
                        className="text-[11px] text-[var(--text-secondary)] hover:text-red-400 px-2 py-1 rounded-lg hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
                        title="Unpin all items in library"
                      >
                        Unpin all
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleTogglePinnedView}
                      className="flex items-center gap-1 text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-2.5 py-1 rounded-lg bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] border border-[var(--border-light)] transition-all cursor-pointer"
                      title="Collapse pinned section"
                    >
                      <ChevronUp className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Hide</span>
                    </button>
                  </div>
                </div>

                {pinnedItems.length > 0 ? (
                  viewMode === 'list' ? (
                    <MediaListView
                      items={pinnedItems}
                      onClick={(clicked) => setSelectedMedia(clicked)}
                      onQuickIncrement={handleQuickIncrement}
                      onQuickToggleMovie={handleQuickToggleMovie}
                      onTogglePin={handleTogglePin}
                      ratingScale={ratingScale}
                      runtimeDisplayFormat={runtimeDisplayFormat}
                    />
                  ) : (
                    <div
                      data-cols={gridColumns}
                      className={`bingelog-media-grid ${
                        gridDensity === 'compact'
                          ? 'gap-2 sm:gap-2.5'
                          : 'gap-3.5 sm:gap-4 lg:gap-5'
                      } ${
                        gridColumns === 'auto'
                          ? gridDensity === 'compact'
                            ? 'grid-cols-2 xs:grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8'
                            : 'grid-cols-2 xs:grid-cols-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6'
                          : ''
                      }`}
                    >
                      {pinnedItems.map(item => (
                        <MediaCard
                          key={`pinned_${item.id}`}
                          item={item}
                          onClick={(clicked) => setSelectedMedia(clicked)}
                          onQuickIncrement={handleQuickIncrement}
                          onQuickToggleMovie={handleQuickToggleMovie}
                          onTogglePin={handleTogglePin}
                          ratingScale={ratingScale}
                          runtimeDisplayFormat={runtimeDisplayFormat}
                          density={gridDensity}
                        />
                      ))}
                    </div>
                  )
                ) : (
                  <div className="flex items-center justify-center py-6 px-4 text-center border border-dashed border-[var(--border-light)] rounded-2xl bg-[var(--bg-secondary)]/30 text-xs text-[var(--text-secondary)]">
                    <span>No pinned items yet. Click the pin icon on any card to keep it here.</span>
                  </div>
                )}
              </section>
            )}

            {/* Mobile "Now In Progress" Horizontal Carousel (Issue #50, positioned below Pinned Section in Issue #58) */}
            {!isMobileUpcomingView && nowInProgressItems.length > 0 && (
              <NowInProgressCarousel
                items={nowInProgressItems}
                onClick={(clicked) => setSelectedMedia(clicked)}
                onQuickIncrement={handleQuickIncrement}
                onQuickToggleMovie={handleQuickToggleMovie}
                ratingScale={ratingScale}
                onSeeAllWatching={() => handleStatusChange('watching')}
              />
            )}

            {/* Mobile "Your Media Collection" Section Header (Issue #50) */}
            {!isMobileUpcomingView && (
              <div className="md:hidden flex items-center justify-between pb-2 mb-3 border-b border-[var(--border-light)]">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-[var(--accent)]/15 text-[var(--accent)] flex items-center justify-center">
                    <Film className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-xs sm:text-sm font-bold text-[var(--text-primary)]">
                      Your Media Collection
                    </h2>
                    <p className="text-[10px] text-[var(--text-secondary)]">
                      {filteredItems.length} items • {mediaList.length} total
                    </p>
                  </div>
                </div>

                <div className="flex items-center p-0.5 rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border-light)]">
                  <button
                    type="button"
                    onClick={() => handleViewModeChange('grid')}
                    className={`p-1.5 rounded-lg text-xs font-semibold transition-all ${
                      viewMode === 'grid'
                        ? 'bg-[var(--accent)] text-white shadow-xs'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                    title="Grid View"
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleViewModeChange('list')}
                    className={`p-1.5 rounded-lg text-xs font-semibold transition-all ${
                      viewMode === 'list'
                        ? 'bg-[var(--accent)] text-white shadow-xs'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                    title="List View"
                  >
                    <List className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* Media Content (Grid or List View) */}
            <div className={isMobileUpcomingView ? 'hidden md:block' : ''}>
              {unpinnedItems.length > 0 ? (
                viewMode === 'list' ? (
                  <MediaListView
                    items={unpinnedItems}
                    onClick={(clicked) => setSelectedMedia(clicked)}
                    onQuickIncrement={handleQuickIncrement}
                    onQuickToggleMovie={handleQuickToggleMovie}
                    onTogglePin={handleTogglePin}
                    ratingScale={ratingScale}
                    runtimeDisplayFormat={runtimeDisplayFormat}
                  />
                ) : (
                  <div
                    data-cols={gridColumns}
                    className={`bingelog-media-grid ${
                      gridDensity === 'compact'
                        ? 'gap-2 sm:gap-2.5'
                        : 'gap-3 sm:gap-4 lg:gap-5'
                    } ${
                      gridColumns === 'auto'
                        ? gridDensity === 'compact'
                          ? 'grid-cols-2 xs:grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8'
                          : 'grid-cols-2 xs:grid-cols-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6'
                        : ''
                    }`}
                  >
                    {unpinnedItems.map(item => (
                      <MediaCard
                        key={item.id}
                        item={item}
                        onClick={(clicked) => setSelectedMedia(clicked)}
                        onQuickIncrement={handleQuickIncrement}
                        onQuickToggleMovie={handleQuickToggleMovie}
                        onTogglePin={handleTogglePin}
                        ratingScale={ratingScale}
                        runtimeDisplayFormat={runtimeDisplayFormat}
                        density={gridDensity}
                      />
                    ))}
                  </div>
                )
              ) : pinnedItems.length === 0 ? (
                /* Empty State */
                <div className="flex flex-col items-center justify-center py-16 px-4 text-center border border-dashed border-[var(--border-light)] rounded-3xl bg-[var(--bg-secondary)]/40 my-8">
                  <div className="w-14 h-14 rounded-2xl bg-[var(--accent)]/10 border border-[var(--accent)]/20 flex items-center justify-center text-[var(--accent)] mb-4">
                    <Film className="w-7 h-7" />
                  </div>

                  {mediaList.length === 0 ? (
                    <div className="max-w-md">
                      <h2 className="text-xl font-bold text-[var(--text-primary)] mb-2">
                        Your Watch Library is Empty
                      </h2>
                      <p className="text-xs sm:text-sm text-[var(--text-secondary)] mb-6 leading-relaxed">
                        Start tracking movies and TV shows! Type a name into the search bar to automatically fetch seasons, episode titles, and poster artwork.
                      </p>

                      <div className="flex flex-wrap items-center justify-center gap-3">
                        <button
                          type="button"
                          onClick={() => setIsSearchOpen(true)}
                          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--accent)] hover:brightness-110 text-white text-xs sm:text-sm font-bold shadow-lg shadow-[var(--accent)]/30 transition-all active:scale-95"
                        >
                          <Search className="w-4 h-4" />
                          <span>Search Series & Movies</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setManualEditItem(null);
                            setIsManualOpen(true);
                          }}
                          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] text-xs sm:text-sm font-semibold transition-all border border-[var(--border-light)]"
                        >
                          <Plus className="w-4 h-4" />
                          <span>Add Custom Entry</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="max-w-sm">
                      <h3 className="text-base font-semibold text-[var(--text-primary)] mb-1">
                        No matches found
                      </h3>
                      <p className="text-xs text-[var(--text-secondary)] mb-4">
                        No items in your library match the current filters or search query.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setStatusFilter('all');
                          setTypeFilter('all');
                          setLibrarySearch('');
                        }}
                        className="px-3.5 py-1.5 rounded-lg bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] text-xs font-medium transition-all border border-[var(--border-light)]"
                      >
                        Clear Filters
                      </button>
                    </div>
                  )}
                </div>
              ) : null}
            </div>

          </main>

          {/* Footer */}
          <footer className="mb-20 md:mb-0 border-t border-[var(--border-light)] py-6 text-center text-xs text-[var(--text-tertiary)]">
            <p>BingeLog • Unlimited IndexedDB Storage • Metadata via TMDB & TVMaze</p>
          </footer>
        </>
      )}

      {/* Mobile Bottom Navigation Bar (Issue #50 & #52) */}
      <MobileBottomNav
        currentTab={mainTab}
        onSelectTab={handleMainTabChange}
        onOpenSearch={() => setIsSearchOpen(true)}
        isUpcomingActive={isMobileUpcomingView}
        onToggleUpcoming={() => {
          handleMainTabChange(mainTab === 'upcoming' ? 'library' : 'upcoming');
        }}
        upcomingCount={upcomingCount}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      {/* Mobile Filter Sheet (Issue #50 & #52 & #57) */}
      <MobileFilterSheet
        isOpen={isMobileFilterOpen}
        onClose={() => setIsMobileFilterOpen(false)}
        sortBy={sortBy}
        onSortChange={handleSortChange}
        listFilter={listFilter}
        onListChange={handleListChange}
        customLists={customLists}
        onOpenListManager={() => setIsListManagerOpen(true)}
        viewMode={viewMode}
        onViewModeChange={handleViewModeChange}
        gridDensity={gridDensity}
        onGridDensityChange={handleGridDensityChange}
        showPinnedView={showPinnedView}
        onTogglePinnedView={handleTogglePinnedView}
        pinnedCount={totalPinnedCount}
        upcomingFilter={upcomingFilter}
        onUpcomingFilterChange={handleUpcomingFilterChange}
        upcomingDays={upcomingDays}
        onUpcomingDaysChange={handleUpcomingDaysChange}
        onSelectUpcomingTab={() => handleMainTabChange('upcoming')}
        typeFilter={typeFilter}
        bookFormatFilter={bookFormatFilter}
        onBookFormatChange={handleBookFormatChange}
        items={mediaList}
      />

      {/* Search Modal */}
      <SearchModal
        isOpen={isSearchOpen}
        onClose={() => {
          setIsSearchOpen(false);
          setSharedSearchQuery('');
          setSharedSearchType('all');
        }}
        initialQuery={sharedSearchQuery}
        initialTypeTab={sharedSearchType}
        onItemAdded={refreshLibrary}
        onSelectExisting={(item) => {
          setSelectedMedia(item);
          setIsSearchOpen(false);
        }}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      {/* Media Detail & Episode Checklist Modal */}
      {selectedMedia && (
        <MediaDetailModal
          media={selectedMedia}
          onClose={() => setSelectedMedia(null)}
          onUpdated={refreshLibrary}
          onUpdate={(updated) => {
            setSelectedMedia(updated);
            refreshLibrary();
          }}
          onEditCustom={handleOpenEdit}
          onOpenInCanvas={() => handleMainTabChange('canvas')}
          ratingScale={ratingScale}
          onRatingScaleChange={setRatingScale}
          runtimeDisplayFormat={runtimeDisplayFormat}
        />
      )}

      {/* Manual Add / Edit Modal */}
      <ManualMediaModal
        isOpen={isManualOpen}
        initialItem={manualEditItem}
        initialData={manualEditItem}
        ratingScale={ratingScale}
        onClose={() => {
          setIsManualOpen(false);
          setManualEditItem(null);
        }}
        onSelectExisting={(item) => {
          setSelectedMedia(item);
          setIsManualOpen(false);
          setManualEditItem(null);
        }}
        onSaved={refreshLibrary}
      />

      {/* Settings & Export Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onOpenCloudSync={() => setIsCloudSyncOpen(true)}
        onDataRestored={refreshLibrary}
        onStreamingUpdated={refreshLibrary}
        ratingScale={ratingScale}
        onRatingScaleChange={setRatingScale}
        upcomingDays={upcomingDays}
        onUpcomingDaysChange={handleUpcomingDaysChange}
        runtimeDisplayFormat={runtimeDisplayFormat}
        onRuntimeDisplayFormatChange={setRuntimeDisplayFormat}
      />

      {/* E2EE Cloud Sync & QR Device Pairing Modal */}
      <CloudSyncModal
        isOpen={isCloudSyncOpen}
        onClose={() => setIsCloudSyncOpen(false)}
        onSynced={refreshLibrary}
      />

      {/* Theme Customizer & Presets Modal */}
      <ThemeModal
        isOpen={isThemeOpen}
        onClose={() => setIsThemeOpen(false)}
        mediaList={mediaList}
        onThemeChanged={() => {
          const mode = (document.documentElement.getAttribute('data-theme') || 'dark') as ThemeMode;
          setThemeMode(mode);
          void refreshLibrary();
        }}
      />

      {/* Folders & List Manager Modal */}
      <ListManagerModal
        isOpen={isListManagerOpen}
        onClose={() => setIsListManagerOpen(false)}
        customLists={customLists}
        mediaList={mediaList}
        onListsChanged={refreshLibrary}
      />
    </div>
  );
}
