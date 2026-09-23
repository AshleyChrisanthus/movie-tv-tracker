import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  BackgroundVariant,
  type Connection,
  type Edge,
  type Node,
  type OnConnect,
  type ReactFlowInstance
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from 'dagre';
import {
  Network,
  Plus,
  Sparkles,
  Maximize2,
  Trash2,
  Edit3,
  Check,
  ChevronDown,
  LayoutGrid,
  ArrowRight,
  FolderPlus
} from 'lucide-react';
import { FranchiseMediaNode } from './FranchiseMediaNode';
import { FranchiseGroupNode } from './FranchiseGroupNode';
import { CanvasQuickAddModal } from './CanvasQuickAddModal';
import { CanvasEdgeEditModal } from './CanvasEdgeEditModal';
import { getCanvases, saveCanvas, deleteCanvas } from '../../db';
import type {
  MediaItem,
  FranchiseCanvas,
  CanvasNode,
  CanvasEdge,
  CanvasNodeData,
  CanvasEdgeType
} from '../../types';

export interface FranchiseCanvasViewProps {
  libraryItems: MediaItem[];
  onInspectMedia: (item: MediaItem) => void;
  onRefreshLibrary: () => Promise<void>;
  preselectedCanvasId?: string | null;
}

const nodeTypes = {
  mediaNode: FranchiseMediaNode,
  groupNode: FranchiseGroupNode
};

/**
 * Dagre auto-layout helper
 */
function getLayoutedElements(
  nodes: Node[],
  edges: Edge[],
  direction: 'LR' | 'TB' = 'LR'
): { nodes: Node[]; edges: Edge[] } {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({ rankdir: direction, ranksep: 120, nodesep: 80 });

  nodes.forEach((node) => {
    const isGroup = node.type === 'groupNode';
    dagreGraph.setNode(node.id, {
      width: isGroup ? 360 : 270,
      height: isGroup ? 240 : 140
    });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  const newNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    if (!nodeWithPosition) return node;
    const isGroup = node.type === 'groupNode';
    return {
      ...node,
      position: {
        x: nodeWithPosition.x - (isGroup ? 180 : 135),
        y: nodeWithPosition.y - (isGroup ? 120 : 70)
      }
    };
  });

  return { nodes: newNodes, edges };
}

