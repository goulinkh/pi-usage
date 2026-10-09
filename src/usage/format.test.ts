import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import { codexUsage, copilotUsage } from "../../testing/fixtures";
import { formatStatus, unavailableStatus } from "./format";

function createContext() {
	const fg = vi.fn((_color: string, text: string) => text);
	return { ctx: { ui: { theme: { fg } } } as unknown as ExtensionContext, fg };
}

describe("formatStatus", () => {
	it("uses a single usage icon without provider names or window labels for Codex", () => {
		const { ctx } = createContext();
		expect(formatStatus(ctx, codexUsage, "left")).toBe(" 81% (󰔛2h10m) 64% (󰔛6d22h)");
		expect(formatStatus(ctx, codexUsage, "used")).toBe(" 19% (󰔛2h10m) 36% (󰔛6d22h)");
	});
	it("formats a single Codex window with the chosen pie chart and countdown", () => {
		const { ctx } = createContext();
		const usage = { ...codexUsage, windows: [{ label: "7d", leftPercent: 73, resetInSeconds: 399_600 }] };
		expect(formatStatus(ctx, usage, "used")).toBe(" 27% (󰔛4d15h)");
	});
	it("uses the same usage icon for Copilot premium without provider or quota names", () => {
		const { ctx } = createContext();
		const usage = { ...copilotUsage, windows: [{ label: "premium", leftPercent: 95, resetInSeconds: 2_034_000 }] };
		expect(formatStatus(ctx, usage, "left")).toBe(" 95% (󰔛23d13h)");
		expect(formatStatus(ctx, usage, "used")).toBe(" 5% (󰔛23d13h)");
	});
	it("uses an infinity icon for unlimited premium without a fake percentage or countdown", () => {
		const { ctx } = createContext();
		const usage = { ...copilotUsage, windows: [{ label: "premium", leftPercent: null, resetInSeconds: 86_400, unlimited: true }] };
		expect(formatStatus(ctx, usage, "left")).toBe(" 󰛤");
		expect(formatStatus(ctx, usage, "used")).toBe(" 󰛤");
	});
	it("does not expose adapter labels for other snapshots", () => {
		const { ctx } = createContext();
		expect(formatStatus(ctx, { ...codexUsage, label: "Other" }, "left")).toBe(" 81% (󰔛2h10m) 64% (󰔛6d22h)");
	});
	it.each([[null, "--", "muted"], [5, "5%", "error"], [20, "20%", "warning"], [50, "50%", "success"]])("uses semantic colors for remaining percentage %s", (leftPercent, text, color) => {
		const { ctx, fg } = createContext();
		formatStatus(ctx, { ...codexUsage, windows: [{ label: "7d", leftPercent, resetInSeconds: null }] }, "left");
		expect(fg).toHaveBeenCalledWith(color, text);
	});
	it.each([
		[null, "--", "muted"], [100, "0%", "success"], [81.4, "19%", "success"],
		[26, "74%", "success"], [25, "75%", "warning"], [11, "89%", "warning"],
		[10, "90%", "error"], [0, "100%", "error"],
	])("formats consumed percentages with depletion-based colors for %s remaining", (leftPercent, text, color) => {
		const { ctx, fg } = createContext();
		expect(formatStatus(ctx, { ...copilotUsage, windows: [{ label: "premium", leftPercent, resetInSeconds: null }] }, "used")).toBe(` ${text}`);
		expect(fg).toHaveBeenCalledWith(color, text);
	});
	it.each([[null, ""], [NaN, ""], [-10, " (󰔛0s)"], [30, " (󰔛30s)"], [120, " (󰔛2m)"], [3_600, " (󰔛1h0m)"], [86_400, " (󰔛1d0h)"]])("formats countdowns for %s seconds", (resetInSeconds, countdown) => {
		const { ctx } = createContext();
		expect(formatStatus(ctx, { ...codexUsage, windows: [{ label: "7d", leftPercent: 64, resetInSeconds }] }, "left")).toBe(` 64%${countdown}`);
	});
	it("highlights limited usage with the same pie chart for Spark", () => {
		const { ctx, fg } = createContext();
		expect(formatStatus(ctx, { ...codexUsage, label: "Codex Spark", isLimited: true }, "left")).toBe(" 81% (󰔛2h10m) 64% (󰔛6d22h)");
		expect(fg).toHaveBeenCalledWith("error", "");
	});
});

describe("unavailableStatus", () => {
	it("uses the usage icon and a warning color for retrieval failures", () => {
		const { ctx, fg } = createContext();
		expect(unavailableStatus(ctx)).toBe(" unavailable");
		expect(fg).toHaveBeenCalledWith("warning", " unavailable");
	});
});
