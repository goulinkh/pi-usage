import { describe, expect, it, vi } from "vitest";
import { auth, codexResponse, codexUsage, sparkLimit } from "../../../testing/fixtures";
import mockUsageResponse from "../../../testing/mockUsageResponse";
import writeAgentFile from "../../../testing/writeAgentFile";
import { MissingAuthError } from "../errors";
import getCodexUsage from "./getCodexUsage";

describe("getCodexUsage", () => {
	it("preserves Codex five-hour and seven-day windows", async () => {
		await writeAgentFile("auth.json", auth);
		mockUsageResponse(codexResponse);
		expect(await getCodexUsage("gpt-5.3-codex")).toEqual(codexUsage);
	});

	it("preserves the single-window seven-day contract and supports account_id", async () => {
		await writeAgentFile("auth.json", { "openai-codex": { type: "oauth", access: " codex-test-token ", account_id: " codex-test-account " } });
		const fetch = mockUsageResponse({ rate_limit: { primary_window: { used_percent: 3, reset_after_seconds: 60 } } });
		expect((await getCodexUsage("gpt-5.3-codex")).windows).toEqual([{ label: "7d", leftPercent: 97, resetInSeconds: 60 }]);
		expect(fetch.mock.calls[0][1].headers).toMatchObject({ authorization: "Bearer codex-test-token", "chatgpt-account-id": "codex-test-account" });
	});

	it.each([[sparkLimit], { spark: sparkLimit }])("selects Spark-specific limits (%j)", async additional_rate_limits => {
		await writeAgentFile("auth.json", auth);
		mockUsageResponse({ ...codexResponse, additional_rate_limits });
		expect(await getCodexUsage("gpt-5.3-codex-spark")).toMatchObject({ label: "Codex Spark", isLimited: true, windows: [{ label: "7d", leftPercent: 58 }] });
	});

	it("skips malformed Spark entries to find the next usable matching limit", async () => {
		await writeAgentFile("auth.json", auth);
		mockUsageResponse({ additional_rate_limits: [{ limit_name: "GPT-5.3-Codex-Spark", rate_limit: null }, sparkLimit] });
		expect((await getCodexUsage("gpt-5.3-codex-spark")).windows[0].leftPercent).toBe(58);
	});

	it.each([{}, { additional_rate_limits: [null, { limit_name: "other" }] }])("does not substitute standard Codex limits when Spark data is missing (%j)", async data => {
		await writeAgentFile("auth.json", auth);
		mockUsageResponse({ ...codexResponse, ...data });
		expect((await getCodexUsage("gpt-5.3-codex-spark")).windows[0].leftPercent).toBeNull();
	});

	it.each([{}, { type: "oauth", access: " " }, { type: "oauth", access: "token", accountId: 1 }])("rejects missing credential fields (%j)", async entry => {
		await writeAgentFile("auth.json", { "openai-codex": entry });
		const fetch = mockUsageResponse({});
		await expect(getCodexUsage("gpt-5.3-codex")).rejects.toBeInstanceOf(MissingAuthError);
		expect(fetch).not.toHaveBeenCalled();
	});

	it.each([[-10, 100], [110, 0], [null, null], ["10", null]])("bounds or rejects used percentages (%s)", async (used_percent, leftPercent) => {
		await writeAgentFile("auth.json", auth);
		mockUsageResponse({ rate_limit: { primary_window: { used_percent } } });
		expect((await getCodexUsage("gpt-5.3-codex")).windows[0].leftPercent).toBe(leftPercent);
	});

	it.each([1, 1_000])("converts epoch reset timestamps with multiplier %s", async multiplier => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2030-01-01T00:00:00Z"));
		await writeAgentFile("auth.json", auth);
		mockUsageResponse({ rate_limit: { primary_window: { reset_at: (Date.now() / 1_000 + 120) * multiplier } } });
		expect((await getCodexUsage("gpt-5.3-codex")).windows[0].resetInSeconds).toBe(120);
	});

	it("clamps negative reset countdowns and marks disallowed accounts limited", async () => {
		await writeAgentFile("auth.json", auth);
		mockUsageResponse({ rate_limit: { allowed: false, primary_window: { reset_after_seconds: -10 } } });
		expect(await getCodexUsage("gpt-5.3-codex")).toMatchObject({ isLimited: true, windows: [{ resetInSeconds: 0 }] });
	});

	it("represents malformed rate-limit data as unknown", async () => {
		await writeAgentFile("auth.json", auth);
		mockUsageResponse({ rate_limit: [] });
		expect((await getCodexUsage("gpt-5.3-codex")).windows).toEqual([{ label: "7d", leftPercent: null, resetInSeconds: null }]);
	});
});
