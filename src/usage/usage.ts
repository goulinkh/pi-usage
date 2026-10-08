/** Provider routing keeps model IDs from being mistaken for authentication provider identities. */
import { SPARK_MODEL_ID } from "./constants";
import getCodexUsage from "./fetch/getCodexUsage";
import getCopilotUsage from "./fetch/getCopilotUsage";
import type { UsageModel, UsageSnapshot } from "./types";

type UsageAdapter = {
	getLabel: (modelId: string) => string;
	fetchUsage: (modelId: string) => Promise<UsageSnapshot>;
};

const providers = new Map<string, UsageAdapter>([
	["openai-codex", { getLabel: id => id === SPARK_MODEL_ID ? "Codex Spark" : "Codex", fetchUsage: getCodexUsage }],
	["github-copilot", { getLabel: () => "Copilot", fetchUsage: getCopilotUsage }],
]);

/** Return a supported model's usage label, or undefined for an unsupported provider. */
export function getUsageLabel(model: UsageModel | undefined): string | undefined {
	return model ? providers.get(model.provider)?.getLabel(model.id) : undefined;
}

/** Retrieve usage for the selected provider, or null without I/O when unsupported.
 * @note Supported adapters read pi's authentication file and make an external usage request.
 */
export async function getUsage(model: UsageModel | undefined): Promise<UsageSnapshot | null> {
	return model ? providers.get(model.provider)?.fetchUsage(model.id) ?? null : null;
}
