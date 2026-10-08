import type { PercentMode, UsagePlacement } from "./types";

export const DEFAULT_USAGE_MODE: PercentMode = "left";
export const DEFAULT_USAGE_PLACEMENT: UsagePlacement = "footer";
export const SPARK_MODEL_ID = "gpt-5.3-codex-spark";

/** Nerd Font glyphs used by the compact usage footer. */
export const USAGE_ICONS = {
	codex: "\uf120", // nf-fa-terminal
	copilot: "\uf4b8", // nf-oct-copilot
	spark: "\u{f0ae2}", // nf-md-star_four_points
	reset: "\u{f051b}", // nf-md-timer_outline
	unlimited: "\u{f06e4}", // nf-md-infinity
} as const;
