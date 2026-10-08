import { describe, expect, it, vi } from "vitest";
import { auth, copilotResponse } from "../../../testing/fixtures";
import mockUsageResponse from "../../../testing/mockUsageResponse";
import writeAgentFile from "../../../testing/writeAgentFile";
import { MissingAuthError } from "../errors";
import getCopilotUsage from "./getCopilotUsage";

describe("getCopilotUsage", () => {
	it("returns only the premium quota and its UTC reset date", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2029-12-31T00:00:00Z"));
		await writeAgentFile("auth.json", auth);
		mockUsageResponse(copilotResponse);
		expect(await getCopilotUsage()).toEqual({
			provider: "github-copilot", label: "Copilot", isLimited: false,
			windows: [
				{ label: "premium", leftPercent: 80, resetInSeconds: 86_400, unlimited: false },
			],
		});
	});

	it("ignores chat and completion quotas even when they are exhausted", async () => {
		await writeAgentFile("auth.json", auth);
		mockUsageResponse({ ...copilotResponse, quota_snapshots: {
			...copilotResponse.quota_snapshots,
			chat: { percent_remaining: 0 }, completions: { percent_remaining: 0 },
		} });
		const usage = await getCopilotUsage();
		expect(usage.windows.map(window => window.label)).toEqual(["premium"]);
		expect(usage.isLimited).toBe(false);
	});

	it("preserves unlimited premium quotas without a percentage or reset countdown", async () => {
		await writeAgentFile("auth.json", auth);
		mockUsageResponse({ ...copilotResponse, quota_snapshots: { premium_interactions: { percent_remaining: 0, unlimited: true } } });
		expect(await getCopilotUsage()).toEqual({
			provider: "github-copilot", label: "Copilot", isLimited: false,
			windows: [{ label: "premium", leftPercent: null, resetInSeconds: null, unlimited: true }],
		});
	});

	it.each(["enterprise.example", "https://enterprise.example/path"])("uses pi's enterprise domain (%s)", async enterpriseUrl => {
		await writeAgentFile("auth.json", { "github-copilot": { ...auth["github-copilot"], refresh: " github-test-token ", enterpriseUrl } });
		const fetch = mockUsageResponse(copilotResponse);
		await getCopilotUsage();
		expect(fetch).toHaveBeenCalledWith("https://api.enterprise.example/copilot_internal/user", expect.objectContaining({
			headers: expect.objectContaining({ Authorization: "Bearer github-test-token" }),
		}));
	});

	it.each([{}, { type: "api_key", key: "fake-key" }, { type: "oauth" }, { type: "oauth", refresh: " " }])("rejects missing OAuth GitHub tokens (%j)", async entry => {
		await writeAgentFile("auth.json", { "github-copilot": entry });
		const fetch = mockUsageResponse({});
		await expect(getCopilotUsage()).rejects.toBeInstanceOf(MissingAuthError);
		expect(fetch).not.toHaveBeenCalled();
	});

	it.each([
		[{ remaining: 60, entitlement: 300 }, 20],
		[{ percent_remaining: -5 }, 0],
		[{ percent_remaining: 110 }, 100],
		[{ remaining: -1, entitlement: 300 }, 0],
		[{ remaining: 400, entitlement: 300 }, 100],
		[{ remaining: 1, entitlement: 0 }, null],
		[{ remaining: "1", entitlement: 300 }, null],
		[{ remaining: 1, entitlement: "300" }, null],
		[{}, null],
	])("normalizes bounded percentages without inventing missing values (%j)", async (quota, leftPercent) => {
		await writeAgentFile("auth.json", auth);
		mockUsageResponse({ quota_snapshots: { premium_interactions: quota } });
		expect((await getCopilotUsage()).windows[0].leftPercent).toBe(leftPercent);
	});

	it.each([false, true])("respects overage permission when the premium quota is exhausted (%s)", async overage_permitted => {
		await writeAgentFile("auth.json", auth);
		mockUsageResponse({ quota_snapshots: { premium_interactions: { percent_remaining: 0, overage_permitted } } });
		expect((await getCopilotUsage()).isLimited).toBe(!overage_permitted);
	});

	it.each([undefined, "not-a-date", "2000-01-01"])("handles missing, invalid, and elapsed reset dates (%s)", async quota_reset_date => {
		await writeAgentFile("auth.json", auth);
		mockUsageResponse({ quota_reset_date, quota_snapshots: { premium_interactions: { percent_remaining: 90 } } });
		expect((await getCopilotUsage()).windows[0].resetInSeconds).toBe(quota_reset_date === "2000-01-01" ? 0 : null);
	});

	it("prefers an explicit UTC reset timestamp", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2029-12-31T00:00:00Z"));
		await writeAgentFile("auth.json", auth);
		mockUsageResponse({ quota_reset_date: "invalid", quota_reset_date_utc: "2030-01-01T00:00:00Z" });
		expect((await getCopilotUsage()).windows).toEqual([{ label: "premium", leftPercent: null, resetInSeconds: 86_400, unlimited: false }]);
	});

	it.each([{}, { quota_snapshots: [] }, { quota_snapshots: { premium_interactions: null } }, { quota_snapshots: { chat: { percent_remaining: 90 } } }])("represents missing quota data as unknown (%j)", async data => {
		await writeAgentFile("auth.json", auth);
		mockUsageResponse(data);
		expect((await getCopilotUsage()).windows).toEqual([{ label: "premium", leftPercent: null, resetInSeconds: null, unlimited: false }]);
	});

	it("rejects malformed enterprise domains without sending the token", async () => {
		await writeAgentFile("auth.json", { "github-copilot": { ...auth["github-copilot"], enterpriseUrl: "http://[" } });
		const fetch = mockUsageResponse({});
		await expect(getCopilotUsage()).rejects.toThrow();
		expect(fetch).not.toHaveBeenCalled();
	});
});
