import type React from "react";
import { useState } from "react";
import { Upload, FileText, Loader2, CheckCircle2, XCircle } from "lucide-react";

interface DocumentUploadPanelProps {
	onUploaded?: (result: { documentId: string; title: string; chunksCount: number }) => void;
}

type UploadStatus = "idle" | "uploading" | "parsing" | "completed" | "error";

export const DocumentUploadPanel: React.FC<DocumentUploadPanelProps> = ({ onUploaded }) => {
	const [status, setStatus] = useState<UploadStatus>("idle");
	const [fileName, setFileName] = useState("");
	const [error, setError] = useState("");
	const [result, setResult] = useState<{ documentId: string; title: string; chunksCount: number } | null>(null);

	const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file) return;

		setFileName(file.name);
		setStatus("uploading");
		setError("");
		setResult(null);

		try {
			const { documentParser } = await import("@agentmesh/knowledge-base");
			const uploadResult = await documentParser.uploadAndParse("current-user", file);

			setStatus("parsing");

			const finalResult = await documentParser.waitForParse(uploadResult.documentId);
			if (finalResult.status === "completed") {
				setStatus("completed");
				setResult({
					documentId: finalResult.documentId,
					title: finalResult.title,
					chunksCount: finalResult.chunksCount,
				});
				onUploaded?.(finalResult);
			} else {
				throw new Error(finalResult.error ?? "Parsing failed");
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : "Upload failed";
			setError(message);
			setStatus("error");
		}

		e.target.value = "";
	};

	return (
		<div className="panel" style={{ padding: 16, border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12 }}>
			<div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
				<FileText size={18} style={{ color: "var(--cline-green)" }} />
				<h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Document Upload</h3>
			</div>

			<label
				style={{
					display: "flex",
					flexDirection: "column",
					alignItems: "center",
					justifyContent: "center",
					gap: 8,
					padding: "24px 16px",
					border: "1px dashed rgba(255,255,255,0.15)",
					borderRadius: 8,
					cursor: "pointer",
					transition: "border-color 0.2s",
				}}
			>
				<Upload size={24} style={{ color: "rgba(255,255,255,0.5)" }} />
				<span style={{ color: "rgba(255,255,255,0.7)", fontSize: 14 }}>
					{status === "uploading" || status === "parsing" ? "Processing..." : "Click to upload a document"}
				</span>
				<input
					type="file"
					accept=".pdf,.doc,.docx,.txt,.md,.html,.csv,.xlsx,.pptx,.json,.epub,.mhtml"
					onChange={handleUpload}
					disabled={status === "uploading" || status === "parsing"}
					style={{ display: "none" }}
				/>
			</label>

			{fileName && (
				<div style={{ marginTop: 12, fontSize: 13, color: "rgba(255,255,255,0.7)" }}>
					Selected: <strong>{fileName}</strong>
				</div>
			)}

			{status === "uploading" && (
				<div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8, color: "var(--cline-green)" }}>
					<Loader2 size={16} className="spin" />
					<span style={{ fontSize: 13 }}>Uploading to WeKnora...</span>
				</div>
			)}

			{status === "parsing" && (
				<div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8, color: "var(--cline-green)" }}>
					<Loader2 size={16} className="spin" />
					<span style={{ fontSize: 13 }}>Parsing document...</span>
				</div>
			)}

			{status === "completed" && result && (
				<div
					style={{
						marginTop: 12,
						padding: 10,
						background: "rgba(16, 185, 129, 0.1)",
						border: "1px solid rgba(16, 185, 129, 0.2)",
						borderRadius: 8,
						display: "flex",
						alignItems: "center",
						gap: 8,
					}}
				>
					<CheckCircle2 size={16} style={{ color: "var(--cline-green)" }} />
					<span style={{ fontSize: 13 }}>
						Indexed <strong>{result.chunksCount}</strong> chunks from <strong>{result.title}</strong>
					</span>
				</div>
			)}

			{status === "error" && (
				<div
					style={{
						marginTop: 12,
						padding: 10,
						background: "rgba(239, 68, 68, 0.1)",
						border: "1px solid rgba(239, 68, 68, 0.2)",
						borderRadius: 8,
						display: "flex",
						alignItems: "center",
						gap: 8,
					}}
				>
					<XCircle size={16} style={{ color: "#ef4444" }} />
					<span style={{ fontSize: 13, color: "#ef4444" }}>{error}</span>
				</div>
			)}
		</div>
	);
};
