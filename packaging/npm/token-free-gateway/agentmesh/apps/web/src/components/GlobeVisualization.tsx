/**
 * GlobeVisualization — Three-globe base earth + H3 hexagon cell overlay.
 *
 * Combines:
 *   - three-globe (globe.gl) for realistic 3D Earth with atmosphere, auto-rotation
 *   - H3 hexagonal cells (from ontology data) rendered as extruded polygons on the globe surface
 *   - Click interaction to select cells and show detail drawer
 *
 * References:
 *   - https://vasturiano.github.io/three-globe/example/links/
 *   - https://github.com/ValyrianTech/HexGlobe
 *   - https://zzsza.github.io/data/2019/03/31/uber-h3/
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { H3CellAggregation } from "@agentmesh/peer-mesh";
import { latLngToCell, cellToBoundary, cellToLatLng, isValidCell } from "h3-js";

// Type declarations for optional dependencies
type GlobeInstance = any;
type ThreeJS = any;

let Globe: ((domElement: HTMLElement) => GlobeInstance) | null = null;
let THREE: ThreeJS | null = null;

// Dynamic import for optional dependencies
async function loadGlobeDependencies(): Promise<{ Globe: any; THREE: any } | null> {
	try {
		// Use dynamic import with string literal to avoid TypeScript module resolution
		const globeModule = await (eval("import")("globe.gl")) as any;
		const threeModule = await (eval("import")("three")) as any;
		Globe = globeModule.default ?? globeModule;
		THREE = threeModule;
		return { Globe, THREE };
	} catch {
		// Dependencies not available
		return null;
	}
}

interface GlobeVisualizationProps {
	cells: H3CellAggregation[];
	resolution?: number;
	onCellClick?: (cell: H3CellAggregation) => void;
	selectedCellId?: string | null;
	autoRotate?: boolean;
	autoRotateSpeed?: number;
	/** Globe color theme */
	theme?: "dark" | "light";
	/** Show atmosphere glow */
	showAtmosphere?: boolean;
	/** Background color */
	backgroundColor?: string;
}

const DEFAULT_RESOLUTION = 4;
const EARTH_RADIUS = 100; // three-globe uses 100 units for Earth radius

// Hexagon extrusion height multiplier
const HEIGHT_MULTIPLIER = 0.5;

function impactTierToColor(tier: string): string {
	switch (tier) {
		case "critical": return "#ef4444";
		case "high": return "#f59e0b";
		case "medium": return "#38bdf8";
		case "low": return "#10b981";
		default: return "#38bdf8";
	}
}

