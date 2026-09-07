/**
 * AgentRun persistence (Prisma).
 * No-ops gracefully when DB is unavailable / memory mode.
 */

import type { PrismaClient } from "@prisma/client";
import type { AgentRunResult } from "../../shared/types";
import type { AgentDefinition } from "./types";

export interface PersistAgentRunInput {
	agent: AgentDefinition;
	userId?: string;
	question: string;
	result: AgentRunResult;
}

export interface AgentRunRecord {
	id: string;
	agentId: string;
	userId: string | null;
	question: string;
	output: string | null;
	confidence: number | null;
	latencyMs: number | null;
	createdAt: Date;
}

function usePrisma(): boolean {
	return (
		(process.env.PERSONAL_MCP_STORE ?? "memory").toLowerCase() === "prisma" &&
		Boolean(process.env.DATABASE_URL)
	);
}

async function getDb(): Promise<PrismaClient> {
	const { prisma } = await import("../../db/src/client");
	return prisma;
}

/** Ensure Agent row exists (FK for AgentRun). */
export async function ensureAgentRow(agent: AgentDefinition): Promise<void> {
	if (!usePrisma()) return;
	const db = await getDb();
	await db.agent.upsert({
		where: { id: agent.id },
		create: {
			id: agent.id,
			name: agent.name,
			domain: agent.domain,
			subdomain: agent.subdomain,
			jurisdictions: agent.jurisdictions ?? [],
			description: agent.description,
			systemPrompt: agent.systemPrompt,
		},
		update: {
			name: agent.name,
			domain: agent.domain,
			subdomain: agent.subdomain,
			jurisdictions: agent.jurisdictions ?? [],
			description: agent.description,
			systemPrompt: agent.systemPrompt,
		},
	});
}

export async function persistAgentRun(input: PersistAgentRunInput): Promise<AgentRunRecord | null> {
	if (!usePrisma()) return null;

	try {
		const db = await getDb();
		await ensureAgentRow(input.agent);

		// Ensure user exists if provided (soft — skip FK failure)
		if (input.userId) {
			const exists = await db.user.findUnique({
				where: { id: input.userId },
				select: { id: true },
			});
			if (!exists) {
				// Don't create users here; store run without user link
				input = { ...input, userId: undefined };
			}
		}

		const row = await db.agentRun.create({
			data: {
				agentId: input.agent.id,
				userId: input.userId,
				question: input.question,
				output: input.result.output,
				confidence: input.result.confidence,
				latencyMs: input.result.latencyMs,
			},
		});

		return {
			id: row.id,
			agentId: row.agentId,
			userId: row.userId,
			question: row.question,
			output: row.output,
			confidence: row.confidence,
			latencyMs: row.latencyMs,
			createdAt: row.createdAt,
		};
	} catch (err) {
		console.warn("[persistAgentRun] failed:", err);
		return null;
	}
}

export async function persistAgentRuns(items: PersistAgentRunInput[]): Promise<AgentRunRecord[]> {
	const out: AgentRunRecord[] = [];
	for (const item of items) {
		const row = await persistAgentRun(item);
		if (row) out.push(row);
	}
	return out;
}

export async function listAgentRuns(params: {
	userId?: string;
	agentId?: string;
	limit?: number;
}): Promise<AgentRunRecord[]> {
	if (!usePrisma()) return [];
	try {
		const db = await getDb();
		const rows = await db.agentRun.findMany({
			where: {
				...(params.userId ? { userId: params.userId } : {}),
				...(params.agentId ? { agentId: params.agentId } : {}),
			},
			orderBy: { createdAt: "desc" },
			take: params.limit ?? 20,
		});
		return rows.map((row) => ({
			id: row.id,
			agentId: row.agentId,
			userId: row.userId,
			question: row.question,
			output: row.output,
			confidence: row.confidence,
			latencyMs: row.latencyMs,
			createdAt: row.createdAt,
		}));
	} catch {
		return [];
	}
}
