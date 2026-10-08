import type { PercentMode } from "./types";

const choices: readonly PercentMode[] = ["left", "used"];

/** Parse an explicit mode or toggle the current value; return null for invalid input. */
export function parseUsageMode(args: string, current: PercentMode): PercentMode | null {
	const token = args.trim().toLowerCase().split(/\s+/, 1)[0] ?? "";
	if (!token || token === "toggle") return current === "left" ? "used" : "left";
	return token === "left" || token === "used" ? token : null;
}

/** Offer mode and toggle arguments matching a normalized prefix. */
export function usageModeCompletions(prefix: string) {
	const normalizedPrefix = prefix.trim().toLowerCase();
	const items = [...choices, "toggle"].map(value => ({
		value,
		label: value,
		description: value === "toggle" ? "Toggle current value" : `Set to ${value}`,
	}));
	const matches = normalizedPrefix ? items.filter(item => item.value.startsWith(normalizedPrefix)) : items;
	return matches.length ? matches : null;
}
