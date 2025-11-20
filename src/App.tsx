import React, { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, Edit2, Check, X, ZoomIn, ZoomOut, Home, Save, FolderOpen } from 'lucide-react';

interface Node {
  id: number;
  text: string;
  x: number;
  y: number;
  color: string;
  parentId: number | null;
  children?: number[];
}

interface SpinState {
  angle: number;
  speed: number;
}

interface DragState {
  parentId: number;
  lastAngle: number;
  lastTime: number;
}

const CircularMindmap: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [nodes, setNodes] = useState<Node[]>([
    { id: 1, text: 'Central Idea', x: 0, y: 0, color: '#8b9a7a', parentId: null, children: [] }
  ]);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [editingNode, setEditingNode] = useState<Node | null>(null);
  const [editText, setEditText] = useState('');
  const [draggedNode, setDraggedNode] = useState<Node | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [hoveredNode, setHoveredNode] = useState<Node | null>(null);
  const [spinningNodes, setSpinningNodes] = useState<Record<number, SpinState>>({});
  const [nodeRotations, setNodeRotations] = useState<Record<number, number>>({});
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [focusedNodeId, setFocusedNodeId] = useState(1);
  const [breadcrumbs, setBreadcrumbs] = useState<number[]>([1]);
  const [showInstructions, setShowInstructions] = useState(true);
  const animationFrameRef = useRef<number | null>(null);

  const childColors = [
    '#8b9a7a', '#7a8b9a', '#9a7a8b', '#9a8b7a',
    '#7a9a8b', '#8b7a9a', '#9a8b7a', '#7a8b9a',
  ];

  useEffect(() => {
    const saved = localStorage.getItem('mindmap_data');
    if (saved) {
      const data = JSON.parse(saved);
      setNodes(data.nodes);
      setZoom(data.zoom || 1);
      setPan(data.pan || { x: 0, y: 0 });
      setShowInstructions(false);
    }
  }, []);

  useEffect(() => {
    const animate = () => {
      setSpinningNodes(prev => {
        const updated: Record<number, SpinState> = {};
        let hasActive = false;
        const rotationsToCommit: Record<number, number> = {};

        Object.keys(prev).forEach(parentIdStr => {
          const parentId = parseInt(parentIdStr);
          const spin = prev[parentId];
          if (Math.abs(spin.speed) > 0.005) {
            updated[parentId] = {
              angle: spin.angle + spin.speed,
              speed: spin.speed * 0.96
            };
            hasActive = true;
          } else if (spin.angle !== 0) {
            rotationsToCommit[parentId] = spin.angle;
          }
        });

        if (Object.keys(rotationsToCommit).length > 0) {
          setNodeRotations(rotations => {
            const newRotations = { ...rotations };
            Object.keys(rotationsToCommit).forEach(parentIdStr => {
              const parentId = parseInt(parentIdStr);
              newRotations[parentId] = (rotations[parentId] || 0) + rotationsToCommit[parentId];
            });
            return newRotations;
          });
        }

        return updated;
      });

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    drawMindmap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, selectedNode, zoom, pan, hoveredNode, spinningNodes, nodeRotations, focusedNodeId]);

  const saveToLocalStorage = () => {
    const data = { nodes, zoom, pan };
    localStorage.setItem('mindmap_data', JSON.stringify(data));
  };

  const getHierarchyColor = (depth: number): string => {
    const hierarchyColors = [
      '#8b9a7a', '#7a8b9a', '#9a7a8b',
      '#9a8b7a', '#7a9a8b', '#8b7a9a',
    ];
    return hierarchyColors[depth % hierarchyColors.length];
  };

  const getChildColor = (_parentId: number, childIndex: number): string => {
    return childColors[childIndex % childColors.length];
  };

  const getNodeDepth = (nodeId: number): number => {
    let depth = 0;
    let current = nodes.find(n => n.id === nodeId);
    const seen = new Set<number>();
    
    while (current && current.parentId !== null && !seen.has(current.id)) {
      seen.add(current.id);
      depth++;
      current = nodes.find(n => n.id === current!.parentId!);
    }
    return depth;
  };

  const drawMindmap = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    ctx.clearRect(0, 0, rect.width, rect.height);
    ctx.save();
    ctx.translate(centerX + pan.x, centerY + pan.y);
    ctx.scale(zoom, zoom);

    const focusedNode = nodes.find(n => n.id === focusedNodeId);
    if (!focusedNode) {
      ctx.restore();
      return;
    }
    
    const children = nodes.filter(n => n.parentId === focusedNodeId);
    const visibleNodes = [focusedNode, ...children];
    
    const baseRadius = 150;
    const minRadius = 120;
    const maxRadius = 250;
    const childCount = children.length;
    const dynamicRadius = childCount > 0 
      ? Math.max(minRadius, Math.min(maxRadius, baseRadius + (childCount - 3) * 15))
      : baseRadius;

    const getNodePosition = (node: Node): { x: number; y: number } => {
      if (node.id === focusedNodeId) {
        return { x: 0, y: 0 };
      }
      
      const childIndex = children.findIndex(c => c.id === node.id);
      if (childIndex === -1) return { x: 0, y: 0 };
      
      const baseAngle = (childIndex * Math.PI * 2) / children.length;
      const accumulatedRotation = nodeRotations[focusedNodeId] || 0;
      const currentSpin = spinningNodes[focusedNodeId];
      const angle = baseAngle + accumulatedRotation + (currentSpin?.angle || 0);
      
      return {
        x: Math.cos(angle) * dynamicRadius,
        y: Math.sin(angle) * dynamicRadius
      };
    };

    // Draw connections
    visibleNodes.forEach(node => {
      if (node.parentId === focusedNodeId) {
        const pos = getNodePosition(node);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(pos.x, pos.y);
        ctx.strokeStyle = '#475569';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    });

    // Draw nodes
    visibleNodes.forEach((node) => {
      const pos = getNodePosition(node);
      const isSelected = selectedNode?.id === node.id;
      const isHovered = hoveredNode?.id === node.id;
      const isFocused = node.id === focusedNodeId;
      const radius = isFocused ? 60 : 40;

      if (isSelected || isHovered) {
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, radius + 5, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.fill();
      }

      ctx.beginPath();
      ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
      if (isFocused) {
        const depth = getNodeDepth(node.id);
        ctx.fillStyle = getHierarchyColor(depth);
      } else {
        const childIndex = children.findIndex(c => c.id === node.id);
        ctx.fillStyle = childIndex >= 0 ? getChildColor(focusedNodeId, childIndex) : node.color;
      }
      ctx.fill();
      ctx.strokeStyle = isSelected ? '#fff' : 'rgba(255, 255, 255, 0.3)';
      ctx.lineWidth = isSelected ? 3 : 2;
      ctx.stroke();

      ctx.fillStyle = '#fff';
      ctx.font = `${isFocused ? '16' : '14'}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      const words = node.text.split(' ');
      const lines: string[] = [];
      let currentLine = words[0];
      
      for (let i = 1; i < words.length; i++) {
        const testLine = currentLine + ' ' + words[i];
        const metrics = ctx.measureText(testLine);
        if (metrics.width > radius * 1.5) {
          lines.push(currentLine);
          currentLine = words[i];
        } else {
          currentLine = testLine;
        }
      }
      lines.push(currentLine);

      const lineHeight = 18;
      const startY = pos.y - ((lines.length - 1) * lineHeight) / 2;
      
      lines.forEach((line, i) => {
        ctx.fillText(line, pos.x, startY + i * lineHeight);
      });
    });

    ctx.restore();
  };

  const canvasToWorld = (clientX: number, clientY: number): { x: number; y: number } => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    
    const rect = canvas.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    
    return {
      x: (clientX - rect.left - centerX - pan.x) / zoom,
      y: (clientY - rect.top - centerY - pan.y) / zoom
    };
  };

  const getNodeAtPosition = (worldX: number, worldY: number): Node | null => {
    const focusedNode = nodes.find(n => n.id === focusedNodeId);
    if (!focusedNode) return null;
    
    const children = nodes.filter(n => n.parentId === focusedNodeId);
    const visibleNodes = [focusedNode, ...children];
    
    const baseRadius = 150;
    const minRadius = 120;
    const maxRadius = 250;
    const childCount = children.length;
    const dynamicRadius = childCount > 0 
      ? Math.max(minRadius, Math.min(maxRadius, baseRadius + (childCount - 3) * 15))
      : baseRadius;
    
    return visibleNodes.find(node => {
      let x = 0;
      let y = 0;
      
      if (node.id === focusedNodeId) {
        x = 0;
        y = 0;
      } else {
        const childIndex = children.findIndex(c => c.id === node.id);
        if (childIndex === -1) return false;
        
        const baseAngle = (childIndex * Math.PI * 2) / children.length;
        const accumulatedRotation = nodeRotations[focusedNodeId] || 0;
        const currentSpin = spinningNodes[focusedNodeId];
        const angle = baseAngle + accumulatedRotation + (currentSpin?.angle || 0);
        x = Math.cos(angle) * dynamicRadius;
        y = Math.sin(angle) * dynamicRadius;
      }
      
      const radius = node.id === focusedNodeId ? 60 : 40;
      const dist = Math.sqrt(Math.pow(worldX - x, 2) + Math.pow(worldY - y, 2));
      return dist <= radius;
    }) || null;
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.detail === 2) {
      const world = canvasToWorld(e.clientX, e.clientY);
      const clickedNode = getNodeAtPosition(world.x, world.y);
      
      if (clickedNode) {
        if (clickedNode.id === focusedNodeId && clickedNode.parentId) {
          navigateToNode(clickedNode.parentId);
        } else if (clickedNode.parentId === focusedNodeId) {
          navigateToNode(clickedNode.id);
        }
      }
    } else {
      const world = canvasToWorld(e.clientX, e.clientY);
      const clickedNode = getNodeAtPosition(world.x, world.y);
      
      if (clickedNode) {
        setSelectedNode(clickedNode);
      } else {
        setSelectedNode(null);
      }
    }
  };

  const navigateToNode = (nodeId: number) => {
    setFocusedNodeId(nodeId);
    setSelectedNode(null);
    setSpinningNodes({});
    setShowInstructions(false);
    
    const node = nodes.find(n => n.id === nodeId);
    if (node) {
      const trail = [nodeId];
      let current: Node | undefined = node;
      while (current && current.parentId !== null) {
        trail.unshift(current.parentId);
        current = nodes.find(n => n.id === current!.parentId!);
      }
      setBreadcrumbs(trail);
    }
  };

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const world = canvasToWorld(e.clientX, e.clientY);
    const clickedNode = getNodeAtPosition(world.x, world.y);
    
    if (e.button === 0) {
      if (clickedNode && clickedNode.id !== focusedNodeId && clickedNode.parentId === focusedNodeId) {
        const dx = world.x;
        const dy = world.y;
        const angle = Math.atan2(dy, dx);
        setDragState({
          parentId: focusedNodeId,
          lastAngle: angle,
          lastTime: Date.now()
        });
      } else {
        setIsPanning(true);
        setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
      }
    }
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const world = canvasToWorld(e.clientX, e.clientY);
    const node = getNodeAtPosition(world.x, world.y);
    setHoveredNode(node);

    if (dragState) {
      const dx = world.x;
      const dy = world.y;
      const currentAngle = Math.atan2(dy, dx);
      
      let angleDelta = currentAngle - dragState.lastAngle;
      
      while (angleDelta > Math.PI) angleDelta -= Math.PI * 2;
      while (angleDelta < -Math.PI) angleDelta += Math.PI * 2;
      
      const currentTime = Date.now();
      const timeDelta = currentTime - dragState.lastTime;
      const angularVelocity = timeDelta > 0 ? (angleDelta / timeDelta) * 20 : 0;
      
      setSpinningNodes(prev => {
        const currentSpin = prev[dragState.parentId] || { angle: 0, speed: 0 };
        return {
          ...prev,
          [dragState.parentId]: {
            angle: currentSpin.angle + angleDelta,
            speed: angularVelocity
          }
        };
      });
      
      setDragState({
        ...dragState,
        lastAngle: currentAngle,
        lastTime: currentTime
      });
    } else if (isPanning) {
      setPan({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y
      });
    }
  };

  const handleCanvasMouseUp = () => {
    setDraggedNode(null);
    setDragState(null);
    setIsPanning(false);
  };

  const addChildNode = () => {
    if (!selectedNode) return;
    
    const children = nodes.filter(n => n.parentId === selectedNode.id);
    const childIndex = children.length;
    
    const color = getChildColor(selectedNode.id, childIndex);
    
    const angle = (childIndex * Math.PI * 2) / Math.max(childIndex + 1, 4);
    const distance = 150;
    
    const newNode: Node = {
      id: Date.now(),
      text: 'New Node',
      x: Math.cos(angle) * distance,
      y: Math.sin(angle) * distance,
      color: color,
      parentId: selectedNode.id
    };
    
    setNodes([...nodes, newNode]);
    setShowInstructions(false);
  };

  const deleteNode = () => {
    if (!selectedNode || selectedNode.id === 1) return;
    
    const deleteNodeAndChildren = (nodeId: number) => {
      const children = nodes.filter(n => n.parentId === nodeId);
      children.forEach(child => deleteNodeAndChildren(child.id));
      setNodes(prev => prev.filter(n => n.id !== nodeId));
    };
    
    deleteNodeAndChildren(selectedNode.id);
    setSelectedNode(null);
  };

  const startEdit = () => {
    if (!selectedNode) return;
    setEditingNode(selectedNode);
    setEditText(selectedNode.text);
  };

  const saveEdit = () => {
    if (editingNode) {
      setNodes(prev => prev.map(n => 
        n.id === editingNode.id ? { ...n, text: editText } : n
      ));
      setEditingNode(null);
      setEditText('');
    }
  };

  const cancelEdit = () => {
    setEditingNode(null);
    setEditText('');
  };

  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const handleZoom = (delta: number) => {
    setZoom(prev => Math.max(0.5, Math.min(2, prev + delta)));
  };

  const handleSave = () => {
    saveToLocalStorage();
    alert('Mindmap saved to local storage!');
  };

  const handleLoad = () => {
    const saved = localStorage.getItem('mindmap_data');
    if (saved) {
      const data = JSON.parse(saved);
      setNodes(data.nodes);
      setZoom(data.zoom || 1);
      setPan(data.pan || { x: 0, y: 0 });
      alert('Mindmap loaded!');
    } else {
      alert('No saved mindmap found!');
    }
  };

  return (
    <div className="w-full h-screen bg-slate-900 flex flex-col">
      {/* Toolbar */}
      <div className="bg-slate-800 border-b border-slate-700 p-4 flex items-center justify-between relative z-50">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold text-white">Circular Mindmap</h1>
          <span className="text-xs bg-purple-600 text-white px-2 py-1 rounded">Phase 1 Prototype</span>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={handleSave}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition-colors"
          >
            <Save className="w-4 h-4" />
            Save
          </button>
          <button
            onClick={handleLoad}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
          >
            <FolderOpen className="w-4 h-4" />
            Load
          </button>
        </div>
      </div>

      {/* Main Canvas Area */}
      <div className="flex-1 relative">
        {/* Breadcrumb Navigation */}
        {breadcrumbs.length > 1 && (
          <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-10">
            <div className="bg-slate-800/95 rounded-full px-6 py-3 border border-slate-700 shadow-xl">
              <div className="flex items-center gap-3">
                {breadcrumbs.map((nodeId, idx) => {
                  const node = nodes.find(n => n.id === nodeId);
                  const isLast = idx === breadcrumbs.length - 1;
                  const depth = getNodeDepth(nodeId);
                  const color = getHierarchyColor(depth);
                  return (
                    <React.Fragment key={nodeId}>
                      <button
                        onClick={() => navigateToNode(nodeId)}
                        className={`w-10 h-10 rounded-full transition-all flex items-center justify-center ${
                          isLast 
                            ? 'ring-2 ring-white scale-110' 
                            : 'hover:scale-105'
                        }`}
                        style={{ backgroundColor: color }}
                        title={node?.text || 'Unknown'}
                      >
                        <span className="text-white text-xs font-semibold">
                          {node?.text.charAt(0).toUpperCase() || '?'}
                        </span>
                      </button>
                      {!isLast && <div className="w-6 h-0.5 bg-slate-600"></div>}
                    </React.Fragment>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        <canvas
          ref={canvasRef}
          onClick={handleCanvasClick}
          onMouseDown={handleCanvasMouseDown}
          onMouseMove={handleCanvasMouseMove}
          onMouseUp={handleCanvasMouseUp}
          onMouseLeave={handleCanvasMouseUp}
          className="w-full cursor-move block"
          style={{ width: '100vw', height: 'calc(100vh - 128px)' }}
        />

        {/* Zoom Controls */}
        <div className="absolute bottom-4 right-4 flex flex-col gap-2 z-50">
          <button
            onClick={() => handleZoom(0.1)}
            className="bg-slate-800 hover:bg-slate-700 text-white p-3 rounded-lg shadow-lg transition-colors"
          >
            <ZoomIn className="w-5 h-5" />
          </button>
          <button
            onClick={() => handleZoom(-0.1)}
            className="bg-slate-800 hover:bg-slate-700 text-white p-3 rounded-lg shadow-lg transition-colors"
          >
            <ZoomOut className="w-5 h-5" />
          </button>
          <button
            onClick={resetView}
            className="bg-slate-800 hover:bg-slate-700 text-white p-3 rounded-lg shadow-lg transition-colors"
          >
            <Home className="w-5 h-5" />
          </button>
        </div>

        {/* Node Controls */}
        {selectedNode && (
          <div className="absolute top-4 left-4 bg-slate-800 rounded-lg shadow-xl p-4 border border-slate-700 z-50">
            <div className="text-white font-semibold mb-3">Selected: {selectedNode.text}</div>
            <div className="flex flex-col gap-2">
              {selectedNode.id === focusedNodeId && (
                <button
                  onClick={addChildNode}
                  className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Add Child Node
                </button>
              )}
              <button
                onClick={startEdit}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
              >
                <Edit2 className="w-4 h-4" />
                Edit Text
              </button>
              {selectedNode.id !== 1 && (
                <button
                  onClick={deleteNode}
                  className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete Node
                </button>
              )}
            </div>
          </div>
        )}

        {/* Instructions */}
        {!selectedNode && showInstructions && (
          <div className="absolute top-20 left-4 bg-slate-800/90 rounded-lg p-4 border border-slate-700 max-w-xs">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-white font-semibold">How to use:</h3>
              <button 
                onClick={() => setShowInstructions(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <ul className="text-slate-300 text-sm space-y-1">
              <li>• Click a node to select it</li>
              <li>• <strong>Double-click child nodes to drill down</strong></li>
              <li>• <strong>Click breadcrumbs to navigate back</strong></li>
              <li>• Drag child nodes to spin them!</li>
              <li>• Drag canvas to pan</li>
              <li>• Use zoom controls to zoom in/out</li>
              <li>• Add child nodes from center node</li>
              <li>• Save your work to local storage</li>
            </ul>
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {editingNode && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
          <div className="bg-slate-800 rounded-lg p-6 w-96 border border-slate-700">
            <h3 className="text-white font-semibold mb-4">Edit Node Text</h3>
            <input
              type="text"
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              onKeyDown={(e) => (e as React.KeyboardEvent<HTMLInputElement>).key === 'Enter' && saveEdit()}
              className="w-full bg-slate-700 text-white px-4 py-2 rounded-lg mb-4 focus:outline-none focus:ring-2 focus:ring-purple-600"
              autoFocus
            />
            <div className="flex gap-2">
              <button
                onClick={saveEdit}
                className="flex-1 flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition-colors"
              >
                <Check className="w-4 h-4" />
                Save
              </button>
              <button
                onClick={cancelEdit}
                className="flex-1 flex items-center justify-center gap-2 bg-slate-600 hover:bg-slate-700 text-white px-4 py-2 rounded-lg transition-colors"
              >
                <X className="w-4 h-4" />
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Status Bar */}
      <div className="bg-slate-800 border-t border-slate-700 px-4 py-2 flex items-center justify-between text-sm text-slate-400">
        <div>Total Nodes: {nodes.length} | Visible: {nodes.filter(n => n.id === focusedNodeId || n.parentId === focusedNodeId).length} | Zoom: {(zoom * 100).toFixed(0)}%</div>
        <div>Phase 1: Hierarchical navigation with spinning nodes</div>
      </div>
    </div>
  );
};

export default CircularMindmap;