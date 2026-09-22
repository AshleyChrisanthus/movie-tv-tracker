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
import { getAllMedia, toggleEpisodeWatched, getEpisodesForMedia, updateMediaStatus, backfillMissingMediaMetadata, backfillMediaCrossReferences, getCustomLists, updateBookProgress, getSetting } from './db';
import { syncMediaEpisodes, runSyncQueue, getShowsEligibleForSync } from './services/api';
import { initTheme, toggleThemeMode } from './styles/theme';
import { shouldShowItemForUpcomingFilter } from './utils/upcoming';
import { Film, Plus, Search, Sparkles, X } from 'lucide-react';
import type { MediaItem, SyncState, SyncAlert, ThemeMode, MediaStatus, CustomList, RatingScale, ViewMode, GridDensity, UpcomingFilter } from './types';

export default function App(): React.JSX.Element {
  const [mediaList, setMediaList] = useState<MediaItem[]>([]);
  const [customLists, setCustomLists] = useState<CustomList[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>(
    () => localStorage.getItem('bingelog_status_filter') || 'all'
  );
  const [typeFilter, setTypeFilter] = useState<string>(
    () => localStorage.getItem('bingelog_type_filter') || 'all'
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
  const [isManualOpen, setIsManualOpen] = useState<boolean>(false);
  const [manualEditItem, setManualEditItem] = useState<MediaItem | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isThemeOpen, setIsThemeOpen] = useState<boolean>(false);
  const [isListManagerOpen, setIsListManagerOpen] = useState<boolean>(false);
  const [themeMode, setThemeMode] = useState<ThemeMode>('dark');
  const [selectedMedia, setSelectedMedia] = useState<MediaItem | null>(null);
  const [syncAlerts, setSyncAlerts] = useState<SyncAlert[]>([]);
  const [ratingScale, setRatingScale] = useState<RatingScale>(
    () => (localStorage.getItem('bingelog_rating_scale') as RatingScale) || '10'
  );

  useEffect(() => {
    getSetting<RatingScale>('rating_scale', '10').then(s => {
      if (s) {
        setRatingScale(s);
        localStorage.setItem('bingelog_rating_scale', s);
      }
    });
    getSetting<number>('upcoming_window_days', 7).then(days => {
      if (days !== undefined && days !== null) {
        setUpcomingDays(Number(days));
        localStorage.setItem('bingelog_upcoming_days', String(days));
      }
    });
  }, []);

  // View Mode & Grid Density (Issue #31)
  const [viewMode, setViewMode] = useState<ViewMode>(
    () => (localStorage.getItem('bingelog_view_mode') as ViewMode) || 'grid'
  );
  const [gridDensity, setGridDensity] = useState<GridDensity>(
    () => (localStorage.getItem('bingelog_grid_density') as GridDensity) || 'comfortable'
  );

  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode);
    localStorage.setItem('bingelog_view_mode', mode);
  };

  const handleGridDensityChange = (density: GridDensity) => {
    setGridDensity(density);
    localStorage.setItem('bingelog_grid_density', density);
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

  // Initialize theme mode on mount
  useEffect(() => {
    initTheme();
    const currentMode = (document.documentElement.getAttribute('data-theme') || 'dark') as ThemeMode;
    setThemeMode(currentMode);
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
        const healed = await backfillMissingMediaMetadata();
        const backfilledRefs = await backfillMediaCrossReferences();
        if (healed > 0 || backfilledRefs > 0) {
          await refreshLibrary();
        }
      } catch (err) {
        console.warn('Metadata backfill error:', err);
      }

      // Quiet background check after initial load
      setTimeout(checkEligibleShowsForUpdates, 2500);
    });
  }, []);

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
      if (listFilter !== 'all' && (!item.lists || !item.lists.includes(listFilter))) continue;
      if (!shouldShowItemForUpcomingFilter(item, upcomingFilter, upcomingDays)) continue;
      counts.all++;
      if (counts[item.status] !== undefined) {
        counts[item.status]++;
      }
    }
    return counts;
  }, [mediaList, typeFilter, listFilter, upcomingFilter, upcomingDays]);

  // Compute overall stats for navbar
  const stats = useMemo(() => ({
    watching: itemCounts.watching,
    completed: itemCounts.completed,
    total: mediaList.length
  }), [itemCounts, mediaList.length]);

  // Filter and sort items
  const filteredItems = useMemo<MediaItem[]>(() => {
    return mediaList
      .filter(item => {
        if (statusFilter !== 'all' && item.status !== statusFilter) return false;
        if (typeFilter !== 'all' && item.type !== typeFilter) return false;
        if (listFilter !== 'all' && (!item.lists || !item.lists.includes(listFilter))) return false;
        if (!shouldShowItemForUpcomingFilter(item, upcomingFilter, upcomingDays)) return false;
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
        if (sortBy === 'release_desc') {
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
        if (sortBy === 'rating') {
          return (b.rating || 0) - (a.rating || 0);
        }
        if (sortBy === 'progress') {
          const progA = a.totalEpisodes ? (a.watchedEpisodesCount || 0) / a.totalEpisodes : 0;
          const progB = b.totalEpisodes ? (b.watchedEpisodesCount || 0) / b.totalEpisodes : 0;
          return progB - progA;
        }
        // default 'updated'
        return new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime();
      });
  }, [mediaList, statusFilter, typeFilter, listFilter, librarySearch, sortBy, upcomingFilter, upcomingDays]);

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
      if (item.progressMode === 'chapters') {
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
  };

  // Open Edit Modal for an item
  const handleOpenEdit = (item: MediaItem): void => {
    setManualEditItem(item);
    setIsManualOpen(true);
  };

  // Start Sync All Library
  const handleStartSyncAll = async (): Promise<void> => {
    if (syncState.isActive) return;

    const items = await getAllMedia();
    const shows = getShowsEligibleForSync(items, { forceAll: true });

    if (shows.length === 0) {
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
      total: shows.length,
      currentTitle: shows[0]?.title || '',
      updatedCount: 0
    });

    let liveUpdatedCount = 0;

    const queueResult = await runSyncQueue(shows, {
      concurrency: 2,
      delayMs: 250,
      abortSignal: abortController.signal,
      onProgress: (completed, total, currentShow, result, isCancelled) => {
        if (result?.hasUpdates && ((result.newEpisodesCount || 0) > 0 || (result.updatedTitlesCount || 0) > 0)) {
          liveUpdatedCount++;
        }
        setSyncState(prev => ({
          ...prev,
          completed,
          total,
          currentTitle: currentShow?.title || '',
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

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] flex flex-col selection:bg-[var(--accent)] selection:text-white transition-colors duration-200">
      {/* Top Navbar */}
      <Navbar
        onOpenSearch={() => setIsSearchOpen(true)}
        onOpenManual={() => {
          setManualEditItem(null);
          setIsManualOpen(true);
        }}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenTheme={() => setIsThemeOpen(true)}
        onToggleTheme={handleToggleTheme}
        themeMode={themeMode}
        onStartSyncAll={handleStartSyncAll}
        isSyncing={syncState.isActive}
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

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 lg:px-8 py-6">
        
        {/* Live Progress Bar for Library Sync */}
        <SyncProgressBar
          syncState={syncState}
          onCancel={handleCancelSync}
          onDismiss={handleDismissSync}
        />

        {/* Filter and Search Bar */}
        <FilterBar
          statusFilter={statusFilter}
          onStatusChange={handleStatusChange}
          typeFilter={typeFilter}
          onTypeChange={handleTypeChange}
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
          upcomingFilter={upcomingFilter}
          onUpcomingFilterChange={handleUpcomingFilterChange}
          upcomingDays={upcomingDays}
        />

        {/* Media Content (Grid or List View) */}
        {filteredItems.length > 0 ? (
          viewMode === 'list' ? (
            <MediaListView
              items={filteredItems}
              onClick={(clicked) => setSelectedMedia(clicked)}
              onQuickIncrement={handleQuickIncrement}
              onQuickToggleMovie={handleQuickToggleMovie}
              ratingScale={ratingScale}
            />
          ) : (
            <div className={`grid ${
              gridDensity === 'compact'
                ? 'grid-cols-2 xs:grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-6 gap-2 sm:gap-2.5 lg:gap-3'
                : 'grid-cols-2 xs:grid-cols-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3.5 sm:gap-4 lg:gap-5'
            }`}>
              {filteredItems.map(item => (
                <MediaCard
                  key={item.id}
                  item={item}
                  onClick={(clicked) => setSelectedMedia(clicked)}
                  onQuickIncrement={handleQuickIncrement}
                  onQuickToggleMovie={handleQuickToggleMovie}
                  ratingScale={ratingScale}
                  density={gridDensity}
                />
              ))}
            </div>
          )
        ) : (
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
        )}

      </main>

      {/* Footer */}
      <footer className="border-t border-[var(--border-light)] py-6 text-center text-xs text-[var(--text-tertiary)]">
        <p>BingeLog • Unlimited IndexedDB Storage • Metadata via TMDB & TVMaze</p>
      </footer>

      {/* Search Modal */}
      <SearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
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
          ratingScale={ratingScale}
          onRatingScaleChange={setRatingScale}
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
        onDataRestored={refreshLibrary}
        ratingScale={ratingScale}
        onRatingScaleChange={setRatingScale}
        upcomingDays={upcomingDays}
        onUpcomingDaysChange={handleUpcomingDaysChange}
      />

      {/* Theme Customizer & Presets Modal */}
      <ThemeModal
        isOpen={isThemeOpen}
        onClose={() => setIsThemeOpen(false)}
        mediaList={mediaList}
        onThemeChanged={refreshLibrary}
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
