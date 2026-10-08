/** Provider-neutral usage data shared by retrieval, formatting, and lifecycle code. */
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

export type JsonObject = Record<string, unknown>;
export type PercentMode = "left" | "used";
export type UsagePlacement = "footer" | "belowEditor";
export type UsagePreferences = { usageMode: PercentMode; usagePlacement: UsagePlacement };
export type Theme = ExtensionContext["ui"]["theme"];
export type UsageProvider = "openai-codex" | "github-copilot";
export type UsageModel = { provider: string; id: string };

/** A provider-labelled quota; null values mean the API did not supply a usable value. */
export type WindowUsage = {
	label: string;
	leftPercent: number | null;
	resetInSeconds: number | null;
	unlimited?: boolean;
};

/** A normalized account usage snapshot, independent of the active model's display name. */
export type UsageSnapshot = {
	provider: UsageProvider;
	label: string;
	windows: WindowUsage[];
	isLimited: boolean;
};
