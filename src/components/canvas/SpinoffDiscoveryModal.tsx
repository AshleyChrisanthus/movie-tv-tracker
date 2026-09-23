import React, { useState, useEffect } from 'react';
import {
  X,
  Search,
  Tv,
  Sparkles,
  Plus,
  Loader2,
  ExternalLink
} from 'lucide-react';
import { discoverConnectedTVShows, searchMedia } from '../../services/api';
import type { MediaSearchResult, CanvasNodeData } from '../../types';

export interface SpinoffDiscoveryModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetNode: { id: string; data: CanvasNodeData } | null;
  onAddSpinoff: (sourceNodeId: string, tvShow: MediaSearchResult) => void;
}

export const SpinoffDiscoveryModal: React.FC<SpinoffDiscoveryModalProps> = ({
  isOpen,
  onClose,
  targetNode,
  onAddSpinoff
}) => {
  const [results, setResults] = useState<MediaSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [customQuery, setCustomQuery] = useState('');
  const [addedIds, setAddedIds] = useState<Set<string | number>>(new Set());

  useEffect(() => {
    if (!isOpen || !targetNode) {
      setResults([]);
      setAddedIds(new Set());
      setCustomQuery('');
      return;
    }

    let isMounted = true;
    const fetchSpinoffs = async () => {
      setIsSearching(true);
      try {
        const discovered = await discoverConnectedTVShows({
          franchiseName: targetNode.data.collectionName || targetNode.data.title,
          movieTmdbIds: targetNode.data.externalId ? [targetNode.data.externalId] : [],
          movieTitles: [targetNode.data.title],
          limit: 10
        });
        if (isMounted) {
          setResults(discovered);
        }
      } catch (err) {
        console.error('Failed to discover spinoffs:', err);
      } finally {
        if (isMounted) {
          setIsSearching(false);
        }
      }
    };

    fetchSpinoffs();

    return () => {
      isMounted = false;
    };
  }, [isOpen, targetNode]);

  // Handle custom manual search
  const handleCustomSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customQuery.trim()) return;
    setIsSearching(true);
    try {
      const searchRes = await searchMedia(customQuery.trim());
      // Filter for TV shows
      const tvOnly = searchRes.filter(item => item.type === 'tv');
      setResults(tvOnly.length > 0 ? tvOnly : searchRes);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSearching(false);
    }
  };

  if (!isOpen || !targetNode) return null;

  const handleAdd = (item: MediaSearchResult) => {
    onAddSpinoff(targetNode.id, item);
    setAddedIds(prev => new Set(prev).add(item.externalId || item.tvmazeId || item.tmdbId || item.title));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="w-full max-w-xl bg-[var(--bg-secondary)] border border-[var(--border-light)] rounded-3xl shadow-2xl flex flex-col max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-[var(--border-light)]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/15 text-indigo-400 flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[var(--text-primary)]">
                Find Spinoffs & Connected Shows
              </h2>
              <p className="text-xs text-[var(--text-secondary)]">
                Connecting from: <span className="font-semibold text-[var(--accent)]">{targetNode.data.title}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search input for manual refinement */}
        <div className="p-4 border-b border-[var(--border-light)] bg-[var(--bg-primary)]/40">
          <form onSubmit={handleCustomSearch} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-3 text-[var(--text-secondary)]" />
              <input
                type="text"
                value={customQuery}
                onChange={(e) => setCustomQuery(e.target.value)}
                placeholder={`Search related shows or characters (e.g. ${targetNode.data.title})...`}
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-[var(--input-bg)] border border-[var(--input-border)] focus:border-[var(--accent)] focus:outline-none text-xs text-[var(--text-primary)] transition-all"
              />
            </div>
            <button
              type="submit"
              disabled={!customQuery.trim()}
              className="px-4 py-2 rounded-xl bg-[var(--bg-tertiary)] hover:bg-[var(--accent)] hover:text-white text-xs font-semibold text-[var(--text-secondary)] transition-all disabled:opacity-50"
            >
              Search
            </button>
          </form>
        </div>

        {/* Results List */}
        <div className="flex-1 overflow-y-auto p-5">
          {isSearching ? (
            <div className="py-12 flex flex-col items-center justify-center gap-3 text-xs text-[var(--text-secondary)]">
              <Loader2 className="w-6 h-6 animate-spin text-[var(--accent)]" />
              <span>Scanning TMDB universe tags & TVMaze for connected television series...</span>
            </div>
          ) : results.length > 0 ? (
            <div className="space-y-2.5">
              {results.map((item) => {
                const itemKey = item.externalId || item.tvmazeId || item.tmdbId || item.title;
                const isAdded = addedIds.has(itemKey);

                return (
                  <div
                    key={String(itemKey)}
                    className="flex items-center justify-between p-3 rounded-2xl bg-[var(--bg-tertiary)] border border-[var(--border-light)] text-xs gap-3 group hover:border-[var(--accent)]/50 transition-all"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="w-10 h-14 rounded-lg bg-[var(--bg-primary)] overflow-hidden shrink-0 border border-[var(--border-light)]">
                        {item.posterUrl ? (
                          <img src={item.posterUrl} alt={item.title} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-[var(--text-tertiary)]">
                            <Tv className="w-4 h-4" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-[var(--text-primary)] truncate text-xs">
                            {item.title}
                          </h4>
                          {item.isDirectSpinoff ? (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shrink-0">
                              Canon Spinoff
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-indigo-500/15 text-indigo-400 shrink-0">
                              {item.type === 'tv' ? 'Spinoff Series' : item.type}
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-[var(--text-secondary)] block">
                          {item.year || item.releaseDate || 'N/A'}
                        </span>
                        {item.overview && (
                          <p className="text-[10px] text-[var(--text-tertiary)] line-clamp-2 mt-1">
                            {item.overview}
                          </p>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={isAdded}
                      onClick={() => handleAdd(item)}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold shrink-0 transition-all active:scale-95 shadow-xs ${
                        isAdded
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 cursor-default'
                          : 'bg-[var(--accent)] hover:brightness-110 text-white'
                      }`}
                    >
                      {isAdded ? (
                        <span>Added ✓</span>
                      ) : (
                        <>
                          <Plus className="w-3.5 h-3.5" />
                          <span>Link Spinoff</span>
                        </>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-12 text-center text-xs text-[var(--text-secondary)]">
              No connected TV series or spinoffs automatically found for &quot;{targetNode.data.title}&quot;.
              Try searching with a specific keyword above.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[var(--border-light)] flex justify-end bg-[var(--bg-primary)]/30">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] text-xs font-semibold text-[var(--text-primary)]"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
