/** Provider routing keeps model IDs from being mistaken for authentication provider identities. */
import { SPARK_MODEL_ID } from "./constants";
import getCodexUsage from "./fetch/getCodexUsage";
import getCopilotUsage from "./fetch/getCopilotUsage";
import type { UsageModel, UsageModelProviders, UsageSnapshot } from "./types";

type UsageAdapter = {
	getLabel: (modelId: string) => string;
	fetchUsage: (modelId: string) => Promise<UsageSnapshot>;
};

const providers = new Map<string, UsageAdapter>([
	["openai-codex", { getLabel: id => id === SPARK_MODEL_ID ? "Codex Spark" : "Codex", fetchUsage: getCodexUsage }],
	["github-copilot", { getLabel: () => "Copilot", fetchUsage: getCopilotUsage }],
]);

function getAdapter(model: UsageModel, modelProviders: UsageModelProviders): UsageAdapter | undefined {
	const provider = modelProviders[`${model.provider}/${model.id}`] ?? model.provider;
	return providers.get(provider);
}

/** Return the mapped or selected provider's usage label, or undefined when unsupported. */
export function getUsageLabel(model: UsageModel | undefined, modelProviders: UsageModelProviders = {}): string | undefined {
	return model ? getAdapter(model, modelProviders)?.getLabel(model.id) : undefined;
}

/** Retrieve usage for the mapped or selected provider, or null without I/O when unsupported.
 * @note Supported adapters read pi's authentication file and make an external usage request.
 */
export async function getUsage(model: UsageModel | undefined, modelProviders: UsageModelProviders = {}): Promise<UsageSnapshot | null> {
	return model ? getAdapter(model, modelProviders)?.fetchUsage(model.id) ?? null : null;
}
