import type { PercentMode, UsagePlacement } from "./types";

export const DEFAULT_USAGE_MODE: PercentMode = "used";
export const DEFAULT_USAGE_PLACEMENT: UsagePlacement = "footer";
export const SPARK_MODEL_ID = "gpt-5.3-codex-spark";

/** Nerd Font glyphs used by the compact usage footer. */
export const USAGE_ICONS = {
	usage: "\uf200", // nf-fa-pie_chart
	reset: "\u{f051b}", // nf-md-timer_outline
	unlimited: "\u{f06e4}", // nf-md-infinity
} as const;
