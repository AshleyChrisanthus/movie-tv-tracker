import React from 'react';
import { Search, Plus, RefreshCw, QrCode, X, UploadCloud, DownloadCloud } from 'lucide-react';
import type { SyncStatus } from '../../types';

export interface MobileSearchStripProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  totalItemsCount: number;
  onOpenSearchModal: () => void;
  cloudSyncStatus?: SyncStatus;
  onOpenCloudSync?: () => void;
  onTriggerSync?: () => void;
  onPushToCloud?: () => void;
  onPullFromCloud?: () => void;
  isSyncing?: boolean;
  isConfigured?: boolean;
  lastSyncedTimeAgo?: string;
}

export default function MobileSearchStrip({
  searchQuery,
  onSearchChange,
  totalItemsCount,
  onOpenSearchModal,
  cloudSyncStatus,
  onOpenCloudSync,
  onTriggerSync,
  onPushToCloud,
  onPullFromCloud,
  isSyncing = false,
  isConfigured = false,
  lastSyncedTimeAgo = 'Just now'
}: MobileSearchStripProps): React.JSX.Element {
  const syncState = cloudSyncStatus?.state;

  return (
    <div className="md:hidden flex flex-col gap-2 mb-3.5 px-0.5">
      {/* Search Input Pill */}
      <div className="relative flex items-center w-full rounded-2xl bg-[var(--bg-secondary)] border border-[var(--border-light)] shadow-inner transition-all focus-within:border-[var(--accent)] focus-within:ring-1 focus-within:ring-[var(--accent)]/30">
        <div className="pl-3.5 pr-2 text-[var(--text-secondary)] pointer-events-none">
          <Search className="w-4 h-4" />
        </div>

        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={`Search ${totalItemsCount} items or add...`}
          className="flex-1 bg-transparent py-2.5 text-xs text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:outline-none min-w-0"
        />

        {searchQuery && (
          <button
            type="button"
            onClick={() => onSearchChange('')}
            className="p-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors mr-1 cursor-pointer"
            title="Clear search"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}

        <button
          type="button"
          onClick={onOpenSearchModal}
          className="flex items-center gap-1 my-1 mr-1.5 px-2.5 py-1.5 rounded-xl bg-[var(--accent)] text-white hover:brightness-110 text-[11px] font-bold shadow-sm active:scale-95 transition-all cursor-pointer shrink-0"
          title="Search & Add Online Media"
        >
          <Plus className="w-3.5 h-3.5" />
          <span className="font-mono text-[10px]">⌘K</span>
        </button>
      </div>

      {/* Sync & Storage Status Strip */}
      <div className="px-3 py-1.5 rounded-xl bg-[var(--bg-secondary)]/70 border border-[var(--border-light)] flex items-center justify-between gap-2 text-[11px]">
        <button
          type="button"
          onClick={onOpenCloudSync}
          className="flex items-center gap-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors truncate cursor-pointer"
        >
          <span
            className={`w-2 h-2 rounded-full shrink-0 ${
              syncState === 'synced'
                ? 'bg-emerald-400'
                : syncState === 'syncing'
                ? 'bg-sky-400 animate-ping'
                : syncState === 'error'
                ? 'bg-rose-400'
                : syncState === 'offline'
                ? 'bg-amber-400'
                : 'bg-emerald-500/70'
            }`}
          />
          <span className="truncate font-medium">
            {isConfigured
              ? `Offline IndexedDB • Synced ${lastSyncedTimeAgo}`
              : `Local IndexedDB • ${totalItemsCount} items`}
          </span>
        </button>

        <div className="flex items-center gap-1.5 shrink-0">
          {isConfigured ? (
            <>
              <button
                type="button"
                disabled={isSyncing || syncState === 'syncing'}
                onClick={onTriggerSync}
                className="flex items-center gap-0.5 font-bold text-[var(--accent)] hover:brightness-110 disabled:opacity-50 cursor-pointer text-[10px] tracking-wide px-1 py-0.5 rounded"
                title="Bi-directional Sync (Merge)"
              >
                <RefreshCw
                  className={`w-2.5 h-2.5 ${isSyncing || syncState === 'syncing' ? 'animate-spin' : ''}`}
                />
                <span>{isSyncing || syncState === 'syncing' ? 'SYNCING...' : onPushToCloud ? 'SYNC' : 'SYNC NOW'}</span>
              </button>
              {onPushToCloud && (
                <>
                  <span className="text-[var(--border-light)] text-[10px]">|</span>
                  <button
                    type="button"
                    disabled={isSyncing || syncState === 'syncing'}
                    onClick={onPushToCloud}
                    className="flex items-center gap-0.5 font-bold text-sky-400 hover:text-sky-300 disabled:opacity-50 cursor-pointer text-[10px] tracking-wide px-1 py-0.5 rounded hover:bg-sky-500/10"
                    title="Push to Cloud (Overwrite Cloud Vault)"
                  >
                    <UploadCloud className="w-2.5 h-2.5" />
                    <span>PUSH</span>
                  </button>
                </>
              )}
              {onPullFromCloud && (
                <>
                  <span className="text-[var(--border-light)] text-[10px]">|</span>
                  <button
                    type="button"
                    disabled={isSyncing || syncState === 'syncing'}
                    onClick={onPullFromCloud}
                    className="flex items-center gap-0.5 font-bold text-amber-400 hover:text-amber-300 disabled:opacity-50 cursor-pointer text-[10px] tracking-wide px-1 py-0.5 rounded hover:bg-amber-500/10"
                    title="Pull from Cloud (Overwrite Local Library)"
                  >
                    <DownloadCloud className="w-2.5 h-2.5" />
                    <span>PULL</span>
                  </button>
                </>
              )}
            </>
          ) : (
            <button
              type="button"
              onClick={onOpenCloudSync}
              className="flex items-center gap-1 font-bold text-[var(--accent)] hover:brightness-110 cursor-pointer text-[10px] tracking-wide"
            >
              <QrCode className="w-3 h-3" />
              <span>PAIR DEVICE</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
