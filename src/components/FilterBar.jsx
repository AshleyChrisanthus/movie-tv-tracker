import React from 'react';
import { Search, SlidersHorizontal, Film, Tv, Play, CheckCircle, Clock, XCircle, PauseCircle } from 'lucide-react';

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
      {/* Status Filter Tabs */}
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
                  ? 'bg-indigo-600 text-white border-indigo-500 shadow-md shadow-indigo-600/20'
                  : 'bg-zinc-900/90 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/90 border-zinc-800/80'
              }`}
            >
              {Icon && <Icon className="w-3.5 h-3.5" />}
              <span>{tab.label}</span>
              <span
                className={`text-[11px] px-1.5 py-0.2 rounded-full font-mono ${
                  isActive ? 'bg-indigo-700/80 text-white' : 'bg-zinc-800 text-zinc-400'
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Sub-bar: Type selector, In-library search, and Sort */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
        {/* Type pills */}
        <div className="flex items-center p-1 bg-zinc-900/90 border border-zinc-800/80 rounded-xl w-fit">
          <button
            onClick={() => onTypeChange('all')}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
              typeFilter === 'all'
                ? 'bg-zinc-800 text-white shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            All Types
          </button>
          <button
            onClick={() => onTypeChange('tv')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-all ${
              typeFilter === 'tv'
                ? 'bg-zinc-800 text-indigo-400 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Tv className="w-3.5 h-3.5" />
            <span>TV Shows</span>
          </button>
          <button
            onClick={() => onTypeChange('movie')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-all ${
              typeFilter === 'movie'
                ? 'bg-zinc-800 text-violet-400 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Film className="w-3.5 h-3.5" />
            <span>Movies</span>
          </button>
        </div>

        {/* Right side: Search in library & Sort dropdown */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:w-56">
            <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={librarySearch}
              onChange={(e) => onLibrarySearchChange(e.target.value)}
              placeholder="Filter library..."
              className="w-full pl-8 pr-3 py-1.5 bg-zinc-900/90 border border-zinc-800 rounded-xl text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
            />
          </div>

          <div className="flex items-center gap-1.5 bg-zinc-900/90 border border-zinc-800 rounded-xl px-2.5 py-1 text-xs text-zinc-400">
            <SlidersHorizontal className="w-3.5 h-3.5 text-zinc-500" />
            <select
              value={sortBy}
              onChange={(e) => onSortChange(e.target.value)}
              className="bg-transparent text-zinc-300 text-xs focus:outline-none cursor-pointer"
            >
              <option value="updated" className="bg-zinc-900">Recently Updated</option>
              <option value="title" className="bg-zinc-900">Title (A-Z)</option>
              <option value="rating" className="bg-zinc-900">Highest Rating</option>
              <option value="progress" className="bg-zinc-900">Watch Progress</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}
