import React, { useState, useEffect, useRef } from 'react';
import { Search, X, Film, Tv, Plus, Check, Loader2, Key, Eye, BookOpen, Star, Globe } from 'lucide-react';
import { searchMedia, fetchFullMediaDetails, getTmdbApiKey } from '../services/api';
import { saveMediaItem, computeAutoStatus, getAllMedia, db } from '../db';
import { isEpisodeAired } from '../utils/timezone';
import { isMediaMatch } from '../utils/mediaMatch';
import type { MediaItem, MediaSearchResult, MediaStatus, WatchedStatus } from '../types';

export interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onItemAdded?: (item: Partial<MediaItem>) => void;
  onSelectExisting?: (item: MediaItem) => void;
  onOpenSettings?: () => void;
}

export default function SearchModal({
  isOpen,
  onClose,
  onItemAdded,
  onSelectExisting,
  onOpenSettings
}: SearchModalProps): React.JSX.Element | null {
  const [query, setQuery] = useState<string>('');
  const [results, setResults] = useState<MediaSearchResult[]>([]);
  const [existingItems, setExistingItems] = useState<MediaItem[]>([]);
  const [searchTypeTab, setSearchTypeTab] = useState<'all' | 'tv' | 'movie' | 'book'>('all');
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [isSearchingBooks, setIsSearchingBooks] = useState<boolean>(false);
  const [addingId, setAddingId] = useState<string | number | null>(null);
  const [addedIds, setAddedIds] = useState<Set<string | number>>(new Set());
  const [hasTmdbKey, setHasTmdbKey] = useState<boolean>(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Check TMDB key status and load existing library on open
  useEffect(() => {
    if (isOpen) {
      getTmdbApiKey().then(key => setHasTmdbKey(!!key));
      getAllMedia().then(items => setExistingItems(items));
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery('');
      setResults([]);
    }
  }, [isOpen]);

  // Handle Escape key to exit search mode
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Debounced search with asynchronous streaming
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setIsSearching(false);
      setIsSearchingBooks(false);
      return;
    }

    setIsSearching(true);
    if (searchTypeTab === 'all' || searchTypeTab === 'book') {
      setIsSearchingBooks(true);
    } else {
      setIsSearchingBooks(false);
    }

    const timeoutId = setTimeout(async () => {
      try {
        const res = await searchMedia(query, {
          typeFilter: searchTypeTab,
          onPartialResults: (partial) => {
            // Instant video results arrived — display immediately!
            setResults(partial);
            setIsSearching(false);
          }
        });
        setResults(res);
      } catch (err) {
        console.error('Search error:', err);
      } finally {
        setIsSearching(false);
        setIsSearchingBooks(false);
      }
    }, 350);

    return () => clearTimeout(timeoutId);
  }, [query, searchTypeTab]);

  // Add item to library
  const handleAddMedia = async (item: MediaSearchResult, initialStatus: MediaStatus = 'plan_to_watch') => {
    setAddingId(item.externalId);
    try {
      // Fetch full metadata including all seasons and episodes with titles
      const { status: _rawStatus, ...mediaDetailsInput } = item;
      const fullData = await fetchFullMediaDetails(mediaDetailsInput);
      
      let episodesToSave = fullData.episodes || [];
      let finalStatus: MediaStatus = initialStatus;
      let currentSeason = fullData.media.currentSeason || 1;
      let currentEpisode = fullData.media.currentEpisode || 0;

      if (initialStatus === 'completed') {
        if (fullData.media.type === 'tv' && episodesToSave.length > 0) {
          const now = new Date().toISOString();
          const networkTz = fullData.media.networkTimezone || 'America/New_York';

          // Mark all currently aired episodes as watched
          episodesToSave = episodesToSave.map(ep => {
            const aired = isEpisodeAired(ep, networkTz);
            return {
              ...ep,
              isWatched: (aired ? 1 : 0) as WatchedStatus,
              watchedAt: aired ? now : null
            };
          });

          // Calculate current pointer from the latest aired episode
          const airedEpisodes = episodesToSave.filter(e => isEpisodeAired(e, networkTz));
          const sortedAired = airedEpisodes.slice().sort((a, b) => b.seasonNumber - a.seasonNumber || b.episodeNumber - a.episodeNumber);
          if (sortedAired.length > 0) {
            currentSeason = sortedAired[0].seasonNumber;
            currentEpisode = sortedAired[0].episodeNumber;
          }

          // Smart status: 'completed' if ended, 'caught_up' if ongoing/returning with future un-aired episodes
          finalStatus = computeAutoStatus('watching', episodesToSave, fullData.media.airStatus, 'tv', networkTz);
        } else {
          finalStatus = 'completed';
        }
      }

      const mediaToSave: Partial<MediaItem> = {
        ...fullData.media,
        status: finalStatus,
        currentSeason,
        currentEpisode
      };

      const savedMedia = await saveMediaItem(mediaToSave, episodesToSave);
      setAddedIds(prev => new Set(prev).add(item.externalId));
      setExistingItems(prev => [...prev.filter(x => x.id !== savedMedia.id), savedMedia]);
      if (onItemAdded) onItemAdded(savedMedia);
    } catch (err) {
      console.error('Failed to add media:', err);
      alert('Failed to retrieve full series details. Please check your connection.');
    } finally {
      setAddingId(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-start justify-center pt-10 sm:pt-20 px-3 bg-black/65 backdrop-blur-md overflow-y-auto animate-fadeIn"
    >
      <div className="relative w-full max-w-2xl bg-[var(--card-bg)] border border-[var(--border-light)] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        
        {/* Search Header */}
        <div className="p-4 border-b border-[var(--border-light)] bg-[var(--bg-primary)] flex items-center gap-3">
          <Search className="w-5 h-5 text-[var(--accent)] shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a movie or TV show name (e.g. Breaking Bad, Dune)..."
            className="flex-1 bg-transparent text-sm sm:text-base text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="p-1 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="flex items-center justify-center px-2 py-1 rounded-lg bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all text-xs font-mono border border-[var(--border-light)] cursor-pointer select-none"
            title="Press ESC to exit"
          >
            <kbd className="text-[10px] font-semibold tracking-wider uppercase">ESC</kbd>
          </button>
        </div>

        {/* Provider Indicator Banner */}
        <div className="px-4 py-2 bg-[var(--bg-secondary)] border-b border-[var(--border-light)] flex items-center justify-between text-xs text-[var(--text-secondary)]">
          <div className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${hasTmdbKey ? 'bg-emerald-400' : 'bg-amber-400'}`} />
            <span>
              {hasTmdbKey
                ? 'TMDB (Movies/TV) & Open Library (Books) Active'
                : 'TVMaze, iTunes & Open Library (Books) Active'}
            </span>
          </div>

          {!hasTmdbKey && (
            <button
              type="button"
              onClick={() => {
                onClose();
                if (onOpenSettings) onOpenSettings();
              }}
              className="text-[var(--accent)] hover:brightness-110 font-semibold flex items-center gap-1 hover:underline"
            >
              <Key className="w-3 h-3" />
              <span>Add TMDB Key</span>
            </button>
          )}
        </div>

        {/* Media Type Tabs */}
        <div className="px-4 py-2 bg-[var(--bg-primary)] border-b border-[var(--border-light)] flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5">
            {[
              { key: 'all', label: 'All Types' },
              { key: 'tv', label: 'TV Series' },
              { key: 'movie', label: 'Movies' },
              { key: 'book', label: 'Books' }
            ].map(tab => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setSearchTypeTab(tab.key as 'all' | 'tv' | 'movie' | 'book')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                  searchTypeTab === tab.key
                    ? 'bg-[var(--accent)] text-white shadow-sm'
                    : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-light)]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {isSearchingBooks && (
            <div className="flex items-center gap-1.5 text-[11px] text-[var(--accent)] font-medium">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>Fetching books...</span>
            </div>
          )}
        </div>

        {/* Search Results List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
          {isSearching && results.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-[var(--text-secondary)] gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-[var(--accent)]" />
              <span className="text-xs">Searching for titles...</span>
            </div>
          )}

          {!isSearching && !isSearchingBooks && results.length === 0 && query.trim().length > 0 && (
            <div className="text-center py-12 text-[var(--text-secondary)] text-sm">
              No results found for "{query}". You can also click "+ Add Custom" on the navbar to add it manually.
            </div>
          )}

          {results.length === 0 && query.trim().length === 0 && (
            <div className="text-center py-12 text-[var(--text-secondary)] text-xs">
              Search by title to pull in movies, TV shows, and books with metadata automatically.
            </div>
          )}

          {results.map(item => {
            const isTv = item.type === 'tv';
            const isBook = item.type === 'book';
            const isAdding = addingId === item.externalId;
            const existingMatch = existingItems.find(libItem => isMediaMatch(item, libItem));

            return (
              <div
                key={`${item.source}_${item.externalId}`}
                className="flex items-center gap-3.5 p-3 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-light)] hover:border-[var(--accent)] transition-all group"
              >
                {/* Poster Thumbnail */}
                <div className="w-12 sm:w-14 aspect-[2/3] rounded-lg overflow-hidden bg-[var(--card-bg)] shrink-0 border border-[var(--border-light)]">
                  {item.posterUrl ? (
                    <img src={item.posterUrl} alt={item.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[var(--text-secondary)]">
                      {isBook ? <BookOpen className="w-5 h-5" /> : isTv ? <Tv className="w-5 h-5" /> : <Film className="w-5 h-5" />}
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                    <span className="font-bold text-sm text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors truncate">
                      {item.title}
                    </span>
                    <span className="text-xs text-[var(--text-secondary)] font-mono">
                      ({item.year || 'N/A'})
                    </span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded font-semibold bg-[var(--bg-tertiary)] text-[var(--text-secondary)]">
                      {isBook ? 'Book' : isTv ? 'TV' : 'Movie'}
                    </span>
                    {item.communityRating && (
                      <span className="flex items-center gap-1 px-1.5 py-0.2 rounded bg-[var(--bg-secondary)] border border-[var(--border-light)] text-[10px] font-bold text-[#ffd60a]" title={`Community Rating: ${item.communityRating} / 10${item.communityRatingCount ? ` (${item.communityRatingCount.toLocaleString()} votes)` : ''}`}>
                        <Star className="w-2.5 h-2.5 fill-[#ffd60a] text-[#ffd60a]" />
                        <span>{item.communityRating}</span>
                      </span>
                    )}
                  </div>

                  {item.overview && (
                    <p className="text-xs text-[var(--text-secondary)] line-clamp-2 leading-relaxed">
                      {item.overview}
                    </p>
                  )}
                </div>

                {/* Add Actions or In Library Button */}
                <div className="flex items-center gap-2 shrink-0">
                  {existingMatch ? (
                    <button
                      type="button"
                      onClick={async () => {
                        if (item.source === 'tmdb' && !existingMatch.tmdbId) {
                          await db.media.update(existingMatch.id, {
                            tmdbId: item.externalId,
                            ...(item.imdbId && !existingMatch.imdbId ? { imdbId: item.imdbId } : {}),
                            updatedAt: new Date().toISOString()
                          }).catch(() => {});
                          existingMatch.tmdbId = item.externalId;
                          if (item.imdbId && !existingMatch.imdbId) existingMatch.imdbId = item.imdbId;
                        }
                        if (onSelectExisting) onSelectExisting(existingMatch);
                        onClose();
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-950/80 hover:bg-emerald-900 text-emerald-400 hover:text-emerald-300 border border-emerald-800/60 text-xs font-bold transition-all active:scale-95 shadow-sm"
                      title="Already in library - click to open details"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>In Library</span>
                    </button>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleAddMedia(item, 'watching')}
                        disabled={isAdding}
                        className="px-2.5 py-1.5 rounded-lg bg-[var(--accent)] hover:brightness-110 text-white text-xs font-semibold transition-all active:scale-95 disabled:opacity-50 flex items-center gap-1 shadow-sm"
                        title={isBook ? "Add as Currently Reading" : "Add directly to Watching"}
                      >
                        {isAdding ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Plus className="w-3.5 h-3.5" />
                        )}
                        <span className="hidden sm:inline">{isBook ? 'Reading' : 'Watching'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleAddMedia(item, 'plan_to_watch')}
                        disabled={isAdding}
                        className="px-2.5 py-1.5 rounded-lg bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] text-xs font-medium border border-[var(--border-light)] transition-all active:scale-95 disabled:opacity-50"
                        title={isBook ? "Add to Want to Read" : "Add to Plan to Watch"}
                      >
                        <span className="hidden sm:inline">{isBook ? 'Want to Read' : 'Watchlist'}</span>
                        <span className="sm:hidden">+</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleAddMedia(item, 'completed')}
                        disabled={isAdding}
                        className="px-2.5 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600 text-emerald-400 hover:text-white border border-emerald-500/40 text-xs font-semibold transition-all active:scale-95 disabled:opacity-50 flex items-center gap-1 shadow-sm"
                        title={isBook ? "Add as Read" : "Add as Watched (Completed if ended, Caught Up if ongoing)"}
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">{isBook ? 'Read' : 'Watched'}</span>
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
