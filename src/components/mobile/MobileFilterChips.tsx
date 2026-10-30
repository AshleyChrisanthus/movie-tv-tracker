import React from 'react';
import type { BookFormatFilter } from '../../types';

export interface MobileFilterChipsProps {
  typeFilter: string;
  onTypeChange: (type: string) => void;
  bookFormatFilter?: BookFormatFilter;
  onBookFormatChange?: (format: BookFormatFilter) => void;
  statusFilter: string;
  onStatusChange: (status: string) => void;
  itemCounts?: Record<string, number>;
  typeCounts?: {
    all: number;
    tv: number;
    movie: number;
    book: number;
    audio: number;
  };
}

export default function MobileFilterChips({
  typeFilter,
  onTypeChange,
  bookFormatFilter = 'all',
  onBookFormatChange,
  statusFilter,
  onStatusChange,
  itemCounts = {},
  typeCounts
}: MobileFilterChipsProps): React.JSX.Element {
  // Active type key calculation
  const isAudioActive = typeFilter === 'book' && bookFormatFilter === 'audiobook';
  const isBookActive = typeFilter === 'book' && bookFormatFilter !== 'audiobook';
  const isTvActive = typeFilter === 'tv';
  const isMovieActive = typeFilter === 'movie';
  const isAllTypeActive = typeFilter === 'all' || (!isAudioActive && !isBookActive && !isTvActive && !isMovieActive);

  const handleSelectType = (key: 'all' | 'tv' | 'movie' | 'book' | 'audio') => {
    if (key === 'all') {
      onTypeChange('all');
      onBookFormatChange?.('all');
    } else if (key === 'tv') {
      onTypeChange('tv');
    } else if (key === 'movie') {
      onTypeChange('movie');
    } else if (key === 'book') {
      onTypeChange('book');
      onBookFormatChange?.('reading');
    } else if (key === 'audio') {
      onTypeChange('book');
      onBookFormatChange?.('audiobook');
    }
  };

  const statusList = [
    { key: 'watching', label: 'Watching', dotColor: 'bg-amber-400', borderActive: 'border-amber-400/60 bg-amber-500/15 text-amber-300' },
    { key: 'caught_up', label: 'Caught Up', dotColor: 'bg-emerald-400', borderActive: 'border-emerald-400/60 bg-emerald-500/15 text-emerald-300' },
    { key: 'plan_to_watch', label: 'Plan to Watch', dotColor: 'bg-sky-400', borderActive: 'border-sky-400/60 bg-sky-500/15 text-sky-300' },
    { key: 'completed', label: 'Completed', dotColor: 'bg-emerald-500', borderActive: 'border-emerald-500/60 bg-emerald-500/15 text-emerald-300' },
    { key: 'on_hold', label: 'On Hold', dotColor: 'bg-purple-400', borderActive: 'border-purple-400/60 bg-purple-500/15 text-purple-300' },
    { key: 'dropped', label: 'Dropped', dotColor: 'bg-rose-400', borderActive: 'border-rose-400/60 bg-rose-500/15 text-rose-300' },
  ];

  return (
    <div className="md:hidden flex flex-col gap-2 mb-3.5 select-none">
      {/* Track 1 — Media Type Pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar scrollbar-none pb-0.5 -mx-1 px-1">
        <button
          type="button"
          onClick={() => handleSelectType('all')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all shrink-0 cursor-pointer ${
            isAllTypeActive
              ? 'bg-[var(--accent)] text-white shadow-md shadow-[var(--accent)]/30 ring-1 ring-white/20'
              : 'bg-[var(--card-bg)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-light)]'
          }`}
        >
          <span>All Items</span>
          {typeCounts && (
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                isAllTypeActive ? 'bg-black/25 text-white' : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'
              }`}
            >
              {typeCounts.all}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => handleSelectType('tv')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all shrink-0 cursor-pointer ${
            isTvActive
              ? 'bg-[var(--accent)] text-white shadow-md shadow-[var(--accent)]/30 ring-1 ring-white/20'
              : 'bg-[var(--card-bg)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-light)]'
          }`}
        >
          <span>📺 TV Shows</span>
          {typeCounts && (
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                isTvActive ? 'bg-black/25 text-white' : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'
              }`}
            >
              {typeCounts.tv}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => handleSelectType('movie')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all shrink-0 cursor-pointer ${
            isMovieActive
              ? 'bg-[var(--accent)] text-white shadow-md shadow-[var(--accent)]/30 ring-1 ring-white/20'
              : 'bg-[var(--card-bg)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-light)]'
          }`}
        >
          <span>🎬 Movies</span>
          {typeCounts && (
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                isMovieActive ? 'bg-black/25 text-white' : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'
              }`}
            >
              {typeCounts.movie}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => handleSelectType('book')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all shrink-0 cursor-pointer ${
            isBookActive
              ? 'bg-[var(--accent)] text-white shadow-md shadow-[var(--accent)]/30 ring-1 ring-white/20'
              : 'bg-[var(--card-bg)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-light)]'
          }`}
        >
          <span>📖 Books</span>
          {typeCounts && (
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                isBookActive ? 'bg-black/25 text-white' : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'
              }`}
            >
              {typeCounts.book}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => handleSelectType('audio')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all shrink-0 cursor-pointer ${
            isAudioActive
              ? 'bg-[var(--accent)] text-white shadow-md shadow-[var(--accent)]/30 ring-1 ring-white/20'
              : 'bg-[var(--card-bg)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-light)]'
          }`}
        >
          <span>🎧 Audio</span>
          {typeCounts && (
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                isAudioActive ? 'bg-black/25 text-white' : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'
              }`}
            >
              {typeCounts.audio}
            </span>
          )}
        </button>
      </div>

      {/* Track 2 — Watch Status Pills with Colored Semantic Dots */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar scrollbar-none pb-0.5 -mx-1 px-1">
        {/* All Statuses Pill */}
        <button
          type="button"
          onClick={() => onStatusChange('all')}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-semibold whitespace-nowrap transition-all shrink-0 cursor-pointer border ${
            statusFilter === 'all'
              ? 'bg-[var(--bg-tertiary)] text-[var(--text-primary)] border-[var(--accent)]'
              : 'bg-[var(--card-bg)]/80 text-[var(--text-secondary)] border-[var(--border-light)] hover:text-[var(--text-primary)]'
          }`}
        >
          <span>All Statuses</span>
          <span className="font-mono text-[10px] opacity-70">
            {itemCounts.all ?? 0}
          </span>
        </button>

        {statusList.map((st) => {
          const count = itemCounts[st.key] ?? 0;
          const isActive = statusFilter === st.key;

          return (
            <button
              key={st.key}
              type="button"
              onClick={() => onStatusChange(isActive ? 'all' : st.key)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-semibold whitespace-nowrap transition-all shrink-0 cursor-pointer border ${
                isActive
                  ? `${st.borderActive} shadow-xs font-bold`
                  : 'bg-[var(--card-bg)]/80 text-[var(--text-secondary)] border-[var(--border-light)] hover:text-[var(--text-primary)]'
              }`}
            >
              <span className={`w-2 h-2 rounded-full shrink-0 ${st.dotColor}`} />
              <span>{st.label}</span>
              <span className="font-mono text-[10px] opacity-75">
                ({count})
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
