"use client";

import { useState, useRef, useEffect, ReactNode } from "react";

interface WindowProps {
	id: string;
	title: string;
	defaultSize?: { width: number; height: number };
	defaultPosition?: { x: number; y: number };
	icon?: ReactNode;
	children: ReactNode;
	onClose?: () => void;
}

export function Window({
	id,
	title,
	defaultSize = { width: 400, height: 300 },
	defaultPosition = { x: 100, y: 100 },
	icon,
	children,
	onClose,
}: WindowProps) {
	const [size, setSize] = useState(defaultSize);
	const [position, setPosition] = useState(defaultPosition);
	const [isDragging, setIsDragging] = useState(false);
	const [isResizing, setIsResizing] = useState(false);
	const headerRef = useRef<HTMLDivElement>(null);
	const windowRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const handleMouseMove = (e: MouseEvent) => {
			if (isDragging && headerRef.current) {
				setPosition({
					x: e.clientX - headerRef.current.offsetWidth / 2,
					y: e.clientY - 40,
				});
			}
			if (isResizing && windowRef.current) {
				setSize({
					width: Math.max(300, e.clientX - position.x),
					height: Math.max(200, e.clientY - position.y),
				});
			}
		};

		const handleMouseUp = () => {
			setIsDragging(false);
			setIsResizing(false);
		};

		document.addEventListener("mousemove", handleMouseMove);
		document.addEventListener("mouseup", handleMouseUp);

		return () => {
			document.removeEventListener("mousemove", handleMouseMove);
			document.removeEventListener("mouseup", handleMouseUp);
		};
	}, [isDragging, isResizing, position]);

	return (
		<div
			className="desktop-window"
			ref={windowRef}
			style={{
				width: size.width,
				height: size.height,
				left: position.x,
				top: position.y,
				zIndex: 100,
			}}
		>
			<div
				className="window-header"
				ref={headerRef}
				onMouseDown={() => setIsDragging(true)}
			>
				<span className="window-title flex items-center gap-2">
					{icon}
					{title}
				</span>
				<div className="window-controls">
					<button
						className="window-close-btn"
						onClick={onClose}
					>
						×
					</button>
				</div>
			</div>
			<div className="window-content">{children}</div>
			<div
				className="window-resize-handle"
				onMouseDown={() => setIsResizing(true)}
			/>
		</div>
	);
}
