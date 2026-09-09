import React from 'react';
import { Search, SlidersHorizontal, Film, Tv, Play, CheckCircle, Clock, XCircle, PauseCircle, X } from 'lucide-react';

const STATUS_TABS = [
  { key: 'all', label: 'All Items', icon: null },
  { key: 'watching', label: 'Watching', icon: Play },
  { key: 'plan_to_watch', label: 'Plan to Watch', icon: Clock },
  { key: 'completed', label: 'Completed', icon: CheckCircle },
  { key: 'on_hold', label: 'On Hold', icon: PauseCircle },
  { key: 'dropped', label: 'Dropped', icon: XCircle },
];

export default function FilterBar({
  statusFilter,
  onStatusChange,
  typeFilter,
  onTypeChange,
  librarySearch,
  onLibrarySearchChange,
  sortBy,
  onSortChange,
  itemCounts = {}
}) {
  return (
    <div className="flex flex-col gap-3.5 mb-6">
      {/* Status Filter Tabs (Apple Segmented Pill Style) */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        {STATUS_TABS.map(tab => {
          const count = itemCounts[tab.key] ?? 0;
          const isActive = statusFilter === tab.key;
          const Icon = tab.icon;

          return (
            <button
              key={tab.key}
              onClick={() => onStatusChange(tab.key)}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all select-none border ${
                isActive
                  ? 'bg-[var(--accent)] text-white border-[var(--accent)] shadow-md shadow-[var(--accent)]/20'
                  : 'bg-[var(--card-bg)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] border-[var(--border-light)]'
              }`}
            >
              {Icon && <Icon className="w-3.5 h-3.5" />}
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

      {/* Sub-bar: Type capsule selector, In-library search with clear button, and Sort */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
        {/* Type Capsule Slider (App Directory Style) */}
        <div className="flex items-center p-1 bg-[var(--bg-tertiary)] border border-[var(--border-light)] rounded-xl w-fit">
          <button
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
        </div>

        {/* Right side: Search in library & Sort dropdown */}
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
              <option value="title" className="bg-[var(--card-bg)]">Title (A-Z)</option>
              <option value="rating" className="bg-[var(--card-bg)]">Highest Rating</option>
              <option value="progress" className="bg-[var(--card-bg)]">Watch Progress</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}
