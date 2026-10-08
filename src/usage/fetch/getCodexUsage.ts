import { SPARK_MODEL_ID } from "../constants";
import { asObject } from "../domain";
import { MissingAuthError } from "../errors";
import type { JsonObject, UsageSnapshot, WindowUsage } from "../types";
import { loadOAuthCredentials, requestUsage } from "./requestUsage";

const USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";
const SPARK_LIMIT_NAME = "GPT-5.3-Codex-Spark";

function selectBucket(data: JsonObject, modelId: string): JsonObject | undefined {
	if (modelId !== SPARK_MODEL_ID) return asObject(data.rate_limit);
	const additionalLimits = Array.isArray(data.additional_rate_limits)
		? data.additional_rate_limits
		: Object.values(asObject(data.additional_rate_limits) ?? {});
	for (const value of additionalLimits) {
		const record = asObject(value);
		if (record?.limit_name === SPARK_LIMIT_NAME) {
			const bucket = asObject(record.rate_limit);
			if (bucket) return bucket;
		}
	}
	return undefined;
}

function getResetSeconds(window: JsonObject | undefined): number | null {
	const resetAfter = window?.reset_after_seconds;
	if (typeof resetAfter === "number" && Number.isFinite(resetAfter)) return Math.max(0, resetAfter);
	const resetAt = window?.reset_at;
	if (typeof resetAt !== "number" || !Number.isFinite(resetAt)) return null;
	const resetAtSeconds = resetAt > 100_000_000_000 ? resetAt / 1000 : resetAt;
	return Math.max(0, resetAtSeconds - Date.now() / 1000);
}

function parseWindow(label: string, value: unknown): WindowUsage {
	const window = asObject(value);
	const used = window?.used_percent;
	return {
		label,
		leftPercent: typeof used === "number" && Number.isFinite(used) ? Math.min(100, Math.max(0, 100 - used)) : null,
		resetInSeconds: getResetSeconds(window),
	};
}

/** Retrieve Codex or Spark rate-limit windows using pi's openai-codex account.
 * @note Reads OAuth credentials and makes an external usage request without refreshing tokens.
 */
export default async function getCodexUsage(modelId: string): Promise<UsageSnapshot> {
	const entry = await loadOAuthCredentials("openai-codex");
	const accessToken = typeof entry.access === "string" ? entry.access.trim() : "";
	const rawAccountId = entry.accountId ?? entry.account_id;
	const accountId = typeof rawAccountId === "string" ? rawAccountId.trim() : "";
	if (!accessToken || !accountId) throw new MissingAuthError("openai-codex");
	const data = await requestUsage(USAGE_URL, "Codex", {
		accept: "*/*", authorization: `Bearer ${accessToken}`, "chatgpt-account-id": accountId,
	});
	const bucket = selectBucket(data, modelId);
	const secondary = asObject(bucket?.secondary_window);
	return {
		provider: "openai-codex",
		label: modelId === SPARK_MODEL_ID ? "Codex Spark" : "Codex",
		windows: [
			...(secondary ? [parseWindow("5h", bucket?.primary_window)] : []),
			parseWindow("7d", secondary ?? bucket?.primary_window),
		],
		isLimited: bucket?.limit_reached === true || bucket?.allowed === false,
	};
}
