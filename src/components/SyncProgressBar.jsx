import React from 'react';
import { RefreshCw, CheckCircle2, AlertCircle, X, Sparkles } from 'lucide-react';

export default function SyncProgressBar({
  syncState,
  onCancel,
  onDismiss
}) {
  if (!syncState || (!syncState.isActive && !syncState.isComplete)) {
    return null;
  }

  const {
    completed = 0,
    total = 0,
    currentTitle = '',
    updatedCount = 0,
    isActive = false,
    isComplete = false,
    isCancelled = false
  } = syncState;

  const percentage = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0;

  return (
    <div className="w-full mb-6 transition-all duration-300 animate-in fade-in slide-in-from-top-2">
      <div className={`p-4 rounded-2xl border shadow-xl backdrop-blur-md transition-all ${
        isComplete
          ? 'bg-[var(--card-bg)] border-emerald-500/40 text-[var(--text-primary)]'
          : isCancelled
          ? 'bg-[var(--card-bg)] border-amber-500/40 text-[var(--text-primary)]'
          : 'bg-[var(--card-bg)] border-[var(--accent)]/40 text-[var(--text-primary)]'
      }`}>
        
        {/* Header Row */}
        <div className="flex items-center justify-between gap-3 mb-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            {isActive ? (
              <RefreshCw className="w-4 h-4 text-[var(--accent)] animate-spin shrink-0" />
            ) : isComplete ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
            )}

            <div className="min-w-0">
              <span className="text-xs font-semibold tracking-wide text-[var(--text-primary)] truncate block">
                {isActive ? (
                  <>
                    Syncing library <span className="text-[var(--accent)]">({completed}/{total})</span>: {currentTitle ? `"${currentTitle}"` : 'Checking...'}
                  </>
                ) : isCancelled ? (
                  'Sync cancelled by user'
                ) : (
                  'Library sync complete!'
                )}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <span className="text-xs font-mono font-bold text-[var(--text-secondary)]">
              {percentage}%
            </span>

            {isActive ? (
              <button
                onClick={onCancel}
                className="px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all border border-[var(--border-light)] shadow-sm"
              >
                Cancel
              </button>
            ) : (
              <button
                onClick={onDismiss}
                className="p-1 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-all"
                title="Dismiss"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Apple-style Slim Progress Track */}
        <div className="w-full bg-[var(--bg-primary)] rounded-full h-2 overflow-hidden p-0.5 border border-[var(--border-light)] mb-2.5">
          <div
            className={`h-full rounded-full transition-all duration-300 ease-out ${
              isComplete
                ? 'bg-gradient-to-r from-emerald-500 to-teal-400 shadow-[0_0_12px_rgba(16,185,129,0.5)]'
                : isCancelled
                ? 'bg-gradient-to-r from-amber-500 to-orange-400'
                : 'bg-gradient-to-r from-[var(--accent)] to-[#30d158] shadow-[0_0_12px_rgba(10,132,255,0.4)]'
            }`}
            style={{ width: `${percentage}%` }}
          />
        </div>

        {/* Status Subtitle & Updates counter badge */}
        <div className="flex items-center justify-between text-[11px] text-[var(--text-secondary)]">
          <div>
            {isActive ? (
              <span>Checking for newly dropped seasons, episodes, and official titles...</span>
            ) : isComplete ? (
              <span>
                {updatedCount > 0
                  ? `Successfully found and synced updates for ${updatedCount} show${updatedCount !== 1 ? 's' : ''}.`
                  : 'All shows and episode checklists are completely up to date.'}
              </span>
            ) : (
              <span>Sync halted. Progress up to show #{completed} was saved.</span>
            )}
          </div>

          {updatedCount > 0 && (
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[var(--accent-bg)] border border-[var(--accent)]/30 text-[var(--accent)] font-semibold shrink-0 ml-2">
              <Sparkles className="w-3 h-3 text-[var(--accent)]" />
              <span>{updatedCount} updated</span>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
