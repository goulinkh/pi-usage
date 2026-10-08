import { asObject } from "../domain";
import { MissingAuthError } from "../errors";
import type { JsonObject, UsageSnapshot } from "../types";
import { loadOAuthCredentials, requestUsage } from "./requestUsage";

function getUsageUrl(enterpriseUrl: unknown): string {
	if (typeof enterpriseUrl !== "string" || !enterpriseUrl.trim()) return "https://api.github.com/copilot_internal/user";
	const domain = new URL(enterpriseUrl.includes("://") ? enterpriseUrl : `https://${enterpriseUrl}`).hostname;
	return `https://api.${domain}/copilot_internal/user`;
}

function getResetSeconds(data: JsonObject): number | null {
	const resetDate = data.quota_reset_date_utc ?? data.quota_reset_date;
	if (typeof resetDate !== "string") return null;
	const resetAt = Date.parse(resetDate);
	return Number.isFinite(resetAt) ? Math.max(0, (resetAt - Date.now()) / 1000) : null;
}

function getPercentLeft(quota: JsonObject): number | null {
	if (quota.unlimited === true) return null;
	if (typeof quota.percent_remaining === "number" && Number.isFinite(quota.percent_remaining)) {
		return Math.min(100, Math.max(0, quota.percent_remaining));
	}
	if (typeof quota.remaining === "number" && Number.isFinite(quota.remaining)
		&& typeof quota.entitlement === "number" && Number.isFinite(quota.entitlement) && quota.entitlement > 0) {
		return Math.min(100, Math.max(0, 100 * quota.remaining / quota.entitlement));
	}
	return null;
}

/** Retrieve only the premium request quota for pi's GitHub Copilot account.
 * @note Reads OAuth credentials and sends a GitHub usage request. The OAuth refresh field is
 * the long-lived GitHub token; the access field is an inference token and cannot query quotas.
 */
export default async function getCopilotUsage(): Promise<UsageSnapshot> {
	const entry = await loadOAuthCredentials("github-copilot");
	const githubToken = typeof entry.refresh === "string" ? entry.refresh.trim() : "";
	if (!githubToken) throw new MissingAuthError("github-copilot");
	const data = await requestUsage(getUsageUrl(entry.enterpriseUrl), "Copilot", {
		Accept: "application/json",
		Authorization: `Bearer ${githubToken}`,
		"User-Agent": "GitHubCopilotChat/0.35.0",
		"Editor-Version": "vscode/1.107.0",
		"Editor-Plugin-Version": "copilot-chat/0.35.0",
	});
	const quota = asObject(asObject(data.quota_snapshots)?.premium_interactions) ?? {};
	const leftPercent = getPercentLeft(quota);
	const unlimited = quota.unlimited === true;
	return {
		provider: "github-copilot", label: "Copilot",
		isLimited: leftPercent === 0 && quota.overage_permitted !== true,
		windows: [{ label: "premium", leftPercent, resetInSeconds: unlimited ? null : getResetSeconds(data), unlimited }],
	};
}
