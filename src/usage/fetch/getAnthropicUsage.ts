import { asObject } from "../domain";
import { MissingAuthError } from "../errors";
import type { JsonObject, UsageSnapshot, WindowUsage } from "../types";
import { loadOAuthCredentials, requestUsage } from "./requestUsage";

const USAGE_URL = "https://api.anthropic.com/api/oauth/usage";
/** A real Claude Code release; Anthropic serves the OAuth usage route to Claude Code clients. */
const CLAUDE_CODE_VERSION = "2.1.210";

type Bucket = { utilization: number | null; resetsAt: number | null };

function parseBucket(utilization: unknown, resetsAt: unknown): Bucket | undefined {
	const percent = typeof utilization === "number" && Number.isFinite(utilization) ? utilization : null;
	const resetAt = typeof resetsAt === "string" ? Date.parse(resetsAt) : NaN;
	const reset = Number.isFinite(resetAt) ? resetAt : null;
	return percent === null && reset === null ? undefined : { utilization: percent, resetsAt: reset };
}

function parseLegacyBucket(value: unknown): Bucket | undefined {
	const bucket = asObject(value);
	return bucket && parseBucket(bucket.utilization, bucket.resets_at);
}

function getLimitEntries(data: JsonObject): JsonObject[] {
	return Array.isArray(data.limits) ? data.limits.map(asObject).filter((entry): entry is JsonObject => entry !== undefined) : [];
}

function findLimitBucket(entries: JsonObject[], matches: (entry: JsonObject) => boolean): Bucket | undefined {
	for (const entry of entries) {
		const bucket = matches(entry) ? parseBucket(entry.percent, entry.resets_at) : undefined;
		if (bucket) return bucket;
	}
	return undefined;
}

function getScopedModelName(entry: JsonObject): string | undefined {
	const name = asObject(asObject(entry.scope)?.model)?.display_name;
	return typeof name === "string" ? name : undefined;
}

function formatModelSlug(name: string): string {
	return name.toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-+|-+$/gu, "");
}

/** Find the weekly cap for the selected model's family, such as Opus or Sonnet.
 * Legacy per-family buckets take precedence; newer payloads report them as `weekly_scoped` limits.
 */
function findModelBucket(data: JsonObject, entries: JsonObject[], modelId: string): Bucket | undefined {
	const model = modelId.toLowerCase();
	const legacyBucket = model.includes("opus") ? parseLegacyBucket(data.seven_day_opus)
		: model.includes("sonnet") ? parseLegacyBucket(data.seven_day_sonnet) : undefined;
	return legacyBucket ?? findLimitBucket(entries, entry => {
		const name = entry.kind === "weekly_scoped" ? getScopedModelName(entry) : undefined;
		const slug = name ? formatModelSlug(name) : "";
		return slug !== "" && model.includes(slug);
	});
}

function createWindow(label: string, bucket: Bucket): WindowUsage {
	const { utilization, resetsAt } = bucket;
	return {
		label,
		leftPercent: utilization === null ? null : Math.min(100, Math.max(0, 100 - utilization)),
		resetInSeconds: resetsAt === null ? null : Math.max(0, (resetsAt - Date.now()) / 1000),
	};
}

/** Extra usage lets the subscription continue past exhausted windows; `spend` supersedes `extra_usage`. */
function hasExtraUsage(data: JsonObject): boolean {
	const spend = asObject(data.spend);
	return spend ? spend.enabled === true : asObject(data.extra_usage)?.is_enabled === true;
}

/** Retrieve Claude subscription windows using pi's anthropic OAuth account.
 * Shows the 5-hour session and 7-day account windows, plus the selected model family's weekly cap when reported.
 * @note Reads OAuth credentials and sends an Anthropic usage request without refreshing tokens.
 */
export default async function getAnthropicUsage(modelId: string): Promise<UsageSnapshot> {
	const entry = await loadOAuthCredentials("anthropic");
	const accessToken = typeof entry.access === "string" ? entry.access.trim() : "";
	if (!accessToken) throw new MissingAuthError("anthropic");
	const data = await requestUsage(USAGE_URL, "Claude", {
		accept: "application/json, text/plain, */*",
		authorization: `Bearer ${accessToken}`,
		"anthropic-beta": "oauth-2025-04-20",
		"content-type": "application/json",
		"user-agent": `claude-cli/${CLAUDE_CODE_VERSION} (external, cli)`,
	});
	const entries = getLimitEntries(data);
	const fiveHour = parseLegacyBucket(data.five_hour) ?? findLimitBucket(entries, limit => limit.kind === "session");
	const sevenDay = parseLegacyBucket(data.seven_day) ?? findLimitBucket(entries, limit => limit.kind === "weekly_all");
	const modelWeek = findModelBucket(data, entries, modelId);
	const windows = [
		...(fiveHour ? [createWindow("5h", fiveHour)] : []),
		...(sevenDay ? [createWindow("7d", sevenDay)] : []),
		...(modelWeek ? [createWindow("7d model", modelWeek)] : []),
	];
	return {
		provider: "anthropic",
		label: "Claude",
		windows: windows.length ? windows : [{ label: "7d", leftPercent: null, resetInSeconds: null }],
		isLimited: windows.some(window => window.leftPercent === 0) && !hasExtraUsage(data),
	};
}
