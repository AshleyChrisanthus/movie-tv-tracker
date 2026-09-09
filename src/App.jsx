import React, { useState, useEffect, useMemo } from 'react';
import Navbar from './components/Navbar';
import FilterBar from './components/FilterBar';
import MediaCard from './components/MediaCard';
import MediaDetailModal from './components/MediaDetailModal';
import SearchModal from './components/SearchModal';
import ManualMediaModal from './components/ManualMediaModal';
import SettingsModal from './components/SettingsModal';
import { getAllMedia, toggleEpisodeWatched, getEpisodesForMedia, updateMediaStatus } from './db';
import { Film, Tv, Plus, Search, Sparkles, CheckCircle2, PlayCircle } from 'lucide-react';

export default function App() {
  const [mediaList, setMediaList] = useState([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [librarySearch, setLibrarySearch] = useState('');
  const [sortBy, setSortBy] = useState('updated');

  // Modals
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isManualOpen, setIsManualOpen] = useState(false);
  const [manualEditItem, setManualEditItem] = useState(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState(null);

  // Load library from IndexedDB
  const refreshLibrary = async () => {
    const items = await getAllMedia();
    setMediaList(items);

    // If a media item is currently open in detail modal, refresh its state too
    if (selectedMedia) {
      const updated = items.find(m => m.id === selectedMedia.id);
      if (updated) setSelectedMedia(updated);
    }
  };

  useEffect(() => {
    refreshLibrary();
  }, []);

  // Global keyboard shortcuts (Ctrl+K or / to search)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsSearchOpen(true);
      }
      if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
        e.preventDefault();
        setIsSearchOpen(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Compute status counts for filter tabs
  const itemCounts = useMemo(() => {
    const counts = { all: mediaList.length, watching: 0, plan_to_watch: 0, completed: 0, on_hold: 0, dropped: 0 };
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
  const filteredItems = useMemo(() => {
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
        return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
      });
  }, [mediaList, statusFilter, typeFilter, librarySearch, sortBy]);

  // Quick Action: +1 episode directly from media card
  const handleQuickIncrement = async (item) => {
    if (item.type !== 'tv') return;
    const episodes = await getEpisodesForMedia(item.id);
    const nextEp = episodes.find(e => e.isWatched === 0);
    if (nextEp) {
      await toggleEpisodeWatched(item.id, nextEp.seasonNumber, nextEp.episodeNumber);
      await refreshLibrary();
    }
  };

  // Quick Action: Toggle movie watched status directly from media card
  const handleQuickToggleMovie = async (item) => {
    const newStatus = item.status === 'completed' ? 'plan_to_watch' : 'completed';
    await updateMediaStatus(item.id, newStatus);
    await refreshLibrary();
  };

  // Open Edit Modal for an item
  const handleOpenEdit = (item) => {
    setManualEditItem(item);
    setIsManualOpen(true);
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col selection:bg-indigo-600 selection:text-white">
      {/* Top Navbar */}
      <Navbar
        onOpenSearch={() => setIsSearchOpen(true)}
        onOpenManual={() => {
          setManualEditItem(null);
          setIsManualOpen(true);
        }}
        onOpenSettings={() => setIsSettingsOpen(true)}
        stats={stats}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 lg:px-8 py-6">
        
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
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center border border-dashed border-zinc-800 rounded-3xl bg-zinc-900/30 my-8">
            <div className="w-14 h-14 rounded-2xl bg-indigo-600/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mb-4">
              <Film className="w-7 h-7" />
            </div>

            {mediaList.length === 0 ? (
              <div className="max-w-md">
                <h2 className="text-xl font-bold text-white mb-2">
                  Your Watch Library is Empty
                </h2>
                <p className="text-xs sm:text-sm text-zinc-400 mb-6 leading-relaxed">
                  Start tracking movies and TV shows! Type a name into the search bar to automatically fetch seasons, episode titles, and poster artwork.
                </p>

                <div className="flex flex-wrap items-center justify-center gap-3">
                  <button
                    onClick={() => setIsSearchOpen(true)}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs sm:text-sm font-bold shadow-lg shadow-indigo-600/30 transition-all active:scale-95"
                  >
                    <Search className="w-4 h-4" />
                    <span>Search Series & Movies</span>
                  </button>

                  <button
                    onClick={() => {
                      setManualEditItem(null);
                      setIsManualOpen(true);
                    }}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs sm:text-sm font-semibold transition-all border border-zinc-700"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add Custom Entry</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="max-w-sm">
                <h3 className="text-base font-semibold text-zinc-200 mb-1">
                  No matches found
                </h3>
                <p className="text-xs text-zinc-400 mb-4">
                  No items in your library match the current filters or search query.
                </p>
                <button
                  onClick={() => {
                    setStatusFilter('all');
                    setTypeFilter('all');
                    setLibrarySearch('');
                  }}
                  className="px-3.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium transition-all"
                >
                  Clear Filters
                </button>
              </div>
            )}
          </div>
        )}

      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-900 py-6 text-center text-xs text-zinc-600">
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
    </div>
  );
}
