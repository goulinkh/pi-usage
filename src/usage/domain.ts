/** Defensive helpers for untyped JSON input and user-facing failure messages. */
import type { JsonObject } from "./types";

/** Accept non-array objects from untyped JSON values. */
export function asObject(value: unknown): JsonObject | undefined {
	return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : undefined;
}

/** Extract a readable message from either an Error or a thrown primitive. */
export function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
