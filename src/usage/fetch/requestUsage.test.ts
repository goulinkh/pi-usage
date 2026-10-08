import { describe, expect, it, vi } from "vitest";
import mockUsageResponse from "../../../testing/mockUsageResponse";
import writeAgentFile from "../../../testing/writeAgentFile";
import { MissingAuthError } from "../errors";
import { loadOAuthCredentials, requestUsage } from "./requestUsage";

describe("loadOAuthCredentials", () => {
	it("rejects an absent auth file as missing credentials", async () => {
		await expect(loadOAuthCredentials("github-copilot")).rejects.toBeInstanceOf(MissingAuthError);
	});
	it("preserves malformed auth failures rather than treating them as a logout", async () => {
		await writeAgentFile("auth.json", {});
		const { writeFile } = await import("node:fs/promises");
		await writeFile(`${process.env.PI_CODING_AGENT_DIR}/auth.json`, "invalid json");
		await expect(loadOAuthCredentials("github-copilot")).rejects.toBeInstanceOf(SyntaxError);
	});
});

describe("requestUsage", () => {
	it("bounds network time and returns an object response", async () => {
		const fetch = mockUsageResponse({ quota: 1 });
		expect(await requestUsage("https://example.test/usage", "Copilot", {})).toEqual({ quota: 1 });
		expect(fetch.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
	});
	it.each([null, []])("normalizes non-object payloads (%j)", async data => {
		mockUsageResponse(data);
		expect(await requestUsage("https://example.test/usage", "Codex", {})).toEqual({});
	});
	it("does not expose credentials or response bodies in HTTP errors", async () => {
		mockUsageResponse({ secret: "should-not-be-in-the-error" }, 401);
		await expect(requestUsage("https://example.test/usage", "Copilot", { Authorization: "Bearer fake-secret" })).rejects.toThrow(/^Copilot usage request failed \(401\)$/);
	});
	it("propagates network failures and invalid JSON", async () => {
		vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network unavailable")));
		await expect(requestUsage("https://example.test/usage", "Codex", {})).rejects.toThrow("network unavailable");
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("invalid")));
		await expect(requestUsage("https://example.test/usage", "Codex", {})).rejects.toBeInstanceOf(SyntaxError);
	});
});
