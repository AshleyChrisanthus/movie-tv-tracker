import React, { useState } from 'react';
import { X, Film, Tv, Plus, Save } from 'lucide-react';
import { saveMediaItem } from '../db';

export default function ManualMediaModal({ isOpen, onClose, onSaved, initialData = null }) {
  const isEditing = !!initialData;

  const [title, setTitle] = useState(initialData?.title || '');
  const [type, setType] = useState(initialData?.type || 'tv');
  const [year, setYear] = useState(initialData?.year || new Date().getFullYear());
  const [posterUrl, setPosterUrl] = useState(initialData?.posterUrl || '');
  const [backdropUrl, setBackdropUrl] = useState(initialData?.backdropUrl || '');
  const [overview, setOverview] = useState(initialData?.overview || '');
  const [status, setStatus] = useState(initialData?.status || 'plan_to_watch');
  const [rating, setRating] = useState(initialData?.rating || 0);

  // TV Specific
  const [seasonCount, setSeasonCount] = useState(initialData?.totalSeasons || 1);
  const [episodesPerSeason, setEpisodesPerSeason] = useState(10);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) {
      alert('Please enter a title');
      return;
    }

    setIsSubmitting(true);
    try {
      let episodes = [];
      const isTv = type === 'tv';

      if (isTv) {
        const sCount = Math.max(1, parseInt(seasonCount, 10) || 1);
        const epCount = Math.max(1, parseInt(episodesPerSeason, 10) || 1);

        // Generate episode template if new series or updating season counts
        for (let s = 1; s <= sCount; s++) {
          for (let ep = 1; ep <= epCount; ep++) {
            episodes.push({
              seasonNumber: s,
              episodeNumber: ep,
              title: `Episode ${ep}`,
              overview: '',
              isWatched: 0
            });
          }
        }
      }

      const mediaPayload = {
        ...(initialData || {}),
        title: title.trim(),
        type,
        year: String(year),
        posterUrl: posterUrl.trim() || null,
        backdropUrl: backdropUrl.trim() || null,
        overview: overview.trim(),
        status,
        rating: Number(rating),
        source: initialData?.source || 'manual',
        totalSeasons: isTv ? parseInt(seasonCount, 10) || 1 : 0,
        totalEpisodes: isTv ? episodes.length : 1
      };

      const saved = await saveMediaItem(mediaPayload, episodes.length > 0 ? episodes : undefined);
      if (onSaved) onSaved(saved);
      onClose();
    } catch (err) {
      console.error('Failed to save manual media:', err);
      alert('Failed to save entry. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-sm overflow-y-auto animate-fadeIn">
      <div className="relative w-full max-w-xl bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden my-auto">
        
        {/* Header */}
        <div className="p-4 border-b border-zinc-800 bg-zinc-950 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-indigo-600/20 text-indigo-400">
              {type === 'tv' ? <Tv className="w-5 h-5" /> : <Film className="w-5 h-5" />}
            </div>
            <div>
              <h2 className="text-base font-bold text-white">
                {isEditing ? 'Edit Media Details' : 'Add Custom Movie / Show'}
              </h2>
              <p className="text-xs text-zinc-400">
                Manually record YouTube series, anime specials, or personal entries
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors"
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
                  ? 'bg-indigo-600 text-white border-indigo-500 shadow-md shadow-indigo-600/25'
                  : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:text-white'
              }`}
            >
              <Tv className="w-4 h-4" />
              <span>TV Series / Web Show</span>
            </button>
            <button
              type="button"
              onClick={() => setType('movie')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold transition-all border ${
                type === 'movie'
                  ? 'bg-violet-600 text-white border-violet-500 shadow-md shadow-violet-600/25'
                  : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:text-white'
              }`}
            >
              <Film className="w-4 h-4" />
              <span>Movie / Film</span>
            </button>
          </div>

          {/* Title & Year */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="sm:col-span-3">
              <label className="block text-xs font-medium text-zinc-400 mb-1">Title *</label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Critical Role, Local Indie Film..."
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">Year</label>
              <input
                type="text"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                placeholder="2026"
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Status & Rating */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-zinc-200 focus:outline-none focus:border-indigo-500 cursor-pointer"
              >
                <option value="watching">Watching</option>
                <option value="plan_to_watch">Plan to Watch</option>
                <option value="completed">Completed</option>
                <option value="on_hold">On Hold</option>
                <option value="dropped">Dropped</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">Rating (1-10)</label>
              <select
                value={rating}
                onChange={(e) => setRating(Number(e.target.value))}
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-amber-300 focus:outline-none focus:border-indigo-500 cursor-pointer"
              >
                <option value="0">Unrated</option>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                  <option key={n} value={n}>{n} / 10</option>
                ))}
              </select>
            </div>
          </div>

          {/* TV Shows: Seasons & Episodes generator */}
          {type === 'tv' && (
            <div className="p-3.5 bg-zinc-950 rounded-xl border border-zinc-800 space-y-3">
              <span className="text-xs font-bold text-indigo-400 block">
                Seasons & Episode Structure
              </span>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">Number of Seasons</label>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={seasonCount}
                    onChange={(e) => setSeasonCount(e.target.value)}
                    className="w-full px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">Episodes Per Season</label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={episodesPerSeason}
                    onChange={(e) => setEpisodesPerSeason(e.target.value)}
                    className="w-full px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
              <p className="text-[11px] text-zinc-500">
                Total episodes generated: {(parseInt(seasonCount, 10) || 1) * (parseInt(episodesPerSeason, 10) || 1)}
              </p>
            </div>
          )}

          {/* Poster URL (Optional) */}
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">
              Poster Image URL (Optional)
            </label>
            <input
              type="url"
              value={posterUrl}
              onChange={(e) => setPosterUrl(e.target.value)}
              placeholder="https://example.com/poster.jpg"
              className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Overview */}
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">Overview / Description</label>
            <textarea
              rows={3}
              value={overview}
              onChange={(e) => setOverview(e.target.value)}
              placeholder="Synopsis, premise, or personal description..."
              className="w-full p-3 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Footer Submit */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow-md shadow-indigo-600/30 active:scale-95 disabled:opacity-50"
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
