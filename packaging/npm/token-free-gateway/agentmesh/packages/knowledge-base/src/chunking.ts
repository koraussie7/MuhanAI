export interface TextChunk {
	id: string;
	content: string;
	index: number;
	startOffset: number;
	endOffset: number;
	metadata?: Record<string, unknown>;
}

export interface ChunkOptions {
	chunkSize?: number;
	overlap?: number;
}

/**
 * Simple character-based chunker with overlap.
 * Production: use semantic / recursive / token-aware chunking.
 */
export function chunkText(text: string, options: ChunkOptions = {}): TextChunk[] {
	const chunkSize = options.chunkSize ?? 800;
	const overlap = options.overlap ?? 100;

	if (text.length <= chunkSize) {
		return [
			{
				id: `chunk_0`,
				content: text,
				index: 0,
				startOffset: 0,
				endOffset: text.length,
			},
		];
	}

	const chunks: TextChunk[] = [];
	let start = 0;
	let index = 0;

	while (start < text.length) {
		const end = Math.min(start + chunkSize, text.length);
		const content = text.slice(start, end);

		chunks.push({
			id: `chunk_${index}`,
			content,
			index,
			startOffset: start,
			endOffset: end,
		});

		if (end === text.length) break;
		start = end - overlap;
		index += 1;
	}

	return chunks;
}
