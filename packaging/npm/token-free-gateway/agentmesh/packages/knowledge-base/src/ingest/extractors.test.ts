import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { extractFileContent, isBinaryFormat } from "./extractors.js";

let workDir: string;

beforeAll(() => {
	workDir = mkdtempSync(join(tmpdir(), "extractor-test-"));
});

afterAll(() => {
	if (workDir) rmSync(workDir, { recursive: true, force: true });
});

function writeFixture(name: string, content: string | Buffer): string {
	const p = join(workDir, name);
	writeFileSync(p, content);
	return p;
}

describe("isBinaryFormat", () => {
	it("returns true for binary extensions", () => {
		expect(isBinaryFormat("/tmp/a.pdf")).toBe(true);
		expect(isBinaryFormat("/tmp/a.docx")).toBe(true);
		expect(isBinaryFormat("/tmp/a.PPTX")).toBe(true); // case-insensitive
		expect(isBinaryFormat("/tmp/a.xlsx")).toBe(true);
		expect(isBinaryFormat("/tmp/a.xls")).toBe(true);
	});

	it("returns false for text extensions", () => {
		expect(isBinaryFormat("/tmp/a.txt")).toBe(false);
		expect(isBinaryFormat("/tmp/a.md")).toBe(false);
		expect(isBinaryFormat("/tmp/a.json")).toBe(false);
		expect(isBinaryFormat("/tmp/a.csv")).toBe(false);
		expect(isBinaryFormat("/tmp/a")).toBe(false);
	});
});

describe("extractFileContent — text formats", () => {
	it("extracts .txt as text", async () => {
		const p = writeFixture("plain.txt", "hello world\nline two");
		const out = await extractFileContent(p);
		expect(out.text).toBe("hello world\nline two");
		expect(out.sourceFormat).toBe("text");
		expect(out.metadata.wordCount).toBe(4);
		expect(out.metadata.title).toBe("plain.txt");
	});

	it("falls back to text for unknown extensions", async () => {
		const p = writeFixture("notes.md", "a note");
		const out = await extractFileContent(p);
		expect(out.text).toBe("a note");
		expect(out.sourceFormat).toBe("text");
	});
});

describe("extractFileContent — json", () => {
	it("pretty-prints valid JSON inside a code fence", async () => {
		const p = writeFixture("data.json", '{"a":1,"b":[2,3]}');
		const out = await extractFileContent(p);
		expect(out.text.startsWith("```json")).toBe(true);
		expect(out.text).toContain('"a": 1');
		expect(out.text).toContain('"b": [');
		expect(out.text.trim().endsWith("```")).toBe(true);
		expect(out.sourceFormat).toBe("text");
		expect(out.metadata.title).toBe("data");
	});

	it("falls back to raw text on invalid JSON", async () => {
		const p = writeFixture("bad.json", "{not json");
		const out = await extractFileContent(p);
		// No code fence when JSON parse failed
		expect(out.text).toBe("{not json");
		expect(out.text.startsWith("```")).toBe(false);
	});

	it("caps output at 50_000 characters", async () => {
		const big = { rows: "x".repeat(60_000) };
		const p = writeFixture("big.json", JSON.stringify(big));
		const out = await extractFileContent(p);
		// Total length includes the fence wrapper, but the body is sliced to 50_000
		expect(out.text.length).toBeLessThan(60_000);
	});
});

describe("extractFileContent — csv", () => {
	it("renders CSV as a markdown table with header row", async () => {
		const csv = "name,age\nalice,30\nbob,25\n";
		const p = writeFixture("people.csv", csv);
		const out = await extractFileContent(p);
		expect(out.text).toContain("| name | age |");
		expect(out.text).toContain("| --- | --- |");
		expect(out.text).toContain("| alice | 30 |");
		expect(out.text).toContain("| bob | 25 |");
		expect(out.sourceFormat).toBe("text");
	});

	it("caps emitted body rows at 200", async () => {
		const header = "a,b\n";
		const rows = Array.from({ length: 500 }, (_, i) => `r${i},v${i}`).join("\n");
		const p = writeFixture("many.csv", header + rows);
		const out = await extractFileContent(p);
		// 1 header + 200 body rows = 201 data lines + 1 separator
		const dataLines = out.text.split("\n").filter((l) => l.startsWith("| r"));
		expect(dataLines.length).toBe(200);
	});

	it("handles a CSV with only a header (no body rows)", async () => {
		const p = writeFixture("hdr.csv", "a,b\n");
		const out = await extractFileContent(p);
		expect(out.text).toContain("| a | b |");
		expect(out.text).toContain("| --- | --- |");
	});
});

describe("extractFileContent — xml", () => {
	it("strips tags and collapses whitespace", async () => {
		const xml = "<note><to>T</to><from>F</from><body>hi</body></note>";
		const p = writeFixture("doc.xml", xml);
		const out = await extractFileContent(p);
		expect(out.text).toBe("note to T from F body hi");
		expect(out.sourceFormat).toBe("text");
	});
});

