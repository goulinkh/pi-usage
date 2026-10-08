import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import { codexUsage, copilotUsage } from "../../testing/fixtures";
import { formatStatus, unavailableStatus } from "./format";

function createContext() {
	const fg = vi.fn((_color: string, text: string) => text);
	return { ctx: { ui: { theme: { fg } } } as unknown as ExtensionContext, fg };
}

describe("formatStatus", () => {
	it("preserves Codex percentages and window labels with compact provider and reset icons", () => {
		const { ctx } = createContext();
		expect(formatStatus(ctx, codexUsage, "left")).toBe(" 5h:81% left (󰔛2h10m) 7d:64% left (󰔛6d22h)");
		expect(formatStatus(ctx, codexUsage, "used")).toBe(" 5h:19% used (󰔛2h10m) 7d:36% used (󰔛6d22h)");
	});
	it("formats Copilot premium without repeating the provider and quota names", () => {
		const { ctx } = createContext();
		const usage = { ...copilotUsage, windows: [{ label: "premium", leftPercent: 95, resetInSeconds: 2_034_000 }] };
		expect(formatStatus(ctx, usage, "left")).toBe(" 95% left (󰔛23d13h)");
		expect(formatStatus(ctx, usage, "used")).toBe(" 5% used (󰔛23d13h)");
	});
	it("uses an infinity icon for unlimited premium without a fake percentage or countdown", () => {
		const { ctx } = createContext();
		const usage = { ...copilotUsage, windows: [{ label: "premium", leftPercent: null, resetInSeconds: 86_400, unlimited: true }] };
		expect(formatStatus(ctx, usage, "left")).toBe(" 󰛤");
		expect(formatStatus(ctx, usage, "used")).toBe(" 󰛤");
	});
	it("preserves labels for future providers without a configured icon", () => {
		const { ctx } = createContext();
		expect(formatStatus(ctx, { ...codexUsage, label: "Other" }, "left")).toMatch(/^Other 5h:/);
	});
	it.each([[null, "--", "muted"], [5, "5% left", "error"], [20, "20% left", "warning"], [50, "50% left", "success"]])("uses semantic colors for remaining percentage %s", (leftPercent, text, color) => {
		const { ctx, fg } = createContext();
		formatStatus(ctx, { ...codexUsage, windows: [{ label: "7d", leftPercent, resetInSeconds: null }] }, "left");
		expect(fg).toHaveBeenCalledWith(color, text);
	});
	it.each([[null, ""], [NaN, ""], [-10, " (󰔛0s)"], [30, " (󰔛30s)"], [120, " (󰔛2m)"], [3_600, " (󰔛1h0m)"], [86_400, " (󰔛1d0h)"]])("formats countdowns for %s seconds", (resetInSeconds, countdown) => {
		const { ctx } = createContext();
		expect(formatStatus(ctx, { ...codexUsage, windows: [{ label: "7d", leftPercent: 64, resetInSeconds }] }, "left")).toBe(` 7d:64% left${countdown}`);
	});
	it("highlights limited providers and preserves their adapter label", () => {
		const { ctx, fg } = createContext();
		formatStatus(ctx, { ...codexUsage, label: "Codex Spark", isLimited: true }, "left");
		expect(fg).toHaveBeenCalledWith("error", " 󰫢");
	});
});

describe("unavailableStatus", () => {
	it("uses the selected provider label rather than a model ID", () => {
		const { ctx, fg } = createContext();
		expect(unavailableStatus(ctx, "Copilot")).toBe(" unavailable");
		expect(fg).toHaveBeenCalledWith("warning", " unavailable");
	});
});
