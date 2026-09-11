// Ported from stellavault (MIT) — @stellavault/core/src/intelligence/file-extractors.ts
// Adapted: ESM-only, `noUncheckedIndexedAccess` guards, fallback strategy preserved.
// Heavy parsers (unpdf, mammoth, officeparser, xlsx) are dynamic-imported so they
// never enter the core bundle and are only paid for on the server side. A missing
// parser degrades to a placeholder extraction rather than throwing, so callers
// can ingest a directory of mixed-format files without each format being present.
//
// Security: pdfjs is loaded with `isEvalSupported: false` to close the font-code
// eval path (GHSA-hq66-cqwq-w95j PDF → arbitrary JS execution). We also patch
// `Promise.try` for pdfjs 6.x so it works on Node 20/22 (pdfjs uses ES2025
// Promise.try which only ships natively in Node 23+).

import { readFileSync, statSync } from "node:fs";
import { basename, extname } from "node:path";

export type SourceFormat = "pdf" | "docx" | "pptx" | "xlsx" | "xls" | "text";

export interface ExtractedContent {
	text: string;
	metadata: {
		title?: string;
		author?: string;
		pageCount?: number;
		wordCount: number;
	};
	sourceFormat: SourceFormat;
}

const BINARY_EXTS = new Set([".pdf", ".docx", ".pptx", ".xlsx", ".xls"]);
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

export function isBinaryFormat(filePath: string): boolean {
	return BINARY_EXTS.has(extname(filePath).toLowerCase());
}

export async function extractFileContent(filePath: string): Promise<ExtractedContent> {
	const ext = extname(filePath).toLowerCase();
	const { size } = statSync(filePath);
	if (size > MAX_FILE_SIZE) {
		throw new Error(`File too large (${Math.round(size / 1024 / 1024)}MB > 50MB limit)`);
	}
	const buffer = readFileSync(filePath);

	switch (ext) {
		case ".pdf":
			return extractPdf(buffer, filePath);
		case ".docx":
			return extractDocx(buffer, filePath);
		case ".pptx":
			return extractPptx(buffer, filePath);
		case ".xlsx":
		case ".xls":
			return extractXlsx(buffer, filePath);
		case ".json":
			return extractJson(filePath);
		case ".csv":
			return extractCsv(filePath);
		case ".xml":
			return extractXml(filePath);
		case ".html":
		case ".htm":
			return extractHtml(filePath);
		case ".yaml":
		case ".yml":
			return extractYaml(filePath);
		case ".rtf":
			return extractRtf(filePath);
		default:
			return extractText(filePath);
	}
}

// pdfjs is loaded with `isEvalSupported: false` to close the font-code eval path
// (GHSA-hq66-cqwq-w95j). We swap unpdf's bundled pdfjs (which can be 5.6.205,
// inside the vulnerable range) for our pinned `pdfjs-dist/legacy` build —
// npm overrides don't reach into unpdf's bundled copy, so the only way out is
// to override at runtime. If the swap fails we fall through to the fallback
// path so callers never crash.
let pdfjsSwapped: Promise<boolean> | null = null;
function ensurePatchedPdfjs(unpdf: {
	definePDFJSModule?: (m: () => Promise<unknown>) => Promise<void>;
}): Promise<boolean> {
	pdfjsSwapped ??= (async () => {
		try {
			// pdfjs 6.x uses Promise.try (ES2025, Node 23+). We polyfill so
			// Node 20/22 users don't hang in a worker-message unhandled
			// rejection that vitest's 30s timeout never sees.
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const P = Promise as any;
			if (!P.try) {
				P.try = function (this: unknown, fn: (...args: unknown[]) => unknown, ...args: unknown[]): Promise<unknown> {
					return new Promise((resolve, reject) => {
						try {
							resolve(fn.apply(this, args));
						} catch (err) {
							reject(err);
						}
					});
				};
			}
			// legacy build: the main build needs Uint8Array.toHex (modern V8 only)
			// and crashes on Node with "hashOriginal.toHex is not a function".
			await unpdf.definePDFJSModule?.(() => import("pdfjs-dist/legacy/build/pdf.mjs"));
			return true;
		} catch {
			return false; // fallback runs with the bundled copy; isEvalSupported:false still mitigates
		}
	})();
	return pdfjsSwapped;
}

