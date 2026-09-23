import React, { memo } from 'react';
import { type Node, type NodeProps } from '@xyflow/react';
import { Layers, Trash2 } from 'lucide-react';
import type { CanvasNodeData } from '../../types';

export type FranchiseGroupNodeType = Node<
  CanvasNodeData & {
    onDelete?: (nodeId: string) => void;
  },
  'groupNode'
>;

export type FranchiseGroupNodeProps = NodeProps<FranchiseGroupNodeType>;

export const FranchiseGroupNode = memo(({ id, data, selected }: FranchiseGroupNodeProps) => {
  const accentColor = data.color || '#6366f1';

  return (
    <div
      style={{
        borderColor: selected ? accentColor : `${accentColor}44`,
        backgroundColor: `${accentColor}0c`
      }}
      className={`group relative rounded-3xl border-2 border-dashed p-4 transition-all duration-200 min-w-[320px] min-h-[220px] ${
        selected ? 'ring-2 ring-indigo-500/20' : ''
      }`}
    >
      <div className="flex items-center justify-between gap-2 pb-2 mb-2 border-b border-white/10">
        <div className="flex items-center gap-2">
          <div
            style={{ backgroundColor: `${accentColor}25`, color: accentColor }}
            className="w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold"
          >
            <Layers className="w-3.5 h-3.5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-[var(--text-primary)]">
              {data.label || data.title || 'Franchise Phase / Era'}
            </h3>
            {data.description && (
              <p className="text-[11px] text-[var(--text-secondary)]">
                {data.description}
              </p>
            )}
          </div>
        </div>

        {data.onDelete && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              data.onDelete?.(id);
            }}
            className="p-1 rounded-md bg-[var(--bg-tertiary)] hover:bg-rose-500 hover:text-white text-[var(--text-secondary)] transition-colors opacity-0 group-hover:opacity-100"
            title="Delete Phase Group"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
});

FranchiseGroupNode.displayName = 'FranchiseGroupNode';
