/** Shared I/O boundaries for provider adapters; failures never include tokens or response bodies. */
import { DEFAULT_USAGE_MAX_AGE_MS } from "../constants";
import { asObject, errorMessage } from "../domain";
import { MissingAuthError } from "../errors";
import { AUTH_FILE, readJsonObject } from "../preferences";
import type { JsonObject, UsageCacheEntry, UsageProvider, UsageResponse } from "../types";
import { acquireCacheLock, getCacheFile, readCacheEntry, writeCacheEntry } from "./usageCache";

/** How long a session waits for another session's refresh before checking the cache again. */
const LOCK_POLL_MS = 200;
/** Back-off shared by all sessions after a non-rate-limit failure. */
const FAILURE_BACKOFF_MS = 30_000;
/** Older data is too stale to stand in for a failed or rate-limited refresh. */
const MAX_STALE_MS = 30 * 60_000;
const MAX_RETRY_AFTER_MS = 60 * 60_000;

/** Read a provider's OAuth entry without refreshing or modifying credentials.
 * @note Reads pi's authentication file.
 */
export async function loadOAuthCredentials(provider: UsageProvider): Promise<JsonObject> {
	const entry = asObject((await readJsonObject(AUTH_FILE))[provider]);
	if (entry?.type !== "oauth") throw new MissingAuthError(provider);
	return entry;
}

function getStaleResponse(entry: UsageCacheEntry): UsageResponse | undefined {
	const { data, fetchedAt } = entry;
	return data && fetchedAt !== undefined && Date.now() - fetchedAt < MAX_STALE_MS ? { data, fetchedAt } : undefined;
}

/** Parse Retry-After as seconds or an HTTP date, bounded so a bad header cannot stop refreshes for long. */
function getRetryAfterMs(header: string | null, fallbackMs: number): number {
	const seconds = header === null || header.trim() === "" ? NaN : Number(header);
	const retryAfterMs = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(header ?? "") - Date.now();
	return Number.isFinite(retryAfterMs) ? Math.min(MAX_RETRY_AFTER_MS, Math.max(fallbackMs, retryAfterMs)) : fallbackMs;
}

type FetchResult = { data: JsonObject } | { error: unknown; backoffMs: number };

async function fetchUsage(url: string, label: string, headers: Record<string, string>, maxAgeMs: number): Promise<FetchResult> {
	const response = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) });
	if (!response.ok) {
		const backoffMs = response.status === 429 ? getRetryAfterMs(response.headers.get("retry-after"), maxAgeMs) : FAILURE_BACKOFF_MS;
		return { error: new Error(`${label} usage request failed (${response.status})`), backoffMs };
	}
	return { data: asObject(await response.json()) ?? {} };
}

/** Request usage while holding the refresh lock, recording failures so other sessions back off too. */
async function refreshUsage(file: string, entry: UsageCacheEntry, request: Parameters<typeof fetchUsage>): Promise<UsageResponse> {
	const fetchedAt = Date.now();
	let result: FetchResult;
	try {
		result = await fetchUsage(...request);
	} catch (error) {
		result = { error, backoffMs: FAILURE_BACKOFF_MS };
	}
	if ("data" in result) {
		await writeCacheEntry(file, { fetchedAt, data: result.data });
		return { data: result.data, fetchedAt };
	}
	await writeCacheEntry(file, { ...entry, retryAt: Date.now() + result.backoffMs, error: errorMessage(result.error) });
	const stale = getStaleResponse(entry);
	if (stale) return stale;
	throw result.error;
}

/** Return an account's usage from the cache shared by pi sessions, requesting it at most once per freshness window.
 * Only one session refreshes a stale entry; others reuse recent data or wait, taking over a lock held for over 20 seconds. Rate limits honor
 * Retry-After, and recent data stands in for failed refreshes until it is 30 minutes old.
 * @note Reads and writes the shared usage cache and may send an authenticated GET request.
 */
export async function requestUsage(
	url: string, label: string, headers: Record<string, string>, maxAgeMs = DEFAULT_USAGE_MAX_AGE_MS,
): Promise<UsageResponse> {
	const file = getCacheFile(url, label, headers);
	for (;;) {
		const entry = await readCacheEntry(file);
		const now = Date.now();
		if (entry.data && entry.fetchedAt !== undefined && now - entry.fetchedAt < maxAgeMs) return { data: entry.data, fetchedAt: entry.fetchedAt };
		if (entry.retryAt !== undefined && entry.retryAt > now) {
			const stale = getStaleResponse(entry);
			if (stale) return stale;
			throw new Error(entry.error ?? `${label} usage request failed`);
		}
		const release = await acquireCacheLock(file);
		if (release) {
			try {
				return await refreshUsage(file, entry, [url, label, headers, maxAgeMs]);
			} finally {
				await release();
			}
		}
		const stale = getStaleResponse(entry);
		if (stale) return stale;
		await new Promise(resolve => setTimeout(resolve, LOCK_POLL_MS));
	}
}
