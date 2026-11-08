import { describe, expect, it, vi } from "vitest";
import { anthropicResponse, auth } from "../../../testing/fixtures";
import mockUsageResponse from "../../../testing/mockUsageResponse";
import writeAgentFile from "../../../testing/writeAgentFile";
import { MissingAuthError } from "../errors";
import getAnthropicUsage from "./getAnthropicUsage";

const OPUS = "claude-opus-4-5";
const SONNET = "claude-sonnet-4-5";

async function fetchUsage(data: unknown, modelId = SONNET) {
	await writeAgentFile("auth.json", auth);
	mockUsageResponse(data);
	return getAnthropicUsage(modelId);
}

describe("getAnthropicUsage", () => {
	it("returns session and weekly windows with the selected model family's weekly cap", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2030-01-01T00:00:00Z"));
		await writeAgentFile("auth.json", auth);
		const fetch = mockUsageResponse(anthropicResponse);
		expect(await getAnthropicUsage(OPUS)).toEqual({
			provider: "anthropic", label: "Claude", isLimited: false,
			windows: [
				{ label: "5h", leftPercent: 88, resetInSeconds: 7_200 },
				{ label: "7d", leftPercent: 70, resetInSeconds: 259_200 },
				{ label: "7d model", leftPercent: 45, resetInSeconds: 345_600 },
			],
		});
		expect(fetch).toHaveBeenCalledWith("https://api.anthropic.com/api/oauth/usage", expect.objectContaining({
			headers: expect.objectContaining({
				authorization: "Bearer anthropic-test-token",
				"anthropic-beta": "oauth-2025-04-20",
				"user-agent": expect.stringMatching(/^claude-cli\/\d+\.\d+\.\d+ \(external, cli\)$/),
			}),
		}));
	});

	it("omits a model family cap that the account does not report", async () => {
		expect((await fetchUsage(anthropicResponse, SONNET)).windows.map(window => window.label)).toEqual(["5h", "7d"]);
		expect((await fetchUsage(anthropicResponse, "claude-haiku-4-5")).windows.map(window => window.label)).toEqual(["5h", "7d"]);
	});

	it("falls back to generic limit entries when legacy buckets are null", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2030-01-01T00:00:00Z"));
		const usage = await fetchUsage({
			five_hour: null, seven_day: { utilization: null, resets_at: null }, seven_day_opus: null,
			limits: [
				null,
				{ kind: "session", percent: "invalid", resets_at: "invalid" },
				{ kind: "session", percent: 40, resets_at: "2030-01-01T01:00:00Z" },
				{ kind: "weekly_all", percent: 25 },
				{ kind: "weekly_scoped", percent: 99, scope: { model: { display_name: "Sonnet" } } },
				{ kind: "weekly_scoped", percent: 75, scope: { model: { display_name: "Opus" } } },
			],
		}, OPUS);
		expect(usage.windows).toEqual([
			{ label: "5h", leftPercent: 60, resetInSeconds: 3_600 },
			{ label: "7d", leftPercent: 75, resetInSeconds: null },
			{ label: "7d model", leftPercent: 25, resetInSeconds: null },
		]);
	});

	it.each([[{ display_name: "" }], [{ display_name: "--" }], [{ display_name: 1 }], [undefined]])("ignores scoped limits without a usable model name (%j)", async model => {
		const usage = await fetchUsage({ limits: [{ kind: "weekly_scoped", percent: 10, scope: { model } }] }, OPUS);
		expect(usage.windows).toEqual([{ label: "7d", leftPercent: null, resetInSeconds: null }]);
	});

	it("represents an account without reported windows as unknown", async () => {
		expect(await fetchUsage({ limits: "invalid" })).toEqual({
			provider: "anthropic", label: "Claude", isLimited: false,
			windows: [{ label: "7d", leftPercent: null, resetInSeconds: null }],
		});
	});

	it("clamps utilization and elapsed resets, keeping a reset without utilization as unknown", async () => {
		const usage = await fetchUsage({
			five_hour: { utilization: -5, resets_at: "2000-01-01T00:00:00Z" }, seven_day: { utilization: 130 },
			seven_day_sonnet: { utilization: null, resets_at: "2000-01-01T00:00:00Z" },
		});
		expect(usage.windows).toEqual([
			{ label: "5h", leftPercent: 100, resetInSeconds: 0 },
			{ label: "7d", leftPercent: 0, resetInSeconds: null },
			{ label: "7d model", leftPercent: null, resetInSeconds: 0 },
		]);
	});

	it.each([
		[{}, true],
		[{ extra_usage: { is_enabled: true } }, false],
		[{ spend: { enabled: true }, extra_usage: { is_enabled: false } }, false],
		[{ spend: { enabled: false }, extra_usage: { is_enabled: true } }, true],
	])("marks exhausted windows limited unless extra usage continues the subscription (%j)", async (extra, isLimited) => {
		expect((await fetchUsage({ five_hour: { utilization: 100 }, seven_day: { utilization: 20 }, ...extra })).isLimited).toBe(isLimited);
	});

	it.each([{ type: "api_key", key: "fake-key" }, { type: "oauth" }, { type: "oauth", access: " " }])("rejects missing OAuth access tokens (%j)", async entry => {
		await writeAgentFile("auth.json", { anthropic: entry });
		const fetch = mockUsageResponse({});
		await expect(getAnthropicUsage(SONNET)).rejects.toBeInstanceOf(MissingAuthError);
		expect(fetch).not.toHaveBeenCalled();
	});

	it("reports failed requests without exposing the response", async () => {
		await writeAgentFile("auth.json", auth);
		mockUsageResponse({ error: "secret detail" }, 401);
		await expect(getAnthropicUsage(SONNET)).rejects.toThrow(/^Claude usage request failed \(401\)$/);
	});
});
