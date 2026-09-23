import React, { memo } from 'react';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { Film, Tv, BookOpen, Star, Trash2, ExternalLink } from 'lucide-react';
import type { CanvasNodeData } from '../../types';

export type FranchiseMediaNodeType = Node<
  CanvasNodeData & {
    onInspect?: (data: CanvasNodeData) => void;
    onDelete?: (nodeId: string) => void;
  },
  'mediaNode'
>;

export type FranchiseMediaNodeProps = NodeProps<FranchiseMediaNodeType>;

const statusStyles: Record<string, { label: string; bg: string; text: string }> = {
  completed: { label: 'Watched', bg: 'bg-emerald-500/15', text: 'text-emerald-400 border-emerald-500/30' },
  watching: { label: 'Watching', bg: 'bg-blue-500/15', text: 'text-blue-400 border-blue-500/30' },
  plan_to_watch: { label: 'Plan to Watch', bg: 'bg-amber-500/15', text: 'text-amber-400 border-amber-500/30' },
  caught_up: { label: 'Caught Up', bg: 'bg-indigo-500/15', text: 'text-indigo-400 border-indigo-500/30' },
  on_hold: { label: 'On Hold', bg: 'bg-orange-500/15', text: 'text-orange-400 border-orange-500/30' },
  dropped: { label: 'Dropped', bg: 'bg-rose-500/15', text: 'text-rose-400 border-rose-500/30' },
};

export const FranchiseMediaNode = memo(({ id, data, selected }: FranchiseMediaNodeProps) => {
  const isMovie = data.type === 'movie';
  const isTv = data.type === 'tv';
  const isBook = data.type === 'book';

  const statusInfo = data.status ? statusStyles[data.status] : null;
  const ratingValue = (data.rating !== null && data.rating !== undefined && data.rating > 0)
    ? data.rating
    : data.communityRating;

  return (
    <div
      className={`group relative w-64 rounded-2xl bg-[var(--card-bg)] border transition-all duration-200 select-none shadow-xl ${
        selected
          ? 'border-[var(--accent)] ring-2 ring-[var(--accent)]/30 scale-102'
          : 'border-[var(--border-light)] hover:border-[var(--accent)]/60'
      }`}
    >
      {/* Handles on 4 sides */}
      <Handle
        type="target"
        position={Position.Left}
        id="left-target"
        className="!w-3 !h-3 !bg-[var(--accent)] !border-2 !border-[var(--bg-primary)] opacity-0 group-hover:opacity-100 transition-opacity"
      />
      <Handle
        type="source"
        position={Position.Right}
        id="right-source"
        className="!w-3 !h-3 !bg-[var(--accent)] !border-2 !border-[var(--bg-primary)] opacity-0 group-hover:opacity-100 transition-opacity"
      />
      <Handle
        type="target"
        position={Position.Top}
        id="top-target"
        className="!w-3 !h-3 !bg-[var(--accent)] !border-2 !border-[var(--bg-primary)] opacity-0 group-hover:opacity-100 transition-opacity"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="bottom-source"
        className="!w-3 !h-3 !bg-[var(--accent)] !border-2 !border-[var(--bg-primary)] opacity-0 group-hover:opacity-100 transition-opacity"
      />

      {/* Card Content */}
      <div className="flex p-3 gap-3">
        {/* Poster / Artwork */}
        <div className="w-16 h-24 rounded-xl bg-[var(--bg-tertiary)] overflow-hidden shrink-0 relative border border-[var(--border-light)]">
          {data.posterUrl ? (
            <img
              src={data.posterUrl}
              alt={data.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-[var(--text-tertiary)]">
              {isMovie && <Film className="w-6 h-6" />}
              {isTv && <Tv className="w-6 h-6" />}
              {isBook && <BookOpen className="w-6 h-6" />}
            </div>
          )}

          {/* Type Badge on Poster */}
          <div className="absolute top-1 left-1 px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider bg-black/75 backdrop-blur-xs text-white">
            {isMovie ? 'Movie' : isTv ? 'TV' : isBook ? 'Book' : 'Media'}
          </div>
        </div>

        {/* Info Column */}
        <div className="flex-1 min-w-0 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-1 mb-1">
              <span className="text-[11px] font-semibold text-[var(--text-secondary)]">
                {data.year || 'N/A'}
              </span>
              {ratingValue !== null && ratingValue !== undefined && ratingValue > 0 && (
                <div className="flex items-center gap-0.5 text-amber-400 text-[11px] font-bold">
                  <Star className="w-3 h-3 fill-amber-400" />
                  <span>{ratingValue.toFixed(1)}</span>
                </div>
              )}
            </div>

            <h4
              className="text-xs font-bold text-[var(--text-primary)] leading-snug line-clamp-2 group-hover:text-[var(--accent)] transition-colors"
              title={data.title}
            >
              {data.title}
            </h4>
          </div>

          {/* Status & Actions */}
          <div className="pt-2 flex items-center justify-between gap-2 border-t border-[var(--border-light)]/60">
            {statusInfo ? (
              <span
                className={`text-[10px] font-medium px-2 py-0.5 rounded-md border ${statusInfo.bg} ${statusInfo.text} truncate max-w-[100px]`}
              >
                {statusInfo.label}
              </span>
            ) : (
              <span className="text-[10px] text-[var(--text-tertiary)]">Unlisted</span>
            )}

            <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  data.onInspect?.(data);
                }}
                className="p-1 rounded-md bg-[var(--bg-tertiary)] hover:bg-[var(--accent)] hover:text-white text-[var(--text-secondary)] transition-colors"
                title="Inspect / Edit in Library"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
              {data.onDelete && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    data.onDelete?.(id);
                  }}
                  className="p-1 rounded-md bg-[var(--bg-tertiary)] hover:bg-rose-500 hover:text-white text-[var(--text-secondary)] transition-colors"
                  title="Remove from board"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

FranchiseMediaNode.displayName = 'FranchiseMediaNode';
