/**
 * Client Deployment API Routes
 *
 * Provides manifest, download, and update-check endpoints for the MuhanAI desktop client.
 * Compatible with Electron autoUpdater protocol.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { clientError, formatZodError } from "./error-shapes.js";

// ===== Types =====

const ManifestSchema = z.object({
	version: z.string().regex(/^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?$/),
	platform: z.enum(["darwin-x64", "darwin-arm64", "linux-x64", "linux-arm64", "win32-x64"]),
	checksum: z.string().length(64), // SHA256 hex
	size: z.number().int().positive(),
	releaseNotes: z.string().optional(),
	minApiVersion: z.string().regex(/^\d+\.\d+\.\d+$/).optional(),
	signed: z.boolean(),
	signature: z.string().optional(), // base64 Ed25519 signature (optional until sig infra ready)
});

type Manifest = z.infer<typeof ManifestSchema>;

// In-memory store (replace with R2 JSON or DB later)
const manifestStore = new Map<string, Manifest>();

const PlatformParamSchema = z.enum(["darwin-x64", "darwin-arm64", "linux-x64", "linux-arm64", "win32-x64"]);

// Version comparison (semver-ish)
function compareVersions(a: string, b: string): number {
	const pa = a.split(/[.-]/).map((x) => parseInt(x, 10) || 0);
	const pb = b.split(/[.-]/).map((x) => parseInt(x, 10) || 0);
	const len = Math.max(pa.length, pb.length);
	for (let i = 0; i < len; i++) {
		const aNum = pa[i] ?? 0;
		const bNum = pb[i] ?? 0;
		if (aNum !== bNum) return aNum - bNum;
	}
	return 0;
}

// Admin auth helper
function checkAdminAuth(request: FastifyRequest, reply: FastifyReply): string | null {
	const validApiKey = process.env.API_KEY;
	const rawApiKey = request.headers["x-api-key"];
	const apiKey = Array.isArray(rawApiKey) ? rawApiKey[0] : rawApiKey;

	if (!apiKey || apiKey !== validApiKey) {
		return "Unauthorized: admin API key required";
	}
	return null;
}

// ===== Routes =====

export async function clientRoutes(app: FastifyInstance) {
	// ===== GET /api/client/manifest?platform= =====
	app.get("/api/client/manifest", async (request, reply) => {
		const parse = z.object({ platform: z.enum(["darwin-x64", "darwin-arm64", "linux-x64", "linux-arm64", "win32-x64"]) }).safeParse(request.query);
		if (!parse.success) {
			return clientError(reply, 400, formatZodError(parse.error), request.id);
		}
		const { platform } = parse.data;
		const manifest = manifestStore.get(platform);

		if (!manifest) {
			return clientError(reply, 404, "Manifest not found for platform", request.id);
		}

		return reply.send(manifest);
	});

	// ===== GET /api/client/download/:platform =====
	app.get("/api/client/download/:platform", async (request, reply) => {
		const parse = z.object({ platform: z.enum(["darwin-x64", "darwin-arm64", "linux-x64", "linux-arm64", "win32-x64"]) }).safeParse(request.params);
		if (!parse.success) {
			return clientError(reply, 400, formatZodError(parse.error), request.id);
		}
		const { platform } = parse.data;
		const manifest = manifestStore.get(platform);

		if (!manifest) {
			return clientError(reply, 404, "Manifest not found for platform", request.id);
		}

		// Redirect to CDN/R2 (signed URL preferred in production)
		const cdnBase = process.env.CLIENT_CDN_BASE ?? "https://cdn.muhanai.com";
		const downloadUrl = `${cdnBase}/client/${manifest.version}/${platform}/muhanai-client-${manifest.version}-${platform}`;

		return reply.redirect(downloadUrl, 302);
	});

	// ===== GET /api/client/update-check =====
	// Electron autoUpdater compatible endpoint
	app.get("/api/client/update-check", async (request, reply) => {
		const parse = z
			.object({
				currentVersion: z.string().regex(/^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?$/),
				platform: z.enum(["darwin-x64", "darwin-arm64", "linux-x64", "linux-arm64", "win32-x64"]),
			})
			.safeParse(request.query);
		if (!parse.success) {
			return clientError(reply, 400, formatZodError(parse.error), request.id);
		}
		const { currentVersion, platform } = parse.data;
		const manifest = manifestStore.get(platform);

		if (!manifest) {
			return clientError(reply, 404, "No manifest for platform", request.id);
		}

		const hasUpdate = compareVersions(manifest.version, currentVersion) > 0;

		if (!hasUpdate) {
			return reply.send({ hasUpdate: false });
		}

		const cdnBase = process.env.CLIENT_CDN_BASE ?? "https://cdn.muhanai.com";
		const downloadUrl = `${cdnBase}/client/${manifest.version}/${platform}/muhanai-client-${manifest.version}-${platform}`;

		return reply.send({
			hasUpdate: true,
			version: manifest.version,
			releaseNotes: manifest.releaseNotes ?? "",
			downloadUrl,
			sha256: manifest.checksum,
			size: manifest.size,
			critical: false,
			signed: manifest.signed,
			signature: manifest.signature,
			minApiVersion: manifest.minApiVersion,
		});
	});

	// ===== POST /api/client/manifest (admin only) =====
	app.post("/api/client/manifest", async (request, reply) => {
		const authError = checkAdminAuth(request, reply);
		if (authError) return reply.code(401).send({ error: authError });

		const parse = ManifestSchema.safeParse(request.body);
		if (!parse.success) {
			return clientError(reply, 400, formatZodError(parse.error), request.id);
		}

		const manifest = parse.data;
		manifestStore.set(manifest.platform, manifest);

		return reply.send({ ok: true, platform: manifest.platform, version: manifest.version });
	});

	// ===== GET /api/client/manifests (list all, admin) =====
	app.get("/api/client/manifests", async (request, reply) => {
		const authError = checkAdminAuth(request, reply);
		if (authError) return reply.code(401).send({ error: authError });

		const manifests = Array.from(manifestStore.values());
		return reply.send({ manifests });
	});

	// ===== DELETE /api/client/manifest/:platform (admin) =====
	app.delete("/api/client/manifest/:platform", async (request, reply) => {
		const authError = checkAdminAuth(request, reply);
		if (authError) return reply.code(401).send({ error: authError });

		const parse = z.object({ platform: z.enum(["darwin-x64", "darwin-arm64", "linux-x64", "linux-arm64", "win32-x64"]) }).safeParse(request.params);
		if (!parse.success) {
			return clientError(reply, 400, formatZodError(parse.error), request.id);
		}
		const { platform } = parse.data;
		const deleted = manifestStore.delete(platform);

		if (!deleted) {
			return clientError(reply, 404, "Manifest not found", request.id);
		}

		return reply.send({ ok: true });
	});
}