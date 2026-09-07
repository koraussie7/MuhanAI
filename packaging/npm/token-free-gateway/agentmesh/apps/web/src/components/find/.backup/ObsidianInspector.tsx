import { Check, Copy, FileText, Link2, Wifi, X } from "lucide-react";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import type { CosmicNode } from "./types";

interface ObsidianInspectorProps {
	node: CosmicNode | null;
	allNodes: CosmicNode[];
	onClose: () => void;
	onSelectNode: (node: CosmicNode) => void;
}

export const ObsidianInspector: React.FC<ObsidianInspectorProps> = ({
	node,
	allNodes,
	onClose,
	onSelectNode,
}) => {
	const [copied, setCopied] = useState(false);
	const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		return () => {
			if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
		};
	}, []);

	useEffect(() => {
		setCopied(false);
		if (copyTimerRef.current) {
			clearTimeout(copyTimerRef.current);
			copyTimerRef.current = null;
		}
	}, []);

	if (!node) return null;

	const fm = node.frontmatter;

	// Find backlinks: explicit links[] OR a [[Title]] reference in another note's body
	const escapedTitle = node.frontmatter.title.replace(
		/[.*+?^${}()|[\]\\]/g,
		"\\$&",
	);
	const backlinkWikiLink = new RegExp(
		`\\[\\[\\s*${escapedTitle}(\\.md)?\\s*\\]\\]`,
		"i",
	);
	const backlinks = allNodes.filter((other) => {
		if (other.id === node.id) return false;
		return (
			other.frontmatter.links.includes(node.id) ||
			backlinkWikiLink.test(other.frontmatter.markdown)
		);
	});

	const handleCopyLink = () => {
		navigator.clipboard?.writeText(node.label);
		setCopied(true);
		if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
		copyTimerRef.current = setTimeout(() => {
			setCopied(false);
			copyTimerRef.current = null;
		}, 1500);
	};

	// Render markdown with clickable [[WikiLinks]]
	const renderMarkdownBody = (markdownText: string) => {
		// First split out fenced code blocks so wiki links inside them stay literal
		type Segment = { type: "code" | "text"; content: string };
		const segments: Segment[] = [];
		const codeBlockRegex = /```[\s\S]*?```/g;
		let cursor = 0;
		let match: RegExpExecArray | null;
		while ((match = codeBlockRegex.exec(markdownText)) !== null) {
			if (match.index > cursor) {
				segments.push({
					type: "text",
					content: markdownText.slice(cursor, match.index),
				});
			}
			segments.push({ type: "code", content: match[0] });
			cursor = match.index + match[0].length;
		}
		if (cursor < markdownText.length) {
			segments.push({ type: "text", content: markdownText.slice(cursor) });
		}

		return segments.map((seg, idx) => {
			if (seg.type === "code") {
				const inner = seg.content
					.replace(/^```[^\n]*\n?/, "")
					.replace(/\n?```$/, "");
				return (
					<pre key={idx} className="obsidian-code-block">
						<code>{inner}</code>
					</pre>
				);
			}

			const parts = seg.content.split(/(\[\[.*?\]\])/g);
			return parts.map((part, pidx) => {
				if (part.startsWith("[[") && part.endsWith("]]")) {
					const linkText = part.slice(2, -2).trim();
					const stripped = linkText.replace(/\.md$/i, "").toLowerCase();
					const targetNode = allNodes.find(
						(n) =>
							n.frontmatter.title.toLowerCase() === stripped ||
							n.id.toLowerCase() === stripped,
					);

					return (
						<button
							key={`${idx}-${pidx}`}
							type="button"
							className="obsidian-wikilink-btn"
							onClick={() => {
								if (targetNode) onSelectNode(targetNode);
							}}
							title={
								targetNode
									? `Jump to ${targetNode.frontmatter.title}`
									: `Link: ${linkText}`
							}
						>
							<Link2 size={11} className="inline mr-1 opacity-70" />
							{part}
						</button>
					);
				}

				return <span key={`${idx}-${pidx}`}>{part}</span>;
			});
		});
	};

	return (
		<aside className="obsidian-inspector-drawer">
			{/* Drawer Header */}
			<div className="obsidian-inspector-header">
				<div className="flex items-center gap-2 overflow-hidden">
					<FileText size={16} className="text-sky-400 shrink-0" />
					<span className="obsidian-tab-title truncate">
						{node.frontmatter.title}.md
					</span>
				</div>
				<div className="flex items-center gap-1.5 shrink-0">
					<button
						type="button"
						className="obsidian-icon-btn"
						onClick={handleCopyLink}
						title="Copy WikiLink [[...]]"
					>
						{copied ? (
							<Check size={14} className="text-emerald-400" />
						) : (
							<Copy size={14} />
						)}
					</button>
					<button
						type="button"
						className="obsidian-icon-btn close"
						onClick={onClose}
						title="Close Drawer"
					>
						<X size={15} />
					</button>
				</div>
			</div>

			{/* Drawer Content */}
			<div className="obsidian-inspector-body">
				{/* YAML Frontmatter */}
				<div className="obsidian-yaml-box">
					<div className="obsidian-yaml-delimit">---</div>
					<div className="obsidian-yaml-row">
						<span className="yaml-key">title:</span>
						<span className="yaml-val">"{fm.title}"</span>
					</div>
					<div className="obsidian-yaml-row">
						<span className="yaml-key">type:</span>
						<span className="yaml-val">{node.type}</span>
					</div>
					<div className="obsidian-yaml-row">
						<span className="yaml-key">author:</span>
						<span className="yaml-val">{fm.author}</span>
					</div>
					<div className="obsidian-yaml-row">
						<span className="yaml-key">created:</span>
						<span className="yaml-val">{fm.created}</span>
					</div>
					{node.peerId && (
						<div className="obsidian-yaml-row">
							<span className="yaml-key">peer:</span>
							<span className="yaml-val text-emerald-400 font-mono">
								{node.peerId}
							</span>
						</div>
					)}
					<div className="obsidian-yaml-row">
						<span className="yaml-key">tags:</span>
						<div className="flex flex-wrap gap-1 mt-1">
							{fm.tags.map((tag) => (
								<span key={tag} className="obsidian-tag-pill">
									#{tag}
								</span>
							))}
						</div>
					</div>
					<div className="obsidian-yaml-delimit">---</div>
				</div>

				{/* Note Summary */}
				<div className="obsidian-summary-callout">
					<p className="text-xs text-slate-300 leading-relaxed font-sans">
						{fm.summary}
					</p>
				</div>

				{/* Note Body with Clickable WikiLinks */}
				<div className="obsidian-markdown-content">
					<div className="prose prose-invert prose-sm whitespace-pre-line font-sans text-slate-300">
						{renderMarkdownBody(fm.markdown)}
					</div>
				</div>

				{/* Backlinks Section */}
				<div className="obsidian-backlinks-section">
					<div className="obsidian-backlinks-title">
						<Link2 size={13} className="text-sky-400" />
						<span>Backlinks ({backlinks.length})</span>
					</div>
					{backlinks.length === 0 ? (
						<div className="text-xs text-slate-500 italic py-2">
							No linked mentions found
						</div>
					) : (
						<div className="space-y-1.5 mt-2">
							{backlinks.map((b) => (
								<div
									key={b.id}
									className="obsidian-backlink-item"
									onClick={() => onSelectNode(b)}
								>
									<span className="backlink-name">{b.label}</span>
									<span className="backlink-type">{b.type}</span>
								</div>
							))}
						</div>
					)}
				</div>

				{/* Peer Origin Info Card */}
				{node.peerId && (
					<div className="obsidian-peer-card">
						<div className="flex items-center justify-between mb-2">
							<div className="flex items-center gap-1.5">
								<Wifi size={13} className="text-emerald-400" />
								<span className="text-xs font-semibold text-slate-200">
									Peer Provenance
								</span>
							</div>
							<span className="status-pill connected">CRDT Synced</span>
						</div>
						<div className="text-[11px] font-mono text-slate-400">
							Origin Peer: <span className="text-slate-200">{node.peerId}</span>
						</div>
						<div className="text-[11px] font-mono text-slate-400">
							Sync Status:{" "}
							<span className="text-emerald-400">
								Verified WebRTC Mesh Shard
							</span>
						</div>
					</div>
				)}
			</div>
		</aside>
	);
};
