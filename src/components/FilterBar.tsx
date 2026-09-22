import React from 'react';
import {
  Search,
  SlidersHorizontal,
  Film,
  Tv,
  Play,
  CheckCircle,
  CheckCheck,
  Clock,
  XCircle,
  PauseCircle,
  X,
  Folder,
  FolderPlus,
  BookOpen,
  LayoutGrid,
  List,
  Calendar,
  type LucideIcon
} from 'lucide-react';
import type { CustomList, ViewMode, GridDensity, GridColumns, UpcomingFilter } from '../types';

interface StatusTab {
  key: string;
  label: string;
  icon: LucideIcon | null;
}

const STATUS_TABS: StatusTab[] = [
  { key: 'all', label: 'All Items', icon: null },
  { key: 'watching', label: 'Watching', icon: Play },
  { key: 'caught_up', label: 'Caught Up', icon: CheckCheck },
  { key: 'plan_to_watch', label: 'Plan to Watch', icon: Clock },
  { key: 'completed', label: 'Completed', icon: CheckCircle },
  { key: 'on_hold', label: 'On Hold', icon: PauseCircle },
  { key: 'dropped', label: 'Dropped', icon: XCircle },
];

export interface FilterBarProps {
  statusFilter: string;
  onStatusChange: (status: string) => void;
  typeFilter: string;
  onTypeChange: (type: string) => void;
  listFilter?: string;
  onListChange?: (listName: string) => void;
  customLists?: CustomList[];
  onOpenListManager?: () => void;
  librarySearch: string;
  onLibrarySearchChange: (search: string) => void;
  sortBy: string;
  onSortChange: (sortBy: string) => void;
  itemCounts?: Record<string, number>;
  viewMode?: ViewMode;
  onViewModeChange?: (mode: ViewMode) => void;
  gridDensity?: GridDensity;
  onGridDensityChange?: (density: GridDensity) => void;
  gridColumns?: GridColumns;
  onGridColumnsChange?: (cols: GridColumns) => void;
  upcomingFilter?: UpcomingFilter;
  onUpcomingFilterChange?: (filter: UpcomingFilter) => void;
  upcomingDays?: number;
}

