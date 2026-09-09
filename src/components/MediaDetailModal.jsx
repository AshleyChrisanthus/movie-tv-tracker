import React, { useState, useEffect } from 'react';
import { 
  X, Star, Film, Tv, CheckCircle2, Play, Calendar, Clock, 
  Trash2, Edit3, ChevronDown, ChevronUp, Check, PlayCircle, Eye, RefreshCw
} from 'lucide-react';
import { 
  getEpisodesForMedia, toggleEpisodeWatched, setExactProgress, 
  setSeasonWatched, updateMediaStatus, updateMediaRatingAndNotes, 
  deleteMediaItem 
} from '../db';
import { syncMediaEpisodes } from '../services/api';

export default function MediaDetailModal({ media, onClose, onUpdated, onEditCustom }) {
  const [episodes, setEpisodes] = useState([]);
  const [selectedSeason, setSelectedSeason] = useState(1);
  const [status, setStatus] = useState(media.status || 'plan_to_watch');
  const [rating, setRating] = useState(media.rating || 0);
  const [notes, setNotes] = useState(media.notes || '');
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  const [notesSavedNotice, setNotesSavedNotice] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncNotice, setSyncNotice] = useState(null);

  // Precise Season/Episode input state
  const [inputSeason, setInputSeason] = useState(media.currentSeason || 1);
  const [inputEpisode, setInputEpisode] = useState(media.currentEpisode || 0);

  // Expanded episode synopses
  const [expandedEpisodes, setExpandedEpisodes] = useState({});

  const isTv = media.type === 'tv';

  // Load episodes from IndexedDB
  const loadEpisodes = async () => {
    if (!isTv) return;
    const eps = await getEpisodesForMedia(media.id);
    setEpisodes(eps);

    if (eps.length > 0) {
      // Default to season containing next unwatched episode or currentSeason
      const current = media.currentSeason || 1;
      setSelectedSeason(current);
      setInputSeason(current);
      setInputEpisode(media.currentEpisode || 0);
    }
  };

  // Sync latest episodes from TVMaze/TMDB
  const handleSync = async (silent = false) => {
    if (!isTv || !media.externalId || isSyncing) return;
    if (!silent) setIsSyncing(true);
    setSyncNotice(null);

    try {
      const result = await syncMediaEpisodes(media);
      if (result.hasUpdates) {
        let msg = '';
        if (result.newEpisodesCount > 0 && result.updatedTitlesCount > 0) {
          msg = `🎉 Added ${result.newEpisodesCount} new episode(s) and updated ${result.updatedTitlesCount} title(s)!`;
        } else if (result.newEpisodesCount > 0) {
          msg = `🎉 Added ${result.newEpisodesCount} newly dropped episode(s)!`;
        } else if (result.updatedTitlesCount > 0) {
          msg = `✨ Updated ${result.updatedTitlesCount} newly revealed episode title(s)!`;
        }
        setSyncNotice({ success: true, message: msg });
        await loadEpisodes();
        if (onUpdated) onUpdated();
      } else if (!silent) {
        setSyncNotice({ success: true, message: 'All episodes and seasons are already up to date!' });
      }
    } catch (err) {
      if (!silent) {
        setSyncNotice({ success: false, message: `Sync failed: ${err.message}` });
      }
    } finally {
      if (!silent) setIsSyncing(false);
    }
  };

  useEffect(() => {
    loadEpisodes();
    // Silently check for new episodes if watching a TV show with external ID
    if (isTv && media.status === 'watching' && media.externalId) {
      handleSync(true);
    }
  }, [media.id]);

  // Handle status change
  const handleStatusChange = async (newStatus) => {
    setStatus(newStatus);
    await updateMediaStatus(media.id, newStatus);
    await loadEpisodes();
    if (onUpdated) onUpdated();
  };

  // Handle rating & notes save
  const handleSaveNotes = async () => {
    setIsSavingNotes(true);
    await updateMediaRatingAndNotes(media.id, rating, notes);
    setIsSavingNotes(false);
    setNotesSavedNotice(true);
    setTimeout(() => setNotesSavedNotice(false), 2000);
    if (onUpdated) onUpdated();
  };

  // Toggle single episode
  const handleToggleEpisode = async (ep) => {
    await toggleEpisodeWatched(media.id, ep.seasonNumber, ep.episodeNumber);
    await loadEpisodes();
    if (onUpdated) onUpdated();
  };

  // Apply exact progress input (User requested: precise to season and episode numbers)
  const handleApplyExactProgress = async (markPrevious = true) => {
    const s = Math.max(1, parseInt(inputSeason, 10) || 1);
    const e = Math.max(0, parseInt(inputEpisode, 10) || 0);

    await setExactProgress(media.id, s, e, markPrevious);
    await loadEpisodes();
    if (onUpdated) onUpdated();
  };

  // Mark full season watched or unwatched
  const handleToggleSeason = async (seasonNum, markAsWatched) => {
    await setSeasonWatched(media.id, seasonNum, markAsWatched);
    await loadEpisodes();
    if (onUpdated) onUpdated();
  };

  // Delete media item
  const handleDelete = async () => {
    if (window.confirm(`Are you sure you want to remove "${media.title}" from your library?`)) {
      await deleteMediaItem(media.id);
      if (onUpdated) onUpdated();
      onClose();
    }
  };

  // Derived season lists
  const seasonNumbers = Array.from(
    new Set(episodes.map(ep => ep.seasonNumber))
  ).sort((a, b) => a - b);

  const currentSeasonEpisodes = episodes.filter(ep => ep.seasonNumber === selectedSeason);
  const currentSeasonWatchedCount = currentSeasonEpisodes.filter(ep => ep.isWatched === 1).length;
  const isSeasonFullyWatched = currentSeasonEpisodes.length > 0 && currentSeasonWatchedCount === currentSeasonEpisodes.length;

  // Next up episode finder
  const nextUpEpisode = episodes.find(ep => ep.isWatched === 0);

  const toggleExpand = (epId) => {
    setExpandedEpisodes(prev => ({ ...prev, [epId]: !prev[epId] }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-sm overflow-y-auto animate-fadeIn">
      <div className="relative w-full max-w-4xl bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden my-auto flex flex-col max-h-[92vh]">
        
        {/* Backdrop & Header Banner */}
        <div className="relative h-48 sm:h-64 w-full bg-zinc-950 shrink-0">
          {media.backdropUrl || media.posterUrl ? (
            <img
              src={media.backdropUrl || media.posterUrl}
              alt={media.title}
              className="w-full h-full object-cover opacity-35"
            />
          ) : null}
          <div className="absolute inset-0 bg-gradient-to-t from-zinc-900 via-zinc-900/60 to-transparent" />

          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-full bg-black/60 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-white/10 backdrop-blur-md transition-all z-10"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Title & metadata on top of banner */}
          <div className="absolute bottom-4 left-4 right-4 flex items-end gap-4 sm:gap-6">
            {/* Poster Thumbnail */}
            <div className="w-20 sm:w-28 aspect-[2/3] rounded-xl overflow-hidden shadow-2xl border border-white/10 shrink-0 bg-zinc-950 hidden xs:block">
              {media.posterUrl ? (
                <img src={media.posterUrl} alt={media.title} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-zinc-800 text-zinc-600">
                  {isTv ? <Tv className="w-8 h-8" /> : <Film className="w-8 h-8" />}
                </div>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="px-2 py-0.5 rounded-lg bg-[var(--accent)] text-white text-[11px] font-bold">
                  {isTv ? 'TV Series' : 'Movie'}
                </span>
                {media.year && (
                  <span className="text-zinc-300 text-xs font-medium">
                    {media.year}
                  </span>
                )}
                {media.genres && media.genres.length > 0 && (
                  <span className="text-zinc-400 text-xs truncate max-w-xs">
                    • {Array.isArray(media.genres) ? media.genres.join(', ') : media.genres}
                  </span>
                )}
              </div>

              <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-white tracking-tight truncate" title={media.title}>
                {media.title}
              </h1>
            </div>
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          
          {/* Controls Bar: Status, Rating, and Quick Actions */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 bg-zinc-950/60 rounded-xl border border-zinc-800/80">
            {/* Status Selector */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-[var(--text-secondary)] font-medium">Status:</span>
              <select
                value={status}
                onChange={(e) => handleStatusChange(e.target.value)}
                className="px-3 py-1.5 bg-[var(--bg-secondary)] border border-[var(--border-light)] rounded-lg text-xs font-semibold text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] cursor-pointer"
              >
                <option value="watching">Watching</option>
                <option value="plan_to_watch">Plan to Watch</option>
                <option value="completed">Completed</option>
                <option value="on_hold">On Hold</option>
                <option value="dropped">Dropped</option>
              </select>
            </div>

            {/* Quick Rating (1 to 10) */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-[var(--text-secondary)] font-medium flex items-center gap-1">
                <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                <span>My Rating:</span>
              </span>
              <select
                value={rating}
                onChange={(e) => {
                  setRating(Number(e.target.value));
                  updateMediaRatingAndNotes(media.id, Number(e.target.value), notes);
                  if (onUpdated) onUpdated();
                }}
                className="px-2 py-1.5 bg-[var(--bg-secondary)] border border-[var(--border-light)] rounded-lg text-xs font-semibold text-amber-300 focus:outline-none focus:border-[var(--accent)] cursor-pointer"
              >
                <option value="0">Unrated</option>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                  <option key={n} value={n}>{n} / 10</option>
                ))}
              </select>
            </div>

            {/* Action buttons (Sync / Edit Custom / Delete) */}
            <div className="flex items-center gap-2 ml-auto">
              {isTv && media.externalId && (
                <button
                  onClick={() => handleSync(false)}
                  disabled={isSyncing}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--bg-secondary)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-light)] text-xs font-medium transition-all disabled:opacity-50"
                  title="Check TVMaze/TMDB for new seasons, episodes, and updated titles"
                >
                  <RefreshCw className={`w-3.5 h-3.5 text-emerald-400 ${isSyncing ? 'animate-spin' : ''}`} />
                  <span>{isSyncing ? 'Checking...' : 'Sync Episodes'}</span>
                </button>
              )}

              {onEditCustom && (
                <button
                  onClick={() => onEditCustom(media)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--bg-secondary)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-light)] text-xs font-medium transition-all"
                  title="Edit metadata or custom episodes"
                >
                  <Edit3 className="w-3.5 h-3.5 text-[var(--accent)]" />
                  <span>Edit</span>
                </button>
              )}
              <button
                onClick={handleDelete}
                className="p-1.5 rounded-lg bg-zinc-900 hover:bg-red-950/60 text-zinc-400 hover:text-red-400 border border-zinc-800 hover:border-red-800/60 text-xs transition-all"
                title="Delete from library"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Sync Notice Banner */}
          {syncNotice && (
            <div className={`p-3 rounded-xl text-xs flex items-center justify-between gap-2 border animate-fadeIn ${
              syncNotice.success ? 'bg-emerald-950/50 text-emerald-300 border-emerald-800/60' : 'bg-red-950/50 text-red-300 border-red-800/60'
            }`}>
              <span>{syncNotice.message}</span>
              <button onClick={() => setSyncNotice(null)} className="text-zinc-400 hover:text-white text-xs px-1">✕</button>
            </div>
          )}

          {/* Overview / Synopsis */}
          {media.overview && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">Overview</h3>
              <p className="text-sm text-zinc-300 leading-relaxed">{media.overview}</p>
            </div>
          )}

          {/* TV SERIES SPECIFIC TRACKING */}
          {isTv && (
            <div className="space-y-6 pt-2 border-t border-zinc-800">
              
              {/* 1. PRECISE SEASON & EPISODE INSERTION TOOL */}
              <div className="p-4 bg-[var(--accent-bg)] rounded-xl border border-[var(--accent)]/30 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <Eye className="w-4 h-4 text-[var(--accent)]" />
                    <h3 className="text-sm font-bold text-[var(--text-primary)]">Precise Progress Setter</h3>
                  </div>
                  <span className="text-xs text-[var(--text-secondary)] font-mono">
                    Currently at: {media.currentSeason ? `S${media.currentSeason}` : 'S1'} {media.currentEpisode ? `E${media.currentEpisode}` : 'E0'}
                  </span>
                </div>

                <p className="text-xs text-[var(--text-secondary)]">
                  Quickly set the exact season and episode you have reached:
                </p>

                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2 bg-[var(--bg-primary)] px-3 py-1.5 rounded-lg border border-[var(--border-light)]">
                    <span className="text-xs text-[var(--text-secondary)] font-medium">Season:</span>
                    <input
                      type="number"
                      min="1"
                      max={seasonNumbers[seasonNumbers.length - 1] || 50}
                      value={inputSeason}
                      onChange={(e) => setInputSeason(e.target.value)}
                      className="w-14 bg-[var(--card-bg)] px-2 py-1 rounded text-xs text-center font-bold text-[var(--accent)] border border-[var(--border-light)] focus:outline-none focus:border-[var(--accent)]"
                    />
                  </div>

                  <div className="flex items-center gap-2 bg-[var(--bg-primary)] px-3 py-1.5 rounded-lg border border-[var(--border-light)]">
                    <span className="text-xs text-[var(--text-secondary)] font-medium">Episode:</span>
                    <input
                      type="number"
                      min="0"
                      max="200"
                      value={inputEpisode}
                      onChange={(e) => setInputEpisode(e.target.value)}
                      className="w-14 bg-[var(--card-bg)] px-2 py-1 rounded text-xs text-center font-bold text-[var(--accent)] border border-[var(--border-light)] focus:outline-none focus:border-[var(--accent)]"
                    />
                  </div>

                  <button
                    onClick={() => handleApplyExactProgress(true)}
                    className="px-3.5 py-2 rounded-lg bg-[var(--accent)] hover:brightness-110 text-white text-xs font-bold transition-all shadow-md shadow-[var(--accent)]/25 active:scale-95"
                  >
                    Set & Mark Watched
                  </button>

                  <button
                    onClick={() => handleApplyExactProgress(false)}
                    className="px-3 py-2 rounded-lg bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-xs font-medium border border-[var(--border-light)] transition-all"
                    title="Update current pointer without altering episode checkboxes"
                  >
                    Set Pointer Only
                  </button>
                </div>
              </div>

              {/* 2. NEXT UP TO WATCH HIGHLIGHT */}
              {nextUpEpisode && (
                <div className="flex items-center justify-between gap-3 p-3.5 rounded-xl bg-[var(--accent-bg)] border border-[var(--accent)]/30 text-xs">
                  <div className="flex items-center gap-2.5">
                    <PlayCircle className="w-5 h-5 text-[var(--accent)] shrink-0" />
                    <div>
                      <span className="font-semibold text-[var(--accent)]">Up Next: </span>
                      <span className="text-[var(--text-primary)] font-bold">
                        S{nextUpEpisode.seasonNumber}E{nextUpEpisode.episodeNumber}
                      </span>
                      <span className="text-[var(--text-secondary)] font-medium ml-1">
                        — "{nextUpEpisode.title}"
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => handleToggleEpisode(nextUpEpisode)}
                    className="px-3 py-1.5 rounded-lg bg-[var(--accent)] hover:brightness-110 text-white font-bold text-xs shrink-0 transition-all shadow-sm"
                  >
                    Mark Watched
                  </button>
                </div>
              )}

              {/* 3. SEASON TABS & EPISODE CHECKLIST WITH TITLES */}
              <div>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <h3 className="text-sm font-bold text-[var(--text-primary)]">Episodes & Seasons</h3>
                  <span className="text-xs text-[var(--text-secondary)]">
                    Total: {episodes.length} episodes
                  </span>
                </div>

                {/* Season selector tabs */}
                {seasonNumbers.length > 0 ? (
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-2 mb-3 scrollbar-none">
                    {seasonNumbers.map(sNum => {
                      const seasonEps = episodes.filter(e => e.seasonNumber === sNum);
                      const watched = seasonEps.filter(e => e.isWatched === 1).length;
                      const isDone = seasonEps.length > 0 && watched === seasonEps.length;
                      const isSelected = selectedSeason === sNum;

                      return (
                        <button
                          key={sNum}
                          onClick={() => setSelectedSeason(sNum)}
                          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all border ${
                            isSelected
                              ? 'bg-[var(--accent)] text-white border-[var(--accent)] shadow-sm'
                              : 'bg-[var(--card-bg)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border-[var(--border-light)]'
                          }`}
                        >
                          <span>Season {sNum}</span>
                          <span
                            className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                              isDone ? 'bg-emerald-950 text-emerald-400' : isSelected ? 'bg-black/20 text-white' : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'
                            }`}
                          >
                            {watched}/{seasonEps.length}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-xs text-zinc-500 py-3">
                    No episode breakdowns loaded yet. You can click "Edit" to generate seasons and episodes.
                  </div>
                )}

                {/* Selected Season Header Actions */}
                {currentSeasonEpisodes.length > 0 && (
                  <div className="flex items-center justify-between bg-zinc-950 px-3.5 py-2 rounded-xl border border-zinc-800/80 mb-3">
                    <span className="text-xs font-semibold text-zinc-300">
                      Season {selectedSeason} ({currentSeasonWatchedCount}/{currentSeasonEpisodes.length} watched)
                    </span>

                    <button
                      onClick={() => handleToggleSeason(selectedSeason, !isSeasonFullyWatched)}
                      className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-all ${
                        isSeasonFullyWatched
                          ? 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                          : 'bg-emerald-900/40 text-emerald-300 hover:bg-emerald-800/50 border border-emerald-700/50'
                      }`}
                    >
                      {isSeasonFullyWatched ? 'Mark Season Unwatched' : 'Mark Season Watched'}
                    </button>
                  </div>
                )}

                {/* Episode List with Titles & Checkboxes */}
                <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                  {currentSeasonEpisodes.map(ep => {
                    const isWatched = ep.isWatched === 1;
                    const isExpanded = !!expandedEpisodes[ep.id];

                    return (
                      <div
                        key={ep.id}
                        className={`p-3 rounded-xl border transition-all ${
                          isWatched
                            ? 'bg-zinc-950/40 border-zinc-800/60 opacity-80'
                            : 'bg-zinc-950 border-zinc-800/90 hover:border-zinc-700'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <label className="flex items-center gap-3 cursor-pointer flex-1 min-w-0">
                            <input
                              type="checkbox"
                              checked={isWatched}
                              onChange={() => handleToggleEpisode(ep)}
                              className="w-4 h-4 rounded bg-[var(--card-bg)] border-[var(--border-light)] accent-[var(--accent)] cursor-pointer"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-bold font-mono text-[var(--text-secondary)]">
                                  E{String(ep.episodeNumber).padStart(2, '0')}
                                </span>
                                <span className={`text-xs font-semibold truncate ${isWatched ? 'line-through text-[var(--text-secondary)] opacity-60' : 'text-[var(--text-primary)]'}`}>
                                  {ep.title}
                                </span>
                              </div>
                              {ep.airDate && (
                                <span className="text-[11px] text-[var(--text-secondary)]">
                                  Aired: {ep.airDate}
                                </span>
                              )}
                            </div>
                          </label>

                          {ep.overview && (
                            <button
                              onClick={() => toggleExpand(ep.id)}
                              className="p-1 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                              title="Toggle episode synopsis"
                            >
                              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </button>
                          )}
                        </div>

                        {/* Expandable episode summary */}
                        {isExpanded && ep.overview && (
                          <div className="mt-2.5 pt-2 border-t border-[var(--border-light)] text-xs text-[var(--text-secondary)] leading-relaxed">
                            {ep.overview}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

              </div>
            </div>
          )}

          {/* User Notes Section */}
          <div className="pt-4 border-t border-[var(--border-light)]">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">My Notes & Thoughts</h3>
              {notesSavedNotice && (
                <span className="text-xs text-emerald-400 font-medium animate-fadeIn">
                  Saved!
                </span>
              )}
            </div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add your personal review, where you left off, favorite character, or comments..."
              rows={3}
              className="w-full p-3 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl text-xs text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:outline-none focus:border-[var(--input-focus)] leading-relaxed"
            />
            <div className="flex justify-end mt-2">
              <button
                onClick={handleSaveNotes}
                disabled={isSavingNotes}
                className="px-3.5 py-1.5 rounded-lg bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] text-xs font-medium border border-[var(--border-light)] transition-all"
              >
                {isSavingNotes ? 'Saving...' : 'Save Notes'}
              </button>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
