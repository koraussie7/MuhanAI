/**
 * Typed transport errors (Result-friendly).
 *
 * Pattern source: folklore/peer-transport.ts uses `neverthrow` ResultAsync
 * for all I/O. We mirror the shape so callers compose with `.mapErr` /
 * `.andThen` without throwing.
 */

import type { Result } from "neverthrow";

export enum TransportErrorKind {
	InitFailed = "init_failed",
	IdentityLoadFailed = "identity_load_failed",
	ListenFailed = "listen_failed",
	DiscoveryFailed = "discovery_failed",
	AlreadyStopped = "already_stopped",
}

export interface TransportError {
	kind: TransportErrorKind;
	message: string;
	cause?: unknown;
}

export function makeErr(
	kind: TransportErrorKind,
	message: string,
	cause?: unknown,
): TransportError {
	return { kind, message, cause };
}

export type TransportResult<T> = Result<T, TransportError>;
