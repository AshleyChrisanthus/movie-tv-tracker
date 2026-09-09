import React, { useState, useEffect, useRef } from 'react';
import { Search, X, Film, Tv, Star, Plus, Check, Loader2, Key } from 'lucide-react';
import { searchMedia, fetchFullMediaDetails, getTmdbApiKey } from '../services/api';
import { saveMediaItem } from '../db';

export default function SearchModal({ isOpen, onClose, onItemAdded, onOpenSettings }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [addingId, setAddingId] = useState(null);
  const [addedIds, setAddedIds] = useState(new Set());
  const [hasTmdbKey, setHasTmdbKey] = useState(false);
  const inputRef = useRef(null);

  // Check TMDB key status on open
  useEffect(() => {
    if (isOpen) {
      getTmdbApiKey().then(key => setHasTmdbKey(!!key));
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery('');
      setResults([]);
    }
  }, [isOpen]);

  // Debounced search
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    const timeoutId = setTimeout(async () => {
      try {
        const res = await searchMedia(query);
        setResults(res);
      } catch (err) {
        console.error('Search error:', err);
      } finally {
        setIsSearching(false);
      }
    }, 350);

    return () => clearTimeout(timeoutId);
  }, [query]);

  // Add item to library
  const handleAddMedia = async (item, initialStatus = 'plan_to_watch') => {
    setAddingId(item.externalId);
    try {
      // Fetch full metadata including all seasons and episodes with titles
      const fullData = await fetchFullMediaDetails(item);
      
      const mediaToSave = {
        ...fullData.media,
        status: initialStatus
      };

      await saveMediaItem(mediaToSave, fullData.episodes);
      setAddedIds(prev => new Set(prev).add(item.externalId));
      if (onItemAdded) onItemAdded(mediaToSave);
    } catch (err) {
      console.error('Failed to add media:', err);
      alert('Failed to retrieve full series details. Please check your connection.');
    } finally {
      setAddingId(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-10 sm:pt-20 px-3 bg-black/80 backdrop-blur-sm overflow-y-auto animate-fadeIn">
      <div className="relative w-full max-w-2xl bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        
        {/* Search Header */}
        <div className="p-4 border-b border-zinc-800 bg-zinc-950 flex items-center gap-3">
          <Search className="w-5 h-5 text-indigo-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a movie or TV show name (e.g. Breaking Bad, Dune)..."
            className="flex-1 bg-transparent text-sm sm:text-base text-zinc-100 placeholder-zinc-500 focus:outline-none"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="p-1 rounded text-zinc-500 hover:text-zinc-300"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Provider Indicator Banner */}
        <div className="px-4 py-2 bg-zinc-900/90 border-b border-zinc-800/80 flex items-center justify-between text-xs text-zinc-400">
          <div className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${hasTmdbKey ? 'bg-emerald-400' : 'bg-amber-400'}`} />
            <span>
              {hasTmdbKey
                ? 'TMDB API Active (Full Movie & TV Data)'
                : 'TVMaze & Free Fallback Active (TV Shows & iTunes Movies)'}
            </span>
          </div>

          {!hasTmdbKey && (
            <button
              onClick={() => {
                onClose();
                if (onOpenSettings) onOpenSettings();
              }}
              className="text-indigo-400 hover:text-indigo-300 font-medium flex items-center gap-1 hover:underline"
            >
              <Key className="w-3 h-3" />
              <span>Add TMDB Key</span>
            </button>
          )}
        </div>

        {/* Search Results List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
          {isSearching && (
            <div className="flex flex-col items-center justify-center py-12 text-zinc-500 gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
              <span className="text-xs">Searching for titles...</span>
            </div>
          )}

          {!isSearching && results.length === 0 && query.trim().length > 0 && (
            <div className="text-center py-12 text-zinc-500 text-sm">
              No results found for "{query}". You can also click "+ Add Custom" on the navbar to add it manually.
            </div>
          )}

          {!isSearching && results.length === 0 && query.trim().length === 0 && (
            <div className="text-center py-12 text-zinc-600 text-xs">
              Search by title to pull in seasons, episodes, titles, and posters automatically.
            </div>
          )}

          {!isSearching && results.map(item => {
            const isTv = item.type === 'tv';
            const isAdded = addedIds.has(item.externalId);
            const isAdding = addingId === item.externalId;

            return (
              <div
                key={`${item.source}_${item.externalId}`}
                className="flex items-center gap-3.5 p-3 rounded-xl bg-zinc-950/70 border border-zinc-800/80 hover:border-zinc-700 transition-all group"
              >
                {/* Poster Thumbnail */}
                <div className="w-12 sm:w-14 aspect-[2/3] rounded-lg overflow-hidden bg-zinc-900 shrink-0 border border-zinc-800">
                  {item.posterUrl ? (
                    <img src={item.posterUrl} alt={item.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-zinc-600">
                      {isTv ? <Tv className="w-5 h-5" /> : <Film className="w-5 h-5" />}
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                    <span className="font-bold text-sm text-zinc-100 group-hover:text-indigo-300 transition-colors truncate">
                      {item.title}
                    </span>
                    <span className="text-xs text-zinc-400 font-mono">
                      ({item.year || 'N/A'})
                    </span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded font-semibold bg-zinc-800 text-zinc-300">
                      {isTv ? 'TV' : 'Movie'}
                    </span>
                  </div>

                  {item.overview && (
                    <p className="text-xs text-zinc-400 line-clamp-2 leading-relaxed">
                      {item.overview}
                    </p>
                  )}
                </div>

                {/* Add Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  {isAdded ? (
                    <span className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-950 text-emerald-400 border border-emerald-800/60 text-xs font-bold">
                      <Check className="w-3.5 h-3.5" />
                      <span>Added</span>
                    </span>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleAddMedia(item, 'watching')}
                        disabled={isAdding}
                        className="px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-all active:scale-95 disabled:opacity-50 flex items-center gap-1"
                        title="Add directly to Watching"
                      >
                        {isAdding ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Plus className="w-3.5 h-3.5" />
                        )}
                        <span className="hidden sm:inline">Watching</span>
                      </button>

                      <button
                        onClick={() => handleAddMedia(item, 'plan_to_watch')}
                        disabled={isAdding}
                        className="px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium transition-all active:scale-95 disabled:opacity-50"
                        title="Add to Plan to Watch"
                      >
                        Plan to Watch
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

      </div>
    </div>
  );
}