async function extractPdf(buffer: Buffer, filePath: string): Promise<ExtractedContent> {
	try {
		const unpdf = await import("unpdf");
		const { extractText, getDocumentProxy } = unpdf;
		await ensurePatchedPdfjs(unpdf);
		const doc = await getDocumentProxy(new Uint8Array(buffer), {
			isEvalSupported: false,
		} as Parameters<typeof getDocumentProxy>[1]);
		const result = await extractText(doc);
		const rawText = result.text;
		const text = Array.isArray(rawText) ? rawText.join("\n\n") : (rawText ?? "");
		return {
			text,
			metadata: {
				title: basename(filePath, ".pdf"),
				pageCount: result.totalPages,
				wordCount: countWords(text),
			},
			sourceFormat: "pdf",
		};
	} catch (err) {
		console.error(
			`PDF extraction failed: ${err instanceof Error ? err.message : "unknown"}`,
		);
		return fallback(filePath, "pdf");
	}
}

async function extractDocx(buffer: Buffer, filePath: string): Promise<ExtractedContent> {
	try {
		const mammoth = await import("mammoth");
		const result = await mammoth.default.extractRawText({ buffer });
		const text = result.value ?? "";
		return {
			text,
			metadata: {
				title: basename(filePath, ".docx"),
				wordCount: countWords(text),
			},
			sourceFormat: "docx",
		};
	} catch (err) {
		console.error(
			`DOCX extraction failed: ${err instanceof Error ? err.message : "unknown"}`,
		);
		return fallback(filePath, "docx");
	}
}

async function extractPptx(buffer: Buffer, filePath: string): Promise<ExtractedContent> {
	try {
		const officeparser = await import("officeparser");
		const text = String((await officeparser.default.parseOfficeAsync(buffer)) ?? "");
		return {
			text,
			metadata: {
				title: basename(filePath, ".pptx"),
				wordCount: countWords(text),
			},
			sourceFormat: "pptx",
		};
	} catch (err) {
		console.error(
			`PPTX extraction failed: ${err instanceof Error ? err.message : "unknown"}`,
		);
		return fallback(filePath, "pptx");
	}
}

async function extractXlsx(buffer: Buffer, filePath: string): Promise<ExtractedContent> {
	const ext = extname(filePath).toLowerCase();
	const format: "xls" | "xlsx" = ext === ".xls" ? "xls" : "xlsx";
	try {
		const XLSX = await import("xlsx");
		const workbook = XLSX.read(buffer);
		const parts: string[] = [];
		for (const name of workbook.SheetNames) {
			const sheet = workbook.Sheets[name];
			if (!sheet) continue;
			const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][];
			if (rows.length === 0) continue;

			parts.push(`## ${name}\n`);
			const headers = (rows[0] ?? []).map((h) => String(h ?? ""));
			parts.push(`| ${headers.join(" | ")} |`);
			parts.push(`| ${headers.map(() => "---").join(" | ")} |`);
			for (const row of rows.slice(1)) {
				const cells = headers.map((_, i) => String((row as unknown[])[i] ?? ""));
				parts.push(`| ${cells.join(" | ")} |`);
			}
			parts.push("");

			// JSON structure for AI search/numeric query (cap at 100 rows / 50 emitted)
			if (rows.length <= 100) {
				const jsonRows = XLSX.utils.sheet_to_json(sheet);
				if (jsonRows.length > 0) {
					parts.push(
						`<details><summary>Structured Data (${jsonRows.length} rows)</summary>\n`,
					);
					parts.push("```json");
					parts.push(JSON.stringify(jsonRows.slice(0, 50), null, 2));
					parts.push("```");
					parts.push("</details>\n");
				}
			}
		}
		const text = parts.join("\n");
		return {
			text,
			metadata: {
				title: basename(filePath, ext),
				wordCount: countWords(text),
			},
			sourceFormat: format,
		};
	} catch (err) {
		console.error(
			`XLSX extraction failed: ${err instanceof Error ? err.message : "unknown"}`,
		);
		return fallback(filePath, format);
	}
}

