import React from 'react';
import { Film, Tv, Plus, Settings, Search, CheckCircle2, PlayCircle } from 'lucide-react';

export default function Navbar({ onOpenSearch, onOpenManual, onOpenSettings, stats }) {
  return (
    <header className="sticky top-0 z-30 bg-zinc-950/85 backdrop-blur-md border-b border-zinc-800/80 px-4 lg:px-8 py-3.5 transition-all">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        
        {/* Brand */}
        <div className="flex items-center gap-3 cursor-pointer select-none">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-500/25">
            <Film className="w-5 h-5 text-white" />
          </div>
          <div>
            <span className="text-xl font-bold tracking-tight bg-gradient-to-r from-white via-zinc-200 to-zinc-400 bg-clip-text text-transparent">
              BingeLog
            </span>
            <span className="hidden sm:inline-block ml-2 text-xs font-medium px-2 py-0.5 rounded-full bg-zinc-800/90 text-zinc-400 border border-zinc-700/50">
              Tracker
            </span>
          </div>
        </div>

        {/* Global Search Bar trigger */}
        <button
          onClick={onOpenSearch}
          className="flex-1 max-w-md hidden sm:flex items-center justify-between px-3.5 py-2 rounded-xl bg-zinc-900/90 hover:bg-zinc-800/80 border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-zinc-200 transition-all text-sm group shadow-inner"
        >
          <div className="flex items-center gap-2.5">
            <Search className="w-4 h-4 text-zinc-500 group-hover:text-indigo-400 transition-colors" />
            <span>Search movies & TV shows to add...</span>
          </div>
          <kbd className="text-[11px] font-mono uppercase bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded border border-zinc-700/60">
            Ctrl+K
          </kbd>
        </button>

        {/* Action Buttons & Quick Stats */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Mobile search icon */}
          <button
            onClick={onOpenSearch}
            className="sm:hidden p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-800 transition-all"
            title="Search to add"
          >
            <Search className="w-4 h-4" />
          </button>

          {/* Quick stats badges */}
          <div className="hidden md:flex items-center gap-2 text-xs font-medium mr-1">
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-amber-400">
              <PlayCircle className="w-3.5 h-3.5" />
              <span>{stats?.watching || 0} Watching</span>
            </span>
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-emerald-400">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{stats?.completed || 0} Completed</span>
            </span>
          </div>

          {/* Add Custom / Manual Button */}
          <button
            onClick={onOpenManual}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-200 hover:text-white border border-zinc-800 hover:border-zinc-700 text-sm font-medium transition-all shadow-sm"
            title="Add Custom Movie or TV Show"
          >
            <Plus className="w-4 h-4 text-indigo-400" />
            <span className="hidden sm:inline">Add Custom</span>
          </button>

          {/* Settings & Export Button */}
          <button
            onClick={onOpenSettings}
            className="p-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 hover:border-zinc-700 transition-all shadow-sm"
            title="Settings, API Key & Data Backup"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>

      </div>
    </header>
  );
}
