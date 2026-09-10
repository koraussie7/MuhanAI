// Security-path test for the PDF extractor.
//
// This file lives separately from extractors.test.ts because `vi.mock` is
// hoisted to the top of the file and would short-circuit the no-parser
// fallback tests in the main file (which rely on the real dynamic import
// actually rejecting because unpdf is not installed).
//
// What we prove here:
//  1. The unpdf dynamic import is invoked.
//  2. getDocumentProxy is called with `isEvalSupported: false` (mitigates
//     GHSA-hq66-cqwq-w95j, the PDF → arbitrary JS execution vector).
//  3. The result shape (text, pageCount, sourceFormat) is plumbed through.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

vi.mock("unpdf", () => {
	const getDocumentProxy = vi.fn(async () => ({}));
	const extractText = vi.fn(async () => ({ text: "extracted text", totalPages: 3 }));
	const definePDFJSModule = vi.fn(async () => undefined);
	return {
		extractText,
		getDocumentProxy,
		definePDFJSModule,
	};
});

let workDir: string;
let cleanup: () => void;

beforeEach(() => {
	// Reset module cache so the module-level pdfjsSwapped cache is fresh for
	// every test — and so the mock call records start empty.
	vi.resetModules();
	workDir = mkdtempSync(join(tmpdir(), "extractor-pdf-test-"));
	cleanup = () => {
		if (workDir) rmSync(workDir, { recursive: true, force: true });
	};
	vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

describe("extractFileContent — PDF security (mocked)", () => {
	it("calls getDocumentProxy with isEvalSupported: false", async () => {
		const { extractFileContent } = await import("./extractors.js");
		const p = join(workDir, "secure.pdf");
		writeFileSync(p, "%PDF-1.4\n%fake");
		const unpdf = await import("unpdf");
		await extractFileContent(p);
		expect(unpdf.getDocumentProxy).toHaveBeenCalledTimes(1);
		const calls = (unpdf.getDocumentProxy as unknown as { mock: { calls: unknown[][] } }).mock
			.calls;
		const opts = calls[0]![1] as { isEvalSupported?: boolean };
		expect(opts.isEvalSupported).toBe(false);
	});

	it("returns totalPages and the extracted text", async () => {
		const { extractFileContent } = await import("./extractors.js");
		const p = join(workDir, "pageful.pdf");
		writeFileSync(p, "%PDF-1.4\n%fake");
		const out = await extractFileContent(p);
		expect(out.text).toBe("extracted text");
		expect(out.sourceFormat).toBe("pdf");
		expect(out.metadata.pageCount).toBe(3);
	});
});
