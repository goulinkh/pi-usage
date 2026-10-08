/** Shared I/O boundaries for provider adapters; failures never include tokens or response bodies. */
import { asObject } from "../domain";
import { MissingAuthError } from "../errors";
import { AUTH_FILE, readJsonObject } from "../preferences";
import type { JsonObject, UsageProvider } from "../types";

/** Read a provider's OAuth entry without refreshing or modifying credentials.
 * @note Reads pi's authentication file.
 */
export async function loadOAuthCredentials(provider: UsageProvider): Promise<JsonObject> {
	const entry = asObject((await readJsonObject(AUTH_FILE))[provider]);
	if (entry?.type !== "oauth") throw new MissingAuthError(provider);
	return entry;
}

/** Request an account's usage with a bounded timeout and sanitized HTTP errors.
 * @note Sends an authenticated GET request to the provider's usage endpoint.
 */
export async function requestUsage(url: string, label: string, headers: Record<string, string>): Promise<JsonObject> {
	const response = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) });
	if (!response.ok) throw new Error(`${label} usage request failed (${response.status})`);
	return asObject(await response.json()) ?? {};
}
