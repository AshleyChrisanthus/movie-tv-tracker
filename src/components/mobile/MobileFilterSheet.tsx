import React, { useMemo } from 'react';
import { X, SlidersHorizontal, ArrowDownAZ, LayoutGrid, List, Pin, Calendar, Folder, Plus, BookOpen, Headphones, Check } from 'lucide-react';
import type { CustomList, ViewMode, GridDensity, UpcomingFilter, BookFormatFilter, MediaItem } from '../../types';

export interface MobileFilterSheetProps {
  isOpen: boolean;
  onClose: () => void;
  sortBy: string;
  onSortChange: (sort: string) => void;
  listFilter?: string;
  onListChange?: (listName: string) => void;
  customLists?: CustomList[];
  onOpenListManager?: () => void;
  viewMode?: ViewMode;
  onViewModeChange?: (mode: ViewMode) => void;
  gridDensity?: GridDensity;
  onGridDensityChange?: (density: GridDensity) => void;
  showPinnedView?: boolean;
  onTogglePinnedView?: () => void;
  pinnedCount?: number;
  upcomingFilter?: UpcomingFilter;
  onUpcomingFilterChange?: (filter: UpcomingFilter) => void;
  upcomingDays?: number;
  onUpcomingDaysChange?: (days: number) => void;
  typeFilter?: string;
  bookFormatFilter?: BookFormatFilter;
  onBookFormatChange?: (format: BookFormatFilter) => void;
  items?: MediaItem[];
}