describe("extractFileContent — html", () => {
	it("strips <script> and <style> bodies before tag-stripping", async () => {
		const html = `
			<html><head><style>body{color:red}</style></head>
			<body><script>alert(1)</script>
			<h1>Title</h1><p>Hello &nbsp; world</p></body></html>
		`;
		const p = writeFixture("page.html", html);
		const out = await extractFileContent(p);
		expect(out.text).not.toContain("alert(1)");
		expect(out.text).not.toContain("color:red");
		expect(out.text).toContain("Title");
		expect(out.text).toContain("Hello");
		expect(out.text).toContain("world");
		expect(out.text).not.toContain("&nbsp;");
	});

	it("handles .htm the same as .html", async () => {
		const p = writeFixture("page.htm", "<h1>Hi</h1>");
		const out = await extractFileContent(p);
		expect(out.text).toBe("Hi");
	});
});

describe("extractFileContent — yaml", () => {
	it("wraps the raw text in a yaml code fence", async () => {
		const p = writeFixture("config.yaml", "key: value\nlist:\n  - a\n  - b");
		const out = await extractFileContent(p);
		expect(out.text.startsWith("```yaml")).toBe(true);
		expect(out.text).toContain("key: value");
		expect(out.text.trim().endsWith("```")).toBe(true);
		expect(out.metadata.wordCount).toBe(6); // counts raw, not fence-wrapped
	});

	it("handles .yml the same as .yaml", async () => {
		const p = writeFixture("config.yml", "k: v");
		const out = await extractFileContent(p);
		expect(out.text).toContain("```yaml");
	});
});

describe("extractFileContent — rtf", () => {
	it("strips control words, groups, and braces", async () => {
		const rtf = "{\\rtf1\\ansi\\fs24 Hello \\b world\\b0.}";
		const p = writeFixture("doc.rtf", rtf);
		const out = await extractFileContent(p);
		expect(out.text).toContain("Hello");
		expect(out.text).toContain("world");
		expect(out.text).not.toContain("\\rtf1");
		expect(out.text).not.toContain("\\b");
		expect(out.text).not.toContain("{");
		expect(out.text).not.toContain("}");
	});
});

describe("extractFileContent — size cap", () => {
	it("throws when the file is larger than 50MB", async () => {
		// Use a sparse stat-read mock to avoid actually writing 50MB to disk.
		const p = writeFixture("huge.bin", "x");
		const statSync = await import("node:fs").then((m) => m.statSync);
		const spy = vi.spyOn(await import("node:fs"), "statSync").mockImplementation(((fp: string) => {
			if (fp === p) return { size: 51 * 1024 * 1024 } as ReturnType<typeof statSync>;
			return statSync(fp);
		}) as typeof statSync);
		try {
			await expect(extractFileContent(p)).rejects.toThrow(/File too large/);
		} finally {
			spy.mockRestore();
		}
	});
});

describe("extractFileContent — binary fallback (no parser installed)", () => {
	// unpdf / mammoth / officeparser / xlsx are not declared in package.json
	// dependencies, so the dynamic import in this environment rejects and the
	// extractor must degrade to a placeholder rather than throwing.
	beforeEach(() => {
		// Silence the error logs that the fallback path emits
		vi.spyOn(console, "error").mockImplementation(() => {});
	});
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("returns a placeholder for .pdf when unpdf is missing", async () => {
		const p = writeFixture("doc.pdf", "%PDF-1.4\n%fake");
		const out = await extractFileContent(p);
		expect(out.text).toMatch(/Failed to extract text from doc\.pdf/);
		expect(out.sourceFormat).toBe("pdf");
		expect(out.metadata.wordCount).toBe(0);
	});

	it("returns a placeholder for .docx when mammoth is missing", async () => {
		const p = writeFixture("doc.docx", "PKfake");
		const out = await extractFileContent(p);
		expect(out.text).toMatch(/Failed to extract text from doc\.docx/);
		expect(out.sourceFormat).toBe("docx");
	});

	it("returns a placeholder for .pptx when officeparser is missing", async () => {
		const p = writeFixture("deck.pptx", "PKfake");
		const out = await extractFileContent(p);
		expect(out.text).toMatch(/Failed to extract text from deck\.pptx/);
		expect(out.sourceFormat).toBe("pptx");
	});

	it("returns a placeholder for .xlsx when xlsx is missing", async () => {
		const p = writeFixture("sheet.xlsx", "PKfake");
		const out = await extractFileContent(p);
		expect(out.text).toMatch(/Failed to extract text from sheet\.xlsx/);
		expect(out.sourceFormat).toBe("xlsx");
	});

	it("preserves .xls → xls format in the fallback", async () => {
		const p = writeFixture("legacy.xls", "D0CF11E0");
		const out = await extractFileContent(p);
		expect(out.sourceFormat).toBe("xls");
		expect(out.text).toMatch(/Failed to extract text from legacy\.xls/);
	});
});

// The PDF security path (isEvalSupported: false) is covered in
// extractors.pdf-security.test.ts, which mocks unpdf so we can inspect the
// args passed to getDocumentProxy.