export default function FilterBar({
  statusFilter,
  onStatusChange,
  typeFilter,
  onTypeChange,
  listFilter = 'all',
  onListChange,
  customLists = [],
  onOpenListManager,
  librarySearch,
  onLibrarySearchChange,
  sortBy,
  onSortChange,
  itemCounts = {},
  viewMode = 'grid',
  onViewModeChange,
  gridDensity = 'comfortable',
  onGridDensityChange,
  gridColumns = 'auto',
  onGridColumnsChange,
  upcomingFilter = 'show_all',
  onUpcomingFilterChange,
  upcomingDays = 7
}: FilterBarProps): React.JSX.Element {
  const isBookMode = typeFilter === 'book';
  const isTvMode = typeFilter === 'tv';
  const isMovieMode = typeFilter === 'movie';

  let statusTabs: StatusTab[];
  if (isBookMode) {
    statusTabs = [
      { key: 'all', label: 'All Books', icon: null },
      { key: 'watching', label: 'Reading', icon: BookOpen },
      { key: 'plan_to_watch', label: 'Plan to Read', icon: Clock },
      { key: 'completed', label: 'Read', icon: CheckCircle },
      { key: 'on_hold', label: 'On Hold', icon: PauseCircle },
      { key: 'dropped', label: 'Did Not Finish', icon: XCircle },
    ];
  } else if (isTvMode) {
    statusTabs = [
      { key: 'all', label: 'All TV', icon: null },
      { key: 'watching', label: 'Watching', icon: Play },
      { key: 'caught_up', label: 'Caught Up', icon: CheckCheck },
      { key: 'plan_to_watch', label: 'Plan to Watch', icon: Clock },
      { key: 'completed', label: 'Completed', icon: CheckCircle },
      { key: 'on_hold', label: 'On Hold', icon: PauseCircle },
      { key: 'dropped', label: 'Dropped', icon: XCircle },
    ];
  } else if (isMovieMode) {
    statusTabs = [
      { key: 'all', label: 'All Movies', icon: null },
      { key: 'watching', label: 'Watching', icon: Play },
      { key: 'plan_to_watch', label: 'Plan to Watch', icon: Clock },
      { key: 'completed', label: 'Completed', icon: CheckCircle },
      { key: 'on_hold', label: 'On Hold', icon: PauseCircle },
      { key: 'dropped', label: 'Dropped', icon: XCircle },
    ];
  } else {
    // Mixed media ("All Items")
    statusTabs = [
      { key: 'all', label: 'All Items', icon: null },
      { key: 'watching', label: 'Watching / Reading', icon: Play },
      { key: 'caught_up', label: 'Caught Up', icon: CheckCheck },
      { key: 'plan_to_watch', label: 'Plan to Watch / Read', icon: Clock },
      { key: 'completed', label: 'Completed / Read', icon: CheckCircle },
      { key: 'on_hold', label: 'On Hold', icon: PauseCircle },
      { key: 'dropped', label: 'Dropped', icon: XCircle },
    ];
  }

  return (
    <div className={`flex flex-col ${gridDensity === 'compact' ? 'gap-2 mb-3.5' : 'gap-3.5 mb-6'}`}>
      {/* Status Filter Tabs (Apple Segmented Pill Style) */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        {statusTabs.map(tab => {
          const count = itemCounts[tab.key] ?? 0;
          const isActive = statusFilter === tab.key;
          const Icon = tab.icon;

          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => onStatusChange(tab.key)}
              className={`flex items-center gap-1.5 rounded-xl font-semibold whitespace-nowrap transition-all select-none border ${
                gridDensity === 'compact' ? 'px-2.5 py-1 text-[11px]' : 'px-3.5 py-1.5 text-xs'
              } ${
                isActive
                  ? 'bg-[var(--accent)] text-white border-[var(--accent)] shadow-md shadow-[var(--accent)]/20'
                  : 'bg-[var(--card-bg)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] border-[var(--border-light)]'
              }`}
            >
              {Icon && <Icon className={gridDensity === 'compact' ? 'w-3 h-3' : 'w-3.5 h-3.5'} />}
              <span>{tab.label}</span>
              <span
                className={`text-[11px] px-1.5 py-0.2 rounded-full font-mono ${
                  isActive ? 'bg-black/20 text-white' : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Row 2: Content Type, Folders, Search, and Sorting */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2.5">
        {/* Left: Media Type capsule selector & Folder selector */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Type Capsule Slider (App Directory Style) */}
          <div className="flex items-center p-1 bg-[var(--bg-tertiary)] border border-[var(--border-light)] rounded-xl w-fit">
            <button
              type="button"
              onClick={() => onTypeChange('all')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                typeFilter === 'all'
                  ? 'bg-[var(--card-bg)] text-[var(--text-primary)] shadow-xs'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              All Types
            </button>
            <button
              type="button"
              onClick={() => onTypeChange('tv')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                typeFilter === 'tv'
                  ? 'bg-[var(--card-bg)] text-[var(--accent)] shadow-xs'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Tv className="w-3.5 h-3.5" />
              <span>TV Shows</span>
            </button>
            <button
              type="button"
              onClick={() => onTypeChange('movie')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                typeFilter === 'movie'
                  ? 'bg-[var(--card-bg)] text-[var(--accent)] shadow-xs'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Film className="w-3.5 h-3.5" />
              <span>Movies</span>
            </button>
            <button
              type="button"
              onClick={() => onTypeChange('book')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                typeFilter === 'book'
                  ? 'bg-[var(--card-bg)] text-[var(--accent)] shadow-xs'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>Books</span>
            </button>
          </div>

          {/* Folder / Custom List Filter */}
          {onListChange && (
            <div className="flex items-center gap-1.5 bg-[var(--bg-tertiary)] border border-[var(--border-light)] rounded-xl px-2.5 py-1 text-xs">
              <Folder className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
              <select
                value={listFilter}
                onChange={(e) => {
                  if (e.target.value === '__manage__') {
                    if (onOpenListManager) onOpenListManager();
                  } else {
                    onListChange(e.target.value);
                  }
                }}
                className="bg-transparent text-[var(--text-primary)] text-xs focus:outline-none cursor-pointer"
              >
                <option value="all" className="bg-[var(--card-bg)]">All Folders</option>
                {customLists.map(l => (
                  <option key={l.id} value={l.name} className="bg-[var(--card-bg)]">
                    📁 {l.name}
                  </option>
                ))}
                <option value="__manage__" className="bg-[var(--card-bg)] text-[var(--accent)] font-semibold">
                  ⚙️ Manage Folders...
                </option>
              </select>
            </div>
          )}
        </div>

        {/* Right: Search in library & Sort dropdown */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:w-56">
            <Search className="w-3.5 h-3.5 text-[var(--text-secondary)] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={librarySearch}
              onChange={(e) => onLibrarySearchChange(e.target.value)}
              placeholder="Filter library..."
              className="w-full pl-8 pr-7 py-1.5 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl text-xs text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:outline-none focus:border-[var(--input-focus)] transition-all"
            />
            {librarySearch && (
              <button
                type="button"
                onClick={() => onLibrarySearchChange('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-xs rounded-full"
                title="Clear filter"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 bg-[var(--card-bg)] border border-[var(--border-light)] rounded-xl px-2.5 py-1 text-xs text-[var(--text-secondary)]">
            <SlidersHorizontal className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
            <select
              value={sortBy}
              onChange={(e) => onSortChange(e.target.value)}
              className="bg-transparent text-[var(--text-primary)] text-xs focus:outline-none cursor-pointer"
            >
              <option value="updated" className="bg-[var(--card-bg)]">Recently Updated</option>
              <option value="release_desc" className="bg-[var(--card-bg)]">Premiere Date (Newest)</option>
              <option value="release_asc" className="bg-[var(--card-bg)]">Premiere Date (Oldest)</option>
              <option value="last_aired_desc" className="bg-[var(--card-bg)]">Last Aired (Most Recent)</option>
              <option value="last_aired_asc" className="bg-[var(--card-bg)]">Last Aired (Oldest)</option>
              <option value="title" className="bg-[var(--card-bg)]">Title (A-Z)</option>
              <option value="rating" className="bg-[var(--card-bg)]">Highest Rating</option>
              <option value="progress" className="bg-[var(--card-bg)]">Watch Progress</option>
            </select>
          </div>
        </div>
      </div>

      {/* Row 3: Upcoming Releases Timeline & Layout / View Controls */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-2 border-t border-[var(--border-light)]/50">
        {/* Left: 3-Tier Upcoming Releases Filter (Issue #40) */}
        <div className="flex items-center gap-2">
          {onUpcomingFilterChange && (
            <div className="flex items-center bg-[var(--card-bg)] border border-[var(--border-light)] rounded-xl p-0.5 text-xs">
              <span className="text-[10px] font-semibold text-[var(--text-secondary)] px-2 hidden sm:inline">Schedule:</span>
              <button
                type="button"
                onClick={() => onUpcomingFilterChange('show_all')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all ${
                  upcomingFilter === 'show_all'
                    ? 'bg-[var(--accent)] text-white shadow-sm'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
                title="Show all library items including future releases"
              >
                All Releases
              </button>
              <button
                type="button"
                onClick={() => onUpcomingFilterChange('next_n_days')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all ${
                  upcomingFilter === 'next_n_days'
                    ? 'bg-[var(--accent)] text-white shadow-sm'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
                title={`Show upcoming items releasing in next ${upcomingDays} days`}
              >
                Next {upcomingDays}d
              </button>
              <button
                type="button"
                onClick={() => onUpcomingFilterChange('hide_all')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all ${
                  upcomingFilter === 'hide_all'
                    ? 'bg-[var(--accent)] text-white shadow-sm'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
                title="Hide all unreleased and upcoming titles"
              >
                Hide Upcoming
              </button>
            </div>
          )}
        </div>

        {/* Right: Grid Density, Columns Per Row & View Switcher */}
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap justify-end">
          {/* Grid Density Toggle (Comfortable vs Compact) */}
          {viewMode === 'grid' && onGridDensityChange && (
            <div className="flex items-center bg-[var(--card-bg)] border border-[var(--border-light)] rounded-xl p-0.5 text-xs">
              <button
                type="button"
                onClick={() => onGridDensityChange('comfortable')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all ${
                  gridDensity === 'comfortable'
                    ? 'bg-[var(--accent)] text-white shadow-sm'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
                title="Comfortable spacious view"
              >
                Comfortable
              </button>
              <button
                type="button"
                onClick={() => onGridDensityChange('compact')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all ${
                  gridDensity === 'compact'
                    ? 'bg-[var(--accent)] text-white shadow-sm'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
                title="Compact dense view (fits 12+ cards)"
              >
                Compact
              </button>
            </div>
          )}

          {/* Columns Per Row Selector (Issue #31) */}
          {viewMode === 'grid' && onGridColumnsChange && (
            <div className="flex items-center bg-[var(--card-bg)] border border-[var(--border-light)] rounded-xl p-0.5 text-xs">
              <span className="text-[10px] font-semibold text-[var(--text-secondary)] px-1.5 hidden xs:inline">Cols:</span>
              {(['auto', '4', '5', '6', '7', '8'] as GridColumns[]).map((col) => (
                <button
                  key={col}
                  type="button"
                  onClick={() => onGridColumnsChange(col)}
                  className={`px-2 py-1 rounded-lg text-[11px] font-semibold transition-all ${
                    gridColumns === col
                      ? 'bg-[var(--accent)] text-white shadow-sm'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                  title={col === 'auto' ? 'Automatic responsive columns' : `${col} cards per row`}
                >
                  {col === 'auto' ? 'Auto' : col}
                </button>
              ))}
            </div>
          )}

          {/* View Mode Switcher (Grid vs List) */}
          {onViewModeChange && (
            <div className="flex items-center bg-[var(--card-bg)] border border-[var(--border-light)] rounded-xl p-0.5 text-xs">
              <button
                type="button"
                onClick={() => onViewModeChange('grid')}
                className={`p-1.5 rounded-lg transition-all ${
                  viewMode === 'grid'
                    ? 'bg-[var(--accent)] text-white shadow-sm'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
                title="Grid View"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onViewModeChange('list')}
                className={`p-1.5 rounded-lg transition-all ${
                  viewMode === 'list'
                    ? 'bg-[var(--accent)] text-white shadow-sm'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
                title="Compact List View"
              >
                <List className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
