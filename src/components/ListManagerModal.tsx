import React, { useState, useEffect } from 'react';
import { X, FolderPlus, Trash2, Folder, Tag, Plus } from 'lucide-react';
import { saveCustomList, deleteCustomList } from '../db';
import type { CustomList, MediaItem } from '../types';

export interface ListManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  customLists: CustomList[];
  mediaList: MediaItem[];
  onListsChanged: () => void;
}

const PRESET_COLORS = [
  '#3b82f6', // Blue
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#ef4444', // Red
  '#8b5cf6', // Purple
  '#ec4899', // Pink
  '#06b6d4', // Cyan
  '#84cc16'  // Lime
];

export default function ListManagerModal({
  isOpen,
  onClose,
  customLists,
  mediaList,
  onListsChanged
}: ListManagerModalProps): React.JSX.Element | null {
  const [newListName, setNewListName] = useState<string>('');
  const [selectedColor, setSelectedColor] = useState<string>(PRESET_COLORS[0]);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

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

  if (!isOpen) return null;

  const handleCreateList = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newListName.trim()) return;

    setIsSubmitting(true);
    try {
      await saveCustomList({
        name: newListName.trim(),
        color: selectedColor
      });
      setNewListName('');
      onListsChanged();
    } catch (err) {
      console.error('Failed to create list:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteList = async (listId: string, listName: string) => {
    if (confirm(`Delete list "${listName}"? Items will remain in your library.`)) {
      await deleteCustomList(listId);
      onListsChanged();
    }
  };

  return (
    <div 
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/65 backdrop-blur-md overflow-y-auto animate-fadeIn"
    >
      <div className="relative w-full max-w-md bg-[var(--card-bg)] border border-[var(--border-light)] rounded-2xl shadow-2xl overflow-hidden my-auto">
        
        {/* Header */}
        <div className="p-4 border-b border-[var(--border-light)] bg-[var(--bg-primary)] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[var(--accent-bg)] text-[var(--accent)]">
              <Folder className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[var(--text-primary)]">
                Manage Folders & Lists
              </h2>
              <p className="text-xs text-[var(--text-secondary)]">
                Organize your shows and movies into custom collections
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

        {/* Create New List Form */}
        <form onSubmit={handleCreateList} className="p-4 border-b border-[var(--border-light)] bg-[var(--bg-secondary)] space-y-3">
          <label className="block text-xs font-semibold text-[var(--text-secondary)]">
            Create New Folder / List
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              required
              value={newListName}
              onChange={(e) => setNewListName(e.target.value)}
              placeholder="e.g. Halloween Favorites, Anime, Must Watch..."
              className="flex-1 px-3 py-2 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl text-xs text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:outline-none focus:border-[var(--input-focus)]"
            />
            <button
              type="submit"
              disabled={isSubmitting || !newListName.trim()}
              className="px-3 py-2 rounded-xl bg-[var(--accent)] hover:brightness-110 text-white text-xs font-bold transition-all disabled:opacity-50 flex items-center gap-1.5 shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add</span>
            </button>
          </div>

          {/* Color tag picker */}
          <div className="flex items-center gap-1.5 pt-1">
            <span className="text-[11px] text-[var(--text-secondary)] mr-1">Color:</span>
            {PRESET_COLORS.map(color => (
              <button
                key={color}
                type="button"
                onClick={() => setSelectedColor(color)}
                style={{ backgroundColor: color }}
                className={`w-5 h-5 rounded-full transition-transform ${selectedColor === color ? 'ring-2 ring-white scale-110' : 'hover:scale-105'}`}
              />
            ))}
          </div>
        </form>

        {/* Existing Lists */}
        <div className="p-4 space-y-2 max-h-72 overflow-y-auto">
          {customLists.length === 0 ? (
            <div className="text-center py-6 text-xs text-[var(--text-secondary)]">
              No custom lists yet. Create your first folder above!
            </div>
          ) : (
            customLists.map(list => {
              const itemCount = mediaList.filter(item => item.lists && item.lists.includes(list.name)).length;

              return (
                <div
                  key={list.id}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-light)] hover:border-[var(--accent)] transition-all"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: list.color || '#3b82f6' }}
                    />
                    <span className="font-semibold text-xs text-[var(--text-primary)] truncate">
                      {list.name}
                    </span>
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-[var(--bg-tertiary)] text-[var(--text-secondary)] font-mono">
                      {itemCount} {itemCount === 1 ? 'item' : 'items'}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleDeleteList(list.id, list.name)}
                    className="p-1.5 rounded-lg text-rose-400 hover:bg-rose-500/10 transition-colors shrink-0"
                    title={`Delete "${list.name}" list`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-[var(--border-light)] bg-[var(--bg-primary)] flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] text-xs font-semibold transition-all"
          >
            Done
          </button>
        </div>

      </div>
    </div>
  );
}
