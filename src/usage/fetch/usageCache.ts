/** File-backed storage shared by all pi sessions, so concurrent sessions send one usage request per account.
 * Entries hold a provider's raw usage response, never credentials; file names are hashes of the request identity.
 * Storage failures degrade to uncached requests rather than hiding usage.
 */
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { LOCK_TIMEOUT_MS } from "../constants";
import { asObject } from "../domain";
import { USAGE_CACHE_DIR } from "../preferences";
import type { UsageCacheEntry } from "../types";

/** Return the cache file for a request; credentials in headers are hashed into the name, not stored. */
export function getCacheFile(url: string, label: string, headers: Record<string, string>): string {
	const identity = JSON.stringify([url, Object.entries(headers).sort(([a], [b]) => a.localeCompare(b))]);
	const hash = createHash("sha256").update(identity).digest("hex").slice(0, 24);
	return path.join(USAGE_CACHE_DIR, `${label.toLowerCase()}-${hash}.json`);
}

/** Read a cache entry, treating absent or malformed files as empty.
 * @note Reads the shared cache directory.
 */
export async function readCacheEntry(file: string): Promise<UsageCacheEntry> {
	try {
		const entry = asObject(JSON.parse(await fs.readFile(file, "utf8"))) ?? {};
		const number = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : undefined;
		return {
			fetchedAt: number(entry.fetchedAt),
			data: asObject(entry.data),
			retryAt: number(entry.retryAt),
			error: typeof entry.error === "string" ? entry.error : undefined,
		};
	} catch {
		return {};
	}
}

/** Atomically replace a cache entry so readers never observe a partial file.
 * @note Writes owner-only files in the shared cache directory; failures are ignored.
 */
export async function writeCacheEntry(file: string, entry: UsageCacheEntry): Promise<void> {
	const temporaryFile = `${file}.${process.pid}.${Date.now()}.tmp`;
	try {
		await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
		await fs.writeFile(temporaryFile, JSON.stringify(entry), { encoding: "utf8", mode: 0o600 });
		await fs.rename(temporaryFile, file);
	} catch {
		await fs.rm(temporaryFile, { force: true }).catch(() => undefined);
	}
}

async function createLock(lockFile: string): Promise<boolean> {
	try {
		await fs.writeFile(lockFile, String(process.pid), { flag: "wx", mode: 0o600 });
		return true;
	} catch (error) {
		if (asObject(error)?.code !== "EEXIST") throw error;
		return false;
	}
}

/** Take the cross-session refresh lock for a cache file, replacing a lock abandoned by another session.
 * Returns a release function, or undefined while another session is refreshing. When the cache
 * directory cannot be written, returns a no-op release so the caller still requests usage.
 * @note Creates and removes a lock file beside the cache entry.
 */
export async function acquireCacheLock(file: string): Promise<(() => Promise<void>) | undefined> {
	const lockFile = `${file}.lock`;
	const release = () => fs.rm(lockFile, { force: true }).catch(() => undefined);
	try {
		await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
		if (await createLock(lockFile)) return release;
		// A lock that vanished since the creation attempt counts as abandoned: its owner just finished.
		const lockCreatedAt = (await fs.stat(lockFile).catch(() => undefined))?.mtimeMs ?? 0;
		if (Date.now() - lockCreatedAt < LOCK_TIMEOUT_MS) return undefined;
		await fs.rm(lockFile, { force: true });
		return await createLock(lockFile) ? release : undefined;
	} catch {
		return async () => undefined;
	}
}
