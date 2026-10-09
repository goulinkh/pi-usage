import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { USAGE_ICONS } from "./constants";
import type { PercentMode, Theme, UsageSnapshot } from "./types";

function formatPercent(theme: Theme, leftPercent: number | null, mode: PercentMode): string {
	if (leftPercent === null) return theme.fg("muted", "--");

	const color = leftPercent <= 10 ? "error" : leftPercent <= 25 ? "warning" : "success";
	const displayed = mode === "left" ? leftPercent : 100 - leftPercent;
	return theme.fg(color, `${Math.round(displayed)}%`);
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

/** Format bare percentages and reset countdowns with one usage icon, omitting provider/window labels. */
export function formatStatus(ctx: ExtensionContext, usage: UsageSnapshot, usageMode: PercentMode): string {
	const theme = ctx.ui.theme;
	const title = theme.fg(usage.isLimited ? "error" : "dim", USAGE_ICONS.usage);
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
