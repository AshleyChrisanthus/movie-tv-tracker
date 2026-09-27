import React, { useState, useEffect } from 'react';
import { X, Trash2, ArrowRight, Sparkles, Check } from 'lucide-react';
import type { CanvasEdge, CanvasEdgeType } from '../../types';

export interface CanvasEdgeEditModalProps {
  edge: CanvasEdge | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updatedEdge: CanvasEdge) => void;
  onDelete: (edgeId: string) => void;
}

const RELATION_TYPES: { type: CanvasEdgeType; label: string; description: string; color: string }[] = [
  { type: 'sequel', label: 'Sequel', description: 'Direct continuation / next chapter', color: '#6366f1' },
  { type: 'prequel', label: 'Prequel', description: 'Story set prior in the universe', color: '#8b5cf6' },
  { type: 'chronological', label: 'Story Timeline', description: 'In-universe chronological sequence', color: '#10b981' },
  { type: 'release', label: 'Release Order', description: 'Theatrical / broadcast release sequence', color: '#3b82f6' },
  { type: 'spinoff', label: 'Spin-off', description: 'Branching character or side story', color: '#f59e0b' },
  { type: 'crossover', label: 'Crossover', description: 'Character or universe crossover event', color: '#ec4899' },
  { type: 'custom', label: 'Custom', description: 'User-specified relationship', color: '#64748b' }
];

export const CanvasEdgeEditModal: React.FC<CanvasEdgeEditModalProps> = ({
  edge,
  isOpen,
  onClose,
  onSave,
  onDelete
}) => {
  const [relationType, setRelationType] = useState<CanvasEdgeType>(edge?.relationType || 'sequel');
  const [label, setLabel] = useState<string>(edge?.label || '');
  const [isAnimated, setIsAnimated] = useState<boolean>(edge?.animated ?? false);

  // Handle Escape key to close modal
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !edge) return null;

  const handleSelectType = (t: CanvasEdgeType, defaultLabel: string) => {
    setRelationType(t);
    if (!label || RELATION_TYPES.some(r => r.label === label)) {
      setLabel(defaultLabel);
    }
  };

  const handleSave = () => {
    onSave({
      ...edge,
      relationType,
      label: label.trim() || undefined,
      animated: isAnimated
    });
    onClose();
  };

  return (
    <div 
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
    >
      <div className="w-full max-w-md bg-[var(--bg-secondary)] border border-[var(--border-light)] rounded-3xl shadow-2xl p-6 relative">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-[var(--border-light)] mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-[var(--accent)]/15 text-[var(--accent)] flex items-center justify-center">
              <ArrowRight className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[var(--text-primary)]">Edit Connection</h3>
              <p className="text-xs text-[var(--text-secondary)]">Define relation between media nodes</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Relation Types */}
        <div className="mb-4">
          <label className="block text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2">
            Relationship Type
          </label>
          <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
            {RELATION_TYPES.map(rel => {
              const isSelected = relationType === rel.type;
              return (
                <button
                  key={rel.type}
                  type="button"
                  onClick={() => handleSelectType(rel.type, rel.label)}
                  className={`flex flex-col items-start p-2.5 rounded-xl border text-left transition-all ${
                    isSelected
                      ? 'bg-[var(--accent)]/15 border-[var(--accent)] ring-1 ring-[var(--accent)]'
                      : 'bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] border-[var(--border-light)]'
                  }`}
                >
                  <div className="flex items-center justify-between w-full mb-0.5">
                    <span className="text-xs font-bold text-[var(--text-primary)]">{rel.label}</span>
                    {isSelected && <Check className="w-3.5 h-3.5 text-[var(--accent)]" />}
                  </div>
                  <span className="text-[10px] text-[var(--text-secondary)] line-clamp-1">{rel.description}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Custom Label */}
        <div className="mb-4">
          <label className="block text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-1.5">
            Display Label
          </label>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Sequel, Watch after S2, Alternate Timeline"
            className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--input-bg)] border border-[var(--input-border)] focus:border-[var(--accent)] focus:outline-none text-xs text-[var(--text-primary)] transition-all"
          />
        </div>

        {/* Animated Flow Toggle */}
        <div className="mb-6 flex items-center justify-between p-3 rounded-2xl bg-[var(--bg-tertiary)] border border-[var(--border-light)]">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[var(--accent)]" />
            <div>
              <span className="text-xs font-bold text-[var(--text-primary)]">Animated Pulse</span>
              <p className="text-[10px] text-[var(--text-secondary)]">Shows animated flow along connection arrow</p>
            </div>
          </div>
          <input
            type="checkbox"
            checked={isAnimated}
            onChange={(e) => setIsAnimated(e.target.checked)}
            className="w-4 h-4 accent-[var(--accent)] cursor-pointer"
          />
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between gap-3 pt-2">
          <button
            type="button"
            onClick={() => {
              onDelete(edge.id);
              onClose();
            }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 border border-rose-500/30 text-xs font-semibold transition-all active:scale-95"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete Connection</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] text-xs font-semibold transition-all"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-5 py-2 rounded-xl bg-[var(--accent)] hover:brightness-110 text-white text-xs font-bold shadow-md shadow-[var(--accent)]/30 transition-all active:scale-95"
            >
              Apply Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
