import React from 'react';
import { Film, Tv, Star, Plus, CheckCircle2, Play, Check } from 'lucide-react';

const STATUS_CONFIG = {
  watching: { label: 'Watching', bg: 'bg-amber-500/10 text-amber-400 border-amber-500/30' },
  completed: { label: 'Completed', bg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' },
  plan_to_watch: { label: 'Plan to Watch', bg: 'bg-blue-500/10 text-blue-400 border-blue-500/30' },
  on_hold: { label: 'On Hold', bg: 'bg-orange-500/10 text-orange-400 border-orange-500/30' },
  dropped: { label: 'Dropped', bg: 'bg-red-500/10 text-red-400 border-red-500/30' },
};

export default function MediaCard({ item, onClick, onQuickIncrement, onQuickToggleMovie }) {
  const isTv = item.type === 'tv';
  const statusCfg = STATUS_CONFIG[item.status] || STATUS_CONFIG.plan_to_watch;

  // TV progress calculation
  const totalEps = item.totalEpisodes || 0;
  const watchedEps = item.watchedEpisodesCount || 0;
  const progressPercent = totalEps > 0 ? Math.min(100, Math.round((watchedEps / totalEps) * 100)) : 0;
  const isCompleted = isTv ? (totalEps > 0 && watchedEps >= totalEps) : item.status === 'completed';

  const handleQuickAction = (e) => {
    e.stopPropagation();
    if (isTv) {
      if (onQuickIncrement) onQuickIncrement(item);
    } else {
      if (onQuickToggleMovie) onQuickToggleMovie(item);
    }
  };

  return (
    <div
      onClick={() => onClick(item)}
      className="group relative flex flex-col bg-zinc-900/70 hover:bg-zinc-900 border border-zinc-800/80 hover:border-zinc-700/80 rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-xl hover:shadow-indigo-950/20 hover:-translate-y-1"
    >
      {/* Poster Container */}
      <div className="relative aspect-[2/3] w-full overflow-hidden bg-zinc-950">
        {item.posterUrl ? (
          <img
            src={item.posterUrl}
            alt={item.title}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-zinc-900 to-zinc-950 text-zinc-600 p-4 text-center">
            {isTv ? <Tv className="w-12 h-12 mb-2 opacity-50" /> : <Film className="w-12 h-12 mb-2 opacity-50" />}
            <span className="text-xs font-medium text-zinc-500 line-clamp-2">{item.title}</span>
          </div>
        )}

        {/* Top Badges */}
        <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between gap-1 pointer-events-none">
          {/* Type Badge */}
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-black/70 backdrop-blur-md border border-white/10 text-[11px] font-semibold text-zinc-200">
            {isTv ? <Tv className="w-3 h-3 text-indigo-400" /> : <Film className="w-3 h-3 text-violet-400" />}
            <span>{isTv ? 'TV' : 'Movie'}</span>
          </span>

          {/* Rating */}
          {item.rating ? (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-black/70 backdrop-blur-md border border-white/10 text-[11px] font-bold text-amber-300">
              <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
              <span>{item.rating}</span>
            </span>
          ) : null}
        </div>

        {/* Quick Action Button overlay at bottom right of poster */}
        <div className="absolute bottom-2.5 right-2.5 z-10">
          {isTv && !isCompleted && (
            <button
              onClick={handleQuickAction}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-lg shadow-indigo-900/50 backdrop-blur-sm transition-all active:scale-95"
              title="Quick mark +1 episode watched"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+1 Ep</span>
            </button>
          )}

          {!isTv && (
            <button
              onClick={handleQuickAction}
              className={`flex items-center gap-1 p-2 rounded-xl text-xs font-bold shadow-lg backdrop-blur-sm transition-all active:scale-95 ${
                item.status === 'completed'
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                  : 'bg-zinc-800/90 hover:bg-indigo-600 text-zinc-200 hover:text-white border border-white/10'
              }`}
              title={item.status === 'completed' ? 'Mark as Unwatched' : 'Mark as Watched'}
            >
              <Check className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Completed overlay check */}
        {isCompleted && (
          <div className="absolute top-2.5 right-2.5">
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-950/80 backdrop-blur-md border border-emerald-500/40 text-[11px] font-semibold text-emerald-400">
              <CheckCircle2 className="w-3 h-3" />
              <span>Done</span>
            </span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-3.5 flex flex-col flex-1 justify-between gap-2.5">
        <div>
          <div className="flex items-start justify-between gap-2 mb-1">
            <h3 className="font-semibold text-sm text-zinc-100 group-hover:text-indigo-300 transition-colors line-clamp-1" title={item.title}>
              {item.title}
            </h3>
          </div>

          <div className="flex items-center gap-2 text-xs text-zinc-400">
            <span>{item.year || 'N/A'}</span>
            <span>•</span>
            <span className={`px-2 py-0.2 rounded text-[10px] font-medium border ${statusCfg.bg}`}>
              {statusCfg.label}
            </span>
          </div>
        </div>

        {/* TV Progress Details */}
        {isTv && (
          <div className="pt-2 border-t border-zinc-800/80">
            <div className="flex items-center justify-between text-[11px] text-zinc-400 mb-1.5 font-medium">
              <span>
                {item.currentSeason ? `S${item.currentSeason} ` : ''}
                {item.currentEpisode ? `E${item.currentEpisode}` : ''}
                {(!item.currentSeason && !item.currentEpisode) ? 'Not started' : ''}
              </span>
              <span className="font-mono text-zinc-300">
                {watchedEps}/{totalEps} eps ({progressPercent}%)
              </span>
            </div>

            {/* Progress Bar */}
            <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-300 rounded-full ${
                  isCompleted ? 'bg-emerald-500' : 'bg-gradient-to-r from-indigo-500 to-violet-500'
                }`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        )}

        {/* Movie status hint */}
        {!isTv && (
          <div className="pt-1 text-[11px] text-zinc-500">
            {item.status === 'completed' ? 'Watched' : 'In Watchlist'}
          </div>
        )}
      </div>
    </div>
  );
}