export function GlobeVisualization({
	cells,
	resolution = DEFAULT_RESOLUTION,
	onCellClick,
	selectedCellId,
	autoRotate = true,
	autoRotateSpeed = 0.3,
	theme = "dark",
	showAtmosphere = true,
	backgroundColor = theme === "dark" ? "#0a0a12" : "#ffffff",
}: GlobeVisualizationProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const globeRef = useRef<GlobeInstance | null>(null);
	const hexMeshRef = useRef<any>(null);
	const [ready, setReady] = useState(false);
	const [depsLoaded, setDepsLoaded] = useState(false);

	// Build Three.js hexagon meshes from H3 cells
	const hexGroup = useMemo(() => {
		if (!THREE) return null;
		const group = new THREE.Group();
		const globeRadius = EARTH_RADIUS;

		cells.forEach((cell) => {
			if (!isValidCell(cell.h3CellId)) return;

			const boundary = cellToBoundary(cell.h3CellId, true); // true = geoJson format [lng, lat]
			if (boundary.length < 3) return;

			// Convert lat/lng to 3D positions on sphere
			const positions = boundary.map(([lng, lat]) => {
				const phi = (90 - lat) * (Math.PI / 180);
				const theta = (lng + 180) * (Math.PI / 180);
				const x = globeRadius * Math.sin(phi) * Math.cos(theta);
				const y = globeRadius * Math.cos(phi);
				const z = globeRadius * Math.sin(phi) * Math.sin(theta);
				return new THREE.Vector3(x, y, z);
			});

			// Create shape from 2D projection (for extrusion)
			const center = cellToLatLng(cell.h3CellId) as [number, number];
			const [centerLat, centerLng] = center;

			// Project to local tangent plane for Shape
			const shapePoints = boundary.map(([lng, lat]) => {
				// Simple equirectangular projection around cell center
				const dx = (lng - centerLng) * Math.cos(centerLat * Math.PI / 180);
				const dy = lat - centerLat;
				return new THREE.Vector2(dx * 111, dy * 111); // ~111km per degree
			});

			const shape = new THREE.Shape(shapePoints);
			const extrudeSettings = {
				depth: HEIGHT_MULTIPLIER * (cell.peerCount || 1) * 10,
				bevelEnabled: false,
			};

			const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
			const color = impactTierToColor(cell.impactTier);
			const isSelected = selectedCellId === cell.h3CellId;
			const opacity = isSelected ? 0.9 : 0.4 + Math.min(0.4, (cell.peerCount || 0) / 20);

			const material = new THREE.MeshStandardMaterial({
				color: new THREE.Color(color),
				transparent: true,
				opacity,
				metalness: 0.1,
				roughness: 0.7,
				side: THREE.DoubleSide,
			});

			const mesh = new THREE.Mesh(geometry, material);
			mesh.userData = { h3CellId: cell.h3CellId, cell };

			// Position mesh on sphere surface
			const phi = (90 - centerLat) * (Math.PI / 180);
			const theta = (centerLng + 180) * (Math.PI / 180);
			mesh.position.set(
				globeRadius * Math.sin(phi) * Math.cos(theta),
				globeRadius * Math.cos(phi),
				globeRadius * Math.sin(phi) * Math.sin(theta),
			);

			// Orient mesh to face outward from sphere center
			mesh.lookAt(0, 0, 0);
			mesh.rotateX(Math.PI / 2); // Align extrusion with radial direction

			group.add(mesh);
		});

		return group;
	}, [cells, selectedCellId]);

	// Initialize globe.gl
	useEffect(() => {
		let mounted = true;

		loadGlobeDependencies().then((deps) => {
			if (!mounted || !deps) return;
			const { Globe: GlobeClass, THREE: ThreeLib } = deps;
			if (!GlobeClass) return;

			const container = containerRef.current;
			if (!container) return;

			const globe = GlobeClass(container);

			// Configure globe appearance
			globe
				.globeImageUrl("//unpkg.com/three-globe/example/img/earth-blue-marble.jpg")
				.backgroundColor(backgroundColor)
				.showAtmosphere(showAtmosphere)
				.atmosphereColor(theme === "dark" ? "#38bdf8" : "#0ea5e9")
				.atmosphereAltitude(0.15)
				.pointOfView({ lat: 25, lng: 20, altitude: 2.5 }, 0);

			// Add hexagon group to globe's Three.js scene
			if (hexGroup) {
				globe.scene().add(hexGroup);
				hexMeshRef.current = hexGroup;
			}

			// Controls
			const controls = globe.controls();
			controls.autoRotate = autoRotate;
			controls.autoRotateSpeed = autoRotateSpeed;
			controls.enablePan = false;
			controls.minZoom = 1;
			controls.maxZoom = 5;

			// Raycasting for cell click detection
			const raycaster = new ThreeLib.Raycaster();
			const mouse = new ThreeLib.Vector2();

			const onClick = (event: MouseEvent) => {
				const rect = container.getBoundingClientRect();
				mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
				mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

				raycaster.setFromCamera(mouse, globe.camera());
				const intersects = raycaster.intersectObjects(hexGroup?.children ?? [], true);

				if (intersects.length > 0) {
					const mesh = intersects[0].object;
					const cellData = mesh.userData?.cell as H3CellAggregation | undefined;
					if (cellData && onCellClick) {
						onCellClick(cellData);
					}
				}
			};

			container.addEventListener("click", onClick);

			globeRef.current = globe;
			setDepsLoaded(true);
			setReady(true);

			// Resize handler
			const observer = new ResizeObserver(() => {
				const width = container.clientWidth;
				const height = container.clientHeight;
				if (width > 0 && height > 0) {
					globe.width(width).height(height);
				}
			});
			observer.observe(container);

			return () => {
				observer.disconnect();
				container.removeEventListener("click", onClick);
				if (hexGroup) globe.scene().remove(hexGroup);
				globe._destructor();
				globeRef.current = null;
				hexMeshRef.current = null;
			};
		});

		return () => { mounted = false; };
	}, [theme, backgroundColor, showAtmosphere, autoRotate, autoRotateSpeed, hexGroup]);

	// Update hex meshes when cells or selection changes
	useEffect(() => {
		if (!THREE || !hexMeshRef.current || !hexGroup) return;

		// Remove old meshes
		while (hexMeshRef.current.children.length > 0) {
			const child = hexMeshRef.current.children[0];
			if (child instanceof THREE.Mesh) {
				child.geometry.dispose();
				if (Array.isArray(child.material)) {
					child.material.forEach((m: any) => m.dispose());
				} else {
					child.material.dispose();
				}
			}
			hexMeshRef.current.remove(child);
		}

		// Rebuild from hexGroup memo
		hexGroup.children.forEach((mesh: any) => {
			hexMeshRef.current!.add(mesh.clone());
		});
	}, [cells, selectedCellId, hexGroup]);

	if (!ready && !depsLoaded) {
		return (
			<div
				ref={containerRef}
				style={{
					width: "100%",
					height: "100%",
					minHeight: 400,
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					background: backgroundColor,
					borderRadius: 12,
				}}
			>
				<div style={{ color: theme === "dark" ? "#888" : "#666", fontSize: 14 }}>
					Loading globe...
				</div>
			</div>
		);
	}

	return <div ref={containerRef} style={{ width: "100%", height: "100%", minHeight: 400 }} />;
}

export default GlobeVisualization;