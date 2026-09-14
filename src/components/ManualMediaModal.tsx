import React, { useState, useEffect } from 'react';
import { X, Film, Tv, Save, AlertCircle, Eye, BookOpen } from 'lucide-react';
import { saveMediaItem, getAllMedia, type EpisodeInput } from '../db';
import type { MediaItem, MediaType, MediaStatus } from '../types';

export interface ManualMediaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: () => void;
  onSelectExisting?: (item: MediaItem) => void;
  initialItem?: MediaItem | null;
  initialData?: MediaItem | null;
}

export default function ManualMediaModal({
  isOpen,
  onClose,
  onSaved,
  onSelectExisting,
  initialItem = null,
  initialData = null
}: ManualMediaModalProps): React.JSX.Element | null {
  const item = initialItem || initialData || null;
  const isEditing = !!item;

  const [existingItems, setExistingItems] = useState<MediaItem[]>([]);
  const [type, setType] = useState<MediaType>(item?.type || 'tv');
  const [title, setTitle] = useState<string>(item?.title || '');
  const [year, setYear] = useState<string | number>(item?.year || new Date().getFullYear());
  const [status, setStatus] = useState<MediaStatus>(item?.status || 'plan_to_watch');
  const [rating, setRating] = useState<number>(item?.rating || 0);
  const [overview, setOverview] = useState<string>(item?.overview || '');
  const [posterUrl, setPosterUrl] = useState<string>(item?.posterUrl || '');
  const [author, setAuthor] = useState<string>(item?.author || '');
  const [progressMode, setProgressMode] = useState<'pages' | 'chapters'>(item?.progressMode || 'pages');
  const [totalPages, setTotalPages] = useState<number | string>(item?.totalPages || 300);
  const [currentPage, setCurrentPage] = useState<number | string>(item?.currentPage || 0);
  const [totalChapters, setTotalChapters] = useState<number | string>(item?.totalChapters || 20);
  const [currentChapter, setCurrentChapter] = useState<number | string>(item?.currentChapter || 0);
  const [isbn, setIsbn] = useState<string>(item?.isbn || '');
  
  // Custom episodes generator
  const [seasonCount, setSeasonCount] = useState<number | string>(item?.totalSeasons || 1);
  const [episodesPerSeason, setEpisodesPerSeason] = useState<number | string>(
    item?.totalSeasons && item?.totalEpisodes 
      ? Math.round(item.totalEpisodes / item.totalSeasons) 
      : 10
  );

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      getAllMedia().then(setExistingItems);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!title.trim()) return;

    setIsSubmitting(true);

    try {
      const sCount = parseInt(String(seasonCount), 10) || 1;
      const epCount = parseInt(String(episodesPerSeason), 10) || 1;
      const parsedPages = parseInt(String(totalPages), 10) || 0;
      const parsedCurrentPage = parseInt(String(currentPage), 10) || 0;
      const parsedTotalChapters = parseInt(String(totalChapters), 10) || 0;
      const parsedCurrentChapter = parseInt(String(currentChapter), 10) || 0;
      const totalEpisodes = type === 'tv'
        ? sCount * epCount
        : type === 'book'
          ? (progressMode === 'chapters' ? (parsedTotalChapters || 1) : (parsedPages || 1))
          : 1;
      const watchedCount = type === 'book'
        ? (progressMode === 'chapters' ? parsedCurrentChapter : parsedCurrentPage)
        : (item?.watchedEpisodesCount || 0);

      // Generate episodes array if adding new TV series or if none exist
      const generatedEpisodes: EpisodeInput[] = [];
      if (type === 'tv' && !isEditing) {
        for (let s = 1; s <= sCount; s++) {
          for (let ep = 1; ep <= epCount; ep++) {
            generatedEpisodes.push({
              seasonNumber: s,
              episodeNumber: ep,
              title: `Episode ${ep}`,
              overview: '',
              airDate: '',
              isWatched: 0
            });
          }
        }
      }

      const mediaPayload: Partial<MediaItem> = {
        ...(item || {}),
        title: title.trim(),
        year: parseInt(String(year), 10) || new Date().getFullYear(),
        type,
        status,
        rating: Number(rating) || 0,
        overview: overview.trim(),
        posterUrl: posterUrl.trim() || null,
        backdropUrl: posterUrl.trim() || null,
        author: type === 'book' ? author.trim() : undefined,
        isbn: type === 'book' ? isbn.trim() : undefined,
        progressMode: type === 'book' ? progressMode : undefined,
        totalPages: type === 'book' ? parsedPages : undefined,
        currentPage: type === 'book' ? parsedCurrentPage : undefined,
        totalChapters: type === 'book' ? parsedTotalChapters : undefined,
        currentChapter: type === 'book' ? parsedCurrentChapter : undefined,
        source: item?.source || 'custom',
        externalId: item?.externalId || `custom_${Date.now()}`,
        totalSeasons: type === 'tv' ? sCount : 0,
        totalEpisodes,
        watchedEpisodesCount: watchedCount
      };

      await saveMediaItem(mediaPayload, generatedEpisodes);

      if (onSaved) onSaved();
      onClose();
    } catch (err) {
      console.error('Failed to save manual media entry:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/65 backdrop-blur-md overflow-y-auto animate-fadeIn">
      <div className="relative w-full max-w-xl bg-[var(--card-bg)] border border-[var(--border-light)] rounded-2xl shadow-2xl overflow-hidden my-auto">
        
        {/* Header */}
        <div className="p-4 border-b border-[var(--border-light)] bg-[var(--bg-primary)] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[var(--accent-bg)] text-[var(--accent)]">
              {type === 'tv' ? <Tv className="w-5 h-5" /> : type === 'book' ? <BookOpen className="w-5 h-5" /> : <Film className="w-5 h-5" />}
            </div>
            <div>
              <h2 className="text-base font-bold text-[var(--text-primary)]">
                {isEditing ? 'Edit Media Details' : 'Add Custom Entry'}
              </h2>
              <p className="text-xs text-[var(--text-secondary)]">
                Manually record books, web series, indie movies, or personal entries
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
          
          {/* Media Type toggle */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setType('tv')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold transition-all border ${
                type === 'tv'
                  ? 'bg-[var(--accent)] text-white border-[var(--accent)] shadow-md shadow-[var(--accent)]/20'
                  : 'bg-[var(--bg-primary)] text-[var(--text-secondary)] border-[var(--border-light)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Tv className="w-4 h-4" />
              <span>TV Series</span>
            </button>
            <button
              type="button"
              onClick={() => setType('movie')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold transition-all border ${
                type === 'movie'
                  ? 'bg-[var(--accent)] text-white border-[var(--accent)] shadow-md shadow-[var(--accent)]/20'
                  : 'bg-[var(--bg-primary)] text-[var(--text-secondary)] border-[var(--border-light)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Film className="w-4 h-4" />
              <span>Movie</span>
            </button>
            <button
              type="button"
              onClick={() => setType('book')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold transition-all border ${
                type === 'book'
                  ? 'bg-[var(--accent)] text-white border-[var(--accent)] shadow-md shadow-[var(--accent)]/20'
                  : 'bg-[var(--bg-primary)] text-[var(--text-secondary)] border-[var(--border-light)] hover:text-[var(--text-primary)]'
              }`}
            >
              <BookOpen className="w-4 h-4" />
              <span>Book</span>
            </button>
          </div>

          {/* Title & Year */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="sm:col-span-3">
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Title *</label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Critical Role, Local Indie Film..."
                className="w-full px-3 py-2 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl text-xs text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:outline-none focus:border-[var(--input-focus)]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Year</label>
              <input
                type="text"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                placeholder="2026"
                className="w-full px-3 py-2 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl text-xs text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:outline-none focus:border-[var(--input-focus)]"
              />
            </div>
          </div>

          {/* Duplicate Warning Banner */}
          {!isEditing && title.trim() && existingItems.some(libItem => libItem.type === type && libItem.title.trim().toLowerCase() === title.trim().toLowerCase()) && (() => {
            const match = existingItems.find(libItem => libItem.type === type && libItem.title.trim().toLowerCase() === title.trim().toLowerCase())!;
            return (
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between text-xs text-amber-300">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
                  <span>
                    <strong>{match.title}</strong> is already in your library ({match.year || 'N/A'}).
                  </span>
                </div>
                {onSelectExisting && (
                  <button
                    type="button"
                    onClick={() => {
                      onSelectExisting(match);
                      onClose();
                    }}
                    className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 text-xs font-semibold flex items-center gap-1 transition-colors"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>View Entry</span>
                  </button>
                )}
              </div>
            );
          })()}

          {/* Status & Rating */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as MediaStatus)}
                className="w-full px-3 py-2 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--input-focus)] cursor-pointer"
              >
                {type === 'book' ? (
                  <>
                    <option value="watching" className="bg-[var(--card-bg)]">Reading</option>
                    <option value="plan_to_watch" className="bg-[var(--card-bg)]">Plan to Read</option>
                    <option value="completed" className="bg-[var(--card-bg)]">Read</option>
                    <option value="on_hold" className="bg-[var(--card-bg)]">On Hold</option>
                    <option value="dropped" className="bg-[var(--card-bg)]">Did Not Finish (DNF)</option>
                  </>
                ) : (
                  <>
                    <option value="watching" className="bg-[var(--card-bg)]">Watching</option>
                    <option value="plan_to_watch" className="bg-[var(--card-bg)]">Plan to Watch</option>
                    <option value="completed" className="bg-[var(--card-bg)]">Completed</option>
                    <option value="on_hold" className="bg-[var(--card-bg)]">On Hold</option>
                    <option value="dropped" className="bg-[var(--card-bg)]">Dropped</option>
                  </>
                )}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Rating (1-10)</label>
              <select
                value={rating}
                onChange={(e) => setRating(Number(e.target.value))}
                className="w-full px-3 py-2 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl text-xs text-amber-300 focus:outline-none focus:border-[var(--input-focus)] cursor-pointer"
              >
                <option value="0" className="bg-[var(--card-bg)]">Unrated</option>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                  <option key={n} value={n} className="bg-[var(--card-bg)]">{n} / 10</option>
                ))}
              </select>
            </div>
          </div>

          {/* TV Shows: Seasons & Episodes generator */}
          {type === 'tv' && (
            <div className="p-3.5 bg-[var(--bg-primary)] rounded-xl border border-[var(--border-light)] space-y-3">
              <span className="text-xs font-bold text-[var(--accent)] block">
                Seasons & Episode Structure
              </span>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">Number of Seasons</label>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={seasonCount}
                    onChange={(e) => setSeasonCount(e.target.value)}
                    className="w-full px-3 py-1.5 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--input-focus)]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">Episodes Per Season</label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={episodesPerSeason}
                    onChange={(e) => setEpisodesPerSeason(e.target.value)}
                    className="w-full px-3 py-1.5 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--input-focus)]"
                  />
                </div>
              </div>
              <p className="text-[11px] text-[var(--text-secondary)]">
                Total episodes generated: {(parseInt(String(seasonCount), 10) || 1) * (parseInt(String(episodesPerSeason), 10) || 1)}
              </p>
            </div>
          )}

          {/* Book Structure & Progress Options */}
          {type === 'book' && (
            <div className="p-3.5 bg-[var(--bg-primary)] rounded-xl border border-[var(--border-light)] space-y-3">
              <span className="text-xs font-bold text-[var(--accent)] block">
                Book Information & Tracking Mode
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">Author(s)</label>
                  <input
                    type="text"
                    value={author}
                    onChange={(e) => setAuthor(e.target.value)}
                    placeholder="e.g. Brandon Sanderson"
                    className="w-full px-3 py-1.5 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--input-focus)]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">ISBN (Optional)</label>
                  <input
                    type="text"
                    value={isbn}
                    onChange={(e) => setIsbn(e.target.value)}
                    placeholder="e.g. 9780765326355"
                    className="w-full px-3 py-1.5 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--input-focus)] font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] text-[var(--text-secondary)] mb-1.5 font-medium">Tracking Unit</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setProgressMode('pages')}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                      progressMode === 'pages'
                        ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                        : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] border-[var(--border-light)]'
                    }`}
                  >
                    📖 Track by Pages
                  </button>
                  <button
                    type="button"
                    onClick={() => setProgressMode('chapters')}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                      progressMode === 'chapters'
                        ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                        : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] border-[var(--border-light)]'
                    }`}
                  >
                    📑 Track by Chapters
                  </button>
                </div>
              </div>

              {progressMode === 'pages' ? (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] text-[var(--text-secondary)] mb-1">Current Page</label>
                    <input
                      type="number"
                      min="0"
                      value={currentPage}
                      onChange={(e) => setCurrentPage(e.target.value)}
                      className="w-full px-3 py-1.5 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--input-focus)]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-[var(--text-secondary)] mb-1">Total Pages</label>
                    <input
                      type="number"
                      min="0"
                      value={totalPages}
                      onChange={(e) => setTotalPages(e.target.value)}
                      className="w-full px-3 py-1.5 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--input-focus)]"
                    />
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] text-[var(--text-secondary)] mb-1">Current Chapter</label>
                    <input
                      type="number"
                      min="0"
                      value={currentChapter}
                      onChange={(e) => setCurrentChapter(e.target.value)}
                      className="w-full px-3 py-1.5 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--input-focus)]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-[var(--text-secondary)] mb-1">Total Chapters</label>
                    <input
                      type="number"
                      min="0"
                      value={totalChapters}
                      onChange={(e) => setTotalChapters(e.target.value)}
                      className="w-full px-3 py-1.5 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--input-focus)]"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Poster URL (Optional) */}
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
              Poster Image URL (Optional)
            </label>
            <input
              type="url"
              value={posterUrl}
              onChange={(e) => setPosterUrl(e.target.value)}
              placeholder="https://example.com/poster.jpg"
              className="w-full px-3 py-2 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl text-xs text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:outline-none focus:border-[var(--input-focus)]"
            />
          </div>

          {/* Overview */}
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Overview / Description</label>
            <textarea
              rows={3}
              value={overview}
              onChange={(e) => setOverview(e.target.value)}
              placeholder="Synopsis, premise, or personal description..."
              className="w-full p-3 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl text-xs text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:outline-none focus:border-[var(--input-focus)]"
            />
          </div>

          {/* Footer Submit */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--border-light)]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-xs font-medium transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--accent)] hover:brightness-110 text-white text-xs font-bold transition-all shadow-md shadow-[var(--accent)]/25 active:scale-95 disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>{isSubmitting ? 'Saving...' : isEditing ? 'Save Changes' : 'Add to Library'}</span>
            </button>
          </div>

        </form>

      </div>
    </div>
  );
}
