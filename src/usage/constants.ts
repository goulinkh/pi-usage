import type { PercentMode, UsagePlacement } from "./types";

export const DEFAULT_USAGE_MODE: PercentMode = "used";
export const DEFAULT_USAGE_PLACEMENT: UsagePlacement = "footer";
export const SPARK_MODEL_ID = "gpt-5.3-codex-spark";
/** Slightly below the 60-second footer refresh, so each timer tick may refresh the shared cache. */
export const DEFAULT_USAGE_MAX_AGE_MS = 55_000;
/** A refresh lock older than this belongs to a crashed or hung session and may be taken over. */
export const LOCK_TIMEOUT_MS = 20_000;

/** Nerd Font glyphs used by the compact usage footer. */
export const USAGE_ICONS = {
	usage: "\uf200", // nf-fa-pie_chart
	reset: "\u{f051b}", // nf-md-timer_outline
	unlimited: "\u{f06e4}", // nf-md-infinity
} as const;