export const FranchiseCanvasView: React.FC<FranchiseCanvasViewProps> = ({
  libraryItems,
  onInspectMedia,
  onRefreshLibrary: _onRefreshLibrary,
  preselectedCanvasId
}) => {
  const [canvases, setCanvases] = useState<FranchiseCanvas[]>([]);
  const [activeCanvas, setActiveCanvas] = useState<FranchiseCanvas | null>(null);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState('');
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [selectedEdge, setSelectedEdge] = useState<CanvasEdge | null>(null);
  const [isEdgeModalOpen, setIsEdgeModalOpen] = useState(false);
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const isSavingRef = useRef(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync node data with library items (for updated watch status and ratings)
  const syncNodesWithLibrary = useCallback((rawNodes: CanvasNode[]): CanvasNode[] => {
    return rawNodes.map((n) => {
      if (n.type === 'groupNode' || !n.data) return n;
      const matched = libraryItems.find(
        (m) =>
          (n.data.mediaId && m.id === n.data.mediaId) ||
          (n.data.externalId && m.externalId && String(m.externalId) === String(n.data.externalId)) ||
          (m.title && n.data.title && m.title.trim().toLowerCase() === n.data.title.trim().toLowerCase())
      );
      if (matched) {
        return {
          ...n,
          data: {
            ...n.data,
            mediaId: matched.id,
            status: matched.status,
            rating: matched.rating ?? n.data.rating,
            communityRating: matched.communityRating ?? n.data.communityRating,
            watchedEpisodesCount: matched.watchedEpisodesCount,
            totalEpisodes: matched.totalEpisodes
          }
        };
      }
      return n;
    });
  }, [libraryItems]);

  // Load all canvases
  const loadCanvases = useCallback(async () => {
    const list = await getCanvases();
    if (list.length === 0) {
      // Create initial starter canvas
      const starter: FranchiseCanvas = {
        id: `canvas_${Date.now()}`,
        name: 'My Franchise Universe',
        description: 'Connect movies, TV shows, and books into timelines',
        nodes: [],
        edges: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      await saveCanvas(starter);
      setCanvases([starter]);
      setActiveCanvas(starter);
    } else {
      setCanvases(list);
      if (preselectedCanvasId) {
        const found = list.find((c) => c.id === preselectedCanvasId);
        setActiveCanvas(found || list[0]);
      } else {
        setActiveCanvas((prev) => {
          if (!prev) return list[0];
          return list.find((c) => c.id === prev.id) || list[0];
        });
      }
    }
  }, [preselectedCanvasId]);

  useEffect(() => {
    loadCanvases();
  }, [loadCanvases]);

  // On active canvas change, populate nodes & edges
  useEffect(() => {
    if (!activeCanvas) return;
    setEditedTitle(activeCanvas.name);
    const synced = syncNodesWithLibrary(activeCanvas.nodes || []);
    setNodes(synced as unknown as Node[]);
    setEdges((activeCanvas.edges || []) as Edge[]);

    setTimeout(() => {
      reactFlowInstance?.fitView({ padding: 0.2 });
    }, 150);
  }, [activeCanvas?.id, syncNodesWithLibrary, reactFlowInstance]);

  // Auto-save changes to Dexie with debounce
  const triggerAutoSave = useCallback((updatedNodes: Node[], updatedEdges: Edge[]) => {
    if (!activeCanvas) return;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

    saveTimeoutRef.current = setTimeout(async () => {
      isSavingRef.current = true;
      try {
        const cleanedNodes: CanvasNode[] = updatedNodes.map((n) => ({
          id: n.id,
          type: n.type,
          position: n.position,
          data: n.data as unknown as CanvasNodeData,
          width: n.measured?.width || n.width,
          height: n.measured?.height || n.height
        }));

        const cleanedEdges: CanvasEdge[] = updatedEdges.map((e) => ({
          id: e.id,
          source: e.source,
          target: e.target,
          sourceHandle: e.sourceHandle,
          targetHandle: e.targetHandle,
          relationType: (e.data?.relationType as CanvasEdgeType) || (e as CanvasEdge).relationType || 'sequel',
          label: typeof e.label === 'string' ? e.label : (e.data?.label as string) || undefined,
          animated: e.animated
        }));

        const updated = await saveCanvas({
          ...activeCanvas,
          nodes: cleanedNodes,
          edges: cleanedEdges
        });

        setActiveCanvas(updated);
        setCanvases((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      } catch (err) {
        console.error('Failed to auto-save canvas:', err);
      } finally {
        isSavingRef.current = false;
      }
    }, 600);
  }, [activeCanvas]);

  // Connect handle to handle
  const onConnect: OnConnect = useCallback(
    (params: Connection) => {
      const newEdge: CanvasEdge = {
        id: `edge_${params.source}_${params.target}_${Date.now()}`,
        source: params.source,
        target: params.target,
        sourceHandle: params.sourceHandle,
        targetHandle: params.targetHandle,
        relationType: 'sequel',
        label: 'Sequel',
        animated: false
      };
      setEdges((eds) => {
        const next = addEdge(newEdge as unknown as Edge, eds);
        triggerAutoSave(nodes, next);
        return next;
      });
    },
    [nodes, triggerAutoSave, setEdges]
  );

  // Inspect media callback from node
  const handleInspectNodeData = useCallback(
    (nodeData: CanvasNodeData) => {
      const matched = libraryItems.find(
        (m) =>
          (nodeData.mediaId && m.id === nodeData.mediaId) ||
          (nodeData.externalId && m.externalId && String(m.externalId) === String(nodeData.externalId)) ||
          (m.title && nodeData.title && m.title.trim().toLowerCase() === nodeData.title.trim().toLowerCase())
      );
      if (matched) {
        onInspectMedia(matched);
      } else {
        // Construct temporary media item so user can inspect or add to library
        const tempMedia: MediaItem = {
          id: nodeData.mediaId || `temp_${Date.now()}`,
          type: (nodeData.type === 'tv' || nodeData.type === 'book') ? nodeData.type : 'movie',
          status: nodeData.status || 'plan_to_watch',
          title: nodeData.title,
          year: nodeData.year || 'N/A',
          releaseDate: nodeData.releaseDate || '',
          overview: nodeData.overview || '',
          posterUrl: nodeData.posterUrl,
          backdropUrl: nodeData.backdropUrl,
          source: nodeData.source || 'tmdb',
          externalId: nodeData.externalId,
          tmdbId: nodeData.source === 'tmdb' ? nodeData.externalId : undefined,
          collectionId: nodeData.collectionId,
          collectionName: nodeData.collectionName,
          totalEpisodes: nodeData.totalEpisodes || 1,
          watchedEpisodesCount: nodeData.watchedEpisodesCount || 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        onInspectMedia(tempMedia);
      }
    },
    [libraryItems, onInspectMedia]
  );

  // Delete node callback
  const handleDeleteNode = useCallback(
    (nodeId: string) => {
      setNodes((nds) => {
        const nextNodes = nds.filter((n) => n.id !== nodeId);
        setEdges((eds) => {
          const nextEdges = eds.filter((e) => e.source !== nodeId && e.target !== nodeId);
          triggerAutoSave(nextNodes, nextEdges);
          return nextEdges;
        });
        return nextNodes;
      });
    },
    [triggerAutoSave, setNodes, setEdges]
  );

  // Custom node types with attached handlers
  const decoratedNodes = useMemo(() => {
    return nodes.map((n) => ({
      ...n,
      data: {
        ...n.data,
        onInspect: handleInspectNodeData,
        onDelete: handleDeleteNode
      }
    }));
  }, [nodes, handleInspectNodeData, handleDeleteNode]);

  // Click on edge to edit relation
  const onEdgeClick = useCallback(
    (_: React.MouseEvent, edge: Edge) => {
      const cEdge: CanvasEdge = {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        relationType: (edge.data?.relationType as CanvasEdgeType) || (edge as CanvasEdge).relationType || 'sequel',
        label: typeof edge.label === 'string' ? edge.label : (edge.data?.label as string) || undefined,
        animated: edge.animated
      };
      setSelectedEdge(cEdge);
      setIsEdgeModalOpen(true);
    },
    []
  );

  // Save edge edit
  const handleSaveEdge = useCallback(
    (updatedEdge: CanvasEdge) => {
      setEdges((eds) => {
        const next = eds.map((e) => {
          if (e.id === updatedEdge.id) {
            return {
              ...e,
              label: updatedEdge.label,
              animated: updatedEdge.animated,
              relationType: updatedEdge.relationType,
              data: {
                ...e.data,
                relationType: updatedEdge.relationType,
                label: updatedEdge.label
              }
            };
          }
          return e;
        });
        triggerAutoSave(nodes, next);
        return next;
      });
    },
    [nodes, triggerAutoSave, setEdges]
  );

  // Delete edge
  const handleDeleteEdge = useCallback(
    (edgeId: string) => {
      setEdges((eds) => {
        const next = eds.filter((e) => e.id !== edgeId);
        triggerAutoSave(nodes, next);
        return next;
      });
    },
    [nodes, triggerAutoSave, setEdges]
  );

  // Auto-layout
  const handleAutoLayout = useCallback(
    (direction: 'LR' | 'TB') => {
      const layouted = getLayoutedElements(nodes, edges, direction);
      setNodes(layouted.nodes);
      setEdges(layouted.edges);
      triggerAutoSave(layouted.nodes, layouted.edges);
      setTimeout(() => {
        reactFlowInstance?.fitView({ padding: 0.2 });
      }, 100);
    },
    [nodes, edges, triggerAutoSave, setNodes, setEdges, reactFlowInstance]
  );

  // Add media node
  const handleAddMediaNode = useCallback(
    (item: Partial<MediaItem>) => {
      const nodeId = `node_${item.id || item.externalId || Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const newNode: Node = {
        id: nodeId,
        type: 'mediaNode',
        position: {
          x: 100 + Math.random() * 200,
          y: 100 + Math.random() * 150
        },
        data: {
          mediaId: item.id,
          title: item.title || 'Untitled',
          year: item.year,
          releaseDate: item.releaseDate,
          type: item.type || 'movie',
          posterUrl: item.posterUrl,
          backdropUrl: item.backdropUrl,
          status: item.status || 'plan_to_watch',
          rating: item.rating ?? null,
          communityRating: item.communityRating ?? null,
          source: item.source || 'tmdb',
          externalId: item.externalId,
          totalEpisodes: item.totalEpisodes || 1,
          watchedEpisodesCount: item.watchedEpisodesCount || 0,
          overview: item.overview || '',
          collectionId: item.collectionId,
          collectionName: item.collectionName
        }
      };

      setNodes((nds) => {
        const next = [...nds, newNode];
        triggerAutoSave(next, edges);
        return next;
      });
    },
    [edges, triggerAutoSave, setNodes]
  );

  // Import TMDB Collection Graph
  const handleImportCollection = useCallback(
    (importedNodes: CanvasNode[], importedEdges: CanvasEdge[]) => {
      setNodes((nds) => {
        const nextNodes = [...nds, ...(importedNodes as unknown as Node[])];
        setEdges((eds) => {
          const nextEdges = [...eds, ...(importedEdges as Edge[])];
          const layouted = getLayoutedElements(nextNodes, nextEdges, 'LR');
          triggerAutoSave(layouted.nodes, layouted.edges);
          setTimeout(() => {
            reactFlowInstance?.fitView({ padding: 0.2 });
          }, 100);
          return layouted.edges;
        });
        return nextNodes;
      });
    },
    [triggerAutoSave, setNodes, setEdges, reactFlowInstance]
  );

  // Add group node
  const handleAddGroupNode = useCallback(
    (label: string, description: string, color: string) => {
      const newGroup: Node = {
        id: `group_${Date.now()}`,
        type: 'groupNode',
        position: { x: 50, y: 50 },
        data: {
          type: 'group',
          title: label,
          label,
          description,
          color
        }
      };
      setNodes((nds) => {
        const next = [newGroup, ...nds];
        triggerAutoSave(next, edges);
        return next;
      });
    },
    [edges, triggerAutoSave, setNodes]
  );

  // Create new board
  const handleCreateNewCanvas = async () => {
    const name = `Franchise Universe ${canvases.length + 1}`;
    const newBoard = await saveCanvas({
      name,
      description: 'Timeline and interconnectivity map',
      nodes: [],
      edges: []
    });
    setCanvases((prev) => [newBoard, ...prev]);
    setActiveCanvas(newBoard);
  };

  // Rename board
  const handleSaveTitle = async () => {
    if (!activeCanvas || !editedTitle.trim()) return;
    const updated = await saveCanvas({
      ...activeCanvas,
      name: editedTitle.trim()
    });
    setActiveCanvas(updated);
    setCanvases((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    setIsEditingTitle(false);
  };

  // Delete board
  const handleDeleteCanvas = async () => {
    if (!activeCanvas) return;
    if (!window.confirm(`Are you sure you want to delete "${activeCanvas.name}"?`)) return;
    await deleteCanvas(activeCanvas.id);
    const remaining = canvases.filter((c) => c.id !== activeCanvas.id);
    if (remaining.length === 0) {
      await loadCanvases();
    } else {
      setCanvases(remaining);
      setActiveCanvas(remaining[0]);
    }
  };

  // Clear current canvas nodes
  const handleClearCanvas = () => {
    if (!window.confirm('Clear all media nodes and connections from this board?')) return;
    setNodes([]);
    setEdges([]);
    triggerAutoSave([], []);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-65px)] bg-[var(--bg-primary)] overflow-hidden relative">
      {/* Canvas Top Bar */}
      <div className="z-10 bg-[var(--bg-secondary)]/90 backdrop-blur-md border-b border-[var(--border-light)] px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 shadow-xs">
        {/* Left: Universe / Board Selector */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-[var(--accent)]/15 text-[var(--accent)] flex items-center justify-center font-bold">
            <Network className="w-4 h-4" />
          </div>

          <div className="flex items-center gap-2">
            {isEditingTitle ? (
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={editedTitle}
                  onChange={(e) => setEditedTitle(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSaveTitle()}
                  className="px-2.5 py-1 rounded-lg bg-[var(--input-bg)] border border-[var(--accent)] text-xs font-bold text-[var(--text-primary)] focus:outline-none"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={handleSaveTitle}
                  className="p-1 rounded bg-[var(--accent)] text-white hover:brightness-110"
                >
                  <Check className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 group">
                <div className="relative">
                  <select
                    value={activeCanvas?.id || ''}
                    onChange={(e) => {
                      const found = canvases.find((c) => c.id === e.target.value);
                      if (found) setActiveCanvas(found);
                    }}
                    className="appearance-none pl-3 pr-7 py-1.5 rounded-xl bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] border border-[var(--border-light)] text-xs font-bold text-[var(--text-primary)] cursor-pointer focus:outline-none transition-all"
                  >
                    {canvases.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.nodes?.length || 0} items)
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-2.5 pointer-events-none text-[var(--text-secondary)]" />
                </div>

                <button
                  type="button"
                  onClick={() => setIsEditingTitle(true)}
                  className="p-1.5 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors opacity-70 group-hover:opacity-100"
                  title="Rename Board"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={handleCreateNewCanvas}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] border border-[var(--border-light)] text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all shadow-xs"
              title="Create New Franchise Board"
            >
              <FolderPlus className="w-3.5 h-3.5 text-[var(--accent)]" />
              <span className="hidden sm:inline">New Board</span>
            </button>
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          {/* Add to Board Button */}
          <button
            type="button"
            onClick={() => setIsQuickAddOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--accent)] hover:brightness-110 text-white text-xs font-bold shadow-md shadow-[var(--accent)]/25 transition-all active:scale-95"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add / Import Series</span>
          </button>

          {/* Auto Layout Options */}
          <div className="hidden sm:flex items-center border border-[var(--border-light)] rounded-xl overflow-hidden bg-[var(--bg-tertiary)]">
            <button
              type="button"
              onClick={() => handleAutoLayout('LR')}
              className="flex items-center gap-1 px-2.5 py-1.5 hover:bg-[var(--bg-hover)] text-xs font-semibold text-[var(--text-primary)] transition-colors border-r border-[var(--border-light)]"
              title="Auto-arrange timeline left-to-right"
            >
              <ArrowRight className="w-3.5 h-3.5 text-[var(--accent)]" />
              <span>Timeline</span>
            </button>
            <button
              type="button"
              onClick={() => handleAutoLayout('TB')}
              className="flex items-center gap-1 px-2.5 py-1.5 hover:bg-[var(--bg-hover)] text-xs font-semibold text-[var(--text-primary)] transition-colors"
              title="Auto-arrange tree top-to-bottom"
            >
              <LayoutGrid className="w-3.5 h-3.5 text-[var(--accent)]" />
              <span>Tree</span>
            </button>
          </div>

          {/* Fit View */}
          <button
            type="button"
            onClick={() => reactFlowInstance?.fitView({ padding: 0.2 })}
            className="p-1.5 rounded-xl bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-light)] transition-colors"
            title="Fit View"
          >
            <Maximize2 className="w-4 h-4" />
          </button>

          {/* Clear Board */}
          <button
            type="button"
            onClick={handleClearCanvas}
            className="p-1.5 rounded-xl bg-[var(--bg-tertiary)] hover:bg-rose-500 hover:text-white text-[var(--text-secondary)] border border-[var(--border-light)] transition-colors"
            title="Clear All Nodes"
          >
            <Trash2 className="w-4 h-4" />
          </button>

          {/* Delete Board */}
          {canvases.length > 1 && (
            <button
              type="button"
              onClick={handleDeleteCanvas}
              className="text-[11px] text-rose-400 hover:text-rose-300 font-semibold px-2 py-1 transition-colors"
              title="Delete this entire board"
            >
              Delete Board
            </button>
          )}
        </div>
      </div>

      {/* React Flow Canvas Area */}
      <div className="flex-1 w-full h-full relative">
        <ReactFlow
          nodes={decoratedNodes}
          edges={edges}
          onNodesChange={(changes) => {
            onNodesChange(changes);
            triggerAutoSave(nodes, edges);
          }}
          onEdgesChange={(changes) => {
            onEdgesChange(changes);
            triggerAutoSave(nodes, edges);
          }}
          onConnect={onConnect}
          onEdgeClick={onEdgeClick}
          onInit={setReactFlowInstance}
          nodeTypes={nodeTypes}
          fitView
          minZoom={0.15}
          maxZoom={2.0}
          defaultEdgeOptions={{
            type: 'smoothstep',
            animated: false,
            style: { stroke: 'var(--accent)', strokeWidth: 2 }
          }}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1.2} color="rgba(255, 255, 255, 0.08)" />
          <Controls className="!bg-[var(--bg-secondary)] !border-[var(--border-light)] !shadow-xl !rounded-2xl overflow-hidden" />
          <MiniMap
            nodeStrokeWidth={3}
            zoomable
            pannable
            className="!bg-[var(--bg-secondary)] !border-[var(--border-light)] !rounded-2xl !shadow-xl overflow-hidden"
          />
        </ReactFlow>

        {/* Empty Canvas Prompt */}
        {nodes.length === 0 && (
          <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center p-6 text-center">
            <div className="w-16 h-16 rounded-3xl bg-[var(--accent)]/10 border border-[var(--accent)]/20 flex items-center justify-center text-[var(--accent)] mb-4">
              <Sparkles className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-[var(--text-primary)] mb-1">
              Start Your Franchise Map
            </h3>
            <p className="text-xs text-[var(--text-secondary)] max-w-md mb-6 leading-relaxed">
              Import full movie series (e.g. <em>Avengers</em>, <em>Star Wars</em>, <em>Harry Potter</em>) with one click, or add items from your watch library to map out interconnecting timelines.
            </p>
            <button
              type="button"
              onClick={() => setIsQuickAddOpen(true)}
              className="pointer-events-auto flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--accent)] hover:brightness-110 text-white text-xs font-bold shadow-lg shadow-[var(--accent)]/30 transition-all active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>Add Media or Import Series</span>
            </button>
          </div>
        )}
      </div>

      {/* Quick Add Modal */}
      <CanvasQuickAddModal
        isOpen={isQuickAddOpen}
        onClose={() => setIsQuickAddOpen(false)}
        libraryItems={libraryItems}
        onAddMediaNode={handleAddMediaNode}
        onImportCollection={handleImportCollection}
        onAddGroupNode={handleAddGroupNode}
      />

      {/* Edge Edit Modal */}
      <CanvasEdgeEditModal
        isOpen={isEdgeModalOpen}
        edge={selectedEdge}
        onClose={() => {
          setIsEdgeModalOpen(false);
          setSelectedEdge(null);
        }}
        onSave={handleSaveEdge}
        onDelete={handleDeleteEdge}
      />
    </div>
  );
};
