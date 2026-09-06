import React, { useRef, useEffect, useState, useCallback } from 'react';
import { CosmicNode, CosmicEdge, Shockwave, Star, NodeType } from './types';

interface CosmicCanvasProps {
  nodes: CosmicNode[];
  edges: CosmicEdge[];
  selectedNodeId: string | null;
  onSelectNode: (node: CosmicNode | null) => void;
  shockwaves: Shockwave[];
  searchFilter: string;
  activeTypeFilters: Record<NodeType, boolean>;
  repelStrength: number;
  linkDistance: number;
  centerGravity: number;
}

export const CosmicCanvas: React.FC<CosmicCanvasProps> = ({
  nodes,
  edges,
  selectedNodeId,
  onSelectNode,
  shockwaves,
  searchFilter,
  activeTypeFilters,
  repelStrength,
  linkDistance,
  centerGravity,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Pan and Zoom Camera State
  const cameraRef = useRef<{ x: number; y: number; zoom: number }>({ x: 0, y: 0, zoom: 1.0 });
  const isDraggingCanvasRef = useRef<boolean>(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Node Dragging State
  const draggedNodeRef = useRef<CosmicNode | null>(null);
  const hoveredNodeRef = useRef<CosmicNode | null>(null);

  // Background Stars
  const starsRef = useRef<Star[]>([]);
  const stardustRef = useRef<{ x: number; y: number; vx: number; vy: number; size: number; alpha: number }[]>([]);

  // Simulation Nodes Reference
  const simNodesRef = useRef<CosmicNode[]>([]);
  const simEdgesRef = useRef<CosmicEdge[]>([]);

  // Keep references synced
  useEffect(() => {
    // Merge new nodes while keeping positions of existing ones
    const existingMap = new Map(simNodesRef.current.map((n) => [n.id, n]));
    simNodesRef.current = nodes.map((n) => {
      const existing = existingMap.get(n.id);
      if (existing) {
        return {
          ...n,
          x: existing.x,
          y: existing.y,
          vx: existing.vx,
          vy: existing.vy,
        };
      }
      return { ...n };
    });
    simEdgesRef.current = edges;
  }, [nodes, edges]);

  // Generate Cosmic Background Stars & Stardust
  useEffect(() => {
    const stars: Star[] = [];
    const colors = ['#ffffff', '#bae6fd', '#e0e7ff', '#fef08a', '#c7d2fe'];
    for (let i = 0; i < 280; i++) {
      stars.push({
        x: Math.random() * 3200 - 1600,
        y: Math.random() * 2400 - 1200,
        size: Math.random() * 2.2 + 0.6,
        baseAlpha: Math.random() * 0.7 + 0.3,
        twinkleSpeed: Math.random() * 0.03 + 0.01,
        phase: Math.random() * Math.PI * 2,
        color: colors[Math.floor(Math.random() * colors.length)] ?? '#ffffff',
      });
    }
    starsRef.current = stars;

    const stardust = [];
    for (let i = 0; i < 80; i++) {
      stardust.push({
        x: Math.random() * 2400 - 1200,
        y: Math.random() * 1800 - 900,
        vx: (Math.random() - 0.5) * 0.2,
        vy: (Math.random() - 0.5) * 0.2,
        size: Math.random() * 1.5 + 0.5,
        alpha: Math.random() * 0.4 + 0.1,
      });
    }
    stardustRef.current = stardust;
  }, []);

  // Main Canvas Render & Physics Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let packetStep = 0;

    const handleResize = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
    };
    handleResize();
    window.addEventListener('resize', handleResize);

    const render = () => {
      packetStep += 0.006;
      const dpr = window.devicePixelRatio || 1;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const width = window.innerWidth;
      const height = window.innerHeight;
      const cx = width / 2;
      const cy = height / 2;
      const { x: camX, y: camY, zoom } = cameraRef.current;

      // 1. Draw Deep Space Celestial Canvas
      ctx.save();
      ctx.fillStyle = '#030611';
      ctx.fillRect(0, 0, width, height);

      // Deep Nebula Silhouette Gradients
      const grad1 = ctx.createRadialGradient(cx + 200, cy - 100, 50, cx + 200, cy - 100, 600);
      grad1.addColorStop(0, 'rgba(99, 102, 241, 0.15)');
      grad1.addColorStop(0.5, 'rgba(56, 189, 248, 0.06)');
      grad1.addColorStop(1, 'rgba(3, 6, 17, 0)');
      ctx.fillStyle = grad1;
      ctx.fillRect(0, 0, width, height);

      const grad2 = ctx.createRadialGradient(cx - 300, cy + 180, 80, cx - 300, cy + 180, 700);
      grad2.addColorStop(0, 'rgba(168, 85, 247, 0.12)');
      grad2.addColorStop(0.6, 'rgba(236, 72, 153, 0.04)');
      grad2.addColorStop(1, 'rgba(3, 6, 17, 0)');
      ctx.fillStyle = grad2;
      ctx.fillRect(0, 0, width, height);

      // Subtle Cosmic Grid Silhouette
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.025)';
      ctx.lineWidth = 1;
      const gridSize = 120 * zoom;
      const offsetX = (cx + camX * zoom) % gridSize;
      const offsetY = (cy + camY * zoom) % gridSize;
      ctx.beginPath();
      for (let x = offsetX; x < width; x += gridSize) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
      }
      for (let y = offsetY; y < height; y += gridSize) {
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
      }
      ctx.stroke();

      // Cosmic Horizon Mountain / Ring Silhouette at the bottom
      ctx.save();
      const horizonY = height - 120;
      const horizonGrad = ctx.createLinearGradient(0, horizonY - 80, 0, height);
      horizonGrad.addColorStop(0, 'rgba(14, 165, 233, 0.04)');
      horizonGrad.addColorStop(0.4, 'rgba(2, 4, 10, 0.85)');
      horizonGrad.addColorStop(1, '#010206');

      ctx.fillStyle = horizonGrad;
      ctx.beginPath();
      ctx.moveTo(0, height);
      ctx.lineTo(0, horizonY + 30);
      ctx.bezierCurveTo(width * 0.25, horizonY - 40, width * 0.45, horizonY + 60, width * 0.7, horizonY - 20);
      ctx.bezierCurveTo(width * 0.85, horizonY - 70, width * 0.95, horizonY + 10, width, horizonY + 20);
      ctx.lineTo(width, height);
      ctx.closePath();
      ctx.fill();

      // Atmospheric Edge Glow along the Horizon
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.18)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, horizonY + 30);
      ctx.bezierCurveTo(width * 0.25, horizonY - 40, width * 0.45, horizonY + 60, width * 0.7, horizonY - 20);
      ctx.bezierCurveTo(width * 0.85, horizonY - 70, width * 0.95, horizonY + 10, width, horizonY + 20);
      ctx.stroke();
      ctx.restore();

      // 2. Transform into World Space (Camera Translation & Zoom)
      ctx.translate(cx + camX * zoom, cy + camY * zoom);
      ctx.scale(zoom, zoom);

      // Render Starfield with Twinkle
      const nowTime = performance.now() * 0.001;
      starsRef.current.forEach((star) => {
        const twinkle = Math.sin(nowTime * star.twinkleSpeed * 10 + star.phase);
        const alpha = Math.max(0.1, star.baseAlpha + twinkle * 0.3);
        ctx.fillStyle = star.color;
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1.0;

      // Render Floating Stardust
      stardustRef.current.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < -1200) p.x = 1200;
        if (p.x > 1200) p.x = -1200;
        if (p.y < -900) p.y = 900;
        if (p.y > 900) p.y = -900;

        ctx.fillStyle = 'rgba(224, 231, 255, 0.25)';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      });

      // 3. Supernova Shockwave Rings
      shockwaves.forEach((sw) => {
        ctx.save();
        ctx.strokeStyle = sw.color;
        ctx.lineWidth = Math.max(1, (1 - sw.radius / sw.maxRadius) * 4);
        ctx.globalAlpha = sw.opacity;
        ctx.beginPath();
        ctx.arc(sw.x, sw.y, sw.radius, 0, Math.PI * 2);
        ctx.stroke();

        // Secondary inner echo ring
        if (sw.radius > 20) {
          ctx.beginPath();
          ctx.arc(sw.x, sw.y, sw.radius * 0.7, 0, Math.PI * 2);
          ctx.lineWidth = 1;
          ctx.stroke();
        }
        ctx.restore();
      });

      // 4. Force Physics Calculations
      const simNodes = simNodesRef.current;
      const simEdges = simEdgesRef.current;
      const nodeMap = new Map<string, CosmicNode>();
      simNodes.forEach((n) => nodeMap.set(n.id, n));

      // Filter visible nodes based on activeTypeFilters & search
      const query = searchFilter.toLowerCase().trim();
      const isNodeVisible = (n: CosmicNode) => {
        if (!activeTypeFilters[n.type]) return false;
        if (!query) return true;
        return (
          n.label.toLowerCase().includes(query) ||
          n.frontmatter.title.toLowerCase().includes(query) ||
          n.frontmatter.tags.some((t) => t.toLowerCase().includes(query))
        );
      };

      // Physics: Repulsion between all nodes
      for (let i = 0; i < simNodes.length; i++) {
        const a = simNodes[i];
        if (!a) continue;
        for (let j = i + 1; j < simNodes.length; j++) {
          const b = simNodes[j];
          if (!b) continue;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const distSq = dx * dx + dy * dy + 400; // prevent divide by zero
          const dist = Math.sqrt(distSq);
          const force = (repelStrength * 2500) / distSq;
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;

          if (!a.pinned && a !== draggedNodeRef.current) {
            a.vx -= fx;
            a.vy -= fy;
          }
          if (!b.pinned && b !== draggedNodeRef.current) {
            b.vx += fx;
            b.vy += fy;
          }
        }
      }

      // Physics: Spring attraction along edges
      simEdges.forEach((edge) => {
        const source = nodeMap.get(edge.source);
        const target = nodeMap.get(edge.target);
        if (!source || !target) return;

        const dx = target.x - source.x;
        const dy = target.y - source.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const targetDist = linkDistance * (edge.weight || 1.0);
        const displacement = dist - targetDist;
        const springForce = displacement * 0.025;
        const fx = (dx / dist) * springForce;
        const fy = (dy / dist) * springForce;

        if (!source.pinned && source !== draggedNodeRef.current) {
          source.vx += fx;
          source.vy += fy;
        }
        if (!target.pinned && target !== draggedNodeRef.current) {
          target.vx -= fx;
          target.vy -= fy;
        }
      });

      // Physics: Center gravity & integration
      simNodes.forEach((node) => {
        if (node.pinned || node === draggedNodeRef.current) {
          node.vx = 0;
          node.vy = 0;
          return;
        }
        // Pull toward center (0, 0)
        node.vx += -node.x * (centerGravity * 0.0006);
        node.vy += -node.y * (centerGravity * 0.0006);

        // Friction damping
        node.vx *= 0.88;
        node.vy *= 0.88;

        node.x += node.vx;
        node.y += node.vy;
      });

      // 5. Render Edges (Filaments & Data Packets)
      simEdges.forEach((edge, idx) => {
        const s = nodeMap.get(edge.source);
        const t = nodeMap.get(edge.target);
        if (!s || !t) return;

        const sVis = isNodeVisible(s);
        const tVis = isNodeVisible(t);
        if (!sVis && !tVis) return;

        const isHighlighted =
          selectedNodeId === s.id ||
          selectedNodeId === t.id ||
          hoveredNodeRef.current?.id === s.id ||
          hoveredNodeRef.current?.id === t.id;

        ctx.save();
        if (isHighlighted) {
          ctx.strokeStyle = 'rgba(56, 189, 248, 0.75)';
          ctx.lineWidth = 2.2;
          ctx.shadowColor = '#38bdf8';
          ctx.shadowBlur = 8;
        } else {
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
          ctx.lineWidth = 1;
        }

        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(t.x, t.y);
        ctx.stroke();

        // Edge packet pulse animation
        const offset = (packetStep * 1.5 + (idx * 0.2)) % 1;
        const px = s.x + (t.x - s.x) * offset;
        const py = s.y + (t.y - s.y) * offset;
        ctx.fillStyle = isHighlighted ? '#38bdf8' : '#e6ff87';
        ctx.beginPath();
        ctx.arc(px, py, isHighlighted ? 3 : 1.8, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
      });

      // 6. Render Nodes (Obsidian Constellation Style)
      simNodes.forEach((node) => {
        const isVisible = isNodeVisible(node);
        const isSelected = selectedNodeId === node.id;
        const isHovered = hoveredNodeRef.current?.id === node.id;
        const nodeColor = node.color || '#38bdf8';

        ctx.save();
        ctx.globalAlpha = isVisible ? 1.0 : 0.15;

        // Outer Glow Aura
        if (isSelected || isHovered) {
          const glowGrad = ctx.createRadialGradient(node.x, node.y, node.radius * 0.8, node.x, node.y, node.radius * 2.8);
          glowGrad.addColorStop(0, nodeColor);
          glowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
          ctx.fillStyle = glowGrad;
          ctx.beginPath();
          ctx.arc(node.x, node.y, node.radius * 2.8, 0, Math.PI * 2);
          ctx.fill();

          // Selection Pulse Ring
          ctx.strokeStyle = nodeColor;
          ctx.lineWidth = 1.5;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.arc(node.x, node.y, node.radius + 8, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        // Base Node Fill
        ctx.fillStyle = '#080c17';
        ctx.strokeStyle = nodeColor;
        ctx.lineWidth = isSelected ? 3 : 2;
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Center Core Dot
        ctx.fillStyle = nodeColor;
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius * 0.45, 0, Math.PI * 2);
        ctx.fill();

        // Label Badge
        const labelText = node.label;
        ctx.font = isSelected ? 'bold 12px "JetBrains Mono", monospace' : '10px "JetBrains Mono", monospace';
        const textWidth = ctx.measureText(labelText).width;
        const labelY = node.y + node.radius + 15;

        // Label background pill for readability
        ctx.fillStyle = 'rgba(8, 12, 23, 0.85)';
        ctx.strokeStyle = isSelected ? nodeColor : 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 1;
        const padX = 6;
        const padY = 3;
        ctx.beginPath();
        ctx.roundRect(
          node.x - textWidth / 2 - padX,
          labelY - 10 - padY,
          textWidth + padX * 2,
          16 + padY * 2,
          4
        );
        ctx.fill();
        ctx.stroke();

        // Text
        ctx.fillStyle = isSelected ? '#ffffff' : '#cbd5e1';
        ctx.textAlign = 'center';
        ctx.fillText(labelText, node.x, labelY);

        ctx.restore();
      });

      ctx.restore(); // Restore world transform

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
    };
  }, [
    shockwaves,
    searchFilter,
    activeTypeFilters,
    repelStrength,
    linkDistance,
    centerGravity,
    selectedNodeId,
  ]);

  // Screen to World coordinate conversion
  // screenX/Y should already be in canvas-local space (subtract rect.left/top at call sites)
  const screenToWorld = useCallback((screenX: number, screenY: number) => {
    if (!canvasRef.current) return { x: 0, y: 0 };
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    const { x: camX, y: camY, zoom } = cameraRef.current;
    return {
      x: (screenX - cx) / zoom - camX,
      y: (screenY - cy) / zoom - camY,
    };
  }, []);

  // Local-space screen coords (relative to the canvas rect, not the viewport)
  const toLocal = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  // Find node under screen coordinates (canvas-local space)
  const getNodeAt = useCallback(
    (localX: number, localY: number): CosmicNode | null => {
      const world = screenToWorld(localX, localY);
      const hitTolerance = 16;
      for (let i = simNodesRef.current.length - 1; i >= 0; i--) {
        const node = simNodesRef.current[i];
        if (!node) continue;
        const dx = world.x - node.x;
        const dy = world.y - node.y;
        if (dx * dx + dy * dy <= (node.radius + hitTolerance) ** 2) {
          return node;
        }
      }
      return null;
    },
    [screenToWorld]
  );

  // Mouse Handlers: Panning, Dragging, Zooming
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { x: lx, y: ly } = toLocal(e);
    const hitNode = getNodeAt(lx, ly);
    if (hitNode) {
      draggedNodeRef.current = hitNode;
      onSelectNode(hitNode);
    } else {
      isDraggingCanvasRef.current = true;
      dragStartRef.current = { x: e.clientX, y: e.clientY };
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { x: lx, y: ly } = toLocal(e);
    if (draggedNodeRef.current) {
      const world = screenToWorld(lx, ly);
      draggedNodeRef.current.x = world.x;
      draggedNodeRef.current.y = world.y;
      draggedNodeRef.current.vx = 0;
      draggedNodeRef.current.vy = 0;
    } else if (isDraggingCanvasRef.current) {
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      dragStartRef.current = { x: e.clientX, y: e.clientY };
      cameraRef.current.x += dx / cameraRef.current.zoom;
      cameraRef.current.y += dy / cameraRef.current.zoom;
    } else {
      // Hover detection
      const hit = getNodeAt(lx, ly);
      hoveredNodeRef.current = hit;
      if (canvasRef.current) {
        canvasRef.current.style.cursor = hit ? 'pointer' : 'grab';
      }
    }
  };

  const handleMouseUp = () => {
    draggedNodeRef.current = null;
    isDraggingCanvasRef.current = false;
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const zoomFactor = e.deltaY < 0 ? 1.12 : 0.89;
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    const { x: camX, y: camY, zoom: oldZoom } = cameraRef.current;
    const newZoom = Math.min(3.5, Math.max(0.3, oldZoom * zoomFactor));
    // Anchor zoom: keep the world point under the cursor stable across zoom
    const worldX = (sx - cx) / oldZoom - camX;
    const worldY = (sy - cy) / oldZoom - camY;
    cameraRef.current.zoom = newZoom;
    cameraRef.current.x = (sx - cx) / newZoom - worldX;
    cameraRef.current.y = (sy - cy) / newZoom - worldY;
  };

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full block select-none"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
    />
  );
};