export default function MobileFilterSheet({
  isOpen,
  onClose,
  sortBy,
  onSortChange,
  listFilter = 'all',
  onListChange,
  customLists = [],
  onOpenListManager,
  viewMode = 'grid',
  onViewModeChange,
  gridDensity = 'comfortable',
  onGridDensityChange,
  showPinnedView = true,
  onTogglePinnedView,
  pinnedCount = 0,
  upcomingFilter = 'show_all',
  onUpcomingFilterChange,
  upcomingDays = 7,
  onUpcomingDaysChange,
  typeFilter = 'all',
  bookFormatFilter = 'all',
  onBookFormatChange,
  items = []
}: MobileFilterSheetProps): React.JSX.Element | null {
  if (!isOpen) return null;

  // Custom lists item count map
  const listCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const cl of customLists) {
      counts[cl.name] = 0;
    }
    for (const item of items) {
      if (item.lists && Array.isArray(item.lists)) {
        for (const lName of item.lists) {
          counts[lName] = (counts[lName] || 0) + 1;
        }
      }
    }
    return counts;
  }, [items, customLists]);

  const totalLibraryCount = items.length;

  const sortOptions = [
    {
      key: 'updated',
      label: 'Recently Updated',
      isActive: sortBy === 'updated' || !sortBy
    },
    {
      key: 'title',
      label: 'Title (A–Z)',
      isActive: sortBy === 'title'
    },
    {
      key: 'my_rating',
      label: 'My Rating',
      isActive: sortBy === 'my_rating'
    },
    {
      key: 'rating',
      label: 'Community Rating',
      isActive: sortBy === 'rating' || sortBy === 'community_rating'
    },
    {
      key: 'release',
      label: 'Release Date',
      isActive: sortBy === 'release' || sortBy === 'release_desc' || sortBy === 'release_asc'
    },
    {
      key: 'last_aired',
      label: 'Last Aired',
      isActive: sortBy === 'last_aired' || sortBy === 'last_aired_desc' || sortBy === 'last_aired_asc'
    },
  ];

  return (
    <div className="fixed inset-0 z-50 md:hidden flex flex-col justify-end">
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/65 backdrop-blur-sm transition-opacity animate-fadeIn"
      />

      {/* Sheet Surface */}
      <div className="relative z-10 w-full max-h-[85vh] overflow-y-auto bg-[var(--card-bg)] border-t border-[var(--border-light)] rounded-t-3xl shadow-2xl p-4 flex flex-col gap-4 animate-slideUp">
        {/* Drag Handle Pill */}
        <div className="w-10 h-1.5 rounded-full bg-white/20 mx-auto -mt-1 mb-1" />

        {/* Header */}
        <div className="flex items-center justify-between pb-2 border-b border-[var(--border-light)]">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-[var(--accent)]" />
            <span className="font-bold text-sm text-[var(--text-primary)]">
              Filters, Lists & View Options
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 1. Custom Lists / Folders Section (Issue #52 & App-Directory #71) */}
        {onListChange && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">
                <Folder className="w-3.5 h-3.5 text-[var(--accent)]" />
                <span>Custom Lists & Folders</span>
              </div>
              {onOpenListManager && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenListManager();
                  }}
                  className="flex items-center gap-1 text-xs text-[var(--accent)] hover:brightness-110 font-bold active:scale-95 transition-all cursor-pointer"
                >
                  <Plus className="w-3 h-3" />
                  <span>Manage / New List</span>
                </button>
              )}
            </div>

            <div className="flex flex-wrap gap-1.5">
              {/* All Library Pill */}
              <button
                type="button"
                onClick={() => onListChange('all')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all active:scale-95 cursor-pointer ${
                  listFilter === 'all'
                    ? 'bg-[var(--accent)] text-white shadow-sm'
                    : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] border border-[var(--border-light)]'
                }`}
              >
                <span>All Library</span>
                <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${
                  listFilter === 'all' ? 'bg-white/20 text-white' : 'bg-[var(--bg-tertiary)] text-[var(--text-tertiary)]'
                }`}>
                  {totalLibraryCount}
                </span>
              </button>

              {/* User Custom Lists */}
              {customLists.map((cl) => {
                const count = listCounts[cl.name] || 0;
                const isSelected = listFilter === cl.name;

                return (
                  <button
                    key={cl.id}
                    type="button"
                    onClick={() => onListChange(cl.name)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all active:scale-95 cursor-pointer ${
                      isSelected
                        ? 'bg-[var(--accent)] text-white shadow-sm'
                        : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] border border-[var(--border-light)]'
                    }`}
                  >
                    <span>📁 {cl.name}</span>
                    <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${
                      isSelected ? 'bg-white/20 text-white' : 'bg-[var(--bg-tertiary)] text-[var(--text-tertiary)]'
                    }`}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* 2. Sort By Selector (Touch-friendly radio pills) */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">
            <ArrowDownAZ className="w-3.5 h-3.5 text-[var(--accent)]" />
            <span>Sort By</span>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {sortOptions.map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => onSortChange(opt.key)}
                className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all active:scale-95 cursor-pointer ${
                  opt.isActive
                    ? 'bg-[var(--accent)] text-white shadow-sm'
                    : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] border border-[var(--border-light)] hover:text-[var(--text-primary)]'
                }`}
              >
                <span>{opt.label}</span>
                {opt.isActive && <Check className="w-3.5 h-3.5 text-white" />}
              </button>
            ))}
          </div>
        </div>

        {/* 3. Book Format Sub-Filter (when Books is active) */}
        {typeFilter === 'book' && onBookFormatChange && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">
              <BookOpen className="w-3.5 h-3.5 text-[var(--accent)]" />
              <span>Book Format Sub-Filter</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => onBookFormatChange('all')}
                className={`py-2 rounded-xl text-xs font-semibold transition-all text-center cursor-pointer active:scale-95 ${
                  bookFormatFilter === 'all'
                    ? 'bg-[var(--accent)] text-white shadow-sm'
                    : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] border border-[var(--border-light)]'
                }`}
              >
                All Books
              </button>
              <button
                type="button"
                onClick={() => onBookFormatChange('reading')}
                className={`py-2 rounded-xl text-xs font-semibold transition-all text-center cursor-pointer active:scale-95 ${
                  bookFormatFilter === 'reading'
                    ? 'bg-[var(--accent)] text-white shadow-sm'
                    : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] border border-[var(--border-light)]'
                }`}
              >
                📖 Reading
              </button>
              <button
                type="button"
                onClick={() => onBookFormatChange('audiobook')}
                className={`py-2 rounded-xl text-xs font-semibold transition-all text-center cursor-pointer active:scale-95 ${
                  bookFormatFilter === 'audiobook'
                    ? 'bg-[var(--accent)] text-white shadow-sm'
                    : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] border border-[var(--border-light)]'
                }`}
              >
                🎧 Audiobooks
              </button>
            </div>
          </div>
        )}

        {/* 4. Pinned Section Toggle */}
        {onTogglePinnedView && (
          <div className="flex items-center justify-between p-3 rounded-2xl bg-[var(--bg-secondary)] border border-[var(--border-light)]">
            <div className="flex items-center gap-2">
              <Pin className="w-4 h-4 text-[var(--accent)]" />
              <div>
                <span className="text-xs font-semibold text-[var(--text-primary)] block">
                  Pinned Section
                </span>
                <span className="text-[10px] text-[var(--text-secondary)]">
                  {pinnedCount} pinned card{pinnedCount === 1 ? '' : 's'}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={onTogglePinnedView}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all active:scale-95 cursor-pointer ${
                showPinnedView
                  ? 'bg-[var(--accent)] text-white shadow-sm'
                  : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border border-[var(--border-light)]'
              }`}
            >
              {showPinnedView ? 'Visible' : 'Hidden'}
            </button>
          </div>
        )}

        {/* 5. Layout & Density */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">
            <LayoutGrid className="w-3.5 h-3.5 text-[var(--accent)]" />
            <span>Layout & Density</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex items-center p-1 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)]">
              <button
                type="button"
                onClick={() => onViewModeChange?.('grid')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  viewMode === 'grid'
                    ? 'bg-[var(--accent)] text-white shadow-xs'
                    : 'text-[var(--text-secondary)]'
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span>Grid</span>
              </button>
              <button
                type="button"
                onClick={() => onViewModeChange?.('list')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  viewMode === 'list'
                    ? 'bg-[var(--accent)] text-white shadow-xs'
                    : 'text-[var(--text-secondary)]'
                }`}
              >
                <List className="w-3.5 h-3.5" />
                <span>List</span>
              </button>
            </div>

            <div className="flex items-center p-1 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)]">
              <button
                type="button"
                onClick={() => onGridDensityChange?.('comfortable')}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all text-center ${
                  gridDensity === 'comfortable'
                    ? 'bg-[var(--accent)] text-white shadow-xs'
                    : 'text-[var(--text-secondary)]'
                }`}
              >
                Comfortable
              </button>
              <button
                type="button"
                onClick={() => onGridDensityChange?.('compact')}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all text-center ${
                  gridDensity === 'compact'
                    ? 'bg-[var(--accent)] text-white shadow-xs'
                    : 'text-[var(--text-secondary)]'
                }`}
              >
                Compact
              </button>
            </div>
          </div>
        </div>

        {/* 6. Upcoming Releases Window */}
        {onUpcomingFilterChange && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">
              <Calendar className="w-3.5 h-3.5 text-[var(--accent)]" />
              <span>Upcoming Window</span>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {[
                { label: '7 Days', days: 7, filter: 'next_n_days' as UpcomingFilter },
                { label: '14 Days', days: 14, filter: 'next_n_days' as UpcomingFilter },
                { label: '30 Days', days: 30, filter: 'next_n_days' as UpcomingFilter },
                { label: 'All', days: 0, filter: 'show_all' as UpcomingFilter },
              ].map((opt) => {
                const isActive = opt.filter === 'show_all'
                  ? upcomingFilter === 'show_all'
                  : upcomingFilter === 'next_n_days' && upcomingDays === opt.days;

                return (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={() => {
                      if (opt.days > 0) {
                        onUpcomingDaysChange?.(opt.days);
                      }
                      onUpcomingFilterChange(opt.filter);
                    }}
                    className={`py-2 rounded-xl text-xs font-semibold transition-all text-center cursor-pointer active:scale-95 ${
                      isActive
                        ? 'bg-[var(--accent)] text-white shadow-sm'
                        : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] border border-[var(--border-light)]'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Done / Apply Button */}
        <button
          type="button"
          onClick={onClose}
          className="w-full py-3 rounded-2xl bg-[var(--accent)] hover:brightness-110 text-white font-bold text-sm shadow-lg shadow-[var(--accent)]/30 active:scale-95 transition-all mt-2 cursor-pointer"
        >
          Done
        </button>
      </div>
    </div>
  );
}
