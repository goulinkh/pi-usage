/** Synthetic credentials, API payloads, and normalized snapshots shared by usage tests. */
import type { UsageSnapshot } from "../src/usage/types";
export const codexUsage: UsageSnapshot = {
	provider: "openai-codex", label: "Codex", isLimited: false,
	windows: [
		{ label: "5h", leftPercent: 81, resetInSeconds: 7_800 },
		{ label: "7d", leftPercent: 64, resetInSeconds: 597_600 },
	],
};

export const copilotUsage: UsageSnapshot = {
	provider: "github-copilot", label: "Copilot", isLimited: false,
	windows: [
		{ label: "premium", leftPercent: 80, resetInSeconds: 86_400 },
	],
};

export const auth = {
	"openai-codex": { type: "oauth", access: "codex-test-token", accountId: "codex-test-account" },
	"github-copilot": { type: "oauth", access: "short-lived-copilot-token", refresh: "github-test-token" },
};

export const codexResponse = {
	rate_limit: {
		allowed: true,
		primary_window: { used_percent: 19, reset_after_seconds: 7_800 },
		secondary_window: { used_percent: 36, reset_after_seconds: 597_600 },
	},
};

export const sparkLimit = {
	limit_name: "GPT-5.3-Codex-Spark",
	rate_limit: { primary_window: { used_percent: 42, reset_after_seconds: 60 }, limit_reached: true },
};

export const copilotResponse = {
	quota_reset_date: "2030-01-01",
	quota_snapshots: {
		premium_interactions: { entitlement: 300, remaining: 240, percent_remaining: 80, unlimited: false },
		chat: { entitlement: 0, remaining: 0, percent_remaining: 0, unlimited: true },
		completions: { entitlement: 0, remaining: 0, percent_remaining: 0, unlimited: true },
	},
};
