import React, { useState, useEffect } from 'react';
import {
  X,
  Search,
  Film,
  Layers,
  Sparkles,
  Plus,
  Loader2
} from 'lucide-react';
import { searchMedia, searchTMDBCollections, fetchTMDBCollection, collectionToCanvasGraph } from '../../services/api';
import type {
  MediaItem,
  MediaSearchResult,
  TMDBCollectionSearchResult,
  TMDBCollectionDetail,
  CanvasNode,
  CanvasEdge
} from '../../types';

export interface CanvasQuickAddModalProps {
  isOpen: boolean;
  onClose: () => void;
  libraryItems: MediaItem[];
  onAddMediaNode: (item: Partial<MediaItem>, options?: { source?: string; externalId?: string | number }) => void;
  onImportCollection: (nodes: CanvasNode[], edges: CanvasEdge[]) => void;
  onAddGroupNode: (label: string, description: string, color: string) => void;
}

type TabType = 'library' | 'search' | 'collection' | 'group';

export const CanvasQuickAddModal: React.FC<CanvasQuickAddModalProps> = ({
  isOpen,
  onClose,
  libraryItems,
  onAddMediaNode,
  onImportCollection,
  onAddGroupNode
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('collection');

  // Tab 1: Library Filter
  const [libraryFilter, setLibraryFilter] = useState('');

  // Tab 2: Provider Search
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<MediaSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Tab 3: TMDB Franchise / Collections
  const [collectionQuery, setCollectionQuery] = useState('');
  const [collectionResults, setCollectionResults] = useState<TMDBCollectionSearchResult[]>([]);
  const [isSearchingCollections, setIsSearchingCollections] = useState(false);
  const [selectedCollection, setSelectedCollection] = useState<TMDBCollectionDetail | null>(null);
  const [_isLoadingCollectionDetail, setIsLoadingCollectionDetail] = useState(false);

  // Tab 4: Group Phase
  const [groupLabel, setGroupLabel] = useState('');
  const [groupDesc, setGroupDesc] = useState('');
  const [groupColor, setGroupColor] = useState('#6366f1');

  // Search Debounce for Provider Search
  useEffect(() => {
    if (!isOpen || activeTab !== 'search' || !searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const results = await searchMedia(searchQuery.trim());
        setSearchResults(results);
      } catch (err) {
        console.error(err);
      } finally {
        setIsSearching(false);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [isOpen, searchQuery, activeTab]);

  // Search Debounce for TMDB Collections
  useEffect(() => {
    if (!isOpen || activeTab !== 'collection' || !collectionQuery.trim()) {
      setCollectionResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setIsSearchingCollections(true);
      try {
        const results = await searchTMDBCollections(collectionQuery.trim());
        setCollectionResults(results);
      } catch (err) {
        console.error(err);
      } finally {
        setIsSearchingCollections(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [isOpen, collectionQuery, activeTab]);

  if (!isOpen) return null;

  const handleSelectCollection = async (col: TMDBCollectionSearchResult) => {
    setIsLoadingCollectionDetail(true);
    try {
      const detail = await fetchTMDBCollection(col.id);
      setSelectedCollection(detail);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoadingCollectionDetail(false);
    }
  };

  const handleConfirmImportCollection = () => {
    if (!selectedCollection) return;
    const { nodes, edges } = collectionToCanvasGraph(selectedCollection, libraryItems);
    onImportCollection(nodes, edges);
    onClose();
  };

  const filteredLibrary = libraryItems.filter(item =>
    (item.title || '').toLowerCase().includes(libraryFilter.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="w-full max-w-2xl bg-[var(--bg-secondary)] border border-[var(--border-light)] rounded-3xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-[var(--border-light)]">
          <div>
            <h2 className="text-lg font-bold text-[var(--text-primary)]">Add to Franchise Canvas</h2>
            <p className="text-xs text-[var(--text-secondary)]">Import collections, add media items, or define eras</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-[var(--border-light)] px-5 gap-2 bg-[var(--bg-primary)]/50 pt-2">
          <button
            type="button"
            onClick={() => setActiveTab('collection')}
            className={`flex items-center gap-2 px-3.5 py-2.5 text-xs font-bold border-b-2 transition-all ${
              activeTab === 'collection'
                ? 'border-[var(--accent)] text-[var(--accent)]'
                : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span>TMDB Movie Series / Franchise</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('library')}
            className={`flex items-center gap-2 px-3.5 py-2.5 text-xs font-bold border-b-2 transition-all ${
              activeTab === 'library'
                ? 'border-[var(--accent)] text-[var(--accent)]'
                : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Film className="w-4 h-4" />
            <span>From Library ({libraryItems.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('search')}
            className={`flex items-center gap-2 px-3.5 py-2.5 text-xs font-bold border-b-2 transition-all ${
              activeTab === 'search'
                ? 'border-[var(--accent)] text-[var(--accent)]'
                : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Search className="w-4 h-4" />
            <span>Search TMDB / TVMaze</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('group')}
            className={`flex items-center gap-2 px-3.5 py-2.5 text-xs font-bold border-b-2 transition-all ${
              activeTab === 'group'
                ? 'border-[var(--accent)] text-[var(--accent)]'
                : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Era / Phase Group</span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {/* TAB 1: TMDB Movie Series / Franchise Import */}
          {activeTab === 'collection' && (
            <div>
              {selectedCollection ? (
                <div>
                  <div className="flex items-center justify-between pb-3 mb-4 border-b border-[var(--border-light)]">
                    <div>
                      <h3 className="text-base font-bold text-[var(--text-primary)]">
                        {selectedCollection.name}
                      </h3>
                      <p className="text-xs text-[var(--text-secondary)]">
                        {selectedCollection.parts.length} movies found • Ready to generate timeline graph
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedCollection(null)}
                      className="text-xs text-[var(--accent)] hover:underline"
                    >
                      ← Back to search
                    </button>
                  </div>

                  {selectedCollection.overview && (
                    <p className="text-xs text-[var(--text-secondary)] mb-4 italic line-clamp-2">
                      &quot;{selectedCollection.overview}&quot;
                    </p>
                  )}

                  <div className="space-y-2 mb-6 max-h-60 overflow-y-auto pr-1">
                    {selectedCollection.parts.map((part, idx) => (
                      <div
                        key={part.id}
                        className="flex items-center gap-3 p-2.5 rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border-light)] text-xs"
                      >
                        <span className="w-5 h-5 rounded-full bg-[var(--accent)]/15 text-[var(--accent)] flex items-center justify-center font-bold text-[10px] shrink-0">
                          {idx + 1}
                        </span>
                        <div className="w-10 h-14 rounded bg-[var(--bg-primary)] overflow-hidden shrink-0">
                          {part.poster_path ? (
                            <img src={part.poster_path} alt={part.title} className="w-full h-full object-cover" />
                          ) : (
                            <Film className="w-4 h-4 m-auto text-[var(--text-tertiary)]" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-bold text-[var(--text-primary)] truncate">{part.title}</h4>
                          <span className="text-[11px] text-[var(--text-secondary)]">
                            {part.release_date || 'Unknown Date'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => setSelectedCollection(null)}
                      className="px-4 py-2 rounded-xl bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] text-xs font-semibold text-[var(--text-primary)]"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirmImportCollection}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--accent)] hover:brightness-110 text-white text-xs font-bold shadow-lg shadow-[var(--accent)]/30 transition-all active:scale-95"
                    >
                      <Sparkles className="w-4 h-4" />
                      <span>Import {selectedCollection.parts.length} Movies & Connect Timeline</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="relative mb-4">
                    <Search className="w-4 h-4 absolute left-3.5 top-3 text-[var(--text-secondary)]" />
                    <input
                      type="text"
                      value={collectionQuery}
                      onChange={(e) => setCollectionQuery(e.target.value)}
                      placeholder="Search movie series (e.g. Star Wars, Harry Potter, Avengers, Batman)..."
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[var(--input-bg)] border border-[var(--input-border)] focus:border-[var(--accent)] focus:outline-none text-xs text-[var(--text-primary)] transition-all"
                    />
                    {isSearchingCollections && (
                      <Loader2 className="w-4 h-4 absolute right-3.5 top-3 text-[var(--accent)] animate-spin" />
                    )}
                  </div>

                  {collectionResults.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-72 overflow-y-auto pr-1">
                      {collectionResults.map((col) => (
                        <div
                          key={col.id}
                          onClick={() => handleSelectCollection(col)}
                          className="flex items-center gap-3 p-3 rounded-2xl bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] border border-[var(--border-light)] hover:border-[var(--accent)] transition-all cursor-pointer group"
                        >
                          <div className="w-12 h-16 rounded-xl bg-[var(--bg-primary)] overflow-hidden shrink-0 border border-[var(--border-light)]">
                            {col.poster_path ? (
                              <img src={col.poster_path} alt={col.name} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-[var(--text-tertiary)]">
                                <Sparkles className="w-5 h-5" />
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="text-xs font-bold text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors truncate">
                              {col.name}
                            </h4>
                            <p className="text-[10px] text-[var(--text-secondary)] line-clamp-2 mt-1">
                              {col.overview || 'TMDB Movie Franchise Collection'}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : collectionQuery.trim() ? (
                    <div className="py-12 text-center text-xs text-[var(--text-secondary)]">
                      {isSearchingCollections ? 'Searching collections...' : 'No collections found. Ensure a TMDB API key is configured.'}
                    </div>
                  ) : (
                    <div className="py-10 text-center">
                      <Sparkles className="w-8 h-8 text-[var(--accent)] mx-auto mb-2 opacity-50" />
                      <p className="text-xs text-[var(--text-secondary)] max-w-sm mx-auto">
                        Search TMDB official collections to instantly generate an interconnected sequence of movies on your canvas.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: From Library */}
          {activeTab === 'library' && (
            <div>
              <div className="relative mb-4">
                <Search className="w-4 h-4 absolute left-3.5 top-3 text-[var(--text-secondary)]" />
                <input
                  type="text"
                  value={libraryFilter}
                  onChange={(e) => setLibraryFilter(e.target.value)}
                  placeholder="Filter your watch library..."
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[var(--input-bg)] border border-[var(--input-border)] focus:border-[var(--accent)] focus:outline-none text-xs text-[var(--text-primary)] transition-all"
                />
              </div>

              {filteredLibrary.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-72 overflow-y-auto pr-1">
                  {filteredLibrary.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border-light)] text-xs"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-9 h-12 rounded bg-[var(--bg-primary)] overflow-hidden shrink-0">
                          {item.posterUrl ? (
                            <img src={item.posterUrl} alt={item.title} className="w-full h-full object-cover" />
                          ) : (
                            <Film className="w-4 h-4 m-auto text-[var(--text-tertiary)]" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <h4 className="font-bold text-[var(--text-primary)] truncate text-xs">{item.title}</h4>
                          <span className="text-[10px] text-[var(--text-secondary)] uppercase">
                            {item.type} • {item.year || 'N/A'}
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          onAddMediaNode(item);
                          onClose();
                        }}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[var(--accent)] hover:brightness-110 text-white font-semibold text-[11px] shrink-0 transition-all active:scale-95 shadow-xs"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add</span>
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-12 text-center text-xs text-[var(--text-secondary)]">
                  No matching media items found in library.
                </div>
              )}
            </div>
          )}

          {/* TAB 3: Provider Search */}
          {activeTab === 'search' && (
            <div>
              <div className="relative mb-4">
                <Search className="w-4 h-4 absolute left-3.5 top-3 text-[var(--text-secondary)]" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search TMDB, TVMaze or Open Library..."
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[var(--input-bg)] border border-[var(--input-border)] focus:border-[var(--accent)] focus:outline-none text-xs text-[var(--text-primary)] transition-all"
                />
                {isSearching && (
                  <Loader2 className="w-4 h-4 absolute right-3.5 top-3 text-[var(--accent)] animate-spin" />
                )}
              </div>

              {searchResults.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-72 overflow-y-auto pr-1">
                  {searchResults.map((res) => (
                    <div
                      key={`${res.source}_${res.externalId}`}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border-light)] text-xs"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-9 h-12 rounded bg-[var(--bg-primary)] overflow-hidden shrink-0">
                          {res.posterUrl ? (
                            <img src={res.posterUrl} alt={res.title} className="w-full h-full object-cover" />
                          ) : (
                            <Film className="w-4 h-4 m-auto text-[var(--text-tertiary)]" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <h4 className="font-bold text-[var(--text-primary)] truncate text-xs">{res.title}</h4>
                          <span className="text-[10px] text-[var(--text-secondary)] uppercase">
                            {res.type} • {res.year || 'N/A'}
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          onAddMediaNode(
                            {
                              title: res.title,
                              year: res.year,
                              releaseDate: res.releaseDate,
                              type: res.type,
                              posterUrl: res.posterUrl,
                              backdropUrl: res.backdropUrl,
                              overview: res.overview,
                              communityRating: res.communityRating,
                              source: res.source,
                              externalId: res.externalId
                            },
                            { source: res.source, externalId: res.externalId }
                          );
                          onClose();
                        }}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[var(--accent)] hover:brightness-110 text-white font-semibold text-[11px] shrink-0 transition-all active:scale-95 shadow-xs"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add</span>
                      </button>
                    </div>
                  ))}
                </div>
              ) : searchQuery.trim() ? (
                <div className="py-12 text-center text-xs text-[var(--text-secondary)]">
                  {isSearching ? 'Searching...' : 'No results found.'}
                </div>
              ) : (
                <div className="py-10 text-center text-xs text-[var(--text-secondary)]">
                  Search any movie, show, or book to drop it directly onto the franchise canvas.
                </div>
              )}
            </div>
          )}

          {/* TAB 4: Era / Phase Group */}
          {activeTab === 'group' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-1.5">
                  Era / Phase Title
                </label>
                <input
                  type="text"
                  value={groupLabel}
                  onChange={(e) => setGroupLabel(e.target.value)}
                  placeholder="e.g. Phase 1: Avengers Assembled, Original Trilogy, Pre-War Era"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--input-bg)] border border-[var(--input-border)] focus:border-[var(--accent)] focus:outline-none text-xs text-[var(--text-primary)] transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-1.5">
                  Description / Subtitle (Optional)
                </label>
                <input
                  type="text"
                  value={groupDesc}
                  onChange={(e) => setGroupDesc(e.target.value)}
                  placeholder="e.g. Release years 2008-2012, The Sacred Timeline"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--input-bg)] border border-[var(--input-border)] focus:border-[var(--accent)] focus:outline-none text-xs text-[var(--text-primary)] transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2">
                  Accent Color
                </label>
                <div className="flex items-center gap-3">
                  {['#6366f1', '#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#ef4444'].map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setGroupColor(color)}
                      style={{ backgroundColor: color }}
                      className={`w-7 h-7 rounded-full transition-transform ${
                        groupColor === color ? 'scale-125 ring-2 ring-white' : 'hover:scale-110'
                      }`}
                    />
                  ))}
                </div>
              </div>

              <div className="pt-4 flex justify-end">
                <button
                  type="button"
                  disabled={!groupLabel.trim()}
                  onClick={() => {
                    onAddGroupNode(groupLabel.trim(), groupDesc.trim(), groupColor);
                    onClose();
                  }}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--accent)] hover:brightness-110 disabled:opacity-50 text-white text-xs font-bold shadow-lg shadow-[var(--accent)]/30 transition-all active:scale-95"
                >
                  <Plus className="w-4 h-4" />
                  <span>Create Phase Box</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
