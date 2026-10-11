import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { USAGE_ICONS } from "./constants";
import type { PercentMode, Theme, UsageSnapshot } from "./types";

function getRemainingColor(leftPercent: number | null) {
	if (leftPercent === null) return "muted";
	return leftPercent <= 10 ? "error" : leftPercent <= 25 ? "warning" : "success";
}

function formatPercent(theme: Theme, leftPercent: number | null, mode: PercentMode): string {
	const text = leftPercent === null ? "--" : `${Math.round(mode === "left" ? leftPercent : 100 - leftPercent)}%`;
	return theme.fg(getRemainingColor(leftPercent), text);
}

function formatCountdown(seconds: number | null): string | null {
	if (seconds === null || Number.isNaN(seconds)) return null;

	const total = Math.max(0, Math.round(seconds));
	const days = Math.floor(total / 86_400);
	const hours = Math.floor((total % 86_400) / 3_600);
	const minutes = Math.floor((total % 3_600) / 60);

	if (days) return `${days}d${hours}h`;
	if (hours) return `${hours}h${minutes}m`;
	return minutes ? `${minutes}m` : `${total % 60}s`;
}

/** Format percentages and countdowns; colors always reflect remaining quota, regardless of mode.
 * The shared icon reflects the lowest known quota (unlimited counts as full), or red when limited.
 */
export function formatStatus(ctx: ExtensionContext, usage: UsageSnapshot, usageMode: PercentMode): string {
	const theme = ctx.ui.theme;
	const remainingPercentages = usage.windows
		.map(window => window.unlimited ? 100 : window.leftPercent)
		.filter((percent): percent is number => percent !== null);
	const lowestRemaining = remainingPercentages.length ? Math.min(...remainingPercentages) : null;
	const title = theme.fg(usage.isLimited ? "error" : getRemainingColor(lowestRemaining), USAGE_ICONS.usage);
	const usageText = usage.windows.map(window => {
		const reset = window.unlimited ? null : formatCountdown(window.resetInSeconds);
		const resetText = reset ? theme.fg("dim", ` (${USAGE_ICONS.reset}${reset})`) : "";
		const percent = window.unlimited ? theme.fg("success", USAGE_ICONS.unlimited) : formatPercent(theme, window.leftPercent, usageMode);
		return `${percent}${resetText}`;
	}).join(" ");
	return `${title} ${usageText}`;
}

/** Format a transient retrieval failure with the shared usage icon. */
export function unavailableStatus(ctx: ExtensionContext): string {
	return ctx.ui.theme.fg("warning", `${USAGE_ICONS.usage} unavailable`);
}
