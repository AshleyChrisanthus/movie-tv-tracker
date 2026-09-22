import React from 'react';
import { Film, Plus, Settings, Search, RefreshCw, Palette, Sun, Moon } from 'lucide-react';
import type { ThemeMode } from '../types';

export interface NavbarProps {
  onOpenSearch: () => void;
  onOpenManual: () => void;
  onOpenSettings: () => void;
  onStartSyncAll: () => void;
  isSyncing: boolean;
  onOpenTheme: () => void;
  onToggleTheme: () => void;
  themeMode?: ThemeMode;
  stats?: {
    watching?: number;
    completed?: number;
    total?: number;
    [key: string]: number | undefined;
  };
}

export default function Navbar({
  onOpenSearch,
  onOpenManual,
  onOpenSettings,
  onStartSyncAll,
  isSyncing,
  onOpenTheme,
  onToggleTheme,
  themeMode = 'dark',
  stats
}: NavbarProps): React.JSX.Element {
  return (
    <header className="sticky top-0 z-30 bg-[var(--bg-secondary)]/85 backdrop-blur-xl border-b border-[var(--border-light)] px-4 lg:px-8 py-3 transition-all">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        
        {/* Brand */}
        <div className="flex items-center gap-3 cursor-pointer select-none group">
          <div className="w-10 h-10 rounded-xl bg-[var(--accent)] flex items-center justify-center shadow-lg shadow-[var(--accent)]/25 group-hover:scale-105 transition-all">
            <Film className="w-5 h-5 text-white" />
          </div>
          <div>
            <span className="text-xl font-bold tracking-tight text-[var(--text-primary)]">
              BingeLog
            </span>
            <span className="hidden sm:inline-block ml-2 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border border-[var(--border-light)]">
              Tracker
            </span>
          </div>
        </div>

        {/* Global Search Bar trigger (App Directory Inset Style) */}
        <button
          type="button"
          onClick={onOpenSearch}
          className="flex-1 max-w-md hidden sm:flex items-center justify-between px-3.5 py-2 rounded-xl bg-[var(--input-bg)] hover:bg-[var(--bg-hover)] border border-[var(--input-border)] hover:border-[var(--input-focus)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all text-xs group shadow-inner"
        >
          <div className="flex items-center gap-2.5">
            <Search className="w-4 h-4 text-[var(--text-secondary)] group-hover:text-[var(--accent)] transition-colors" />
            <span>Search movies & TV shows to add...</span>
          </div>
          <kbd className="text-[11px] font-mono uppercase bg-[var(--bg-secondary)] text-[var(--text-secondary)] px-1.5 py-0.5 rounded border border-[var(--border-light)] shadow-xs">
            Ctrl+K
          </kbd>
        </button>

        {/* Action Buttons & Quick Stats */}
        <div className="flex items-center gap-2 sm:gap-2.5">
          {/* Mobile search icon */}
          <button
            type="button"
            onClick={onOpenSearch}
            className="sm:hidden p-2 rounded-xl bg-[var(--card-bg)] border border-[var(--border-light)] text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-all"
            title="Search to add"
          >
            <Search className="w-4 h-4" />
          </button>

          {/* Add Custom / Manual Button */}
          <button
            type="button"
            onClick={onOpenManual}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[var(--card-bg)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] border border-[var(--border-light)] text-xs font-semibold transition-all shadow-sm active:scale-95"
            title="Add Custom Movie or TV Show"
          >
            <Plus className="w-4 h-4 text-[var(--accent)]" />
            <span className="hidden sm:inline">Add Custom</span>
          </button>

          {/* Sync All Library Button */}
          <button
            type="button"
            onClick={onStartSyncAll}
            disabled={isSyncing}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition-all shadow-sm active:scale-95 ${
              isSyncing
                ? 'bg-[var(--bg-hover)] text-[var(--accent)] border-[var(--accent)] cursor-wait'
                : 'bg-[var(--card-bg)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] border-[var(--border-light)]'
            }`}
            title="Sync all TV shows to check for new seasons and episode titles"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-[var(--accent)] ${isSyncing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">{isSyncing ? 'Syncing...' : 'Sync All'}</span>
          </button>

          {/* Customize Theme & Colors Button (App Directory Palette Button) */}
          <button
            type="button"
            onClick={onOpenTheme}
            className="p-2 rounded-xl bg-[var(--card-bg)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-light)] transition-all shadow-sm active:scale-95"
            title="Customize Theme & Colors"
          >
            <Palette className="w-4 h-4 text-[var(--accent)]" />
          </button>

          {/* Theme Light/Dark Mode Toggle Button */}
          <button
            type="button"
            onClick={onToggleTheme}
            className="p-2 rounded-xl bg-[var(--card-bg)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-light)] transition-all shadow-sm active:scale-95"
            title={`Switch to ${themeMode === 'dark' ? 'Light' : 'Dark'} Mode`}
          >
            {themeMode === 'dark' ? (
              <Sun className="w-4 h-4 text-amber-400" />
            ) : (
              <Moon className="w-4 h-4 text-[var(--accent)]" />
            )}
          </button>

          {/* Settings & Export Button */}
          <button
            type="button"
            onClick={onOpenSettings}
            className="p-2 rounded-xl bg-[var(--card-bg)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-light)] transition-all shadow-sm active:scale-95"
            title="Settings, API Key & Data Backup"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>

      </div>
    </header>
  );
}
