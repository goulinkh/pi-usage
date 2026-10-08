import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { USAGE_ICONS } from "./constants";
import type { PercentMode, Theme, UsageSnapshot } from "./types";

function getProviderIcon(label: string): string {
	if (label === "Copilot") return USAGE_ICONS.copilot;
	if (label === "Codex Spark") return `${USAGE_ICONS.codex} ${USAGE_ICONS.spark}`;
	return label === "Codex" ? USAGE_ICONS.codex : label;
}

function formatPercent(theme: Theme, leftPercent: number | null, mode: PercentMode): string {
	if (leftPercent === null) return theme.fg("muted", "--");

	const color = leftPercent <= 10 ? "error" : leftPercent <= 25 ? "warning" : "success";
	const displayed = mode === "left" ? leftPercent : 100 - leftPercent;
	return theme.fg(color, `${Math.round(displayed)}% ${mode}`);
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

/** Format a normalized snapshot with Nerd Font provider/reset icons and a shared percentage mode. */
export function formatStatus(ctx: ExtensionContext, usage: UsageSnapshot, usageMode: PercentMode): string {
	const theme = ctx.ui.theme;
	const title = theme.fg(usage.isLimited ? "error" : "dim", getProviderIcon(usage.label));
	const usageText = usage.windows.map(window => {
		const reset = window.unlimited ? null : formatCountdown(window.resetInSeconds);
		const resetText = reset ? theme.fg("dim", ` (${USAGE_ICONS.reset}${reset})`) : "";
		const percent = window.unlimited ? theme.fg("success", USAGE_ICONS.unlimited) : formatPercent(theme, window.leftPercent, usageMode);
		const windowLabel = usage.provider === "github-copilot" ? "" : theme.fg("dim", `${window.label}:`);
		return `${windowLabel}${percent}${resetText}`;
	}).join(" ");
	return `${title} ${usageText}`;
}

/** Format a supported provider's transient retrieval failure. */
export function unavailableStatus(ctx: ExtensionContext, label: string): string {
	return ctx.ui.theme.fg("warning", `${getProviderIcon(label)} unavailable`);
}
