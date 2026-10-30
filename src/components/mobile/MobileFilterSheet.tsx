import React from 'react';
import { X, SlidersHorizontal, ArrowDownAZ, LayoutGrid, List, Pin, Calendar, Folder } from 'lucide-react';
import type { CustomList, ViewMode, GridDensity, UpcomingFilter } from '../../types';

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
  upcomingFilter?: UpcomingFilter;
  onUpcomingFilterChange?: (filter: UpcomingFilter) => void;
  upcomingDays?: number;
  onUpcomingDaysChange?: (days: number) => void;
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
  upcomingFilter = 'show_all',
  onUpcomingFilterChange,
  upcomingDays = 7,
  onUpcomingDaysChange
}: MobileFilterSheetProps): React.JSX.Element | null {
  if (!isOpen) return null;

  const sortOptions = [
    { key: 'updated', label: 'Recently Updated' },
    { key: 'title', label: 'Title (A-Z)' },
    { key: 'release', label: 'Release Date' },
    { key: 'rating', label: 'Community Rating' },
    { key: 'my_rating', label: 'My Personal Rating' },
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
              Filters & View Options
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 1. Sort By */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">
            <ArrowDownAZ className="w-3.5 h-3.5 text-[var(--accent)]" />
            <span>Sort Order</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {sortOptions.map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => onSortChange(opt.key)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  sortBy === opt.key
                    ? 'bg-[var(--accent)] text-white shadow-sm'
                    : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] border border-[var(--border-light)]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* 2. View Mode & Density */}
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

        {/* 3. Pinned Section Toggle */}
        {onTogglePinnedView && (
          <div className="flex items-center justify-between p-3 rounded-2xl bg-[var(--bg-secondary)] border border-[var(--border-light)]">
            <div className="flex items-center gap-2">
              <Pin className="w-4 h-4 text-[var(--accent)]" />
              <span className="text-xs font-semibold text-[var(--text-primary)]">
                Pinned Cards Section
              </span>
            </div>
            <button
              type="button"
              onClick={onTogglePinnedView}
              className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                showPinnedView
                  ? 'bg-[var(--accent)] text-white'
                  : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border border-[var(--border-light)]'
              }`}
            >
              {showPinnedView ? 'Visible' : 'Hidden'}
            </button>
          </div>
        )}

        {/* 4. Folders & Custom Lists */}
        {customLists.length > 0 && onListChange && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">
                <Folder className="w-3.5 h-3.5 text-[var(--accent)]" />
                <span>Folders & Lists</span>
              </div>
              {onOpenListManager && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenListManager();
                  }}
                  className="text-xs text-[var(--accent)] font-semibold"
                >
                  Manage
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => onListChange('all')}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  listFilter === 'all'
                    ? 'bg-[var(--accent)] text-white shadow-sm'
                    : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] border border-[var(--border-light)]'
                }`}
              >
                All Items
              </button>
              {customLists.map((cl) => (
                <button
                  key={cl.id}
                  type="button"
                  onClick={() => onListChange(cl.name)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                    listFilter === cl.name
                      ? 'bg-[var(--accent)] text-white shadow-sm'
                      : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] border border-[var(--border-light)]'
                  }`}
                >
                  📁 {cl.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 5. Upcoming Releases Window */}
        {onUpcomingFilterChange && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">
              <Calendar className="w-3.5 h-3.5 text-[var(--accent)]" />
              <span>Upcoming Window</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[7, 14, 30].map((days) => (
                <button
                  key={days}
                  type="button"
                  onClick={() => {
                    onUpcomingDaysChange?.(days);
                    onUpcomingFilterChange('next_n_days');
                  }}
                  className={`py-2 rounded-xl text-xs font-semibold transition-all text-center cursor-pointer ${
                    upcomingFilter === 'next_n_days' && upcomingDays === days
                      ? 'bg-[var(--accent)] text-white shadow-sm'
                      : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] border border-[var(--border-light)]'
                  }`}
                >
                  Next {days} Days
                </button>
              ))}
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
