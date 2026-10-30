import React from 'react';
import { Film, SlidersHorizontal, Palette, RefreshCw } from 'lucide-react';
import type { SyncStatus } from '../../types';

export interface MobileHeaderProps {
  cloudSyncStatus?: SyncStatus;
  onOpenCloudSync?: () => void;
  onOpenTheme: () => void;
  onOpenFilterSheet: () => void;
  onSelectTab?: (tab: 'library' | 'canvas') => void;
}

export default function MobileHeader({
  cloudSyncStatus,
  onOpenCloudSync,
  onOpenTheme,
  onOpenFilterSheet,
  onSelectTab
}: MobileHeaderProps): React.JSX.Element {
  const syncState = cloudSyncStatus?.state;

  return (
    <header className="sticky top-0 z-30 md:hidden bg-[var(--bg-primary)]/90 backdrop-blur-xl border-b border-[var(--border-light)] px-3.5 py-2.5 transition-all">
      <div className="flex items-center justify-between gap-2">
        {/* Left: Brand Squircle + BingeLog + MOBILE Badge */}
        <div
          onClick={() => onSelectTab?.('library')}
          className="flex items-center gap-2 cursor-pointer select-none active:scale-95 transition-transform"
        >
          <div className="w-9 h-9 rounded-xl bg-[var(--accent)] flex items-center justify-center shadow-md shadow-[var(--accent)]/30 shrink-0">
            <Film className="w-4 h-4 text-white" />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-lg font-extrabold tracking-tight text-[var(--text-primary)]">
              BingeLog
            </span>
            <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-[var(--accent)]/15 text-[var(--accent)] border border-[var(--accent)]/30 leading-none">
              MOBILE
            </span>
          </div>
        </div>

        {/* Right: Cloud Sync Pill + Filter Sliders + Theme/Profile */}
        <div className="flex items-center gap-2">
          {/* Cloud Sync Status Pill */}
          {onOpenCloudSync && (
            <button
              type="button"
              onClick={onOpenCloudSync}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border text-[10px] font-bold tracking-wide transition-all active:scale-95 cursor-pointer ${
                syncState === 'synced'
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                  : syncState === 'syncing'
                  ? 'bg-sky-500/10 text-sky-400 border-sky-500/30'
                  : syncState === 'error'
                  ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                  : syncState === 'offline'
                  ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                  : 'bg-[var(--card-bg)] text-[var(--text-secondary)] border-[var(--border-light)]'
              }`}
              title="End-to-End Encrypted Cloud Sync Status"
            >
              {syncState === 'syncing' ? (
                <>
                  <RefreshCw className="w-2.5 h-2.5 animate-spin text-sky-400" />
                  <span>SYNCING</span>
                </>
              ) : syncState === 'synced' ? (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span>SYNCED</span>
                </>
              ) : syncState === 'offline' ? (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                  <span>OFFLINE</span>
                </>
              ) : syncState === 'error' ? (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                  <span>ERR</span>
                </>
              ) : (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/80" />
                  <span>LOCAL</span>
                </>
              )}
            </button>
          )}

          {/* Filter / Sliders Button (Circular Glass Icon Button) */}
          <button
            type="button"
            onClick={onOpenFilterSheet}
            className="w-9 h-9 rounded-full bg-[var(--card-bg)]/80 hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-light)] flex items-center justify-center transition-all active:scale-90 cursor-pointer shadow-sm"
            title="Filter, Sort & View Options"
          >
            <SlidersHorizontal className="w-4 h-4" />
          </button>

          {/* Theme / Profile Button (Circular Accent-Tinted Icon Button) */}
          <button
            type="button"
            onClick={onOpenTheme}
            className="w-9 h-9 rounded-full bg-[var(--accent)]/15 hover:bg-[var(--accent)]/25 text-[var(--accent)] border border-[var(--accent)]/30 flex items-center justify-center transition-all active:scale-90 cursor-pointer shadow-sm"
            title="Customize Theme & Colors"
          >
            <Palette className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
