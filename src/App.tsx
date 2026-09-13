import React, { useState, useEffect, useMemo, useRef } from 'react';
import Navbar from './components/Navbar';
import FilterBar from './components/FilterBar';
import MediaCard from './components/MediaCard';
import MediaDetailModal from './components/MediaDetailModal';
import SearchModal from './components/SearchModal';
import ManualMediaModal from './components/ManualMediaModal';
import SettingsModal from './components/SettingsModal';
import SyncProgressBar from './components/SyncProgressBar';
import ThemeModal from './components/ThemeModal';
import { getAllMedia, toggleEpisodeWatched, getEpisodesForMedia, updateMediaStatus } from './db';
import { syncMediaEpisodes, runSyncQueue, getShowsEligibleForSync } from './services/api';
import { initTheme, toggleThemeMode } from './styles/theme';
import { Film, Plus, Search, Sparkles, X } from 'lucide-react';
import type { MediaItem, SyncState, SyncAlert, ThemeMode, MediaStatus } from './types';

export default function App(): React.JSX.Element {
  const [mediaList, setMediaList] = useState<MediaItem[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [librarySearch, setLibrarySearch] = useState<string>('');
  const [sortBy, setSortBy] = useState<string>('updated');

  // Modals
  const [isSearchOpen, setIsSearchOpen] = useState<boolean>(false);
  const [isManualOpen, setIsManualOpen] = useState<boolean>(false);
  const [manualEditItem, setManualEditItem] = useState<MediaItem | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isThemeOpen, setIsThemeOpen] = useState<boolean>(false);
  const [themeMode, setThemeMode] = useState<ThemeMode>('dark');
  const [selectedMedia, setSelectedMedia] = useState<MediaItem | null>(null);
  const [syncAlerts, setSyncAlerts] = useState<SyncAlert[]>([]);

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

  // Load library from IndexedDB
  const refreshLibrary = async (): Promise<void> => {
    const items = await getAllMedia();
    setMediaList(items);

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

    refreshLibrary().then(() => {
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
      all: mediaList.length,
      watching: 0,
      plan_to_watch: 0,
      completed: 0,
      on_hold: 0,
      dropped: 0
    };
    for (const item of mediaList) {
      if (counts[item.status] !== undefined) {
        counts[item.status]++;
      }
    }
    return counts;
  }, [mediaList]);

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
  }, [mediaList, statusFilter, typeFilter, librarySearch, sortBy]);

  // Quick Action: +1 episode directly from media card
  const handleQuickIncrement = async (item: MediaItem): Promise<void> => {
    if (item.type !== 'tv') return;
    const episodes = await getEpisodesForMedia(item.id);
    const nextEp = episodes.find(e => e.isWatched === 0);
    if (nextEp) {
      await toggleEpisodeWatched(item.id, nextEp.seasonNumber, nextEp.episodeNumber);
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
          onStatusChange={setStatusFilter}
          typeFilter={typeFilter}
          onTypeChange={setTypeFilter}
          librarySearch={librarySearch}
          onLibrarySearchChange={setLibrarySearch}
          sortBy={sortBy}
          onSortChange={setSortBy}
          itemCounts={itemCounts}
        />

        {/* Media Grid */}
        {filteredItems.length > 0 ? (
          <div className="grid grid-cols-2 xs:grid-cols-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3.5 sm:gap-4 lg:gap-5">
            {filteredItems.map(item => (
              <MediaCard
                key={item.id}
                item={item}
                onClick={(clicked) => setSelectedMedia(clicked)}
                onQuickIncrement={handleQuickIncrement}
                onQuickToggleMovie={handleQuickToggleMovie}
              />
            ))}
          </div>
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
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      {/* Media Detail & Episode Checklist Modal */}
      {selectedMedia && (
        <MediaDetailModal
          media={selectedMedia}
          onClose={() => setSelectedMedia(null)}
          onUpdated={refreshLibrary}
          onEditCustom={handleOpenEdit}
        />
      )}

      {/* Manual Add / Edit Modal */}
      <ManualMediaModal
        isOpen={isManualOpen}
        initialItem={manualEditItem}
        initialData={manualEditItem}
        onClose={() => {
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
      />

      {/* Theme Customizer & Presets Modal */}
      <ThemeModal
        isOpen={isThemeOpen}
        onClose={() => setIsThemeOpen(false)}
        mediaList={mediaList}
        onThemeChanged={refreshLibrary}
      />
    </div>
  );
}
