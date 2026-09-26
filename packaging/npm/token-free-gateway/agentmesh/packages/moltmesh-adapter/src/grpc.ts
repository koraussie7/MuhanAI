/**
 * MoltMesh gRPC transport helpers.
 *
 * The daemon speaks gRPC over a local socket (`unix://$HOME/.moltmesh/a2a.sock`
 * by default) or TCP (`127.0.0.1:15701`). This module is **Node-only**: it uses
 * `@grpc/grpc-js`, which needs raw HTTP/2 sockets and therefore cannot run in
 * Cloudflare Workers. See `docs/MOLTMESH_INTEGRATION.md` §제약.
 */

import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";

const HERE = dirname(fileURLToPath(import.meta.url));

/** `agentmesh/proto/a2a.proto`, relative to `packages/moltmesh-adapter/src`. */
const DEFAULT_PROTO_PATH = resolve(HERE, "../../../proto/a2a.proto");

/** A dynamically loaded stub: gRPC methods are accessed by name. */
export type GrpcStub = grpc.Client & Record<string, (...args: unknown[]) => unknown>;

let cachedDescriptor: grpc.GrpcObject | null = null;

/** Resolve the vendored proto path (explicit > env > vendored default). */
export function resolveProtoPath(explicit?: string): string {
	if (explicit !== undefined && explicit.length > 0) return explicit;
	const fromEnv = process.env["MOLTMESH_PROTO_PATH"];
	if (fromEnv !== undefined && fromEnv.length > 0) return fromEnv;
	return DEFAULT_PROTO_PATH;
}

/** Load `a2a.v1` from the proto file (cached for the process lifetime). */
export function loadProto(protoPath?: string): grpc.GrpcObject {
	if (cachedDescriptor !== null) return cachedDescriptor;
	const packageDefinition = protoLoader.loadSync(resolveProtoPath(protoPath), {
		keepCase: false,
		longs: String,
		enums: String,
		defaults: true,
		oneofs: true,
	});
	cachedDescriptor = grpc.loadPackageDefinition(packageDefinition);
	return cachedDescriptor;
}

/**
 * Default daemon address.
 *
 * `MOLTMESH_GRPC_ADDR` is the project-specific name; `A2A_GRPC_ADDR` is the
 * upstream SDK name and is honoured so existing setups keep working.
 */
export function defaultAddress(): string {
	const fromEnv = process.env["MOLTMESH_GRPC_ADDR"] ?? process.env["A2A_GRPC_ADDR"];
	if (fromEnv !== undefined && fromEnv.length > 0) return fromEnv;
	return `unix://${homedir()}/.moltmesh/a2a.sock`;
}

function a2aNodeConstructor(descriptor: grpc.GrpcObject): grpc.ServiceClientConstructor {
	const a2a = descriptor["a2a"];
	const v1 = (a2a as Record<string, unknown> | undefined)?.["v1"];
	const node = (v1 as Record<string, unknown> | undefined)?.["A2ANode"];
	if (node === undefined) {
		throw new Error("a2a.v1.A2ANode not found in the loaded proto — proto file mismatch");
	}
	return node as grpc.ServiceClientConstructor;
}

/** Create a stub against the daemon. Local socket/TCP ⇒ insecure credentials. */
export function createStub(address: string, protoPath?: string): GrpcStub {
	const ctor = a2aNodeConstructor(loadProto(protoPath));
	const credentials = grpc.credentials.createInsecure();
	return new ctor(address, credentials) as unknown as GrpcStub;
}

function methodOf(stub: GrpcStub, method: string): (...args: unknown[]) => unknown {
	const fn = stub[method];
	if (typeof fn !== "function") {
		throw new Error(`MoltMesh daemon does not expose "${method}" — daemon/proto version mismatch`);
	}
	return fn as (...args: unknown[]) => unknown;
}

/** Invoke a unary RPC, returning a promise. */
export function unary<Res>(
	stub: GrpcStub,
	method: string,
	request: unknown,
	timeoutMs?: number,
): Promise<Res> {
	const fn = methodOf(stub, method);
	return new Promise<Res>((resolvePromise, rejectPromise) => {
		const callback = (err: unknown, response: Res): void => {
			if (err !== null && err !== undefined) {
				rejectPromise(err instanceof Error ? err : new Error(String(err)));
			} else {
				resolvePromise(response);
			}
		};
		if (timeoutMs === undefined) {
			fn.call(stub, request, callback);
			return;
		}
		const options: grpc.CallOptions = { deadline: Date.now() + timeoutMs };
		(
			fn as unknown as (
				req: unknown,
				metadata: grpc.Metadata,
				callOptions: grpc.CallOptions,
				cb: unknown,
			) => unknown
		).call(stub, request, new grpc.Metadata(), options, callback);
	});
}

/** Invoke a server-streaming RPC as an async iterable. */
export async function* serverStream<Res>(
	stub: GrpcStub,
	method: string,
	request: unknown,
): AsyncGenerator<Res, void, void> {
	const fn = methodOf(stub, method);
	const stream = (fn as unknown as (req: unknown) => AsyncIterable<Res>).call(stub, request);
	for await (const message of stream) {
		yield message;
	}
}

/** Drain a server-streaming RPC into an array (bounded by the daemon's limit). */
export async function collectStream<Res>(
	stub: GrpcStub,
	method: string,
	request: unknown,
): Promise<Res[]> {
	const out: Res[] = [];
	for await (const message of serverStream<Res>(stub, method, request)) {
		out.push(message);
	}
	return out;
}
