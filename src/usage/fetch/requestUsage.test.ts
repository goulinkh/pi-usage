import { mkdir, readdir, readFile, utimes, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import createDeferred from "../../../testing/createDeferred";
import mockUsageResponse from "../../../testing/mockUsageResponse";
import writeAgentFile from "../../../testing/writeAgentFile";
import { MissingAuthError } from "../errors";
import { USAGE_CACHE_DIR } from "../preferences";
import { loadOAuthCredentials, requestUsage } from "./requestUsage";
import { getCacheFile } from "./usageCache";

const URL = "https://example.test/usage";
const HEADERS = { Authorization: "Bearer fake-secret" };

function mockSequence(...responses: (() => Response | Promise<Response>)[]) {
	const fetch = vi.fn();
	for (const response of responses) fetch.mockImplementationOnce(async () => response());
	vi.stubGlobal("fetch", fetch);
	return fetch;
}

const json = (data: unknown, status = 200, headers: Record<string, string> = {}) => () => new Response(JSON.stringify(data), { status, headers });

describe("loadOAuthCredentials", () => {
	it("rejects an absent auth file as missing credentials", async () => {
		await expect(loadOAuthCredentials("github-copilot")).rejects.toBeInstanceOf(MissingAuthError);
	});
	it("preserves malformed auth failures rather than treating them as a logout", async () => {
		await writeAgentFile("auth.json", {});
		await writeFile(`${process.env.PI_CODING_AGENT_DIR}/auth.json`, "invalid json");
		await expect(loadOAuthCredentials("github-copilot")).rejects.toBeInstanceOf(SyntaxError);
	});
});

describe("requestUsage", () => {
	describe("upstream requests", () => {
		it("bounds network time and returns an object response with its retrieval time", async () => {
			vi.useFakeTimers({ toFake: ["Date"] });
			vi.setSystemTime(1_000_000);
			const fetch = mockUsageResponse({ quota: 1 });
			expect(await requestUsage(URL, "Copilot", {})).toEqual({ data: { quota: 1 }, fetchedAt: 1_000_000 });
			expect(fetch.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
		});
		it("normalizes non-object payloads", async () => {
			mockUsageResponse(null);
			expect((await requestUsage(URL, "Codex", {})).data).toEqual({});
		});
		it("does not expose credentials or response bodies in HTTP errors", async () => {
			mockUsageResponse({ secret: "should-not-be-in-the-error" }, 401);
			await expect(requestUsage(URL, "Copilot", HEADERS)).rejects.toThrow(/^Copilot usage request failed \(401\)$/);
		});
		it("propagates network failures and invalid JSON", async () => {
			vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network unavailable")));
			await expect(requestUsage(`${URL}/a`, "Codex", {})).rejects.toThrow("network unavailable");
			vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("invalid")));
			await expect(requestUsage(`${URL}/b`, "Codex", {})).rejects.toBeInstanceOf(SyntaxError);
		});
	});

	describe("shared cache", () => {
		it("reuses a response until it is older than the freshness window", async () => {
			vi.useFakeTimers({ toFake: ["Date"] });
			const fetch = mockSequence(json({ n: 1 }), json({ n: 2 }));
			expect((await requestUsage(URL, "Claude", HEADERS, 60_000)).data).toEqual({ n: 1 });
			vi.setSystemTime(Date.now() + 59_999);
			expect((await requestUsage(URL, "Claude", HEADERS, 60_000)).data).toEqual({ n: 1 });
			vi.setSystemTime(Date.now() + 1);
			expect((await requestUsage(URL, "Claude", HEADERS, 60_000)).data).toEqual({ n: 2 });
			expect(fetch).toHaveBeenCalledTimes(2);
		});

		it("sends one request for concurrent sessions and shares its result", async () => {
			const pending = createDeferred<Response>();
			const fetch = vi.fn().mockImplementation(() => pending.promise);
			vi.stubGlobal("fetch", fetch);
			const sessions = [requestUsage(URL, "Claude", HEADERS), requestUsage(URL, "Claude", HEADERS), requestUsage(URL, "Claude", HEADERS)];
			await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
			pending.resolve(new Response(JSON.stringify({ shared: true })));
			expect((await Promise.all(sessions)).map(response => response.data)).toEqual([{ shared: true }, { shared: true }, { shared: true }]);
			expect(fetch).toHaveBeenCalledTimes(1);
		});

		it("keeps accounts separate and stores responses without credentials", async () => {
			const fetch = mockSequence(json({ account: "a" }), json({ account: "b" }));
			expect((await requestUsage(URL, "Claude", { Authorization: "Bearer token-a" })).data).toEqual({ account: "a" });
			expect((await requestUsage(URL, "Claude", { Authorization: "Bearer token-b" })).data).toEqual({ account: "b" });
			expect(fetch).toHaveBeenCalledTimes(2);
			const files = await readdir(USAGE_CACHE_DIR);
			expect(files).toHaveLength(2);
			const contents = await Promise.all(files.map(file => readFile(path.join(USAGE_CACHE_DIR, file), "utf8")));
			for (const content of contents) expect(content).not.toMatch(/token-/);
		});

		it("honors Retry-After on rate limits while showing recent data to every session", async () => {
			vi.useFakeTimers({ toFake: ["Date"] });
			const fetch = mockSequence(json({ n: 1 }), json({}, 429, { "retry-after": "215" }), json({ n: 2 }));
			await requestUsage(URL, "Claude", HEADERS, 60_000);
			vi.setSystemTime(Date.now() + 60_000);
			expect((await requestUsage(URL, "Claude", HEADERS, 60_000)).data).toEqual({ n: 1 });
			vi.setSystemTime(Date.now() + 214_000);
			expect((await requestUsage(URL, "Claude", HEADERS, 60_000)).data).toEqual({ n: 1 });
			expect(fetch).toHaveBeenCalledTimes(2);
			vi.setSystemTime(Date.now() + 1_000);
			expect((await requestUsage(URL, "Claude", HEADERS, 60_000)).data).toEqual({ n: 2 });
		});

		it.each([
			[new Date(Date.UTC(2030, 0, 1, 0, 2)).toUTCString(), 120_000],
			["invalid", 60_000],
			["", 60_000],
			[null, 60_000],
			["999999", 3_600_000],
		])("bounds the rate-limit back-off from Retry-After %j", async (retryAfter, backoffMs) => {
			vi.useFakeTimers({ toFake: ["Date"] });
			vi.setSystemTime(new Date("2030-01-01T00:00:00Z"));
			const fetch = mockSequence(json({}, 429, retryAfter === null ? {} : { "retry-after": retryAfter }), json({ n: 1 }));
			await expect(requestUsage(URL, "Claude", HEADERS, 60_000)).rejects.toThrow("Claude usage request failed (429)");
			vi.setSystemTime(Date.now() + backoffMs - 1);
			await expect(requestUsage(URL, "Claude", HEADERS, 60_000)).rejects.toThrow("Claude usage request failed (429)");
			vi.setSystemTime(Date.now() + 1);
			expect((await requestUsage(URL, "Claude", HEADERS, 60_000)).data).toEqual({ n: 1 });
			expect(fetch).toHaveBeenCalledTimes(2);
		});

		it("backs off briefly after other failures and stops substituting data older than 30 minutes", async () => {
			vi.useFakeTimers({ toFake: ["Date"] });
			const fetch = mockSequence(json({ n: 1 }), json({}, 503), json({}, 503));
			await requestUsage(URL, "Codex", HEADERS);
			vi.setSystemTime(Date.now() + 60_000);
			expect((await requestUsage(URL, "Codex", HEADERS)).data).toEqual({ n: 1 });
			vi.setSystemTime(Date.now() + 29_999);
			expect((await requestUsage(URL, "Codex", HEADERS)).data).toEqual({ n: 1 });
			expect(fetch).toHaveBeenCalledTimes(2);
			vi.setSystemTime(Date.now() + 30 * 60_000);
			await expect(requestUsage(URL, "Codex", HEADERS)).rejects.toThrow("Codex usage request failed (503)");
			await expect(requestUsage(URL, "Codex", HEADERS)).rejects.toThrow("Codex usage request failed (503)");
			expect(fetch).toHaveBeenCalledTimes(3);
		});

		it("waits for another session's refresh instead of requesting the same usage", async () => {
			const file = getCacheFile(URL, "Claude", HEADERS);
			await mkdir(USAGE_CACHE_DIR, { recursive: true });
			await writeFile(`${file}.lock`, "other session");
			const fetch = mockUsageResponse({ own: true });
			const waiting = requestUsage(URL, "Claude", HEADERS);
			await new Promise(resolve => setTimeout(resolve, 300));
			await writeFile(file, JSON.stringify({ fetchedAt: Date.now(), data: { other: true } }));
			expect((await waiting).data).toEqual({ other: true });
			expect(fetch).not.toHaveBeenCalled();
		});

		it("reuses recent data while another session refreshes", async () => {
			vi.useFakeTimers({ toFake: ["Date"] });
			const file = getCacheFile(URL, "Claude", HEADERS);
			await mkdir(USAGE_CACHE_DIR, { recursive: true });
			await writeFile(file, JSON.stringify({ fetchedAt: Date.now() - 120_000, data: { recent: true } }));
			await writeFile(`${file}.lock`, "other session");
			const fetch = mockUsageResponse({});
			expect((await requestUsage(URL, "Claude", HEADERS)).data).toEqual({ recent: true });
			expect(fetch).not.toHaveBeenCalled();
		});

		it("takes over a lock abandoned by a crashed session", async () => {
			const file = getCacheFile(URL, "Claude", HEADERS);
			await mkdir(USAGE_CACHE_DIR, { recursive: true });
			await writeFile(`${file}.lock`, "crashed session");
			const abandoned = new Date(Date.now() - 21_000);
			await utimes(`${file}.lock`, abandoned, abandoned);
			mockUsageResponse({ own: true });
			expect((await requestUsage(URL, "Claude", HEADERS)).data).toEqual({ own: true });
			await expect(readFile(`${file}.lock`)).rejects.toThrow();
		});

		it("ignores malformed cache files", async () => {
			const file = getCacheFile(URL, "Claude", HEADERS);
			await mkdir(USAGE_CACHE_DIR, { recursive: true });
			await writeFile(file, JSON.stringify({ fetchedAt: "now", data: [], retryAt: "later", error: 1 }));
			mockUsageResponse({ own: true });
			expect((await requestUsage(URL, "Claude", HEADERS)).data).toEqual({ own: true });
			await writeFile(file, "invalid");
			vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 500 })));
			await expect(requestUsage(URL, "Claude", HEADERS)).rejects.toThrow("Claude usage request failed (500)");
			await writeFile(file, JSON.stringify({ retryAt: Date.now() + 60_000 }));
			await expect(requestUsage(URL, "Claude", HEADERS)).rejects.toThrow("Claude usage request failed");
		});

		it("still requests usage when the cache directory cannot be written", async () => {
			await writeAgentFile("cache", "not a directory");
			const fetch = mockSequence(json({ n: 1 }), json({ n: 2 }));
			expect((await requestUsage(URL, "Claude", HEADERS)).data).toEqual({ n: 1 });
			expect((await requestUsage(URL, "Claude", HEADERS)).data).toEqual({ n: 2 });
			expect(fetch).toHaveBeenCalledTimes(2);
		});
	});
});