function extractText(filePath: string): ExtractedContent {
	const text = readFileSync(filePath, "utf-8");
	return {
		text,
		metadata: {
			title: basename(filePath),
			wordCount: countWords(text),
		},
		sourceFormat: "text",
	};
}

function extractJson(filePath: string): ExtractedContent {
	const raw = readFileSync(filePath, "utf-8");
	let text: string;
	try {
		const parsed: unknown = JSON.parse(raw);
		text = "```json\n" + JSON.stringify(parsed, null, 2).slice(0, 50_000) + "\n```";
	} catch {
		text = raw.slice(0, 50_000);
	}
	return {
		text,
		metadata: {
			title: basename(filePath, ".json"),
			wordCount: countWords(text),
		},
		sourceFormat: "text",
	};
}

function extractCsv(filePath: string): ExtractedContent {
	const raw = readFileSync(filePath, "utf-8");
	const lines = raw.split("\n").filter((l) => l.trim());
	const headers = (lines[0] ?? "").split(",").map((h) => h.trim());
	const mdLines = [`| ${headers.join(" | ")} |`, `| ${headers.map(() => "---").join(" | ")} |`];
	for (const line of lines.slice(1, 200)) {
		const cells = line.split(",").map((c) => c.trim());
		mdLines.push(`| ${cells.join(" | ")} |`);
	}
	const text = mdLines.join("\n");
	return {
		text,
		metadata: {
			title: basename(filePath, ".csv"),
			wordCount: countWords(text),
		},
		sourceFormat: "text",
	};
}

function extractXml(filePath: string): ExtractedContent {
	const raw = readFileSync(filePath, "utf-8");
	const text = raw
		.replace(/<[^>]+>/g, " ")
		.replace(/\s+/g, " ")
		.trim()
		.slice(0, 50_000);
	return {
		text,
		metadata: {
			title: basename(filePath, ".xml"),
			wordCount: countWords(text),
		},
		sourceFormat: "text",
	};
}

function extractHtml(filePath: string): ExtractedContent {
	const raw = readFileSync(filePath, "utf-8");
	const text = raw
		.replace(/<script[\s\S]*?<\/script>/gi, "")
		.replace(/<style[\s\S]*?<\/style>/gi, "")
		.replace(/<[^>]+>/g, " ")
		.replace(/&nbsp;/g, " ")
		.replace(/\s+/g, " ")
		.trim()
		.slice(0, 50_000);
	return {
		text,
		metadata: {
			title: basename(filePath, extname(filePath)),
			wordCount: countWords(text),
		},
		sourceFormat: "text",
	};
}

function extractYaml(filePath: string): ExtractedContent {
	const raw = readFileSync(filePath, "utf-8");
	const text = "```yaml\n" + raw.slice(0, 50_000) + "\n```";
	return {
		text,
		metadata: {
			title: basename(filePath, extname(filePath)),
			wordCount: countWords(raw),
		},
		sourceFormat: "text",
	};
}

function extractRtf(filePath: string): ExtractedContent {
	const raw = readFileSync(filePath, "utf-8");
	const text = raw
		.replace(/\{\\[^}]*\}/g, "")
		.replace(/\\[a-z]+\d*\s?/gi, "")
		.replace(/[{}]/g, "")
		.trim()
		.slice(0, 50_000);
	return {
		text,
		metadata: {
			title: basename(filePath, ".rtf"),
			wordCount: countWords(text),
		},
		sourceFormat: "text",
	};
}

function fallback(filePath: string, format: SourceFormat): ExtractedContent {
	return {
		text: `[Failed to extract text from ${basename(filePath)}. Install required parser or convert to a text format.]`,
		metadata: { title: basename(filePath), wordCount: 0 },
		sourceFormat: format,
	};
}

function countWords(text: string): number {
	return text.split(/\s+/).filter(Boolean).length;
}
